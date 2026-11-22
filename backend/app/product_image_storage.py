"""Public image storage for approved supplier product submissions."""

import logging
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx

from app.config import settings

logger = logging.getLogger(__name__)
PRODUCT_IMAGE_PREFIX = "supplier-submissions"


class ProductImageStorageError(Exception):
    pass


def _configuration() -> tuple[str, str, str]:
    if not settings.product_image_storage_configured:
        raise ProductImageStorageError("Product image storage is not configured.")
    return (
        (settings.supabase_url or "").rstrip("/"),
        settings.supabase_product_images_bucket,
        settings.supabase_service_role_key.get_secret_value(),
    )


def public_product_image_url(path: str) -> str:
    base_url, bucket, _ = _configuration()
    if not path.startswith(f"{PRODUCT_IMAGE_PREFIX}/") or ".." in path.split("/"):
        raise ProductImageStorageError("Invalid product image reference.")
    return (
        f"{base_url}/storage/v1/object/public/{quote(bucket, safe='')}/"
        f"{quote(path, safe='/')}"
    )


async def upload_product_images(submission_id: UUID, images: list[bytes]) -> list[str]:
    base_url, bucket, service_key = _configuration()
    paths = [f"{PRODUCT_IMAGE_PREFIX}/{submission_id}/{uuid4()}.jpg" for _ in images]
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    attempted: list[str] = []
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            for path, content in zip(paths, images, strict=True):
                attempted.append(path)
                response = await client.post(
                    f"{base_url}/storage/v1/object/{quote(bucket, safe='')}/{quote(path, safe='/')}",
                    headers={**headers, "Content-Type": "image/jpeg", "x-upsert": "false"},
                    content=content,
                )
                response.raise_for_status()
        except httpx.HTTPError as error:
            if attempted:
                try:
                    cleanup = await client.request(
                        "DELETE",
                        f"{base_url}/storage/v1/object/{quote(bucket, safe='')}",
                        headers={**headers, "Content-Type": "application/json"},
                        json={"prefixes": attempted},
                    )
                    cleanup.raise_for_status()
                except httpx.HTTPError as cleanup_error:
                    logger.warning("Product image cleanup failed (error_type=%s).", type(cleanup_error).__name__)
            raise ProductImageStorageError("Product image storage could not save the submission images.") from error
    return paths


async def delete_product_images(paths: list[str]) -> None:
    if not paths:
        return
    base_url, bucket, service_key = _configuration()
    if any(not path.startswith(f"{PRODUCT_IMAGE_PREFIX}/") or ".." in path.split("/") for path in paths):
        raise ProductImageStorageError("Invalid product image reference.")
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            response = await client.request(
                "DELETE",
                f"{base_url}/storage/v1/object/{quote(bucket, safe='')}",
                headers={"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"},
                json={"prefixes": paths},
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise ProductImageStorageError("Product image storage could not remove unused images.") from error
