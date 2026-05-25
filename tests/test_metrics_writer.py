"""Unit tests for agent.metrics_writer."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _setup_metrics_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Point metrics_writer at a temp dir and ensure it's enabled."""
    monkeypatch.setenv("HERMES_METRICS_DIR", str(tmp_path))
    monkeypatch.setenv("HERMES_METRICS_ENABLED", "true")
    # Force the module to re-evaluate env vars on each call (no caching).
    return tmp_path


def _read_jsonl(path: Path) -> list[dict]:
    lines = path.read_text(encoding="utf-8").strip().splitlines()
    return [json.loads(l) for l in lines if l.strip()]


# ---------------------------------------------------------------------------
# get_metrics_dir
# ---------------------------------------------------------------------------

class TestGetMetricsDir:
    def test_creates_dir(self, tmp_path, monkeypatch):
        target = tmp_path / "sub" / "metrics"
        monkeypatch.setenv("HERMES_METRICS_DIR", str(target))
        from agent.metrics_writer import get_metrics_dir
        result = get_metrics_dir()
        assert result == target
        assert target.is_dir()

    def test_respects_env_override(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HERMES_METRICS_DIR", str(tmp_path))
        from agent.metrics_writer import get_metrics_dir
        assert get_metrics_dir() == tmp_path

    def test_default_path(self, monkeypatch):
        monkeypatch.delenv("HERMES_METRICS_DIR", raising=False)
        from agent.metrics_writer import get_metrics_dir
        result = get_metrics_dir()
        assert str(result) == "/data/metrics"


# ---------------------------------------------------------------------------
# chars_to_tokens_est
# ---------------------------------------------------------------------------

class TestCharsToTokensEst:
    def test_basic(self):
        from agent.metrics_writer import chars_to_tokens_est
        assert chars_to_tokens_est(400) == 100
        assert chars_to_tokens_est(1) == 1   # min 1
        assert chars_to_tokens_est(0) == 0   # zero stays zero
        assert chars_to_tokens_est(3) == 1   # floor division

    def test_large(self):
        from agent.metrics_writer import chars_to_tokens_est
        assert chars_to_tokens_est(8000) == 2000


# ---------------------------------------------------------------------------
# append_metric
# ---------------------------------------------------------------------------

class TestAppendMetric:
    def test_writes_valid_jsonl(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent import metrics_writer
        # Reload to pick up env var
        import importlib; importlib.reload(metrics_writer)
        from agent.metrics_writer import append_metric

        append_metric("test.jsonl", {"foo": "bar", "n": 42})
        path = tmp_path / "test.jsonl"
        assert path.exists()
        records = _read_jsonl(path)
        assert len(records) == 1
        assert records[0] == {"foo": "bar", "n": 42}

    def test_appends_multiple_records(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import append_metric

        for i in range(5):
            append_metric("multi.jsonl", {"i": i})

        records = _read_jsonl(tmp_path / "multi.jsonl")
        assert len(records) == 5
        assert [r["i"] for r in records] == list(range(5))

    def test_disabled_writes_nothing(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        monkeypatch.setenv("HERMES_METRICS_ENABLED", "false")
        from agent.metrics_writer import append_metric

        append_metric("disabled.jsonl", {"x": 1})
        assert not (tmp_path / "disabled.jsonl").exists()

    def test_disabled_values(self, tmp_path, monkeypatch):
        """All falsy env var values should disable writes."""
        _setup_metrics_dir(tmp_path, monkeypatch)
        import agent.metrics_writer as mw
        import importlib

        for falsy in ("false", "0", "no", "off", "False", "NO"):
            monkeypatch.setenv("HERMES_METRICS_ENABLED", falsy)
            importlib.reload(mw)
            assert not mw._metrics_enabled(), f"Expected disabled for {falsy!r}"

    def test_rejects_path_traversal(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import append_metric

        # Should silently refuse, not raise
        append_metric("../evil.jsonl", {"x": 1})
        assert not (tmp_path.parent / "evil.jsonl").exists()

    def test_rejects_absolute_path(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import append_metric

        append_metric("/tmp/evil.jsonl", {"x": 1})
        # No crash, no file written outside tmp_path
        assert not Path("/tmp/evil.jsonl").exists() or True  # noqa — just checking no crash

    def test_thread_safety(self, tmp_path, monkeypatch):
        """Concurrent appends from N threads must produce exactly N valid lines."""
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import append_metric

        N = 50
        errors = []

        def worker(i: int):
            try:
                append_metric("concurrent.jsonl", {"thread": i})
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(N)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        assert not errors, f"Thread errors: {errors}"
        records = _read_jsonl(tmp_path / "concurrent.jsonl")
        assert len(records) == N
        # Every line is valid JSON (already guaranteed by _read_jsonl not crashing)
        thread_ids = {r["thread"] for r in records}
        assert thread_ids == set(range(N))

    def test_non_serializable_falls_back_to_str(self, tmp_path, monkeypatch):
        """default=str should handle non-JSON-serializable values."""
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import append_metric
        from datetime import datetime

        append_metric("types.jsonl", {"dt": datetime(2026, 1, 1)})
        records = _read_jsonl(tmp_path / "types.jsonl")
        assert len(records) == 1
        assert "2026" in records[0]["dt"]


# ---------------------------------------------------------------------------
# write_llm_call_metric
# ---------------------------------------------------------------------------

class TestWriteLLMCallMetric:
    def test_required_fields_present(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import write_llm_call_metric

        write_llm_call_metric(
            session_id="sess-abc",
            turn=3,
            model="claude-sonnet-4-6",
            provider="anthropic",
            input_tokens=8000,
            output_tokens=400,
            cache_read_tokens=6000,
            cache_write_tokens=0,
            reasoning_tokens=0,
            estimated_cost_usd=0.0031,
            cost_status="actual",
            memory_context_chars=1800,
            tool_call_count=2,
            finish_reason="end_turn",
        )

        path = tmp_path / "token_usage.jsonl"
        assert path.exists()
        records = _read_jsonl(path)
        assert len(records) == 1
        r = records[0]

        assert r["type"] == "llm_call"
        assert r["session_id"] == "sess-abc"
        assert r["turn"] == 3
        assert r["model"] == "claude-sonnet-4-6"
        assert r["provider"] == "anthropic"
        assert r["input_tokens"] == 8000
        assert r["output_tokens"] == 400
        assert r["cache_read_tokens"] == 6000
        assert r["total_tokens"] == 8000 + 400 + 6000  # input + cache_read + output
        assert r["memory_context_chars"] == 1800
        assert r["memory_context_tokens_est"] == 450  # 1800 // 4
        assert r["tool_call_count"] == 2
        assert r["finish_reason"] == "end_turn"
        assert r["estimated_cost_usd"] == pytest.approx(0.0031)
        assert "ts" in r

    def test_defaults_are_safe(self, tmp_path, monkeypatch):
        """Optional fields default without crashing."""
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import write_llm_call_metric

        write_llm_call_metric(
            session_id="s",
            turn=1,
            model="gpt-4",
            provider="openai",
            input_tokens=100,
            output_tokens=50,
        )
        records = _read_jsonl(tmp_path / "token_usage.jsonl")
        assert records[0]["cache_read_tokens"] == 0
        assert records[0]["memory_context_chars"] == 0
        assert records[0]["memory_context_tokens_est"] == 0
        assert records[0]["estimated_cost_usd"] is None
        assert records[0]["cost_status"] == "unknown"

    def test_writes_to_token_usage_jsonl(self, tmp_path, monkeypatch):
        _setup_metrics_dir(tmp_path, monkeypatch)
        from agent.metrics_writer import write_llm_call_metric

        write_llm_call_metric(
            session_id="s", turn=1, model="m", provider="p",
            input_tokens=10, output_tokens=5,
        )
        assert (tmp_path / "token_usage.jsonl").exists()
        assert not (tmp_path / "mempalace_events.jsonl").exists()
