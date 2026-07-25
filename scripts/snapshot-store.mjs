#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Names live outside the host project: they are not the user's code, and a stack's snapshot ids
// are meaningless anywhere else.
export const storeDir = () => process.env.ETHUI_SNAPSHOT_DIR ?? join(homedir(), ".ethui", "snapshots");
const storePath = (slug) => join(storeDir(), `${slug}.json`);

export function load(slug) {
  const path = storePath(slug);
  if (!existsSync(path)) return { slug, snapshots: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return { slug, snapshots: parsed.snapshots ?? [] };
  } catch {
    return { slug, snapshots: [] };
  }
}

export function save(store) {
  const path = storePath(store.slug);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
  return store;
}

// Ids come back as hex strings ("0x4") and must go back to `revert` unchanged, so the raw value is
// stored and the numeric form is kept only for ordering.
export function record(store, name, id) {
  const snapshots = store.snapshots.filter((entry) => entry.name !== name);
  snapshots.push({ name, id: String(id), order: Number(id) });
  snapshots.sort((a, b) => a.order - b.order);
  return { ...store, snapshots };
}

export function lookup(store, name) {
  return store.snapshots.find((entry) => entry.name === name) ?? null;
}

// Only the reverted id itself is consumed. Snapshots taken after it stay valid — verified against
// the live server, which contradicts the "everything after is discarded" folklore.
export function consume(store, id) {
  const target = Number(id);
  const consumed = store.snapshots.filter((entry) => entry.order === target);
  const snapshots = store.snapshots.filter((entry) => entry.order !== target);
  return { store: { ...store, snapshots }, consumed };
}

export function clear(store) {
  return { ...store, snapshots: [] };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, slug, name, id] = process.argv.slice(2);
  const store = load(slug);

  switch (command) {
    case "list":
      console.log(JSON.stringify(store, null, 2));
      break;
    case "record":
      console.log(JSON.stringify(save(record(store, name, id)), null, 2));
      break;
    case "lookup": {
      const entry = lookup(store, name);
      console.log(JSON.stringify(entry ?? { error: `no snapshot named ${name}` }, null, 2));
      if (!entry) process.exitCode = 1;
      break;
    }
    case "consume": {
      const { store: next, consumed } = consume(store, id ?? name);
      save(next);
      console.log(JSON.stringify({ consumed, remaining: next.snapshots }, null, 2));
      break;
    }
    case "clear":
      console.log(JSON.stringify(save(clear(store)), null, 2));
      break;
    default:
      console.error("usage: snapshot-store.mjs <list|record|lookup|consume|clear> <slug> [name] [id]");
      process.exitCode = 2;
  }
}
