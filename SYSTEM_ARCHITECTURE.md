# ResearchHub AI RAG System — System Architecture & Flow Diagrams

> Companion to `CODEBASE_REPORT.md`. This document presents the same system as a series of diagrams, starting from the highest level (who uses the system and why) and drilling down to individual request flows. All diagrams are Mermaid — they render directly on GitHub and in most Markdown viewers.

---

## 1. System Context (Who Talks to What)

The outermost view. Shows the actors and third-party systems the platform depends on.

```mermaid
flowchart LR
    User([Researcher / End User]):::actor
    Admin([Developer / Ops]):::actor

    subgraph Edge[" "]
        CF[Cloudflare<br/>DNS + TLS]:::external
    end

    subgraph RH[ResearchHub Platform]
        direction TB
        FE[Frontend SPA<br/>React + Vite]:::internal
        API[Backend API<br/>FastAPI]:::internal
        AF[Airflow<br/>Scheduler]:::internal
        DATA[(Data Stores:<br/>Postgres / OpenSearch<br/>MinIO / Redis)]:::internal
    end

    Clerk[Clerk<br/>Auth + JWT + JWKS]:::external
    OpenAI[OpenAI<br/>Embeddings + Chat]:::external
    Langfuse[Langfuse<br/>LLM Observability]:::external
    ArXiv[arXiv<br/>OAI-PMH + PDFs]:::external

    User -->|HTTPS| CF --> FE
    User -->|Sign in / JWT| Clerk
    FE -->|REST + SSE<br/>Bearer JWT| API
    API -->|Verify JWT via JWKS| Clerk
    API -->|Embeddings + Chat| OpenAI
    API -->|Traces| Langfuse
    API --> DATA
    AF -->|Ingest papers| ArXiv
    AF -->|Batch embeddings| OpenAI
    AF --> DATA
    Admin -->|Deploy| RH

    classDef actor fill:#fef3c7,stroke:#b45309,color:#1f2937
    classDef external fill:#e0e7ff,stroke:#4338ca,color:#1f2937
    classDef internal fill:#dcfce7,stroke:#166534,color:#1f2937
```

**Key takeaways:**
- Authentication is fully delegated to Clerk — ResearchHub never sees a password.
- Two distinct producers of OpenAI load: the live API (per-chat) and Airflow (bulk embedding of arXiv catalog).
- Langfuse is a pure observer — removing it breaks nothing except tracing.

---

## 2. Container / Deployment View

What actually runs inside Docker Compose, with ports and dependencies.

```mermaid
flowchart TB
    Browser([Browser])
    Nginx[Nginx<br/>:80 / :443<br/>TLS + SSE passthrough]:::net

    subgraph Compose[Docker Compose — rag-network]
        direction TB
        Frontend[frontend<br/>Nginx + built SPA<br/>:3000]:::svc
        API[api<br/>FastAPI + Uvicorn<br/>:8000]:::svc
        Airflow[airflow<br/>:8080]:::svc

        Postgres[(postgres:16<br/>:5432<br/>rag_db + airflow_db)]:::db
        OpenSearch[(opensearch 2.19<br/>:9200)]:::db
        OSD[opensearch-dashboards<br/>:5601]:::svc
        Redis[(redis:7<br/>:6379)]:::db
        MinIO[(minio<br/>:9002 api / :9003 console)]:::db
    end

    Browser --> Nginx
    Nginx -->|/api/*| API
    Nginx -->|/*| Frontend

    API --> Postgres
    API --> OpenSearch
    API --> Redis
    API --> MinIO

    Airflow --> Postgres
    Airflow --> OpenSearch
    Airflow -.shared volume<br/>backend/src/.-> API

    OSD --> OpenSearch

    classDef svc fill:#dbeafe,stroke:#1e40af,color:#0f172a
    classDef db fill:#fef3c7,stroke:#b45309,color:#0f172a
    classDef net fill:#ede9fe,stroke:#6d28d9,color:#0f172a
```

**Notes:**
- **The API container bakes source at build time** — editing `backend/src/` requires `docker compose up --build -d api`. This is documented in `CLAUDE.md` and is easy to forget.
- Airflow shares `backend/src/` by bind-mount so DAGs import the same service layer as the API.
- All volumes: `postgres_data`, `opensearch_data`, `redis_data`, `minio_data`, `airflow_logs`.

---

## 3. Backend Layered Architecture

How a request moves through the FastAPI app.

```mermaid
flowchart TB
    subgraph L0[Request boundary]
        MW[Middleware<br/>CORS + request logging]
        DEP[Dependencies<br/>CurrentUser · DbSession · OsClient · AppSettings]
    end

    subgraph L1[Routers — HTTP handlers]
        direction LR
        R1[auth]
        R2[projects]
        R3[papers]
        R4[documents]
        R5[chat]
        R6[explore]
        R7[search]
        R8[activity]
        R9[analytics]
        R10[health]
    end

    subgraph L2[Services — business logic]
        direction LR
        S1[rag/pipeline.py<br/>SSE orchestrator]
        S2[agents/graph.py<br/>LangGraph]
        S3[opensearch/<br/>query_builder]
        S4[embeddings/<br/>OpenAI]
        S5[indexing/<br/>document + hybrid]
        S6[pdf_parser/<br/>PyMuPDF]
        S7[storage/<br/>MinIO]
        S8[auth/<br/>Clerk JWKS]
        S9[llm/<br/>openai_chat]
        S10[langfuse/<br/>tracer]
    end

    subgraph L3[Repositories — pure CRUD]
        direction LR
        P1[user_repo]
        P2[project_repo]
        P3[paper_repo]
        P4[document_repo]
        P5[chat_repo]
    end

    subgraph L4[Models — SQLAlchemy ORM]
        M[User · Project · ProjectTopic · Paper<br/>ProjectPaper · Document · ChatSession<br/>ChatMessage · SyncEvent · UserPreferences]
    end

    subgraph L5[External state]
        direction LR
        PG[(Postgres)]
        OS[(OpenSearch)]
        MIN[(MinIO)]
        RD[(Redis)]
    end

    MW --> DEP --> L1
    L1 --> L2
    L1 --> L3
    L2 --> L3
    L2 --> L5
    L3 --> L4 --> PG
    S3 --> OS
    S7 --> MIN
    S4 --> OpenAI_ext([OpenAI]):::ext
    S8 --> Clerk_ext([Clerk JWKS]):::ext
    S10 --> LF_ext([Langfuse]):::ext

    classDef ext fill:#e0e7ff,stroke:#4338ca,color:#0f172a
```

**Rules the code follows:**
- Routers **never** touch the DB directly — always via a repository or service.
- Services may call other services and repositories.
- Repositories are pure CRUD — no business rules.

---

## 4. Database Entity–Relationship Diagram

Direct mapping from `backend/src/models/`.

```mermaid
erDiagram
    USERS ||--o| USER_PREFERENCES : has
    USERS ||--o{ PROJECTS : owns
    USERS ||--o{ CHAT_SESSIONS : owns

    PROJECTS ||--o{ PROJECT_TOPICS : contains
    PROJECTS ||--o{ PROJECT_PAPERS : contains
    PROJECTS ||--o{ DOCUMENTS : contains
    PROJECTS ||--o{ CHAT_SESSIONS : scopes
    PROJECTS ||--o{ SYNC_EVENTS : logs

    PROJECT_TOPICS ||--o{ PROJECT_PAPERS : "surfaces (nullable)"
    PROJECT_TOPICS ||--o{ SYNC_EVENTS : triggers

    PAPERS ||--o{ PROJECT_PAPERS : referenced_by
    CHAT_SESSIONS ||--o{ CHAT_MESSAGES : contains

    USERS {
        uuid id PK
        string clerk_id UK
        string email UK
        string display_name
        string avatar_url
        timestamptz created_at
        timestamptz updated_at
    }
    USER_PREFERENCES {
        uuid id PK
        uuid user_id FK
        string theme
        string default_llm_model
        bool email_notifications
    }
    PROJECTS {
        uuid id PK
        uuid owner_id FK
        string name
        string description
        string research_goal
        string_array arxiv_categories
        string_array initial_keywords
        int year_from
        int year_to
        string status
        int paper_count
        int document_count
        timestamptz last_synced_at
    }
    PROJECT_TOPICS {
        uuid id PK
        uuid project_id FK
        string name
        string_array arxiv_categories
        string_array keywords
        int year_from
        int year_to
        string last_query
        string status
    }
    SYNC_EVENTS {
        uuid id PK
        uuid project_id FK
        uuid topic_id FK
        string event_type
        int papers_added
        int papers_removed
        jsonb details
        string triggered_by
    }
    PAPERS {
        uuid id PK
        string arxiv_id UK
        string title
        string_array authors
        string abstract
        string_array categories
        date published_at
        string pdf_url
        bool metadata_indexed
        bool chunks_indexed
        bool chunks_indexing_failed
        string openai_batch_id
    }
    PROJECT_PAPERS {
        uuid id PK
        uuid project_id FK
        uuid paper_id FK
        uuid topic_id FK
        string status
        float relevance_score
        string added_by
        timestamptz status_updated_at
    }
    DOCUMENTS {
        uuid id PK
        uuid project_id FK
        string title
        string original_filename
        string minio_bucket
        string minio_key
        bigint file_size_bytes
        string mime_type
        bool chunks_indexed
    }
    CHAT_SESSIONS {
        uuid id PK
        uuid project_id FK
        uuid user_id FK
        string title
    }
    CHAT_MESSAGES {
        uuid id PK
        uuid session_id FK
        string role
        string content
        jsonb cited_sources
        jsonb metadata
    }
```

**Cascade behavior:** Deleting a `Project` cascades to topics, project_papers (join rows only — the global `papers` table is untouched), documents, chat_sessions, and sync_events.

---

## 5. Data Flow — The Big Picture

Where each kind of data lives, and how it moves between stores.

```mermaid
flowchart LR
    subgraph Ingest[Ingestion paths]
        A1[arXiv catalog] --> AF[Airflow DAGs]
        U1[User upload<br/>PDF ≤5 MB] --> API1[API /documents]
        U2[User accepts<br/>paper in UI] --> API2[API /papers/add]
    end

    subgraph Write[Writes]
        AF --> PG[(Postgres<br/>papers)]
        AF --> OS1[(OpenSearch<br/>arxiv-papers)]
        API1 --> MIN[(MinIO<br/>researchhub-documents)]
        API1 --> PG2[(Postgres<br/>documents)]
        API1 -.BackgroundTask.-> OS2[(OpenSearch<br/>arxiv-papers-chunks)]
        API2 --> PG3[(Postgres<br/>project_papers)]
        API2 -.BackgroundTask.-> OS2
    end

    subgraph Read[Reads — RAG query path]
        Q[User chat query] --> EMB[OpenAI embeddings]
        EMB --> HY[Hybrid search<br/>BM25 + k-NN + RRF]
        HY --> OS2
        HY --> CH[Graded chunks] --> LLM[OpenAI chat]
        LLM --> SSE[SSE stream → browser]
    end

    OS2 -.source of truth for retrieval.-> HY

    classDef store fill:#fef3c7,stroke:#b45309
    class PG,PG2,PG3,OS1,OS2,MIN store
```

**Where each data type lives:**
| Data | Primary store | Why |
|---|---|---|
| Users, projects, topics, sessions, messages | Postgres | Relational, transactional |
| Paper metadata rows | Postgres | Referenced by `project_papers` |
| Paper abstract vectors + metadata | OpenSearch `arxiv-papers` | Discovery search |
| Paper + document chunks | OpenSearch `arxiv-papers-chunks` | RAG retrieval |
| PDF binaries | MinIO | Object storage |
| Session/auth state | Clerk (external) | Fully delegated |
| Cache | Redis | 256 MB LRU |

---

## 6. Authentication Flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as Frontend (React)
    participant CK as Clerk
    participant API as FastAPI
    participant DB as Postgres

    U->>FE: Open /sign-in
    FE->>CK: Clerk hosted UI
    U->>CK: Credentials / OAuth
    CK-->>FE: Session cookie + JWT (RS256)
    FE->>API: GET /api/v1/me<br/>Authorization: Bearer <jwt>
    API->>CK: Fetch JWKS (cached)
    CK-->>API: Public keys
    API->>API: Verify signature<br/>Extract sub, email, name, image_url
    API->>DB: user_repo.upsert(clerk_id, …)
    DB-->>API: User row
    API-->>FE: {id, clerk_id, email, …}
    FE-->>U: /dashboard
```

**Properties:**
- The backend **never** stores passwords.
- User row is auto-created on first verified request — there is no explicit "registration" endpoint.
- JWKS is fetched once and cached in-process; no call to Clerk per request after that.

---

## 7. RAG Chat Flow — End to End

The core product feature. This is what every other part of the system exists to support.

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as ChatPage (React)
    participant API as /chat/sessions/{sid}/messages
    participant PIPE as rag/pipeline.py
    participant LG as LangGraph agent
    participant OS as OpenSearch<br/>(arxiv-papers-chunks)
    participant OAI as OpenAI
    participant DB as Postgres
    participant LF as Langfuse

    U->>FE: Type "How does RAG work?"
    FE->>API: POST {content}<br/>Authorization: Bearer
    API->>DB: Insert user ChatMessage
    API->>PIPE: run_rag_pipeline(state)
    PIPE->>DB: Load last 10 messages

    PIPE->>LG: invoke(AgentState)

    rect rgb(240,249,255)
    note over LG: guardrail node
    LG->>OAI: Classify query vs research_goal
    OAI-->>LG: in_scope? conversational?
    end

    alt off-topic
        LG-->>PIPE: is_in_scope = false
        PIPE-->>FE: SSE chunk (rejection)
        PIPE-->>FE: SSE done
    else in scope
        rect rgb(240,253,244)
        note over LG: retrieve node
        LG->>OAI: Embed query (1024-dim)
        OAI-->>LG: vector
        LG->>OS: Hybrid BM25 + kNN<br/>filter: paper_ids OR project_id
        OS-->>LG: top 8 chunks
        end

        rect rgb(254,249,195)
        note over LG: grade_docs node
        LG->>OAI: Re-rank chunks (LLM grader)
        OAI-->>LG: graded_chunks
        end

        alt graded_chunks empty AND rewrite_count < 1
            rect rgb(254,226,226)
            note over LG: rewrite_query node
            LG->>OAI: Rewrite query
            OAI-->>LG: new query → loop to retrieve
            end
        end

        LG-->>PIPE: AgentState (graded_chunks)

        PIPE->>PIPE: Build system prompt<br/>from graded chunks
        PIPE->>OAI: Streamed chat completion
        loop Streaming tokens
            OAI-->>PIPE: token
            PIPE-->>FE: SSE chunk
        end

        PIPE->>PIPE: Extract & renumber [N] citations
        PIPE-->>FE: SSE citations
        PIPE-->>FE: SSE done

        PIPE-)LF: Async trace (non-blocking)
        PIPE->>DB: Insert assistant ChatMessage<br/>+ cited_sources + metadata
    end
```

**Things worth noting on this diagram:**
- The **rewrite loop runs at most once** — if retrieval still fails, the pipeline proceeds to generation with an empty context. This is the most likely hallucination vector.
- Citation renumbering happens **after** streaming completes, so the client sees raw `[1]`, `[3]`, `[7]` markers in the text and only learns the mapping when the `citations` event arrives.
- Langfuse tracing is fire-and-forget — a Langfuse outage cannot stall a chat.

---

## 8. Document Upload & Indexing Flow

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant FE as KnowledgeBasePage
    participant API as POST /documents
    participant BG as BackgroundTask
    participant MIN as MinIO
    participant PDF as PyMuPDF
    participant CHK as text_chunker
    participant OAI as OpenAI embeddings
    participant OS as OpenSearch<br/>arxiv-papers-chunks
    participant DB as Postgres

    U->>FE: Select PDF (≤5 MB)
    FE->>API: multipart/form-data

    rect rgb(240,249,255)
    note over API: Synchronous portion
    API->>API: Validate MIME + size
    API->>MIN: Put object<br/>{project_id}/{doc_id}/{filename}
    API->>DB: INSERT documents<br/>chunks_indexed=false
    API->>DB: UPDATE projects<br/>document_count += 1
    API->>BG: schedule index_document_chunks(doc_id)
    API-->>FE: 201 Created
    end

    rect rgb(240,253,244)
    note over BG: Asynchronous — runs after response
    BG->>MIN: Get object
    MIN-->>BG: PDF bytes
    BG->>PDF: parse_pdf_from_bytes(max_pages=40)
    PDF-->>BG: text
    BG->>CHK: chunk(600 char, 100 overlap)
    CHK-->>BG: chunks[]
    BG->>OAI: Embed batch(50)
    OAI-->>BG: vectors[]
    BG->>OS: Bulk index chunks
    BG->>DB: UPDATE documents<br/>chunks_indexed=true
    end

    loop Until chunks_indexed=true
        FE->>API: GET /documents
        API-->>FE: list with status
    end
```

**Risk flagged in the codebase report:** the async portion is a FastAPI `BackgroundTask` — if the API container restarts mid-task, the document ends up orphaned with `chunks_indexed=false` and **nothing retries it**.

---

## 9. Paper Discovery → Accept → Index Flow

The "Living Knowledge Base" lifecycle for an arXiv paper.

```mermaid
stateDiagram-v2
    [*] --> arxiv_catalog: Airflow bulk-load

    state "In arxiv-papers index<br/>(metadata + abstract vector)" as arxiv_catalog

    arxiv_catalog --> suggested: user discovers via<br/>Explore or Topic sync
    arxiv_catalog --> suggested: starter-pack<br/>at project creation

    state "project_papers.status = suggested" as suggested
    state "project_papers.status = accepted" as accepted
    state "project_papers.status = rejected" as rejected

    suggested --> accepted: user accepts
    suggested --> rejected: user rejects

    accepted --> indexing: BackgroundTask<br/>fetch PDF + chunk + embed
    state "Chunks in arxiv-papers-chunks<br/>chunks_indexed=true" as indexing
    indexing --> retrievable: available to RAG

    state "Included in chat retrieval" as retrievable

    rejected --> [*]
    accepted --> removed: user removes
    retrievable --> removed: user removes
    removed --> [*]

    indexing --> failed: exception
    state "chunks_indexing_failed=true" as failed
    note right of failed
        No automatic retry.
        Manual reset required.
    end note
```

**Key state transitions in code:**
- `suggested → accepted` happens in `PATCH /papers/{paper_id}` and triggers the indexing background task.
- `indexing → retrievable` is implicit — as soon as `chunks_indexed=true`, the retrieve node will find the chunks.
- `accepted → removed` does **not** delete the global `papers` row, only the `project_papers` join row.

---

## 10. Project Creation Wizard (Frontend-Driven Flow)

```mermaid
flowchart TB
    Start([User clicks 'New Project']):::start
    S1[Step 1: Name + Description]
    S2[Step 2: Research Goal]
    S3[Step 3: ArXiv Categories]
    S4[Step 4: Keywords]
    S4a{Keyword<br/>suggestions?}
    API1[POST /projects/suggest-keywords<br/>LLM extraction]
    S5[Step 5: Starter Pack Search]
    API2[POST /projects/id/papers/discover<br/>Hybrid search using<br/>embedded research_goal]
    Review[User accepts papers]
    API3[POST /projects/id/papers/add<br/>for each accepted]
    API4[POST /projects<br/>Create project row]
    BG[BackgroundTasks:<br/>index accepted paper chunks]
    Done([Redirect to /project/id]):::done

    Start --> S1 --> S2 --> S3 --> S4
    S4 --> S4a
    S4a -- yes --> API1 --> S4
    S4a -- no --> S5
    S5 --> API2 --> Review --> API3 --> API4 --> BG --> Done

    classDef start fill:#dcfce7,stroke:#166534
    classDef done fill:#dbeafe,stroke:#1e40af
```

**Quirk worth knowing:** `research_goal` is embedded **once** at discovery time. If the user later edits it on the Settings page, the stored embedding is **not** refreshed — subsequent discoveries use stale semantics.

---

## 11. Airflow DAG Topology

```mermaid
flowchart LR
    subgraph Manual[Manual trigger]
        BL[arxiv_bulk_load_batch]
    end

    subgraph Daily[Daily schedule]
        DU[arxiv_daily_update]
    end

    subgraph Steps_BL[Bulk load steps]
        B1[Page papers<br/>metadata_indexed=false]
        B2[Build OpenAI batch<br/>up to 4000 requests]
        B3[Poll batch<br/>up to 24h]
        B4[Download embeddings]
        B5[Bulk index<br/>arxiv-papers]
        B6[UPDATE papers<br/>metadata_indexed=true]
    end

    subgraph Steps_DU[Daily update steps]
        D1[Fetch arXiv OAI-PMH<br/>cs.AI + configured cats]
        D2[INSERT new papers]
        D3[Per topic:<br/>drift detection]
        D4[Emit sync_events<br/>drift_detected]
    end

    BL --> B1 --> B2 --> B3 --> B4 --> B5 --> B6
    DU --> D1 --> D2 --> D3 --> D4

    B5 --> OS[(arxiv-papers)]
    B6 --> PG[(papers)]
    D2 --> PG
    D4 --> PG2[(sync_events)]
```

Both DAGs import `backend/src/services/*` via the shared volume mount, so they run the same embedding, indexing, and query-building code as the API.

---

## 12. Request Lifecycle Through the Backend

A single composite view — what happens from the TCP packet arriving at Nginx to the response leaving.

```mermaid
flowchart TB
    T0[Client request] --> NG[Nginx<br/>TLS + security headers]
    NG -->|/api/v1/*| UV[Uvicorn ASGI]
    UV --> MW1[CORS middleware]
    MW1 --> MW2[Request logger]
    MW2 --> DI[Dependency injection<br/>resolve DbSession etc.]

    DI --> AUTH{Protected<br/>route?}
    AUTH -- yes --> CK[get_current_user<br/>verify JWT via JWKS<br/>upsert User]
    AUTH -- no --> RT
    CK --> RT[Router handler]

    RT --> SVC[Service call]
    SVC --> REPO[Repository]
    REPO --> ORM[SQLAlchemy → Postgres]
    SVC --> OS[OpenSearch client]
    SVC --> OAI[OpenAI client]
    SVC --> MIN[MinIO client]

    RT --> RESP{Response type}
    RESP -->|JSON| JSON[Pydantic serialize]
    RESP -->|SSE| STREAM[EventSourceResponse<br/>async generator]
    RESP -->|Background| BG[BackgroundTask<br/>runs post-response]

    JSON --> NG
    STREAM -.chunked.-> NG
    BG -.after return.-> SVC

    NG --> T1[Client response]

    classDef http fill:#dbeafe,stroke:#1e40af
    classDef logic fill:#dcfce7,stroke:#166534
    classDef store fill:#fef3c7,stroke:#b45309
    class NG,UV,MW1,MW2,JSON,STREAM http
    class RT,SVC,REPO,CK logic
    class ORM,OS,OAI,MIN store
```

---

## 13. Known Couplings & Fragility Map

A visual version of the risks section from `CODEBASE_REPORT.md` — what breaks what.

```mermaid
flowchart LR
    subgraph Fragile[Fragile / risky couplings]
        BG[BackgroundTask indexing]
        DC[Denormalized counts]
        RG[Research goal embedding]
        CNT[Hardcoded 5-session/day]
        COST[Unmetered OpenAI calls]
        HAL[Hallucination check<br/>unimplemented]
        RW[Rewrite loop cap = 1]
    end

    BG -->|silently loses work on| Restart([API restart])
    BG -->|sets but never clears| FLAG([chunks_indexing_failed])
    DC -->|drifts when| Missed([any code path forgets])
    RG -->|becomes stale when| Edit([user edits Settings])
    CNT -->|blocks without| Override([per-user tuning])
    COST -->|exposes to| Abuse([runaway API bills])
    HAL -->|produces| FalseConf([unchecked generations])
    RW -->|leads to| EmptyCtx([generation with no chunks])
    EmptyCtx --> HAL

    classDef bad fill:#fee2e2,stroke:#b91c1c
    classDef effect fill:#fef3c7,stroke:#b45309
    class BG,DC,RG,CNT,COST,HAL,RW bad
    class Restart,FLAG,Missed,Edit,Override,Abuse,FalseConf,EmptyCtx effect
```

**Read this diagram as: "If you change X, you need to also think about Y."**

---

## 14. Appendix — How to View These Diagrams

- **GitHub** renders Mermaid natively when viewing `.md` files.
- **VS Code** with the *Markdown Preview Mermaid Support* extension renders them in the preview pane.
- **Obsidian / Typora / Notion** all support Mermaid.
- To export a single diagram as PNG/SVG: paste the fenced block into <https://mermaid.live>.

---

## 15. Cross-Reference

| Question | See section |
|---|---|
| "Who talks to what outside the system?" | §1 System Context |
| "What actually runs in Docker?" | §2 Container View |
| "How is the backend layered?" | §3 Backend Layers |
| "What does the DB look like?" | §4 ER Diagram |
| "Where does each piece of data live?" | §5 Data Flow |
| "How does login work?" | §6 Auth Flow |
| "What happens when I send a chat message?" | §7 RAG Flow |
| "What happens when I upload a PDF?" | §8 Document Flow |
| "What are the states of a paper in a project?" | §9 Paper Lifecycle |
| "How does project creation work?" | §10 Wizard Flow |
| "What do the scheduled jobs do?" | §11 Airflow |
| "What does every request go through?" | §12 Request Lifecycle |
| "What's brittle in this system?" | §13 Fragility Map |
