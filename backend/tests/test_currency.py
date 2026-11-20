import ssl

import pytest
from fastapi import HTTPException

from app import currency
from app.currency import convert_minor_amount
from app.routers import localization


@pytest.mark.parametrize(
    ("amount", "target", "expected"),
    [
        (18_800, "USD", 12_596),
        (18_800, "IDR", 197_400),
    ],
)
def test_convert_jpy_minor_amount_uses_target_currency_precision(amount, target, expected):
    rates = {"JPY": 1, "USD": 0.0067, "IDR": 10.5}

    assert convert_minor_amount(amount, "JPY", target, rates) == expected


def test_convert_minor_amount_preserves_amount_when_currency_matches():
    assert convert_minor_amount(1_299, "USD", "USD", {"rates": {}}) == 1_299


def test_convert_minor_amount_rejects_unsupported_currency():
    with pytest.raises(ValueError, match="Unsupported currency"):
        convert_minor_amount(100, "JPY", "CHF", {"JPY": 1})


def test_rate_ssl_context_uses_default_strictness_without_local_opt_in(monkeypatch):
    monkeypatch.delenv("PONYO_ALLOW_NON_STRICT_FX_CERT_EXTENSIONS", raising=False)
    expected_flags = ssl.create_default_context().verify_flags

    context = currency._create_rate_ssl_context()

    assert context.verify_flags == expected_flags
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname


def test_rate_ssl_context_proxy_compatibility_keeps_ca_and_hostname_checks(monkeypatch):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.verify_flags |= ssl.VERIFY_X509_STRICT
    monkeypatch.setattr(currency.ssl, "create_default_context", lambda: context)
    monkeypatch.setenv("PONYO_ALLOW_NON_STRICT_FX_CERT_EXTENSIONS", "true")
    monkeypatch.setenv("SSL_CERT_FILE", "/etc/ssl/certs/ca-certificates.crt")

    result = currency._create_rate_ssl_context()

    assert not result.verify_flags & ssl.VERIFY_X509_STRICT
    assert result.verify_mode == ssl.CERT_REQUIRED
    assert result.check_hostname


def test_rate_ssl_context_proxy_compatibility_requires_explicit_ca_bundle(monkeypatch):
    monkeypatch.setenv("PONYO_ALLOW_NON_STRICT_FX_CERT_EXTENSIONS", "true")
    monkeypatch.delenv("SSL_CERT_FILE", raising=False)

    with pytest.raises(RuntimeError, match="requires an explicit CA bundle"):
        currency._create_rate_ssl_context()


@pytest.mark.asyncio
async def test_localization_rates_include_krw(monkeypatch):
    async def rates():
        return {"base": "JPY", "date": "2026-11-16", "rates": {"JPY": 1, "KRW": 9.5}}

    monkeypatch.setattr(localization, "get_jpy_rates", rates)

    assert await localization.exchange_rates("KRW") == {
        "data": {"base": "JPY", "date": "2026-11-16", "rates": {"JPY": 1, "KRW": 9.5}},
    }


@pytest.mark.asyncio
async def test_localization_rates_reject_currencies_not_offered_by_storefront():
    with pytest.raises(HTTPException) as exc_info:
        await localization.exchange_rates("USD")

    assert exc_info.value.status_code == 422