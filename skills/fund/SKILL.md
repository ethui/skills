---
name: fund
description: Use when an address needs tokens or ETH on a stack — "fund my wallet", "give me USDC", "I need test tokens", "the faucet is dry". Impersonates a real holder on a forked chain and sends real tokens, no faucet and no private key.
---

# fund

Real tokens, no faucet. On a forked stack, impersonate an address that actually holds the token and
transfer from it. Anvil auto-impersonates, so no key is involved.

## Preconditions

Needs a **forked** stack — a fresh chain has no token contracts to transfer from. If the active
stack is not forked, say so and offer `/setup-env` with a fork, or fall back to `set_balance` for
plain ETH, which works anywhere.

Resolve the stack with `slug-for-project.mjs` plus `list_stacks`.

## 1. ETH is the easy case

```
set_balance(address, amount)
```

Accepts decimal or hex. No impersonation, no fork needed. Done.

## 2. Tokens

**Verify the holder at runtime.** Candidates can come from anywhere — a known exchange wallet, a
recent `Transfer` sender — but never send from one without checking its balance first:

```bash
cast call <token> "balanceOf(address)(uint256)" <holder> --rpc-url <stack rpc>
```

A stale whale produces a confusing revert instead of a clear error, and holders do go stale.

Reading `Transfer` logs to *discover* a holder only works on a **head fork**. On a stack pinned to
an older block, `get_logs` is an archive request and the free providers reject it (`Archive requests
require a personal token`). On pinned stacks, verify a candidate by balance instead — state reads
work where log queries do not.

Then build the calldata locally and send it:

```bash
cast calldata "transfer(address,uint256)" <recipient> <amount>
```

```
execute(from: <holder>, to: <token>, data: <calldata>)
```

`from` is auto-impersonated. The receipt comes back with the `Transfer` event.

Amounts are in token units: **USDC is 6 decimals**, not 18. Read `decimals()` rather than assuming.

Common mainnet tokens, verified: USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`,
WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2`.

Verified end to end on 2026-07-25: 1000 USDC moved from a Binance hot wallet to anvil account 0 on
a mainnet head fork, receipt status 1, 62,248 gas, no key anywhere.

## 3. Confirm

Read the new balance back with `cast call` and report it in human units with the symbol.

If `cast` fails with `invalid value ... for '--chain'`, the shell has a `CHAIN` variable set that
cast does not recognise. Re-run with `env -u CHAIN`.

End with an **explorer link to the receiving address** so the user can see the balance in a UI.

## Failure modes

- **Holder ran out** — the fork's state is real, so a whale that has moved funds since the fork
  block will revert. Resolve another holder; do not retry the same one.
- **Token not on this chain** — check the fork's chain id matches where that token lives.
- **Not a forked stack** — nothing to impersonate. Say it plainly.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
