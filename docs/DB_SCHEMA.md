# ResearchHub — Database Schema

PostgreSQL via SQLAlchemy + Alembic. PDF uploads stored in MinIO.

> **Note:** OpenSearch stores vector chunks for RAG — PostgreSQL stores metadata only.

---

## ER Diagram

```mermaid
erDiagram
    USER {
        uuid id PK
        string clerk_id UK "from Clerk JWT"
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
        json extra "extensible key-value"
        timestamp updated_at
    }

    PROJECT {
        uuid id PK
        uuid owner_id FK
        string name
        text description
        text research_goal "from creation form"
        string[] initial_keywords "from creation form"
        string[] arxiv_categories "cs.AI, cs.LG, etc."
        int year_from "paper date filter"
        int year_to "paper date filter"
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
        string name "topic or keyword cluster"
        text description
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
        bool is_indexed "in OpenSearch?"
        timestamp indexed_at
        timestamp created_at
    }

    PROJECT_PAPER {
        uuid id PK
        uuid project_id FK
        uuid paper_id FK
        uuid topic_id FK "which topic triggered this"
        string status "suggested | accepted | rejected"
        float relevance_score "0.0–1.0 from search"
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
        string minio_key "object path in MinIO"
        bigint file_size_bytes
        string mime_type
        bool is_indexed "in OpenSearch?"
        timestamp indexed_at
        timestamp uploaded_at
    }

    CHAT_SESSION {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string title "from first message"
        timestamp created_at
        timestamp updated_at
    }

    CHAT_MESSAGE {
        uuid id PK
        uuid session_id FK
        string role "user | assistant"
        text content
        json cited_sources "see format below"
        json metadata "model, latency_ms, tokens"
        timestamp created_at
    }

    SYNC_EVENT {
        uuid id PK
        uuid project_id FK
        uuid topic_id FK "which topic was synced"
        string event_type "sync | clean | drift_detected"
        int papers_added
        int papers_removed
        json details "flagged paper ids, similarity scores"
        string triggered_by "user | scheduler"
        timestamp created_at
    }

    USER ||--|| USER_PREFERENCES : "has"
    USER ||--o{ PROJECT : "owns"
    PROJECT ||--o{ PROJECT_TOPIC : "has topics"
    PROJECT ||--o{ PROJECT_PAPER : "links"
    PROJECT ||--o{ DOCUMENT : "holds uploads"
    PAPER ||--o{ PROJECT_PAPER : "referenced in"
    PROJECT_TOPIC ||--o{ PROJECT_PAPER : "sourced from"
    PROJECT_TOPIC ||--o{ SYNC_EVENT : "triggers"
    PROJECT ||--o{ CHAT_SESSION : "has"
    USER ||--o{ CHAT_SESSION : "opens"
    CHAT_SESSION ||--o{ CHAT_MESSAGE : "contains"
    PROJECT ||--o{ SYNC_EVENT : "tracks"
```

---

## Table Reference

| Table              | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `users`            | Clerk auth users                                                             |
| `user_preferences` | Theme, default model, notifications (1-to-1 with user)                       |
| `projects`         | Research silos — stores creation form answers                                |
| `project_topics`   | Living Knowledge Base — topics user adds/prunes over time                    |
| `papers`           | Global ArXiv papers, shared across all projects                              |
| `project_papers`   | Junction: links papers to projects with `suggested/accepted/rejected` status |
| `documents`        | Project-specific PDF uploads stored in MinIO                                 |
| `chat_sessions`    | Grouped conversations per project                                            |
| `chat_messages`    | Q&A turns with JSON cited sources                                            |
| `sync_events`      | Audit trail of topic syncs and cleanups                                      |

---

## Project Creation Form → DB Columns

| Form Field       | DB Column                        |
| ---------------- | -------------------------------- |
| Project name     | `projects.name`                  |
| Research goal    | `projects.research_goal`         |
| Keywords         | `projects.initial_keywords[]`    |
| ArXiv categories | `projects.arxiv_categories[]`    |
| Paper date range | `projects.year_from` / `year_to` |
| Description      | `projects.description`           |

These fields power the initial ArXiv search to generate the "Starter Pack" of suggested papers.

---

## `cited_sources` JSON Format

Each entry in `chat_messages.cited_sources` represents one source used to answer the query:

```json
[
  {
    "paper_id": "uuid-or-null",
    "document_id": "uuid-or-null",
    "arxiv_id": "2312.01234",
    "title": "Attention is All You Need",
    "authors": ["Vaswani et al."],
    "chunk_text": "...the relevant excerpt used to answer...",
    "relevance_score": 0.87
  }
]
```

- `paper_id` is set for ArXiv papers, null for uploaded documents
- `document_id` is set for uploaded PDFs, null for ArXiv papers

---

## Design Decisions

| Decision              | Choice                                                      |
| --------------------- | ----------------------------------------------------------- |
| PDF Uploads           | Separate `documents` table, stored in MinIO                 |
| ArXiv Papers          | Global `papers` table, linked via `project_papers`          |
| Suggestion tracking   | `project_papers.status` = `suggested / accepted / rejected` |
| Living Knowledge Base | `project_topics` → triggers syncs → `sync_events`           |
| Citations             | JSON field in `chat_messages`                               |
| User settings         | `user_preferences` table (1-to-1)                           |
| Team collaboration    | Deferred — no `project_members` for now                     |
