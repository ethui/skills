import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { detectEnvConvention, detectProject } from "../scripts/detect-project.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const foundry = join(fixtures, "foundry-app");
const hardhat = join(fixtures, "hardhat-app");
const bare = join(fixtures, "bare-app");

test("detects foundry and its deploy script", () => {
  const result = detectProject(foundry);
  assert.deepEqual(result.toolchains, ["foundry"]);
  assert.equal(result.deploy.kind, "foundry");
  assert.match(result.deploy.script, /Deploy\.s\.sol$/);
  assert.equal(result.foundry.hasBroadcast, true);
});

test("detects hardhat and prefers its package script", () => {
  const result = detectProject(hardhat);
  assert.deepEqual(result.toolchains, ["hardhat"]);
  assert.equal(result.deploy.kind, "hardhat-package-script");
  assert.equal(result.deploy.script, "deploy");
  assert.equal(result.hardhat.hasDeployments, true);
});

test("reports no deploy command when nothing is recognisable", () => {
  const result = detectProject(bare);
  assert.deepEqual(result.toolchains, []);
  assert.equal(result.deploy, null);
});

test("reports env keys and never their values", () => {
  const [envFile] = detectEnvConvention(foundry);
  assert.equal(envFile.file, ".env");
  assert.deepEqual(envFile.keys, [
    "NEXT_PUBLIC_RPC_URL",
    "NEXT_PUBLIC_CHAIN_ID",
    "VAULT_CONTRACT_ADDRESS",
  ]);
  assert.ok(!JSON.stringify(envFile).includes("localhost:8545"));
});

test("spots frontend libraries and playwright", () => {
  const result = detectProject(hardhat);
  assert.deepEqual(result.frontend.libraries, ["wagmi"]);
  assert.equal(result.frontend.playwright, true);
});
