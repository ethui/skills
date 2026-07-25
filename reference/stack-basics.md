# Stacks basics

Shared background for every ethui skill. Read once per session, not once per command.

## What a stack is

One anvil chain, owned by a user, addressable over HTTP and WebSocket, with a hosted explorer.
Optional components (`graph`, `graph-rpc`, `graph-status`, `ipfs`) each get their own subdomain.

The value over a local `anvil --fork-url` is narrow and specific: a URL other people can hit, an
explorer humans can look at, and reachability for an agent with no terminal on the box.

## URLs

```
https://<slug>.stacks.ethui.dev/<api-key>      http rpc
wss://<slug>.stacks.ethui.dev/<api-key>        ws rpc
https://explorer.ethui.dev/rpc/<base64(ws_rpc_url)>
```

Explorer deep links append `/tx/<hash>`, `/address/<addr>`, `/block/<n>`, where `<n>` is
**decimal**. The base64 is plain `btoa`, not url-safe.

Locally the host is `<slug>.lvh.me`, the api is on port 4000, and with `ETHUI_STACKS_SAAS` unset
there is no api key and no auth at all.

**The api key lives in the url, so the url is the credential.** Anyone with an explorer link has
full rpc access, writes included. Warn before sharing, every time.

## Chain ids are not 31337

A stack's chain id is derived from a 16-bit prefix (`0x00EE`) plus its database id, producing
values like `15597630`. Always read `chain_id` from `create_stack` or `list_stacks`.

Hardcoding 31337 into a wallet config, a viem chain definition, a `foundry.toml` profile, or a
Playwright fixture produces signature-validation failures that look like wallet bugs.

## Tools

- **Lifecycle** — `create_stack` (optional `slug`, `fork_url`, `fork_block_number`), `list_stacks`,
  `delete_stack` (irreversible).
- **Reads** — `get_block`, `get_transaction`, `get_address`, `get_logs`.
- **Writes** — `simulate_call` (`eth_call`) and `execute` (sends, waits for the receipt). Raw
  calldata only; there is no ABI layer. `from` is auto-impersonated, so any address can send
  without a key. Omit `to` and put bytecode in `data` to deploy.
- **Cheatcodes** — `impersonate`, `set_balance`, `mine`, `set_block_timestamp`, `snapshot`,
  `revert`.

Encode calldata locally with `cast calldata`, and decode with `cast decode-calldata` /
`cast decode-event`. The server deliberately owns none of that.

## Behaviours that bite

- Amounts accept decimal or hex; block params accept decimal, hex, or a tag.
- `get_logs` defaults `from_block` fork-aware — the fork block on a forked stack, else `earliest`.
  Wide historical ranges on a fork are forwarded upstream and time out. Keep ranges tight.
- `set_block_timestamp` mines a block by default, so the new time takes effect immediately.
- Snapshot ids are **hex strings** (`"0x4"`) and must go back to `revert` unchanged. An id is
  consumed by its revert — reverting twice to the same id errors with `unknown or already consumed
  snapshot` — but snapshots taken **after** the reverted one survive and stay revertable.
- `get_address` returns `balance_wei` and `balance_hex`. There is no `balance` field; reading one
  yields `undefined` rather than an error.
- Revert reasons are decoded only for the standard `Error(string)` payload. Custom errors come back
  raw — decode them locally.
- A stack owned by someone else reports as `stack not found`, deliberately, so slugs do not leak.
- Field defaults are not in the JSON schema. Read the tool descriptions.

## Limits

- **5 stacks per user**, 250 globally. Reuse or prune; never accumulate.
- Anvil **suspends after ~10 minutes idle** and resumes on the next request. On a forked stack that
  costs roughly 10 seconds, with a 30-second ceiling before the server gives up.
- A stack whose anvil cannot boot reports `stack ... is not reachable: Stack failed to start, check
  its fork options`. Surface it verbatim — it usually means a `fork_block_number` past the head.
- Forked state is fetched lazily, so the first touch of any account or slot pays a round trip.

## Fork sources

Read the provider's head first and stay a few blocks behind it; a block past the head kills anvil
outright.

**Head forks** — `https://ethereum-rpc.publicnode.com`. No key, works well.

**Pinned forks** — `https://eth.drpc.org`. No key, and it serves archive requests, which pinned
forks require.

publicnode rejects anything outside its recent-block window with `Archive requests require a
personal token`. A stack pinned to an older block **fails to boot** on it (200 blocks back was
already too old), and a stack pinned while its block was fresh degrades later: uncached state reads
and every `get_logs` call start returning 403 once the block ages out.

So: pin the block → use drpc. Fork the head → either works.

## Local tooling

`cast` reads a `CHAIN` environment variable, and a value it does not recognise (`CHAIN=foundry`,
for instance) makes `cast call` and `cast send` fail with `invalid value ... for '--chain'` while
`cast chain-id` still succeeds. If cast fails that way, re-run with `env -u CHAIN`.

Replaying a transaction is `cast run <hash> --rpc-url <url>`, which prints the decoded call trace.
`--trace-printer` is the opcode-level debugger, not what you want for a narrative.
