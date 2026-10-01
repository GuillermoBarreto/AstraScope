"""Shared parsing helpers for upstream API payloads."""

from typing import Any


def optional_float(value: Any) -> float | None:
    """Parse a value as float, returning None for missing or invalid values."""
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None
