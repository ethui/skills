---
name: explain-transaction
description: Use when someone wants to understand what a transaction did — "explain this tx", "what happened in 0x...", "why did this transfer so much", "decode this transaction". Works on any chain with a public RPC, with or without a stack. For a transaction that FAILED and needs reproducing, use debug instead.
---

# explain-transaction

Turns a transaction hash into a narrative: what happened, who gained what, and what it cost.

Works on a plain mainnet hash with no stack at all, so it is useful before anyone has adopted
Stacks. When it runs against a stack, it ends with an explorer deep link.

## 1. Locate the transaction

Ask which chain if it is not obvious, then either:

- **On a stack** → `get_transaction` returns the transaction and its receipt together.
- **Anywhere else** → `cast tx <hash> --rpc-url <url>` and `cast receipt <hash> --rpc-url <url>`.
  `https://ethereum-rpc.publicnode.com` needs no key.

## 2. Decode

For the calldata, and for every log:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/find-abi.mjs --address <to> --root .
```

- **ABI found** → decode with `cast decode-calldata` and `cast decode-event`.
- **`{"source": null}`** → fall back to the selector:
  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/find-abi.mjs --selector 0x<8 hex chars>
  ```
  4byte returns *every* candidate signature. Pick by matching the argument count and types against
  the observed calldata length, and say which one you picked and why. If two remain plausible, show
  both rather than guessing.
- **Nothing** — show the raw calldata and say the ABI was not found and where you looked.

Token amounts need `decimals()` and `symbol()`, read from the chain rather than assumed. USDC is 6,
not 18, and assuming otherwise produces answers that are wrong by a million.

## 3. Balance diffs

Net changes per address, tokens and ETH together. Derive them from decoded `Transfer` events plus
the transaction value; for anything more exotic, `cast run <hash> --rpc-url <url>` prints the full
decoded call tree. Do not reach for `--trace-printer` — that is the opcode debugger.

`get_address` reports balances as `balance_wei` / `balance_hex`; there is no `balance` field.

## 4. Render

Follow `${CLAUDE_PLUGIN_ROOT}/reference/narrative.md`. It sets the order (outcome → who gained what
→ call path → events → cost → link), how to name addresses, and how to present amounts.

A successful ERC-20 transfer is two lines. Do not pad it.

## Reverts

If the transaction reverted, lead with the cause. `Error(string)` payloads are decoded already;
custom errors need the ABI from `find-abi.mjs`. When a revert cannot be decoded, say so and show
the raw selector — never invent a cause.

If the user wants to *reproduce* the failure rather than read about it, hand off to `/debug`, which
forks at the failing block and replays it on a chain they can share.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
