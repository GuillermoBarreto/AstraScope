import ssl

import certifi
import truststore

USER_AGENT = "AstraScope/0.5"
"""Single User-Agent for every upstream request (fetchers had drifted to 0.2-0.5)."""

_tls_context: ssl.SSLContext | None = None


def tls_context() -> ssl.SSLContext:
    """Use the native trust store where supported, with certifi as fallback.

    The context is built once and reused: every upstream fetcher used to
    construct a fresh SSLContext per request, which rebuilds the trust store
    each time.
    """
    global _tls_context
    if _tls_context is None:
        try:
            _tls_context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        except (ImportError, NotImplementedError):
            _tls_context = ssl.create_default_context(cafile=certifi.where())
    return _tls_context
