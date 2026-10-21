"""Tests for core.http: TLS context reuse and the shared request timeout."""

import inspect

from backend.app.core import http
from backend.app.services import fireball_service, neo_service


def test_tls_context_is_built_once_and_reused() -> None:
    # Every upstream fetcher calls tls_context() per request; rebuilding the
    # trust store each time is pure overhead.
    assert http.tls_context() is http.tls_context()


def test_request_timeout_is_a_sane_positive_number() -> None:
    assert isinstance(http.REQUEST_TIMEOUT_SECONDS, (int, float))
    assert http.REQUEST_TIMEOUT_SECONDS > 0


def test_services_use_the_shared_timeout_not_a_local_copy() -> None:
    # Both fetchers drifted to their own `TIMEOUT_SECONDS = 20`; the constant
    # must live in one place so a future timeout change can't silently diverge.
    for service in (fireball_service, neo_service):
        source = inspect.getsource(service)
        assert "REQUEST_TIMEOUT_SECONDS" in source
        assert "TIMEOUT_SECONDS =" not in source
