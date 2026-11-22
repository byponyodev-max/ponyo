import json
from uuid import uuid4

import httpx
import pytest

import app.maker_application_storage as storage

pytestmark = pytest.mark.asyncio


async def test_maker_photos_upload_to_private_storage_and_get_short_lived_signed_urls(monkeypatch):
    requests = []

    async def handle_request(request):
        requests.append(request)
        if "/object/sign/" in request.url.path:
            return httpx.Response(200, json={"signedURL": "/object/sign/maker-application-photos/photo.jpg?token=short"})
        if request.method == "POST":
            return httpx.Response(200, json={"Key": "stored"})
        return httpx.Response(200, json={})

    transport = httpx.MockTransport(handle_request)
    async_client = httpx.AsyncClient
    monkeypatch.setattr(storage, "_storage_configuration", lambda: (
        "https://storage.example.test", "maker-application-photos", "service-secret",
    ))
    monkeypatch.setattr(storage.httpx, "AsyncClient", lambda **kwargs: async_client(transport=transport, **kwargs))

    paths = await storage.upload_maker_application_photos(uuid4(), [b"optimized jpeg"])
    signed_url = await storage.signed_maker_application_photo_url(paths[0])

    assert len(requests) == 2
    assert requests[0].method == "POST"
    assert requests[0].headers["Authorization"] == "Bearer service-secret"
    assert requests[0].headers["Content-Type"] == "image/jpeg"
    assert requests[0].headers["x-upsert"] == "false"
    assert paths[0].startswith("maker-applications/")
    assert signed_url == "https://storage.example.test/storage/v1/object/sign/maker-application-photos/photo.jpg?token=short"


async def test_failed_maker_photo_upload_attempts_cleanup(monkeypatch):
    requests = []

    async def handle_request(request):
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(503)
        return httpx.Response(200, json=[])

    transport = httpx.MockTransport(handle_request)
    async_client = httpx.AsyncClient
    monkeypatch.setattr(storage, "_storage_configuration", lambda: (
        "https://storage.example.test", "maker-application-photos", "service-secret",
    ))
    monkeypatch.setattr(storage.httpx, "AsyncClient", lambda **kwargs: async_client(transport=transport, **kwargs))
    application_id = uuid4()

    with pytest.raises(storage.MakerPhotoStorageError):
        await storage.upload_maker_application_photos(application_id, [b"optimized jpeg"])

    assert [request.method for request in requests] == ["POST", "DELETE"]
    assert requests[1].url.path == "/storage/v1/object/maker-application-photos"
    uploaded_path = requests[0].url.path.split("/maker-application-photos/")[1]
    assert uploaded_path.startswith(f"maker-applications/{application_id}/")
    assert json.loads(requests[1].read()) == {"prefixes": [uploaded_path]}
