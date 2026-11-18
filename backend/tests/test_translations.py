import json
from io import BytesIO

import pytest

from app import translations
from app.config import settings


def test_libretranslate_request_includes_configured_endpoint_and_api_key(monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request, timeout))
        return BytesIO(json.dumps({"translatedText": "こんにちは"}, ensure_ascii=False).encode("utf-8"))

    monkeypatch.setattr(settings, "libretranslate_url", "http://translator.test/")
    monkeypatch.setattr(settings, "libretranslate_api_key", "test-key")
    monkeypatch.setattr(settings, "translation_timeout_seconds", 3)
    monkeypatch.setattr(translations, "urlopen", fake_urlopen)

    assert translations._translate_with_libretranslate("Hello", "ja") == "こんにちは"

    request, timeout = calls[0]
    assert request.full_url == "http://translator.test/translate"
    assert request.get_method() == "POST"
    assert request.get_header("Content-type") == "application/json"
    assert json.loads(request.data) == {
        "q": "Hello",
        "source": "auto",
        "target": "ja",
        "format": "text",
        "api_key": "test-key",
    }
    assert timeout == 3


def test_libretranslate_rejects_empty_response(monkeypatch):
    monkeypatch.setattr(translations, "urlopen", lambda *_args, **_kwargs: BytesIO(b'{"translatedText":" " }'))

    with pytest.raises(translations.TranslationUnavailableError, match="empty translation"):
        translations._translate_with_libretranslate("Hello", "ja")
