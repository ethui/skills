---
name: share
description: Use when someone wants to give their chain to another person — "share this chain", "send this to my teammate", "show this on the projector", "QR code for the stack". Prints the explorer url and a scannable QR code, with the security warning that the url is the credential.
---

# share

Turns "trust me, it's shareable" into fifty phones watching the same chain.

## 1. Resolve the stack

`slug-for-project.mjs` plus `list_stacks`, or an explicit slug from the user. Report which stack is
being shared before printing anything — sharing the wrong chain is a real mistake.

## 2. Warn first, print second

The api key is **inside the url**, so the url is the credential. Anyone who opens the explorer link
has full rpc access to that chain, writes included. State this before the QR appears, not after:

> Anyone who scans this can send transactions to this chain. Fine for a throwaway demo stack, never
> for one that matters.

If the stack looks like a project stack (no `-dbg-` suffix, has deployments), ask for confirmation
before printing.

## 3. Print

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/share-qr.mjs "<explorer url>"
```

The script tries `qrencode`, then `npx qrcode-terminal`, then falls back to printing the url alone.
A missing QR renderer never fails the command.

Also print, as text someone can copy into chat:

- explorer link
- http rpc url
- ws rpc url
- chain id, called out explicitly — whoever adds this network needs it, and it is not 31337

## Demo use

The QR is the reason this skill exists. On a projector it makes shareability something the room
experiences rather than a claim they take on trust. Print it **before** doing anything interesting,
so every later transaction is witnessed on every phone in the room.

Warm the stack first: anvil suspends after ~10 minutes idle, and the first request after that pays
~10 seconds on a forked stack. A room watching a spinner is a bad look.

Background: `${CLAUDE_PLUGIN_ROOT}/reference/stack-basics.md`.
