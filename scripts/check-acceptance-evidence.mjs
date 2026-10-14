import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Check consistency of committed summaries only. No RPC, model calls, signing,
// or claim of independent external provenance is made by this command.
const directory = new URL('../frontend/acceptance/autonomous-collaboration-20261014/', import.meta.url);
const records = [];
const raw = (value) => { assert.match(String(value), /^\d+$/); return BigInt(value); };
const hash = (value) => assert.match(value, /^0x[0-9a-f]{64}$/i);
function read(name) {
  const bytes = readFileSync(new URL(name, directory));
  return { data: JSON.parse(bytes), sha256: createHash('sha256').update(bytes).digest('hex') };
}
function record(capability, file, checksum, requestId, facts) {
  records.push({ capability, file, sha256: checksum, requestId, chainId: '31337', modelMode: 'controlled', facts });
}

const gameFile = 'automatic-game.json', game = read(gameFile);
assert.equal(game.data.chainId, '31337');
assert.deepEqual(game.data.cases.map(c => c.rewardKind).sort(), ['llm-credits', 'usdc']);
for (const c of game.data.cases) {
  assert.equal(c.chainId, '31337');
  assert.equal(c.modelMode, 'controlled-loopback-http');
  assert.equal(c.independentVerifier, 'Docker + separate Arena settler');
  assert.equal(raw(c.balanceBefore.cashRaw), 0n);
  assert.equal(c.balanceBefore.rewardTokens, 0);
  assert.equal(c.parent.phase, 'Completed');
  assert.equal(c.parent.completedGames, 1);
  assert.equal(c.parent.completedTasks, 1);
  assert.equal(c.settlement.passed, true);
  assert.equal(raw(c.balanceAfter.debtRaw), 0n);
  assert.equal(raw(c.balanceAfter.cashRaw), raw(c.settlement.residualRaw));
  assert.equal(raw(c.settlement.repaidRaw) + raw(c.settlement.residualRaw), 150000n);
  assert.equal(c.readOnlyRecovery.requestCountBefore, c.readOnlyRecovery.requestCountAfter);
  assert.deepEqual(c.readOnlyRecovery.noncesBefore, c.readOnlyRecovery.noncesAfter);
  assert.equal(c.readOnlyRecovery.originalResultPreserved, true);
  for (const receipt of c.canonicalReceipts) {
    hash(receipt.txHash); hash(receipt.blockHash);
    assert.equal(receipt.status, 1); assert.equal(receipt.canonical, true);
  }
  const settlement = c.canonicalReceipts.find(r => r.txHash === c.settlement.txHash);
  assert.ok(settlement, 'Settlement must reference a saved receipt.');
  assert.equal(settlement.blockHash, c.settlement.block.hash);
  assert.equal(settlement.blockNumber, c.settlement.block.number);
  if (c.rewardKind === 'usdc') {
    const planning = c.plannerPayments.reduce((sum, p) => {
      assert.equal(raw(p.fromCreditRaw), 0n);
      assert.ok(c.canonicalReceipts.some(r => r.txHash === p.txHash));
      return sum + raw(p.fromCashRaw);
    }, 0n);
    assert.equal(raw(c.rewardRaw) - planning, raw(c.taskFunding.fromCashRaw));
    assert.equal(raw(c.taskFunding.fromCashRaw) + raw(c.taskFunding.fromCreditRaw), 120000n);
    assert.equal(raw(c.parent.chargedRaw), 120000n + planning);
    assert.equal(raw(c.settlement.repaidRaw), raw(c.taskFunding.fromCreditRaw) * 115n / 100n);
    assert.equal(c.settlement.loanStatus, '2');
  } else {
    assert.equal(c.creditsGranted - c.taskFunding.creditsUsed, c.balanceAfter.rewardTokens);
    assert.equal(raw(c.taskFunding.fromCashRaw) + raw(c.taskFunding.fromCreditRaw), 0n);
    assert.equal(raw(c.parent.chargedRaw), 0n);
    assert.equal(c.settlement.loanStatus, '0');
  }
  record(`automatic-game:${c.rewardKind}`, gameFile, game.sha256, c.parentRequestId,
    { games: 1, tasks: 1, cashAfterRaw: c.balanceAfter.cashRaw, debtAfterRaw: c.balanceAfter.debtRaw, replayAddedCalls: 0 });
}

const refill = game.data.manualRefuel;
assert.equal(refill.chainId, '31337');
assert.equal(refill.modelMode, 'controlled-loopback-http');
assert.equal(refill.pause.fundingNeed, 'reward-tokens');
assert.equal(refill.resumedPhase, 'Completed');
assert.equal(refill.taskIdPreserved, true); assert.equal(refill.acceptTxHashPreserved, true);
hash(refill.originalAcceptTxHash);
assert.equal(refill.balances.earnedTokens - refill.balances.consumedBeforeTask, refill.balances.availableBeforeTask);
assert.equal(refill.balances.availableBeforeTask + 4096, refill.balances.availableAfterManualGame);
assert.equal(refill.balances.availableAfterManualGame - 30, refill.balances.availableAfterTask);
assert.equal(refill.actorNonceBeforeResume, refill.actorNonceAfterResume);
assert.equal(refill.newHttpRequestsOnResume, 1);
assert.equal(refill.settlement.passed, true); assert.equal(refill.settlementCanonical, true);
hash(refill.settlement.txHash); hash(refill.settlement.block.hash);
assert.equal(raw(refill.settlement.repaidRaw), 0n);
assert.equal(raw(refill.settlement.residualRaw), raw(refill.balances.cashAfterTaskRaw));
record('game-refill:original-task', gameFile, game.sha256, refill.parentRequestId,
  { taskId: refill.originalTaskId, childRequestId: refill.childRequestId, taskIdPreserved: true, acceptTxHashPreserved: true });

const modelFile = 'model-fallback.json', model = read(modelFile), m = model.data;
assert.equal(m.chainId, '31337');
assert.equal(m.environment, 'Anvil with controlled LLM responses');
assert.deepEqual(m.modelSequence, ['strong', 'cheap', 'cheap', 'cheap']);
assert.deepEqual(m.payments.map(p => p.modelId), m.modelSequence);
assert.equal(m.payments.reduce((sum, p) => sum + raw(p.priceRaw), 0n), raw(m.chargedRaw));
assert.ok(raw(m.chargedRaw) <= raw(m.reservedRaw));
assert.equal(new Set(m.payments.map(p => p.paymentId)).size, m.payments.length);
for (const p of m.payments) {
  hash(p.paymentId); hash(p.txHash); hash(p.blockHash); hash(p.requestDigest);
  assert.equal(raw(p.fromCashRaw), raw(p.priceRaw)); assert.equal(raw(p.fromCreditRaw), 0n);
}
assert.equal(m.priorOutputPreserved, true);
assert.equal(m.independentReview.stage, 'review'); assert.equal(m.independentReview.passed, true);
assert.equal(m.replay.dispatchesBefore, m.replay.dispatchesAfter);
assert.equal(m.replay.nonceBefore, m.replay.nonceAfter);
assert.ok(m.cashFallback.modelSequence.every(id => id === 'cheap'));
assert.equal(raw(m.cashFallback.chargedRaw), raw(m.cashFallback.cashBeforeRaw));
assert.ok(raw(m.cashFallback.chargedRaw) <= raw(m.cashFallback.reservedRaw));
record('budget-model-routing', modelFile, model.sha256, m.requestId,
  { modelSequence: m.modelSequence, budgetRaw: m.reservedRaw, chargedRaw: m.chargedRaw, replayAddedCalls: 0 });

const externalFile = 'external-hire.json', external = read(externalFile), e = external.data;
assert.equal(e.chainId, '31337'); assert.equal(e.modelSource, 'controlled-http-llm');
assert.equal(e.mission.stage, 'completed'); assert.equal(e.mission.review.passed, true);
assert.equal(raw(e.cashBeforeRaw) - raw(e.cashAfterRaw), raw(e.chargedRaw));
assert.equal(e.mission.calls.reduce((sum, c) => sum + raw(c.chargedRaw), 0n), raw(e.chargedRaw));
assert.deepEqual(e.modelDispatches, { commander: 1, externalSpecialist: 1, independentReviewer: 1 });
const hired = e.mission.calls.filter(c => c.external);
assert.equal(hired.length, 1);
const call = hired[0], binding = call.external;
assert.equal(binding.service.id, e.discoveredService.id);
assert.equal(binding.service.provider.toLowerCase(), e.discoveredService.provider.toLowerCase());
assert.equal(binding.service.identity.wallet.toLowerCase(), binding.service.provider.toLowerCase());
assert.equal(binding.service.identity.chainId, e.chainId);
assert.equal(call.serviceId, e.discoveredService.serviceId);
assert.equal(raw(call.chargedRaw), raw(e.discoveredService.priceRaw));
for (const field of ['paymentId', 'txHash', 'requestDigest', 'promptDigest']) assert.equal(call[field], binding[field]);
assert.equal(e.replay.sameResult, true); assert.equal(e.replay.extraModelDispatches, 0);
assert.equal(e.replay.nonceBefore, e.replay.nonceAfter);
assert.equal(e.unknownRecovery.resolved, true); assert.equal(e.unknownRecovery.sameHandleOnStop, true);
assert.equal(raw(e.unknownRecovery.chargedRaw), 0n);
assert.equal(raw(e.unknownRecovery.refundedRaw), raw(e.discoveredService.priceRaw));
for (const field of ['extraPaymentsOnStop', 'extraModelDispatchesOnStop', 'extraModelDispatchesAfterRefund']) assert.equal(e.unknownRecovery[field], 0);
record('external-agent-hiring', externalFile, external.sha256, e.requestId,
  { provider: e.discoveredService.provider, chargedRaw: e.chargedRaw, replayAddedCalls: 0, unknownRefundRaw: e.unknownRecovery.refundedRaw });

if (process.argv.includes('--json')) console.log(JSON.stringify({ schemaVersion: 1, scope: 'offline saved-record consistency', records }, null, 2));
else {
  for (const r of records) console.log(`PASS ${r.capability}: ${r.file}`);
  console.log('Saved-record consistency passed. No network, model, or wallet operations were performed.');
}
