import ssl

import certifi
import truststore


def tls_context() -> ssl.SSLContext:
    """Use the native trust store where supported, with certifi as fallback."""
    try:
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except (ImportError, NotImplementedError):
        return ssl.create_default_context(cafile=certifi.where())
