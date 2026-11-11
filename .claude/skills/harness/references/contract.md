# The routing contract (`routing.yaml`)

A model setting says what the session runs on. The routing contract says which
signals pick the model for each step. `scripts/route.py` is the only reader;
the orchestrator never routes by feel.

## Contents

1. [How an item is routed](#how-an-item-is-routed)
2. [Sections of routing.yaml](#sections-of-routingyaml)
3. [Escalation](#escalation)
4. [Prices and the ledger](#prices-and-the-ledger)
5. [Tuning from the ledger](#tuning-from-the-ledger)
6. [Differences from the minimal router sketch](#differences-from-the-minimal-router-sketch)

## How an item is routed

`route.py route` builds the item's signals, then picks a route:

1. **Kinds.** The item's stated `kind`. If none is stated, kinds are inferred
   from the item title or `--request` text using `keywords`.
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
6. **Guard.** If the item edits code, rules on a guarded tier (`haiku`) are
   skipped. If only guarded rules matched, the item goes to the cheapest
   unguarded tier above (Sonnet) at that rule's effort.
7. **Default.** No match → `default` (Opus at medium).

Inferred kinds are a fallback for free text. When the words in a request point
at rules on different tiers (`find and fix the crash` → search, scoped fix,
debugging), the request is compound: the router takes the most capable of
those tiers and warns you to split it into items, so the cheap part can run
cheap.

`route.py route` also reads the item's rows in TASK.md's Cycles table. A PASS
means the item is done; failed rows move it up the escalation ladder; too many
mean it is blocked.

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
| `prices` | per tier, USD per million tokens: `input / output / cache read` |
| `long_context` | per tier, `N -> input / output / cache read` for prompts above N tokens |
| `keywords` | per kind, comma-separated words that state that kind in free text |

Kinds are compared after lower-casing and treating `-`, `_` and spaces alike,
so `multi-PR feature`, `multi_pr_feature` and `multi pr feature` are the same.

The file uses a small YAML subset so `route.py` needs no packages: nested maps,
`- item` lists, `[a, b]` lists, `#` comments. Avoid `: ` inside rule strings.

To add a tier (say a future model), add it to `ladder`, `agents`, `prices`,
create `.claude/agents/worker-<tier>.md` with `model: <tier>`, and run
`route.py check`.

## Escalation

After a FAIL, the next rung follows `escalation.order`
(default `[verify, effort, model]`):

1. **verify** — if the item has no `check:`, give the worker a check it can
   run itself; same model, same effort.
2. **effort** — raise effort one level (`low → medium → high`), up to
   `max_effort`.
3. **model** — move one tier up the ladder, starting at `restart_effort`.

A PASS ends the loop. After `max_cycles` failed cycles the item is blocked.
With runnable checks written up front, the default three cycles are:
`sonnet @ medium → sonnet @ high → opus @ medium → blocked`.

If an item's signals change after a failed cycle so that it now routes above
the tier that failed (e.g. a Haiku item turns out to need code edits), the
next rung is that new route (`reroute`), never a lower tier.

## Prices and the ledger

`ledger.py` reads token usage from the transcripts Claude Code writes for each
subagent (`~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl`),
one entry per API message, and prices each message on the tier of the model
that served it:

- input × input price; cache reads × cache-read price; cache writes ×
  input price × 1.25 (5-minute) or × 2 (1-hour); output × output price.
- If a tier has a `long_context` entry and the message's prompt (input +
  cache reads + cache writes) is above the threshold, that message uses the
  long-context prices. Haiku 5.5 bills $0.50 / $2.50 above 100K prompt tokens.
- The orchestrator's own cost comes from the main session transcript, from the
  `ledger.py start` time onward.
- The single-model comparison in the summary prices the same messages on each
  tier. It is a price-only comparison: another model would have used a
  different number of tokens and cycles.

Prices are Claude API list prices; update `prices` if yours differ. The Haiku
cache-read price is assumed at 0.1× input.

## Tuning from the ledger

`ledger.py summary --all --format json` gives every step with its item, the item's kind (`kind_of_item`),
tier, effort, verdict and cost. Things worth acting on:

- **A kind fails on its first tier often** (two or more cycles per item) → its
  cost per finished item may be lower one tier up. Compare the totals per
  finished item, not per step.
- **A kind always passes first time on Opus or Fable** → try one rule a tier
  lower for a few runs and compare.
- **Many items hit the `add_check` rung** → acceptance criteria are being
  written without runnable checks; fix that in planning, not in the contract.
- **Unknown-kind items keep defaulting to Opus** → add the kind to a rule, or
  add keywords so free-text requests infer it.

Change one rule at a time, so the ledger can show what the change did.

## Differences from the minimal router sketch

The reference design shows a five-line `route()` that checks cheap kinds, then
images and computer use, then hard kinds, then `scoped and not large`, then
falls back to Opus. `route.py` keeps that order and adds:

- the contract is data (`routing.yaml`), so changing a rule needs no code;
- the stated-kind rules from the example contract (debugging and multi-PR
  features on Opus, docs and repeated tasks on Sonnet) are honoured, so a
  scoped debugging item stays on Opus;
- an item with no kind is scoped only if it states `spec: clear`;
- the code-edit guard, the TASK.md cycle history, and `escalate()` raise
  effort one level at a time (`low → medium → high`) rather than jumping to high.
