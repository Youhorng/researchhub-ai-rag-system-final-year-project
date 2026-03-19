import logging
from io import BytesIO

from minio import Minio
from src.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def get_minio_client() -> Minio:
    """Return a configured MinIO client."""
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket(client: Minio) -> None:
    """Create the default bucket if it does not exist."""
    bucket = settings.minio_bucket
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("Created MinIO bucket: %s", bucket)
    else:
        logger.info("MinIO bucket already exists: %s", bucket)


def upload_file(
    client: Minio,
    key: str,
    data: bytes,
    size: int,
    content_type: str = "application/octet-stream",
) -> None:
    """Put an object into the default bucket."""
    client.put_object(
        bucket_name=settings.minio_bucket,
        object_name=key,
        data=BytesIO(data),
        length=size,
        content_type=content_type,
    )


def download_file(client: Minio, key: str) -> bytes:
    """Return bytes of an object from the default bucket."""
    response = client.get_object(settings.minio_bucket, key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_file(client: Minio, key: str) -> None:
    """Remove an object from the default bucket."""
    client.remove_object(settings.minio_bucket, key)
