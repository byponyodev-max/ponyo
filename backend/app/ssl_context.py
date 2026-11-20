import os
import ssl


def create_proxy_compatible_ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    allow_proxy_compatibility = os.getenv("PONYO_ALLOW_NON_STRICT_FX_CERT_EXTENSIONS", "").lower() in {"1", "true", "yes"}
    if allow_proxy_compatibility:
        if not os.getenv("SSL_CERT_FILE"):
            raise RuntimeError("FX proxy compatibility requires an explicit CA bundle.")
        context.verify_flags &= ~ssl.VERIFY_X509_STRICT
    return context
