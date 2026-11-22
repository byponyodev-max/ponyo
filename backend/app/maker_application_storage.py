"""Private image storage for maker applications."""

import logging
import warnings
from io import BytesIO
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

logger = logging.getLogger(__name__)

MAX_SOURCE_PHOTO_BYTES = 5 * 1024 * 1024
MAX_STORED_PHOTO_BYTES = 400_000
MAX_PHOTO_PIXELS = 24_000_000
SIGNED_URL_TTL_SECONDS = 900
PHOTO_PREFIX = "maker-applications"


class MakerPhotoStorageError(Exception):
    pass


def normalize_maker_photo(content: bytes, content_type: str) -> bytes:
    if content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("Choose a JPEG, PNG, or WebP photo.")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in {"JPEG", "PNG", "WEBP"}:
                    raise ValueError("Choose a JPEG, PNG, or WebP photo.")
                width, height = source.size
                if width < 1 or height < 1 or width * height > MAX_PHOTO_PIXELS:
                    raise ValueError("This photo is too large to process.")
                source.load()
                oriented = ImageOps.exif_transpose(source)
                if "A" in oriented.getbands() or "transparency" in oriented.info:
                    rgba = oriented.convert("RGBA")
                    image = Image.new("RGB", rgba.size, "white")
                    image.paste(rgba, mask=rgba.getchannel("A"))
                else:
                    image = oriented.convert("RGB")
    except (
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
        UnidentifiedImageError,
        OSError,
        EOFError,
        SyntaxError,
    ) as error:
        raise ValueError("This file is not a valid supported image.") from error

    for edge in (1200, 1000, 800, 640, 480):
        resized = image.copy()
        resized.thumbnail((edge, edge), Image.Resampling.LANCZOS)
        for quality in (85, 75, 65, 55, 45):
            output = BytesIO()
            resized.save(output, format="JPEG", quality=quality, optimize=True, progressive=True)
            if output.tell() <= MAX_STORED_PHOTO_BYTES:
                return output.getvalue()
    raise ValueError("This photo could not be reduced below 400 KB. Choose a smaller image.")


def _storage_configuration() -> tuple[str, str, str]:
    if not settings.maker_photo_storage_configured:
        raise MakerPhotoStorageError("Maker photo storage is not configured.")
    base_url = (settings.supabase_url or "").rstrip("/")
    bucket = settings.supabase_maker_applications_bucket
    service_key = settings.supabase_service_role_key.get_secret_value()
    return base_url, bucket, service_key


def _headers(service_key: str, content_type: str | None = None) -> dict[str, str]:
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _object_url(base_url: str, bucket: str, path: str) -> str:
    return (
        f"{base_url}/storage/v1/object/{quote(bucket, safe='')}/"
        f"{quote(path, safe='/')}"
    )


async def _cleanup_uploaded(client: httpx.AsyncClient, base_url: str, bucket: str, service_key: str, paths: list[str]) -> None:
    if not paths:
        return
    try:
        response = await client.request(
            "DELETE",
            f"{base_url}/storage/v1/object/{quote(bucket, safe='')}",
            headers=_headers(service_key, "application/json"),
            json={"prefixes": paths},
        )
        response.raise_for_status()
    except httpx.HTTPError as error:
        logger.warning("Maker photo cleanup failed (error_type=%s).", type(error).__name__)


async def upload_maker_application_photos(application_id: UUID, photos: list[bytes]) -> list[str]:
    base_url, bucket, service_key = _storage_configuration()
    paths = [f"{PHOTO_PREFIX}/{application_id}/{uuid4()}.jpg" for _ in photos]
    attempted: list[str] = []

    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            for path, content in zip(paths, photos, strict=True):
                attempted.append(path)
                response = await client.post(
                    _object_url(base_url, bucket, path),
                    headers={**_headers(service_key, "image/jpeg"), "x-upsert": "false"},
                    content=content,
                )
                response.raise_for_status()
        except httpx.HTTPError as error:
            await _cleanup_uploaded(client, base_url, bucket, service_key, attempted)
            raise MakerPhotoStorageError("Photo storage could not save the application images.") from error

    return paths


async def delete_maker_application_photos(paths: list[str]) -> None:
    if not paths:
        return
    base_url, bucket, service_key = _storage_configuration()
    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        try:
            response = await client.request(
                "DELETE",
                f"{base_url}/storage/v1/object/{quote(bucket, safe='')}",
                headers=_headers(service_key, "application/json"),
                json={"prefixes": paths},
            )
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise MakerPhotoStorageError("Photo storage could not remove an unused upload.") from error


async def signed_maker_application_photo_url(path: str) -> str:
    base_url, bucket, service_key = _storage_configuration()
    if not path.startswith(f"{PHOTO_PREFIX}/") or ".." in path.split("/"):
        raise MakerPhotoStorageError("Invalid maker photo reference.")
    url = (
        f"{base_url}/storage/v1/object/sign/{quote(bucket, safe='')}/"
        f"{quote(path, safe='/')}"
    )
    async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
        try:
            response = await client.post(
                url,
                headers=_headers(service_key, "application/json"),
                json={"expiresIn": SIGNED_URL_TTL_SECONDS},
            )
            response.raise_for_status()
            payload = response.json()
            signed_url = payload.get("signedURL") if isinstance(payload, dict) else None
        except (httpx.HTTPError, ValueError) as error:
            raise MakerPhotoStorageError("Photo storage could not create a private preview link.") from error

    if not isinstance(signed_url, str):
        raise MakerPhotoStorageError("Photo storage returned an invalid preview link.")
    if signed_url.startswith(f"{base_url}/"):
        return signed_url
    if not signed_url.startswith("/object/sign/"):
        raise MakerPhotoStorageError("Photo storage returned an invalid preview link.")
    return f"{base_url}/storage/v1{signed_url}"
