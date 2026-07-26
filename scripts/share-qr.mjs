#!/usr/bin/env node
import { spawnSync } from "node:child_process";

// qrcode-terminal reads the payload from stdin; passing it as an argument exits 0 and prints
// nothing, which reads as a working renderer that produced no QR.
const RENDERERS = [
  { name: "qrencode", command: "qrencode", args: (url) => ["-t", "UTF8", "-m", "1", url] },
  { name: "qrcode-terminal", command: "npx", args: () => ["--yes", "qrcode-terminal"], stdin: true },
];

export function renderQr(url, { renderers = RENDERERS, run = spawnSync } = {}) {
  for (const renderer of renderers) {
    const options = { encoding: "utf8", ...(renderer.stdin ? { input: url } : {}) };
    const result = run(renderer.command, renderer.args(url), options);
    if (result.status === 0 && result.stdout?.trim()) {
      return { renderer: renderer.name, qr: result.stdout.replace(/\n+$/, "") };
    }
  }
  return { renderer: null, qr: null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.argv[2];
  if (!url) {
    console.error("usage: share-qr.mjs <url>");
    process.exit(2);
  }

  const { renderer, qr } = renderQr(url);
  if (qr) console.log(`\n${qr}\n`);
  console.log(url);
  if (!renderer) {
    console.log("\n(no QR renderer found — install `qrencode` for a scannable code)");
  }
}
