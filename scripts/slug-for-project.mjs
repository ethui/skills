#!/usr/bin/env node
import { basename, resolve } from "node:path";

// Component subdomains are built as `<component>-<slug>`, so a slug that is or starts with one of
// these collides with a platform subdomain.
const RESERVED = new Set(["rpc", "api", "graph", "graph-rpc", "graph-status", "ipfs"]);
const RESERVED_PREFIXES = ["graph-", "ipfs-", "rpc-", "api-"];

// 63 is the DNS label ceiling; component prefixes eat up to 13 characters of it.
const MAX_LENGTH = 50;
const FALLBACK = "ethui-stack";

export function sanitize(name) {
  const slug = String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-$/, "");

  return slug || FALLBACK;
}

export function isReserved(slug) {
  return RESERVED.has(slug) || RESERVED_PREFIXES.some((prefix) => slug.startsWith(prefix));
}

export function slugForProject(dir = process.cwd()) {
  const raw = basename(resolve(dir));
  const sanitized = sanitize(raw);
  const reserved = isReserved(sanitized);
  const slug = reserved ? sanitize(`${sanitized}-stack`) : sanitized;

  return { slug, raw, sanitized, reserved };
}

export function debugSlug(base, hash) {
  const short = String(hash ?? "").replace(/^0x/, "").slice(0, 6).toLowerCase();
  const suffix = `-dbg-${short}`;
  return `${sanitize(base).slice(0, MAX_LENGTH - suffix.length).replace(/-$/, "")}${suffix}`;
}

export function isDisposable(slug) {
  return /-dbg-[0-9a-f]{1,6}$/.test(String(slug ?? ""));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, hash] = process.argv.slice(2);
  const result = slugForProject(dir);
  if (hash) result.debugSlug = debugSlug(result.slug, hash);
  console.log(JSON.stringify(result, null, 2));
}
