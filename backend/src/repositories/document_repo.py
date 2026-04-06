import uuid

from sqlalchemy.orm import Session
from src.models.document import Document


def create(
    db: Session,
    project_id: uuid.UUID,
    title: str,
    original_filename: str,
    minio_bucket: str,
    minio_key: str,
    file_size_bytes: int,
    mime_type: str,
    id: uuid.UUID | None = None,
) -> Document:
    doc = Document(
        id=id or uuid.uuid4(),
        project_id=project_id,
        title=title,
        original_filename=original_filename,
        minio_bucket=minio_bucket,
        minio_key=minio_key,
        file_size_bytes=file_size_bytes,
        mime_type=mime_type,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def get_by_id(db: Session, document_id: uuid.UUID) -> Document | None:
    return db.query(Document).filter(Document.id == document_id).first()


def list_by_project(db: Session, project_id: uuid.UUID) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )


def delete(db: Session, document: Document) -> None:
    db.delete(document)
    db.commit()
