import json
import logging
import time
import uuid
from datetime import datetime, timezone

import arxiv
import httpx
from airflow.decorators import dag, task
from sqlalchemy import create_engine, text

from _dag_config import (
    DATABASE_URL,
    OPENAI_API_KEY,
    OPENAI_API_URL,
    OPENAI_EMBEDDING_DIMENSIONS,
    OPENAI_EMBEDDING_MODEL,
    OPENSEARCH_INDEX_NAME,
    get_opensearch_client,
)

logger = logging.getLogger(__name__)

# ── Processing constants ───────────────────────────────────────────────
OPENSEARCH_BULK_CHUNK = 500            # docs per OpenSearch bulk call
ARXIV_MAX_RESULTS = 100               # papers fetched per daily run
ARXIV_DELAY_SECONDS = 15.0            # polite delay between ArXiv API pages
ARXIV_NUM_RETRIES = 3                 # retries per page inside arxiv.Client
ARXIV_429_BACKOFF = [30, 60, 120]     # seconds to wait on successive 429s

# Only index papers from these specific CS/ML categories
TARGET_CATEGORIES = [
    "cs.AI", "cs.CL", "cs.CV", "cs.CY", "cs.DB",
    "cs.DS", "cs.HC", "cs.IR", "cs.IT", "cs.LG",
    "cs.MA", "cs.NE", "cs.RO", "cs.SE", "cs.SI",
    "stat.ML",
]


# ── Shared helpers ─────────────────────────────────────────────────────
def _openai_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {OPENAI_API_KEY}"}


def _is_relevant_category(categories: list[str]) -> bool:
    """Check if the paper belongs to one of our target categories."""
    return any(c in TARGET_CATEGORIES for c in categories)


def _get_embeddings(http: httpx.Client, texts: list[str]) -> list[list[float]]:
    """Call OpenAI synchronous embeddings endpoint and return vectors."""
    payload = {
        "model": OPENAI_EMBEDDING_MODEL,
        "input": texts,
        "dimensions": OPENAI_EMBEDDING_DIMENSIONS,
    }
    response = http.post(
        f"{OPENAI_API_URL}/embeddings",
        headers={**_openai_headers(), "Content-Type": "application/json"},
        json=payload,
    )
    response.raise_for_status()
    return [item["embedding"] for item in response.json().get("data", [])]


def _fetch_new_arxiv_papers(db_conn) -> tuple[list, list]:
    """Fetch new relevant papers from ArXiv, skipping duplicates.

    Returns (papers_data, texts_to_embed).
    Handles HTTP 429 rate-limit errors with exponential backoff.
    """
    category_query = " OR ".join(f"cat:{c}" for c in TARGET_CATEGORIES)
    search = arxiv.Search(
        query=category_query,
        max_results=ARXIV_MAX_RESULTS,
        sort_by=arxiv.SortCriterion.SubmittedDate,
        sort_order=arxiv.SortOrder.Descending,
    )
    # Higher delay is polite and avoids triggering 429s on the first request
    client = arxiv.Client(
        page_size=100,
        delay_seconds=ARXIV_DELAY_SECONDS,
        num_retries=ARXIV_NUM_RETRIES,
    )

    papers_data: list[dict] = []
    texts_to_embed: list[str] = []
    check_sql = text("SELECT id FROM papers WHERE arxiv_id = :arxiv_id")

    for attempt, backoff in enumerate(ARXIV_429_BACKOFF + [None]):
        try:
            for result in client.results(search):
                categories = result.categories
                if not _is_relevant_category(categories):
                    continue
                arxiv_id = result.get_short_id()
                if db_conn.execute(check_sql, {"arxiv_id": arxiv_id}).fetchone():
                    continue
                title = result.title.replace("\n", " ").strip()
                abstract = result.summary.replace("\n", " ").strip()
                papers_data.append({
                    "arxiv_id": arxiv_id,
                    "title": title,
                    "abstract": abstract,
                    "authors": [a.name for a in result.authors],
                    "categories": categories,
                    "published_at": result.published.date(),
                    "pdf_url": result.pdf_url,
                })
                texts_to_embed.append(f"{title}. {abstract}")
            break  # success — exit retry loop
        except arxiv.HTTPError as exc:
            if exc.status == 429 and backoff is not None:
                logger.warning(
                    "ArXiv returned 429 (attempt %d/%d). Waiting %ds before retry...",
                    attempt + 1, len(ARXIV_429_BACKOFF), backoff,
                )
                time.sleep(backoff)
                papers_data = []
                texts_to_embed = []
            else:
                logger.error("ArXiv API error (HTTP %s): %s", exc.status, exc)
                logger.warning("Skipping today's fetch — will retry on next scheduled run.")
                return [], []

    return papers_data, texts_to_embed


def _insert_and_bulk_index(
    db_conn, os_client, papers_data: list[dict], embeddings: list[list[float]]
) -> None:
    """Insert new papers into Postgres and bulk-index into OpenSearch in chunks."""
    insert_sql = text(
        "INSERT INTO papers (id, arxiv_id, title, authors, abstract, categories, published_at, "
        "pdf_url, metadata_indexed, metadata_indexed_at, chunks_indexed) "
        "VALUES (:id, :arxiv_id, :title, :authors, :abstract, :categories, :published_at, "
        ":pdf_url, true, :indexed_at, false)"
    )

    with db_conn.begin():
        for data in papers_data:
            db_conn.execute(insert_sql, {
                "id": str(uuid.uuid4()),
                "arxiv_id": data["arxiv_id"],
                "title": data["title"],
                "authors": list(data["authors"]),
                "abstract": data["abstract"],
                "categories": list(data["categories"]),
                "published_at": data["published_at"],
                "pdf_url": data["pdf_url"],
                "indexed_at": datetime.now(timezone.utc),
            })

    # Bulk-index to OpenSearch in OPENSEARCH_BULK_CHUNK-sized chunks
    for i in range(0, len(papers_data), OPENSEARCH_BULK_CHUNK):
        chunk = papers_data[i : i + OPENSEARCH_BULK_CHUNK]
        chunk_vectors = embeddings[i : i + OPENSEARCH_BULK_CHUNK]
        bulk_body = ""
        for data, vector in zip(chunk, chunk_vectors):
            action = {"index": {"_index": OPENSEARCH_INDEX_NAME, "_id": data["arxiv_id"]}}
            doc = {
                "arxiv_id": data["arxiv_id"],
                "title": data["title"],
                "abstract": data["abstract"],
                "categories": data["categories"],
                "published_at": data["published_at"].isoformat() if data["published_at"] else None,
                "abstract_vector": vector,
            }
            bulk_body += json.dumps(action) + "\n" + json.dumps(doc) + "\n"
        if bulk_body:
            os_client.bulk(body=bulk_body)
            logger.info("Indexed chunk of %d papers into OpenSearch.", len(chunk))


# ── DAG definition ─────────────────────────────────────────────────────
@dag(
    dag_id="arxiv_daily_update",
    start_date=datetime(2024, 1, 1),
    schedule="@daily",
    catchup=False,
    tags=["arxiv", "daily"],
)
def arxiv_daily_update_dag():

    @task
    def fetch_and_index_new_papers():
        """Fetch today's new ArXiv papers, embed them, and index into Postgres + OpenSearch."""
        engine = create_engine(DATABASE_URL)
        os_client = get_opensearch_client()

        with httpx.Client(timeout=120.0) as http, engine.connect() as db_conn:
            # ── Step 1: Fetch new papers from ArXiv ───────────────────
            logger.info("Starting daily ArXiv fetch...")
            papers_data, texts_to_embed = _fetch_new_arxiv_papers(db_conn)

            if not papers_data:
                logger.info("No new relevant papers found today.")
                return

            logger.info("Found %d new papers. Generating embeddings...", len(papers_data))

            # ── Step 2: Generate embeddings via OpenAI ─────────────────
            embeddings = _get_embeddings(http, texts_to_embed)

            # ── Step 3: Insert into Postgres + index into OpenSearch ───
            _insert_and_bulk_index(db_conn, os_client, papers_data, embeddings)
            logger.info("Successfully processed %d new papers.", len(papers_data))

    fetch_and_index_new_papers()


arxiv_daily_update_dag()
