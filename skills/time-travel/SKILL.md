---
name: time-travel
description: Use when time needs to pass on a chain — "time travel 30 days", "fast forward a week", "make the vesting mature", "expire this auction", "advance the block timestamp". Moves the stack's clock forward and mines.
---

# time-travel

Moves the chain clock. Vesting matures, auctions close, timelocks expire, cooldowns end — in one
command, on a chain someone else can watch.

## 1. Work out the target

Read the current block timestamp (`get_block` on `latest`), then apply the user's argument:

- **Relative** — `30d`, `2h`, `45m`, `1w`. Add to the current timestamp.
- **Absolute** — a unix timestamp or a date. Use it directly.

Reject going **backwards**. Anvil will not rewind, and a timestamp earlier than the current block
produces a confusing failure. If the user wants an earlier state, that is `/restore`.

## 2. Move it

```
set_block_timestamp(timestamp)
```

It mines a block by default, so the new time takes effect immediately. Only call `mine` separately
if more blocks are wanted.

## 3. Report

- new timestamp, as both a date and a unix value
- how far it moved, in the units the user asked for
- new block number
- **explorer link to the new block**

If the point was to unlock something, check it: read the contract state that was time-gated and say
whether it is now open. "Advanced 30 days" is less useful than "advanced 30 days — the vesting
cliff is now passed and 25% is claimable".

## Notes

- Forked stacks start at the fork block's timestamp, which may already be well behind wall-clock
  time. Say so if the gap is large enough to confuse.
- Time moves forward only. To undo, snapshot before travelling.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
