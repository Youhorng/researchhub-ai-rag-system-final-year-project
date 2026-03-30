import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

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
MAX_REQUESTS_PER_BATCH = 4_000         # Stay under enqueued token limit
PG_FETCH_PAGE_SIZE = 5_000             # rows per DB round-trip
OPENSEARCH_BULK_CHUNK = 500            # docs per OpenSearch bulk call
POLL_INTERVAL_SECONDS = 60
POLL_TIMEOUT_SECONDS = 86_400          # 24 h safety valve

BATCH_INPUT_DIR = "/opt/airflow/data/batch_inputs"
BATCH_OUTPUT_DIR = "/opt/airflow/data/batch_outputs"


# ── Shared helpers ─────────────────────────────────────────────────────
def _openai_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {OPENAI_API_KEY}"}


def _stamp_batch_id(db_conn, arxiv_ids: list[str], batch_id: str):
    """UPDATE papers SET openai_batch_id = :batch_id WHERE arxiv_id IN (...)."""
    for i in range(0, len(arxiv_ids), 500):
        chunk = arxiv_ids[i : i + 500]
        placeholders = ", ".join(f":id_{j}" for j in range(len(chunk)))
        sql = text(
            f"UPDATE papers SET openai_batch_id = :batch_id "
            f"WHERE arxiv_id IN ({placeholders})"
        )
        params = {f"id_{j}": aid for j, aid in enumerate(chunk)}
        params["batch_id"] = batch_id
        with db_conn.begin():
            db_conn.execute(sql, params)


def _reset_batch(db_conn, batch_id: str):
    """Clear openai_batch_id so papers can be retried on the next run."""
    sql = text("UPDATE papers SET openai_batch_id = NULL WHERE openai_batch_id = :batch_id")
    with db_conn.begin():
        db_conn.execute(sql, {"batch_id": batch_id})
    logger.info(f"Reset openai_batch_id for batch {batch_id}")


def _create_batch(db_conn, http: httpx.Client, headers: dict) -> str | None:
    """Fetch up to MAX_REQUESTS_PER_BATCH un-indexed papers, upload JSONL, create batch.

    Returns the OpenAI batch_id, or None when no papers remain.
    """
    Path(BATCH_INPUT_DIR).mkdir(parents=True, exist_ok=True)

    arxiv_ids: list[str] = []
    file_path = os.path.join(
        BATCH_INPUT_DIR,
        f"batch_{datetime.now().strftime('%Y%m%d%H%M%S')}.jsonl",
    )

    offset = 0
    with open(file_path, "w") as f:
        while len(arxiv_ids) < MAX_REQUESTS_PER_BATCH:
            remaining = MAX_REQUESTS_PER_BATCH - len(arxiv_ids)
            page = min(PG_FETCH_PAGE_SIZE, remaining)
            sql = text(
                "SELECT arxiv_id, title, abstract FROM papers "
                "WHERE metadata_indexed = false AND openai_batch_id IS NULL "
                "ORDER BY arxiv_id LIMIT :limit OFFSET :offset"
            )
            rows = db_conn.execute(sql, {"limit": page, "offset": offset}).fetchall()
            if not rows:
                break

            for row in rows:
                embed_input = f"{row.title}. {row.abstract}"
                # text-embedding-3-small has 8191 token limit (~4 chars/token)
                if len(embed_input) > 30_000:
                    embed_input = embed_input[:30_000]
                line = {
                    "custom_id": row.arxiv_id,
                    "method": "POST",
                    "url": "/v1/embeddings",
                    "body": {
                        "model": OPENAI_EMBEDDING_MODEL,
                        "input": embed_input,
                        "dimensions": OPENAI_EMBEDDING_DIMENSIONS,
                    },
                }
                f.write(json.dumps(line) + "\n")
                arxiv_ids.append(row.arxiv_id)

            offset += len(rows)

    if not arxiv_ids:
        os.remove(file_path)
        return None

    logger.info(f"Wrote {len(arxiv_ids)} requests to {file_path}")

    # Upload JSONL file
    with open(file_path, "rb") as f:
        upload_resp = http.post(
            f"{OPENAI_API_URL}/files",
            headers=headers,
            files={"file": (os.path.basename(file_path), f, "application/jsonl")},
            data={"purpose": "batch"},
        )
    upload_resp.raise_for_status()
    input_file_id = upload_resp.json()["id"]

    # Create batch
    batch_resp = http.post(
        f"{OPENAI_API_URL}/batches",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "input_file_id": input_file_id,
            "endpoint": "/v1/embeddings",
            "completion_window": "24h",
        },
    )
    batch_resp.raise_for_status()
    batch_id = batch_resp.json()["id"]

    # Stamp every paper in Postgres
    _stamp_batch_id(db_conn, arxiv_ids, batch_id)
    logger.info(f"Created batch {batch_id} with {len(arxiv_ids)} papers")
    return batch_id


def _poll_batch(http: httpx.Client, headers: dict, batch_id: str) -> dict:
    """Poll GET /v1/batches/{id} every 60 s until terminal state or 24 h timeout.

    Returns dict with keys: status, output_file_id (on success), error (on failure).
    """
    deadline = time.monotonic() + POLL_TIMEOUT_SECONDS

    while True:
        resp = http.get(f"{OPENAI_API_URL}/batches/{batch_id}", headers=headers)
        resp.raise_for_status()
        data = resp.json()
        status = data["status"]

        counts = data.get("request_counts", {})
        completed = counts.get("completed", 0)
        failed = counts.get("failed", 0)
        total = counts.get("total", 0)
        logger.info(f"Batch {batch_id}: {status} ({completed}/{total}, {failed} failed)")

        if status == "completed":
            return {"status": "completed", "output_file_id": data["output_file_id"]}

        if status in ("failed", "expired", "cancelled", "cancelling"):
            errors = (data.get("errors") or {}).get("data", [])
            msg = errors[0].get("message", "") if errors else ""
            return {"status": status, "error": msg}

        if time.monotonic() >= deadline:
            logger.warning(f"Polling timeout for batch {batch_id}")
            return {"status": "timeout"}

        time.sleep(POLL_INTERVAL_SECONDS)


def _index_chunk_to_opensearch(
    db_conn, os_client, arxiv_ids: list[str], vectors: dict[str, list[float]]
):
    """Fetch metadata from Postgres, bulk-index to OpenSearch, mark indexed."""
    if not arxiv_ids:
        return

    for i in range(0, len(arxiv_ids), OPENSEARCH_BULK_CHUNK):
        chunk_ids = arxiv_ids[i : i + OPENSEARCH_BULK_CHUNK]
        placeholders = ", ".join(f":id_{j}" for j in range(len(chunk_ids)))
        query = text(
            f"SELECT arxiv_id, title, abstract, categories, published_at "
            f"FROM papers WHERE arxiv_id IN ({placeholders})"
        )
        params = {f"id_{j}": aid for j, aid in enumerate(chunk_ids)}
        rows = db_conn.execute(query, params).fetchall()

        bulk_body = ""
        indexed_ids: list[str] = []
        for row in rows:
            vector = vectors.get(row.arxiv_id)
            if not vector:
                continue
            action = {"index": {"_index": OPENSEARCH_INDEX_NAME, "_id": row.arxiv_id}}
            doc = {
                "arxiv_id": row.arxiv_id,
                "title": row.title,
                "abstract": row.abstract,
                "categories": row.categories,
                "published_at": row.published_at.isoformat() if row.published_at else None,
                "abstract_vector": vector,
            }
            bulk_body += json.dumps(action) + "\n" + json.dumps(doc) + "\n"
            indexed_ids.append(row.arxiv_id)

        if bulk_body:
            os_client.bulk(body=bulk_body)

        if indexed_ids:
            ph = ", ".join(f":id_{k}" for k in range(len(indexed_ids)))
            update_sql = text(
                f"UPDATE papers SET metadata_indexed = true, "
                f"metadata_indexed_at = :indexed_at, openai_batch_id = NULL "
                f"WHERE arxiv_id IN ({ph})"
            )
            up = {f"id_{k}": aid for k, aid in enumerate(indexed_ids)}
            up["indexed_at"] = datetime.now(timezone.utc)
            with db_conn.begin():
                db_conn.execute(update_sql, up)


def _download_and_index(db_conn, http: httpx.Client, os_client, headers: dict, batch_id: str, output_file_id: str):
    """Download batch results, parse embeddings, bulk-index to OpenSearch."""
    Path(BATCH_OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

    logger.info(f"Downloading results for batch {batch_id} (file {output_file_id})...")
    resp = http.get(f"{OPENAI_API_URL}/files/{output_file_id}/content", headers=headers)
    resp.raise_for_status()

    output_path = os.path.join(BATCH_OUTPUT_DIR, f"{batch_id}.jsonl")
    with open(output_path, "wb") as f:
        f.write(resp.content)

    arxiv_ids: list[str] = []
    vectors: dict[str, list[float]] = {}

    with open(output_path, "r") as f:
        for line in f:
            result = json.loads(line)
            arxiv_id = result["custom_id"]
            response_body = result.get("response", {})

            if response_body.get("status_code") != 200:
                logger.warning(f"Embedding failed for {arxiv_id}: {response_body}")
                continue

            vector = response_body["body"]["data"][0]["embedding"]
            arxiv_ids.append(arxiv_id)
            vectors[arxiv_id] = vector

            if len(arxiv_ids) >= OPENSEARCH_BULK_CHUNK:
                _index_chunk_to_opensearch(db_conn, os_client, arxiv_ids, vectors)
                arxiv_ids = []
                vectors = {}

    if arxiv_ids:
        _index_chunk_to_opensearch(db_conn, os_client, arxiv_ids, vectors)

    logger.info(f"Finished indexing batch {batch_id}")


def _handle_batch_result(result: dict, batch_id: str, db_conn, http, os_client, headers) -> bool:
    """Process a polled batch result. Returns True if the outer loop should break."""
    if result["status"] == "completed":
        # Step 4: Download & index — then loop back to step 1
        _download_and_index(db_conn, http, os_client, headers, batch_id, result["output_file_id"])
        return False
    if result["status"] == "timeout":
        # Leave batch_id intact so next run re-polls
        logger.warning(f"Batch {batch_id} timed out. Will resume next run.")
        return True
    # failed / expired / cancelled
    logger.warning(
        f"Batch {batch_id} ended with status={result['status']}: {result.get('error', '')}"
    )
    _reset_batch(db_conn, batch_id)
    return True


# ── DAG definition ─────────────────────────────────────────────────────
@dag(
    dag_id="arxiv_bulk_load_batch",
    start_date=datetime(2024, 1, 1),
    schedule=None,
    catchup=False,
    tags=["arxiv", "setup", "batch", "persistent"],
)
def arxiv_bulk_load_batch_dag():

    @task
    def process_all_batches():
        """One-batch-at-a-time loop: submit → poll → index → repeat."""
        # OPENAI_API_KEY is validated by _dag_config on import

        engine = create_engine(DATABASE_URL)
        os_client = get_opensearch_client()
        headers = _openai_headers()

        with httpx.Client(timeout=120.0) as http, engine.connect() as db_conn:
            while True:
                # ── Step 1: Resume check ───────────────────────────────
                resume_sql = text(
                    "SELECT DISTINCT openai_batch_id FROM papers "
                    "WHERE openai_batch_id IS NOT NULL AND metadata_indexed = false"
                )
                in_flight = db_conn.execute(resume_sql).fetchall()

                if in_flight:
                    batch_id = in_flight[0].openai_batch_id
                    logger.info(f"Resuming in-flight batch {batch_id}")
                else:
                    # ── Step 2: Submit new batch ───────────────────────
                    batch_id = _create_batch(db_conn, http, headers)
                    if batch_id is None:
                        logger.info("No papers remaining. Done.")
                        break

                # ── Step 3: Poll until terminal ────────────────────────
                result = _poll_batch(http, headers, batch_id)

                if _handle_batch_result(result, batch_id, db_conn, http, os_client, headers):
                    break

    process_all_batches()


arxiv_bulk_load_batch_dag()
