"""Tests for scripts/ledger.py, using fake Claude Code transcripts in a temp dir."""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
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
- after: W1
- status: todo

### W3: Update the docs
- kind: everyday docs
- edits_code: yes
- check: none
- after: W2
- status: todo

## Cycles

| item | cycle | agent | model | effort | check | verdict | cost | note |
|---|---|---|---|---|---|---|---|---|
"""

VALIDATOR_MD = "---\nname: validator\nmodel: sonnet\neffort: medium\ntools: Read, Grep, Glob, Bash\n---\nbody\n"


def assistant_row(msg_id, model, usage, ts="2026-11-11T12:00:00Z", effort="medium", sidechain=True):
    return json.dumps({"type": "assistant", "isSidechain": sidechain, "timestamp": ts, "perTurnEffort": effort,
                       "message": {"id": msg_id, "model": model, "usage": usage}})


def user_row(text):
    return json.dumps({"type": "user", "message": {"role": "user", "content": text}})


class LedgerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.cfg = self.root / "cfg"
        self.proj = self.root / "proj"
        (self.proj / ".claude" / "agents").mkdir(parents=True)
        (self.proj / ".claude" / "agents" / "validator.md").write_text(VALIDATOR_MD, encoding="utf-8")
        self.sessdir = self.cfg / "projects" / "-proj" / SID
        (self.sessdir / "subagents").mkdir(parents=True)
        self.env = mock.patch.dict(os.environ, {"CLAUDE_CONFIG_DIR": str(self.cfg), "CLAUDE_CODE_SESSION_ID": SID})
        self.env.start()
        self.cwd = os.getcwd()
        os.chdir(self.proj)
        (self.proj / ".harness").mkdir()
        self.task_path = self.proj / ".harness" / "TASK.md"
        self.task_path.write_text(TASK, encoding="utf-8")
        self.mtime = 1_000_000_000

    def tearDown(self):
        os.chdir(self.cwd)
        self.env.stop()
        self.tmp.cleanup()

    def add_agent(self, agent_id, agent_type, brief, usage, model="claude-sonnet-5-5", effort="medium",
                  finished=True):
        t = self.sessdir / "subagents" / f"agent-{agent_id}.jsonl"
        t.write_text(user_row(brief) + "\n" + assistant_row(f"m-{agent_id}", model, usage, effort=effort) + "\n",
                     encoding="utf-8")
        (self.sessdir / "subagents" / f"agent-{agent_id}.meta.json").write_text(
            json.dumps({"agentType": agent_type, "finished": finished}), encoding="utf-8")
        self.mtime += 10
        os.utime(t, (self.mtime, self.mtime))
        return t

    def run_cli(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            code = ledger.main(list(argv))
        return code, out.getvalue(), err.getvalue()

    def task(self):
        return parse_task(self.task_path.read_text(encoding="utf-8"))

    # ---- pricing ---------------------------------------------------------

    def test_price_usage(self):
        u = {"input_tokens": 1_000_000, "output_tokens": 1_000_000}
        self.assertAlmostEqual(ledger.price_usage(u, "opus", CONTRACT), 24.0)
        self.assertAlmostEqual(ledger.price_usage(u, "haiku", CONTRACT), 3.0)  # long-context tier (>100K prompt)
        self.assertAlmostEqual(ledger.price_usage({"input_tokens": 50_000, "output_tokens": 1_000}, "haiku", CONTRACT),
                               0.0055)
        cached = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 1_000_000,
                  "cache_creation_input_tokens": 1_000_000,
                  "cache_creation": {"ephemeral_1h_input_tokens": 400_000, "ephemeral_5m_input_tokens": 600_000}}
        self.assertAlmostEqual(ledger.price_usage(cached, "sonnet", CONTRACT), 0.10 + 1.5 + 1.6)

    def test_fast_mode_and_iterations(self):
        u = {"input_tokens": 1_000_000, "output_tokens": 0, "speed": "fast"}
        self.assertAlmostEqual(ledger.price_usage(u, "opus", CONTRACT), 8.0)
        it = {"input_tokens": 10, "output_tokens": 10, "iterations": [
            {"input_tokens": 1_000_000, "output_tokens": 0},
            {"input_tokens": 1_000_000, "output_tokens": 0, "model": "claude-sonnet-5-5"}]}
        self.assertAlmostEqual(ledger.price_usage(it, "opus", CONTRACT, "claude-opus-5-5"), 4.0 + 2.0)
        s = ledger.summarize_messages([{"model": "claude-opus-5-5", "usage": it, "effort": None}], CONTRACT)
        self.assertEqual(s["tokens"]["input"], 2_000_000)

    def test_unknown_model_is_unpriced_not_zero(self):
        self.add_agent("w1", "worker-sonnet", "Harness work item W2: x", {"input_tokens": 10, "output_tokens": 1},
                       model="claude-opus-4-8")
        self.run_cli("start", "--title", "t")
        code, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "PASS",
                                    "--validator", "none")
        data = json.loads(out)
        self.assertIsNone(data["worker"]["cost_usd"])
        self.assertTrue(any("does not price" in w for w in data["warnings"]))

    def test_dedupes_messages_by_id(self):
        t = self.sessdir / "subagents" / "agent-x.jsonl"
        u = {"input_tokens": 10, "output_tokens": 5}
        t.write_text("\n".join([assistant_row("m1", "claude-haiku-5-5", u), assistant_row("m1", "claude-haiku-5-5", u),
                                assistant_row("m2", "claude-haiku-5-5", u)]) + "\n", encoding="utf-8")
        self.assertEqual(len(ledger.read_usage(t)), 2)

    # ---- cycles ------------------------------------------------------------

    def test_cycle_logs_worker_and_validator_and_updates_task(self):
        self.run_cli("start", "--title", "rename a config key")
        self.add_agent("w1", "worker-sonnet", "Harness work item W2: Rename the key",
                       {"input_tokens": 100_000, "output_tokens": 10_000})
        self.add_agent("v1", "validator", "Harness validation W2: Rename the key",
                       {"input_tokens": 50_000, "output_tokens": 1_000})
        code, out, err = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium",
                                      "--verdict", "FAIL", "--note", "npm test failed")
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertEqual(data["worker"]["tier"], "sonnet")
        self.assertAlmostEqual(data["worker"]["cost_usd"], 0.3)
        self.assertAlmostEqual(data["validator"]["cost_usd"], 0.11)
        self.assertEqual(data["item_status"], "retry")
        self.assertEqual((data["next"]["agent"], data["next"]["effort"]), ("worker-sonnet", "high"))
        task = self.task()
        self.assertEqual((task["cycles"][0]["verdict"], task["cycles"][0]["model"], task["cycles"][0]["check"]),
                         ("FAIL", "sonnet", "yes"))
        self.assertEqual(task["items"]["W2"]["status"], "retry")

        self.add_agent("w2", "worker-sonnet", "Harness work item W2: Rename the key",
                       {"input_tokens": 1_000, "output_tokens": 100}, effort="high")
        self.add_agent("v2", "validator", "Harness validation W2: Rename the key",
                       {"input_tokens": 1_000, "output_tokens": 100})
        code, out, err = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "high",
                                      "--verdict", "PASS")
        data = json.loads(out)
        self.assertEqual((data["cycle"], data["worker"]["agent_id"], data["item_status"]), (2, "w2", "done"))

        code, out, _ = self.run_cli("summary", "--format", "json", "--no-session")
        s = json.loads(out)
        self.assertEqual(len(s["steps"]), 4)
        self.assertAlmostEqual(s["subagents_cost_usd"], round(0.3 + 0.11 + 0.003 + 0.003, 4))
        cmp_ = s["single_model_comparison"]
        self.assertEqual(cmp_["steps_compared"], 4)
        self.assertGreater(cmp_["same_tokens_on"]["fable"], cmp_["routed_usd"])
        code, md, _ = self.run_cli("summary", "--no-session")
        self.assertIn("| 1 | W2 | 1 | worker |", md)

    def test_parallel_items_are_matched_by_brief(self):
        self.run_cli("start", "--title", "x")
        # W3's run finished last, but W2 is logged first: it must still get W2's run.
        self.add_agent("a2", "worker-sonnet", "Harness work item W2: Rename", {"input_tokens": 2000, "output_tokens": 0})
        self.add_agent("a3", "worker-sonnet", "Harness work item W3: Docs", {"input_tokens": 3000, "output_tokens": 0})
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "PASS",
                                 "--validator", "none")
        self.assertEqual(json.loads(out)["worker"]["agent_id"], "a2")
        _, out, _ = self.run_cli("cycle", "--item", "W3", "--worker", "worker-sonnet", "--verdict", "PASS",
                                 "--validator", "none")
        self.assertEqual(json.loads(out)["worker"]["agent_id"], "a3")

    def test_missing_transcript_logs_nothing(self):
        self.run_cli("start", "--title", "x")
        before = self.task_path.read_text(encoding="utf-8")
        code, out, err = self.run_cli("cycle", "--item", "W1", "--worker", "worker-haiku", "--verdict", "PASS",
                                      "--validator", "none")
        self.assertEqual(code, 2)
        self.assertIn("nothing logged", err)
        self.assertEqual(self.task_path.read_text(encoding="utf-8"), before)
        self.assertEqual([r["kind"] for r in ledger.read_ledger(Path(".harness/ledger.jsonl"))], ["start"])
        # the documented fallback then works and is marked as an estimate
        code, out, _ = self.run_cli("cycle", "--item", "W1", "--worker", "worker-haiku", "--verdict", "PASS",
                                    "--validator", "none", "--worker-total-tokens", "20000")
        self.assertTrue(json.loads(out)["worker"]["estimate"])

    def test_effort_recorded_from_the_transcript(self):
        self.run_cli("start", "--title", "x")
        self.add_agent("w", "worker-sonnet", "Harness work item W2: x", {"input_tokens": 1, "output_tokens": 1},
                       effort="medium")
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "high",
                                 "--verdict", "FAIL", "--validator", "none")
        data = json.loads(out)
        self.assertEqual(data["worker"]["effort"], "medium")
        self.assertTrue(any("ran at medium" in w for w in data["warnings"]))
        self.assertEqual(self.task()["cycles"][0]["effort"], "medium")

    def test_validator_manual_tokens_are_priced_from_its_agent_file(self):
        self.run_cli("start", "--title", "x")
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "PASS",
                                 "--worker-tokens", "1000,100", "--validator-tokens", "1000000,0")
        data = json.loads(out)
        self.assertAlmostEqual(data["validator"]["cost_usd"], 2.0)

    def test_blocked_after_three_fails_blocks_dependents(self):
        self.run_cli("start", "--title", "x")
        for _ in range(3):
            self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium",
                         "--verdict", "FAIL", "--validator", "none", "--worker-tokens", "10,1")
        task = self.task()
        self.assertEqual(task["items"]["W2"]["status"], "blocked")
        self.assertEqual(task["items"]["W3"]["status"], "blocked")
        self.assertEqual(task["items"]["W3"]["blocked_by"], "W2")
        self.assertEqual(len(task["cycles"]), 3)

    def test_blocked_when_no_rung_is_left(self):
        self.task_path.write_text(TASK.replace("- kind: scoped fix", "- kind: migration"), encoding="utf-8")
        self.run_cli("start", "--title", "x")
        self.run_cli("cycle", "--item", "W2", "--worker", "worker-fable", "--effort", "medium", "--verdict", "FAIL",
                     "--validator", "none", "--worker-tokens", "10,1")
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-fable", "--effort", "high",
                                 "--verdict", "FAIL", "--validator", "none", "--worker-tokens", "10,1")
        self.assertEqual(json.loads(out)["item_status"], "blocked")

    def test_final_validation_fail_reopens_the_item(self):
        self.run_cli("start", "--title", "x")
        self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium", "--verdict", "PASS",
                     "--validator", "none", "--worker-tokens", "10,1")
        self.add_agent("vf", "validator", "Harness final validation: rename a config key",
                       {"input_tokens": 1000, "output_tokens": 10})
        code, out, err = self.run_cli("step", "--name", "final-validation", "--agent", "validator", "--role",
                                      "validator", "--item", "W2", "--verdict", "FAIL", "--note", "AC1 fails")
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertEqual(data["step"]["agent_id"], "vf")
        self.assertEqual(data["item_status"], "retry")
        self.assertEqual(data["next"]["status"], "escalate")
        task = self.task()
        self.assertEqual([c["verdict"] for c in task["cycles"]], ["PASS", "FAIL"])

    def test_stuck_twice_blocks(self):
        self.run_cli("start", "--title", "x")
        _, out, _ = self.run_cli("step", "--name", "W1 stuck", "--agent", "worker-haiku", "--item", "W1",
                                 "--verdict", "STUCK", "--tokens", "10,1")
        self.assertEqual(json.loads(out)["item_status"], "retry")
        _, out, _ = self.run_cli("step", "--name", "W1 stuck", "--agent", "worker-haiku", "--item", "W1",
                                 "--verdict", "STUCK", "--tokens", "10,1")
        data = json.loads(out)
        self.assertEqual(data["item_status"], "blocked")
        self.assertEqual(data["also_blocked"], ["W2", "W3"])

    def test_cycles_table_is_written_by_its_own_header(self):
        self.task_path.write_text(TASK.replace(
            "| item | cycle | agent | model | effort | check | verdict | cost | note |\n|---|---|---|---|---|---|---|---|---|",
            "| item | verdict | check | model | effort | note |\n|---|---|---|---|---|---|"), encoding="utf-8")
        self.run_cli("start", "--title", "x")
        self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium", "--verdict", "FAIL",
                     "--validator", "none", "--worker-tokens", "10,1", "--note", "n")
        row = self.task()["cycles"][0]
        self.assertEqual((row["verdict"], row["model"], row["note"]), ("FAIL", "sonnet", "n"))

    def test_bad_cycles_header_is_refused(self):
        self.task_path.write_text(TASK.replace("| verdict |", "| result |"), encoding="utf-8")
        self.run_cli("start", "--title", "x")
        code, _, err = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "FAIL",
                                    "--validator", "none", "--worker-tokens", "10,1")
        self.assertEqual(code, 2)
        self.assertIn("Cycles table header", err)

    # ---- tasks and the orchestrator ---------------------------------------

    def test_task_ids_are_unique_and_resume_keeps_them(self):
        _, a, _ = self.run_cli("start", "--title", "rename a config key")
        _, b, _ = self.run_cli("start", "--resume")
        self.assertEqual(json.loads(a)["task"], json.loads(b)["task"])
        self.assertTrue(json.loads(b)["resumed"])
        rows = ledger.read_ledger(Path(".harness/ledger.jsonl"))
        rows[0]["ts"] = "2026-01-01T00:00:00Z"   # pretend the first run was earlier
        Path(".harness/ledger.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
        _, c, _ = self.run_cli("start", "--title", "rename a config key")
        self.assertNotEqual(json.loads(a)["task"], json.loads(c)["task"])

    def test_orchestrator_cost_from_main_transcript(self):
        Path(".harness/ledger.jsonl").write_text(json.dumps(
            {"ts": "2026-01-01T00:00:00Z", "kind": "start", "task": "t-1", "title": "t"}) + "\n", encoding="utf-8")
        self.sessdir.with_suffix(".jsonl").write_text("\n".join([
            assistant_row("old", "claude-opus-5-5", {"input_tokens": 999_999, "output_tokens": 0},
                          ts="2000-01-01T00:00:00Z", sidechain=False),
            assistant_row("new", "claude-opus-5-5", {"input_tokens": 1000, "output_tokens": 1000},
                          ts="2026-01-01T00:00:05Z", sidechain=False),
            assistant_row("side", "claude-opus-5-5", {"input_tokens": 1000, "output_tokens": 1000},
                          ts="2026-01-01T00:00:06Z", sidechain=True),
        ]) + "\n", encoding="utf-8")
        code, out, _ = self.run_cli("summary", "--format", "json")
        s = json.loads(out)
        self.assertEqual(s["orchestrator"]["messages"], 1)
        self.assertAlmostEqual(s["orchestrator"]["cost_usd"], 0.024)
        # the first summary closed the window: later work in the session is not added
        with self.sessdir.with_suffix(".jsonl").open("a", encoding="utf-8") as fh:
            fh.write(assistant_row("later", "claude-opus-5-5", {"input_tokens": 5000, "output_tokens": 0},
                                   ts="2999-01-01T00:00:00Z", sidechain=False) + "\n")
        _, out, _ = self.run_cli("summary", "--format", "json")
        self.assertEqual(json.loads(out)["orchestrator"]["messages"], 1)

    # ---- round 2 -----------------------------------------------------------

    def test_resume_by_task_id_recorded_in_task_md(self):
        _, a, _ = self.run_cli("start", "--title", "add reset endpoint")
        tid = json.loads(a)["task"]
        self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "FAIL", "--validator", "none",
                     "--worker-tokens", "10,1")
        self.assertEqual(self.task()["task_id"], tid)          # stamped once something was logged
        self.run_cli("start", "--title", "something else entirely")
        _, b, _ = self.run_cli("start", "--resume")
        self.assertEqual(json.loads(b)["task"], tid)          # TASK.md title differs from the start title
        _, out, _ = self.run_cli("summary", "--format", "json", "--no-session")
        self.assertEqual(len(json.loads(out)["steps"]), 1)

    def test_resume_without_recorded_id_falls_back_to_latest(self):
        _, a, _ = self.run_cli("start", "--title", "x")
        _, b, _ = self.run_cli("start", "--resume")
        self.assertEqual(json.loads(a)["task"], json.loads(b)["task"])
        self.assertIn("note", json.loads(b))

    def test_unavailable_after_the_subcommand(self):
        self.run_cli("start", "--title", "x")
        self.task_path.write_text(TASK.replace("- kind: scoped fix", "- kind: migration"), encoding="utf-8")
        code, out, err = self.run_cli("cycle", "--item", "W2", "--worker", "worker-opus", "--effort", "high",
                                      "--verdict", "FAIL", "--validator", "none", "--worker-tokens", "10,1",
                                      "--unavailable", "fable")
        self.assertEqual(code, 0, err)
        self.assertEqual(json.loads(out)["next"]["agent"], "worker-opus")

    def test_final_fail_reopens_several_items_once(self):
        self.run_cli("start", "--title", "x")
        for item in ("W2", "W3"):
            self.run_cli("cycle", "--item", item, "--worker", "worker-sonnet", "--verdict", "PASS",
                         "--validator", "none", "--worker-tokens", "10,1")
        self.add_agent("vf", "validator", "Harness final validation: x", {"input_tokens": 1000, "output_tokens": 0})
        code, out, err = self.run_cli("step", "--name", "final-validation", "--agent", "validator", "--role",
                                      "validator", "--item", "W2,W3", "--verdict", "FAIL")
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertEqual(set(data["items"]), {"W2", "W3"})
        task = self.task()
        self.assertEqual([c["verdict"] for c in task["cycles"]], ["PASS", "PASS", "FAIL", "FAIL"])
        steps = [r for r in ledger.read_ledger(Path(".harness/ledger.jsonl")) if r.get("name") == "final-validation"]
        self.assertEqual(len(steps), 1)
        # the same run named again is not billed twice
        _, out, _ = self.run_cli("step", "--name", "again", "--agent", "validator", "--agent-id", "vf")
        self.assertEqual(json.loads(out)["step"]["cost_usd"], 0.0)

    def test_blocked_item_is_not_reopened(self):
        self.run_cli("start", "--title", "x")
        self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "PASS", "--validator", "none",
                     "--worker-tokens", "10,1")
        ledger.set_item_field(self.task_path, "W2", "status", "blocked")
        _, out, _ = self.run_cli("step", "--name", "final-validation", "--agent", "validator", "--item", "W2",
                                 "--verdict", "FAIL", "--tokens", "10,1")
        self.assertEqual(json.loads(out)["item_status"], "blocked")
        self.assertEqual(len(self.task()["cycles"]), 1)

    def test_marker_is_the_first_line_only(self):
        self.run_cli("start", "--title", "x")
        self.add_agent("a3", "worker-sonnet", "Harness work item W3: Docs\nContext: W2's brief began "
                       "'Harness work item W2: Rename'", {"input_tokens": 3000, "output_tokens": 0})
        self.add_agent("a2", "worker-sonnet", "Harness work item W2: Rename", {"input_tokens": 2000, "output_tokens": 0})
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "PASS",
                                 "--validator", "none")
        self.assertEqual(json.loads(out)["worker"]["agent_id"], "a2")

    def test_fallback_never_takes_another_items_run(self):
        self.run_cli("start", "--title", "x")
        self.add_agent("v3", "validator", "Harness validation W3: Docs", {"input_tokens": 1, "output_tokens": 1})
        self.add_agent("w1", "worker-haiku", "Harness work item W1: Find", {"input_tokens": 1, "output_tokens": 1},
                       model="claude-haiku-5-5")
        code, _, err = self.run_cli("cycle", "--item", "W1", "--worker", "worker-haiku", "--verdict", "PASS")
        self.assertEqual(code, 2)                      # forgot --validator none: W3's validator is not taken
        self.assertIn("nothing logged", err)

    def test_unfinished_runs_are_flagged(self):
        self.run_cli("start", "--title", "x")
        t = self.add_agent("w", "worker-sonnet", "Harness work item W2: x", {"input_tokens": 1, "output_tokens": 1})
        meta = t.with_name("agent-w.meta.json")
        meta.write_text(json.dumps({"agentType": "worker-sonnet"}), encoding="utf-8")   # no finished key yet
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "PASS",
                                 "--validator", "none")
        self.assertTrue(any("not finished" in w for w in json.loads(out)["warnings"]))

    def test_freeform_after_blocks_dependents(self):
        self.task_path.write_text(TASK.replace("- after: W2\n", "- after: W2 (needs the new key) and W1\n"),
                                  encoding="utf-8")
        self.run_cli("start", "--title", "x")
        for _ in range(3):
            self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "FAIL",
                         "--validator", "none", "--worker-tokens", "10,1")
        self.assertEqual(self.task()["items"]["W3"]["status"], "blocked")

    def test_stuck_counts_per_agent_and_writes_retry(self):
        self.run_cli("start", "--title", "x")
        _, out, _ = self.run_cli("step", "--name", "W1 stuck", "--agent", "worker-haiku", "--item", "W1",
                                 "--verdict", "STUCK", "--tokens", "10,1")
        self.assertEqual(self.task()["items"]["W1"]["status"], "retry")
        _, out, _ = self.run_cli("step", "--name", "W1 stuck", "--agent", "worker-sonnet", "--item", "W1",
                                 "--verdict", "STUCK", "--tokens", "10,1")
        self.assertEqual(json.loads(out)["item_status"], "retry")      # rerouted tier gets its own retry

    def test_cycle_next_names_the_action(self):
        self.run_cli("start", "--title", "x")
        _, out, _ = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--effort", "medium",
                                 "--verdict", "FAIL", "--validator", "none", "--worker-tokens", "10,1")
        self.assertEqual(json.loads(out)["next"]["action"], "raise_effort")

    def test_header_without_effort_is_refused(self):
        self.task_path.write_text(TASK.replace("| effort |", "| e |"), encoding="utf-8")
        self.run_cli("start", "--title", "x")
        code, _, err = self.run_cli("cycle", "--item", "W2", "--worker", "worker-sonnet", "--verdict", "FAIL",
                                    "--validator", "none", "--worker-tokens", "10,1")
        self.assertEqual(code, 2)
        self.assertIn("effort", err)

    def test_windows_close_at_own_rows_and_per_session(self):
        rows = [
            {"ts": "2026-01-01T09:00:00Z", "kind": "start", "task": "t-1", "title": "t", "session": "sA"},
            {"ts": "2026-01-01T09:10:00Z", "kind": "summary", "task": "t-1"},          # --plan ended
            {"ts": "2026-01-01T11:00:00Z", "kind": "start", "task": "t-1", "title": "t", "resume": True,
             "session": SID},
            {"ts": "2026-01-01T11:10:00Z", "kind": "step", "task": "t-1", "item": "W1", "cost_usd": 0.0},
        ]
        Path(".harness/ledger.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n", encoding="utf-8")
        other = self.cfg / "projects" / "-proj" / "sA"
        other.mkdir(parents=True)
        other.with_suffix(".jsonl").write_text(assistant_row(
            "p", "claude-opus-5-5", {"input_tokens": 1_000_000, "output_tokens": 0}, ts="2026-01-01T09:05:00Z",
            sidechain=False) + "\n", encoding="utf-8")
        self.sessdir.with_suffix(".jsonl").write_text("\n".join([
            assistant_row("u", "claude-opus-5-5", {"input_tokens": 50_000_000, "output_tokens": 0},
                          ts="2026-01-01T10:00:00Z", sidechain=False),               # unrelated, between windows
            assistant_row("r", "claude-opus-5-5", {"input_tokens": 1_000_000, "output_tokens": 0},
                          ts="2026-01-01T11:05:00Z", sidechain=False)]) + "\n", encoding="utf-8")
        _, out, _ = self.run_cli("summary", "--format", "json", "--task", "t-1")
        s = json.loads(out)
        self.assertEqual(s["orchestrator"]["messages"], 2)
        self.assertAlmostEqual(s["orchestrator"]["cost_usd"], 8.0)


if __name__ == "__main__":
    unittest.main()
