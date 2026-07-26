---
name: restore
description: Use when a chain needs to go back to a saved state — "restore X", "revert to the snapshot", "put it back how it was", "reset to vesting-half-done". Reverts the stack to a named snapshot and immediately re-takes it so the name stays usable.
---

# restore

Puts a stack back to a named state. This is what someone types under pressure, so it is short and
it warns about the one behaviour that surprises people.

## 1. Find the name

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs lookup <slug> <name>
```

If the name is unknown, list what exists rather than guessing:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs list <slug>
```

## 2. Warn, then revert

Reverting **throws away current chain state**, including anything deployed or transacted since the
snapshot. Confirm first unless the user named the snapshot explicitly in their request.

Then call `revert` with the id.

## 3. Re-take it immediately

The id is consumed by the revert, so the name would otherwise be dead on arrival. Call `snapshot`
again right away and record the new id under the same name:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs record <slug> <name> <new id>
```

## 4. Drop the consumed id

Only the id you reverted to is consumed; snapshots taken after it stay valid and revertable
(verified against production on 2026-07-25). So there is no cascade to warn about — just forget the
id that was spent:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs consume <slug> - <id>
```

Step 3 has already re-recorded the name against a fresh id, so the name keeps working.

## 5. Confirm

State the block number and timestamp after the revert, and end with an explorer link so the user
can see the restored state.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
