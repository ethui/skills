# Rendering a decoded transaction

How to turn a receipt plus logs into something a human understands in one read. Used by
`/explain-transaction` and by `/debug` once it has a replay.

## Order

Lead with the outcome, then the mechanism, then the detail. Someone who stops reading after the
first line should still know whether to care.

1. **One sentence: what happened, and did it work.**
   "Swapped 1,000 USDC for 0.31 WETH on Uniswap v3. Succeeded."
   "Reverted: `transferFrom` failed because the vault has no allowance."
2. **Who gained what.** Net balance changes per address, tokens and ETH together, largest first.
   Skip addresses whose net change is zero.
3. **The call path.** Nested calls, contract names where known, values on the ones that carry
   value. Collapse uninteresting depth — a reader wants the shape, not every `staticcall`.
4. **Events.** Decoded name and arguments. Group repeats rather than listing forty `Transfer`s.
5. **Cost.** Gas used and effective price, in gwei and in ETH.
6. **Explorer link.** Always last, always present when a stack is involved.

## Naming things

Use the contract name from `find-abi.mjs` when there is one. Otherwise show the checksummed
address truncated in the middle (`0xA0b8…eB48`), never a bare unlabelled 42-character string in
running prose.

Label well-known addresses when they are obvious from context — the token contract in a transfer,
the router in a swap — and say how you know. Never guess an identity from a nickname list; a wrong
label is worse than no label.

## Amounts

Always show token amounts in human units with the symbol, and put the raw value in parentheses only
when precision matters (dust, rounding bugs, off-by-decimals). `1,000 USDC` not
`1000000000 (6 decimals)`.

Read `decimals()` and `symbol()` from the chain rather than assuming; USDC is 6 and it breaks the
habit of assuming 18.

## Reverts

The cause goes in the first sentence, in plain language, with the mechanism named.

- **`Error(string)`** — quote the string exactly, then explain it.
- **Custom errors** — decode with the ABI from `find-abi.mjs`. Show the decoded name and arguments.
- **Undecodable** — show the raw 4-byte selector and the payload, say plainly that the ABI was not
  found, and name where you looked. Never invent a cause.
- **Out of gas / no reason** — say so; do not present a guess as the reason.

When the cause is a state precondition — allowance, balance, deadline, slippage, pause flag — say
what the value was and what it needed to be. That is the sentence that ends the debugging session.

## What not to do

- Do not narrate your own process ("I fetched the receipt, then decoded…"). Report findings.
- Do not pad with detail the reader did not ask for. A successful ERC-20 transfer is two lines.
- Do not describe a simulation as if it happened on chain. Say which it was.
- Do not omit failure. If decoding was partial, say which parts are raw and why.
