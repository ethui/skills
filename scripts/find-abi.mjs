#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const SKIP_DIRS = new Set([".git", "node_modules", "cache", "coverage", "dist", "build", ".next"]);
const FOURBYTE = "https://www.4byte.directory/api/v1/signatures/?hex_signature=";

function walk(dir, { maxDepth = 6, skip = SKIP_DIRS } = {}, depth = 0, out = []) {
  if (depth > maxDepth || !existsSync(dir)) return out;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skip.has(entry.name)) walk(path, { maxDepth, skip }, depth + 1, out);
    } else if (entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json")) {
      out.push(path);
    }
  }
  return out;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const eq = (a, b) => String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

// Foundry broadcast files are the only local source that maps a deployed address to a contract
// name, which is why they resolve addresses before anything else is tried.
export function fromBroadcast(root, address) {
  const dir = join(root, "broadcast");
  if (!existsSync(dir)) return null;

  for (const path of walk(dir, { maxDepth: 4 })) {
    if (basename(path) !== "run-latest.json") continue;
    const run = readJson(path);
    for (const tx of run?.transactions ?? []) {
      if (eq(tx.contractAddress, address) && tx.contractName) {
        return { name: tx.contractName, broadcast: path };
      }
    }
  }
  return null;
}

export function fromFoundryOut(root, name) {
  const dir = join(root, "out");
  if (!existsSync(dir) || !name) return null;

  for (const path of walk(dir, { maxDepth: 3 })) {
    if (basename(path) !== `${name}.json`) continue;
    const artifact = readJson(path);
    if (artifact?.abi) return { source: "foundry-out", name, abi: artifact.abi, path };
  }
  return null;
}

export function fromHardhat(root, { name, address } = {}) {
  const artifacts = join(root, "artifacts");
  if (existsSync(artifacts) && name) {
    for (const path of walk(artifacts, { maxDepth: 6 })) {
      const artifact = readJson(path);
      if (artifact?.abi && eq(artifact.contractName, name)) {
        return { source: "hardhat-artifacts", name: artifact.contractName, abi: artifact.abi, path };
      }
    }
  }

  const deployments = join(root, "deployments");
  if (existsSync(deployments)) {
    for (const path of walk(deployments, { maxDepth: 3 })) {
      const deployment = readJson(path);
      if (!deployment?.abi) continue;
      const matches = address ? eq(deployment.address, address) : eq(basename(path, ".json"), name);
      if (matches) {
        return {
          source: "hardhat-deployments",
          name: deployment.contractName ?? basename(path, ".json"),
          abi: deployment.abi,
          path,
        };
      }
    }
  }
  return null;
}

// Dependency contracts (OpenZeppelin and friends) ship prebuilt artifacts, but node_modules is far
// too large to walk blindly, so only the conventional artifact roots of each package are scanned.
export function fromNodeModules(root, name) {
  const modules = join(root, "node_modules");
  if (!existsSync(modules) || !name) return null;

  const packages = [];
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("@")) {
      const scope = join(modules, entry.name);
      for (const scoped of readdirSync(scope, { withFileTypes: true })) {
        if (scoped.isDirectory()) packages.push(join(scope, scoped.name));
      }
    } else {
      packages.push(join(modules, entry.name));
    }
  }

  for (const pkg of packages) {
    for (const candidate of ["build/contracts", "artifacts", "abi", "abis"]) {
      const dir = join(pkg, candidate);
      if (!existsSync(dir)) continue;
      for (const path of walk(dir, { maxDepth: 5, skip: new Set() })) {
        if (basename(path, ".json") !== name) continue;
        const artifact = readJson(path);
        const abi = Array.isArray(artifact) ? artifact : artifact?.abi;
        if (abi) return { source: "node_modules", name, abi, path };
      }
    }
  }
  return null;
}

// A selector maps to many signatures. All of them come back; the model disambiguates against the
// observed argument count rather than a silent first-match.
export async function fromFourByte(selector, fetchImpl = fetch) {
  const hex = selector.startsWith("0x") ? selector : `0x${selector}`;
  try {
    const response = await fetchImpl(`${FOURBYTE}${hex}`);
    if (!response.ok) return { source: null, reason: `4byte returned ${response.status}` };
    const body = await response.json();
    const signatures = (body.results ?? [])
      .sort((a, b) => a.id - b.id)
      .map((result) => result.text_signature);
    return signatures.length ? { source: "4byte", selector: hex, signatures } : { source: null };
  } catch (error) {
    return { source: null, reason: `4byte unreachable: ${error.message}` };
  }
}

export async function findAbi({ root = process.cwd(), address, name, selector } = {}) {
  if (address) {
    const hit = fromBroadcast(root, address);
    if (hit) {
      const abi = fromFoundryOut(root, hit.name);
      if (abi) return { ...abi, source: "foundry-broadcast", address, broadcast: hit.broadcast };
    }
    const hardhat = fromHardhat(root, { address });
    if (hardhat) return { ...hardhat, address };
  }

  if (name) {
    return (
      fromFoundryOut(root, name) ??
      fromHardhat(root, { name }) ??
      fromNodeModules(root, name) ?? { source: null }
    );
  }

  if (selector) return await fromFourByte(selector);

  return { source: null };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flag = (key) => {
    const index = args.indexOf(`--${key}`);
    return index === -1 ? undefined : args[index + 1];
  };

  const result = await findAbi({
    root: flag("root") ?? process.cwd(),
    address: flag("address"),
    name: flag("name"),
    selector: flag("selector"),
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.source) process.exitCode = 1;
}
