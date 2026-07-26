# ethui Skills — Design

Date: 2026-07-25
Status: implemented, validated against production

## Validation, 2026-07-25

Driven against the live MCP endpoint. What it changed:

| finding | consequence |
|---|---|
| Pinned forks **fail to boot** on publicnode (`Archive requests require a personal token`) — 200 blocks back is already too old | `/debug` defaults to `https://eth.drpc.org`, which boots pinned forks and serves state reads at the pinned block. llamarpc does not work. Without this the headline demo beat is impossible. |
| A stack pinned while its block was fresh degrades later — uncached state reads and all `get_logs` start returning 403 | `/fund` verifies holders by `balanceOf` rather than discovering them from logs on pinned stacks |
| Snapshots taken **after** a reverted one survive | `/restore` has no cascade to warn about; `snapshot-store.mjs` consumes one id instead of invalidating a range |
| Snapshot ids are hex strings (`"0x4"`) | the store keeps the raw value and sorts on a separate numeric field |
| `get_address` returns `balance_wei` / `balance_hex`, never `balance` | reading `.balance` yields `undefined` silently |
| `cast run --trace` is not a flag; `--trace-printer` is the opcode debugger | every skill now says plain `cast run <hash> --rpc-url` |
| `qrcode-terminal` reads stdin, not argv | `share-qr.mjs` pipes the url; the argv form exits 0 and prints nothing |
| A stray `CHAIN` env var breaks `cast call`/`cast send` but not `cast chain-id` | skills tell the user to re-run with `env -u CHAIN` |

Verified working end to end: impersonated whale transfer (1000 USDC, receipt status 1, 62,248 gas,
no key), `forge create` deploy with the anvil dev key, ABI discovery from foundry `out/` and from
live 4byte, `cast run` decoded traces, snapshot/revert state round-trip, and QR rendering.

A Claude Code plugin that drives [ethui Stacks](https://github.com/ethui/stacks) from inside
someone else's web3 project. Platform reference lives in `CONTEXT.md`; this document covers what
we are building and why it is shaped this way.

## The filter

Stacks beats a local `anvil --fork-url` on exactly three things: **a URL other people can hit, an
explorer humans can look at, and reachability for an agent with no terminal.** Every skill here
must use at least one. A skill that uses none is a `cast` wrapper and does not belong in the
plugin.

This filter has teeth. It already forced `/debug` to be redesigned (see below) and it is the
reason `/share` exists as its own command.

## Decisions

| # | question | decision |
|---|---|---|
| 1 | Audience | Cold hackathon devs who have never heard of Stacks. `/ethui-init` is mandatory step zero; first-run friction is the product. |
| 2 | Distribution | Claude Code plugin with a marketplace entry. Shared helpers live at `${CLAUDE_PLUGIN_ROOT}`. |
| 3 | `/setup-env` handoff | Detect the host project's existing convention and write in that shape; if nothing is recognisable, print the values and stop. Never invent a convention in a repo that has one. |
| 4 | `/debug` vs `/explain-transaction` | Two commands. Different preconditions, different outputs, and slash-command discoverability is the UX. |
| 5 | `/test-e2e` wallet | Injected EIP-1193 provider via `addInitScript`, sending unsigned through anvil's auto-impersonation. No private key in tests. |
| 6 | Active-stack resolution | Derive the slug from the host project's directory name, confirm with `list_stacks`. No state file in someone else's repo. |
| 7 | Shared pieces | Hybrid: mechanical work in dependency-free scripts, judgment work in reference prose. |

## Architecture

```
.claude-plugin/
  plugin.json                 name: ethui
  marketplace.json            /plugin marketplace add ethui/skills
skills/
  ethui-init/                 setup-env/
  explain-transaction/        debug/
  fund/                       test-e2e/
  snapshot/                   restore/
  time-travel/                share/
  reset/
reference/
  stack-basics.md             vocabulary, url shapes, chain-id rule, quotas, suspend
  narrative.md                how to render a decoded transaction
  wallet-shim.md              the injected EIP-1193 provider for /test-e2e
scripts/
  slug-for-project.mjs        project directory -> candidate stack slug
  find-abi.mjs                address or selector -> ABI
  detect-project.mjs          toolchain, deploy command, env convention
  share-qr.mjs                url -> QR in the terminal
  snapshot-store.mjs          snapshot name -> id, with revert invalidation
tests/                        node:test over the scripts
```

Each palette item is one skill directory, so it is both invocable as `/ethui:fund` and
auto-triggerable by its description. There is no separate `commands/` directory — two copies of
every entry point is not worth the discoverability it would add.

`reference/` is deliberately **not** a skill. It is prose loaded on demand from
`${CLAUDE_PLUGIN_ROOT}/reference/`, which keeps each `SKILL.md` short without inventing a
user-facing skill nobody would ever invoke.

### Why hybrid helpers

Mechanical work — finding an ABI, sanitising a slug, detecting a toolchain — is deterministic,
worth testing, and wasteful to re-derive on every run. It goes in scripts.

Judgment work — explaining why a transaction reverted, describing who gained what — cannot be
scripted. It goes in reference prose that the model reads.

`cast` remains the decode engine. `cast decode-calldata`, `cast decode-event` and
`cast 4byte-decode` already work given a signature, so the scripts only solve **ABI discovery**,
which is the hard part and the capability the server deliberately omits.

Scripts depend on the node standard library, `cast`, and `fetch`. Nothing is ever installed into
the host project.

## Shared piece: active-stack resolution

`slug-for-project.mjs` turns the host project's directory name into a candidate slug: lowercased,
non-alphanumerics collapsed to dashes, trimmed to a sane length, and rejected if it collides with
a reserved prefix (`rpc`, `api`, `graph`, `graph-rpc`, `graph-status`, `ipfs`).

The script does not call the API. Scripts cannot reach MCP tools — only the model can — so the
model calls `list_stacks` and matches the candidate against the result. This keeps the script pure
and testable, and keeps auth entirely inside MCP.

Disposable stacks are named `<slug>-dbg-<hash6>`. The prefix is a contract: `-dbg-` stacks are
safe to prune, project stacks never are.

## Shared piece: ABI discovery

`find-abi.mjs` resolves in this order, stopping at the first hit:

1. **Foundry broadcast** — `broadcast/**/run-latest.json` maps deployed addresses to contract
   names, then `out/**/*.json` gives the ABI. This is the only source that resolves an *address*
   rather than a name, which is why it comes first.
2. **Foundry out** — `out/**/*.json` by contract name.
3. **Hardhat** — `artifacts/**/*.json` by name, `deployments/*.json` for address + ABI.
4. **node_modules** — for dependency contracts such as OpenZeppelin.
5. **4byte** — `https://www.4byte.directory/api/v1/signatures/` for an unknown selector, returning
   candidate signatures rather than an ABI.

Output is JSON: `{ source, name, abi }`, or `{ source: "4byte", signatures: [...] }`, or
`{ source: null }`. Ambiguous 4byte results are returned in full and disambiguated by the model
against the observed argument count — never silently picked.

## The palette

Ranked by importance. Cost is rough build size.

### 1. `/ethui-init` — bootstrap (S)

Step zero for a cold dev. Prompts for an email, `POST /auth/send-code`, waits for the code,
`POST /auth/verify-code`, then registers the MCP for **this project**:

```
claude mcp add --transport http ethui-stacks https://api.stacks.ethui.dev/mcp \
  --header "Authorization: Bearer <jwt>"
```

Idempotent: detects an existing entry and only re-points it if the url or token is stale. Tells
the user the tools appear after `/mcp` reconnect or a session restart, because they will not be
loaded in the session that ran the command.

Never prints the token.

### 2. `/setup-env` — provision and deploy (M)

The gateway. Everything else assumes a stack exists.

1. Resolve or create the project's stack (`slug-for-project.mjs` + `list_stacks`). Fork options
   come from the user or the project's own config; a fork url is not assumed.
2. Run the project's **existing** deploy, detected by `detect-project.mjs`:
   - **Foundry** — `forge script <detected>.s.sol --rpc-url <stack> --broadcast --private-key <anvil account 0>`.
     Stacks' anvil carries the standard prefunded dev accounts, so no key management. Addresses
     come back from `broadcast/<chain_id>/run-latest.json`, which doubles as the address → name map
     `find-abi.mjs` wants.
   - **Hardhat** — `hardhat run` needs a named network, so use an existing localhost or custom
     entry with an env override, or print the network block for the user to paste. Never rewrite
     a hardhat config silently.
   - **Neither** — provision, print, stop. Do not guess a deploy command.
3. Wire the result into the host project's own convention: existing `.env*` keys,
   `wagmi.config.ts`, `deployments/`, or foundry `broadcast/`. State exactly which files changed.
   If no convention is recognisable, print and stop.
4. End with rpc url, chain id, addresses, explorer link.

The point worth saying out loud: the deploy runs against a URL, so the deployment outlives the
terminal that created it. The frontend dev, the designer and CI all reach the same contracts with
no local `anvil` process to keep alive.

### 3. `/explain-transaction <hash>` — decoded narrative (S–M)

Calls, events, balance diffs, who gained what. Uses `find-abi.mjs` then `cast` to decode, and
`reference/narrative.md` to render.

Works on a plain mainnet hash with no stack, which gives it value before adoption. When it runs
against a stack it ends with an explorer deep link.

### 4. `/debug <hash>` — reproduce a failure, and hand it over (M)

Fork options are fixed at creation — `create_stack` takes `fork_url` and `fork_block_number`, and
nothing re-forks an existing stack at a different block. So a stack forked at block M cannot
reproduce a failure at block N. That constraint drives the contract:

Resolve the transaction's chain and block N, then:

1. **Active stack already forked from the same chain at a block ≥ N** — reuse it.
2. **Otherwise ask**, three options:
   - **Create a debug stack** forked at N−1, slug `<project>-dbg-<hash6>` *(default)*. Persistent,
     shareable, ends in an explorer link.
   - **Reuse and replace** an existing `-dbg-` stack — delete and recreate at N−1, staying inside
     the 5-stack quota.
   - **Local only** — `cast run --trace` against a public rpc. No stack, no link.

That third option is the honest one. Fork, replay and trace do not need Stacks; `cast run --trace`
does it locally. What needs Stacks is the *reproduction persisting somewhere other people can
hit*. Putting the choice in front of the user makes the difference visible at the moment it
matters: **do you need to give this to someone?**

The artifact is the reproduction, not the trace. The command ends with a link to send to whoever
reported the bug — the failing transaction and the fixed replay, both on a chain they can open.

### 5. `/fund <address>` — real tokens, no faucet (S)

Impersonate a large holder on a forked stack and `execute` an ERC-20 transfer. Whale addresses go
stale, so holders are resolved at runtime, never hardcoded. Defaults to USDC and WETH; amount and
token are arguments. Ends with an explorer link to the receiving address.

### 6. `/test-e2e` — Playwright against a stack (L)

Provision, deploy, seed wallets, point the app at the stack, run Playwright, snapshot and revert
between tests, tear down.

The wallet is an injected EIP-1193 `window.ethereum` installed with `addInitScript`, documented in
`reference/wallet-shim.md`. It answers `eth_accounts` and `eth_chainId` locally — **`chain_id` read
from the stack, never 31337** — and forwards everything else to the stack's rpc.
`eth_sendTransaction` goes straight through with an impersonated `from`, so no private key exists
anywhere in the test suite. Snapshot ids are consumed on revert, so each test takes its own
snapshot rather than sharing one.

Known limit, stated in the skill: an app requiring `personal_sign` or SIWE needs a local signing
key instead. The shim detects those methods and says so rather than failing obscurely.

### 7. `/snapshot <name>` and `/restore <name>` (M)

Named world states — `vesting-half-done`, `position-underwater`, `dao-vote-live` — so QA and
designers stop asking developers to hand-craft state. Impossible on a testnet, unshareable on
local anvil.

Two commands, not one, because `/restore` is what someone types under pressure. Names map to
snapshot ids; because reverting consumes an id and discards everything taken after it, `/restore`
re-snapshots immediately so the same name stays usable, and warns which later names it invalidated.

`snapshot-store.mjs` holds the name → id map in `~/.ethui/snapshots/<slug>.json` — outside the host
repo, ids only, no urls and no keys. It owns the invalidation rule: reverting to an id drops every
name at or above it.

### 8. `/time-travel <duration>` (XS)

`set_block_timestamp` plus `mine`. Accepts `30d`, `2h`, or an absolute timestamp. Ends with the
new block in the explorer.

### 9. `/share` (XS)

Prints the explorer url **and a QR code in the terminal** via `share-qr.mjs`. The QR is what turns
"trust me, it's shareable" into fifty phones watching the same chain.

`share-qr.mjs` tries `qrencode`, then `npx --yes qrcode-terminal`, then falls back to printing the
url alone. Never fails the command over a missing QR renderer.

Always warns, before printing: **the url contains the api key, so anyone who scans it gets full
rpc access, writes included.** Fine for a throwaway demo stack, never for one that matters.

### 10. `/reset` (XS)

Nuke and re-provision, clean nonces. Knows `-dbg-` stacks are disposable and project stacks are
not. Confirms before deleting anything, because `delete_stack` is irreversible.

## The hackathon demo

The palette is optimised for this three-minute flow. The audience is the second party — a stranger
opening the link on their own phone proves shareability better than a rehearsed partner would.

| t | beat | command | what the room sees |
|---|---|---|---|
| 0:00 | The problem | — | faucet dry, teammate cannot reproduce your bug |
| 0:15 | Provision and deploy | `/setup-env` | the project's real `forge script`, unmodified, against a forked mainnet stack |
| 0:35 | Give it away | `/share` | QR on the projector, phones land on the explorer |
| 0:50 | Real money | `/fund 100k USDC` | impersonated whale, every phone updates |
| 1:10 | The app works | app UI | swap at real Uniswap prices against real liquidity |
| 1:35 | The bug | `/debug <hash>` | fork at the failing block, replay, one-sentence cause, fix, replay green |
| 2:15 | Hand it over | link | "that is not my laptop, that is a URL" |
| 2:35 | Time is a variable | `/time-travel 30d` | vesting matures on screen, phones follow |
| 2:50 | Close | — | no testnet, no faucet, no second laptop |

The QR lands before anything interesting happens, so every later transaction is witnessed on fifty
devices.

Rehearsal notes: pre-create the stack (wifi), warm it immediately before presenting (anvil
suspends after ~10 minutes idle and a forked resume costs ~10 seconds), prune to stay under the
5-stack quota, and pre-pick the failing transaction — a cause that fits in one sentence is not
something to improvise live.

## Error handling

Failures users will actually hit, and what the skills say:

- **No MCP tools loaded** — the most common cold-start failure. Detect the absence and point at
  `/ethui-init`, then at `/mcp` reconnect. Never let it surface as "unknown tool".
- **Stack unreachable** — `stack ... is not reachable: Stack failed to start, check its fork
  options`. Surface verbatim; it is the common self-inflicted failure, usually a
  `fork_block_number` past the chain head.
- **First call after suspend** — up to ~30 seconds on a forked stack. Say it is waking rather than
  appearing hung.
- **Quota reached** — 5 per user. List the stacks with ages and offer to prune `-dbg-` ones.
- **Stack not found** — may mean it belongs to someone else; the server reports both identically so
  slugs do not leak. Say so rather than implying deletion.
- **Custom errors** — only `Error(string)` is decoded server-side. Decode custom errors locally
  through `find-abi.mjs`, and show the raw payload when that fails.
- **Wide `get_logs` ranges** — forked stacks forward historical queries upstream and time out. Keep
  ranges tight and explain the failure when it happens.

## Testing

`node:test`, no framework, run with `node --test`.

- `slug-for-project.mjs` — sanitisation, reserved-prefix rejection, length limits, collisions.
- `find-abi.mjs` — each resolution tier against fixture directories; 4byte ambiguity returned
  whole; clean miss returns `{ source: null }`.
- `detect-project.mjs` — foundry, hardhat, both, neither; env-key detection against fixture repos.
- `share-qr.mjs` — renderer fallback chain, including all renderers absent.
- `snapshot-store.mjs` — record, lookup, name reuse, ordering, revert invalidation, persistence,
  corrupt-file recovery.

Fixtures are miniature project trees under `tests/fixtures/`. Skills themselves are prose and are
verified by running them against a real stack, not by unit tests.

## Conventions

From `CONTEXT.md`, applied to every skill:

- **Always end with an explorer link.**
- **Read `chain_id` from the stack**, never hardcode. A derived chain id that is wrong produces
  signature failures that look like wallet bugs.
- **Warn before sharing** — explorer and rpc urls carry the api key.
- **Deletion is irreversible.** Confirm unless the user named the stack explicitly.
- **Skills land in someone else's project.** Detect, do not assume, and prefer the project's
  existing tooling over reimplementing it.

## Out of scope

- Server changes. Nothing in this palette needs one.
- ABI handling in the MCP server. It stays out by design; the plugin owns it.
- OAuth. The bearer token is not OAuth 2.1, so one-click connect from claude.ai web will not work.
  Claude Code and Desktop with a custom header do.
