"""Tests for scripts/route.py.  Run: python3 -m unittest discover -s .claude/skills/harness/tests"""

import json
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import route  # noqa: E402
from route import Signals, escalate, load_contract, parse_task, parse_yaml_subset, route_item  # noqa: E402

CONTRACT = load_contract()


def r(**kw):
    return route.route(Signals(**kw), CONTRACT)


class ContractParsing(unittest.TestCase):
    def test_subset_parser_matches_pyyaml(self):
        text = (HERE.parent / "routing.yaml").read_text(encoding="utf-8")
        try:
            import yaml
        except ImportError:
            self.skipTest("PyYAML not installed")
        self.assertEqual(parse_yaml_subset(text), yaml.safe_load(text))

    def test_contract_shape(self):
        c = CONTRACT
        self.assertEqual(c.default, ("opus", "medium"))
        self.assertEqual(c.ladder, ["haiku", "sonnet", "opus", "fable"])
        self.assertEqual(c.max_cycles, 3)
        self.assertEqual(c.order, ["verify", "effort", "model"])
        self.assertEqual(c.no_code_edits, {"haiku"})
        self.assertEqual(c.agent_for("sonnet"), "worker-sonnet")
        self.assertEqual(c.prices["fable"], {"input": 8.0, "output": 40.0, "cache_read": 0.2})
        self.assertEqual(c.long_context["haiku"]["threshold"], 100000)
        self.assertEqual(len(c.rules), 8)
        self.assertEqual(c.rules[6].condition, "scoped")

    def test_tier_of_model(self):
        self.assertEqual(CONTRACT.tier_of_model("claude-haiku-5-5"), "haiku")
        self.assertEqual(CONTRACT.tier_of_model("claude-fable-5-2"), "fable")
        self.assertEqual(CONTRACT.tier_of_model("claude-mythos-5-2"), "fable")
        self.assertIsNone(CONTRACT.tier_of_model("gpt-x"))

    def test_bad_rule_is_reported(self):
        with self.assertRaises(route.ContractError):
            route.contract_from_dict({"routing": {"rules": ["no arrow here"]}})

    def test_parser_handles_comments_and_quotes(self):
        data = parse_yaml_subset("a:\n  b: 'x # not a comment'  # comment\n  c: [1, two]\n  d:\n    - p -> q @ low\n")
        self.assertEqual(data, {"a": {"b": "x # not a comment", "c": [1, "two"], "d": ["p -> q @ low"]}})


class Routing(unittest.TestCase):
    def test_image_rules(self):
        cases = [
            (dict(kinds=["classify"], edits_code=False), "haiku"),
            (dict(kinds=["read logs"], edits_code=False), "haiku"),
            (dict(kinds=["scoped fix"], spec="clear", files=2, edits_code=True), "sonnet"),
            (dict(kinds=["everyday docs"], edits_code=True), "sonnet"),
            (dict(kinds=["debugging"], spec="clear", edits_code=True), "opus"),
            (dict(kinds=["multi-PR feature"], edits_code=True), "opus"),
            (dict(kinds=["migration"], edits_code=True), "fable"),
            (dict(kinds=["deep research"], edits_code=False), "fable"),
            (dict(kinds=["quant_analysis"], edits_code=False), "fable"),
        ]
        for kw, want in cases:
            with self.subTest(kw=kw):
                out = r(**kw)
                self.assertEqual(out["model"], want, out)
                self.assertEqual(out["effort"], "medium")
                self.assertEqual(out["agent"], f"worker-{want}")

    def test_default_when_unsure(self):
        out = r(edits_code=True)
        self.assertEqual((out["model"], out["effort"]), ("opus", "medium"))
        self.assertIn("default", out["rule"])

    def test_scoped_needs_a_clear_spec(self):
        self.assertEqual(r(kinds=["scoped fix"], edits_code=True)["model"], "opus")
        self.assertEqual(r(kinds=["scoped fix"], spec="open", edits_code=True)["model"], "opus")
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", edits_code=True)["model"], "sonnet")

    def test_large_assets_or_many_files_are_not_scoped(self):
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", source_tokens=150_000, edits_code=True)["model"], "opus")
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", files=12, edits_code=True)["model"], "opus")

    def test_scoped_item_without_kind_is_a_scoped_fix(self):
        out = r(spec="clear", files=1, edits_code=True)
        self.assertEqual(out["model"], "sonnet")

    def test_images_and_computer_use_go_to_opus(self):
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", images=2, edits_code=True)["model"], "opus")
        self.assertEqual(r(computer_use=True, edits_code=False)["model"], "opus")
        # images do not override a cheap rule that comes first (as in route.py's sketch)
        self.assertEqual(r(kinds=["classify"], images=3, edits_code=False)["model"], "haiku")
        # images come before the hard rules
        self.assertEqual(r(kinds=["migration"], images=1, edits_code=True)["model"], "opus")

    def test_many_repos_is_multi_pr(self):
        out = r(kinds=["scoped fix"], spec="clear", repos=2, edits_code=True)
        self.assertEqual(out["model"], "opus")
        self.assertIn("multi pr feature", out["kinds"])

    def test_logs_without_kind_read_as_logs(self):
        self.assertEqual(r(logs=1, edits_code=False)["model"], "haiku")

    def test_guard_never_edits_on_haiku(self):
        out = r(kinds=["extract"], edits_code=True)
        self.assertEqual(out["model"], "sonnet")
        self.assertTrue(any("guard" in x for x in out["reasons"]))
        # a later rule wins over the floor when one matches
        self.assertEqual(r(kinds=["read logs", "debugging"], edits_code=True)["model"], "opus")

    def test_stated_kind_beats_request_words(self):
        out = r(kinds=["search"], request="migrate the database", edits_code=False)
        self.assertEqual(out["model"], "haiku")

    def test_inferred_kinds(self):
        self.assertEqual(r(request="Recall knowledge files", edits_code=False)["model"], "haiku")
        self.assertEqual(r(request="summarize the test logs", edits_code=False)["model"], "haiku")
        self.assertEqual(r(request="migrate the counter from db.json to SQLite", edits_code=True)["model"], "fable")
        out = r(request="find and fix the crash in /hit", edits_code=True)
        self.assertEqual(out["model"], "opus")
        self.assertTrue(any("split" in w for w in out["warnings"]))

    def test_unknown_kind_warns_and_defaults(self):
        out = r(kinds=["vibes"], edits_code=False)
        self.assertEqual(out["model"], "opus")
        self.assertTrue(out["warnings"])

    def test_missing_edits_code_warns(self):
        self.assertTrue(any("edits_code" in w for w in r(kinds=["search"])["warnings"]))


class Escalation(unittest.TestCase):
    def test_order_verify_effort_model(self):
        self.assertEqual(escalate("sonnet", "medium", False, CONTRACT)["action"], "add_check")
        step = escalate("sonnet", "medium", True, CONTRACT)
        self.assertEqual((step["action"], step["model"], step["effort"]), ("raise_effort", "sonnet", "high"))
        step = escalate("sonnet", "high", True, CONTRACT)
        self.assertEqual((step["action"], step["model"], step["effort"]), ("next_model", "opus", "medium"))
        step = escalate("haiku", "low", True, CONTRACT)
        self.assertEqual(step["effort"], "medium")
        self.assertEqual(escalate("fable", "high", True, CONTRACT)["action"], "blocked")

    def test_effort_above_ceiling_moves_model(self):
        step = escalate("opus", "xhigh", True, CONTRACT)
        self.assertEqual((step["model"], step["effort"]), ("fable", "medium"))


TASK = """# Task: rename a config key

## Goal
Rename `port` to `listenPort`.

## Acceptance criteria
- AC1: server starts — check: `node -e "require('./server')"`

## Work items

### W1: Find every read of the key
- kind: search
- spec: clear
- files: 0
- edits_code: no
- check: none
- status: todo

### W2: Rename the key
- kind: scoped fix
- spec: clear
- files: server.js, config.js
- repos: 1
- edits_code: yes
- check: `npm test`
- status: todo

## Cycles

| item | cycle | agent | model | effort | verdict | cost | note |
|---|---|---|---|---|---|---|---|
| W1 | 1 | worker-haiku | haiku | medium | PASS | $0.0010 | found 3 |
| W2 | 1 | worker-sonnet | sonnet | medium | FAIL | $0.0200 | test failed |
"""


class TaskFile(unittest.TestCase):
    def setUp(self):
        self.task = parse_task(TASK)

    def test_parse(self):
        self.assertEqual(self.task["title"], "rename a config key")
        self.assertEqual(set(self.task["items"]), {"W1", "W2"})
        self.assertEqual(self.task["items"]["W2"]["kind"], "scoped fix")
        self.assertEqual(len(self.task["cycles"]), 2)
        self.assertEqual(len(self.task["acceptance"]), 1)

    def sig(self, item):
        return route.signals_from_item(self.task["items"][item])

    def test_done_item(self):
        out = route_item(self.sig("W1"), CONTRACT, self.task["cycles"])
        self.assertEqual(out["status"], "done")

    def test_escalates_after_fail(self):
        out = route_item(self.sig("W2"), CONTRACT, self.task["cycles"])
        self.assertEqual(out["status"], "escalate")
        self.assertEqual((out["model"], out["effort"], out["cycle"]), ("sonnet", "high", 2))

    def test_climbs_then_blocks(self):
        cycles = self.task["cycles"] + [
            {"item": "W2", "model": "sonnet", "effort": "high", "verdict": "FAIL"},
        ]
        out = route_item(self.sig("W2"), CONTRACT, cycles)
        self.assertEqual((out["status"], out["agent"], out["effort"]), ("escalate", "worker-opus", "medium"))
        cycles.append({"item": "W2", "model": "opus", "effort": "medium", "verdict": "FAIL"})
        self.assertEqual(route_item(self.sig("W2"), CONTRACT, cycles)["status"], "blocked")

    def test_misrouted_haiku_item_that_edits_code_is_rerouted_up(self):
        sig = self.sig("W1")
        sig.edits_code = True
        sig.has_check = True
        cycles = [{"item": "W1", "model": "haiku", "effort": "medium", "verdict": "FAIL"}]
        out = route_item(sig, CONTRACT, cycles)
        self.assertEqual(out["escalation"]["action"], "reroute")
        self.assertNotEqual(out["model"], "haiku")

    def test_no_check_means_add_check_first(self):
        sig = self.sig("W2")
        sig.has_check = False
        out = route_item(sig, CONTRACT, self.task["cycles"])
        self.assertEqual(out["escalation"]["action"], "add_check")
        self.assertEqual((out["model"], out["effort"]), ("sonnet", "medium"))


class Cli(unittest.TestCase):
    def run_cli(self, *argv):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = route.main(list(argv))
        return code, buf.getvalue()

    def test_route_from_task_file_and_assets(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            (p / "TASK.md").write_text(TASK.replace("- check: `npm test`", "- check: `npm test`\n- assets: shots"), encoding="utf-8")
            (p / "shots").mkdir()
            (p / "shots" / "a.png").write_bytes(b"\x89PNG")
            code, out = self.run_cli("route", "--task", str(p / "TASK.md"), "--item", "w2", "--root", d)
            self.assertEqual(code, 0)
            data = json.loads(out)
            # cycle 1 failed on sonnet @ medium with a check -> raise effort
            self.assertEqual(data["status"], "escalate")
            self.assertEqual(data["signals"]["images"], 1)
            self.assertEqual(data["dispatch"]["subagent_type"], data["agent"])

    def test_brief_and_kinds(self):
        code, out = self.run_cli("route", "--kind", "search", "--read-only", "--brief")
        self.assertEqual(code, 0)
        self.assertIn("worker-haiku @ medium", out)
        code, out = self.run_cli("kinds")
        self.assertIn("default: opus @ medium", out)

    def test_check_passes_on_repo(self):
        root = HERE.parents[3]
        code, out = self.run_cli("check", "--root", str(root))
        self.assertEqual(code, 0, out)


if __name__ == "__main__":
    unittest.main()
