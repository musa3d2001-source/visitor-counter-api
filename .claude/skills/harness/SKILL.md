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
  signals (the request, its assets, the repo) to `routing.yaml`. When unsure,
  it starts on Opus at medium.
- **Measure.** A higher token price is not always a higher cost per finished
  task — a cheap model that needs three cycles can cost more. The ledger reads
  token usage from the subagents' own transcripts, so the contract can be
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
   and write `route: <agent> @ <effort> (user override)`; the router then
   escalates from that choice one rung at a time.
3. **Code edits never run on Haiku.** The router skips Haiku unless an item
   states `edits_code: no`. `worker-haiku` has no file-editing tools; its
   shell is read-only by instruction, which is why you check `git status`
   after it runs.
4. **Every worker run ends in the ledger** — a cycle with a verdict, or a step.
5. **Escalate only on a failed check**, one rung at a time, at most three
   cycles per item. Then the item is blocked and you report it — you don't
   quietly finish it yourself on the session model, which would hide the cost
   and skip the check.

The scripts live in `${CLAUDE_SKILL_DIR}/scripts/`. Run them exactly as shown,
from the project root (that form is pre-approved); they keep state in
`.harness/` (TASK.md and ledger.jsonl).

## The loop

### 0. Start

- If `.harness/TASK.md` exists and has items that are not `done` or
  `blocked`: with no request in `$ARGUMENTS`, resume it; with a new request,
  ask whether to resume it or start fresh. Resuming: run
  `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py start --resume`, then go to
  step 2 for the unfinished items (route.py reads their cycles and status).
- Starting fresh with an old TASK.md present: move it to
  `.harness/archive/<task-slug>.md` first.
- No TASK.md to resume and no request in `$ARGUMENTS`? Ask what to do.
- Open the ledger (also for `--plan`, so planning is costed):
  `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py start --title "<the request in a few words>"`
- `--plan` at the start of the arguments means: do steps 1 and 2, show the
  plan table (item, kind, route, why), run
  `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py summary` (it closes the
  planning window and shows its cost), and stop. To run the plan later, the
  user says so or runs `/harness` with no request, and you resume as above.

### 1. Orchestrate: write `.harness/TASK.md`

Read `${CLAUDE_SKILL_DIR}/references/task-template.md` for the exact format
(both scripts parse it). Read only as much of the repo as you need to write:

- **Goal** — what done looks like. Workers never see this conversation, so
  the goal and each item must stand on their own.
- **Acceptance criteria** — each with a check a worker can run itself (a test
  command, a grep, a script).
- **Work items** — split along model lines: read-only parts (find, read logs,
  summarize, classify) become their own items so they route to Haiku, and the
  change becomes an item that receives their findings. For each item state:
  - `kind`: one kind from `python3 ${CLAUDE_SKILL_DIR}/scripts/route.py kinds`,
    or `unsure` when none fits — `unsure` starts it on Opus at medium. Always
    state one; without it the router guesses from the title's words.
  - `check`: copy in the runnable checks of the criteria the item serves. An
    item with a check skips the first escalation rung, which saves a cycle.
  - `spec`, `files`, `repos`, `assets`, `edits_code`, `after` as in the template.
- **Images** the user pasted: if the image exists as a file (an uploads
  path, a screenshot on disk), list that path in `assets:` and in the brief's
  Context line so the worker can open it. If it exists only in this
  conversation, describe what matters in the brief and don't count it as an
  image — the worker cannot see it.

Planning and the final report are your work, not work items.

### 2. Route

For each item that is not done:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/route.py route --task .harness/TASK.md --item W1
```

The JSON gives `agent`, `effort`, `rule`, `status`, `next` and `warnings`. Then:

- Write the route into the item, e.g.
  `- route: worker-haiku @ medium — rule 2: search | read logs | summarize`.
- Act on `warnings`: "edits_code not stated" → state it and route again;
  "split" or "one kind per item" → split the item; "asset(s) not found" → fix
  the path.
- `status: done` → skip the item. `status: blocked` → it goes in the report.

With `--plan`, show the table now, run `ledger.py summary`, and stop.

### 3. Execute

Dispatch each ready item (status not done or blocked, every `after:` item
done) with the Agent tool: `subagent_type` = the route's `agent`, `effort` =
the route's `effort`, no `model`. Independent items go out in the same message
so they run in parallel. Set the item's `status: running`. Run
`git status --porcelain` just before dispatching, so step 4 has a baseline.

The worker's prompt is its whole world. Use this brief; **keep its first line
exactly**, because the ledger matches each run to its item by that line:

```
Harness work item <W#>: <title>

Task goal: <goal>
This item: <what to do>. Done means: <the item's acceptance>.
Acceptance criteria it serves: <AC lines with their checks>
Context: <paths, asset files, and the findings from earlier items it needs, pasted in>
Self-check: run `<check>` before you reply.            <- omit if the item has none
Constraints: do only this item, follow the repo's style, no commits or pushes.
Previous attempt: cycle <n> on <agent> @ <effort> failed. Validator evidence:
<evidence and fix hint>                                 <- only on a retry
Reply in your STATUS format.
```

If a worker replies `STATUS: STUCK`, no check ran, so it is not a cycle. Log it:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py step --name "<W#> stuck" --agent <agent> --item <W#> --verdict STUCK --note "<why>"
```

Then fix the cause once: give it the missing information and re-dispatch, or —
when Haiku says the item needs code edits — set `edits_code: yes` and route
again (the new tier gets its own retry). A second STUCK from the same agent
on the same item blocks it; the ledger says so and blocks its dependents.

### 4. Verify

- **The item changed files** → dispatch `validator` (effort from the
  contract, medium). First line of its prompt: `Harness validation <W#>: <title>`.
  Give it the item and its acceptance criteria, the check commands, and the
  worker's reply (files changed, check output). It replies with
  `VERDICT: PASS | FAIL` and evidence.
- **The item was read-only** → check it yourself; a validator run would cost
  more than the item. Does the reply answer the item's acceptance? Open one
  or two of its `path:line` findings to confirm them. Compare `git status
  --porcelain` with the step-3 baseline: every new change outside `.harness/`
  must be one an editing worker in the same round reported under FILES
  CHANGED; a change nobody reported fails the read-only item. Then use
  `--validator none` in the next step.

### 5. Log the cycle

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py cycle --item W2 --worker worker-sonnet \
  --effort medium --verdict FAIL --note "<one line: what failed or what passed>"
```

It finds the worker's and the validator's runs for that item, measures their
tokens, effort and cost, appends the row to TASK.md's Cycles table, and sets
the item's `status` (`done`, `retry` or `blocked`; items that wait on a
blocked item are blocked too). On FAIL it prints the next rung. Read its
`warnings`: an effort mismatch means the routed effort did not take effect
(often `CLAUDE_CODE_EFFORT_LEVEL` is set), and the ledger records what ran.

If it says "nothing logged", it could not find the run; nothing was written.
Rerun once with what it suggests: `--worker-transcript <path>` or
`--worker-agent-id <id>` when you know the run, else `--worker-total-tokens N`
from the Agent result (marked as an estimate).

### 6. Escalate on FAIL

Follow `next` from the cycle output (`route.py route` for the item gives the
same answer):

| action | do |
|---|---|
| `add_check` | the failed run had no check: write a `check:` command into the item that the worker can run itself, then re-dispatch to the same agent and effort |
| `raise_effort` | re-dispatch to the same agent one effort level higher, with the validator's evidence |
| `next_model` | re-dispatch to the next agent up the ladder at medium, with the evidence |
| `reroute` | the item's signals changed; dispatch to the agent the router now names |
| `blocked` | stop work on the item; it goes in the report |

A PASS ends the loop for the item. Go back to step 3 for items that became ready.

### 7. Finish

When every item is `done` or `blocked`:

1. Final validation — only when no item is blocked (with a blocked item the
   acceptance criteria cannot all pass; skip it and say so) and at least one
   item changed files (if every item was read-only, your step-4 checks stand).
   Dispatch the `validator` once over the whole task — first line
   `Harness final validation: <task title>`, all acceptance criteria and the
   full diff — and log it:
   `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py step --name final-validation --agent validator --role validator --verdict <PASS|FAIL>`.
   On a FAIL, name the item(s) responsible and log against them instead: add
   `--item W2` (or `--item W2,W3`) `--note "<what failed>"`. That logs the run
   once and reopens each item as a failed cycle; go back to step 2 for them
   (it counts toward each item's three). An item already blocked stays blocked.
2. `python3 ${CLAUDE_SKILL_DIR}/scripts/ledger.py summary`
3. Report to the user:
   - what changed (files) and the acceptance results;
   - blocked items: what failed on each rung and what you would try next
     (a different split, a clearer spec, or a stated route the user approves);
   - the ledger table — model, effort, verdict and cost per step — and the
     total, including your own orchestration cost;
   - the single-model line from the summary, labelled as a price-only
     comparison (another model would have used different tokens and cycles).
4. Don't commit unless the user asks. `.harness/` is working state; suggest
   adding it to `.gitignore` if it isn't there.

## Tuning the routing contract

`routing.yaml` is meant to change as the ledger fills up — for example, a
kind whose Haiku items keep failing should move up a tier, and a kind whose
Opus items always pass on the first cycle is worth trying on Sonnet. The rule
format, the scoped test, the guard, prices and keyword inference are explained
in `${CLAUDE_SKILL_DIR}/references/contract.md`. After any edit run
`python3 ${CLAUDE_SKILL_DIR}/scripts/route.py check`, which also confirms each
worker file pins its tier's model and cannot start subagents of its own.

## When something is off

- **The Agent tool doesn't know `worker-haiku` (or another worker):**
  `.claude/agents/` did not exist when this session started, so its files were
  not loaded. The user needs to restart Claude Code. Until then don't
  substitute another agent type with a `model` override — that run would not
  be the routed worker.
- **A tier's model isn't available on this account** (the Agent call fails on
  the model): add `--unavailable <tier>` to every `route.py` and `ledger.py`
  call for the rest of the task (anywhere on the command line). The router then moves the item up the ladder
  (or, at the top, one tier down at high effort, never onto a guarded tier)
  and records the fallback in its rule.
- **Approval prompts for the scripts** after the user replied mid-run (to a
  question or a `--plan`): the pre-approval lasts for the turn the skill was
  invoked in. Re-running `/harness` restores it; to stop the prompts for good,
  the user can allow `Bash(python3 *.claude/skills/harness/scripts/route.py *)`
  and the same for `ledger.py` in their settings.
- **A computer-use item comes back STUCK for lack of tools:** `worker-opus`
  has a tool allowlist without MCP tools, to keep each dispatch small. Add the
  computer-use MCP tool names to its `tools:` line (or make a variant agent
  for it) and route again.
- **The user wants a quick answer, not a run:** this harness is for work
  worth splitting. For a one-line question, just answer it.
