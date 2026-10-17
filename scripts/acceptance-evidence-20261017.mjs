import assert from 'node:assert/strict';

const prefix = 'frontend/acceptance/monad-hackathon-20261017/';
const raw = value => { assert.match(value, /^\d+$/, 'amount must be an unsigned raw-unit string'); return BigInt(value); };
const digest = value => assert.match(value, /^(?:0x)?[0-9a-f]{64}$/i, 'expected a saved digest');
const chainHash = value => assert.match(value, /^0x[0-9a-f]{64}$/i, 'expected a 0x-prefixed chain hash');
const address = value => assert.match(value, /^0x[0-9a-f]{40}$/i, 'expected an address');
const uuid = value => assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'expected an original request UUID');
const equalAddress = (a, b) => { address(a); address(b); assert.equal(a.toLowerCase(), b.toLowerCase(), 'identity/address binding'); };
const sum = (items, field) => items.reduce((n, item) => n + raw(item[field]), 0n);
const unique = values => assert.equal(new Set(values).size, values.length, 'duplicate identifier');
function block(value) { assert.ok(Number.isSafeInteger(value.number) && value.number > 0); chainHash(value.hash); }
function receipt(value) { chainHash(value.txHash); chainHash(value.blockHash); assert.ok(Number.isSafeInteger(value.blockNumber) && value.blockNumber > 0); }
function usage(value) {
  const input = value.promptTokens ?? value.prompt_tokens, output = value.completionTokens ?? value.completion_tokens;
  assert.ok(Number.isSafeInteger(input) && input > 0); assert.ok(Number.isSafeInteger(output) && output > 0);
  const total = value.totalTokens ?? value.total_tokens;
  if (total !== undefined) assert.equal(total, input + output, 'token usage sum');
  return { input, output };
}
function independent(value) {
  uuid(value.runId); digest(value.evidenceHash); assert.equal(value.mode, 'docker'); assert.equal(value.passed, true);
  assert.equal(value.tests.length, 5); unique(value.tests.map(t => t.case));
  assert.deepEqual(value.tests.map(t => t.case).sort(), [1, 2, 3, 4, 5]);
  assert.ok(value.tests.every(t => t.passed === true));
  if (value.testCount !== undefined) assert.equal(value.testCount, value.tests.length);
}
function finance(value, report) {
  assert.equal(value.status, 'confirmed'); assert.equal(value.chainId, '10143');
  assert.equal(value.agentId, report.chainAgentId ?? report.agentId); equalAddress(value.wallet, report.wallet);
  raw(value.cashRaw); raw(value.debtRaw); block(value.block);
}
function replay(value) {
  assert.ok(value.before && value.after, 'replay requires both snapshots');
  assert.ok(Object.keys(value.before).length >= 5, 'replay requires saved counters');
  assert.ok(value.before.nonces, 'replay requires transaction nonces');
  assert.deepEqual(value.after, value.before, 'replay must preserve saved counters and digests');
}
function settlement(value, principal, fee) {
  chainHash(value.txHash); block(value.block); assert.equal(value.passed, true); assert.equal(raw(value.slashedRaw), 0n);
  assert.equal(raw(value.repaidRaw), principal + fee, 'principal plus fee must equal repayment');
  assert.equal(raw(value.repaidRaw) + raw(value.residualRaw), 150000n, 'task reward settlement conservation');
  assert.equal(value.loanStatus, principal ? '2' : '0');
}

// These checks relate fields in published summaries. They neither fetch receipts
// nor recompute model/private-artifact digests from the unpublished source data.
export function checkOctober17Evidence(load) {
  const records = [];
  const read = name => load(`${prefix}${name}-public-summary.json`);
  const record = (source, capability, requestId, facts, modelMode) => records.push({
    capability, source: { file: source.file, sha256: source.sha256 }, requestId,
    environment: { chainId: '10143', chain: 'Monad Testnet', modelMode, observation: 'saved 2026-10-17 report' },
    checkedFacts: facts,
  });
  function creditLoop(name, expectedTasks) {
    const source = read(name), d = source.data;
    assert.equal(d.schemaVersion, 1); assert.equal(d.chainId, '10143'); assert.equal(d.origin, 'https://monad.tabbyai.xyz');
    assert.equal(d.modelMode, 'Real Kimi through deployed Magpie; canonical payment, saved physical responses, independent Docker/Arena');
    assert.equal(d.acceptancePassed, true);
    uuid(d.agentId); address(d.owner); address(d.wallet); assert.equal(d.tasks.length, 2);
    assert.deepEqual(d.tasks.map(t => t.taskId), expectedTasks); unique(d.tasks.map(t => t.requestId)); unique(d.tasks.map(t => t.paymentId));
    assert.equal(raw(d.initialCashRaw), 40000n); assert.equal(raw(d.perRunBudgetRaw), 120000n);
    assert.equal(sum(d.tasks, 'chargedRaw'), raw(d.totalChargedRaw)); assert.ok(raw(d.totalChargedRaw) <= raw(d.totalBudgetRaw));
    finance(d.funding.finance, d); assert.equal(d.funding.finance.cashRaw, d.initialCashRaw);
    receipt(d.funding.mon); receipt(d.funding.cash); raw(d.funding.mon.amountWei);
    let previousCash = d.initialCashRaw;
    for (let index = 0; index < d.tasks.length; index++) {
      const t = d.tasks[index], p = t.payment, s = t.settlement;
      uuid(t.requestId); digest(t.paymentId); receipt(p); assert.equal(p.canonical, true);
      assert.equal(t.status, 'Succeeded'); assert.equal(t.acceptancePassed, true); assert.equal(raw(t.chargedRaw), raw(d.perRunBudgetRaw));
      assert.equal(raw(p.fromCashRaw) + raw(p.fromCreditRaw), raw(t.chargedRaw), 'cash plus credit must equal package price');
      assert.equal(raw(p.feeRaw), raw(p.fromCreditRaw) * raw(p.feeBps) / 10000n, 'recorded loan fee calculation');
      settlement(s, raw(p.fromCreditRaw), raw(p.feeRaw)); assert.equal(s.canonical, true); independent(t.independent);
      finance(t.financeBefore, d); finance(t.financeAfter, d);
      assert.equal(t.financeBefore.cashRaw, previousCash, 'consecutive tasks must retain prior cash');
      assert.equal(raw(t.financeBefore.cashRaw), raw(p.fromCashRaw)); assert.equal(t.financeAfter.cashRaw, s.residualRaw);
      assert.equal(raw(t.financeBefore.debtRaw), 0n); assert.equal(raw(t.financeAfter.debtRaw), 0n);
      assert.equal(raw(t.financeAfter.counts.repayments), raw(t.financeBefore.counts.repayments) + 1n);
      assert.equal(raw(t.financeAfter.counts.successes), raw(t.financeBefore.counts.successes) + 1n);
      assert.equal(t.financeAfter.counts.defaults, t.financeBefore.counts.defaults);
      assert.ok(t.modelCalls.length > 0); unique(t.modelCalls.map(c => c.invocationId));
      for (const call of t.modelCalls) {
        digest(call.requestDigest); digest(call.responseDigest); digest(call.gateway.requestDigest); digest(call.gateway.responseDigest);
        assert.equal(call.requestedModel, `${call.modelId}/${call.responseModel}`); assert.equal(call.responseModel, call.gateway.model);
        assert.deepEqual(usage(call.usage), usage(call.gateway.usage), 'physical model usage binding');
        const { input, output } = usage(call.usage);
        assert.equal(raw(call.chargedCredits), BigInt(input + output * 2), 'configured cheap-model microcredit rate');
      }
      assert.equal(sum(t.modelCalls, 'chargedCredits'), raw(t.consumedCreditsRaw)); digest(t.artifactDigest); digest(t.snapshotDigest);
      previousCash = t.financeAfter.cashRaw;
    }
    replay(d.replay); assert.deepEqual(d.replay.before.originalRequestIds, d.tasks.map(t => t.requestId));
    assert.equal(d.replay.before.agentSpentRaw, d.totalChargedRaw); equalAddress(d.replay.before.nonces.agent.address, d.wallet);
    assert.equal(previousCash, '78700'); assert.equal(d.tasks.at(-1).financeAfter.credit.tier, 'B');
    record(source, name, d.tasks.map(t => t.requestId), { taskIds: expectedTasks, chargedRaw: d.totalChargedRaw, finalCashRaw: previousCash, finalDebtRaw: '0', replayAddedEffects: 0 }, d.modelMode);
    return d;
  }
  const credit = creditLoop('credit-loop', ['20', '21']);
  const presenter = creditLoop('presenter-credit-loop', ['24', '25']);

  for (const name of ['external', 'fallback-fresh']) {
    const source = read(name), d = source.data;
    assert.equal(d.schemaVersion, 1); assert.equal(d.chainId, '10143'); assert.equal(d.origin, 'https://monad.tabbyai.xyz');
    assert.equal(d.modelSource, 'Real Kimi K2.6/K3 through deployed Magpie gateway'); assert.equal(d.acceptancePassed, true);
    uuid(d.requestId); uuid(d.agentId); address(d.wallet); digest(d.goalDigest); digest(d.answer.sha256);
    assert.equal(d.status, 'Succeeded'); assert.equal(d.previousOutputPreserved, true);
    assert.equal(sum(d.payments, 'chargedRaw'), raw(d.chargedRaw)); assert.ok(raw(d.chargedRaw) <= raw(d.reservedRaw));
    assert.equal(raw(d.finance.cashBeforeRaw) - raw(d.finance.cashAfterRaw), raw(d.chargedRaw), 'goal cash conservation');
    assert.equal(raw(d.finance.debtAfterRaw), 0n); unique(d.payments.map(p => p.paymentId)); unique(d.payments.map(p => p.txHash));
    assert.deepEqual(d.payments.map(p => p.modelId), d.modelSequence, 'model sequence/payment binding');
    assert.equal(d.selectedModel, d.modelSequence[0]);
    const external = d.payments.filter(p => p.external);
    assert.equal(external.length, d.phases.length); assert.ok(external.length > 0);
    unique(d.discovery.selectedServiceIds); d.discovery.registryDigests.forEach(digest);
    for (const p of d.payments) {
      receipt(p); digest(p.paymentId); digest(p.requestDigest); assert.equal(p.status, 1);
      address(p.account); address(p.asset); address(p.payTo);
      assert.equal(raw(p.fromCashRaw), raw(p.chargedRaw)); assert.equal(raw(p.fromCreditRaw), 0n);
      assert.equal(p.gateway.httpStatus, 200); digest(p.gateway.requestDigest); digest(p.gateway.responseDigest);
      const u = usage(p.gateway.usage); assert.equal(u.input, p.promptTokens); assert.equal(u.output, p.completionTokens);
      assert.equal(p.gateway.model, p.modelId); assert.ok(p.physicalModel.endsWith(`/${p.modelId}`));
      assert.equal(raw(p.chargedRaw), p.modelId === 'kimi-k3' ? 20000n : 10000n);
      if (!p.external) continue;
      const binding = p.external, service = binding.service;
      assert.ok(d.discovery.selectedServiceIds.includes(service.id), 'hired service must be discovered');
      const phase = d.phases.find(phase => phase.external.id === service.id); assert.ok(phase, 'external payment must reference a phase');
      assert.deepEqual(service, phase.external, 'phase/service snapshot binding');
      assert.equal(service.identity.chainId, d.chainId); equalAddress(service.identity.wallet, service.provider);
      equalAddress(p.payTo, service.provider); assert.notEqual(p.payTo.toLowerCase(), d.wallet.toLowerCase());
      assert.equal(raw(p.chargedRaw), raw(service.priceRaw)); assert.equal(service.modelId, p.modelId);
      for (const key of ['paymentId', 'txHash', 'requestDigest']) assert.equal(binding[key], p[key], `external ${key} binding`);
      digest(binding.promptDigest); digest(binding.assignmentDigest); digest(phase.outputDigest);
      assert.equal(d.externalIdentity.chainId, service.identity.chainId); equalAddress(d.externalIdentity.wallet, service.provider);
      assert.equal(d.externalIdentity.agentId, service.identity.agentId);
    }
    const r = d.replay;
    assert.equal(r.nonceBefore, r.nonceAfter, 'goal replay must not add transactions');
    assert.equal(r.modelRequestsBefore, r.modelRequestsAfter, 'goal replay must not add model calls');
    for (const key of ['sameRequestId', 'sameResult', 'noNewTransactions', 'noNewModelRequests']) assert.equal(r[key], true);
    assert.equal(d.independentReview.external, false); assert.equal(d.independentReview.passed, true); assert.equal(d.independentReview.checkCount, 5);
    if (name === 'external') {
      assert.deepEqual(d.payments.map(p => p.stage), d.callStages); assert.equal(d.payments.length, 5);
      assert.equal(d.revision.firstReview.passed, false, 'original rejected review must remain recorded');
      assert.equal(d.revision.finalReview.passed, true); assert.equal(d.revision.count, 1);
      assert.equal(d.revision.original.sha256, d.phases[0].outputDigest);
      assert.equal(d.revision.revised.sha256, d.answer.sha256); assert.notEqual(d.revision.original.sha256, d.answer.sha256);
      assert.equal(d.independentReview.stage, d.revision.finalReview.stage);
    } else {
      assert.deepEqual(d.modelSequence, ['kimi-k3', 'kimi-k2.6', 'kimi-k2.6', 'kimi-k2.6']);
      assert.equal(d.answer.sha256, d.phases.at(-1).outputDigest); assert.equal(d.independentReview.stage, 'review');
    }
    record(source, name, d.requestId, { chargedRaw: d.chargedRaw, budgetRaw: d.reservedRaw, modelSequence: d.modelSequence, externalPayments: external.length, replayAddedEffects: 0 }, d.modelSource);
  }

  const automaticSource = read('automatic-fresh'), a = automaticSource.data;
  for (const key of ['automaticGameToSettledTaskAccepted', 'fullFreshAccepted', 'noReplacementUuid', 'noModelResponseText']) assert.equal(a[key], true);
  assert.equal(a.winnerGuaranteed, false); assert.equal(a.terminalFailureOrPausePreserved, false);
  assert.equal(a.version, 1); assert.equal(a.chainId, '10143'); assert.equal(a.modelMode, 'real-vendor');
  uuid(a.parentRequestId); assert.equal(a.parentRequestId, a.parent.requestId); assert.equal(a.parent.agentId, a.hostedAgentId);
  assert.equal(a.games.length, 1); assert.equal(a.tasks.length, 1); assert.equal(a.planner.length, 1);
  finance(a.before.finance, a); finance(a.after.finance, a);
  assert.equal(raw(a.before.finance.cashRaw), 0n); assert.equal(a.before.rewardTokens, 0); assert.equal(raw(a.fresh.agentCashSeedRaw), 0n);
  assert.equal(a.fresh.noSeedOrFreezeRemedy, true); assert.equal(a.fresh.protocolBefore.defaultsRaw, '0');
  assert.equal(a.fresh.protocolBefore.managerFrozen, false); assert.equal(a.fresh.protocolBefore.accountFrozen, false);
  const g = a.games[0], t = a.tasks[0], tr = t.result, planner = a.planner[0];
  uuid(g.requestId); uuid(t.requestId); assert.equal(g.hand.matchId, `hosted-${g.requestId}`); assert.equal(g.result.matchId, g.hand.matchId);
  assert.equal(g.rewardKind, 'usdc'); assert.equal(raw(g.reservedRaw), 0n); assert.equal(g.allowCredit, false); assert.equal(raw(g.result.rewardRaw), 100000n);
  assert.equal(g.hand.replayVerified, true); assert.equal(g.physicalAttempts.length, g.hand.attempts.length);
  for (let i = 0; i < g.physicalAttempts.length; i++) {
    const p = g.physicalAttempts[i], h = g.hand.attempts[i];
    assert.equal(p.turn, h.turn); assert.equal(p.seat, h.seat); assert.equal(p.outcome, h.outcome); assert.equal(h.outcome, 'Applied');
    assert.equal(p.requestedModel, h.requestedModel, 'game requested model binding');
    digest(p.requestDigest); digest(p.response.responseDigest); assert.equal(p.response.model, p.requestedModel);
    assert.deepEqual(usage(p.response.usage), usage(h.usage), 'game physical usage binding');
  }
  assert.equal(raw(tr.fromCashRaw) + raw(tr.fromCreditRaw), raw(tr.chargedRaw));
  assert.equal(raw(g.result.rewardRaw) - raw(planner.chargedRaw), raw(tr.fromCashRaw));
  settlement(tr.settlement, raw(tr.fromCreditRaw), raw(tr.fromCreditRaw) * 15n / 100n);
  assert.equal(raw(a.parent.chargedRaw), raw(tr.chargedRaw) + raw(planner.chargedRaw));
  assert.ok(raw(a.parent.chargedRaw) <= raw(a.before.settings.totalBudgetRaw));
  assert.equal(a.parent.chargedRaw, a.parent.result.chargedRaw); assert.equal(a.after.finance.cashRaw, tr.settlement.residualRaw);
  assert.equal(raw(a.after.finance.debtRaw), 0n); assert.equal(a.after.finance.counts.defaults, a.before.finance.counts.defaults);
  assert.equal(a.terminalParent.completedGames, a.games.length); assert.equal(a.terminalParent.completedTasks, a.tasks.length);
  assert.deepEqual(a.terminalParent.unfinishedChildren, []); assert.equal(a.terminalParent.reason, 'AUTONOMY_NO_AVAILABLE_TASKS');
  assert.equal(a.parent.status, 'Succeeded'); assert.equal(a.parent.result.phase, 'Stopped');
  assert.equal(a.parent.result.success, true); assert.equal(a.parent.result.terminal, true);
  assert.equal(g.result.success, true); assert.equal(g.result.terminal, true); assert.equal(g.result.phase, 'Succeeded');
  assert.equal(tr.success, true); assert.equal(tr.terminal, true); assert.equal(tr.phase, 'Succeeded');
  assert.equal(a.independentVerifier.length, 1); const verifier = a.independentVerifier[0];
  independent(verifier); assert.equal(verifier.taskId, tr.taskId); assert.equal(verifier.settlement.txHash, tr.settlement.txHash);
  for (const key of ['repaidRaw', 'slashedRaw', 'residualRaw']) assert.equal(verifier.settlement.event[key], tr.settlement[key]);
  unique(a.canonicalReceipts.map(r => r.txHash));
  for (const r of a.canonicalReceipts) { receipt(r); assert.equal(r.status, 1); assert.equal(r.canonical, true); }
  for (const txHash of [g.result.txHash, tr.acceptTxHash, tr.paymentTxHash, tr.settlement.txHash, planner.txHash]) {
    assert.ok(a.canonicalReceipts.some(r => r.txHash === txHash), 'operation must reference a saved canonical receipt');
  }
  const sr = a.canonicalReceipts.find(r => r.txHash === tr.settlement.txHash);
  assert.equal(sr.blockNumber, tr.settlement.block.number); assert.equal(sr.blockHash, tr.settlement.block.hash);
  assert.equal(t.meteredInferences.length, t.rounds.length);
  for (let i = 0; i < t.meteredInferences.length; i++) {
    const inference = t.meteredInferences[i]; digest(inference.requestDigest); digest(inference.responseDigest);
    assert.equal(inference.state, 'Completed'); assert.deepEqual(usage(inference.usage), usage(t.rounds[i].usage));
    assert.equal(inference.modelId, t.rounds[i].model, 'metered logical model binding');
    assert.equal(inference.selectedPhysicalModel, `${inference.modelId}/${inference.physicalResponseModel}`, 'metered physical response model binding');
    assert.equal(inference.physicalResponseModel, 'kimi-k2.6', 'metered saved Kimi model');
    const { input, output } = usage(inference.usage); assert.equal(raw(inference.chargedCredits), BigInt(input + output * 2));
  }
  digest(planner.paymentId); digest(planner.resultDigest); usage(planner.usage);
  assert.equal(planner.physicalModel, a.before.configuration.plannerPhysicalModel, 'planner configured physical route binding');
  assert.equal(planner.physicalResponseModel, a.before.configuration.plannerResponseModel, 'planner configured response model binding');
  assert.equal(planner.physicalModel, `cheap/${planner.physicalResponseModel}`, 'planner physical response model binding');
  replay(a.terminalReplay); assert.equal(a.terminalReplay.originalParentUuid, a.parentRequestId); assert.deepEqual(a.terminalReplay.parent, a.parent);
  record(automaticSource, 'automatic-fresh', a.parentRequestId, { taskId: tr.taskId, games: 1, tasks: 1, chargedRaw: a.parent.chargedRaw, cashAfterRaw: a.after.finance.cashRaw, debtAfterRaw: '0', replayAddedEffects: 0 }, a.modelMode);

  const tokenSource = read('token-supplement'), s = tokenSource.data;
  assert.equal(s.version, 1); assert.equal(s.outcome, 'TOKEN_GAME_CREDITS_EARNED');
  for (const key of ['accepted', 'fullAccepted', 'originalUuidsPreserved', 'noModelResponseText']) assert.equal(s[key], true);
  for (const run of [s.game, s.task]) {
    uuid(run.requestId); assert.equal(run.agentId, s.hostedAgentId); assert.equal(run.status, 'Succeeded');
    assert.equal(run.result.success, true); assert.equal(run.result.terminal, true); assert.equal(run.result.phase, 'Succeeded');
  }
  assert.equal(s.chainId, '10143'); assert.equal(s.hostedAgentId, a.hostedAgentId); assert.equal(s.agentId, a.agentId); equalAddress(s.wallet, a.wallet);
  finance(s.financeBefore, s); finance(s.financeBeforeTask, s); finance(s.financeAfterTask, s); finance(s.finance, s);
  assert.equal(s.financeBefore.cashRaw, a.after.finance.cashRaw); assert.equal(s.expectedTaskId, s.task.result.taskId);
  assert.equal(s.game.rewardKind, 'llm-credits'); assert.equal(raw(s.game.chargedRaw), 0n); assert.equal(raw(s.task.chargedRaw), 0n);
  assert.equal(s.grant.grantId, s.game.requestId); assert.equal(s.grant.matchId, s.game.result.matchId); assert.equal(s.publicHand.matchId, s.grant.matchId);
  assert.equal(s.grant.allocations[0], s.game.result.creditsGranted); assert.equal(s.game.result.creditsGranted, 4096);
  assert.equal(s.physicalGame.length, s.publicHand.attempts.length);
  for (let i = 0; i < s.physicalGame.length; i++) {
    const p = s.physicalGame[i], h = s.publicHand.attempts[i];
    assert.equal(p.turn, h.turn, 'token game turn binding'); assert.equal(p.seat, h.seat, 'token game seat binding');
    assert.equal(p.outcome, h.outcome, 'token game outcome binding'); assert.equal(h.outcome, 'Applied');
    assert.equal(p.requestedModel, h.requestedModel, 'token game requested model binding');
    assert.equal(p.response.model, p.requestedModel, 'token game response model binding');
    assert.equal(p.requestedModel, s.grant.model, 'token game reward model binding');
    digest(p.requestDigest); digest(p.response.responseDigest);
    assert.deepEqual(usage(p.response.usage), usage(h.usage), 'token game physical usage binding');
  }
  const redemptions = s.redemptions;
  assert.equal(redemptions.reduce((n, r) => n + r.chargedTokens, 0), s.task.result.creditsUsed);
  for (const r of redemptions) {
    assert.ok(r.redemptionId.startsWith(`${s.task.requestId}:`), 'redemption must retain original task request');
    digest(r.requestDigest); digest(r.response.responseDigest); assert.equal(r.status, 'Completed'); assert.equal(r.model, s.grant.model);
    assert.equal(r.response.model, r.model, 'token redemption response model binding');
    assert.equal(r.chargedTokens, r.usage.total_tokens); assert.deepEqual(usage(r.usage), usage(r.response.usage));
  }
  settlement(s.task.result.settlement, 0n, 0n); receipt(s.settlement); assert.equal(s.settlement.canonical, true);
  assert.equal(s.settlement.txHash, s.task.result.settlement.txHash); assert.equal(s.settlement.blockHash, s.task.result.settlement.block.hash);
  assert.equal(s.settlement.blockNumber, s.task.result.settlement.block.number);
  assert.equal(s.settlement.tests.length, 5); assert.ok(s.settlement.tests.every(t => t.passed));
  assert.equal(raw(s.financeAfterTask.cashRaw) - raw(s.financeBeforeTask.cashRaw), raw(s.settlement.residualRaw));
  assert.equal(s.finance.cashRaw, s.financeAfterTask.cashRaw); assert.equal(raw(s.finance.debtRaw), 0n);
  assert.equal(s.financeAfterTask.counts.repayments, s.financeBeforeTask.counts.repayments); assert.equal(s.financeAfterTask.counts.defaults, s.financeBeforeTask.counts.defaults);
  replay(s.replay); assert.equal(s.replay.before.originalAutoParent.requestId, a.parentRequestId);
  assert.deepEqual(s.replay.before.game, s.game); assert.deepEqual(s.replay.before.task, s.task);
  digest(s.sourceSessionDigest); digest(s.sourceEvidenceDigest);
  record(tokenSource, 'token-supplement', s.task.requestId, { taskId: s.expectedTaskId, creditsGranted: s.game.result.creditsGranted, tokensConsumed: s.task.result.creditsUsed, newLoanRaw: '0', finalCashRaw: s.finance.cashRaw, replayAddedEffects: 0 }, 'saved physical Kimi game and token-redemption response mappings');

  const recoverySource = read('settlement-recovery'), r = recoverySource.data, original = credit.tasks[1];
  assert.equal(r.after.status, 'Succeeded'); assert.equal(r.sameOriginalSignedTransaction, true); assert.equal(r.sameOriginalVerdict, true);
  assert.equal(r.chainId, '10143'); assert.equal(r.taskId, original.taskId); assert.equal(r.hostedRequestId, original.requestId);
  assert.equal(r.runId, original.independent.runId); assert.equal(r.before.error, 'SETTLEMENT_UNAVAILABLE');
  assert.equal(r.before.hadPersistedHttpEvaluation, false); assert.equal(r.legacyDockerReevaluation, true);
  assert.ok(raw(r.before.verifierBalanceWei) < raw(r.before.requiredUpfrontWei));
  assert.ok(raw(r.before.verifierBalanceWei) + raw(r.operatorGasTopup.wei) >= raw(r.before.requiredUpfrontWei));
  digest(r.operatorGasTopup.txHash); digest(r.signedBytesSha256);
  assert.equal(r.before.txHash, r.after.canonicalSettlement.txHash); assert.deepEqual(r.after.canonicalSettlement, original.settlement);
  assert.equal(r.sameOriginalPaymentTxHash, original.payment.txHash); assert.deepEqual(r.after.independent, original.independent);
  assert.equal(r.after.verifierNonce, r.before.verifierNonce + 1); assert.equal(r.after.gatewayAcceptedRequests, r.before.gatewayAcceptedRequests);
  assert.equal(r.newModelRequestsDuringRecovery, 0); assert.equal(r.newInferencePaymentDuringRecovery, false);
  replay(r.replay); assert.deepEqual(r.replay, credit.replay);
  record(recoverySource, 'settlement-recovery', r.hostedRequestId, { taskId: r.taskId, originalSettlementTxHash: r.before.txHash, verifierNonceIncrease: 1, addedModelRequests: 0, legacyDockerReevaluation: true }, 'recovery of saved credit-loop settlement; no new inference');

  const resourcesSource = read('resources'), resources = resourcesSource.data;
  assert.equal(resources.chainId, '10143'); assert.equal(resources.readOnly, true); block(resources.block);
  assert.equal(resources.agentId, presenter.agentId); assert.equal(resources.chainAgentId, presenter.chainAgentId); equalAddress(resources.wallet, presenter.wallet);
  assert.equal(resources.cashRaw, presenter.tasks.at(-1).financeAfter.cashRaw);
  assert.equal(raw(resources.spentRaw) + raw(resources.remainingBudgetRaw), raw(resources.totalBudgetRaw));
  assert.equal(resources.spentRaw, presenter.totalChargedRaw); assert.equal(resources.creditVault.totalOutstandingRaw, '0');
  assert.equal(resources.creditVault.drawPaused, false);
  for (const field of ['chainWrites', 'businessPosts', 'modelCalls']) assert.equal(resources[field], 0);
  for (const role of resources.roles) { address(role.address); raw(role.nativeWei); assert.equal(role.latestNonce, role.pendingNonce); }
  record(resourcesSource, 'presenter-resource-snapshot', presenter.agentId, { spentRaw: resources.spentRaw, remainingBudgetRaw: resources.remainingBudgetRaw, chainWrites: 0, modelCalls: 0 }, 'read-only snapshot; no business execution');
  return records;
}
