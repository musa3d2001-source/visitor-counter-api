#!/usr/bin/env python3
"""Ledger for the harness skill: model, effort, tokens and cost per step.

Token counts come from the subagent transcripts Claude Code writes under
~/.claude/projects/<project>/<session>/subagents/, so the cost is measured,
not guessed. Prices come from the routing contract.

Subcommands
  start    open a task: create .harness/, record the start time
  cycle    record one worker cycle (worker + validator) with its verdict;
           appends the row to TASK.md's Cycles table and updates the item
  step     record any other step (e.g. the final validation pass)
  summary  per-step table, totals per model, cost per finished task

Ledger rows are JSON lines in .harness/ledger.jsonl.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from route import (  # noqa: E402
    Contract, ContractError, Signals, load_contract, parse_task, route_item, signals_from_item,
)

HARNESS_DIR = Path(".harness")
TASK_FILE = HARNESS_DIR / "TASK.md"
LEDGER_FILE = HARNESS_DIR / "ledger.jsonl"
CYCLES_HEADER = "| item | cycle | agent | model | effort | verdict | cost | note |\n|---|---|---|---|---|---|---|---|"


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_ts(value: str | None):
    if not value:
        return None
    try:
        return dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def slugify(text: str) -> str:
    words = re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).split()[:8]
    return "-".join(words)[:48].strip("-") or "task"


# --------------------------------------------------------------------------
# Transcripts
# --------------------------------------------------------------------------

def projects_dir() -> Path:
    base = os.environ.get("CLAUDE_CONFIG_DIR")
    return (Path(base) if base else Path.home() / ".claude") / "projects"


def project_slug(cwd: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]", "-", str(cwd.resolve()))


def session_dirs() -> list:
    root = projects_dir()
    sid = os.environ.get("CLAUDE_CODE_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID")
    if sid:
        found = [p for p in root.glob(f"*/{sid}") if p.is_dir()]
        if found:
            return found
    proj = root / project_slug(Path.cwd())
    dirs = [p for p in proj.glob("*") if p.is_dir()]
    return sorted(dirs, key=lambda p: p.stat().st_mtime, reverse=True)


def main_transcripts() -> list:
    return [d.with_suffix(".jsonl") for d in session_dirs() if d.with_suffix(".jsonl").exists()]


def agent_type_of(transcript: Path) -> str:
    meta = transcript.with_name(transcript.name.replace(".jsonl", ".meta.json"))
    if meta.exists():
        try:
            return json.loads(meta.read_text(encoding="utf-8")).get("agentType") or ""
        except (OSError, ValueError):
            pass
    try:
        with transcript.open(encoding="utf-8") as fh:
            for line in fh:
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                if row.get("attributionAgent"):
                    return row["attributionAgent"]
    except OSError:
        pass
    return ""


def agent_id_of(transcript: Path) -> str:
    m = re.match(r"agent-(.+)\.jsonl$", transcript.name)
    return m.group(1) if m else transcript.stem


def find_transcript(agent_type: str, exclude_ids: set) -> Path | None:
    """Newest subagent transcript of this type that the ledger has not logged yet."""
    candidates = []
    for d in session_dirs():
        for t in (d / "subagents").glob("agent-*.jsonl"):
            if agent_id_of(t) in exclude_ids:
                continue
            if agent_type_of(t) == agent_type:
                candidates.append(t)
    if not candidates:
        return None
    return max(candidates, key=lambda p: p.stat().st_mtime)


def read_usage(transcript: Path, since=None, until=None, main_only: bool = False) -> list:
    """One entry per API message (deduplicated by message id; last copy wins)."""
    by_id, order = {}, []
    with transcript.open(encoding="utf-8") as fh:
        for line in fh:
            try:
                row = json.loads(line)
            except ValueError:
                continue
            msg = row.get("message")
            if not isinstance(msg, dict) or not isinstance(msg.get("usage"), dict):
                continue
            if main_only and row.get("isSidechain"):
                continue
            model = msg.get("model") or ""
            if not model or model.startswith("<"):
                continue
            ts = parse_ts(row.get("timestamp"))
            if since and ts and ts < since:
                continue
            if until and ts and ts > until:
                continue
            mid = msg.get("id") or row.get("requestId") or row.get("uuid")
            if mid not in by_id:
                order.append(mid)
            by_id[mid] = {"model": model, "usage": msg["usage"],
                          "effort": row.get("perTurnEffort") or row.get("effort")}
    return [by_id[m] for m in order]


def price_usage(usage: dict, tier: str | None, contract: Contract) -> float | None:
    if not tier or tier not in contract.prices:
        return None
    u = usage
    inp = int(u.get("input_tokens") or 0)
    out = int(u.get("output_tokens") or 0)
    cr = int(u.get("cache_read_input_tokens") or 0)
    cw = int(u.get("cache_creation_input_tokens") or 0)
    detail = u.get("cache_creation") if isinstance(u.get("cache_creation"), dict) else {}
    cw1h = int(detail.get("ephemeral_1h_input_tokens") or 0)
    cw5m = max(cw - cw1h, 0)
    p = contract.prices[tier]
    lc = contract.long_context.get(tier)
    if lc and inp + cw + cr > lc["threshold"]:
        p = lc
    return (inp * p["input"] + cw5m * p["input"] * 1.25 + cw1h * p["input"] * 2.0
            + cr * p["cache_read"] + out * p["output"]) / 1e6


def summarize_messages(messages: list, contract: Contract, price_as: str | None = None) -> dict:
    tot = Counter()
    cost = 0.0
    unpriced = 0
    models, efforts = Counter(), Counter()
    cost_as = {tier: 0.0 for tier in contract.ladder}
    for m in messages:
        u = m["usage"]
        tot["input"] += int(u.get("input_tokens") or 0)
        tot["output"] += int(u.get("output_tokens") or 0)
        tot["cache_read"] += int(u.get("cache_read_input_tokens") or 0)
        tot["cache_write"] += int(u.get("cache_creation_input_tokens") or 0)
        models[m["model"]] += 1
        if m.get("effort"):
            efforts[m["effort"]] += 1
        c = price_usage(u, price_as or contract.tier_of_model(m["model"]), contract)
        if c is None:
            unpriced += 1
        else:
            cost += c
        for tier in cost_as:  # same message priced on each tier (per message, so long-context tiers apply right)
            cost_as[tier] += price_usage(u, tier, contract) or 0.0
    return {
        "model": models.most_common(1)[0][0] if models else None,
        "effort": efforts.most_common(1)[0][0] if efforts else None,
        "tokens": dict(tot),
        "messages": len(messages),
        "cost_usd": round(cost, 6),
        "cost_as": {t: round(v, 6) for t, v in cost_as.items()},
        "unpriced_messages": unpriced,
    }


# --------------------------------------------------------------------------
# Ledger file and TASK.md
# --------------------------------------------------------------------------

def read_ledger(path: Path) -> list:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows


def append_ledger(path: Path, row: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, sort_keys=False) + "\n")


def current_task_slug(ledger: list, task_file: Path) -> str:
    for row in reversed(ledger):
        if row.get("kind") == "start":
            return row["task"]
    if task_file.exists():
        return slugify(parse_task(task_file.read_text(encoding="utf-8"))["title"])
    return "task"


def append_cycle_row(task_file: Path, cells: list) -> None:
    text = task_file.read_text(encoding="utf-8")
    row = "| " + " | ".join(str(c).replace("|", "/").replace("\n", " ") for c in cells) + " |"
    lines = text.splitlines()
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s+cycles\s*$", l.strip(), re.I)), None)
    if start is None:
        text = text.rstrip("\n") + "\n\n## Cycles\n\n" + CYCLES_HEADER + "\n" + row + "\n"
        task_file.write_text(text, encoding="utf-8")
        return
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    table_idx = [i for i in range(start + 1, end) if lines[i].strip().startswith("|")]
    if not table_idx:
        insert = [""] + CYCLES_HEADER.splitlines() + [row]
        lines[start + 1:start + 1] = insert
    else:
        lines.insert(table_idx[-1] + 1, row)
    task_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def set_item_field(task_file: Path, item_id: str, key: str, value: str) -> bool:
    lines = task_file.read_text(encoding="utf-8").splitlines()
    inside = False
    head_re = re.compile(r"^###\s+" + re.escape(item_id) + r"\b", re.I)
    for i, line in enumerate(lines):
        if line.startswith("### ") or line.startswith("## "):
            if inside:
                at = i
                while at > 0 and not lines[at - 1].strip():
                    at -= 1
                lines.insert(at, f"- {key}: {value}")
                task_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
                return True
            inside = bool(head_re.match(line))
            continue
        if inside and re.match(r"^\s*[-*]\s*" + re.escape(key) + r"\s*:", line, re.I):
            lines[i] = re.sub(r":.*$", f": {value}", line, count=1)
            task_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
            return True
    if inside:
        lines.append(f"- {key}: {value}")
        task_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return True
    return False


def measure(agent: str, explicit: str | None, manual: str | None, total: int | None,
            effort: str | None, contract: Contract, logged_ids: set) -> dict:
    """Tokens and cost for one subagent run."""
    tier_hint = next((t for t, a in contract.agents.items() if a == agent), None)
    if agent == contract.validator[0]:
        tier_hint = None
    if manual:
        m = re.match(r"^\s*(\d+)\s*[,/ ]\s*(\d+)\s*$", manual)
        if not m:
            raise SystemExit("--tokens wants IN,OUT (e.g. 12000,800)")
        usage = {"input_tokens": int(m.group(1)), "output_tokens": int(m.group(2))}
        cost = price_usage(usage, tier_hint, contract)
        return {"agent_id": None, "source": "manual", "model": tier_hint, "tier": tier_hint, "effort": effort,
                "tokens": {"input": usage["input_tokens"], "output": usage["output_tokens"], "cache_read": 0, "cache_write": 0},
                "cost_usd": round(cost, 6) if cost is not None else None,
                "cost_as": {t: round(price_usage(usage, t, contract) or 0.0, 6) for t in contract.ladder}}
    path = Path(explicit) if explicit else find_transcript(agent, logged_ids)
    if path and path.exists():
        s = summarize_messages(read_usage(path), contract)
        tier = contract.tier_of_model(s["model"] or "") or tier_hint
        return {"agent_id": agent_id_of(path), "source": f"transcript:{path}", "model": s["model"], "tier": tier,
                "effort": effort or s["effort"], "tokens": s["tokens"], "cost_usd": s["cost_usd"],
                "cost_as": s["cost_as"], "messages": s["messages"]}
    if total:
        p = contract.prices.get(tier_hint or "", {})
        est = total * p.get("input", 0) / 1e6 if p else None
        return {"agent_id": None, "source": "total_tokens (rough: all priced as input)", "model": tier_hint,
                "tier": tier_hint, "effort": effort, "tokens": {"total": total},
                "cost_usd": round(est, 6) if est is not None else None, "estimate": True}
    return {"agent_id": None, "source": "not found", "model": tier_hint, "tier": tier_hint, "effort": effort,
            "tokens": {}, "cost_usd": None}


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------

def cmd_start(args, contract):
    ledger_path = Path(args.ledger)
    slug = slugify(args.title)
    row = {"ts": now_iso(), "kind": "start", "task": slug, "title": args.title}
    append_ledger(ledger_path, row)
    task_file = Path(args.task_file)
    print(json.dumps({"task": slug, "ledger": str(ledger_path), "task_file": str(task_file),
                      "task_file_exists": task_file.exists()}, indent=2))
    return 0


def cmd_cycle(args, contract):
    task_file, ledger_path = Path(args.task_file), Path(args.ledger)
    if not task_file.exists():
        raise SystemExit(f"ledger.py: {task_file} not found; write TASK.md first")
    task = parse_task(task_file.read_text(encoding="utf-8"))
    item_id = args.item.upper()
    if item_id not in task["items"]:
        raise SystemExit(f"ledger.py: item {item_id} not in {task_file} (have: {', '.join(task['items'])})")
    ledger = read_ledger(ledger_path)
    slug = current_task_slug(ledger, task_file)
    logged = {r.get("agent_id") for r in ledger if r.get("agent_id")}
    rows_for_item = [c for c in task["cycles"] if c.get("item") == item_id]
    cycle_no = len(rows_for_item) + 1
    verdict = args.verdict.upper()

    worker = measure(args.worker, args.worker_transcript, args.worker_tokens, args.worker_total_tokens,
                     args.effort, contract, logged)
    if worker.get("agent_id"):
        logged.add(worker["agent_id"])
    kind = task["items"][item_id].get("kind") or None
    base = {"ts": now_iso(), "task": slug, "item": item_id, "kind_of_item": kind, "cycle": cycle_no}
    wrow = {**base, "kind": "step", "role": "worker", "agent": args.worker, **worker, "verdict": verdict}
    append_ledger(ledger_path, wrow)
    total = worker["cost_usd"] or 0.0
    out = {"item": item_id, "cycle": cycle_no, "verdict": verdict, "worker": wrow}

    if args.validator and args.validator.lower() != "none":
        val = measure(args.validator, args.validator_transcript, args.validator_tokens, None,
                      args.validator_effort or contract.validator[1], contract, logged)
        vrow = {**base, "kind": "step", "role": "validator", "agent": args.validator, **val, "verdict": verdict}
        append_ledger(ledger_path, vrow)
        total += val["cost_usd"] or 0.0
        out["validator"] = vrow

    tier = worker.get("tier") or next((t for t, a in contract.agents.items() if a == args.worker), "?")
    append_cycle_row(task_file, [item_id, cycle_no, args.worker, tier, args.effort or worker.get("effort") or "?",
                                 verdict, f"${total:.4f}", args.note or ""])
    failed = sum(1 for c in rows_for_item if str(c.get("verdict", "")).upper() == "FAIL") + (verdict == "FAIL")
    if verdict == "PASS":
        status = "done"
    elif failed >= contract.max_cycles:
        status = "blocked"
    else:
        status = "retry"
    set_item_field(task_file, item_id, "status", status)
    out["item_status"] = status
    out["cycle_cost_usd"] = round(total, 6)

    if verdict == "FAIL":
        task = parse_task(task_file.read_text(encoding="utf-8"))
        nxt = route_item(signals_from_item(task["items"][item_id]), contract, task["cycles"])
        out["next"] = {k: nxt.get(k) for k in ("status", "agent", "effort", "rule", "next")}
    print(json.dumps(out, indent=2))
    return 0


def cmd_step(args, contract):
    ledger_path = Path(args.ledger)
    ledger = read_ledger(ledger_path)
    slug = current_task_slug(ledger, Path(args.task_file))
    logged = {r.get("agent_id") for r in ledger if r.get("agent_id")}
    m = measure(args.agent, args.transcript, args.tokens, args.total_tokens, args.effort, contract, logged)
    row = {"ts": now_iso(), "task": slug, "item": (args.item or "").upper() or None, "cycle": None,
           "kind": "step", "role": args.role, "name": args.name, "agent": args.agent, **m,
           "verdict": (args.verdict or "").upper() or None}
    append_ledger(ledger_path, row)
    print(json.dumps(row, indent=2))
    return 0


def _fmt_tokens(t: dict) -> str:
    if not t:
        return "?"
    if "total" in t:
        return f"{t['total']:,} total"
    return f"{t.get('input', 0) + t.get('cache_read', 0) + t.get('cache_write', 0):,} in / {t.get('output', 0):,} out"


def _counterfactual(rows: list, contract: Contract) -> dict:
    """Same messages priced on each single tier (price only, not a measurement)."""
    out = {}
    for tier in contract.ladder:
        cost, ok = 0.0, True
        for r in rows:
            per = r.get("cost_as") or {}
            if tier in per:
                cost += per[tier]
            else:
                ok = False
        out[tier] = {"cost_usd": round(cost, 4), "complete": ok}
    return out


def cmd_summary(args, contract):
    ledger_path, task_file = Path(args.ledger), Path(args.task_file)
    ledger = read_ledger(ledger_path)
    slug = args.task or current_task_slug(ledger, task_file)
    starts = [r for r in ledger if r.get("kind") == "start"]
    rows = [r for r in ledger if r.get("kind") == "step" and (args.all or r.get("task") == slug)]

    session = None
    if not args.all and not args.no_session:
        start = next((parse_ts(r["ts"]) for r in reversed(starts) if r["task"] == slug), None)
        later = [parse_ts(r["ts"]) for r in starts if parse_ts(r["ts"]) and start and parse_ts(r["ts"]) > start]
        until = min(later) if later else None
        if start:
            msgs = []
            for t in main_transcripts():
                msgs += read_usage(t, since=start, until=until, main_only=True)
            if msgs:
                session = summarize_messages(msgs, contract)

    items, task_status = {}, {}
    if task_file.exists() and not args.all:
        task = parse_task(task_file.read_text(encoding="utf-8"))
        items = task["items"]
        task_status = Counter((i.get("status") or "todo").lower() for i in items.values())

    by_tier = defaultdict(lambda: {"steps": 0, "cost_usd": 0.0})
    for r in rows:
        key = r.get("tier") or "?"
        by_tier[key]["steps"] += 1
        by_tier[key]["cost_usd"] += r.get("cost_usd") or 0.0
    routed = sum(r.get("cost_usd") or 0.0 for r in rows)
    total = routed + (session["cost_usd"] if session else 0.0)
    unknown = sum(1 for r in rows if r.get("cost_usd") is None)
    estimated = sum(1 for r in rows if r.get("estimate"))
    result = {
        "task": "all" if args.all else slug,
        "steps": rows,
        "by_model": {k: {"steps": v["steps"], "cost_usd": round(v["cost_usd"], 4)} for k, v in by_tier.items()},
        "subagents_cost_usd": round(routed, 4),
        "orchestrator": session,
        "total_cost_usd": round(total, 4),
        "items": dict(task_status),
        "steps_without_cost": unknown,
        "steps_estimated": estimated,
        "single_model_counterfactual": _counterfactual(rows, contract),
    }
    if args.format == "json":
        print(json.dumps(result, indent=2))
        return 0

    print(f"## Ledger - {result['task']}\n")
    print("| # | item | cycle | role | agent | model | effort | verdict | tokens | cost |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for n, r in enumerate(rows, 1):
        cost = "?" if r.get("cost_usd") is None else f"${r['cost_usd']:.4f}" + ("~" if r.get("estimate") else "")
        print(f"| {n} | {r.get('item') or r.get('name') or '-'} | {r.get('cycle') or '-'} | {r.get('role')} | "
              f"{r.get('agent')} | {r.get('model') or '?'} | {r.get('effort') or '?'} | {r.get('verdict') or '-'} | "
              f"{_fmt_tokens(r.get('tokens'))} | {cost} |")
    print()
    for tier, v in sorted(result["by_model"].items(), key=lambda kv: -kv[1]["cost_usd"]):
        print(f"- {tier}: {v['steps']} step(s), ${v['cost_usd']:.4f}")
    if session:
        print(f"- orchestrator (this session, {session['model']}): {session['messages']} request(s), "
              f"${session['cost_usd']:.4f}")
    print(f"\n**Total: ${result['total_cost_usd']:.4f}**", end="")
    if task_status:
        print(f" - items: " + ", ".join(f"{n} {s}" for s, n in sorted(task_status.items())), end="")
    print()
    if unknown or estimated:
        print(f"\n_{unknown} step(s) without a measured cost, {estimated} estimated from total tokens._")
    cf = result["single_model_counterfactual"]
    print("\nSame subagent tokens priced on one model (price only - another model would use different tokens):")
    print("  " + "  ".join(f"{t} ${v['cost_usd']:.4f}" for t, v in cf.items()) + f"  | routed ${routed:.4f}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--contract", help="routing contract (default: routing.yaml next to the skill)")
    ap.add_argument("--ledger", default=str(LEDGER_FILE))
    ap.add_argument("--task-file", default=str(TASK_FILE))
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("start", help="open a task")
    s.add_argument("--title", required=True)

    c = sub.add_parser("cycle", help="record one worker cycle and its verdict")
    c.add_argument("--item", required=True)
    c.add_argument("--worker", required=True, help="subagent type, e.g. worker-sonnet")
    c.add_argument("--effort", help="effort the worker ran at")
    c.add_argument("--verdict", required=True, choices=["PASS", "FAIL", "pass", "fail"])
    c.add_argument("--validator", help="validator subagent type, or 'none' when you checked it yourself "
                                       "(default: the contract's validator)")
    c.add_argument("--validator-effort")
    c.add_argument("--note", help="one line: what failed, or what passed")
    c.add_argument("--worker-transcript")
    c.add_argument("--validator-transcript")
    c.add_argument("--worker-tokens", help="IN,OUT when no transcript is available")
    c.add_argument("--validator-tokens", help="IN,OUT when no transcript is available")
    c.add_argument("--worker-total-tokens", type=int, help="total tokens from the Agent result (rough)")

    st = sub.add_parser("step", help="record another step")
    st.add_argument("--name", required=True)
    st.add_argument("--agent", required=True)
    st.add_argument("--role", default="worker")
    st.add_argument("--item")
    st.add_argument("--effort")
    st.add_argument("--verdict")
    st.add_argument("--transcript")
    st.add_argument("--tokens", help="IN,OUT when no transcript is available")
    st.add_argument("--total-tokens", type=int)

    sm = sub.add_parser("summary", help="per-step table and totals")
    sm.add_argument("--task", help="task slug (default: the current task)")
    sm.add_argument("--all", action="store_true", help="every task in the ledger")
    sm.add_argument("--format", choices=["md", "json"], default="md")
    sm.add_argument("--no-session", action="store_true", help="leave out the orchestrator's own cost")

    args = ap.parse_args(argv)
    try:
        contract = load_contract(args.contract)
    except (OSError, ContractError) as exc:
        print(f"ledger.py: cannot load contract: {exc}", file=sys.stderr)
        return 2
    if args.cmd == "cycle" and args.validator is None:
        args.validator = contract.validator[0]
    return {"start": cmd_start, "cycle": cmd_cycle, "step": cmd_step, "summary": cmd_summary}[args.cmd](args, contract)


if __name__ == "__main__":
    sys.exit(main())
