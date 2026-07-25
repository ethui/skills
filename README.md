# ethui skills

Claude Code skills that give any web3 project a disposable dev chain **on a URL** — one your
teammate, your designer, or a judge with a phone can open, with no local `anvil` to keep alive.

Powered by [ethui Stacks](https://github.com/ethui/stacks).

## Install

```
/plugin marketplace add ethui/skills
/plugin install ethui
/ethui:ethui-init
```

`/ethui:ethui-init` authenticates by email code and registers the MCP server for the current
project. **MCP servers bind at session start**, so run `/mcp` to reconnect (or restart the session)
before using anything else.

## The palette

| command | what it does |
|---|---|
| `/ethui-init` | Authenticate and register the MCP server. Step zero. |
| `/setup-env` | Provision a stack, run **your project's own deploy** against it, wire the result into your existing config. |
| `/explain-transaction` | Decode a transaction into a narrative: calls, events, balance diffs. Works on plain mainnet hashes, no stack needed. |
| `/debug` | Fork at a failing block, replay, explain the cause, fix state, replay green — and leave a chain the reporter can open. |
| `/fund` | Impersonate a real holder and send real USDC/WETH. No faucet, no key. |
| `/test-e2e` | Playwright against the stack with a keyless injected wallet and snapshot isolation. |
| `/snapshot`, `/restore` | Named world states — `vesting-half-done`, `position-underwater`. |
| `/time-travel` | Move the chain clock. Vesting matures, auctions close. |
| `/share` | Explorer link plus a **QR code in your terminal**. |
| `/reset` | Nuke and re-provision, or prune disposable stacks when the quota is full. |

## What this is for

A local `anvil --fork-url` already forks, traces and mines. Stacks adds exactly three things, and
every skill here uses at least one:

- **a URL other people can hit**
- **an explorer humans can look at**
- **reachability for an agent with no terminal on the box**

## Requirements

- [foundry](https://getfoundry.sh) (`cast`, `forge`) — the skills point your own toolchain at the
  stack rather than reimplementing it
- node 18+ for the helper scripts (standard library only, nothing is installed into your project)
- optional: `qrencode` for `/share`

## Security

The stack's api key is **inside the rpc and explorer urls**, so those urls are credentials. Anyone
with the link can write to that chain. The skills warn before printing one; take the warning
seriously with any stack that matters.

## Development

```bash
node --test "tests/*.test.mjs"
```

Design and rationale: [`docs/superpowers/specs/2026-07-25-ethui-skills-design.md`](docs/superpowers/specs/2026-07-25-ethui-skills-design.md).
Platform reference: [`CONTEXT.md`](CONTEXT.md).
