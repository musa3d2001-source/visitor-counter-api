# TASK.md template

The orchestrator (the main session) writes `.harness/TASK.md` before any work
is dispatched. `route.py` reads each work item's signals and the Cycles table
from it; `ledger.py` appends to the Cycles table and updates `status:`.
Keep the headings and field names as below, since both scripts parse them.

```markdown
# Task: <one-line request>

## Goal
<What done looks like, in two or three sentences. Workers never see the
conversation, so anything they need goes here or in the item.>

## Acceptance criteria
- AC1: <observable result> — check: `<command that exits 0 on success>`
- AC2: <observable result> — check: `<command>`
- AC3: <a criterion that needs judgement> (judgement: the validator reads <file/area>)

## Work items

### W1: <short imperative title>
- kind: search
- spec: clear
- files: 0
- repos: 1
- assets: none
- edits_code: no
- check: `grep -rn "port" src`
- after: none
- acceptance: <what this item must return>
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
- acceptance: AC1, AC2
- route: (filled in from route.py)
- status: todo

## Cycles

| item | cycle | agent | model | effort | check | verdict | cost | note |
|---|---|---|---|---|---|---|---|---|
```

`ledger.py` fills the Cycles table; you don't write rows by hand. The first time it logs, it also
adds a `<!-- harness-task: <id> -->` line under the title; leave it there, since
`ledger.py start --resume` finds the task by it.

## Fields

| field | values | used for |
|---|---|---|
| `kind` | one kind from `route.py kinds` (e.g. `search`, `scoped fix`, `debugging`), or `unsure` | picks the rule. One kind per item — two kinds on different tiers make the router take the harder one and ask for a split. `unsure` goes straight to the default (Opus at medium). Left out, the router guesses from the title's words. |
| `spec` | `clear` or `open` | `clear` plus small counts makes the item *scoped* (needed by the `scoped fix` rule). Leave it `open` when the item still needs design. |
| `files` | a number or a comma list of paths | counted against `scoped.max_files` |
| `repos` | a number or a comma list | more than `scoped.max_repos` adds the `multi-PR feature` kind |
| `assets` | comma list of paths (files or folders), or `none` | images add the `images` kind; log files (by extension or a `log`/`logs` folder) with no stated kind route as `read logs`; total size over `scoped.max_source_tokens` makes the assets large. Put pasted screenshots here when they exist as files, so the worker can open them. |
| `edits_code` | `yes` / `no` | the guard: Haiku only runs items that state `no` |
| `computer_use` | `yes` / `no` (optional) | adds the `computer use` kind |
| `check` | a command the worker can run itself, or `none` | copy in the checks of the criteria the item serves. With a check, the first escalation rung (give the worker a check) is already done. |
| `after` | item ids this one depends on, or `none` | dispatch order. Items with no unfinished dependency can run in parallel; an item that waits on a blocked item is blocked too. |
| `route` | written by you from route.py's output; add `(user override)` when the user chose the model | an audit trail of why the item ran where it ran |
| `status` | `todo`, `running`, `retry`, `done`, `blocked` | `ledger.py` sets `done` / `retry` / `blocked` |
| `blocked_by` | an item id | written by `ledger.py` when a dependency was blocked |

## Splitting a request into items

- Split along model lines: the read-only parts (search, read logs, summarize,
  classify) become their own items so they route to Haiku, and the edit
  becomes another item that receives their findings.
- One item = one worker dispatch = one thing a validator can say PASS or FAIL to.
- Prefer two to six items. A one-line request usually needs two or three
  (find → change); planning and the final validation are yours.
- Acceptance criteria should be checkable by a command wherever possible —
  a worker that can run its own check needs fewer cycles.
