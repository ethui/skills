---
name: debug
description: Use when a transaction failed and someone needs to reproduce it — "debug this tx", "why did this revert", "I can't reproduce the bug", "reproduce this failure". Forks at the failing block, replays, explains the cause, and leaves a shareable chain behind so someone else can open the reproduction.
---

# debug

Reproduces a failure **and hands the reproduction to someone else**. The artifact is the chain, not
the trace.

Be honest about the boundary: forking, replaying and tracing do not need Stacks — `cast run <hash>
--rpc-url <public rpc>` does that locally. What needs Stacks is the reproduction *persisting
somewhere other people can hit*. Put that choice in front of the user rather than spending a stack
silently.

## The archive requirement, before anything else

Pinning a fork to an old block is an **archive request**, and the usual free provider refuses them.
A stack pinned to a block outside publicnode's recent window does not merely degrade — it **fails to
boot**:

```
stack ... is not reachable: Stack failed to start, check its fork options
```

A fork only 200 blocks back already triggers it. Since `/debug` pins by definition, use an
archive-capable provider:

- **`https://eth.drpc.org`** — no key, boots pinned forks, serves state reads at the pinned block.
  Verified 2026-07-25.
- `https://eth.llamarpc.com` — does not work.
- publicnode — head forks only.

If the user has an Alchemy or Infura key, prefer it; drpc is the no-key fallback.

## 1. Locate the failure

Get the transaction's chain and block number N (`cast tx <hash> --rpc-url <url>`). Confirm it
actually failed — if `status` is success, the user probably wants `/explain-transaction`.

## 2. Decide where to replay

**Fork options are fixed at creation.** `create_stack` takes `fork_url` and `fork_block_number`, and
nothing re-forks an existing stack at a different block. A stack forked at block M cannot reproduce
a failure at block N > M.

So:

1. **Active stack already forked from the same chain at a block ≥ N** → reuse it.
2. **Otherwise ask**, with these three options:
   - **Create a debug stack** *(default)* — forked at N−1, slug from
     `node ${CLAUDE_PLUGIN_ROOT}/scripts/slug-for-project.mjs . <hash>` (the `-dbg-<hash6>` form).
     Persistent, shareable, ends in an explorer link.
   - **Reuse and replace** — delete an existing `-dbg-` stack and recreate it at N−1, staying inside
     the 5-stack quota.
   - **Local only** — `cast run <hash> --rpc-url <public rpc>`. No stack, no link, instant.

Frame the question as *"do you need to give this to someone?"* — that is the actual difference.

## 3. Replay

On a stack: rebuild the transaction with `execute`, using the original `from` (auto-impersonated,
so no key), `to`, `value` and `data`.

Then get the decoded call tree:

```bash
cast run <hash> --rpc-url <stack rpc>
```

Plain `cast run` prints the trace. **Not** `--trace-printer` — that is the opcode-level debugger and
produces thousands of lines of `PUSH1`/`MSTORE` nobody can read. If cast fails with `invalid value
... for '--chain'`, the shell has a stray `CHAIN` variable; re-run with `env -u CHAIN`.

## 4. Explain the cause

Decode with `find-abi.mjs` and render per `${CLAUDE_PLUGIN_ROOT}/reference/narrative.md`. Lead with
one sentence naming the mechanism:

> Reverted in `Vault.deposit` → `USDC.transferFrom`: allowance is 0, the user approved the router
> at `0x68b3…` instead of the vault at `0xAbC0…`.

When the cause is a state precondition — allowance, balance, deadline, slippage, a pause flag — say
what the value **was** and what it **needed to be**. That is the sentence that ends the session.

Custom errors need the project's ABI; the server only decodes `Error(string)`.

## 5. Fix it live, then prove it

This is the part that only works on a stack. Repair the state with cheatcodes and replay:

- `set_balance` for ETH, `/fund` for tokens
- `execute` an `approve` from the impersonated user
- `set_block_timestamp` for an expired deadline

Replay the same transaction and show it succeed. Now the chain holds both the failing attempt and
the passing one.

## 6. Hand it over

End with the explorer link and a line the user can paste to whoever reported the bug — the chain has
the failure and the fix on it, and they need nothing installed to look.

**Warn that the link contains the api key**, so whoever opens it can write to that chain. Fine for a
disposable `-dbg-` stack; say it anyway.

Offer to prune the debug stack when they are done — `-dbg-` stacks exist to be deleted.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
