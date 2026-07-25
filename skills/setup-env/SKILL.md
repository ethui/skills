---
name: setup-env
description: Use when a web3 project needs a working dev chain — "set up my environment", "give me a testnet", "deploy my contracts somewhere I can share", or before any e2e/frontend work that needs a chain. Provisions an ethui stack, runs the project's own deploy against it, and wires the result into the project's existing convention.
---

# setup-env

The gateway skill. Provisions a stack, runs **the project's existing deploy** against it, and hands
back a URL other people can reach.

The point worth saying out loud to the user: the deploy runs against a URL, so the deployment
outlives this terminal. The frontend dev, the designer and CI all hit the same contracts with no
local `anvil` process to keep alive.

## 1. Resolve the stack

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/slug-for-project.mjs .
```

Call `list_stacks` and look for that slug.

- **Found** → reuse it. Do not recreate; the 5-stack quota is tight.
- **Not found** → `create_stack` with that slug.

Ask about forking before creating, unless the user already said:

- **Fork a chain** — needs `fork_url` and optionally `fork_block_number`.
  - *Head fork* (no block pinned): `https://ethereum-rpc.publicnode.com`, no key.
  - *Pinned to a block*: `https://eth.drpc.org`, no key. publicnode refuses archive requests, and a
    stack pinned to an older block **fails to boot** on it — 200 blocks back is already too old.
  - Read the head first and stay a few blocks behind it; a block past the head kills anvil outright.
- **Fresh chain** — no fork. Faster, no upstream round trips, but no real tokens or real liquidity.

Fork options are fixed at creation and cannot be changed later.

Record `chain_id`, `http_rpc_url` and `explorer` from the response. **Never assume 31337.**

## 2. Detect the project

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/detect-project.mjs .
```

This reports the toolchain, the deploy command it found, the env files and their keys, and whether
the frontend uses wagmi/viem/ethers.

## 3. Run the project's own deploy

Never reimplement a deploy. Use what the project has.

**Foundry** — anvil's standard dev accounts are prefunded on every stack, so account 0's key
works and no key management is needed:

```bash
forge script <detected script> \
  --rpc-url <http_rpc_url> \
  --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Addresses come back in `broadcast/<chain_id>/run-latest.json`, which is also the address → contract
name map that `find-abi.mjs` uses later. That file is a real artifact of the deploy; leave it.

Verified against a live stack on 2026-07-25: `forge create` with that key deployed and returned an
address with no funding step. If cast or forge fails with `invalid value ... for '--chain'`, the
shell has a stray `CHAIN` variable — re-run with `env -u CHAIN`.

**Hardhat** — `hardhat run` needs a *named* network, so it cannot take a bare rpc url. Either use an
existing localhost/custom entry with the rpc overridden by env, or show the user the block to add:

```ts
networks: {
  ethui: { url: process.env.ETHUI_RPC_URL, chainId: Number(process.env.ETHUI_CHAIN_ID) },
}
```

**Never rewrite a hardhat config silently.** Print it and let the user paste.

**Neither detected** — provision, print the rpc url and chain id, stop. Do not invent a deploy
command for a project you do not understand.

If the deploy fails, show its output verbatim. A failed `forge script` is the project's problem to
fix, not something to work around.

## 4. Wire it into the project's own convention

Match what the project already does. In order of preference:

1. **Existing env keys** — `detect-project.mjs` reports which keys exist in which `.env*` file
   (`NEXT_PUBLIC_RPC_URL`, `VITE_RPC_URL`, `CHAIN_ID`, `*_CONTRACT_ADDRESS`, …). Write the values
   into the file that already holds those keys, preserving its style.
2. **`wagmi.config.ts` / `deployments/`** — follow the existing shape.
3. **Foundry `broadcast/`** — already written by the deploy. Nothing more to do.
4. **Nothing recognisable** — print the values and stop. Do not invent a convention in someone
   else's repo.

Say **exactly which files changed**. If a file holding the rpc url is not gitignored, warn that the
url contains the api key.

## 5. Report

Always end with:

- rpc url (http and ws)
- chain id, stated explicitly as derived and not 31337
- deployed addresses, with contract names
- **explorer link**
- one line on what to do next: `/share` to hand it to someone, `/fund` for real tokens

## Failure modes

- `stack ... is not reachable: Stack failed to start, check its fork options` — surface verbatim.
  Usually a `fork_block_number` past the chain head.
- First call after ~10 minutes idle wakes anvil; on a forked stack that is ~10 seconds. Say it is
  waking, not hung.
- Quota reached (5 per user) — list stacks with ages, offer to prune `-dbg-` ones, never delete a
  project stack without confirmation.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
