# ResearchHub — Postman Testing Guide

How to test the Knowledge Base Management and Agentic RAG features via Postman.

---

## Prerequisites

1. All services running: `docker compose up --build -d`
2. A valid Clerk JWT token (grab from browser DevTools → Application → Session cookie, or from the frontend `useAuth().getToken()`)
3. Set these Postman variables (or use an environment):

| Variable | Example |
|----------|---------|
| `BASE_URL` | `http://localhost:8000/api/v1` |
| `TOKEN` | `eyJhbGciOi...` (your Clerk JWT) |
| `PROJECT_ID` | *(set after creating a project)* |
| `TOPIC_ID` | *(set after creating a topic)* |
| `SESSION_ID` | *(set after creating a chat session)* |
| `PAPER_ID` | *(set after searching/discovering papers)* |

All requests need this header:

```
Authorization: Bearer {{TOKEN}}
```

---

## 1. Project Setup

### 1.1 Create a Project

```
POST {{BASE_URL}}/projects
```

```json
{
  "name": "RAG Survey 2024",
  "description": "Survey of retrieval-augmented generation techniques",
  "research_goal": "Understanding how retrieval-augmented generation improves factual accuracy in large language models",
  "initial_keywords": ["RAG", "retrieval augmented generation", "vector database"],
  "arxiv_categories": ["cs.CL", "cs.AI", "cs.IR"],
  "year_from": 2020,
  "year_to": 2024
}
```

Save `id` from the response as `PROJECT_ID`.

### 1.2 Get Project Details

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}
```

---

## 2. Knowledge Base Management — Topics

### 2.1 Suggest Keywords (AI-generated)

```
POST {{BASE_URL}}/projects/suggest-keywords
```

```json
{
  "research_goal": "Understanding how retrieval-augmented generation improves factual accuracy in large language models"
}
```

Returns a list of suggested keywords you can use when creating topics.

### 2.2 Create a Topic

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/topics
```

```json
{
  "name": "Dense Retrieval Methods",
  "keywords": ["dense retrieval", "DPR", "bi-encoder", "embedding search"],
  "arxiv_categories": ["cs.CL", "cs.IR"],
  "year_from": 2021,
  "year_to": 2024
}
```

Save `id` from the response as `TOPIC_ID`.

Create a second topic to test combined discover later:

```json
{
  "name": "Evaluation Benchmarks",
  "keywords": ["KILT", "Natural Questions", "TriviaQA", "RAG benchmark"],
  "arxiv_categories": ["cs.CL"],
  "year_from": 2020,
  "year_to": 2024
}
```

### 2.3 List Topics

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/topics
```

Returns all active (non-pruned) topics.

### 2.4 Edit a Topic

```
PATCH {{BASE_URL}}/projects/{{PROJECT_ID}}/topics/{{TOPIC_ID}}
```

```json
{
  "keywords": ["dense retrieval", "DPR", "ColBERT", "bi-encoder"],
  "year_from": 2019
}
```

Only send the fields you want to change. Verify the response shows updated values.

### 2.5 Delete (Soft-Delete) a Topic

```
DELETE {{BASE_URL}}/projects/{{PROJECT_ID}}/topics/{{TOPIC_ID}}
```

Expected: `204 No Content`

Verify: `GET .../topics` no longer includes the deleted topic (status is set to "pruned" in DB).

---

## 3. Knowledge Base Management — Edit Project Info

### 3.1 Update Project Fields

```
PATCH {{BASE_URL}}/projects/{{PROJECT_ID}}
```

```json
{
  "research_goal": "How RAG and dense retrieval improve factual grounding in LLMs",
  "initial_keywords": ["RAG", "dense retrieval", "grounding"],
  "year_to": 2025
}
```

Only send the fields you want to update. Unchanged fields are preserved.

---

## 4. Knowledge Base Management — Papers

### 4.1 Search Papers (Wizard Flow)

Used during project creation wizard. Searches using provided keywords + project's research goal vector.

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/papers/search
```

```json
{
  "keywords": ["retrieval augmented generation", "RAG"],
  "limit": 10
}
```

Returns a list of `PaperResponse` objects. Papers are saved as `status: "suggested"` in the background.

### 4.2 Discover Papers (Combined Search)

The "Find Papers" button — combines project keywords + all active topics' keywords, unions categories, uses the broadest date range.

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/papers/discover
```

```json
{
  "limit": 20
}
```

Returns only *new* papers not already linked to the project. Papers are saved with `added_by: "discovery"`.

### 4.3 List Project Papers

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/papers
```

Optional query param to filter by status:

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/papers?status=suggested
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/papers?status=accepted
```

Save a `paper_id` from the response as `PAPER_ID`.

### 4.4 Accept / Reject a Paper

```
PATCH {{BASE_URL}}/projects/{{PROJECT_ID}}/papers/{{PAPER_ID}}
```

Accept:

```json
{
  "status": "accepted"
}
```

Reject:

```json
{
  "status": "rejected"
}
```

Accepting a paper triggers background PDF indexing (chunks are embedded and stored in OpenSearch for RAG chat).

### 4.5 Remove a Paper from Project

```
DELETE {{BASE_URL}}/projects/{{PROJECT_ID}}/papers/{{PAPER_ID}}
```

Expected: `204 No Content`

This removes the paper link *and* deletes its chunks from OpenSearch. If the paper was accepted, `paper_count` is decremented.

---

## 5. Document Upload

### 5.1 Upload a PDF

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/documents
```

In Postman, use **Body → form-data**:

| Key | Type | Value |
|-----|------|-------|
| `file` | File | *(select a PDF file)* |

Returns a `DocumentResponse`. Chunks are indexed in the background.

### 5.2 List Documents

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/documents
```

Check `chunks_indexed` field — `true` means the document is ready for RAG chat.

### 5.3 Delete a Document

```
DELETE {{BASE_URL}}/projects/{{PROJECT_ID}}/documents/{{DOCUMENT_ID}}
```

Expected: `204 No Content`. Removes from MinIO + OpenSearch + Postgres.

---

## 6. Agentic RAG Chat

The chat endpoint uses a multi-step LangGraph pipeline:

```
guardrail → retrieve → grade_docs → (rewrite_query → retrieve if needed) → generate
```

- **Guardrail** rejects off-topic queries
- **Retrieve** runs hybrid BM25 + KNN search on project chunks
- **Grade docs** filters chunks by relevance
- **Rewrite query** rephrases the query if no relevant chunks found (max 1 retry)
- **Generate** streams the answer with cited sources via SSE

### 6.1 Create a Chat Session

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/chat/sessions
```

```json
{
  "title": "RAG techniques discussion"
}
```

Save `id` from the response as `SESSION_ID`. The `title` field is optional — if omitted, it auto-sets from the first message.

### 6.2 Send a Message (SSE Stream)

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/chat/sessions/{{SESSION_ID}}/messages
```

```json
{
  "content": "What are the main approaches to retrieval-augmented generation?"
}
```

**Important:** This returns a **Server-Sent Events (SSE)** stream, not a regular JSON response. In Postman, the response will appear as streamed text events.

Each SSE event has a `type` field:

| Event Type | Description |
|------------|-------------|
| `node` | Agent node execution (guardrail, retrieve, grade_docs, etc.) |
| `token` | Streamed response token |
| `sources` | Cited sources JSON array |
| `done` | Stream complete |
| `error` | Error message |

### 6.3 Test the Guardrail (Off-Topic Query)

```json
{
  "content": "What is the best recipe for chocolate cake?"
}
```

Expected: The guardrail node rejects this as off-topic and returns a polite message without running retrieval.

### 6.4 Test Query Rewriting (Vague Query)

```json
{
  "content": "How does it work?"
}
```

If no relevant chunks are found on the first retrieval, the agent rewrites the query and retries once.

### 6.5 List Chat Sessions

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/chat/sessions
```

### 6.6 List Messages in a Session

```
GET {{BASE_URL}}/projects/{{PROJECT_ID}}/chat/sessions/{{SESSION_ID}}/messages
```

Optional pagination:

```
GET .../messages?limit=20&offset=0
```

Each assistant message includes `cited_sources` — an array of objects with `paper_id`, `arxiv_id`, `title`, `chunk_text`, and `relevance_score`.

---

## 7. Hybrid Chunk Search (Direct)

Test the search endpoint directly without going through the chat pipeline.

```
POST {{BASE_URL}}/projects/{{PROJECT_ID}}/search
```

```json
{
  "query": "dense passage retrieval",
  "top_k": 5
}
```

Returns ranked chunks with `paper_id`, `arxiv_id`, `title`, `chunk_text`, and `relevance_score`.

---

## Testing Checklist

### Knowledge Base Management

- [ ] Create project with all fields
- [ ] Update project `research_goal`, `initial_keywords`, `arxiv_categories`, `year_from`, `year_to`
- [ ] Create multiple topics with different keywords/categories
- [ ] Edit a topic (change keywords, date range)
- [ ] Delete a topic and confirm it disappears from list
- [ ] Search papers (wizard flow) and confirm suggestions created
- [ ] Discover papers (combined search) and confirm new papers found
- [ ] Accept a paper and confirm `paper_count` increments
- [ ] Reject a paper
- [ ] Remove a paper and confirm `paper_count` decrements + 204 response
- [ ] Upload a PDF document
- [ ] Verify `chunks_indexed` becomes `true` after background indexing

### Agentic RAG Chat

- [ ] Create a chat session
- [ ] Send an on-topic message and receive streamed response with cited sources
- [ ] Send an off-topic message and confirm guardrail rejects it
- [ ] Send a vague query and observe query rewriting in SSE events
- [ ] List sessions and messages
- [ ] Verify `cited_sources` in message history contain paper references
