---
name: snapshot
description: Use when a chain state is worth keeping — "snapshot this", "save this state", "remember this as X", "I want to come back to this". Captures the stack's current state under a human name so QA and designers can return to it later.
---

# snapshot

Named world states — `vesting-half-done`, `position-underwater`, `dao-vote-live` — so nobody has to
hand-craft state twice. Impossible on a testnet, unshareable on a local anvil.

## 1. Take it

Resolve the stack (`slug-for-project.mjs` + `list_stacks`), then call `snapshot`. The tool returns
an id.

Record the name against it:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs record <slug> <name> <id>
```

The store lives in `~/.ethui/snapshots/<slug>.json`, outside the host project. It holds ids only —
no urls, no keys — so it is safe and pointless to copy anywhere else.

If no name was given, ask for one. An unnamed snapshot is an id nobody will recognise in an hour.

## 2. Say what it captured

Report the name, the block number, and a one-line description of what state it holds. That
description is what makes it useful to a designer opening it next week.

List existing snapshots when it helps:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs list <slug>
```

## The rule that trips everyone

**Ids are one-shot.** Reverting consumes the id, and reverting to it again errors with `unknown or
already consumed snapshot`. That is why `/restore` re-snapshots immediately.

Snapshots taken *after* the reverted one **do survive** — verified against production on
2026-07-25, contrary to the usual anvil folklore. So a suite can hold several named states at once
and jump between them, as long as each name is refreshed after it is used.

Ids come back as hex strings (`"0x4"`). Keep them verbatim; `snapshot-store.mjs` does.

## Sharing

A snapshot is only useful to other people if they can reach the chain — pair this with `/share`.
That link carries the api key, so warn before sending it.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
