# ResearchHub — Database Schema

PostgreSQL via SQLAlchemy + Alembic. PDF uploads stored in MinIO. Vectors stored in OpenSearch (not PostgreSQL).

---

## ER Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        string clerk_id UK
        string email UK
        string display_name
        string avatar_url
        timestamp created_at
        timestamp updated_at
    }

    USER_PREFERENCES {
        uuid id PK
        uuid user_id FK UK
        string theme "light | dark | system"
        string default_llm_model
        bool email_notifications
        json extra
        timestamp updated_at
    }

    PROJECT {
        uuid id PK
        uuid owner_id FK
        string name
        text description
        text research_goal "free text - also embedded for semantic search"
        string[] arxiv_categories "cs.AI, cs.LG, cs.CL, etc."
        string[] initial_keywords
        int year_from
        int year_to
        string status "active | archived"
        int paper_count "denormalized"
        int document_count "denormalized"
        timestamp last_synced_at
        timestamp created_at
        timestamp updated_at
    }

    PROJECT_TOPIC {
        uuid id PK
        uuid project_id FK
        string name
        string[] arxiv_categories
        string[] keywords
        int year_from
        int year_to
        string last_query "saved OpenSearch query string"
        string status "active | pruned"
        timestamp added_at
        timestamp pruned_at
    }

    PAPER {
        uuid id PK
        string arxiv_id UK
        string title
        string[] authors
        text abstract
        string[] categories
        date published_at
        string pdf_url
        bool metadata_indexed "abstract vector in arxiv-metadata index"
        bool chunks_indexed "full text chunks in arxiv-chunks index"
        timestamp metadata_indexed_at
        timestamp chunks_indexed_at
        timestamp created_at
    }

    PROJECT_PAPER {
        uuid id PK
        uuid project_id FK
        uuid paper_id FK
        uuid topic_id FK
        string status "suggested | accepted | rejected"
        float relevance_score "0.0-1.0"
        string added_by "starter_pack | sync | user_search"
        timestamp status_updated_at
        timestamp added_at
    }

    DOCUMENT {
        uuid id PK
        uuid project_id FK
        string title
        string original_filename
        string minio_bucket
        string minio_key
        bigint file_size_bytes
        string mime_type
        bool chunks_indexed
        timestamp chunks_indexed_at
        timestamp uploaded_at
    }

    CHAT_SESSION {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string title
        timestamp created_at
        timestamp updated_at
    }

    CHAT_MESSAGE {
        uuid id PK
        uuid session_id FK
        string role "user | assistant"
        text content
        json cited_sources
        json metadata "model, latency_ms, tokens"
        timestamp created_at
    }

    SYNC_EVENT {
        uuid id PK
        uuid project_id FK
        uuid topic_id FK
        string event_type "sync | clean | drift_detected"
        int papers_added
        int papers_removed
        json details
        string triggered_by "user | scheduler"
        timestamp created_at
    }

    USER ||--|| USER_PREFERENCES : "has"
    USER ||--o{ PROJECT : "owns"
    PROJECT ||--o{ PROJECT_TOPIC : "has"
    PROJECT ||--o{ PROJECT_PAPER : "links"
    PROJECT ||--o{ DOCUMENT : "holds"
    PAPER ||--o{ PROJECT_PAPER : "referenced in"
    PROJECT_TOPIC ||--o{ PROJECT_PAPER : "sourced from"
    PROJECT_TOPIC ||--o{ SYNC_EVENT : "triggers"
    PROJECT ||--o{ CHAT_SESSION : "has"
    USER ||--o{ CHAT_SESSION : "opens"
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "contains"
    PROJECT ||--o{ SYNC_EVENT : "tracks"
```

---

## Table Summary

| Table              | Purpose                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| `users`            | Clerk auth users                                                            |
| `user_preferences` | Theme, model, notifications (1-to-1)                                        |
| `projects`         | Research silos — creation form answers + denormalized stats                 |
| `project_topics`   | Living Knowledge Base — each topic has its own saved search query           |
| `papers`           | Global ArXiv metadata pre-populated by Airflow (shared across all projects) |
| `project_papers`   | Junction: links papers to projects with suggested/accepted/rejected status  |
| `documents`        | Project-specific PDF uploads stored in MinIO                                |
| `chat_sessions`    | Grouped conversations per project                                           |
| `chat_messages`    | Q&A turns with JSON cited sources                                           |
| `sync_events`      | Audit trail for topic syncs and cleanups                                    |

---

## Two OpenSearch Indices

| Index            | Contents                                                 | When Populated                             |
| ---------------- | -------------------------------------------------------- | ------------------------------------------ |
| `arxiv-metadata` | title + abstract embeddings for ALL indexed ArXiv papers | Airflow bulk load + daily OAI-PMH updates  |
| `arxiv-chunks`   | full-text chunk embeddings for ACCEPTED papers only      | When user accepts a paper or uploads a PDF |

- **Paper discovery** (project creation, topic sync) → searches `arxiv-metadata`
- **RAG chat** (answering questions) → searches `arxiv-chunks`

---

## Project Creation Wizard → DB Mapping

| Step | Question                              | DB Column                        | Search Use                     |
| ---- | ------------------------------------- | -------------------------------- | ------------------------------ |
| 1    | Project name                          | `projects.name`                  | —                              |
| 1    | Research goal (free text)             | `projects.research_goal`         | Embedded → KNN semantic search |
| 2    | ArXiv categories (cs.\* multi-select) | `projects.arxiv_categories[]`    | Filter in OpenSearch           |
| 3    | Keywords / concepts                   | `projects.initial_keywords[]`    | BM25 on title + abstract       |
| 4    | Paper date range                      | `projects.year_from` / `year_to` | Range filter                   |
| 5    | Accept/reject suggestions             | `project_papers.status`          | —                              |
| 5    | Upload own PDFs                       | `documents`                      | Chunk + embed → `arxiv-chunks` |

**Step 5 is mandatory** — project is only created after user accepts ≥1 paper or uploads ≥1 PDF.

---

## How Project Discovery Search Works

```
research_goal (text)  →  Jina AI  →  1024-dim vector (q_vector)
initial_keywords      →  BM25 query on title + abstract
arxiv_categories      →  category filter
year_from / year_to   →  date range filter

OpenSearch query against arxiv-metadata index:
  bool:
    filter: [categories, date range]
    should: [BM25 on title/abstract, KNN on abstract_vector using q_vector]
    → RRF combined ranking → top N results
```

---

## `cited_sources` JSON Format

```json
[
  {
    "paper_id": "uuid-or-null",
    "document_id": "uuid-or-null",
    "arxiv_id": "2312.01234",
    "title": "Attention is All You Need",
    "authors": ["Vaswani et al."],
    "chunk_text": "...the relevant excerpt...",
    "relevance_score": 0.87
  }
]
```

---

## Finalized Design Decisions

| Decision               | Choice                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| Paper source           | Pre-populated from ArXiv bulk data (Kaggle + OAI-PMH daily updates via Airflow) |
| Paper discovery        | Hybrid: BM25 keywords + KNN semantic on embedded research_goal                  |
| Project-specific PDFs  | Separate `documents` table, stored in MinIO                                     |
| Global ArXiv papers    | `papers` table shared across all projects via `project_papers`                  |
| Suggestion tracking    | `project_papers.status` = `suggested / accepted / rejected`                     |
| Living Knowledge Base  | `project_topics` each with `last_query` for reproducible syncs                  |
| Citations in chat      | JSON field `cited_sources` in `chat_messages`                                   |
| User settings          | `user_preferences` table (1-to-1 with user)                                     |
| Team collaboration     | Deferred — no `project_members` table for now                                   |
| ArXiv categories shown | cs.\* and stat.ML only                                                          |
| Step 5 (paper review)  | Mandatory — must accept ≥1 paper or upload ≥1 PDF                               |
