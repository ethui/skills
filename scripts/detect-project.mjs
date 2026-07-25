#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.example", ".env.sample"];
const ENV_PATTERN = /(RPC|CHAIN_ID|CHAINID|CONTRACT|ADDRESS|EXPLORER)/i;
const HARDHAT_CONFIGS = ["hardhat.config.ts", "hardhat.config.js", "hardhat.config.cjs", "hardhat.config.mjs"];

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function listFiles(dir, predicate) {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && predicate(entry.name))
      .map((entry) => join(dir, entry.name));
  } catch {
    return [];
  }
}

export function detectFoundry(root) {
  if (!existsSync(join(root, "foundry.toml"))) return null;
  return {
    toolchain: "foundry",
    scripts: listFiles(join(root, "script"), (name) => name.endsWith(".s.sol")),
    hasBroadcast: existsSync(join(root, "broadcast")),
    hasOut: existsSync(join(root, "out")),
  };
}

export function detectHardhat(root) {
  const config = HARDHAT_CONFIGS.find((name) => existsSync(join(root, name)));
  if (!config) return null;

  const pkg = readJson(join(root, "package.json"));
  const scripts = Object.entries(pkg?.scripts ?? {})
    .filter(([name]) => /deploy|migrate/i.test(name))
    .map(([name, command]) => ({ name, command }));

  return {
    toolchain: "hardhat",
    config,
    deployScripts: listFiles(join(root, "scripts"), (name) => /deploy/i.test(name)),
    packageScripts: scripts,
    hasDeployments: existsSync(join(root, "deployments")),
  };
}

export function detectPackageManager(root) {
  if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(root, "yarn.lock"))) return "yarn";
  if (existsSync(join(root, "bun.lockb"))) return "bun";
  if (existsSync(join(root, "package-lock.json"))) return "npm";
  return existsSync(join(root, "package.json")) ? "npm" : null;
}

// Keys are reported, values never are: an .env in someone else's repo holds their secrets.
export function detectEnvConvention(root) {
  const files = [];
  for (const name of ENV_FILES) {
    const path = join(root, name);
    if (!existsSync(path)) continue;

    let contents;
    try {
      contents = readFileSync(path, "utf8");
    } catch {
      continue;
    }

    const keys = contents
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0].trim())
      .filter((key) => ENV_PATTERN.test(key));

    if (keys.length) files.push({ file: name, keys });
  }
  return files;
}

export function detectFrontend(root) {
  const pkg = readJson(join(root, "package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  return {
    wagmiConfig: ["wagmi.config.ts", "wagmi.config.js"].find((name) => existsSync(join(root, name))) ?? null,
    libraries: ["wagmi", "viem", "ethers", "@rainbow-me/rainbowkit", "web3"].filter((name) => name in deps),
    playwright: ["@playwright/test", "playwright"].some((name) => name in deps),
  };
}

export function detectProject(root = process.cwd()) {
  const foundry = detectFoundry(root);
  const hardhat = detectHardhat(root);

  const deploy = foundry?.scripts.length
    ? {
        kind: "foundry",
        script: foundry.scripts[0],
        command: `forge script ${foundry.scripts[0]} --rpc-url <RPC_URL> --broadcast --private-key <KEY>`,
      }
    : hardhat?.packageScripts.length
      ? { kind: "hardhat-package-script", script: hardhat.packageScripts[0].name, command: null }
      : hardhat?.deployScripts.length
        ? { kind: "hardhat-script", script: hardhat.deployScripts[0], command: null }
        : null;

  return {
    root,
    toolchains: [foundry?.toolchain, hardhat?.toolchain].filter(Boolean),
    foundry,
    hardhat,
    packageManager: detectPackageManager(root),
    env: detectEnvConvention(root),
    frontend: detectFrontend(root),
    deploy,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(detectProject(process.argv[2] ?? process.cwd()), null, 2));
}
