#!/usr/bin/env python3
"""Ledger for the harness skill: model, effort, tokens and cost per step.

Token counts come from the transcripts Claude Code writes for each subagent
(~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl), so cost is
measured, not guessed. Each run is matched to its work item by the first line
of its brief ("Harness work item W2: ..." / "Harness validation W2: ..." /
"Harness final validation: ..."). Prices come from the routing contract.

Subcommands
  start    open a task (or --resume the current one): records the start time
  cycle    record one worker cycle (worker + validator) and its verdict;
           appends the row to TASK.md's Cycles table and updates the item
  step     record any other step: a STUCK reply, the final validation (a FAIL
           with --item reopens that item), or anything else
  summary  per-step table, totals per model, orchestrator cost, total

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

sys.dont_write_bytecode = True  # keep the skill folder free of __pycache__
sys.path.insert(0, str(Path(__file__).resolve().parent))
from route import (  # noqa: E402
    Contract, ContractError, agent_tier, deps_of, has_check, load_contract, parse_task,
    parse_unavailable, route_item, signals_from_item,
)

HARNESS_DIR = Path(".harness")
TASK_FILE = HARNESS_DIR / "TASK.md"
LEDGER_FILE = HARNESS_DIR / "ledger.jsonl"
CYCLE_COLUMNS = ["item", "cycle", "agent", "model", "effort", "check", "verdict", "cost", "note"]
REQUIRED_COLUMNS = {"item", "model", "effort", "check", "verdict"}
MAX_STUCK = 2          # STUCK replies from the same agent on one item before it is blocked
HARNESS_LINE = re.compile(r"^\s*(?:\*\*)?Harness (?:(work item|validation) ([A-Za-z]*\d+[A-Za-z0-9]*)\b|(final validation))",
                          re.I)


class LedgerError(Exception):
    pass


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso(t: dt.datetime) -> str:
    return t.isoformat().replace("+00:00", "Z")


def parse_ts(value):
    if not value:
        return None
    try:
        t = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


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


def current_session_id() -> str | None:
    return os.environ.get("CLAUDE_CODE_SESSION_ID") or os.environ.get("CLAUDE_SESSION_ID")


def session_dirs(sid: str | None = None) -> list:
    root = projects_dir()
    sid = sid or current_session_id()
    if sid:
        found = [p for p in root.glob(f"*/{sid}") if p.is_dir()]
        if found:
            return found
    proj = root / project_slug(Path.cwd())
    dirs = [p for p in proj.glob("*") if p.is_dir()]
    return sorted(dirs, key=lambda p: p.stat().st_mtime, reverse=True)


def main_transcripts(sid: str | None = None) -> list:
    return [d.with_suffix(".jsonl") for d in session_dirs(sid) if d.with_suffix(".jsonl").exists()]


def _meta(transcript: Path) -> dict:
    meta = transcript.with_name(transcript.name.replace(".jsonl", ".meta.json"))
    if meta.exists():
        try:
            return json.loads(meta.read_text(encoding="utf-8")) or {}
        except (OSError, ValueError):
            pass
    return {}


def _rows(transcript: Path, limit: int | None = None):
    try:
        with transcript.open(encoding="utf-8") as fh:
            for n, line in enumerate(fh):
                if limit is not None and n >= limit:
                    return
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def agent_type_of(transcript: Path) -> str:
    t = _meta(transcript).get("agentType")
    if t:
        return t
    for row in _rows(transcript, 50):
        if row.get("attributionAgent"):
            return row["attributionAgent"]
    return ""


def first_user_text(transcript: Path) -> str:
    for row in _rows(transcript, 60):
        if row.get("type") != "user" or row.get("isMeta"):
            continue
        msg = row.get("message") or {}
        content = msg.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            texts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
            if texts:
                return "\n".join(texts)
    return ""


def first_line(transcript: Path) -> str:
    return next((l for l in first_user_text(transcript).splitlines() if l.strip()), "")


def agent_id_of(transcript: Path) -> str:
    m = re.match(r"agent-(.+)\.jsonl$", transcript.name)
    return m.group(1) if m else transcript.stem


def transcript_by_id(agent_id: str) -> Path | None:
    for d in session_dirs():
        p = d / "subagents" / f"agent-{agent_id}.jsonl"
        if p.exists():
            return p
    hits = list(projects_dir().glob(f"*/*/subagents/agent-{agent_id}.jsonl"))
    return hits[0] if hits else None


def find_transcript(agent_type: str, exclude_ids: set, marker: str | None = None):
    """(path, warnings): the unlogged run of this agent type whose brief
    carries the marker; else the newest unlogged run of that type."""
    warnings = []
    cands = []
    for d in session_dirs():
        for t in (d / "subagents").glob("agent-*.jsonl"):
            if agent_id_of(t) not in exclude_ids and agent_type_of(t) == agent_type:
                cands.append(t)
    if not cands:
        return None, warnings
    def finished(t):
        meta = _meta(t)
        return not meta or meta.get("finished") is True   # Claude Code writes finished: true at the end

    if marker:
        rx = re.compile(r"^\s*(?:\*\*)?" + marker, re.I)
        matched = [t for t in cands if rx.match(first_line(t))]
        if matched:
            pool = [t for t in matched if finished(t)] or matched
            pick = min(pool, key=lambda p: p.stat().st_mtime)
            if len(matched) > 1:
                warnings.append(f"{len(matched)} unlogged {agent_type} runs match this item; logged the oldest "
                                f"({agent_id_of(pick)}) - log the others with their own command")
            if not finished(pick):
                warnings.append(f"{agent_type} run {agent_id_of(pick)} has not finished; its cost is partial")
            return pick, warnings
        # No run names this item. Never take a run whose brief names another item.
        cands = [t for t in cands if not HARNESS_LINE.match(first_line(t))]
        if not cands:
            return None, warnings
        warnings.append(f"no unlogged {agent_type} run starts with the brief line for this item; used the newest "
                        f"unlabelled {agent_type} run - start each brief with the line SKILL.md gives")
    return max(cands, key=lambda p: p.stat().st_mtime), warnings


def read_usage(transcript: Path, since=None, until=None, main_only: bool = False) -> list:
    """One entry per API message (deduplicated by message id; last copy wins)."""
    by_id, order = {}, []
    for row in _rows(transcript):
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


# --------------------------------------------------------------------------
# Pricing
# --------------------------------------------------------------------------

def _parts(usage: dict, model: str):
    """Billable parts of one message: its iterations when there are several
    (compaction, fallbacks - the top-level counts cover only the last one),
    else the message itself."""
    its = usage.get("iterations")
    if isinstance(its, list) and len(its) > 1 and all(isinstance(i, dict) for i in its):
        return [(i, i.get("model") or model) for i in its]
    return [(usage, model)]


def _tokens(u: dict) -> dict:
    return {"input": int(u.get("input_tokens") or 0), "output": int(u.get("output_tokens") or 0),
            "cache_read": int(u.get("cache_read_input_tokens") or 0),
            "cache_write": int(u.get("cache_creation_input_tokens") or 0)}


def _price_part(u: dict, tier: str | None, contract: Contract):
    if not tier or tier not in contract.prices:
        return None
    t = _tokens(u)
    detail = u.get("cache_creation") if isinstance(u.get("cache_creation"), dict) else {}
    cw1h = min(int(detail.get("ephemeral_1h_input_tokens") or 0), t["cache_write"])
    cw5m = t["cache_write"] - cw1h
    p = contract.prices[tier]
    lc = contract.long_context.get(tier)
    if lc and t["input"] + t["cache_write"] + t["cache_read"] > lc["threshold"]:
        p = lc
    return (t["input"] * p["input"] + cw5m * p["input"] * 1.25 + cw1h * p["input"] * 2.0
            + t["cache_read"] * p["cache_read"] + t["output"] * p["output"]) / 1e6


def price_usage(usage: dict, tier: str | None, contract: Contract, model: str = "", as_tier: bool = False):
    """Cost of one message. With as_tier, every part is priced on `tier`
    (for the single-model comparison); otherwise each part on its own model."""
    total = 0.0
    for part, part_model in _parts(usage, model):
        t = tier if as_tier or not part_model or part_model == model else contract.tier_of_model(part_model)
        c = _price_part(part, t, contract)
        if c is None:
            return None
        total += c
    if str(usage.get("speed") or "").lower() == "fast":
        total *= contract.fast_multiplier
    return total


def summarize_messages(messages: list, contract: Contract) -> dict:
    tot = Counter()
    cost, unpriced, fast, searches = 0.0, 0, 0, 0
    models, efforts = Counter(), Counter()
    cost_as = {tier: 0.0 for tier in contract.ladder}
    for m in messages:
        u, model = m["usage"], m["model"]
        for part, _ in _parts(u, model):
            tot.update(_tokens(part))
        models[model] += 1
        if m.get("effort"):
            efforts[m["effort"]] += 1
        if str(u.get("speed") or "").lower() == "fast":
            fast += 1
        stu = u.get("server_tool_use") if isinstance(u.get("server_tool_use"), dict) else {}
        searches += int(stu.get("web_search_requests") or 0)
        c = price_usage(u, contract.tier_of_model(model), contract, model)
        if c is None:
            unpriced += 1
        else:
            cost += c
        for tier in cost_as:
            cost_as[tier] += price_usage(u, tier, contract, model, as_tier=True) or 0.0
    return {
        "model": models.most_common(1)[0][0] if models else None,
        "effort": efforts.most_common(1)[0][0] if efforts else None,
        "tokens": dict(tot),
        "messages": len(messages),
        "cost_usd": round(cost, 6),
        "cost_as": {t: round(v, 6) for t, v in cost_as.items()},
        "unpriced_messages": unpriced,
        "fast_messages": fast,
        "web_searches": searches,
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
        fh.write(json.dumps(row) + "\n")


def current_task(ledger: list, task_file: Path) -> tuple:
    for row in reversed(ledger):
        if row.get("kind") == "start":
            return row["task"], row.get("title", "")
    title = parse_task(task_file.read_text(encoding="utf-8"))["title"] if task_file.exists() else "task"
    return slugify(title), title


def _cycles_bounds(lines: list):
    start = next((i for i, l in enumerate(lines) if re.match(r"^##\s+cycles\s*$", l.strip(), re.I)), None)
    if start is None:
        return None, None, []
    end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("## ")), len(lines))
    return start, end, [i for i in range(start + 1, end) if lines[i].strip().startswith("|")]


def cycles_header_problem(task_file: Path) -> str | None:
    header = parse_task(task_file.read_text(encoding="utf-8"))["cycles_header"]
    if header and not REQUIRED_COLUMNS <= set(header):
        missing = ", ".join(sorted(REQUIRED_COLUMNS - set(header)))
        return (f"{task_file}: the Cycles table header lacks {missing}; escalation reads them "
                f"(expected: | {' | '.join(CYCLE_COLUMNS)} |)")
    return None


def stamp_task_id(task_file: Path, task_id: str) -> None:
    """Record the ledger's task id in TASK.md, under its title, once."""
    text = task_file.read_text(encoding="utf-8").replace("\r\n", "\n")
    if re.search(r"<!--\s*harness-task:", text):
        return
    lines = text.splitlines()
    at = next((i + 1 for i, l in enumerate(lines) if l.startswith("# ")), 0)
    lines.insert(at, f"<!-- harness-task: {task_id} -->")
    task_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def task_id_for(ledger: list, task_file: Path) -> str:
    """The task a cycle or step belongs to: TASK.md's recorded id, else the
    latest start (callers stamp it into TASK.md once something is logged)."""
    if task_file.exists():
        tid = parse_task(task_file.read_text(encoding="utf-8")).get("task_id")
        if tid:
            return tid
    return current_task(ledger, task_file)[0]


def append_cycle_row(task_file: Path, values: dict) -> None:
    """Append a row to the Cycles table, filling cells by the table's own header."""
    text = task_file.read_text(encoding="utf-8").replace("\r\n", "\n")
    lines = text.splitlines()
    clean = {k: str(v).replace("|", "/").replace("\n", " ") for k, v in values.items()}
    full_header = ["| " + " | ".join(CYCLE_COLUMNS) + " |", "|" + "---|" * len(CYCLE_COLUMNS)]
    start, end, table = _cycles_bounds(lines)
    if start is None:
        lines += ["", "## Cycles", ""] + full_header + ["| " + " | ".join(clean.get(c, "") for c in CYCLE_COLUMNS) + " |"]
    elif not table:
        lines[start + 1:start + 1] = [""] + full_header + ["| " + " | ".join(clean.get(c, "") for c in CYCLE_COLUMNS) + " |"]
    else:
        header = [re.sub(r"[-\s]+", "_", c.strip().lower()) for c in lines[table[0]].strip().strip("|").split("|")]
        lines.insert(table[-1] + 1, "| " + " | ".join(clean.get(c, "") for c in header) + " |")
    task_file.write_text("\n".join(lines) + "\n", encoding="utf-8")


def set_item_field(task_file: Path, item_id: str, key: str, value: str) -> bool:
    lines = task_file.read_text(encoding="utf-8").replace("\r\n", "\n").splitlines()
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


def block_dependents(task_file: Path, blocked_id: str) -> list:
    """Items that wait (directly or not) on a blocked item are blocked too."""
    blocked, changed = {blocked_id.upper()}, []
    while True:
        items = parse_task(task_file.read_text(encoding="utf-8"))["items"]
        hit = None
        for iid, item in items.items():
            if iid in blocked or (item.get("status") or "todo").lower() in ("done", "blocked"):
                continue
            deps = deps_of(item.get("after"), set(items)) & blocked
            if deps:
                hit = (iid, sorted(deps)[0])
                break
        if not hit:
            return changed
        set_item_field(task_file, hit[0], "status", "blocked")
        set_item_field(task_file, hit[0], "blocked_by", hit[1])
        blocked.add(hit[0])
        changed.append(hit[0])


# --------------------------------------------------------------------------
# Measuring one subagent run
# --------------------------------------------------------------------------

def measure(agent: str, contract: Contract, logged: set, *, agent_id=None, transcript=None, tokens=None,
            total=None, effort=None, marker=None) -> dict:
    tier_hint = agent_tier(agent, contract)
    out = {"agent": agent, "warnings": []}
    if tokens:
        m = re.match(r"^\s*(\d+)\s*[,/ ]\s*(\d+)\s*$", tokens)
        if not m:
            raise LedgerError("token counts must be IN,OUT (e.g. 12000,800)")
        usage = {"input_tokens": int(m.group(1)), "output_tokens": int(m.group(2))}
        cost = price_usage(usage, tier_hint, contract)
        out.update(found=True, agent_id=None, source="manual", model=tier_hint, tier=tier_hint, effort=effort,
                   tokens=_tokens(usage), cost_usd=None if cost is None else round(cost, 6),
                   cost_as={t: round(price_usage(usage, t, contract) or 0.0, 6) for t in contract.ladder})
        return out
    path, warns = (None, [])
    if transcript:
        path = Path(transcript)
    elif agent_id:
        path = transcript_by_id(agent_id)
        if not path:
            warns.append(f"no transcript for agent id {agent_id}")
    else:
        path, warns = find_transcript(agent, logged, marker)
    out["warnings"] += warns
    if path and path.exists() and agent_id_of(path) in logged:
        out["warnings"].append(f"run {agent_id_of(path)} is already in the ledger; not counted again")
        out.update(found=True, agent_id=None, duplicate_of=agent_id_of(path), source=f"duplicate:{path}",
                   model=None, tier=None, effort=effort, tokens={}, cost_usd=0.0)
        return out
    if path and path.exists():
        s = summarize_messages(read_usage(path), contract)
        tier = contract.tier_of_model(s["model"] or "") or None
        ran = s["effort"]
        if effort and ran and ran != effort:
            out["warnings"].append(f"{agent} was asked for effort {effort} but ran at {ran}; "
                                   f"the ledger records {ran} (check CLAUDE_CODE_EFFORT_LEVEL)")
        cost = None if s["messages"] and s["unpriced_messages"] == s["messages"] else s["cost_usd"]
        if s["unpriced_messages"]:
            out["warnings"].append(f"{s['unpriced_messages']} message(s) on a model the contract does not price "
                                   f"({s['model']}); left out of the cost")
        if s["web_searches"]:
            out["warnings"].append(f"{s['web_searches']} web search(es) not included in the cost")
        out.update(found=True, agent_id=agent_id_of(path), source=f"transcript:{path}", model=s["model"],
                   tier=tier, effort=ran or effort, effort_requested=effort, tokens=s["tokens"], cost_usd=cost,
                   cost_as=s["cost_as"], messages=s["messages"], unpriced_messages=s["unpriced_messages"],
                   fast_messages=s["fast_messages"])
        return out
    if total:
        p = contract.prices.get(tier_hint or "")
        est = total * p["input"] / 1e6 if p else None
        out.update(found=True, agent_id=None, model=tier_hint, tier=tier_hint, effort=effort,
                   source="estimate: the Agent result's token count priced as input (can be far off either way)",
                   tokens={"total": total}, cost_usd=None if est is None else round(est, 6), estimate=True)
        return out
    out.update(found=False, agent_id=None, source="not found", model=tier_hint, tier=tier_hint, effort=effort,
               tokens={}, cost_usd=None)
    return out


def _not_found(role: str, agent: str, flag: str) -> LedgerError:
    return LedgerError(
        f"nothing logged: no unlogged {agent} transcript found for the {role}. Rerun with "
        f"--{flag}-agent-id ID or --{flag}-transcript PATH, or as a fallback --{flag}-tokens IN,OUT "
        f"(or --{flag}-total-tokens N from the Agent result).")


def _row(base: dict, role: str, m: dict, verdict) -> dict:
    keep = {k: v for k, v in m.items() if k not in ("found",)}
    return {**base, "kind": "step", "role": role, **keep, "verdict": verdict}


def _after_verdict(task_file: Path, item_id: str, contract: Contract, verdict: str) -> dict:
    """Set the item's status from its cycles and report what to do next."""
    task = parse_task(task_file.read_text(encoding="utf-8"))
    out = {}
    if verdict == "PASS":
        status = "done"
    else:
        nxt = route_item(signals_from_item(task["items"][item_id]), contract, task["cycles"])
        out["next"] = {k: nxt.get(k) for k in ("status", "agent", "effort", "rule", "next")}
        out["next"]["action"] = (nxt.get("escalation") or {}).get("action") or nxt["status"]
        status = "blocked" if nxt["status"] == "blocked" else "retry"
    set_item_field(task_file, item_id, "status", status)
    out["item_status"] = status
    if status == "blocked":
        out["also_blocked"] = block_dependents(task_file, item_id)
    return out


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------

def cmd_start(args, contract):
    ledger_path, task_file = Path(args.ledger), Path(args.task_file)
    ledger = read_ledger(ledger_path)
    starts = [r for r in ledger if r.get("kind") == "start"]
    task_id, title, resumed, note = None, args.title, False, None
    if args.resume:
        recorded = parse_task(task_file.read_text(encoding="utf-8")).get("task_id") if task_file.exists() else None
        by_title = slugify(args.title) if args.title else None
        for row in reversed(starts):
            if (recorded and row["task"] == recorded) or (not recorded and by_title
                                                           and slugify(row.get("title", "")) == by_title):
                task_id, title, resumed = row["task"], row.get("title", title), True
                break
        if not task_id and recorded:
            task_id, title, resumed = recorded, title or recorded, True
            note = "TASK.md names a task this ledger has no start for; resuming it under that id"
        if not task_id and starts and not by_title:
            task_id, title, resumed = starts[-1]["task"], starts[-1].get("title", ""), True
            note = f"TASK.md records no task id; resumed the latest task in the ledger ({task_id})"
        if not task_id:
            raise LedgerError("nothing to resume: no task in the ledger matches; start a new one with --title")
    if not title:
        raise LedgerError("start needs --title (or --resume)")
    if not task_id:
        task_id = f"{slugify(title)}-{now_utc():%Y%m%d-%H%M%S}"
        taken = {r.get("task") for r in starts}
        n, base_id = 2, task_id
        while task_id in taken:
            task_id, n = f"{base_id}-{n}", n + 1
    append_ledger(ledger_path, {"ts": iso(now_utc()), "kind": "start", "task": task_id, "title": title,
                                "resume": resumed, "session": current_session_id()})
    if task_file.exists() and resumed:
        stamp_task_id(task_file, task_id)
    out = {"task": task_id, "resumed": resumed, "ledger": str(ledger_path), "task_file": str(task_file),
           "task_file_exists": task_file.exists()}
    if note:
        out["note"] = note
    print(json.dumps(out, indent=2))
    return 0


def cmd_cycle(args, contract):
    task_file, ledger_path = Path(args.task_file), Path(args.ledger)
    if not task_file.exists():
        raise LedgerError(f"{task_file} not found; write TASK.md first")
    problem = cycles_header_problem(task_file)
    if problem:
        raise LedgerError(problem)
    task = parse_task(task_file.read_text(encoding="utf-8"))
    item_id = args.item.upper()
    if item_id not in task["items"]:
        raise LedgerError(f"item {item_id} not in {task_file} (have: {', '.join(task['items'])})")
    ledger = read_ledger(ledger_path)
    task_id = task_id_for(ledger, task_file)
    logged = {r.get("agent_id") for r in ledger if r.get("agent_id")}
    rows_for_item = [c for c in task["cycles"] if c.get("item") == item_id]
    cycle_no = len(rows_for_item) + 1
    verdict = args.verdict.upper()

    worker = measure(args.worker, contract, logged, agent_id=args.worker_agent_id,
                     transcript=args.worker_transcript, tokens=args.worker_tokens,
                     total=args.worker_total_tokens, effort=args.effort,
                     marker=rf"Harness work item {re.escape(item_id)}\b")
    if not worker["found"]:
        raise _not_found("worker", args.worker, "worker")
    if worker.get("agent_id"):
        logged.add(worker["agent_id"])
    validator = None
    if args.validator and args.validator.lower() != "none":
        validator = measure(args.validator, contract, logged, agent_id=args.validator_agent_id,
                            transcript=args.validator_transcript, tokens=args.validator_tokens,
                            total=args.validator_total_tokens, effort=args.validator_effort or contract.validator[1],
                            marker=rf"Harness validation {re.escape(item_id)}\b")
        if not validator["found"]:
            raise _not_found("validator", args.validator, "validator")

    item = task["items"][item_id]
    base = {"ts": iso(now_utc()), "task": task_id, "item": item_id, "kind_of_item": item.get("kind") or None,
            "cycle": cycle_no}
    append_ledger(ledger_path, _row(base, "worker", worker, verdict))
    total = worker["cost_usd"] or 0.0
    out = {"item": item_id, "cycle": cycle_no, "verdict": verdict, "worker": worker}
    if validator:
        append_ledger(ledger_path, _row(base, "validator", validator, verdict))
        total += validator["cost_usd"] or 0.0
        out["validator"] = validator

    stamp_task_id(task_file, task_id)
    tier = worker.get("tier") or contract.tier_of_agent(args.worker) or "?"
    append_cycle_row(task_file, {
        "item": item_id, "cycle": cycle_no, "agent": args.worker, "model": tier,
        "effort": worker.get("effort") or args.effort or "?", "check": "yes" if has_check(item.get("check")) else "no",
        "verdict": verdict, "cost": f"${total:.4f}", "note": args.note or ""})
    out.update(_after_verdict(task_file, item_id, contract, verdict))
    out["cycle_cost_usd"] = round(total, 6)
    out["warnings"] = worker["warnings"] + (validator["warnings"] if validator else [])
    print(json.dumps(out, indent=2))
    return 0


def cmd_step(args, contract):
    ledger_path, task_file = Path(args.ledger), Path(args.task_file)
    ledger = read_ledger(ledger_path)
    task_id = task_id_for(ledger, task_file)
    logged = {r.get("agent_id") for r in ledger if r.get("agent_id")}
    items = [i.strip().upper() for i in re.split(r"[,\s]+", args.item or "") if i.strip()]
    verdict = (args.verdict or "").upper() or None
    task = None
    if items or verdict in ("FAIL", "STUCK"):
        if not task_file.exists():
            raise LedgerError(f"{task_file} not found")
        task = parse_task(task_file.read_text(encoding="utf-8"))
        if verdict in ("FAIL", "STUCK") and not items:
            raise LedgerError(f"--verdict {verdict} needs --item")
        if verdict == "STUCK" and len(items) > 1:
            raise LedgerError("a STUCK reply belongs to one item")
        missing = [i for i in items if i not in task["items"]]
        if missing:
            raise LedgerError(f"item(s) {', '.join(missing)} not in {task_file}")
        if verdict == "FAIL":
            problem = cycles_header_problem(task_file)
            if problem:
                raise LedgerError(problem)
            never = [i for i in items if not [c for c in task["cycles"] if c.get("item") == i]]
            if never:
                raise LedgerError(f"item(s) {', '.join(never)} have no cycle to reopen; log their work with `cycle`")
    item_id = items[0] if len(items) == 1 else None
    if args.marker:
        marker = args.marker
    elif args.agent == contract.validator[0]:
        marker = (r"Harness final validation" if not item_id or args.name.lower().startswith("final")
                  else rf"Harness validation {re.escape(item_id)}\b")
    elif item_id:
        marker = rf"Harness work item {re.escape(item_id)}\b"
    else:
        marker = None
    m = measure(args.agent, contract, logged, agent_id=args.agent_id, transcript=args.transcript,
                tokens=args.tokens, total=args.total_tokens, effort=args.effort, marker=marker)
    if not m["found"]:
        raise LedgerError(f"nothing logged: no unlogged {args.agent} transcript found. Rerun with --agent-id ID "
                          f"or --transcript PATH, or as a fallback --tokens IN,OUT (or --total-tokens N).")
    row = _row({"ts": iso(now_utc()), "task": task_id, "item": ",".join(items) or None, "cycle": None,
                "name": args.name}, args.role, m, verdict)
    out = {"step": row, "items": {}}
    if task is not None:
        stamp_task_id(task_file, task_id)

    if verdict == "FAIL":
        # A later check (e.g. the final validation) failed items that had
        # passed: record a failed cycle of each item's last run. The run's
        # cost is in the ledger once; the Cycles rows carry it on the first item.
        for n, iid in enumerate(items):
            rows_i = [c for c in task["cycles"] if c.get("item") == iid]
            if (task["items"][iid].get("status") or "").lower() == "blocked":
                out["items"][iid] = {"item_status": "blocked", "next": "already blocked: report it, do not reopen"}
                continue
            last = rows_i[-1]
            append_cycle_row(task_file, {
                "item": iid, "cycle": len(rows_i) + 1, "agent": last.get("agent", "?"),
                "model": last.get("model", "?"), "effort": last.get("effort", "?"), "check": last.get("check", ""),
                "verdict": "FAIL", "cost": f"${(m['cost_usd'] or 0.0) if n == 0 else 0.0:.4f}",
                "note": f"{args.name} ({args.agent}): {args.note or 'failed'}"})
            out["items"][iid] = _after_verdict(task_file, iid, contract, "FAIL")
            if len(items) == 1:
                row["cycle"] = len(rows_i) + 1
    elif verdict == "STUCK":
        stuck = 1 + sum(1 for r in ledger if r.get("task") == task_id and r.get("item") == item_id
                        and r.get("verdict") == "STUCK" and r.get("agent") == args.agent)
        if stuck >= MAX_STUCK:
            set_item_field(task_file, item_id, "status", "blocked")
            out["items"][item_id] = {"item_status": "blocked", "also_blocked": block_dependents(task_file, item_id),
                                     "next": f"{args.agent} was stuck on {item_id} {stuck} times: report it as blocked"}
        else:
            set_item_field(task_file, item_id, "status", "retry")
            out["items"][item_id] = {"item_status": "retry",
                                     "next": f"fix the cause and re-dispatch {item_id} (a second STUCK from "
                                             f"{args.agent} blocks it; rerouting to another tier starts afresh)"}
    append_ledger(ledger_path, row)
    if item_id and item_id in out["items"]:
        out.update(out["items"][item_id])
    out["warnings"] = m["warnings"]
    print(json.dumps(out, indent=2))
    return 0


def _fmt_tokens(t: dict) -> str:
    if not t:
        return "?"
    if "total" in t:
        return f"{t['total']:,} total"
    return f"{t.get('input', 0) + t.get('cache_read', 0) + t.get('cache_write', 0):,} in / {t.get('output', 0):,} out"


def _windows(ledger: list, task_id: str):
    """Orchestrator time windows for a task, as (begin, end, session). Each start
    (or resume) row opens one. It closes at this task's last row before the next
    start of any task; with no row of its own in between, at that next start;
    with neither, it is still open (None)."""
    out = []
    for i, row in enumerate(ledger):
        if row.get("kind") != "start" or row.get("task") != task_id:
            continue
        begin, own_last, next_start = parse_ts(row["ts"]), None, None
        for later in ledger[i + 1:]:
            if later.get("kind") == "start":
                next_start = parse_ts(later.get("ts"))
                break
            if later.get("task") == task_id and parse_ts(later.get("ts")):
                own_last = later
        end = parse_ts(own_last["ts"]) if own_last else next_start
        out.append((begin, end, row.get("session"), own_last))
    return out


def cmd_summary(args, contract):
    ledger_path, task_file = Path(args.ledger), Path(args.task_file)
    ledger = read_ledger(ledger_path)
    task_id = args.task or current_task(ledger, task_file)[0]
    rows = [r for r in ledger if r.get("kind") == "step" and (args.all or r.get("task") == task_id)]

    session = None
    if not args.all and not args.no_session:
        windows = _windows(ledger, task_id)
        if windows:
            begin, end, sid, own_last = windows[-1]
            later_start = any(r.get("kind") == "start" and parse_ts(r.get("ts")) and parse_ts(r["ts"]) > begin
                              for r in ledger)
            if not later_start and not (own_last and own_last.get("kind") == "summary"):
                # The task's newest window: close it now, so the work up to this
                # summary counts and later, unrelated work in the session does not.
                mark = {"ts": iso(now_utc()), "kind": "summary", "task": task_id}
                append_ledger(ledger_path, mark)
                windows[-1] = (begin, parse_ts(mark["ts"]), sid, mark)
        msgs = []
        for begin, end, sid, _ in windows:
            for t in main_transcripts(sid):
                msgs += read_usage(t, since=begin, until=end, main_only=True)
        if msgs:
            session = summarize_messages(msgs, contract)

    task_items = {}
    if task_file.exists() and not args.all:
        task_items = parse_task(task_file.read_text(encoding="utf-8"))["items"]
    status = Counter((i.get("status") or "todo").lower() for i in task_items.values())
    blocked = [(iid, i.get("blocked_by")) for iid, i in task_items.items() if (i.get("status") or "").lower() == "blocked"]

    by_tier = defaultdict(lambda: {"steps": 0, "cost_usd": 0.0})
    for r in rows:
        key = r.get("tier") or "?"
        by_tier[key]["steps"] += 1
        by_tier[key]["cost_usd"] += r.get("cost_usd") or 0.0
    routed = sum(r.get("cost_usd") or 0.0 for r in rows)
    total = routed + (session["cost_usd"] if session else 0.0)
    unknown = sum(1 for r in rows if r.get("cost_usd") is None)
    estimated = sum(1 for r in rows if r.get("estimate"))
    comparable = [r for r in rows if r.get("cost_as") and r.get("cost_usd") is not None
                  and not r.get("estimate") and not r.get("unpriced_messages")]
    cf = {t: round(sum(r["cost_as"].get(t, 0.0) for r in comparable), 4) for t in contract.ladder}
    cf_routed = round(sum(r["cost_usd"] for r in comparable), 4)
    result = {
        "steps_partly_priced": sum(1 for r in rows if r.get("cost_usd") is not None and r.get("unpriced_messages")),
        "task": "all" if args.all else task_id,
        "steps": rows,
        "by_model": {k: {"steps": v["steps"], "cost_usd": round(v["cost_usd"], 4)} for k, v in by_tier.items()},
        "subagents_cost_usd": round(routed, 4),
        "orchestrator": session,
        "total_cost_usd": round(total, 4),
        "items": dict(status),
        "blocked": [{"item": i, "blocked_by": b} for i, b in blocked],
        "steps_without_cost": unknown,
        "steps_estimated": estimated,
        "single_model_comparison": {"routed_usd": cf_routed, "same_tokens_on": cf,
                                    "steps_compared": len(comparable), "steps_excluded": len(rows) - len(comparable)},
    }
    if args.format == "json":
        print(json.dumps(result, indent=2))
        return 0

    print(f"## Ledger - {result['task']}\n")
    print("| # | item | cycle | role | agent | model | effort | verdict | tokens | cost |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    for n, r in enumerate(rows, 1):
        cost = "?" if r.get("cost_usd") is None else f"${r['cost_usd']:.4f}" + ("~" if r.get("estimate") else "")
        if r.get("cost_usd") is not None and r.get("unpriced_messages"):
            cost += "+?"
        label = r.get("item") or r.get("name") or "-"
        if r.get("item") and r.get("name"):
            label = f"{r['item']} ({r['name']})"
        print(f"| {n} | {label} | {r.get('cycle') or '-'} | {r.get('role')} | {r.get('agent')} | "
              f"{r.get('model') or '?'} | {r.get('effort') or '?'} | {r.get('verdict') or '-'} | "
              f"{_fmt_tokens(r.get('tokens'))} | {cost} |")
    print()
    for tier, v in sorted(result["by_model"].items(), key=lambda kv: -kv[1]["cost_usd"]):
        print(f"- {tier}: {v['steps']} step(s), ${v['cost_usd']:.4f}")
    if session:
        extra = f", {session['unpriced_messages']} unpriced" if session["unpriced_messages"] else ""
        print(f"- orchestrator (this session, {session['model']}): {session['messages']} request(s){extra}, "
              f"${session['cost_usd']:.4f}")
    print(f"\n**Total: ${result['total_cost_usd']:.4f}**", end="")
    if status:
        print(" - items: " + ", ".join(f"{n} {s}" for s, n in sorted(status.items())), end="")
    print()
    for iid, by in blocked:
        print(f"- blocked: {iid}" + (f" (waits on {by})" if by else ""))
    partial = sum(1 for r in rows if r.get("cost_usd") is not None and r.get("unpriced_messages"))
    if unknown or estimated or partial:
        print(f"\n_{unknown} step(s) without a measured cost, {estimated} estimated, {partial} only partly priced "
              f"(messages on models the contract does not price). The total leaves those out._")
    if rows and not comparable:
        print("\nNo step was measured from a transcript, so there is no single-model comparison.")
    if comparable:
        print("\nSame subagent messages priced on one model (price only - another model would have used "
              "different tokens and cycles):")
        print("  " + "  ".join(f"{t} ${v:.4f}" for t, v in cf.items()) + f"  | routed ${cf_routed:.4f}")
        if len(comparable) < len(rows):
            print(f"  ({len(rows) - len(comparable)} step(s) left out: estimated, unpriced or without a transcript)")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--contract", help="routing contract (default: routing.yaml next to the skill)")
    ap.add_argument("--ledger", default=str(LEDGER_FILE))
    ap.add_argument("--task-file", default=str(TASK_FILE))
    ap.add_argument("--unavailable", action="append", dest="unavailable_top",
                    help="tier(s) this account cannot use (for the next rung)")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--unavailable", action="append", dest="unavailable_sub", help=argparse.SUPPRESS)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("start", help="open a task, or --resume the one in TASK.md", parents=[common])
    s.add_argument("--title")
    s.add_argument("--resume", action="store_true", help="keep the existing task id (TASK.md's task)")

    c = sub.add_parser("cycle", help="record one worker cycle and its verdict", parents=[common])
    c.add_argument("--item", required=True)
    c.add_argument("--worker", required=True, help="subagent type, e.g. worker-sonnet")
    c.add_argument("--effort", help="effort the worker was dispatched at")
    c.add_argument("--verdict", required=True, type=str.upper, choices=["PASS", "FAIL"])
    c.add_argument("--validator", help="validator subagent type, or 'none' when you checked it yourself "
                                       "(default: the contract's validator)")
    c.add_argument("--validator-effort")
    c.add_argument("--note", help="one line: what failed, or what passed")
    for who in ("worker", "validator"):
        c.add_argument(f"--{who}-agent-id", help=f"the {who} run's agent id, when matching by brief is ambiguous")
        c.add_argument(f"--{who}-transcript", help=f"path to the {who} run's transcript")
        c.add_argument(f"--{who}-tokens", help="IN,OUT when no transcript is available")
        c.add_argument(f"--{who}-total-tokens", type=int, help="token count from the Agent result (rough estimate)")

    st = sub.add_parser("step", help="record another step", parents=[common])
    st.add_argument("--name", required=True, help="e.g. 'W2 stuck', 'final-validation'")
    st.add_argument("--agent", required=True)
    st.add_argument("--role", default="worker")
    st.add_argument("--item", help="the item(s) this step belongs to; a FAIL may name several (W2,W3)")
    st.add_argument("--effort")
    st.add_argument("--verdict", type=str.upper, choices=["PASS", "FAIL", "STUCK"],
                    help="FAIL with --item reopens the item as a failed cycle; STUCK counts toward blocking it")
    st.add_argument("--note")
    st.add_argument("--marker", help="regex the run's brief must match (default: from --agent and --item)")
    st.add_argument("--agent-id")
    st.add_argument("--transcript")
    st.add_argument("--tokens", help="IN,OUT when no transcript is available")
    st.add_argument("--total-tokens", type=int)

    sm = sub.add_parser("summary", help="per-step table and totals", parents=[common])
    sm.add_argument("--task", help="task id (default: the current task)")
    sm.add_argument("--all", action="store_true", help="every task in the ledger")
    sm.add_argument("--format", choices=["md", "json"], default="md")
    sm.add_argument("--no-session", action="store_true", help="leave out the orchestrator's own cost")

    args = ap.parse_args(argv)
    try:
        contract = load_contract(args.contract)
    except (OSError, ContractError) as exc:
        print(f"ledger.py: cannot load contract: {exc}", file=sys.stderr)
        return 2
    contract.unavailable = parse_unavailable((args.unavailable_top or []) + (getattr(args, "unavailable_sub", None) or []))
    if args.cmd == "cycle" and args.validator is None:
        args.validator = contract.validator[0]
    try:
        return {"start": cmd_start, "cycle": cmd_cycle, "step": cmd_step, "summary": cmd_summary}[args.cmd](args, contract)
    except (LedgerError, ContractError) as exc:
        print(f"ledger.py: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
