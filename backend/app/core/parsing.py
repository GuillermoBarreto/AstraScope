"""Shared parsing helpers for upstream API payloads."""

import math
from typing import Any


def optional_float(value: Any) -> float | None:
    """Parse a value as float, returning None for missing, invalid, or non-finite values.

    NaN/inf would break JSON serialization and silently defeat numeric filters
    (nan >= x is always False), so they are treated as invalid input.
    """
    try:
        result = float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None
    if result is not None and not math.isfinite(result):
        return None
    return result


def optional_str(value: Any) -> str | None:
    """Return ``value`` when it is a string, else None.

    Upstream string fields sometimes arrive as null or a stray scalar; passing
    those into a pydantic ``str`` field raises ValidationError (a ValueError,
    which the API layer treats as an upstream failure) and drops the entire
    feed for one malformed record. Treating them as absent keeps the record
    alive instead.
    """
    return value if isinstance(value, str) else None
