import assert from "node:assert/strict";
import { test } from "node:test";
import {
  debugSlug,
  isDisposable,
  isReserved,
  sanitize,
  slugForProject,
} from "../scripts/slug-for-project.mjs";

test("lowercases and collapses separators", () => {
  assert.equal(sanitize("My Cool_DApp"), "my-cool-dapp");
  assert.equal(sanitize("foo---bar"), "foo-bar");
  assert.equal(sanitize("--edges--"), "edges");
});

test("falls back when nothing survives sanitisation", () => {
  assert.equal(sanitize("***"), "ethui-stack");
  assert.equal(sanitize(""), "ethui-stack");
  assert.equal(sanitize(null), "ethui-stack");
});

test("truncates to the component-prefix-safe length", () => {
  const slug = sanitize("a".repeat(80));
  assert.equal(slug.length, 50);
  assert.ok(!slug.endsWith("-"));
});

test("never leaves a trailing dash after truncation", () => {
  assert.ok(!sanitize(`${"a".repeat(49)}-tail`).endsWith("-"));
});

test("rejects reserved names and component prefixes", () => {
  for (const reserved of ["rpc", "api", "graph", "graph-rpc", "graph-status", "ipfs"]) {
    assert.ok(isReserved(reserved), reserved);
  }
  assert.ok(isReserved("graph-anything"));
  assert.ok(!isReserved("graphite"));
  assert.ok(!isReserved("my-api-gateway"));
});

test("suffixes a reserved project name instead of failing", () => {
  const result = slugForProject("/tmp/graph");
  assert.equal(result.slug, "graph-stack");
  assert.equal(result.reserved, true);
});

test("derives a slug from the directory name", () => {
  const result = slugForProject("/Users/someone/Projects/My Vault App");
  assert.equal(result.slug, "my-vault-app");
  assert.equal(result.reserved, false);
});

test("debug slugs carry a short hash and stay within length", () => {
  assert.equal(debugSlug("vault", "0xdeadbeefcafe"), "vault-dbg-deadbe");
  assert.ok(debugSlug("a".repeat(60), "0xabcdef").length <= 50);
});

test("disposable detection only matches the dbg suffix", () => {
  assert.ok(isDisposable("vault-dbg-deadbe"));
  assert.ok(!isDisposable("vault"));
  assert.ok(!isDisposable("dbg-vault"));
});
