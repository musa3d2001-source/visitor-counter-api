---
name: harness
description: Runs a coding request through a routed harness - a deterministic router picks Haiku, Sonnet, Opus or Fable and an effort level for every step from a written routing contract, per-tier subagents do the work, a read-only validator checks it, failed checks escalate effort then model (at most 3 cycles), and a ledger logs model, effort and cost per step. Use when the user runs /harness, asks to route work across models or tiers, wants cheap models for easy steps (search, logs, summaries) and strong ones for hard steps, or mentions model routing, per-step model or effort choice, escalation on failed checks, or cost per step or per finished task - even if they don't say "harness".
argument-hint: "[--plan] <request>"
allowed-tools:
  - Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/route.py *)
  - Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py *)
---

# Harness: route every step to the right model

You are the orchestrator. You stay on this session's model, write the goal and
acceptance criteria, and hand each piece of work to a per-tier subagent that a
router in code picked. A validator checks the result; a failed check climbs a
bounded escalation ladder; a ledger records model, effort and cost per step.

Request: $ARGUMENTS

## Why it is built this way

- **One model for every step is the wrong price.** Reading logs and searching
  files suit Haiku ($0.10 / $0.50 per million tokens in / out); migrations and
  architecture deserve Fable ($8 / $40). Sonnet ($2 / $10) and Opus ($4 / $20)
  cover the middle.
- **Switching with `/model` is expensive.** Each model has its own prompt
  cache, so switching pays the cache write again for the whole conversation.
  So this session never changes model. Work goes to subagents
  (`worker-haiku`, `worker-sonnet`, `worker-opus`, `worker-fable`) whose
  frontmatter pins the model; each has its own context, and your cache survives.
- **Route by written rule, not by feel.** `scripts/route.py` matches stated
  signals (the request, its assets, the repo) to `routing.yaml`. When nothing
  matches it says Opus at medium.
- **Measure.** A higher token price is not always a higher cost per finished
  task — a cheap model that needs three cycles can cost more. The ledger
  measures tokens from the subagents' own transcripts, so the contract can be
  tuned from data.

| Component | Who | Job |
|---|---|---|
| Router | `scripts/route.py` + `routing.yaml` | classify request and assets in code → agent + effort |
| Orchestrator | you | goal, acceptance criteria and work items in `.harness/TASK.md` |
| Worker | `worker-<tier>` subagent | implement one item on the routed model |
| Validator | `validator` subagent | read-only spec and standards checks → PASS / FAIL |
| Ledger | `scripts/ledger.py` | model, effort, tokens and cost per step |

## Ground rules

1. **Never change this session's model.** No `/model`, and no `model`
   argument on Agent calls — the subagent's frontmatter is the tier. Do pass
   the router's `effort` on every Agent call.
2. **Route with `route.py`.** If a route looks wrong, the item's signals or
   the contract are wrong: fix the signal in TASK.md (and say why there) or
   propose a contract change. If the user names a model for an item, use it
   and record `route: <agent> @ <effort> (user override)`.
3. **Code edits never run on Haiku.** The router enforces it and
   `worker-haiku` cannot edit files.
4. **Every cycle ends with a verdict and a ledger entry.**
5. **Escalate only on a failed check**, one rung at a time, at most three
   cycles per item. Then the item is blocked and you report it — you don't
   quietly finish it yourself on the session model, which would hide the cost
   and skip the check.

The two scripts live in `${CLAUDE_SKILL_DIR}/scripts/`. Run them from the
project root; they keep state in `.harness/` (TASK.md and ledger.jsonl).

## The loop

### 0. Start

- No request in `$ARGUMENTS`? Ask what to do.
- `--plan` at the start of the arguments means: do steps 1 and 2, show the
  plan table (item, kind, route, why), and stop without dispatching.
- If `.harness/TASK.md` already exists and has items that are not `done` or
  `blocked`, ask whether to resume it or start fresh. Resuming: go to step 2
  for the unfinished items (route.py reads their failed cycles). Starting
  fresh: move the old file to `.harness/archive/<task-slug>.md` first.
- Open the ledger:
  `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py start --title "<the request in a few words>"`

### 1. Orchestrate: write `.harness/TASK.md`

Read `${CLAUDE_SKILL_DIR}/references/task-template.md` for the exact format
(both scripts parse it). Read only as much of the repo as you need to write:

- **Goal** — what done looks like. Workers never see this conversation, so
  the goal and each item must stand on their own.
- **Acceptance criteria** — each with a check a worker can run itself (a test
  command, a grep, a script). Runnable checks are the first rung of the
  escalation ladder; writing them now saves a cycle later.
- **Work items** — split along model lines: read-only parts (find, read logs,
  summarize, classify) become their own items so they route to Haiku, and the
  change becomes an item that receives their findings. Give each item one
  `kind` from `python3 ${CLAUDE_SKILL_DIR}/scripts/route.py kinds`, plus its
  signals: `spec`, `files`, `repos`, `assets`, `edits_code`, `check`, `after`.
  Unsure of the kind? Leave it out — the router then defaults to Opus at medium.

Planning and the final report are your work, not work items.

### 2. Route

For each item that is not done:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/route.py route --task .harness/TASK.md --item W1
```

The JSON gives `agent`, `effort`, `rule`, `status` and `next`. Then:

- Write the route into the item, e.g.
  `- route: worker-haiku @ medium — rule 2: search | read logs | summarize`.
- Read `warnings`. "edits_code not stated" → state it and route again.
  "split it into work items" → split the item. "asset(s) not found" → fix the path.
- Images pasted into the chat (not on disk) → add `--images N`; long pasted
  text → `--source-tokens N` (about 4 characters per token).
- `status: done` → skip the item. `status: blocked` → go to step 7 for it.

With `--plan`, show the table now and stop.

### 3. Execute

Dispatch each ready item (status not done, every `after:` item done) with the
Agent tool: `subagent_type` = the route's `agent`, `effort` = the route's
`effort`, no `model`. Independent items go out in the same message so they
run in parallel. Set the item's `status: running`.

The worker's prompt is its whole world. Use this brief:

```
Harness work item <W#>: <title>

Task goal: <goal>
This item: <what to do>. Done means: <the item's acceptance>.
Acceptance criteria it serves: <AC lines with their checks>
Context: <paths and the findings from earlier items it needs, pasted in>
Self-check: run `<check>` before you reply.            <- omit if the item has none
Constraints: do only this item, follow the repo's style, no commits or pushes.
Previous attempt: cycle <n> on <agent> @ <effort> failed. Validator evidence:
<evidence and fix hint>                                 <- only on a retry
Reply in your STATUS format.
```

If a worker replies `STATUS: STUCK`, no check ran, so it is not a cycle. Log
its cost with `ledger.py step --name "<W#> stuck" --agent <agent> --item <W#>`,
then fix the cause: give it the missing information and re-dispatch, or — when
Haiku says the item needs code edits — set `edits_code: yes` and route again
(the guard sends it to Sonnet or above).

### 4. Verify

- **The item changed files** → dispatch `validator` (effort from the contract,
  medium) with: the item and its acceptance criteria, the check commands, and
  the worker's reply (files changed, check output). It replies with
  `VERDICT: PASS | FAIL` and evidence.
- **The item was read-only** → check it yourself; a validator run would cost
  more than the item. Does the reply answer the item's acceptance? Open one
  or two of its `path:line` findings to confirm them. Is `git status
  --porcelain` unchanged? Then use `--validator none` in the next step.

### 5. Log the cycle

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py cycle --item W2 --worker worker-sonnet \
  --effort medium --verdict FAIL --note "<one line: what failed or what passed>"
```

It finds the newest unlogged transcripts of the worker and the validator,
measures their tokens and cost, appends the row to TASK.md's Cycles table,
sets the item's `status` (`done`, `retry` or `blocked`) and, on FAIL, prints
the next rung. Run it right after each verdict, one item at a time, so each
transcript is matched to the right item. If it reports `source: not found`,
rerun with `--worker-total-tokens <N>` from the Agent result's usage line —
a rough estimate, marked as one.

### 6. Escalate on FAIL

Follow `next` from the cycle output (or run `route.py route` for the item again):

| action | do |
|---|---|
| `add_check` | write a `check:` command into the item that the worker can run itself, then re-dispatch to the same agent and effort |
| `raise_effort` | re-dispatch to the same agent one effort level higher, with the validator's evidence |
| `next_model` | re-dispatch to the next agent up the ladder at medium, with the evidence |
| `reroute` | the item's signals changed; dispatch to the agent the router now names |
| `blocked` | stop work on the item; it goes in the report |

A PASS ends the loop for the item. Go back to step 3 for items that became ready.

### 7. Finish

When every item is `done` or `blocked`:

1. Run the `validator` once over the whole task (all acceptance criteria and
   the full diff) and log it:
   `ledger.py step --name final-validation --agent validator --role validator --verdict PASS`.
   On a FAIL, name the item responsible, set its status to `retry` and go
   back to step 2; those cycles count toward that item's three.
2. `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py summary`
3. Report to the user:
   - what changed (files) and the acceptance results;
   - blocked items: what failed on each rung and what you would try next
     (a different split, a clearer spec, or a stated route the user approves);
   - the ledger table — model, effort, verdict and cost per step — and the total,
     including your own orchestration cost;
   - the single-model line from the summary, labelled as a price-only
     comparison (another model would have used different tokens).
4. Don't commit unless the user asks. `.harness/` is working state; suggest
   adding it to `.gitignore` if it isn't there.

## Tuning the routing contract

`routing.yaml` is meant to change as the ledger fills up — for example, a
kind whose Haiku items keep failing should move up a tier, and a kind whose
Opus items always pass on the first cycle is worth trying on Sonnet. The
rule format, the scoped test, the guard, prices and keyword inference are
explained in `${CLAUDE_SKILL_DIR}/references/contract.md`. After any edit run
`python3 ${CLAUDE_SKILL_DIR}/scripts/route.py check`, which also confirms each
worker file pins the model its tier names.

## When something is off

- **The Agent tool doesn't know `worker-haiku` (or another worker):** the
  subagent files in `.claude/agents/` were added after the session started.
  Tell the user to restart Claude Code or open `/agents`; until then, don't
  substitute a different agent type with a `model` override.
- **A tier's model isn't available on this account** (the Agent call fails
  on the model): route that item one tier down at `high` effort, record it as
  `(fallback: <tier> unavailable)` in the item's route line, and mention it in
  the report.
- **The user wants a quick answer, not a run:** this harness is for work
  worth splitting. For a one-line question, just answer it.
