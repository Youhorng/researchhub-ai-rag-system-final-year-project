# ResearchHub Infrastructure Guide: Complete Setup

> **A step-by-step guide to configuring the entire ResearchHub infrastructure stack.**
> 

This document details how to configure `compose.yml`, set up `.env`, and verify each component's health for a multi-user, production-ready environment. It covers **every service** in the architecture.

## Infrastructure Overview

The ResearchHub stack consists of **12 connected services**:

| Layer | Service | Purpose | Port | Original Config |
| --- | --- | --- | --- | --- |
| **Frontend** | React App | User Interface | 3000 | New Service |
| **API** | FastAPI | Core Backend & Business Logic | 8000 | `api` |
| **Data** | PostgreSQL | Relational Database | 5432 | `postgres` |
| **Search** | OpenSearch | Vector & Hybrid Search | 9200 | `opensearch` |
| **UI** | Dashboards | OpenSearch UI | 5601 | `opensearch-dashboards` |
| **Cache** | Redis | API Response Caching | 6379 | `redis` |
| **Storage** | MinIO | S3-Compatible File Storage | 9000 | `minio` |
| **AI** | Ollama | Local LLM Inference | 11434 | `ollama` |
| **Workflow** | Airflow | Data Ingestion Pipelines | 8080 | `airflow` |
| **Observability** | Langfuse | LLM Tracing Platform | 3001 | `langfuse-web` |
| **Observability** | ClickHouse | Analytics DB | 8123 | `clickhouse` |
| **Observability** | Worker | Async Trace Processor | 3030 | `langfuse-worker` |       