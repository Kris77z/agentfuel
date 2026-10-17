import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { checkEvidence } from '../check-acceptance-evidence.mjs';

const prefix = 'frontend/acceptance/monad-hackathon-20261017/';
function rejects(name, mutate, expected) {
  const file = `${prefix}${name}-public-summary.json`;
  const data = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url)));
  mutate(data);
  assert.throws(() => checkEvidence({ overrides: { [file]: data } }), expected);
}

test('published records report their environment, source checksum and limited scope', () => {
  const result = checkEvidence();
  assert.equal(result.records.length, 13);
  assert.equal(result.scope.externalProvenanceVerified, false);
  assert.equal(result.scope.networkOperations, 0);
  assert.deepEqual(new Set(result.records.map(r => r.environment.chainId)), new Set(['31337', '10143']));
  for (const record of result.records) {
    assert.match(record.source.sha256, /^[a-f0-9]{64}$/);
    assert.ok(record.source.file.startsWith('frontend/acceptance/'));
    assert.ok(Object.keys(record.checkedFacts).length > 0);
  }
});
test('credit package cannot hide a changed principal behind acceptancePassed', () => rejects('credit-loop', d => { d.tasks[0].payment.fromCreditRaw = '80001'; }, /cash plus credit/));
test('raw units reject decimal or negative amounts', () => rejects('credit-loop', d => { d.totalChargedRaw = '0.24'; }, /raw-unit/));
test('consecutive task finance must retain the same wallet', () => rejects('presenter-credit-loop', d => { d.tasks[1].financeBefore.wallet = '0x0000000000000000000000000000000000000001'; }, /identity\/address binding/));
test('physical usage must match the saved model call', () => rejects('credit-loop', d => { d.tasks[0].modelCalls[0].gateway.usage.prompt_tokens++; d.tasks[0].modelCalls[0].gateway.usage.total_tokens++; }, /physical model usage/));
test('replay detects a new model request despite unchanged success flags', () => rejects('credit-loop', d => { d.replay.after.gatewayAcceptedRequests++; }, /replay must preserve/));
test('external payment must retain its quoted request digest', () => rejects('external', d => { d.payments[1].external.requestDigest = `0x${'1'.repeat(64)}`; }, /external requestDigest binding/));
test('external service must retain its discovered identity and provider', () => rejects('external', d => { d.payments[1].external.service.provider = '0x0000000000000000000000000000000000000001'; }, /phase\/service snapshot binding/));
test('external revision retains its original rejected review', () => rejects('external', d => { d.revision.firstReview.passed = true; }, /original rejected review/));
test('fallback payment sequence cannot be replaced by a success label', () => rejects('fallback-fresh', d => { d.modelSequence[0] = 'kimi-k2.6'; }, /model sequence\/payment binding/));
test('automatic execution must reference a saved settlement receipt', () => rejects('automatic-fresh', d => { d.canonicalReceipts = d.canonicalReceipts.filter(r => r.txHash !== d.tasks[0].result.settlement.txHash); }, /saved canonical receipt/));
test('task reward cannot conceal changed debt repayment', () => rejects('automatic-fresh', d => { d.tasks[0].result.settlement.repaidRaw = '34501'; }, /principal plus fee/));
test('token redemption must belong to its original task', () => rejects('token-supplement', d => { d.redemptions[0].redemptionId = 'replacement:round:0'; }, /original task request/));
test('recovered settlement must preserve the original transaction', () => rejects('settlement-recovery', d => { d.before.txHash = `0x${'2'.repeat(64)}`; }, /Expected values to be strictly equal/));
test('readiness budget arithmetic is checked without calling it business execution', () => rejects('resources', d => { d.remainingBudgetRaw = '260001'; }, /Expected values to be strictly equal/));
test('Oct 14 checks still reject changed repayment', () => {
  const file = 'frontend/acceptance/autonomous-collaboration-20261014/automatic-game.json';
  const data = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url)));
  data.cases[0].settlement.residualRaw = '0';
  assert.throws(() => checkEvidence({ overrides: { [file]: data } }));
});

test('credit loop cannot relabel controlled inference as real Kimi', () => rejects('credit-loop', d => { d.modelMode = 'controlled'; }));
test('goal source mode must agree with its reported real environment', () => rejects('external', d => { d.modelSource = 'controlled'; }));
test('top-level acceptance cannot contradict its successful children', () => rejects('presenter-credit-loop', d => { d.acceptancePassed = false; }));
test('fresh automatic acceptance must agree with its success flag', () => rejects('automatic-fresh', d => { d.fullFreshAccepted = false; }));
test('token task cannot claim full acceptance after a failed child', () => rejects('token-supplement', d => { d.task.result.success = false; }));
test('request UUID must retain all five groups', () => rejects('credit-loop', d => { d.tasks[0].requestId = 'a'.repeat(36); }, /original request UUID/));
test('chain block hashes must retain their 0x prefix', () => rejects('credit-loop', d => { d.tasks[0].payment.blockHash = d.tasks[0].payment.blockHash.slice(2); }, /0x-prefixed chain hash/));

test('token game physical turn must match the public hand', () => rejects('token-supplement', d => { d.physicalGame[0].turn++; }, /token game turn binding/));
test('token game physical seat must match the public hand', () => rejects('token-supplement', d => { d.physicalGame[0].seat = 1; }, /token game seat binding/));
test('token game physical outcome cannot contradict the public hand', () => rejects('token-supplement', d => { d.physicalGame[0].outcome = 'Failed'; }, /token game outcome binding/));
test('token game physical request must retain the public requested model', () => rejects('token-supplement', d => { d.physicalGame[0].requestedModel = 'controlled'; }, /token game requested model binding/));
test('token game response cannot replace the requested physical model', () => rejects('token-supplement', d => { d.physicalGame[0].response.model = 'controlled'; }, /token game response model binding/));
test('token redemption response must retain its paid token model', () => rejects('token-supplement', d => { d.redemptions[0].response.model = 'controlled'; }, /token redemption response model binding/));
test('automatic metered response must match its selected physical route', () => rejects('automatic-fresh', d => { d.tasks[0].meteredInferences[0].physicalResponseModel = 'controlled'; }, /metered physical response model binding/));
test('automatic metered physical route cannot replace its logical route', () => rejects('automatic-fresh', d => { d.tasks[0].meteredInferences[0].selectedPhysicalModel = 'controlled/kimi-k2.6'; }, /metered physical response model binding/));
test('automatic planner response must match its configured response model', () => rejects('automatic-fresh', d => { d.planner[0].physicalResponseModel = 'controlled'; }, /planner configured response model binding/));
test('automatic planner physical route must retain the saved configuration', () => rejects('automatic-fresh', d => { d.planner[0].physicalModel = 'cheap/controlled'; }, /planner configured physical route binding/));
