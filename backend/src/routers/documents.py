import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from src.config import get_settings
from src.dependencies import CurrentUser, DbSession
from src.models.project import Project
from src.repositories import document_repo
from src.schemas.documents import DocumentResponse
from src.services.indexing.document_indexer import index_document_chunks
from src.services.opensearch.client import get_opensearch_client
from src.services.storage.minio_client import delete_file, get_minio_client, upload_file

logger = logging.getLogger(__name__)
settings = get_settings()

PROJECT_NOT_FOUND = "Project not found"

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/documents",
    tags=["documents"],
)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=201,
    responses={
        400: {"description": "Invalid file type or size"},
        404: {"description": PROJECT_NOT_FOUND},
    },
)
async def upload_document(
    project_id: uuid.UUID,
    file: UploadFile,
    db: DbSession,
    current_user: CurrentUser,
    background_tasks: BackgroundTasks,
):
    """Upload a PDF document to a project."""
    # Verify the project belongs to the user
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail=PROJECT_NOT_FOUND)

    # Validate file type
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    # Read file bytes
    file_bytes = await file.read()
    file_size = len(file_bytes)

    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 50 MB limit")

    # Build MinIO key: {project_id}/{document_uuid}/{original_filename}
    doc_id = uuid.uuid4()
    minio_key = f"{project_id}/{doc_id}/{file.filename}"

    # Upload to MinIO
    minio = get_minio_client()
    upload_file(minio, minio_key, file_bytes, file_size, file.content_type)

    # Save document record in Postgres
    document = document_repo.create(
        db=db,
        project_id=project_id,
        title=file.filename or "Untitled",
        original_filename=file.filename or "unknown.pdf",
        minio_bucket=settings.minio_bucket,
        minio_key=minio_key,
        file_size_bytes=file_size,
        mime_type=file.content_type,
    )
    # Override the auto-generated id with our pre-generated one so the key matches
    document.id = doc_id
    db.commit()
    db.refresh(document)

    # Increment project document count
    project.document_count += 1
    db.commit()

    # Schedule background indexing
    logger.info("Scheduling indexing for document %s (project %s)", document.id, project_id)
    background_tasks.add_task(index_document_chunks, document.id, project_id)

    return document


@router.get(
    "",
    response_model=list[DocumentResponse],
    responses={404: {"description": PROJECT_NOT_FOUND}},
)
async def list_documents(
    project_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """List all documents for a project."""
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail=PROJECT_NOT_FOUND)

    return document_repo.list_by_project(db, project_id)


@router.delete(
    "/{document_id}",
    status_code=204,
    responses={404: {"description": "Project or document not found"}},
)
async def delete_document(
    project_id: uuid.UUID,
    document_id: uuid.UUID,
    db: DbSession,
    current_user: CurrentUser,
):
    """Delete a document from MinIO, OpenSearch, and Postgres."""
    project = db.query(Project).filter_by(id=project_id, owner_id=current_user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail=PROJECT_NOT_FOUND)

    document = document_repo.get_by_id(db, document_id)
    if not document or document.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")

    # 1. Delete from MinIO
    try:
        minio = get_minio_client()
        delete_file(minio, document.minio_key)
        logger.info("Deleted %s from MinIO", document.minio_key)
    except Exception:
        logger.exception("Failed to delete %s from MinIO — continuing", document.minio_key)

    # 2. Delete chunks from OpenSearch
    chunk_index = f"{settings.opensearch.index_name}-{settings.opensearch.chunk_index_suffix}"
    try:
        os_client = get_opensearch_client()
        os_client.delete_by_query(
            index=chunk_index,
            body={"query": {"term": {"document_id": str(document_id)}}},
        )
        os_client.close()
        logger.info("Deleted chunks for document %s from OpenSearch", document_id)
    except Exception:
        logger.exception("Failed to delete chunks for document %s from OpenSearch — continuing", document_id)

    # 3. Delete from Postgres and decrement count
    document_repo.delete(db, document)
    project.document_count = max(project.document_count - 1, 0)
    db.commit()
