# The injected wallet shim

Playwright cannot sanely click through MetaMask, so `/test-e2e` injects a minimal EIP-1193
provider instead. Because Stacks' anvil auto-impersonates the `from` address, transactions are sent
**unsigned** — there is no private key anywhere in the test suite.

## Install it

```ts
await context.addInitScript(
  ({ rpcUrl, chainId, accounts }) => { /* provider below */ },
  { rpcUrl: process.env.ETHUI_RPC_URL, chainId: Number(process.env.ETHUI_CHAIN_ID), accounts },
);
```

`chainId` comes from the stack. Never hardcode 31337 — a wrong chain id fails signature validation
in ways that look like wallet bugs.

## The provider

```js
const provider = {
  isMetaMask: true,
  _accounts: accounts,
  _chainIdHex: `0x${chainId.toString(16)}`,
  _listeners: {},

  async request({ method, params = [] }) {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return this._accounts;
      case "eth_chainId":
        return this._chainIdHex;
      case "net_version":
        return String(chainId);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "personal_sign":
      case "eth_sign":
      case "eth_signTypedData":
      case "eth_signTypedData_v3":
      case "eth_signTypedData_v4":
        throw Object.assign(
          new Error(
            `${method} needs a real key: the impersonation shim cannot sign. ` +
              `Switch this suite to a local signing account.`,
          ),
          { code: 4200 },
        );
      default: {
        const response = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
        });
        const body = await response.json();
        if (body.error) throw Object.assign(new Error(body.error.message), { code: body.error.code });
        return body.result;
      }
    }
  },

  on(event, handler) {
    (this._listeners[event] ??= []).push(handler);
    return this;
  },
  removeListener(event, handler) {
    this._listeners[event] = (this._listeners[event] ?? []).filter((fn) => fn !== handler);
    return this;
  },
};

window.ethereum = provider;
```

`eth_sendTransaction` falls through to the default branch and reaches the stack unchanged. Anvil
impersonates the `from` address, so it lands without a signature.

## EIP-6963 announcement

wagmi v2, RainbowKit and most current connectors discover wallets through EIP-6963 rather than
`window.ethereum`. Without this block the app will not see the shim at all:

```js
const detail = Object.freeze({
  info: {
    uuid: "00000000-0000-4000-8000-000000000000",
    name: "ethui Stack",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
    rdns: "dev.ethui.stack",
  },
  provider,
});

window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
window.addEventListener("eip6963:requestProvider", () => {
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
});
```

## Accounts

Use the stack's prefunded anvil dev accounts, or any address at all — impersonation means an
address needs no key to send. Funding a fresh address is `set_balance`, or `/fund` for tokens.

## Snapshots between tests

Snapshot ids are consumed on revert, so **each test takes its own snapshot** in `beforeEach` and
reverts in `afterEach`. Sharing one id across a suite fails on the second revert. Ids are hex
strings; pass them back verbatim.

Parallel workers must not share a stack for the same reason: one worker's revert throws away
another's snapshot. Either run the suite serially, or give each worker its own stack and stay
inside the 5-stack quota.

## Known limit

An app that requires `personal_sign`, `eth_signTypedData_v4` or SIWE login cannot use impersonation
— there is nothing to produce the signature. The shim throws a readable error naming the method
rather than failing obscurely. Those suites need a local signing account (viem `privateKeyToAccount`
sending `eth_sendRawTransaction`), which trades key handling for signature support.
