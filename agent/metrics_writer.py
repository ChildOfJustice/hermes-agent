"""Lightweight metrics writer for token usage and MemPalace cost tracking.

Appends JSON-lines records to files under HERMES_METRICS_DIR (default
/data/metrics). Every write is fire-and-forget: any IOError is logged at
WARNING level and silently suppressed so metrics can never crash the agent.

Env vars:
  HERMES_METRICS_DIR     Override output directory (default: /data/metrics).
  HERMES_METRICS_ENABLED Set to "false" / "0" / "no" / "off" to disable all
                         writes (useful in tests or resource-constrained runs).

Public API:
  get_metrics_dir() -> Path
  chars_to_tokens_est(n: int) -> int
  append_metric(filename: str, record: dict) -> None
  write_llm_call_metric(**kwargs) -> None
"""

from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Per-file write locks — ensures concurrent turns don't interleave JSON lines.
# ---------------------------------------------------------------------------
_locks: Dict[str, threading.Lock] = {}
_locks_mu = threading.Lock()


def _get_lock(filename: str) -> threading.Lock:
    with _locks_mu:
        if filename not in _locks:
            _locks[filename] = threading.Lock()
        return _locks[filename]


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _metrics_enabled() -> bool:
    """Return False only when HERMES_METRICS_ENABLED is explicitly falsy."""
    val = os.environ.get("HERMES_METRICS_ENABLED", "true").strip().lower()
    return val not in ("false", "0", "no", "off")


def get_metrics_dir() -> Path:
    """Resolve and create the metrics output directory."""
    raw = os.environ.get("HERMES_METRICS_DIR", "/data/metrics").strip()
    path = Path(raw)
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.warning("metrics_writer: could not create metrics dir %s: %s", path, exc)
    return path


def chars_to_tokens_est(n: int) -> int:
    """Rough character-to-token estimate (4 chars ≈ 1 token).

    Consistent with estimate_messages_tokens_rough() elsewhere in the
    codebase. Not precise — use only for relative comparison, not billing.
    """
    return max(1, n // 4) if n > 0 else 0


# ---------------------------------------------------------------------------
# Core append primitive
# ---------------------------------------------------------------------------

def append_metric(filename: str, record: Dict[str, Any]) -> None:
    """Append a single JSON record to `filename` inside the metrics dir.

    Thread-safe. Silently swallows all IOErrors so a broken filesystem or
    missing /data mount can never crash the agent.

    Args:
        filename: Bare filename, e.g. "token_usage.jsonl". Must not contain
                  path separators (validated below).
        record:   Dict that will be serialized to a single JSON line.
    """
    if not _metrics_enabled():
        return
    # Reject any path traversal in the filename argument.
    if "/" in filename or "\\" in filename or ".." in filename:
        logger.warning("metrics_writer: refusing unsafe filename %r", filename)
        return
    lock = _get_lock(filename)
    try:
        path = get_metrics_dir() / filename
        line = json.dumps(record, ensure_ascii=False, default=str) + "\n"
        with lock:
            with open(path, "a", encoding="utf-8") as fh:
                fh.write(line)
    except OSError as exc:
        logger.warning("metrics_writer: failed to write %s: %s", filename, exc)
    except Exception as exc:  # noqa: BLE001
        logger.warning("metrics_writer: unexpected error writing %s: %s", filename, exc)


# ---------------------------------------------------------------------------
# Typed helper for LLM call records
# ---------------------------------------------------------------------------

def write_llm_call_metric(
    *,
    session_id: str,
    turn: int,
    model: str,
    provider: str,
    input_tokens: int,
    output_tokens: int,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
    reasoning_tokens: int = 0,
    estimated_cost_usd: Optional[float] = None,
    cost_status: str = "unknown",
    memory_context_chars: int = 0,
    tool_call_count: int = 0,
    finish_reason: str = "",
) -> None:
    """Append one LLM call record to token_usage.jsonl.

    All token fields come from CanonicalUsage (normalized by normalize_usage()
    in usage_pricing.py). memory_context_chars is the length of the prefetch
    string injected before this call — pass 0 when not applicable.
    """
    total_tokens = input_tokens + cache_read_tokens + cache_write_tokens + output_tokens
    mem_tokens_est = chars_to_tokens_est(memory_context_chars)
    record: Dict[str, Any] = {
        "type": "llm_call",
        "ts": datetime.now(timezone.utc).isoformat(),
        "session_id": session_id,
        "turn": turn,
        "model": model,
        "provider": provider,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read_tokens,
        "cache_write_tokens": cache_write_tokens,
        "reasoning_tokens": reasoning_tokens,
        "total_tokens": total_tokens,
        "estimated_cost_usd": estimated_cost_usd,
        "cost_status": cost_status,
        "memory_context_chars": memory_context_chars,
        "memory_context_tokens_est": mem_tokens_est,
        "tool_call_count": tool_call_count,
        "finish_reason": finish_reason,
    }
    append_metric("token_usage.jsonl", record)
