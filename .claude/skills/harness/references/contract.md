# The routing contract (`routing.yaml`)

A model setting says what the session runs on. The routing contract says which
signals pick the model for each step. `scripts/route.py` is the only reader;
the orchestrator never routes by feel.

## Contents

1. [How an item is routed](#how-an-item-is-routed)
2. [Sections of routing.yaml](#sections-of-routingyaml)
3. [Escalation](#escalation)
4. [The subagents](#the-subagents)
5. [Prices and the ledger](#prices-and-the-ledger)
6. [Tuning from the ledger](#tuning-from-the-ledger)
7. [Differences from the minimal router sketch](#differences-from-the-minimal-router-sketch)

## How an item is routed

`route.py route` builds the item's signals, then picks a route:

1. **Kinds.** The item's stated `kind`. `unsure` (or a kind the contract does
   not know) goes straight to `default`. If no kind is stated, kinds are
   inferred from the item title or `--request` text using `keywords`.
2. **Fallback kinds.** Still no kind: log assets make it `read logs`; a
   scoped item becomes `scoped fix`.
3. **Signal kinds**, added whatever else is stated: images in the assets →
   `images`; `computer_use: yes` → `computer use`; more repos than
   `scoped.max_repos` → `multi-PR feature`.
4. **Scoped test.** `spec: clear`, and every stated count within the limits:
   files ≤ `max_files`, repos ≤ `max_repos`, estimated source tokens of the
   assets ≤ `max_source_tokens` (about 4 bytes per token). A missing spec is
   not a clear spec.
5. **Rules, top to bottom; first match wins.** A rule matches when it shares a
   kind with the item. `if scoped` rules also need the scoped test.
6. **Compound items.** When the item states (or its words imply) several kinds
   whose rules sit on different tiers, the router takes the most capable of
   those tiers and warns you to split the item, so it never runs cheaper than
   its hardest part.
7. **Guard.** Rules on a guarded tier (`haiku`) need the item to state
   `edits_code: no`; otherwise they are skipped (the guard fails closed). If
   only guarded rules matched, the item goes to the cheapest unguarded tier
   above (Sonnet) at that rule's effort.
8. **Default.** No match → `default` (Opus at medium).
9. **Availability.** Tiers passed with `--unavailable` are replaced by the
   next tier up; at the top of the ladder, by the nearest tier down at
   `max_effort` that the guard allows. If none is left the item is blocked.

`route.py route` also reads the item's rows in TASK.md's Cycles table. The
item is done when its last row is PASS; failed rows move it up the escalation
ladder; too many mean it is blocked.

## Sections of routing.yaml

| key | meaning |
|---|---|
| `default` | route when no rule matches: `model @ effort` |
| `rules` | `kind | kind -> model @ effort [if scoped]`, first match wins |
| `scoped` | limits for the scoped test (`max_files`, `max_repos`, `max_source_tokens`) |
| `escalation` | `max_cycles`, `order` of rungs, `max_effort`, `restart_effort` |
| `guards.code_edits` | `never on <tier>[, <tier>]` |
| `ladder` | tiers from cheapest to most capable; escalation climbs it |
| `agents` | tier → subagent name in `.claude/agents/` |
| `validator` | `<subagent> @ <effort>` for the read-only checker |
| `models` | tier → the model ids its prices apply to |
| `prices` | per tier, USD per million tokens: `input / output / cache read` |
| `long_context` | per tier, `N -> input / output / cache read` for prompts above N tokens |
| `fast_mode_multiplier` | price multiplier for messages served in fast mode |
| `keywords` | per kind, comma-separated words that state that kind in free text |

Kinds are compared after lower-casing and treating `-`, `_` and spaces alike,
so `multi-PR feature`, `multi_pr_feature` and `multi pr feature` are the same.

The file uses a small YAML subset so `route.py` needs no packages: nested maps,
`- item` lists, `[a, b]` lists, `#` comments. Avoid `: ` inside rule strings.
A rule with a condition other than `if scoped`, a price that is not a number,
or a malformed line stops the router with an error rather than routing wrongly.

To add a tier (say a future model), add it to `ladder`, `agents`, `models`,
`prices`, create `.claude/agents/worker-<tier>.md` with `model: <tier>`, and
run `route.py check`.

## Escalation

After a FAIL, the next rung follows `escalation.order`
(default `[verify, effort, model]`):

1. **verify** — if the failed run had no `check:` (the Cycles table's
   `check` column), give the worker a check it can run itself; same model,
   same effort. Used at most once per item: a criterion that can only be
   judged moves on to the effort rung after that.
2. **effort** — raise effort one level (`low → medium → high`), up to
   `max_effort`.
3. **model** — move one tier up the ladder, starting at `restart_effort`.

A PASS ends the loop. After `max_cycles` failed cycles — or earlier, when no
rung is left (Fable at high) — the item is blocked, and so is every item that
waits on it. With checks written up front, the default three cycles are:
`sonnet @ medium → sonnet @ high → opus @ medium → blocked`.

- If an item's signals change after a failed cycle so that it now routes above
  the tier that failed (e.g. a Haiku item turns out to need code edits), the
  next rung is that new route (`reroute`), never a lower tier.
- An item whose route line says `(user override)` escalates from the user's
  choice one rung at a time instead.
- A FAIL found later (the final validation) is logged against the item with
  `ledger.py step --item W# --verdict FAIL`; it reopens the item as a failed
  cycle of its last run and counts toward the three.
- `STATUS: STUCK` replies are not cycles; a second one from the same agent on an item blocks it.
- When a blocked item later passes (say, on a route the user approved), the
  items that were blocked only because of it go back to `todo`.

## The subagents

| file | model | tools |
|---|---|---|
| `worker-haiku.md` | haiku | Read, Grep, Glob, Bash — no edit tools; shell read-only by instruction |
| `worker-sonnet.md` | sonnet | Read, Grep, Glob, Bash, Edit, Write, NotebookEdit |
| `worker-opus.md` | opus | Read, Grep, Glob, Bash, Edit, Write, NotebookEdit, WebFetch, WebSearch (images need only Read; add your computer-use MCP tools here if you route computer use) |
| `worker-fable.md` | fable | Read, Grep, Glob, Bash, Edit, Write, NotebookEdit, WebFetch, WebSearch |
| `validator.md` | sonnet | Read, Grep, Glob, Bash — read-only by instruction |

No worker can start subagents or skills of its own: those runs would be
unrouted, unvalidated and missing from the ledger. Tool allowlists also keep
each dispatch's prompt small — a subagent that inherits every session tool,
MCP servers included, pays to cache all their definitions on every cold start.
`route.py check` enforces the model pins, the guard and the no-nesting rule.

## Prices and the ledger

`ledger.py` reads token usage from the transcripts Claude Code writes for each
subagent (`~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl`),
matches each run to its item by the first line of its brief, and prices each
API message on the tier of the model that served it:

- input × input price; cache reads × cache-read price; cache writes ×
  input price × 1.25 (5-minute) or × 2 (1-hour); output × output price.
- A message whose prompt (input + cache reads + cache writes) is above a
  tier's `long_context` threshold uses those prices. Haiku 5.5 bills
  $0.50 / $2.50 above 100K prompt tokens.
- Messages in fast mode are multiplied by `fast_mode_multiplier`.
- A message with several `usage.iterations` (compaction, fallbacks) is priced
  per iteration, each on its own model.
- A model id not listed under `models` is left unpriced and reported — an
  older model in the same family has different prices. Web searches are
  counted but not priced.
- The effort recorded is the one the run actually used (from the transcript),
  with a warning when it differs from the routed effort.
- The orchestrator's own cost comes from the main transcript of the session
  that opened each window: `ledger.py start` (or `start --resume`) opens one,
  and it closes at the task's last ledger entry before the next start (the
  summary adds one when it runs).
- The single-model comparison prices the same messages on each tier, over the
  steps that were measured from transcripts. It is a price-only comparison:
  another model would have used a different number of tokens and cycles.

Prices are Claude API list prices; update `prices` if yours differ. The Haiku
cache-read price is assumed at 0.1× input.

## Tuning from the ledger

`ledger.py summary --all --format json` gives every step with its item, the
item's kind (`kind_of_item`), tier, effort, verdict and cost. Things worth
acting on:

- **A kind fails on its first tier often** (two or more cycles per item) → its
  cost per finished item may be lower one tier up. Compare totals per finished
  item, not per step.
- **A kind always passes first time on Opus or Fable** → try its rule one tier
  lower for a few runs and compare.
- **Many items hit the `add_check` rung** → checks are not being copied into
  items; fix that in planning, not in the contract.
- **Many items are `unsure`** → add a kind to a rule for them, or keywords.
- **Effort-mismatch warnings** → the routed effort is not taking effect
  (`CLAUDE_CODE_EFFORT_LEVEL` overrides it), so effort rungs do nothing.

Change one rule at a time, so the ledger can show what the change did.

## Differences from the minimal router sketch

The reference design shows a five-line `route()` that checks cheap kinds, then
images and computer use, then hard kinds, then `scoped and not large`, then
falls back to Opus. `route.py` keeps that order and adds:

- the contract is data (`routing.yaml`), so changing a rule needs no code;
- the stated-kind rules from the example contract (debugging and multi-PR
  features on Opus, docs and repeated tasks on Sonnet) are honoured, so a
  scoped debugging item stays on Opus;
- an item is scoped only if it states `spec: clear`, and `kind: unsure` makes
  "when unsure, start on Opus at medium" explicit;
- the code-edit guard (failing closed), compound-item handling, unavailable
  tiers, and the TASK.md cycle history;
- `escalate()` raises effort one level at a time (`low → medium → high`)
  rather than jumping to high; from the contract's default of medium the two
  are the same.
