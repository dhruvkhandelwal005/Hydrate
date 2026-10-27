from __future__ import annotations
import hashlib
from typing import Any

class QueryRegistry:
    """
    Prevents duplicate search queries or identical tool calls across agent runs.
    Fingerprint: normalized query + sorted filter keys/values + tool name.
    """
    def __init__(self):
        self._registry: set[str] = set()

    def fingerprint(self, query: str, filters: dict[str, Any] | None = None, tool_name: str = "search") -> str:
        norm_query = " ".join(query.lower().split())
        filter_str = ""
        if filters:
            sorted_items = sorted((str(k), str(v)) for k, v in filters.items() if v is not None)
            filter_str = ";".join(f"{k}={v}" for k, v in sorted_items)
        raw = f"{tool_name}|{norm_query}|{filter_str}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    def register(self, query: str, filters: dict[str, Any] | None = None, tool_name: str = "search") -> bool:
        """
        Registers a search. Returns True if query is NEW.
        Returns False if query was ALREADY EXECUTED (duplicate).
        """
        fp = self.fingerprint(query, filters, tool_name)
        if fp in self._registry:
            return False
        self._registry.add(fp)
        return True

    def is_duplicate(self, query: str, filters: dict[str, Any] | None = None, tool_name: str = "search") -> bool:
        fp = self.fingerprint(query, filters, tool_name)
        return fp in self._registry
