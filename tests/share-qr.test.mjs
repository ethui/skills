import assert from "node:assert/strict";
import { test } from "node:test";
import { renderQr } from "../scripts/share-qr.mjs";

const renderers = [
  { name: "qrencode", command: "qrencode", args: (url) => [url] },
  { name: "qrcode-terminal", command: "npx", args: (url) => [url] },
];

test("feeds stdin renderers the payload instead of an argument", () => {
  const calls = [];
  renderQr("https://example.com", {
    renderers: [{ name: "stdin-one", command: "npx", args: () => ["qrcode-terminal"], stdin: true }],
    run: (command, args, options) => {
      calls.push({ args, input: options.input });
      return { status: 0, stdout: "qr" };
    },
  });
  assert.deepEqual(calls[0].args, ["qrcode-terminal"]);
  assert.equal(calls[0].input, "https://example.com");
});

test("uses the first renderer that works", () => {
  const result = renderQr("https://example.com", {
    renderers,
    run: (command) => ({ status: 0, stdout: `${command}-qr\n` }),
  });
  assert.equal(result.renderer, "qrencode");
  assert.equal(result.qr, "qrencode-qr");
});

test("falls through to the next renderer on failure", () => {
  const result = renderQr("https://example.com", {
    renderers,
    run: (command) =>
      command === "qrencode" ? { status: 127, stdout: "" } : { status: 0, stdout: "npx-qr" },
  });
  assert.equal(result.renderer, "qrcode-terminal");
});

test("treats a zero exit with empty output as a failure", () => {
  const result = renderQr("https://example.com", {
    renderers,
    run: () => ({ status: 0, stdout: "   " }),
  });
  assert.equal(result.renderer, null);
});

test("degrades to no QR when every renderer is missing", () => {
  const result = renderQr("https://example.com", {
    renderers,
    run: () => ({ status: 127, stdout: "" }),
  });
  assert.deepEqual(result, { renderer: null, qr: null });
});
