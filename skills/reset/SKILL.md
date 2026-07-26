---
name: reset
description: Use when a chain is beyond saving — "reset the chain", "start over", "nuke it and redeploy", "clean nonces", or when the stack quota is full. Deletes and re-provisions a stack, or prunes disposable debug stacks.
---

# reset

Nuke and re-provision. Also the quota-management skill, because 5 stacks per user is tight.

## Deletion is irreversible

`delete_stack` destroys chain state with no undo. **Confirm before every deletion** unless the user
named the stack explicitly in their request. List what will be destroyed first: slug, chain id,
deployed contracts if known, age.

## 1. Decide what is being reset

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/slug-for-project.mjs .
```

Then `list_stacks`, and sort what comes back:

- **Project stacks** — plain slug, usually carrying deployments. Never delete without explicit
  confirmation.
- **Disposable stacks** — `-dbg-<hash6>` suffix, created by `/debug`. Safe to prune, and the first
  thing to offer when the quota is full.

## 2. Prune, or reset

**Pruning** (quota full, nothing else wrong): delete `-dbg-` stacks, oldest first, and report how
many slots freed.

**Resetting** a project stack:

1. Note its current fork options — `fork_url` and `fork_block_number` are fixed at creation, so
   recreating without them loses the fork.
2. `delete_stack`.
3. `create_stack` with the same slug and the same fork options.
4. Hand off to `/setup-env` to redeploy and rewire, rather than reimplementing the deploy here.

The chain id **changes** on recreate — it derives from the stack's database id, so the new stack
gets a new one. Anything holding the old chain id (wallet config, `.env`, Playwright fixture) needs
updating; `/setup-env` handles that in step 4, but say it out loud.

## 3. Report

New rpc url, new chain id (flagged as changed), redeployed addresses, explorer link.

Also clear stale snapshot names, which point at ids on a chain that no longer exists:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/snapshot-store.mjs clear <slug>
```

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
