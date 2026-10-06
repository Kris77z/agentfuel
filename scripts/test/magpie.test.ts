import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyMagpie } from "../magpie-probe.js";

test("actual Magpie keeps one dispatch per request and preserves Relay tier/payment/refund contracts", { timeout: 120_000 }, async () => {
  assert.ok(process.env.MAGPIE_BIN, "Build the locked official Magpie with scripts/magpie-build.ts and set MAGPIE_BIN; this integration does not silently skip");
  const directory = await mkdtemp(join(tmpdir(), "agentfuel-magpie-test-"));
  try {
    const report = await verifyMagpie({ binary: process.env.MAGPIE_BIN, output: directory, officialBinary: process.env.MAGPIE_OFFICIAL_BIN });
    assert.equal(report.verified, true); assert.ok(report.checks.length >= 15);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
