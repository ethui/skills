import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { findAbi, fromFourByte } from "../scripts/find-abi.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const foundry = join(fixtures, "foundry-app");
const hardhat = join(fixtures, "hardhat-app");
const bare = join(fixtures, "bare-app");

test("resolves an address through foundry broadcast into out", async () => {
  const result = await findAbi({
    root: foundry,
    address: "0xabc0000000000000000000000000000000000001",
  });
  assert.equal(result.source, "foundry-broadcast");
  assert.equal(result.name, "Vault");
  assert.equal(result.abi[0].name, "deposit");
});

test("resolves a contract by name from foundry out", async () => {
  const result = await findAbi({ root: foundry, name: "Vault" });
  assert.equal(result.source, "foundry-out");
  assert.equal(result.abi[0].name, "deposit");
});

test("resolves a name from hardhat artifacts", async () => {
  const result = await findAbi({ root: hardhat, name: "Token" });
  assert.equal(result.source, "hardhat-artifacts");
  assert.equal(result.abi[0].name, "transfer");
});

test("resolves an address from hardhat deployments", async () => {
  const result = await findAbi({
    root: hardhat,
    address: "0xDEF0000000000000000000000000000000000002",
  });
  assert.equal(result.source, "hardhat-deployments");
  assert.equal(result.name, "Token");
});

test("misses cleanly when nothing matches", async () => {
  assert.equal((await findAbi({ root: bare, name: "Nope" })).source, null);
  assert.equal((await findAbi({ root: bare, address: "0x1" })).source, null);
  assert.equal((await findAbi({ root: bare })).source, null);
});

test("returns every 4byte candidate rather than guessing", async () => {
  const stub = async () => ({
    ok: true,
    json: async () => ({
      results: [
        { id: 2, text_signature: "transfer(address,uint256)" },
        { id: 1, text_signature: "many_msg_babbage(bytes1)" },
      ],
    }),
  });

  const result = await fromFourByte("0xa9059cbb", stub);
  assert.equal(result.source, "4byte");
  assert.deepEqual(result.signatures, [
    "many_msg_babbage(bytes1)",
    "transfer(address,uint256)",
  ]);
});

test("survives 4byte being unreachable", async () => {
  const result = await fromFourByte("0xa9059cbb", async () => {
    throw new Error("offline");
  });
  assert.equal(result.source, null);
  assert.match(result.reason, /unreachable/);
});

test("reports an empty 4byte result as a miss", async () => {
  const result = await fromFourByte("0x00000000", async () => ({
    ok: true,
    json: async () => ({ results: [] }),
  }));
  assert.equal(result.source, null);
});
