import ssl

import certifi
import truststore

USER_AGENT = "AstraScope/0.5"
"""Single User-Agent for every upstream request (fetchers had drifted to 0.2-0.5)."""


def tls_context() -> ssl.SSLContext:
    """Use the native trust store where supported, with certifi as fallback."""
    try:
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except (ImportError, NotImplementedError):
        return ssl.create_default_context(cafile=certifi.where())
