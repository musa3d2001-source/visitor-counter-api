#!/usr/bin/env python3
"""Deterministic model router for the harness skill.

Reads the routing contract (routing.yaml), the work item's stated signals
(from TASK.md or flags), its assets, and the cycles recorded in TASK.md, and
prints which per-tier subagent should run the item at which effort. No model
call is made here: the router matches stated signals to a written rule.

Subcommands
  route     route one work item (first cycle, or the next rung after a FAIL)
  escalate  the next rung after a failed check, from a model and an effort
  kinds     list the kinds the contract knows
  check     validate the contract and the subagent files it names

Only the Python standard library is needed. PyYAML is used when installed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONTRACT = SKILL_DIR / "routing.yaml"
EFFORTS = ["low", "medium", "high", "xhigh", "max"]
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".heic"}
LOG_EXTS = {".log", ".out", ".err", ".trace"}
SKIP_DIRS = {".git", "node_modules", ".harness", "__pycache__", ".venv", "venv", "dist", "build", ".next"}
MAX_WALK_FILES = 20000
BYTES_PER_TOKEN = 4
UNSURE = "unsure"
PLACEHOLDERS = {"", "none", "-", "n/a", "na", "tbd", "todo", "?", "unknown", "no", "false"}
EDIT_TOOLS = ("Edit", "Write", "NotebookEdit")
NESTING_TOOLS = ("Agent", "Skill")


class ContractError(ValueError):
    pass


# --------------------------------------------------------------------------
# Contract loading (a small YAML subset; PyYAML is used when available)
# --------------------------------------------------------------------------

def _strip_comment(line: str) -> str:
    """Drop a trailing '# comment'. A quote only opens a quoted scalar when it
    starts the value (after ':', '-', '[' or ','), so apostrophes inside words
    are plain characters."""
    out, quote = [], None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            before = "".join(out).rstrip()
            if before == "" or before[-1] in ":-[,":
                quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            break
        out.append(ch)
    return "".join(out).rstrip()


def _scalar(text: str):
    s = text.strip()
    if s == "":
        return None
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        return s[1:-1]
    if s.startswith("[") and s.endswith("]"):
        inner = s[1:-1].strip()
        return [_scalar(part) for part in inner.split(",")] if inner else []
    low = s.lower()
    if low in ("true", "yes", "on"):
        return True
    if low in ("false", "no", "off"):
        return False
    if low in ("null", "~"):
        return None
    if re.fullmatch(r"-?\d+", s):
        return int(s)
    if re.fullmatch(r"-?\d+\.\d*|-?\.\d+", s):
        return float(s)
    return s


def parse_yaml_subset(text: str):
    """Parse the YAML subset routing.yaml uses: nested maps, '- scalar' lists,
    inline [a, b] lists, scalars and comments."""
    lines = []
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        if "\t" in raw[: len(raw) - len(raw.lstrip())]:
            raise ContractError("tabs are not allowed for indentation")
        body = _strip_comment(raw)
        if body.strip():
            lines.append((len(body) - len(body.lstrip(" ")), body.strip()))

    def block(i: int, indent: int):
        if i < len(lines) and (lines[i][1].startswith("- ") or lines[i][1] == "-"):
            items = []
            while i < len(lines) and lines[i][0] == indent and (lines[i][1].startswith("- ") or lines[i][1] == "-"):
                items.append(_scalar(lines[i][1][2:]))
                i += 1
            return items, i
        mapping = {}
        while i < len(lines) and lines[i][0] == indent:
            line = lines[i][1]
            m = re.match(r"^([^:]+?):(\s+(.*))?$", line)
            if not m:
                raise ContractError(f"cannot parse line: {line!r}")
            key, value = m.group(1).strip(), (m.group(3) or "").strip()
            i += 1
            if value:
                mapping[key] = _scalar(value)
            elif i < len(lines) and lines[i][0] > indent:
                mapping[key], i = block(i, lines[i][0])
            elif i < len(lines) and lines[i][0] == indent and lines[i][1].startswith("- "):
                mapping[key], i = block(i, indent)  # YAML allows a list at the key's indent
            else:
                mapping[key] = None
        return mapping, i

    if not lines:
        return {}
    data, end = block(0, lines[0][0])
    if end != len(lines):
        raise ContractError(f"unexpected indentation near: {lines[end][1]!r}")
    return data


def load_yaml(text: str):
    try:
        import yaml  # type: ignore
    except ImportError:
        return parse_yaml_subset(text)
    try:
        return yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise ContractError(f"invalid YAML: {exc}")


def norm_kind(kind: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[-_]+", " ", str(kind))).strip().lower()


ROUTE_RE = re.compile(r"^\s*([\w-]+)\s*(?:@\s*(\w+))?\s*$")
RULE_RE = re.compile(r"^(?P<kinds>.+?)\s*(?:->|→)\s*(?P<model>\w+)(?:\s*@\s*(?P<effort>\w+))?(?:\s+if\s+(?P<cond>\w+))?\s*$")


def parse_route(text: str, default_effort: str = "medium"):
    m = ROUTE_RE.match(str(text))
    if not m:
        raise ContractError(f"expected 'name @ effort', got {text!r}")
    return m.group(1).lower(), (m.group(2) or default_effort).lower()


def _num(value, key: str, kind=float):
    try:
        return kind(str(value).strip().lstrip("$"))
    except (TypeError, ValueError):
        raise ContractError(f"{key}: expected a number, got {value!r}")


def parse_prices(text, key: str = "prices"):
    parts = [p.strip() for p in str(text).split("/")]
    if len(parts) not in (2, 3):
        raise ContractError(f"{key}: expected 'input / output [/ cache read]', got {text!r}")
    nums = [_num(p, key) for p in parts]
    if len(nums) == 2:
        nums.append(nums[0] * 0.1)
    return {"input": nums[0], "output": nums[1], "cache_read": nums[2]}


def core_model_id(model_id: str) -> str:
    """'us.anthropic.claude-opus-5-5-20260101-v1:0[1m]' -> 'claude-opus-5-5'."""
    low = (model_id or "").lower()
    m = re.search(r"claude-[a-z0-9.-]+", low)
    core = m.group(0) if m else low
    core = re.sub(r"-v\d+(:\d+)?$", "", core)
    core = re.sub(r"[-@]\d{8}$", "", core)
    return core


@dataclass
class Rule:
    text: str
    kinds: list
    model: str
    effort: str
    condition: str | None = None


@dataclass
class Contract:
    default: tuple
    rules: list
    ladder: list
    agents: dict
    validator: tuple
    max_cycles: int
    order: list
    max_effort: str
    restart_effort: str
    no_code_edits: set
    scoped: dict
    prices: dict
    long_context: dict
    keywords: dict
    model_ids: dict = field(default_factory=dict)
    fast_multiplier: float = 2.0
    unavailable: set = field(default_factory=set)   # runtime: tiers not usable this session
    path: str = ""

    @property
    def known_kinds(self):
        seen = []
        for rule in self.rules:
            for k in rule.kinds:
                if k not in seen:
                    seen.append(k)
        return seen

    def agent_for(self, tier: str) -> str:
        return self.agents.get(tier, f"worker-{tier}")

    def tier_of_agent(self, agent: str) -> str | None:
        return next((t for t, a in self.agents.items() if a == agent), None)

    def tier_of_model(self, model_id: str) -> str | None:
        """Map a served model id to the tier whose prices apply. With a
        `models:` section the match is exact (dates and platform prefixes
        ignored); an id it does not list is unpriced rather than guessed."""
        if not model_id:
            return None
        low = model_id.lower()
        if low in self.ladder:
            return low
        if self.model_ids:
            core = core_model_id(model_id)
            for tier, ids in self.model_ids.items():
                if core in ids:
                    return tier
            return None
        if "mythos" in low and "fable" in self.ladder:
            return "fable"
        for tier in self.ladder:
            if tier in low:
                return tier
        return None


def _as_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if v is not None and str(v).strip()]
    return [w.strip() for w in str(value).split(",") if w.strip()]


def contract_from_dict(data: dict, path: str = "") -> Contract:
    if not isinstance(data, dict) or "routing" not in data:
        raise ContractError("the contract needs a top-level 'routing:' key")
    r = data["routing"] or {}
    default = parse_route(r.get("default", "opus @ medium"))
    rules = []
    for text in r.get("rules") or []:
        m = RULE_RE.match(str(text))
        if not m:
            raise ContractError(f"cannot parse rule {text!r} (want 'a | b -> model @ effort [if scoped]')")
        cond = (m.group("cond") or "").lower() or None
        if cond not in (None, "scoped"):
            raise ContractError(f"rule {text!r}: unknown condition 'if {cond}' (only 'if scoped' exists)")
        kinds = [norm_kind(k) for k in m.group("kinds").split("|") if k.strip()]
        rules.append(Rule(re.sub(r"\s+", " ", str(text)).strip(), kinds, m.group("model").lower(),
                          (m.group("effort") or default[1]).lower(), cond))
    esc = r.get("escalation") or {}
    guards = r.get("guards") or {}
    no_edits = set()
    ce = guards.get("code_edits")
    if ce:
        m = re.match(r"^\s*never\s+on\s+(.+)$", str(ce), re.I)
        if not m:
            raise ContractError(f"guards.code_edits must read 'never on <tier>[, <tier>]', got {ce!r}")
        no_edits = {t.strip().lower() for t in re.split(r"[,|]", m.group(1)) if t.strip()}
    scoped = {"max_files": 5, "max_repos": 1, "max_source_tokens": 100000}
    for k, v in (r.get("scoped") or {}).items():
        scoped[k] = _num(v, f"scoped.{k}", int)
    prices = {str(k).lower(): parse_prices(v, f"prices.{k}") for k, v in (r.get("prices") or {}).items()}
    long_context = {}
    for tier, text in (r.get("long_context") or {}).items():
        m = re.match(r"^\s*(\d+)\s*(?:->|→)\s*(.+)$", str(text))
        if not m:
            raise ContractError(f"long_context.{tier} must read 'N -> in / out / cache read'")
        long_context[str(tier).lower()] = {"threshold": int(m.group(1)), **parse_prices(m.group(2), f"long_context.{tier}")}
    keywords = {norm_kind(kind): [w.lower() for w in _as_list(words)]
                for kind, words in (r.get("keywords") or {}).items()}
    model_ids = {str(t).lower(): [core_model_id(i) for i in _as_list(ids)] for t, ids in (r.get("models") or {}).items()}
    return Contract(
        default=default,
        rules=rules,
        ladder=[str(t).lower() for t in (r.get("ladder") or ["haiku", "sonnet", "opus", "fable"])],
        agents={str(k).lower(): str(v) for k, v in (r.get("agents") or {}).items()},
        validator=parse_route(r.get("validator", "validator @ medium")),
        max_cycles=_num(esc.get("max_cycles", 3), "escalation.max_cycles", int),
        order=[str(s).lower() for s in (esc.get("order") or ["verify", "effort", "model"])],
        max_effort=str(esc.get("max_effort", "high")).lower(),
        restart_effort=str(esc.get("restart_effort", "medium")).lower(),
        no_code_edits=no_edits,
        scoped=scoped,
        prices=prices,
        long_context=long_context,
        keywords=keywords,
        model_ids=model_ids,
        fast_multiplier=_num(r.get("fast_mode_multiplier", 2), "fast_mode_multiplier"),
        path=path,
    )


def load_contract(path: str | os.PathLike | None = None) -> Contract:
    p = Path(path) if path else DEFAULT_CONTRACT
    return contract_from_dict(load_yaml(p.read_text(encoding="utf-8")), str(p))


# --------------------------------------------------------------------------
# TASK.md reading
# --------------------------------------------------------------------------

ITEM_RE = re.compile(r"^###\s+([A-Za-z]*\d+[A-Za-z0-9]*)\b\s*[:.\-–—]?\s*(.*)$")
FIELD_RE = re.compile(r"^\s*[-*]\s*([A-Za-z][A-Za-z _-]*?)\s*:\s*(.*)$")


def _sections(text: str):
    sections, current = {}, None
    for line in text.splitlines():
        m = re.match(r"^##\s+(?!#)(.*)$", line)
        if m:
            current = m.group(1).strip().lower()
            sections[current] = []
        elif current is not None:
            sections[current].append(line)
    return sections


def _table(lines):
    """(header, rows) of the first markdown table in lines."""
    rows, header = [], None
    for line in lines:
        s = line.strip()
        if not s.startswith("|"):
            if header and rows:
                break
            continue
        cells = [c.strip() for c in s.strip("|").split("|")]
        if header is None:
            header = [norm_kind(c).replace(" ", "_") for c in cells]
            continue
        if all(re.fullmatch(r":?-{2,}:?", c) for c in cells if c):
            continue
        rows.append(dict(zip(header, cells)))
    return header, rows


def parse_task(text: str) -> dict:
    """Return {'title', 'items': {id: {...}}, 'cycles': [...], 'cycles_header', 'acceptance': [...]}."""
    text = text.replace("\r\n", "\n")
    title = ""
    for line in text.splitlines():
        m = re.match(r"^#\s+(?:Task:\s*)?(.*)$", line)
        if m:
            title = m.group(1).strip()
            break
    secs = _sections(text)
    items, current = {}, None
    for line in secs.get("work items", []):
        m = ITEM_RE.match(line)
        if m:
            current = m.group(1).upper()
            items[current] = {"id": current, "title": m.group(2).strip()}
            continue
        f = FIELD_RE.match(line)
        if f and current:
            key = norm_kind(f.group(1)).replace(" ", "_")
            items[current].setdefault(key, f.group(2).strip())
    marker = re.search(r"<!--\s*harness-task:\s*(\S+)\s*-->", text)
    header, cycles = _table(secs.get("cycles", []))
    for row in cycles:
        if "item" in row:
            row["item"] = row["item"].upper()
    acceptance = [l.strip()[2:].strip() for l in secs.get("acceptance criteria", []) if l.strip().startswith(("- ", "* "))]
    return {"title": title, "task_id": marker.group(1) if marker else None, "items": items, "cycles": cycles,
            "cycles_header": header, "acceptance": acceptance}


def _split_list(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    s = str(value).strip()
    if s.lower() in ("", "none", "-", "n/a", "na"):
        return []
    return [p.strip().strip("`") for p in re.split(r"[,|]", s) if p.strip()]


def _count(value):
    """'3' -> 3; 'a.js, b.js' -> 2; 'none' -> 0; None / '?' / 'many' -> None."""
    if value is None:
        return None
    s = str(value).strip().strip("`")
    low = s.lower()
    if low in ("", "?", "unknown", "tbd", "many", "several", "some", "lots", "a few", "few"):
        return None
    if low in ("none", "-", "0"):
        return 0
    m = re.fullmatch(r"~?(\d+)\+?(\s+\w+)?", s)
    if m:
        return int(m.group(1))
    return len(_split_list(s))


def _truthy(value):
    if value is None:
        return None
    m = re.match(r"^\W*([a-z]+)", str(value).strip().lower())
    if not m:
        return None
    word = m.group(1)
    if word in ("yes", "y", "true", "on"):
        return True
    if word in ("no", "n", "false", "off", "none"):
        return False
    return None


def has_check(value) -> bool:
    """True when the field holds a command the worker can run, not a
    placeholder ('none.', 'no check', 'TBD', '(validator reads it)')."""
    text = str(value or "").strip().strip("`").strip()
    if not text or text.startswith("("):
        return False
    m = re.match(r"^[^A-Za-z0-9./]*([A-Za-z0-9./_-]+)", text)
    first = (m.group(1) if m else "").lower().rstrip(".")
    return bool(first) and first not in PLACEHOLDERS and first not in ("validator", "judgement", "judgment")


def deps_of(value, known: set) -> set:
    """Item ids named in an `after:` value ('W1, W3', 'W1 and W3', '[W1]')."""
    ids = {t.upper() for t in re.findall(r"\b[A-Za-z]*\d+[A-Za-z0-9]*\b", str(value or ""))}
    return ids & {k.upper() for k in known}


# --------------------------------------------------------------------------
# Signals and assets
# --------------------------------------------------------------------------

@dataclass
class Assets:
    images: int = 0
    logs: int = 0
    files: int = 0
    source_tokens: int = 0
    missing: list = field(default_factory=list)
    truncated: bool = False


def _is_log(rel: Path) -> bool:
    """A log by extension (app.log, app.log.1, run.out) or by living in a
    log/logs directory inside the asset - never by the name of a source file."""
    name = rel.name.lower()
    if rel.suffix.lower() in LOG_EXTS or re.search(r"\.log(\.\d+)?$", name):
        return True
    return any(part.lower() in ("log", "logs") for part in rel.parts[:-1])


def inspect_assets(paths, root: Path | None = None) -> Assets:
    a = Assets()
    root = root or Path.cwd()
    seen = 0
    for raw in paths:
        p = Path(raw)
        if not p.is_absolute():
            p = root / p
        if not p.exists():
            a.missing.append(str(raw))
            continue
        try:
            p.resolve().relative_to(root.resolve())
            base = root.resolve()
        except ValueError:
            base = p.resolve().parent
        files = [p] if p.is_file() else []
        if p.is_dir():
            for dirpath, dirnames, filenames in os.walk(p):
                dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
                for name in filenames:
                    files.append(Path(dirpath) / name)
                    if len(files) + seen >= MAX_WALK_FILES:
                        a.truncated = True
                        break
                if a.truncated:
                    break
        for f in files:
            seen += 1
            a.files += 1
            try:
                size = f.stat().st_size
            except OSError:
                continue
            if f.suffix.lower() in IMAGE_EXTS:
                a.images += 1
                continue
            try:
                rel = f.resolve().relative_to(base)
            except ValueError:
                rel = Path(f.name)
            if _is_log(rel):
                a.logs += 1
            a.source_tokens += size // BYTES_PER_TOKEN
    return a


@dataclass
class Signals:
    item: str | None = None
    title: str = ""
    kinds: list = field(default_factory=list)       # stated kinds
    request: str = ""
    spec: str | None = None                          # clear | open | None
    files: int | None = None
    repos: int | None = None
    edits_code: bool | None = None
    computer_use: bool = False
    has_check: bool = False
    user_override: bool = False
    status: str = ""
    blocked_by: str = ""
    images: int = 0
    logs: int = 0
    source_tokens: int = 0


def infer_kinds(request: str, contract: Contract) -> list:
    """Kinds whose keywords (or names) appear in the request, in rule order."""
    found = []
    text = (request or "").lower()
    if not text.strip():
        return found
    for kind in contract.known_kinds:
        words = [kind] + contract.keywords.get(kind, [])
        for w in words:
            pattern = r"(?<![a-z0-9])" + re.escape(w.lower()) + r"(?![a-z0-9])"
            if re.search(pattern, text):
                found.append(kind)
                break
    return found


def is_scoped(sig: Signals, contract: Contract) -> tuple:
    why = []
    lim = contract.scoped
    if (sig.spec or "").strip().lower() not in ("clear", "clear spec"):
        why.append("spec is not stated as clear" if not sig.spec else f"spec is {sig.spec}")
    if sig.files is not None and sig.files > int(lim["max_files"]):
        why.append(f"{sig.files} files > {lim['max_files']}")
    if sig.repos is not None and sig.repos > int(lim["max_repos"]):
        why.append(f"{sig.repos} repos > {lim['max_repos']}")
    if sig.source_tokens > int(lim["max_source_tokens"]):
        why.append(f"~{sig.source_tokens} source tokens > {lim['max_source_tokens']} (large assets)")
    return (not why), why


# --------------------------------------------------------------------------
# Routing and escalation
# --------------------------------------------------------------------------

def _effort_index(effort: str) -> int:
    try:
        return EFFORTS.index(effort)
    except ValueError:
        raise ContractError(f"unknown effort {effort!r}; use one of {EFFORTS}")


def _rank(contract: Contract, tier: str) -> int:
    return contract.ladder.index(tier) if tier in contract.ladder else -1


def escalate(model: str, effort: str, has_check: bool, contract: Contract) -> dict:
    """Next rung after a failed check, following escalation.order."""
    for step in contract.order:
        if step == "verify" and not has_check:
            return {"action": "add_check", "model": model, "effort": effort,
                    "why": "give the worker a check it can run itself, same model and effort"}
        if step == "effort" and _effort_index(effort) < _effort_index(contract.max_effort):
            nxt = EFFORTS[_effort_index(effort) + 1]
            return {"action": "raise_effort", "model": model, "effort": nxt,
                    "why": f"raise effort one level: {effort} -> {nxt}"}
        if step == "model" and model in contract.ladder:
            above = [t for t in contract.ladder[contract.ladder.index(model) + 1:] if t not in contract.unavailable]
            if above:
                skipped = contract.ladder[contract.ladder.index(model) + 1:contract.ladder.index(above[0])]
                note = f" (skipping unavailable {', '.join(skipped)})" if skipped else ""
                return {"action": "next_model", "model": above[0], "effort": contract.restart_effort,
                        "why": f"move one model up: {model} -> {above[0]} at {contract.restart_effort}{note}"}
    return {"action": "blocked", "model": model, "effort": effort,
            "why": f"no rung left above {model} @ {effort}"}


def _available(model: str, effort: str, edits: bool | None, contract: Contract):
    """Swap an unavailable tier for the nearest usable one: up the ladder first
    (never cheaper than the rule asked for), else down - but never onto a tier
    the code-edit guard forbids - at max effort. None if nothing is usable."""
    if model not in contract.unavailable:
        return model, effort, None
    ladder = contract.ladder
    i = _rank(contract, model)
    for t in ladder[i + 1:]:
        if t not in contract.unavailable:
            return t, effort, f"{model} unavailable -> {t} (next tier up)"
    for t in reversed(ladder[:max(i, 0)]):
        if t in contract.unavailable or (edits is not False and t in contract.no_code_edits):
            continue
        return t, contract.max_effort, f"{model} unavailable and nothing above -> {t} @ {contract.max_effort}"
    return None


def route(sig: Signals, contract: Contract) -> dict:
    reasons, warnings = [], []
    known = set(contract.known_kinds)
    stated = [norm_kind(k) for k in sig.kinds if str(k).strip()]
    unsure = UNSURE in stated
    stated = [k for k in stated if k != UNSURE]
    unknown = [k for k in stated if k not in known]
    if unknown:
        warnings.append(f"kind(s) not in the contract, treated as unsure: {', '.join(unknown)}")
    explicit = [k for k in stated if k in known]
    inferred = False
    kinds: list = []
    scoped, not_scoped_why = is_scoped(sig, contract)

    if unsure or (stated and not explicit):
        reasons.append("kind is unsure -> default")
    else:
        if explicit:
            reasons.append(f"stated kind: {', '.join(explicit)}")
        else:
            explicit = infer_kinds(sig.request or sig.title, contract)
            if explicit:
                inferred = True
                reasons.append(f"kind inferred from request words: {', '.join(explicit)}")
        reasons.append("scoped" if scoped else "not scoped (" + "; ".join(not_scoped_why) + ")")
        kinds = list(explicit)
        if not kinds and sig.logs:
            kinds = ["read logs"]
            reasons.append(f"{sig.logs} log file(s) and no stated kind -> read logs")
        if not kinds and scoped:
            kinds = ["scoped fix"]
            reasons.append("scoped item with no stated kind -> scoped fix")
        implicit = []
        if sig.images:
            implicit.append("images")
        if sig.computer_use:
            implicit.append("computer use")
        if sig.repos is not None and sig.repos > int(contract.scoped["max_repos"]):
            implicit.append("multi pr feature")
        for k in implicit:
            if k not in kinds:
                kinds.append(k)
        if implicit:
            reasons.append(f"asset/repo signals add: {', '.join(implicit)}")

    matches = []
    for idx, rule in enumerate(contract.rules):
        if not set(rule.kinds) & set(kinds):
            continue
        if rule.condition == "scoped" and not scoped:
            reasons.append(f"skip rule {idx + 1} ({rule.text}): needs scoped")
            continue
        matches.append((idx, rule))

    def guard_ok(rule):
        # Fails closed: a guarded tier needs edits_code stated as "no".
        return not (rule.model in contract.no_code_edits and sig.edits_code is not False)

    ok = [(i, r) for i, r in matches if guard_ok(r)]
    skipped_guard = [(i, r) for i, r in matches if not guard_ok(r)]
    default_rule = Rule("default", [], contract.default[0], contract.default[1])

    def floor(rule):
        # the tier a rule lands on once the guard has had its say
        if guard_ok(rule):
            return rule
        allowed = [t for t in contract.ladder if t not in contract.no_code_edits
                   and _rank(contract, t) > _rank(contract, rule.model)]
        return Rule(f"guard floor for {rule.text}", rule.kinds, allowed[0] if allowed else rule.model, rule.effort)

    # What each named kind would route to on its own; a kind with no usable rule
    # (unknown, or an `if scoped` rule on an unscoped item) counts as the default.
    options = [next((r for _, r in matches if k in r.kinds), default_rule) for k in explicit]
    options += [default_rule for _ in unknown]
    chosen = None
    if len(options) > 1 and len({o.model for o in options}) > 1:
        # Compound item: never route it cheaper than its hardest part.
        pool = [floor(o) for o in options] + [floor(r) for _, r in matches]
        best = max(pool, key=lambda o: _rank(contract, o.model))
        idx = next((i for i, r in enumerate(contract.rules) if r is best), None)
        chosen = (idx, best)
        warnings.append("this names kinds on several tiers; split it into one-kind work items "
                        "so the cheap parts route cheap" if inferred else
                        "state one kind per item; split this item so each part routes on its own")
    elif ok:
        chosen = ok[0]
    for i, r in skipped_guard:
        why = "edits code" if sig.edits_code else "does not state edits_code: no"
        reasons.append(f"guard: item {why}, so no {r.model} -> skip rule {i + 1} ({r.text})")
    if skipped_guard and sig.edits_code is None:
        warnings.append("edits_code not stated; haiku rules need `edits_code: no`, so the guard routed above haiku")

    if chosen:
        idx, rule = chosen
        label = f"rule {idx + 1}: {rule.text}" if idx is not None else rule.text
        model, effort, rule_text = rule.model, rule.effort, label
    elif skipped_guard:
        _, rule = skipped_guard[0]
        allowed = [t for t in contract.ladder if t not in contract.no_code_edits]
        above = [t for t in allowed if _rank(contract, t) > _rank(contract, rule.model)] or allowed
        model, effort = above[0], rule.effort
        rule_text = f"guard floor: no code edits on {rule.model} -> {model}"
    else:
        model, effort = contract.default
        rule_text = "default (no rule matched; when unsure, start here)"

    out = {"model": model, "effort": effort, "rule": rule_text, "kinds": kinds, "scoped": scoped,
           "reasons": reasons, "warnings": warnings}
    swap = _available(model, effort, sig.edits_code, contract)
    if swap is None:
        out.update(blocked=f"{model} is unavailable and no usable tier remains")
    else:
        out["model"], out["effort"], note = swap
        if note:
            out["rule"] += f"; fallback: {note}"
            warnings.append(f"fallback: {note}")
    out["agent"] = contract.agent_for(out["model"])
    return out


def route_item(sig: Signals, contract: Contract, cycles: list | None = None) -> dict:
    """Route an item, taking its rows in TASK.md's Cycles table into account."""
    base = route(sig, contract)
    rows = [c for c in (cycles or []) if sig.item and c.get("item", "").upper() == sig.item.upper()]
    verdicts = [str(c.get("verdict", "")).strip().upper() for c in rows]
    failed = [c for c, v in zip(rows, verdicts) if v == "FAIL"]
    out = {"item": sig.item, **base, "cycle": len(rows) + 1, "status": "route", "failed_cycles": len(failed)}
    if base.get("blocked"):
        out.update(status="blocked", next=f"{base['blocked']}: mark the item blocked and report it")
        return out
    if sig.status == "blocked":
        why = f"it waits on {sig.blocked_by}, which is blocked" if sig.blocked_by else "TASK.md marks it blocked"
        out.update(status="blocked", cycle=len(rows), next=f"{why}: report it, do not dispatch")
        return out
    if verdicts and verdicts[-1] == "PASS":
        out.update(status="done", cycle=len(rows), next="nothing to do: the item's last cycle passed")
        return out
    if not failed:
        out["next"] = f"dispatch to {out['agent']} at effort {out['effort']}"
        return out
    if len(failed) >= contract.max_cycles:
        out.update(status="blocked", cycle=len(rows),
                   next=f"{len(failed)} failed cycles (max {contract.max_cycles}): mark the item blocked and report it")
        return out
    last = failed[-1]
    last_model = str(last.get("model") or "").strip().lower()
    if last_model not in contract.ladder:
        last_model = (contract.tier_of_model(last_model) or contract.tier_of_agent(str(last.get("agent", "")))
                      or base["model"])
    last_effort = str(last.get("effort") or base["effort"]).strip().lower()
    if last_effort not in EFFORTS:
        last_effort = base["effort"]
    # Did the failed cycle's worker have a check it could run? (the Cycles row
    # records it; older tables without the column fall back to the item now)
    had_check = _truthy(last.get("check")) if "check" in last else sig.has_check
    step = escalate(last_model, last_effort, bool(had_check), contract)
    if (step["action"] != "blocked" and not sig.user_override
            and _rank(contract, step["model"]) < _rank(contract, base["model"])):
        # The item's signals changed after the failed cycle (e.g. it turned out
        # to edit code): never climb from below what the item routes to now.
        step = {"action": "reroute", "model": base["model"], "effort": base["effort"],
                "why": f"signals now route to {base['model']} ({base['rule']}), above the failed {last_model}"}
    if step["action"] in ("raise_effort", "add_check") and step["model"] in contract.unavailable:
        step = escalate(step["model"], contract.max_effort, True, contract)
    out["escalation"] = step
    if step["action"] == "blocked":
        out.update(status="blocked", model=last_model, effort=last_effort, agent=contract.agent_for(last_model),
                   next=f"{step['why']}: mark the item blocked and report it")
        return out
    out.update(status="escalate", model=step["model"], effort=step["effort"], agent=contract.agent_for(step["model"]))
    out["rule"] = f"escalation after cycle {len(rows)} ({last_model} @ {last_effort} failed): {step['why']}"
    if step["action"] == "add_check":
        if sig.has_check:
            out["next"] = (f"the item now has a check; re-dispatch to {out['agent']} at {out['effort']} "
                           f"with the validator's evidence")
        else:
            out["next"] = (f"write a `check:` command into the item that the worker can run itself, "
                           f"then re-dispatch to {out['agent']} at {out['effort']}")
    else:
        out["next"] = f"re-dispatch to {out['agent']} at effort {out['effort']} with the validator's evidence"
    return out


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def signals_from_item(item: dict) -> Signals:
    return Signals(
        item=item.get("id"),
        title=item.get("title", ""),
        kinds=_split_list(item.get("kind") or item.get("kinds")),
        request=item.get("title", ""),
        spec=(item.get("spec") or None),
        files=_count(item.get("files")),
        repos=_count(item.get("repos")),
        edits_code=_truthy(item.get("edits_code")),
        computer_use=bool(_truthy(item.get("computer_use"))),
        has_check=has_check(item.get("check")),
        user_override="user override" in str(item.get("route") or "").lower(),
        status=str(item.get("status") or "").strip().lower(),
        blocked_by=str(item.get("blocked_by") or "").strip(),
    )


def find_project_root(start: Path | None = None) -> Path:
    here = (start or Path.cwd()).resolve()
    for p in [here, *here.parents]:
        if (p / ".claude").is_dir() or (p / ".git").exists():
            return p
    return here


def read_frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    m = re.match(r"^---\n(.*?)\n---", text, re.S)
    if not m:
        return {}
    try:
        data = load_yaml(m.group(1))
    except ContractError:
        data = None
    return data if isinstance(data, dict) else {}


def agent_tier(agent: str, contract: Contract, root: Path | None = None) -> str | None:
    """Tier of a subagent: from the contract, else from its file's `model:`."""
    tier = contract.tier_of_agent(agent)
    if tier:
        return tier
    # The project's agents first, then the .claude/agents next to this skill
    # (the same folder for a project skill; ~/.claude/agents for a user skill).
    for agents_dir in ((root or find_project_root()) / ".claude" / "agents", SKILL_DIR.parent.parent / "agents"):
        f = agents_dir / f"{agent}.md"
        if f.exists():
            model = str(read_frontmatter(f).get("model") or "")
            return contract.tier_of_model(model) if model else None
    return None


def tool_available(fm: dict, tool: str) -> bool:
    tools = fm.get("tools")
    allowed = None if tools in (None, "", "*") else set(_as_list(tools))
    denied = set(_as_list(fm.get("disallowedTools")))
    return (allowed is None or tool in allowed) and tool not in denied


def parse_unavailable(values) -> set:
    out = set()
    for v in values or []:
        out |= {t.strip().lower() for t in str(v).split(",") if t.strip()}
    return out


def cmd_route(args, contract: Contract) -> dict:
    cycles = []
    sig = Signals()
    asset_paths = list(args.asset or [])
    if args.task:
        task = parse_task(Path(args.task).read_text(encoding="utf-8"))
        cycles = task["cycles"]
        if args.item:
            item = task["items"].get(args.item.upper())
            if not item:
                raise SystemExit(f"route.py: item {args.item} not found in {args.task} "
                                 f"(have: {', '.join(task['items']) or 'none'})")
            sig = signals_from_item(item)
            asset_paths += _split_list(item.get("assets"))
    if args.item and not sig.item:
        sig.item = args.item.upper()
    if args.kind:
        sig.kinds = _split_list(",".join(args.kind))
    if args.request:
        sig.request = args.request
    if args.spec:
        sig.spec = args.spec
    if args.files is not None:
        sig.files = args.files
    if args.repos is not None:
        sig.repos = args.repos
    if args.edits_code is not None:
        sig.edits_code = args.edits_code
    if args.computer_use:
        sig.computer_use = True
    if args.has_check:
        sig.has_check = True
    root = Path(args.root) if args.root else Path.cwd()
    assets = inspect_assets(asset_paths, root)
    sig.images += assets.images + (args.images or 0)
    sig.logs += assets.logs
    sig.source_tokens += assets.source_tokens + (args.source_tokens or 0)
    out = route_item(sig, contract, cycles)
    out["signals"] = {
        "stated_kinds": sig.kinds, "spec": sig.spec, "files": sig.files, "repos": sig.repos,
        "edits_code": sig.edits_code, "computer_use": sig.computer_use, "has_check": sig.has_check,
        "user_override": sig.user_override, "images": sig.images, "logs": sig.logs,
        "source_tokens_est": sig.source_tokens,
    }
    if contract.unavailable:
        out["signals"]["unavailable"] = sorted(contract.unavailable)
    if assets.missing:
        out["warnings"].append(f"asset(s) not found: {', '.join(assets.missing)}")
    if assets.truncated:
        out["warnings"].append(f"asset walk stopped at {MAX_WALK_FILES} files; source size is a lower bound")
    out["dispatch"] = {"subagent_type": out["agent"], "effort": out["effort"],
                       "note": "do not pass a model: the subagent's frontmatter pins it"}
    return out


def cmd_check(contract: Contract, root: Path) -> tuple:
    problems, notes = [], []
    tiers = set(contract.ladder)
    for r in contract.rules:
        if r.model not in tiers:
            problems.append(f"rule '{r.text}': model {r.model} is not on the ladder {contract.ladder}")
        if r.effort not in EFFORTS:
            problems.append(f"rule '{r.text}': effort {r.effort} is not one of {EFFORTS}")
    if contract.default[0] not in tiers:
        problems.append(f"default model {contract.default[0]} is not on the ladder")
    for e in (contract.default[1], contract.max_effort, contract.restart_effort, contract.validator[1]):
        if e not in EFFORTS:
            problems.append(f"effort {e} is not one of {EFFORTS}")
    for step in contract.order:
        if step not in ("verify", "effort", "model"):
            problems.append(f"escalation.order: unknown step {step}")
    for t in contract.no_code_edits:
        if t not in tiers:
            problems.append(f"guards.code_edits names {t}, which is not on the ladder")
    for t in contract.ladder:
        if t not in contract.prices:
            problems.append(f"prices: no price for {t}")
        if contract.model_ids and t not in contract.model_ids:
            problems.append(f"models: no model id listed for {t}, so its messages would be unpriced")
    for k in contract.keywords:
        if k not in contract.known_kinds:
            problems.append(f"keywords: '{k}' is not a kind used by any rule")
    agents_dir = root / ".claude" / "agents"
    names = {t: contract.agent_for(t) for t in contract.ladder}
    names["(validator)"] = contract.validator[0]
    for tier, name in names.items():
        f = agents_dir / f"{name}.md"
        if not f.exists():
            problems.append(f"subagent file missing: {f}")
            continue
        fm = read_frontmatter(f)
        model = str(fm.get("model") or "").strip().lower()
        if tier in tiers and model != tier:
            problems.append(f"{f.name}: frontmatter model should be '{tier}', found '{model or 'none'}'")
        for tool in NESTING_TOOLS:
            if tool_available(fm, tool):
                problems.append(f"{f.name}: {tool} is available; workers must not start their own "
                                f"subagents or skills (they would run unrouted and unlogged)")
        if tier in contract.no_code_edits or tier == "(validator)":
            for tool in EDIT_TOOLS:
                if tool_available(fm, tool):
                    problems.append(f"{f.name}: {tool} is available, but this agent must not edit files")
            if tool_available(fm, "Bash"):
                notes.append(f"{f.name}: keeps Bash; read-only shell use rests on its prompt and the "
                             f"orchestrator's git status check")
        if fm.get("tools") in (None, ""):
            notes.append(f"{f.name}: no tools allowlist, so it inherits every session tool (including MCP "
                         f"servers), which enlarges each dispatch's prompt")
    return problems, notes


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--contract", help="routing contract (default: routing.yaml next to the skill)")
    ap.add_argument("--unavailable", action="append", dest="unavailable_top",
                    help="tier(s) this account cannot use right now, e.g. fable (comma-separated or repeated)")
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--unavailable", action="append", dest="unavailable_sub", help=argparse.SUPPRESS)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("route", help="route one work item", parents=[common])
    r.add_argument("--task", help="TASK.md to read the item's signals and cycles from")
    r.add_argument("--item", help="work item id in TASK.md, e.g. W2")
    r.add_argument("--request", help="request text (used to infer the kind when none is stated)")
    r.add_argument("--kind", action="append", help="stated kind (repeatable or comma-separated), or 'unsure'")
    r.add_argument("--spec", choices=["clear", "open"], help="clear spec or open-ended")
    r.add_argument("--files", type=int, help="number of files the item touches")
    r.add_argument("--repos", type=int, help="number of repos the item touches")
    g = r.add_mutually_exclusive_group()
    g.add_argument("--edits-code", dest="edits_code", action="store_true", default=None)
    g.add_argument("--read-only", dest="edits_code", action="store_false")
    r.add_argument("--computer-use", action="store_true")
    r.add_argument("--has-check", action="store_true", help="the worker already has a check it can run")
    r.add_argument("--asset", action="append", help="asset path (file or dir), repeatable")
    r.add_argument("--images", type=int, help="images the worker will see that are not listed as asset paths")
    r.add_argument("--source-tokens", type=int, help="extra source material in tokens (e.g. pasted text)")
    r.add_argument("--root", help="base directory for relative asset paths (default: cwd)")
    r.add_argument("--brief", action="store_true", help="one line instead of JSON")

    e = sub.add_parser("escalate", help="next rung after a failed check", parents=[common])
    e.add_argument("--model", required=True)
    e.add_argument("--effort", required=True)
    e.add_argument("--has-check", action="store_true")

    sub.add_parser("kinds", help="list the kinds the contract knows")
    c = sub.add_parser("check", help="validate the contract and the subagent files")
    c.add_argument("--root", help="project root (default: nearest dir with .claude/ or .git)")

    args = ap.parse_args(argv)
    try:
        contract = load_contract(args.contract)
    except (OSError, ContractError) as exc:
        print(f"route.py: cannot load contract: {exc}", file=sys.stderr)
        return 2
    contract.unavailable = parse_unavailable((args.unavailable_top or []) + (getattr(args, "unavailable_sub", None) or []))

    try:
        if args.cmd == "route":
            out = cmd_route(args, contract)
            if args.brief:
                print(f"{out['item'] or '-'} [{out['status']}] -> {out['agent']} @ {out['effort']}  ({out['rule']})")
            else:
                print(json.dumps(out, indent=2))
            return 0
        if args.cmd == "escalate":
            print(json.dumps(escalate(args.model.lower(), args.effort.lower(), args.has_check, contract), indent=2))
            return 0
        if args.cmd == "kinds":
            for i, rule in enumerate(contract.rules, 1):
                cond = f"  (if {rule.condition})" if rule.condition else ""
                print(f"{i}. {' | '.join(rule.kinds)} -> {rule.model} @ {rule.effort}{cond}")
            print(f"default: {contract.default[0]} @ {contract.default[1]}   (kind: {UNSURE} goes here directly)")
            return 0
        if args.cmd == "check":
            root = Path(args.root) if args.root else find_project_root()
            problems, notes = cmd_check(contract, root)
            for p in problems:
                print(f"- {p}")
            for n in notes:
                print(f"  note: {n}")
            print("contract OK" if not problems else f"{len(problems)} problem(s)")
            return 0 if not problems else 1
    except ContractError as exc:
        print(f"route.py: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
