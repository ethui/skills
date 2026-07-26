# Context — ethui Stacks, for skill authors

Durable reference for building skills in this repo. `HANDOFF.md` covers what we decided and what's next; this file covers how the platform actually behaves.

## The product

**ethui Stacks** provisions disposable anvil chains on demand and serves each one on its own subdomain. A *stack* is one anvil instance (optionally with a subgraph and IPFS alongside), created by an authenticated user, addressable over HTTP and WebSocket, and inspectable in a hosted explorer.

Hosted at `stacks.ethui.dev`, api at `api.stacks.ethui.dev`. Self-hostable — server source is `github.com/ethui/stacks`, cloned at `~/Documents/Projects/stacks` (Elixir/Phoenix, anvil managed as OS processes under a supervision tree). The explorer is a separate repo, cloned at `~/Documents/Projects/explorer`.

The value over `anvil --fork-url` on your laptop is narrow and specific: **a URL other people can hit, an explorer humans can look at, and reachability for agents with no terminal on the box.** A skill that uses none of those three is a `cast` wrapper — see `HANDOFF.md` for how that filter is meant to be applied.

## Vocabulary

| term | meaning |
|---|---|
| **stack** | one anvil chain plus optional components, owned by a user |
| **slug** | its name and subdomain label. Lowercase alphanumeric + dashes. Reserved prefixes: `rpc`, `api`, `graph`, `graph-rpc`, `graph-status`, `ipfs` |
| **api key** | per-stack secret, embedded **in the rpc url path** — the url itself is the credential |
| **component** | optional extras on a stack: `graph`, `graph-rpc`, `graph-status`, `ipfs`, each on its own `<component>-<slug>` subdomain |
| **chain id** | derived per stack, *not* 31337 — see below |

## URL shapes

```
https://<slug>.stacks.ethui.dev/<api-key>      http rpc
wss://<slug>.stacks.ethui.dev/<api-key>        ws rpc
https://explorer.ethui.dev/rpc/<base64(ws_rpc_url)>
```

Locally the host is `<slug>.lvh.me` (port 4000 for the api), and with `ETHUI_STACKS_SAAS` unset there is no api key and no auth at all.

Explorer deep links append `/tx/<hash>`, `/address/<addr>`, `/block/<n>`. **`<n>` is decimal.** The explorer server knows nothing about your stacks, which is why the target rpc url rides along base64-encoded in the path.

Consequence worth repeating to users: an explorer link contains the api key, so it grants full rpc access — writes included — to anyone who has it.

## The explorer

`github.com/ethui/explorer` — a TanStack Start + vite app (package name `@ethui/site`), nitro server, vercel preset unless `VITE_TARGET=docker`. There is no separate "local explorer" build; it's the same app that serves `explorer.ethui.dev`.

```
yarn dev    # port 3000 → http://localhost:3000/rpc/<base64(ws_url)>
```

The nitro server does SSR, but every rpc call is made from the browser, so the machine rendering the page needs to reach the stack — a `lvh.me` url works locally, a private url won't work for a remote viewer.

Routes under `/rpc/$rpc`: index (latest blocks and transactions), `/tx/$tx`, `/address/$address`, `/block/$blockNumber`, and `/search`.

Encoding is plain `btoa`/`atob`, **not** url-safe base64, so `+` and `/` land raw in the path — encode the path segment when embedding a link somewhere strict. With no rpc in the url the app falls back to `ws://localhost:8545`.

Server-side, `Ethui.MCP.Explorer` builds every link and reads `EXPLORER_BASE` (default `https://explorer.ethui.dev`), so a self-hosted stacks server can point at a local explorer. The stacks *frontend* hardcodes the hosted url instead, so the two disagree when that env var is set.

## Chain ids are not 31337

A stack's chain id is derived from a 16-bit prefix (`0x00EE`) plus the stack's database id, giving values like `15597630`. Every skill that writes a wallet config, a viem/wagmi chain definition, a `foundry.toml` profile, or a Playwright fixture **must read `chain_id` from the stack** rather than assume the anvil default. Getting this wrong produces signature-validation failures that look like wallet bugs.

`create_stack` and `list_stacks` both return it.

## The MCP server

```
https://api.stacks.ethui.dev/mcp     streamable HTTP, protocol 2025-06-18
```

Elixir, built with `anubis_mcp`, running inside the Phoenix app — so tools reach anvil over its process-local port rather than through the public proxy. 15 tools, no ABI handling anywhere.

**Lifecycle**
- `create_stack` — `slug` optional (auto-generated `mcp-xxxxxxxx`), `fork_url`, `fork_block_number`. Returns slug, status, chain_id, http/ws rpc, explorer link.
- `list_stacks` — the caller's stacks only.
- `delete_stack` — irreversible, destroys chain state.

**Reads** — `get_block`, `get_transaction` (tx + receipt), `get_address` (balance, nonce, is_contract), `get_logs`.

**Writes, raw calldata only** — `simulate_call` (`eth_call`), `execute` (sends and waits for the receipt). `from` is **auto-impersonated**, so any address can send without a key. Omit `to` and put bytecode in `data` to deploy; the receipt's `contract_address` comes back.

**Cheatcodes** — `impersonate` (with a `stop` flag), `set_balance`, `mine`, `set_block_timestamp`, `snapshot`, `revert`.

Behaviours that will bite otherwise:

- Amounts (`value`, `balance`) accept **decimal or hex**; block params accept decimal, hex, or a tag.
- `get_logs` defaults its `from_block` **fork-aware**: the fork block on a forked stack, else `earliest`. Deliberate — defaulting to `earliest` on a mainnet fork forwards the whole historical range upstream and times out.
- `set_block_timestamp` mines a block by default, so the new time takes effect immediately.
- Snapshot ids come back as **hex strings** (`"0x4"`) and must go back to `revert` unchanged. Reverting twice to the same id is an error (`unknown or already consumed snapshot: 0x0`), but snapshots taken *after* the reverted one **survive** — verified against production on 2026-07-25, contrary to the usual anvil folklore.
- `get_address` returns `balance_wei` and `balance_hex`, not `balance`. Reading `.balance` silently yields `undefined`.
- Revert reasons are decoded only for the standard `Error(string)` payload. Custom errors come back raw — decode them locally.
- Tool errors arrive as `isError` content with a readable message, not as protocol errors. A stack owned by someone else reports as `stack not found`, deliberately, so slugs don't leak.
- Field defaults are **not** exposed in the JSON schema (the validation layer applies them at call time), so they're documented in the tool descriptions instead. Read descriptions, not just schemas.

## What the MCP deliberately does not do

No ABI encoding or decoding, no artifact reading, no key management, no `forge`/`cast` wrapping, no trace tools.

This is the central design decision: **`create_stack` returns the rpc url, so skills point the local toolchain at it.** `cast run`, `cast call`, `forge script`, viem — all work directly against the stack. MCP owns lifecycle and cheatcodes; depth belongs to whatever the user already has installed.

Before proposing a new server tool, check whether `cast` against the rpc url already does it. Usually it does.

## Auth

Bearer JWT in an `Authorization` header, the same token the REST api uses:

```
POST /auth/send-code    {"email": "..."}         → code by email
POST /auth/verify-code  {"email": "...", "code": "..."} → {"token": "<jwt>"}
```

Enforced at two layers: a router plug rejects tokenless requests with `401` before an MCP session is created, and each tool independently resolves the user and checks stack ownership.

Three things to design around:

1. Treat tokens as **long-lived credentials**. Do not build anything that assumes a token expires on its own, and store it like the secret it is — the local MCP registration, never a shared config or a commit.
2. Auth is enabled only when `ETHUI_STACKS_SAAS` is set. Against a local instance, no token is needed and `list_stacks` returns **every** stack in the database.
3. It's a plain bearer token, not OAuth 2.1, so one-click connect from claude.ai web won't work. Claude Code and Desktop with a custom header do.

The per-stack **api key** is a separate mechanism from the JWT: the JWT authorises the management api and MCP, the api key authorises rpc traffic and lives in the url.

## Operational limits and lifecycle

- **5 stacks per user**, 250 globally. Skills that create stacks should reuse or prune, not accumulate.
- Anvil **suspends after ~10 minutes idle** and resumes on the next request. The first call after a suspend pays the boot cost; on a forked stack that's roughly 10 seconds, and up to a 30-second ceiling before the server gives up.
- A stack whose anvil can't boot at all — bad `fork_url`, a `fork_block_number` ahead of the chain head — returns `stack ... is not reachable: Stack failed to start, check its fork options`. Surface that message to users; it's the common self-inflicted failure.
- Auto-mining is instant by default, so `execute` receipts are available immediately. There's no `--block-time` option exposed.
- Forked state is lazily fetched from upstream, so the first touch of any given account or slot pays a round trip to the fork provider. Wide historical queries are slow or fail; keep ranges tight.

## Verified recipes

Both of these were run end to end against production, so they're known-good starting points.

**Fund with real tokens instead of a faucet** — fork mainnet, then `execute` an ERC-20 `transfer` with `from` set to a large holder. No key, no faucet, real balances. Verified with USDC (`0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`) from a Binance hot wallet (`0x28C6c06298d514Db089934071355E5743bf21d60`): 1000 USDC moved, `Transfer` event emitted, receipt status success. Whale addresses go stale — resolve holders at runtime rather than hardcoding a list.

**Fork at a specific block** — read the provider's head first and stay a few blocks behind it. A block number past the head kills anvil outright.

**Pinned forks need an archive provider.** `https://ethereum-rpc.publicnode.com` serves head forks fine, but rejects any request for a block outside its recent window with `Archive requests require a personal token`. Two consequences, both verified on 2026-07-25:

- Creating a stack pinned to an older block **fails to boot**: `Stack failed to start, check its fork options`. A fork only 200 blocks back was already too old.
- A stack pinned when its block *was* recent keeps running, then degrades: state and log reads for anything not already cached start returning 403 once the block ages out. `get_logs` on such a stack fails outright.

`https://eth.drpc.org` serves archive requests without a key and boots pinned forks correctly (verified at 200 blocks back: state reads, `symbol()`, `balanceOf`). `https://eth.llamarpc.com` does not. Use publicnode for head forks and drpc for anything pinned — this is what makes `/debug` viable at all.

Calldata for both was hand-encoded (`0xa9059cbb` + padded args) precisely because the server has no ABI layer — in a skill, use `cast calldata` instead.

## Conventions for this repo

- **Always end with an explorer link.** It's what converts "the agent says it worked" into "look at it yourself", and it's the one thing every skill in the palette shares.
- **Read `chain_id` from the stack**, never hardcode.
- **Warn before sharing** — explorer and rpc urls carry the api key.
- **Deletion is irreversible** and there's no undo for `delete_stack`. Confirm unless the user named the stack explicitly.
- Skills land in **someone else's project**. Detect, don't assume — and prefer reusing the project's existing deploy tooling over reimplementing it.
