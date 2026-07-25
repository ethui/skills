---
name: test-e2e
description: Use when a dapp needs browser tests against a real chain — "run e2e tests", "set up Playwright for my dapp", "test the frontend against a fork", "I can't automate MetaMask". Provisions a stack, injects a keyless wallet into the browser, and runs Playwright with snapshot isolation between tests.
---

# test-e2e

Playwright against a real chain, with no MetaMask and no private keys. Anvil auto-impersonates, so
the browser sends transactions unsigned.

## 1. Get a chain

Reuse the project's stack, or `/setup-env` if there is none. Fork if the tests need real tokens or
real liquidity.

Record `chain_id`, `http_rpc_url` and `ws_rpc_url`. **Never hardcode 31337** — a wrong chain id
fails signature validation in ways that look like wallet bugs.

## 2. Inject the wallet

Full provider source and the reasoning behind it:
`${CLAUDE_PLUGIN_ROOT}/reference/wallet-shim.md`.

The short version: `context.addInitScript` installs a minimal EIP-1193 `window.ethereum` that
answers `eth_accounts` and `eth_chainId` locally and forwards everything else to the stack.
`eth_sendTransaction` goes straight through with an impersonated `from`.

**Announce it over EIP-6963 as well.** wagmi v2 and RainbowKit discover wallets that way and will
not see a bare `window.ethereum`. The reference has the block.

Check the app first: if it uses `personal_sign`, `eth_signTypedData_v4` or SIWE login, impersonation
cannot help — there is nothing to produce a signature. Say so up front and offer a local signing
account instead, rather than letting the suite fail obscurely mid-run.

## 3. Seed state

Before the suite: fund the test accounts (`set_balance` for ETH, `/fund` for tokens), deploy if the
project has not already, and set up whatever preconditions the tests assume.

Do it once, then snapshot — re-seeding per test is slow, especially on a fork where every first
touch pays an upstream round trip.

## 4. Isolate tests with snapshots

Snapshot ids are **consumed on revert** — reverting to the same id twice errors. So:

```ts
test.beforeEach(async () => { snapshotId = await snapshot(); });
test.afterEach(async () => { await revert(snapshotId); });
```

Each test takes its **own** snapshot. Sharing one id across a suite fails on the second revert. Ids
are hex strings; pass them back verbatim.

**Do not run workers in parallel against one stack** — one worker's revert throws away another's
snapshot. Either set `workers: 1`, or give each worker its own stack and stay inside the 5-stack
quota.

## 5. Point the app at the chain

Use the project's existing env convention (`detect-project.mjs` reports it) — typically
`NEXT_PUBLIC_RPC_URL` / `VITE_RPC_URL` plus a chain id key. Set them for the test run rather than
editing committed config.

## 6. Run and report

Run the project's own Playwright command. On failure, give the transaction-level cause, not just the
assertion: pull the failing hash and decode it with `find-abi.mjs` per
`${CLAUDE_PLUGIN_ROOT}/reference/narrative.md`.

End with an **explorer link to the stack**, so a failing CI run is something a human can open and
inspect instead of a log to squint at. That is the part local anvil cannot do.

## Teardown

Leave the stack up if the user might want to inspect it; offer to delete it if it was created for
this run. Never delete a project stack without confirmation.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
