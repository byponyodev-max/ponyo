SUPPORTED_SHIPPING_COUNTRIES = ("JP", "KR", "US", "GB", "AU", "CA")

_COUNTRY_ALIASES = {
    "AUSTRALIA": "AU",
    "CANADA": "CA",
    "GREAT BRITAIN": "GB",
    "JAPAN": "JP",
    "KOREA": "KR",
    "REPUBLIC OF KOREA": "KR",
    "SOUTH KOREA": "KR",
    "UK": "GB",
    "UNITED KINGDOM": "GB",
    "UNITED STATES": "US",
    "UNITED STATES OF AMERICA": "US",
    "USA": "US",
}


def shipping_country_code(country: str) -> str | None:
    normalized = country.strip().upper()
    if normalized in SUPPORTED_SHIPPING_COUNTRIES:
        return normalized
    return _COUNTRY_ALIASES.get(normalized)
