SUPPORTED_SHIPPING_COUNTRIES = ("JP", "KR")

_COUNTRY_ALIASES = {
    "JAPAN": "JP",
    "KOREA": "KR",
    "REPUBLIC OF KOREA": "KR",
    "SOUTH KOREA": "KR",
}


def shipping_country_code(country: str) -> str | None:
    normalized = country.strip().upper()
    if normalized in SUPPORTED_SHIPPING_COUNTRIES:
        return normalized
    alias = _COUNTRY_ALIASES.get(normalized)
    return alias if alias in SUPPORTED_SHIPPING_COUNTRIES else None
