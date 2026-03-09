import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any

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

# Path to the dataset inside the Docker container
DATASET_PATH = "/opt/airflow/data/arxiv-metadata-oai-snapshot.json"
BATCH_SIZE = 100


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


def is_relevant_category(categories_str: str) -> bool:
    """Check if the paper belongs to CS or ML categories."""
    cats = categories_str.split(" ")
    for c in cats:
        if c.startswith("cs.") or c == "stat.ML":
            return True
    return False


@dag(
    dag_id="arxiv_bulk_load",
    start_date=datetime(2024, 1, 1),
    schedule=None,  # Run manually only
    catchup=False,
    tags=["arxiv", "setup"],
)
def arxiv_bulk_load_dag():
    
    @task
    def process_dataset():
        logger.info(f"Starting bulk load from {DATASET_PATH}")
        engine = create_engine(DATABASE_URL)
        os_client = get_opensearch_client()
        
        batch_papers = []
        batch_texts = []
        total_processed = 0
        
        try:
            with engine.connect() as db_conn:
                with open(DATASET_PATH, "r") as f:
                    for line in f:
                        paper_data = json.loads(line)
                        
                        if not is_relevant_category(paper_data.get("categories", "")):
                            continue
                            
                        # Extract the fields we need
                        arxiv_id = paper_data.get("id")
                        title = paper_data.get("title", "").replace("\n", " ").strip()
                        abstract = paper_data.get("abstract", "").replace("\n", " ").strip()
                        authors_str = paper_data.get("authors", "")
                        
                        # Parse the update_date ("2008-11-26") into a date object
                        update_date_str = paper_data.get("update_date", "")
                        published_at = None
                        if update_date_str:
                            try:
                                published_at = datetime.strptime(update_date_str, "%Y-%m-%d").date()
                            except ValueError:
                                pass
                                
                        # Generate the direct PDF URL from the ArXiv ID
                        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}" if arxiv_id else None
                        
                        # Store data for batch processing
                        batch_papers.append({
                            "arxiv_id": arxiv_id,
                            "title": title,
                            "abstract": abstract,
                            "authors": [a.strip() for a in authors_str.split(",")],
                            "categories": paper_data.get("categories", "").split(" "),
                            "published_at": published_at,
                            "pdf_url": pdf_url
                        })
                        
                        # Combine title and abstract for the embedding
                        batch_texts.append(f"{title}. {abstract}")
                        
                        # Process when batch is full
                        if len(batch_papers) >= BATCH_SIZE:
                            _process_batch(db_conn, os_client, batch_papers, batch_texts)
                            total_processed += len(batch_papers)
                            logger.info(f"Processed {total_processed} relevant papers so far...")
                            batch_papers = []
                            batch_texts = []
                            
                            # LIMIT for testing purposes: Remove this block to run the full dataset
                            if total_processed >= 500:
                                logger.info("Reached test limit of 500 papers. Stopping.")
                                break
                                
                # Process any remaining papers in the final batch
                if batch_papers:
                    _process_batch(db_conn, os_client, batch_papers, batch_texts)
                    total_processed += len(batch_papers)
                    
            logger.info(f"Bulk load complete! Total inserted: {total_processed}")
            
        except FileNotFoundError:
            logger.error(f"Dataset not found at {DATASET_PATH}. Did you mount the volume correctly?")
            raise


    def _process_batch(db_conn, os_client, papers_data: list[dict], texts: list[str]):
        """Helper to process a chunk of papers: Embed -> Postgres -> OpenSearch"""
        # 1. Get Embeddings
        embeddings = get_embeddings(texts)
        
        # Prepare data for OpenSearch bulk API
        os_bulk_data = ""
        
        with db_conn.begin():
            for data, vector in zip(papers_data, embeddings):
                # 2. Save to Postgres using raw SQL to bypass SQLAlchemy 2.0 ORM incompatibility
                check_sql = text("SELECT id, metadata_indexed FROM papers WHERE arxiv_id = :arxiv_id")
                existing = db_conn.execute(check_sql, {"arxiv_id": data["arxiv_id"]}).fetchone()

                if not existing:
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
                elif not existing.metadata_indexed:
                    update_sql = text('''
                        UPDATE papers SET metadata_indexed = true, metadata_indexed_at = :indexed_at
                        WHERE arxiv_id = :arxiv_id
                    ''')
                    db_conn.execute(update_sql, {
                        "arxiv_id": data["arxiv_id"],
                        "indexed_at": datetime.utcnow()
                    })

                # 3. Format strictly for OpenSearch Bulk Indexing
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
        
        # 4. Push to OpenSearch in one bulk HTTP request
        if os_bulk_data:
            os_client.bulk(body=os_bulk_data)

    # Instantiate the DAG
    bulk_load = process_dataset()

    
arxiv_bulk_load_dag()