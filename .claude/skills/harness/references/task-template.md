# TASK.md template

The orchestrator (the main session) writes `.harness/TASK.md` before any work
is dispatched. `route.py` reads each work item's signals and the Cycles table
from it; `ledger.py cycle` appends to the Cycles table and updates `status:`.
Keep the headings and field names exactly as below, since both scripts parse them.

```markdown
# Task: <one-line request>

## Goal
<What done looks like, in two or three sentences. Workers never see the
conversation, so anything they need goes here or in the item.>

## Acceptance criteria
- AC1: <observable result> — check: `<command that exits 0 on success>`
- AC2: <observable result> — check: `<command>`
- AC3: <a criterion that needs judgement> — check: validator reads <file/area>

## Work items

### W1: <short imperative title>
- kind: search
- spec: clear
- files: 0
- repos: 1
- assets: none
- edits_code: no
- check: none
- after: none
- acceptance: <what this item must return or change>
- route: (filled in from route.py)
- status: todo

### W2: <short imperative title>
- kind: scoped fix
- spec: clear
- files: src/config.js, src/server.js
- repos: 1
- assets: none
- edits_code: yes
- check: `npm test -- config`
- after: W1
- acceptance: <AC ids this item satisfies>
- route: (filled in from route.py)
- status: todo

## Cycles

| item | cycle | agent | model | effort | verdict | cost | note |
|---|---|---|---|---|---|---|---|
```

## Fields

| field | values | used for |
|---|---|---|
| `kind` | one kind from `route.py kinds` (e.g. `search`, `scoped fix`, `debugging`) | picks the rule. One kind per item; if an item needs two, split it. |
| `spec` | `clear` or `open` | `clear` plus small counts makes the item *scoped* (needed by the `scoped fix` rule). Leave it `open` when the item still needs design. |
| `files` | a number or a comma list of paths | counted against `scoped.max_files` |
| `repos` | a number or a comma list | more than `scoped.max_repos` adds the `multi-PR feature` kind |
| `assets` | comma list of paths (files or folders), or `none` | images add the `images` kind; logs with no stated kind route as `read logs`; total size over `scoped.max_source_tokens` makes the assets large |
| `edits_code` | `yes` / `no` | the guard: an item that edits code never runs on haiku |
| `computer_use` | `yes` / `no` (optional) | adds the `computer use` kind |
| `check` | a command the worker can run itself, or `none` | when present, the first escalation step (give the worker a check) is already done |
| `after` | item ids this one depends on, or `none` | dispatch order; items with no unfinished dependency can run in parallel |
| `route` | written by you from route.py's output | an audit trail of why the item ran where it ran |
| `status` | `todo`, `running`, `retry`, `done`, `blocked` | `ledger.py cycle` sets `done` / `retry` / `blocked` |

## Splitting a request into items

- Split along model lines: the read-only parts (search, read logs, summarize,
  classify) become their own items so they route to haiku, and the edit
  becomes another item that receives their findings.
- One item = one worker dispatch = one thing a validator can say PASS or FAIL to.
- Prefer two to six items. A one-line request usually needs two or three
  (find → change → validate); planning and the final validation are yours.
- Acceptance criteria should be checkable by a command wherever possible —
  a worker that can run its own check needs fewer cycles.
