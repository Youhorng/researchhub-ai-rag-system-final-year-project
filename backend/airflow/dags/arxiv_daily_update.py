import json
import logging
import os
import uuid
from datetime import datetime, timedelta

import arxiv
from airflow.decorators import dag, task
from sqlalchemy import create_engine, text
from opensearchpy import OpenSearch
import httpx

# Configure the logging
logger = logging.getLogger(__name__)

# Environment variables (since we can't import src.config securely in Airflow 2.10)
POSTGRES_USER = os.environ.get("POSTGRES_USER", "rag_user")
POSTGRES_PASSWORD = os.environ.get("POSTGRES_PASSWORD", "rag_password")
POSTGRES_HOST = os.environ.get("POSTGRES_HOST", "postgres")
POSTGRES_PORT = os.environ.get("POSTGRES_PORT", "5432")
POSTGRES_DB = os.environ.get("POSTGRES_DB", "rag_db")

OPENSEARCH_HOST = os.environ.get("OPENSEARCH__HOST", "http://opensearch:9200")
OPENSEARCH_USER = os.environ.get("OPENSEARCH_USER", "admin")
OPENSEARCH_PASSWORD = os.environ.get("OPENSEARCH_PASSWORD", "admin")
OPENSEARCH_INDEX_NAME = os.environ.get("OPENSEARCH__INDEX_NAME", "arxiv-papers")

JINA_API_KEY = os.environ.get("JINA_API_KEY", "")
JINA_EMBEDDING_MODEL = "jina-embeddings-v3"
JINA_EMBEDDING_DIMENSIONS = 1024

DATABASE_URL = f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

def get_opensearch_client():
    return OpenSearch(
        hosts=[OPENSEARCH_HOST],
        http_auth=(OPENSEARCH_USER, OPENSEARCH_PASSWORD),
        use_ssl=False,
        verify_certs=False,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
    )

def get_embeddings(texts: list[str]) -> list[list[float]]:
    if not JINA_API_KEY:
        logger.error("JINA_API_KEY is not set!")
        return [[0.0] * JINA_EMBEDDING_DIMENSIONS for _ in texts]

    headers = {
        "Authorization": f"Bearer {JINA_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": JINA_EMBEDDING_MODEL,
        "normalized": True,
        "embedding_type": "float",
        "input": texts,
    }
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post("https://api.jina.ai/v1/embeddings", json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return [item["embedding"] for item in data.get("data", [])]
    except httpx.HTTPError as e:
        logger.error(f"Jina API Error: {e}")
        return [[0.0] * JINA_EMBEDDING_DIMENSIONS for _ in texts]


def is_relevant_category(categories: list[str]) -> bool:
    """Check if the paper belongs to CS or ML categories."""
    for c in categories:
        if c.startswith("cs.") or c == "stat.ML":
            return True
    return False


@dag(
    dag_id="arxiv_daily_update",
    start_date=datetime(2024, 1, 1),
    schedule="@daily", # Run natively every midnight
    catchup=False,
    tags=["arxiv", "daily"],
)
def arxiv_daily_update_dag():
    
    @task
    def fetch_and_index_new_papers():
        logger.info("Starting daily ArXiv fetch...")
        engine = create_engine(DATABASE_URL)
        os_client = get_opensearch_client()
        
        try:
            with engine.connect() as db_conn:
                # Query arXiv for papers added/updated in "Computer Science"
                # Sort by submission date, descending. We'll just grab the 100 most recent
                # each day for this MVP to avoid rate limits.
                search = arxiv.Search(
                    query="cat:cs.* OR cat:stat.ML",
                    max_results=100, 
                    sort_by=arxiv.SortCriterion.SubmittedDate,
                    sort_order=arxiv.SortOrder.Descending
                )
                
                client = arxiv.Client(
                    page_size=100,
                    delay_seconds=3.0,
                    num_retries=3
                )
                
                papers_data = []
                texts_to_embed = []
                
                # 1. Fetch from ArXiv API
                for result in client.results(search):
                    arxiv_id = result.get_short_id()
                    title = result.title.replace("\n", " ").strip()
                    abstract = result.summary.replace("\n", " ").strip()
                    authors = [author.name for author in result.authors]
                    categories = result.categories
                    
                    # Double check relevance
                    if not is_relevant_category(categories):
                        continue
                        
                    # Skip if we already have it in the DB (deduplication)
                    check_sql = text("SELECT id FROM papers WHERE arxiv_id = :arxiv_id")
                    existing = db_conn.execute(check_sql, {"arxiv_id": arxiv_id}).fetchone()
                    if existing:
                        continue
                        
                    papers_data.append({
                        "arxiv_id": arxiv_id,
                        "title": title,
                        "abstract": abstract,
                        "authors": authors,
                        "categories": categories,
                        "published_at": result.published.date(),
                        "pdf_url": result.pdf_url
                    })
                    
                    texts_to_embed.append(f"{title}. {abstract}")
                    
                if not papers_data:
                    logger.info("No new relevant papers found today.")
                    return
                    
                logger.info(f"Found {len(papers_data)} new papers. Processing embeddings...")
                
                # 2. Get embeddings
                embeddings = get_embeddings(texts_to_embed)
                os_bulk_data = ""
                
                # 3. Save to Postgres
                with db_conn.begin():
                    for data, vector in zip(papers_data, embeddings):
                        insert_sql = text('''
                            INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_at, pdf_url, metadata_indexed, metadata_indexed_at, chunks_indexed)
                            VALUES (:id, :arxiv_id, :title, :authors, :abstract, :categories, :published_at, :pdf_url, true, :indexed_at, false)
                        ''')
                        db_conn.execute(insert_sql, {
                            "id": str(uuid.uuid4()),
                            "arxiv_id": data["arxiv_id"],
                            "title": data["title"],
                            "authors": data["authors"],
                            "abstract": data["abstract"],
                            "categories": data["categories"],
                            "published_at": data["published_at"],
                            "pdf_url": data["pdf_url"],
                            "indexed_at": datetime.utcnow()
                        })

                        # 4. Prepare OpenSearch bulk data
                        action = {
                            "index": {
                                "_index": OPENSEARCH_INDEX_NAME,
                                "_id": data["arxiv_id"]
                            }
                        }
                        document = {
                            "arxiv_id": data["arxiv_id"],
                            "title": data["title"],
                            "abstract": data["abstract"],
                            "categories": data["categories"],
                            "published_at": data["published_at"].isoformat() if data["published_at"] else None,
                            "abstract_vector": vector
                        }
                        os_bulk_data += json.dumps(action) + "\n" + json.dumps(document) + "\n"
                
                # 5. Push to OpenSearch
                if os_bulk_data:
                    os_client.bulk(body=os_bulk_data)
                    
                logger.info(f"Successfully processed {len(papers_data)} new papers.")
            
        except Exception as e:
            logger.error(f"Error in daily update: {e}")
            raise


    # Instantiate the DAG
    update_task = fetch_and_index_new_papers()

arxiv_daily_update_dag()
