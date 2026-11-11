"""Tests for scripts/route.py.  Run: python3 -m unittest discover -s .claude/skills/harness/tests"""

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import route  # noqa: E402
from route import Signals, escalate, load_contract, parse_task, parse_yaml_subset, route_item  # noqa: E402

CONTRACT = load_contract()
REPO_ROOT = HERE.parents[3]


def r(contract=None, **kw):
    return route.route(Signals(**kw), contract or CONTRACT)


def fresh(**changes):
    c = load_contract()
    for k, v in changes.items():
        setattr(c, k, v)
    return c


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
        self.assertEqual(c.fast_multiplier, 2)
        self.assertEqual(len(c.rules), 8)
        self.assertEqual(c.rules[6].condition, "scoped")

    def test_tier_of_model_is_exact(self):
        self.assertEqual(CONTRACT.tier_of_model("claude-haiku-5-5"), "haiku")
        self.assertEqual(CONTRACT.tier_of_model("claude-opus-5-5-20260101"), "opus")
        self.assertEqual(CONTRACT.tier_of_model("us.anthropic.claude-sonnet-5-5-v1:0"), "sonnet")
        self.assertEqual(CONTRACT.tier_of_model("claude-opus-5-5[1m]"), "opus")
        self.assertEqual(CONTRACT.tier_of_model("claude-mythos-5-2"), "fable")
        self.assertIsNone(CONTRACT.tier_of_model("claude-opus-4-8"))   # older model, other prices
        self.assertIsNone(CONTRACT.tier_of_model("claude-haiku-4-5"))
        self.assertEqual(CONTRACT.tier_of_model("sonnet"), "sonnet")

    def test_bad_rule_and_condition_are_reported(self):
        with self.assertRaises(route.ContractError):
            route.contract_from_dict({"routing": {"rules": ["no arrow here"]}})
        with self.assertRaises(route.ContractError):
            route.contract_from_dict({"routing": {"rules": ["search -> haiku @ low if large"]}})
        c = route.contract_from_dict({"routing": {"rules": ["search -> haiku @ low if Scoped"]}})
        self.assertEqual(c.rules[0].condition, "scoped")

    def test_number_fields(self):
        c = route.contract_from_dict({"routing": {"prices": {"opus": "$4 / $20 / $0.20"}}})
        self.assertEqual(c.prices["opus"]["output"], 20.0)
        with self.assertRaises(route.ContractError):
            route.contract_from_dict({"routing": {"prices": {"opus": "four / 20"}}})
        with self.assertRaises(route.ContractError):
            route.contract_from_dict({"routing": {"escalation": {"max_cycles": "three"}}})

    def test_empty_keywords_are_empty(self):
        c = route.contract_from_dict({"routing": {"rules": ["tag -> haiku"], "keywords": {"tag": None}}})
        self.assertEqual(c.keywords["tag"], [])
        self.assertEqual(route.infer_kinds("none of these", c), [])

    def test_parser_handles_comments_quotes_and_apostrophes(self):
        data = parse_yaml_subset("a:\n  b: 'x # not a comment'  # comment\n  c: [1, two]\n"
                                 "  d:\n    - p -> q @ low\n  e: why doesn't it # trailing\n")
        self.assertEqual(data, {"a": {"b": "x # not a comment", "c": [1, "two"], "d": ["p -> q @ low"],
                                      "e": "why doesn't it"}})


class FieldParsing(unittest.TestCase):
    def test_truthy_reads_the_first_word(self):
        self.assertTrue(route._truthy("yes (moves code)"))
        self.assertTrue(route._truthy("Yes."))
        self.assertFalse(route._truthy("no - read only"))
        self.assertIsNone(route._truthy("maybe"))

    def test_count(self):
        self.assertEqual(route._count("3"), 3)
        self.assertEqual(route._count("~3 files"), 3)
        self.assertEqual(route._count("1.js, 2.js, 3.js"), 3)
        self.assertEqual(route._count("404.html, a.js"), 2)
        self.assertIsNone(route._count("many"))
        self.assertEqual(route._count("none"), 0)

    def test_has_check(self):
        self.assertTrue(route.has_check("`npm test`"))
        for v in ("none", "TBD", "?", "todo", "(none yet)", "", None):
            self.assertFalse(route.has_check(v), v)


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

    def test_kind_unsure_goes_straight_to_default(self):
        out = r(kinds=["unsure"], title="Find where visits are counted", spec="clear", files=1, edits_code=False)
        self.assertEqual(out["model"], "opus")
        self.assertIn("default", out["rule"])

    def test_unknown_stated_kind_is_unsure(self):
        out = r(kinds=["vibes"], spec="clear", edits_code=False)
        self.assertEqual(out["model"], "opus")
        self.assertTrue(out["warnings"])

    def test_scoped_needs_a_clear_spec(self):
        self.assertEqual(r(kinds=["scoped fix"], edits_code=True)["model"], "opus")
        self.assertEqual(r(kinds=["scoped fix"], spec="open", edits_code=True)["model"], "opus")
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", edits_code=True)["model"], "sonnet")

    def test_large_assets_or_many_files_are_not_scoped(self):
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", source_tokens=150_000, edits_code=True)["model"], "opus")
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", files=12, edits_code=True)["model"], "opus")

    def test_scoped_item_without_kind_is_a_scoped_fix(self):
        self.assertEqual(r(spec="clear", files=1, edits_code=True)["model"], "sonnet")

    def test_images_and_computer_use_go_to_opus(self):
        self.assertEqual(r(kinds=["scoped fix"], spec="clear", images=2, edits_code=True)["model"], "opus")
        self.assertEqual(r(computer_use=True, edits_code=False)["model"], "opus")
        self.assertEqual(r(kinds=["classify"], images=3, edits_code=False)["model"], "haiku")
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

    def test_guard_fails_closed_when_edits_code_is_missing(self):
        out = r(kinds=["search"])
        self.assertEqual(out["model"], "sonnet")
        self.assertTrue(any("edits_code" in w for w in out["warnings"]))
        self.assertEqual(r(request="Extract the counter logic into a helper module")["model"], "sonnet")

    def test_stated_compound_kinds_never_route_below_the_hardest(self):
        out = r(kinds=["search", "debugging"], edits_code=False)
        self.assertEqual(out["model"], "opus")
        self.assertTrue(any("one kind per item" in w for w in out["warnings"]))
        self.assertEqual(r(kinds=["read logs", "debugging"], edits_code=True)["model"], "opus")

    def test_stated_kind_beats_request_words(self):
        self.assertEqual(r(kinds=["search"], request="migrate the database", edits_code=False)["model"], "haiku")

    def test_inferred_kinds(self):
        self.assertEqual(r(request="Recall knowledge files", edits_code=False)["model"], "haiku")
        self.assertEqual(r(request="summarize the test logs", edits_code=False)["model"], "haiku")
        self.assertEqual(r(request="migrate the counter from db.json to SQLite", edits_code=True)["model"], "fable")
        out = r(request="find and fix the crash in /hit", edits_code=True)
        self.assertEqual(out["model"], "opus")
        self.assertTrue(any("split" in w for w in out["warnings"]))

    def test_port_is_not_a_migration(self):
        self.assertEqual(r(request="change the port to 8080", spec="clear", files=1, edits_code=True)["model"], "sonnet")

    def test_unavailable_tiers(self):
        out = r(fresh(unavailable={"fable"}), kinds=["migration"], edits_code=True)
        self.assertEqual((out["model"], out["effort"]), ("opus", "high"))
        out = r(fresh(unavailable={"sonnet"}), kinds=["scoped fix"], spec="clear", edits_code=True)
        self.assertEqual(out["model"], "opus")
        out = r(fresh(unavailable={"haiku"}), kinds=["search"], edits_code=False)
        self.assertEqual(out["model"], "sonnet")
        out = r(fresh(unavailable={"sonnet", "opus", "fable"}), kinds=["scoped fix"], spec="clear", edits_code=True)
        self.assertIn("blocked", out)


class Escalation(unittest.TestCase):
    def test_order_verify_effort_model(self):
        self.assertEqual(escalate("sonnet", "medium", False, CONTRACT)["action"], "add_check")
        step = escalate("sonnet", "medium", True, CONTRACT)
        self.assertEqual((step["action"], step["model"], step["effort"]), ("raise_effort", "sonnet", "high"))
        step = escalate("sonnet", "high", True, CONTRACT)
        self.assertEqual((step["action"], step["model"], step["effort"]), ("next_model", "opus", "medium"))
        self.assertEqual(escalate("haiku", "low", True, CONTRACT)["effort"], "medium")
        self.assertEqual(escalate("fable", "high", True, CONTRACT)["action"], "blocked")

    def test_effort_above_ceiling_moves_model(self):
        step = escalate("opus", "xhigh", True, CONTRACT)
        self.assertEqual((step["model"], step["effort"]), ("fable", "medium"))

    def test_skips_unavailable_tiers(self):
        step = escalate("sonnet", "high", True, fresh(unavailable={"opus"}))
        self.assertEqual(step["model"], "fable")


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

| item | cycle | agent | model | effort | check | verdict | cost | note |
|---|---|---|---|---|---|---|---|---|
| W1 | 1 | worker-haiku | haiku | medium | no | PASS | $0.0010 | found 3 |
| W2 | 1 | worker-sonnet | sonnet | medium | yes | FAIL | $0.0200 | test failed |
"""


class TaskFile(unittest.TestCase):
    def setUp(self):
        self.task = parse_task(TASK)

    def sig(self, item):
        return route.signals_from_item(self.task["items"][item])

    def test_parse(self):
        self.assertEqual(self.task["title"], "rename a config key")
        self.assertEqual(set(self.task["items"]), {"W1", "W2"})
        self.assertEqual(self.task["items"]["W2"]["kind"], "scoped fix")
        self.assertEqual(len(self.task["cycles"]), 2)
        self.assertEqual(self.task["cycles_header"][5], "check")
        self.assertEqual(len(self.task["acceptance"]), 1)

    def test_crlf_and_w10(self):
        text = TASK.replace("### W2:", "### W10:").replace("| W2 |", "| W10 |").replace("\n", "\r\n")
        task = parse_task(text)
        self.assertIn("W10", task["items"])
        self.assertEqual(route_item(route.signals_from_item(task["items"]["W10"]), CONTRACT, task["cycles"])["status"],
                         "escalate")
        self.assertEqual(route_item(route.signals_from_item(task["items"]["W1"]), CONTRACT, task["cycles"])["status"],
                         "done")

    def test_done_item(self):
        self.assertEqual(route_item(self.sig("W1"), CONTRACT, self.task["cycles"])["status"], "done")

    def test_pass_then_fail_reopens(self):
        cycles = self.task["cycles"] + [{"item": "W1", "model": "haiku", "effort": "medium", "check": "no",
                                         "verdict": "FAIL"}]
        out = route_item(self.sig("W1"), CONTRACT, cycles)
        self.assertEqual(out["status"], "escalate")

    def test_escalates_after_fail(self):
        out = route_item(self.sig("W2"), CONTRACT, self.task["cycles"])
        self.assertEqual(out["status"], "escalate")
        self.assertEqual((out["model"], out["effort"], out["cycle"]), ("sonnet", "high", 2))

    def test_climbs_then_blocks(self):
        cycles = self.task["cycles"] + [{"item": "W2", "model": "sonnet", "effort": "high", "check": "yes",
                                         "verdict": "FAIL"}]
        out = route_item(self.sig("W2"), CONTRACT, cycles)
        self.assertEqual((out["status"], out["agent"], out["effort"]), ("escalate", "worker-opus", "medium"))
        cycles.append({"item": "W2", "model": "opus", "effort": "medium", "check": "yes", "verdict": "FAIL"})
        self.assertEqual(route_item(self.sig("W2"), CONTRACT, cycles)["status"], "blocked")

    def test_add_check_rung_comes_from_the_failed_cycle(self):
        cycles = [{"item": "W2", "model": "sonnet", "effort": "medium", "check": "no", "verdict": "FAIL"}]
        out = route_item(self.sig("W2"), CONTRACT, cycles)   # the item has a check *now*
        self.assertEqual(out["escalation"]["action"], "add_check")
        self.assertEqual((out["model"], out["effort"]), ("sonnet", "medium"))
        self.assertIn("now has a check", out["next"])
        sig = self.sig("W2")
        sig.has_check = False
        self.assertIn("write a `check:`", route_item(sig, CONTRACT, cycles)["next"])

    def test_misrouted_haiku_item_that_edits_code_is_rerouted_up(self):
        sig = self.sig("W1")
        sig.edits_code = True
        cycles = [{"item": "W1", "model": "haiku", "effort": "medium", "check": "yes", "verdict": "FAIL"}]
        out = route_item(sig, CONTRACT, cycles)
        self.assertEqual(out["escalation"]["action"], "reroute")
        self.assertNotEqual(out["model"], "haiku")

    def test_user_override_climbs_one_rung(self):
        sig = self.sig("W2")
        sig.kinds = ["migration"]          # routes to fable...
        sig.user_override = True           # ...but the user put it on sonnet
        cycles = [{"item": "W2", "model": "sonnet", "effort": "high", "check": "yes", "verdict": "FAIL"}]
        out = route_item(sig, CONTRACT, cycles)
        self.assertEqual(out["model"], "opus")

    def test_fable_at_high_blocks_before_max_cycles(self):
        sig = self.sig("W2")
        sig.kinds = ["migration"]
        cycles = [{"item": "W2", "model": "fable", "effort": "medium", "check": "yes", "verdict": "FAIL"},
                  {"item": "W2", "model": "fable", "effort": "high", "check": "yes", "verdict": "FAIL"}]
        self.assertEqual(route_item(sig, CONTRACT, cycles)["status"], "blocked")


class Assets(unittest.TestCase):
    def test_logs_by_extension_or_log_dir_only(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            (p / "logs").mkdir()
            (p / "logs" / "run.txt").write_text("x")
            (p / "src").mkdir()
            (p / "src" / "log.js").write_text("x")
            (p / "app.log.1").write_text("x")
            (p / "shot.png").write_bytes(b"\x89PNG")
            a = route.inspect_assets([d])
            self.assertEqual((a.logs, a.images, a.files), (2, 1, 4))
            self.assertEqual(route.inspect_assets(["src"], p).logs, 0)
            self.assertEqual(route.inspect_assets(["nope"], p).missing, ["nope"])


class Cli(unittest.TestCase):
    def run_cli(self, *argv):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = route.main(list(argv))
        return code, buf.getvalue()

    def test_route_from_task_file_and_assets(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            (p / "TASK.md").write_text(TASK.replace("- check: `npm test`", "- check: `npm test`\n- assets: shots"),
                                       encoding="utf-8")
            (p / "shots").mkdir()
            (p / "shots" / "a.png").write_bytes(b"\x89PNG")
            code, out = self.run_cli("route", "--task", str(p / "TASK.md"), "--item", "w2", "--root", d)
            self.assertEqual(code, 0)
            data = json.loads(out)
            self.assertEqual(data["status"], "escalate")
            self.assertEqual(data["signals"]["images"], 1)
            self.assertEqual(data["dispatch"]["subagent_type"], data["agent"])

    def test_brief_kinds_unavailable(self):
        code, out = self.run_cli("route", "--kind", "search", "--read-only", "--brief")
        self.assertIn("worker-haiku @ medium", out)
        code, out = self.run_cli("kinds")
        self.assertIn("default: opus @ medium", out)
        code, out = self.run_cli("--unavailable", "fable", "route", "--kind", "migration", "--edits-code", "--brief")
        self.assertIn("worker-opus @ high", out)

    def test_check_passes_on_repo(self):
        code, out = self.run_cli("check", "--root", str(REPO_ROOT))
        self.assertEqual(code, 0, out)

    def test_check_flags_nesting_and_edit_tools(self):
        with tempfile.TemporaryDirectory() as d:
            agents = Path(d) / ".claude" / "agents"
            agents.mkdir(parents=True)
            for f in (REPO_ROOT / ".claude" / "agents").glob("*.md"):
                (agents / f.name).write_text(f.read_text())
            (agents / "worker-haiku.md").write_text("---\nname: worker-haiku\nmodel: haiku\n"
                                                    "disallowedTools: Edit\n---\nbody\n")
            code, out = self.run_cli("check", "--root", d)
            self.assertEqual(code, 1)
            self.assertIn("Write is available", out)
            self.assertIn("Agent is available", out)


class RoundTwo(unittest.TestCase):
    def test_blocked_status_is_respected(self):
        sig = Signals(item="W3", kinds=["everyday docs"], edits_code=True, status="blocked", blocked_by="W2")
        out = route_item(sig, CONTRACT, [])
        self.assertEqual(out["status"], "blocked")
        self.assertIn("W2", out["next"])

    def test_compound_with_an_unscoped_kind_counts_as_default(self):
        out = r(kinds=["search", "scoped fix"], spec="open", edits_code=False)
        self.assertEqual(out["model"], "opus")
        self.assertTrue(any("one kind per item" in w for w in out["warnings"]))

    def test_extra_unknown_kind_does_not_lower_the_route(self):
        self.assertEqual(r(kinds=["search", "vibes"], edits_code=False)["model"], "opus")

    def test_has_check_placeholder_variants(self):
        for v in ("none.", "None.", "none - validator reads it", "no check", "validator reads server.js",
                  "(judgement: the validator reads server.js)"):
            self.assertFalse(route.has_check(v), v)
        for v in ("`node --test`", "npm test", "./run-checks.sh", "grep -n x a.js"):
            self.assertTrue(route.has_check(v), v)

    def test_logs_folder_as_the_asset(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)
            (p / "logs").mkdir()
            (p / "logs" / "run.txt").write_text("x")
            (p / "logs" / "out.json").write_text("{}")
            self.assertEqual(route.inspect_assets(["logs"], p).logs, 2)
            self.assertEqual(route.inspect_assets(["logs/run.txt"], p).logs, 1)

    def test_deps_of(self):
        known = {"W1", "W2", "W3"}
        self.assertEqual(route.deps_of("W1 and W3", known), {"W1", "W3"})
        self.assertEqual(route.deps_of("[W1]", known), {"W1"})
        self.assertEqual(route.deps_of("none", known), set())

    def test_unavailable_after_the_subcommand(self):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = route.main(["route", "--kind", "migration", "--edits-code", "--brief", "--unavailable", "fable"])
        self.assertEqual(code, 0)
        self.assertIn("worker-opus @ high", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
