import json
import logging
import os
import time
import uuid
from datetime import datetime

import httpx
from airflow.decorators import dag, task
from opensearchpy import OpenSearch
from sqlalchemy import create_engine, text

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

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS = 1024

DATABASE_URL = f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# Path to the dataset inside the Docker container
DATASET_PATH = "/opt/airflow/data/arxiv-metadata-oai-snapshot.json"
BATCH_SIZE = 100

# Only index papers from these specific CS/ML categories
TARGET_CATEGORIES = [
    "cs.AI", "cs.CL", "cs.CV", "cs.CY", "cs.DB",
    "cs.DS", "cs.HC", "cs.IR", "cs.IT", "cs.LG",
    "cs.MA", "cs.NE", "cs.RO", "cs.SE", "cs.SI",
    "stat.ML",
]

# Only index papers updated within these years (inclusive)
TARGET_YEARS = range(2010, 2027)


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
    if not OPENAI_API_KEY:
        logger.error("OPENAI_API_KEY is not set!")
        return [[0.0] * OPENAI_EMBEDDING_DIMENSIONS for _ in texts]

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": OPENAI_EMBEDDING_MODEL,
        "input": texts,
        "dimensions": OPENAI_EMBEDDING_DIMENSIONS,
    }
    max_retries = 5
    with httpx.Client(timeout=30.0) as client:
        for attempt in range(max_retries):
            try:
                response = client.post("https://api.openai.com/v1/embeddings", json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                return [item["embedding"] for item in data.get("data", [])]
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait = 2 ** attempt * 10  # 10s, 20s, 40s, 80s, 160s
                    logger.warning(f"Rate limited (429). Retrying in {wait}s... (attempt {attempt + 1}/{max_retries})")
                    time.sleep(wait)
                else:
                    logger.error(f"OpenAI API Error: {e}")
                    raise
            except httpx.HTTPError as e:
                logger.error(f"OpenAI API Error: {e}")
                raise
    raise RuntimeError(f"OpenAI API: failed after {max_retries} retries (rate limited)")


def is_relevant_category(categories_str: str) -> bool:
    """Check if the paper belongs to one of our target categories."""
    cats = categories_str.split(" ")
    return any(c in TARGET_CATEGORIES for c in cats)


@dag(
    dag_id="arxiv_bulk_load",
    start_date=datetime(2024, 1, 1),
    schedule=None,  # Run manually only
    catchup=False,
    tags=["arxiv", "setup"],
)
def arxiv_bulk_load_dag():

    @task
    def prepare_papers() -> int:
        """Read dataset and save all matching papers to Postgres (no embeddings yet)."""
        logger.info(f"Starting bulk load from {DATASET_PATH}")
        engine = create_engine(DATABASE_URL)
        total_processed = 0

        try:
            with engine.connect() as db_conn:
                with open(DATASET_PATH, "r") as f:
                    batch_papers: list[dict] = []

                    for line in f:
                        paper_data = json.loads(line)

                        if not is_relevant_category(paper_data.get("categories", "")):
                            continue

                        # Filter by year range
                        update_date_str = paper_data.get("update_date", "")
                        if update_date_str:
                            try:
                                year = int(update_date_str[:4])
                                if year not in TARGET_YEARS:
                                    continue
                            except ValueError:
                                continue
                        else:
                            continue

                        # Extract fields
                        arxiv_id = paper_data.get("id")
                        title = paper_data.get("title", "").replace("\n", " ").strip()
                        abstract = paper_data.get("abstract", "").replace("\n", " ").strip()
                        authors_str = paper_data.get("authors", "")

                        try:
                            published_at = datetime.strptime(update_date_str, "%Y-%m-%d").date()
                        except ValueError:
                            published_at = None

                        pdf_url = f"https://arxiv.org/pdf/{arxiv_id}" if arxiv_id else None

                        batch_papers.append({
                            "arxiv_id": arxiv_id,
                            "title": title,
                            "abstract": abstract,
                            "authors": [a.strip() for a in authors_str.split(",")],
                            "categories": paper_data.get("categories", "").split(" "),
                            "published_at": published_at,
                            "pdf_url": pdf_url,
                        })

                        # Flush to Postgres in batches of 100
                        if len(batch_papers) >= BATCH_SIZE:
                            _save_papers_to_postgres(db_conn, batch_papers)
                            total_processed += len(batch_papers)
                            if total_processed % 10_000 == 0:
                                logger.info(f"Saved {total_processed} papers to Postgres...")
                            batch_papers = []

                    # Flush remaining papers
                    if batch_papers:
                        _save_papers_to_postgres(db_conn, batch_papers)
                        total_processed += len(batch_papers)

            logger.info(f"Prepare complete: {total_processed} papers saved to Postgres")
            return total_processed

        except FileNotFoundError:
            logger.error(f"Dataset not found at {DATASET_PATH}. Did you mount the volume correctly?")
            raise

    @task
    def embed_and_index(total_papers: int):
        """Query un-indexed papers from Postgres, embed synchronously, index to OpenSearch."""
        logger.info(f"Starting embed & index for papers with metadata_indexed=false...")
        engine = create_engine(DATABASE_URL)
        os_client = get_opensearch_client()
        total_indexed = 0

        with engine.connect() as db_conn:
            # Count how many papers need indexing
            count_sql = text("SELECT COUNT(*) FROM papers WHERE metadata_indexed = false")
            pending_count = db_conn.execute(count_sql).scalar()
            logger.info(f"{pending_count} papers pending indexing")

            while True:
                # Fetch next batch of un-indexed papers
                fetch_sql = text("""
                    SELECT arxiv_id, title, abstract, categories, published_at
                    FROM papers
                    WHERE metadata_indexed = false
                    ORDER BY arxiv_id
                    LIMIT :batch_size
                """)
                rows = db_conn.execute(fetch_sql, {"batch_size": BATCH_SIZE}).fetchall()

                if not rows:
                    break

                # Build texts for embedding
                texts = [f"{row.title}. {row.abstract}" for row in rows]
                arxiv_ids = [row.arxiv_id for row in rows]

                # Get embeddings synchronously
                embeddings = get_embeddings(texts)

                # Build OpenSearch bulk payload
                os_bulk_data = ""
                for row, vector in zip(rows, embeddings):
                    action = {
                        "index": {
                            "_index": OPENSEARCH_INDEX_NAME,
                            "_id": row.arxiv_id,
                        }
                    }
                    document = {
                        "arxiv_id": row.arxiv_id,
                        "title": row.title,
                        "abstract": row.abstract,
                        "categories": row.categories,
                        "published_at": row.published_at.isoformat() if row.published_at else None,
                        "abstract_vector": vector,
                    }
                    os_bulk_data += json.dumps(action) + "\n" + json.dumps(document) + "\n"

                # Push to OpenSearch
                if os_bulk_data:
                    os_client.bulk(body=os_bulk_data)

                # Mark as indexed in Postgres
                placeholders = ", ".join(f":id_{i}" for i in range(len(arxiv_ids)))
                update_sql = text(f"""
                    UPDATE papers SET metadata_indexed = true, metadata_indexed_at = :indexed_at
                    WHERE arxiv_id IN ({placeholders})
                """)
                params = {f"id_{i}": aid for i, aid in enumerate(arxiv_ids)}
                params["indexed_at"] = datetime.utcnow()
                with db_conn.begin():
                    db_conn.execute(update_sql, params)

                total_indexed += len(rows)
                if total_indexed % 1_000 == 0:
                    logger.info(f"Indexed {total_indexed}/{pending_count} papers...")

        logger.info(f"Indexing complete! Total indexed to OpenSearch: {total_indexed}")

    # ---- DAG wiring ----
    total = prepare_papers()
    embed_and_index(total)


def _save_papers_to_postgres(db_conn, papers: list[dict]):
    """Insert papers to Postgres with metadata_indexed=false (skip existing)."""
    with db_conn.begin():
        for data in papers:
            check_sql = text("SELECT id FROM papers WHERE arxiv_id = :arxiv_id")
            existing = db_conn.execute(check_sql, {"arxiv_id": data["arxiv_id"]}).fetchone()

            if not existing:
                insert_sql = text('''
                    INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_at, pdf_url, metadata_indexed, chunks_indexed)
                    VALUES (:id, :arxiv_id, :title, :authors, :abstract, :categories, :published_at, :pdf_url, false, false)
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
                })


arxiv_bulk_load_dag()
