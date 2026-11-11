"""Tests for scripts/ledger.py, using fake Claude Code transcripts in a temp dir."""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import ledger  # noqa: E402
from route import load_contract, parse_task  # noqa: E402

CONTRACT = load_contract()
SID = "11111111-2222-3333-4444-555555555555"

TASK = """# Task: rename a config key

## Goal
Rename it.

## Acceptance criteria
- AC1: tests pass — check: `npm test`

## Work items

### W1: Find reads
- kind: search
- edits_code: no
- check: none
- status: todo

### W2: Rename the key
- kind: scoped fix
- spec: clear
- files: 2
- edits_code: yes
- check: `npm test`
- status: todo

## Cycles

| item | cycle | agent | model | effort | verdict | cost | note |
|---|---|---|---|---|---|---|---|
"""


def assistant_row(msg_id, model, usage, ts="2026-11-11T12:00:00Z", effort="medium", agent=None, sidechain=True):
    row = {"type": "assistant", "isSidechain": sidechain, "timestamp": ts, "perTurnEffort": effort,
           "message": {"id": msg_id, "model": model, "usage": usage}}
    if agent:
        row["attributionAgent"] = agent
    return json.dumps(row)


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cfg = self.root / "cfg"
        self.proj = self.root / "proj"
        self.proj.mkdir()
        self.sessdir = self.cfg / "projects" / "-proj" / SID
        (self.sessdir / "subagents").mkdir(parents=True)
        self.env = mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": str(self.cfg), "CLAUDE_CODE_SESSION_ID": SID})
        self.env.start()
        self.cwd = os.getcwd()
        os.chdir(self.proj)
        (self.proj / ".harness").mkdir()
        (self.proj / ".harness" / "TASK.md").write_text(TASK, encoding="utf-8")

    def tearDown(self):
        os.chdir(self.cwd)
        self.env.stop()
        self.tmp.cleanup()

    def add_agent(self, agent_id, agent_type, model, rows):
        t = self.sessdir / "subagents" / f"agent-{agent_id}.jsonl"
        t.write_text("\n".join(rows) + "\n", encoding="utf-8")
        (self.sessdir / "subagents" / f"agent-{agent_id}.meta.json").write_text(
            json.dumps({"agentType": agent_type}), encoding="utf-8")
        return t

    def run_cli(self, *argv):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = ledger.main(list(argv))
        return code, buf.getvalue()

    def test_price_usage(self):
        u = {"input_tokens": 1_000_000, "output_tokens": 1_000_000}
        self.assertAlmostEqual(ledger.price_usage(u, "opus", CONTRACT), 24.0)
        self.assertAlmostEqual(ledger.price_usage(u, "haiku", CONTRACT), 3.0)  # long-context tier (>100K prompt)
        small = {"input_tokens": 50_000, "output_tokens": 1_000}
        self.assertAlmostEqual(ledger.price_usage(small, "haiku", CONTRACT), 0.0055)
        cached = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 1_000_000,
                  "cache_creation_input_tokens": 1_000_000,
                  "cache_creation": {"ephemeral_1h_input_tokens": 400_000, "ephemeral_5m_input_tokens": 600_000}}
        # sonnet: read 0.10 + write 0.6M*2*1.25 + 0.4M*2*2.0
        self.assertAlmostEqual(ledger.price_usage(cached, "sonnet", CONTRACT), 0.10 + 1.5 + 1.6)

    def test_dedupes_messages_by_id(self):
        u = {"input_tokens": 10, "output_tokens": 5}
        t = self.add_agent("a1", "worker-haiku", "claude-haiku-5-5", [
            assistant_row("m1", "claude-haiku-5-5", u), assistant_row("m1", "claude-haiku-5-5", u),
            assistant_row("m2", "claude-haiku-5-5", u)])
        msgs = ledger.read_usage(t)
        self.assertEqual(len(msgs), 2)

    def test_cycle_logs_worker_and_validator_and_updates_task(self):
        self.run_cli("start", "--title", "rename a config key")
        self.add_agent("w1", "worker-sonnet", "claude-sonnet-5-5",
                       [assistant_row("m1", "claude-sonnet-5-5", {"input_tokens": 100_000, "output_tokens": 10_000})])
        self.add_agent("v1", "validator", "claude-sonnet-5-5",
                       [assistant_row("m2", "claude-sonnet-5-5", {"input_tokens": 50_000, "output_tokens": 1_000})])
        code, out = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium",
                                 "--verdict", "FAIL", "--note", "npm test failed")
        self.assertEqual(code, 0)
        data = json.loads(out)
        self.assertEqual(data["worker"]["tier"], "sonnet")
        self.assertAlmostEqual(data["worker"]["cost_usd"], 0.3)
        self.assertAlmostEqual(data["validator"]["cost_usd"], 0.11)
        self.assertEqual(data["item_status"], "retry")
        self.assertEqual(data["next"]["agent"], "worker-sonnet")
        self.assertEqual(data["next"]["effort"], "high")

        task = parse_task((self.proj / ".harness" / "TASK.md").read_text(encoding="utf-8"))
        self.assertEqual(task["cycles"][0]["verdict"], "FAIL")
        self.assertEqual(task["cycles"][0]["model"], "sonnet")
        self.assertEqual(task["items"]["W2"]["status"], "retry")

        # second cycle picks up only the new, unlogged transcripts
        self.add_agent("w2", "worker-sonnet", "claude-sonnet-5-5",
                       [assistant_row("m3", "claude-sonnet-5-5", {"input_tokens": 1_000, "output_tokens": 100})])
        self.add_agent("v2", "validator", "claude-sonnet-5-5",
                       [assistant_row("m4", "claude-sonnet-5-5", {"input_tokens": 1_000, "output_tokens": 100})])
        code, out = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "high",
                                 "--verdict", "PASS")
        data = json.loads(out)
        self.assertEqual(data["cycle"], 2)
        self.assertEqual(data["worker"]["agent_id"], "w2")
        self.assertEqual(data["item_status"], "done")

        code, out = self.run_cli("summary", "--format", "json", "--no-session")
        s = json.loads(out)
        self.assertEqual(len(s["steps"]), 4)
        self.assertAlmostEqual(s["subagents_cost_usd"], round(0.3 + 0.11 + 0.003 + 0.003, 4))
        self.assertTrue(s["single_model_counterfactual"]["fable"]["cost_usd"] > s["subagents_cost_usd"])
        code, md = self.run_cli("summary", "--no-session")
        self.assertIn("| 1 | W2 | 1 | worker |", md)

    def test_blocked_after_three_fails(self):
        self.run_cli("start", "--title", "x")
        for i in range(3):
            self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium",
                         "--verdict", "FAIL", "--validator", "none", "--worker-tokens", "10,1")
        task = parse_task((self.proj / ".harness" / "TASK.md").read_text(encoding="utf-8"))
        self.assertEqual(task["items"]["W2"]["status"], "blocked")
        self.assertEqual(len(task["cycles"]), 3)

    def test_orchestrator_cost_from_main_transcript(self):
        self.run_cli("start", "--title", "rename a config key")
        main = self.sessdir.with_suffix(".jsonl")
        main.write_text("\n".join([
            assistant_row("old", "claude-opus-5-5", {"input_tokens": 999_999, "output_tokens": 0},
                          ts="2000-01-01T00:00:00Z", sidechain=False),
            assistant_row("new", "claude-opus-5-5", {"input_tokens": 1000, "output_tokens": 1000},
                          ts="2999-01-01T00:00:00Z", sidechain=False),
        ]) + "\n", encoding="utf-8")
        code, out = self.run_cli("summary", "--format", "json")
        s = json.loads(out)
        self.assertIsNotNone(s["orchestrator"])
        self.assertEqual(s["orchestrator"]["messages"], 1)
        self.assertAlmostEqual(s["orchestrator"]["cost_usd"], 0.024)

    def test_missing_transcript_is_reported_not_guessed(self):
        self.run_cli("start", "--title", "x")
        code, out = self.run_cli("cycle", "--item", "W1", "--worker", "worker-haiku", "--effort", "medium",
                                 "--verdict", "PASS", "--validator", "none")
        data = json.loads(out)
        self.assertIsNone(data["worker"]["cost_usd"])
        self.assertEqual(data["worker"]["source"], "not found")


if __name__ == "__main__":
    unittest.main()
