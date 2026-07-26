import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const dir = mkdtempSync(join(tmpdir(), "ethui-snapshots-"));
process.env.ETHUI_SNAPSHOT_DIR = dir;

const { clear, consume, load, lookup, record, save } = await import("../scripts/snapshot-store.mjs");

after(() => rmSync(dir, { recursive: true, force: true }));

test("an unknown stack starts empty", () => {
  assert.deepEqual(load("nothing-here").snapshots, []);
});

test("records and looks up a name", () => {
  const store = record(load("vault"), "vesting-half-done", "0x1");
  assert.deepEqual(lookup(store, "vesting-half-done"), {
    name: "vesting-half-done",
    id: "0x1",
    order: 1,
  });
  assert.equal(lookup(store, "missing"), null);
});

test("keeps the hex id verbatim so it can go back to revert", () => {
  const store = record(load("vault"), "state", "0x1f");
  assert.equal(lookup(store, "state").id, "0x1f");
  assert.equal(lookup(store, "state").order, 31);
});

test("re-using a name replaces the id instead of duplicating", () => {
  let store = record(load("vault"), "state", "0x1");
  store = record(store, "state", "0x7");
  assert.equal(store.snapshots.length, 1);
  assert.equal(lookup(store, "state").id, "0x7");
});

test("keeps snapshots ordered by id", () => {
  let store = record(load("vault"), "c", "0x9");
  store = record(store, "a", "0x2");
  store = record(store, "b", "0x5");
  assert.deepEqual(
    store.snapshots.map((entry) => entry.name),
    ["a", "b", "c"],
  );
});

test("reverting consumes only the id used, not later snapshots", () => {
  let store = record(load("vault"), "early", "0x1");
  store = record(store, "target", "0x4");
  store = record(store, "later", "0x8");

  const { store: next, consumed } = consume(store, "0x4");
  assert.deepEqual(
    consumed.map((entry) => entry.name),
    ["target"],
  );
  assert.deepEqual(
    next.snapshots.map((entry) => entry.name),
    ["early", "later"],
  );
});

test("clear drops every name for a stack", () => {
  let store = record(load("vault"), "a", "0x1");
  store = record(store, "b", "0x2");
  assert.deepEqual(clear(store).snapshots, []);
});

test("persists across loads", () => {
  save(record(load("persisted"), "seeded", "0x3"));
  assert.equal(lookup(load("persisted"), "seeded").id, "0x3");
});

test("a corrupt store degrades to empty rather than throwing", async () => {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(dir, "broken.json"), "{not json");
  assert.deepEqual(load("broken").snapshots, []);
});
