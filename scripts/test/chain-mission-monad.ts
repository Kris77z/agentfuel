import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {Wallet,Contract,keccak256,toUtf8Bytes} from 'ethers';
import {monadProvider,readRpcUrlFile} from '../demo-rpc.js';
const root='demo-output/monad-hosted-20261012/runtime',out=process.env.CHAIN_JOURNAL??'demo-output/chain-lookup-20261013/monad-acceptance.json';
const ready=JSON.parse(await readFile(root+'/ready.json','utf8')),old=JSON.parse(await readFile(root+'/acceptance.json','utf8'));
const base=ready.hostedUrl;let token='';
const budgetRaw=process.env.CHAIN_BUDGET_RAW??'50000';assert.ok(['30000','50000'].includes(budgetRaw));
async function api(path:string,method='GET',body?:unknown){const r=await fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});const v=await r.json();assert.ok(r.ok,`${path} ${r.status} ${JSON.stringify(v)}`);return v;}
const owner=new Wallet((await readFile(root+'/owner.key','utf8')).trim());const challenge=await api('/auth/challenge','POST',{wallet:owner.address});token=(await api('/auth/login','POST',{challengeId:challenge.id,signature:await owner.signMessage(challenge.message)})).token;
let journal:any;try{journal=JSON.parse(await readFile(out,'utf8'));}catch(e:any){if(e.code!=='ENOENT')throw e;journal={version:1,network:'Monad Testnet',chainId:'10143',startedAt:new Date().toISOString(),cases:{}};}
const save=()=>writeFile(out,JSON.stringify(journal,null,2),{mode:0o600});
const connection=await monadProvider(await readRpcUrlFile(ready.rpcUrlFile),ready.rpcTransport),rpc=connection.provider;
const account=new Contract(ready.account,['function cash(uint256) view returns(uint256)','function getPayment(bytes32) view returns(uint256 agentId,uint256 taskId,uint256 fromCash,uint256 fromCredit,uint256 refundedAmount)'],rpc);
const cases=[{label:'address',actor:process.env.CHAIN_ACTOR??'cheap',goal:'请分析 Monad 测试网合约 0x534b2f3A21130d7a60830c2Df862319e593943A3，说明合约类型、代币基本信息和代理实现。引用读取网络和区块；资料不完整的部分明确标为未知，不要假设已完成安全审计。'}, {label:'transaction',actor:'strong',goal:'请解释 Monad 测试网交易 0xc801dd8afa572df307f50af02df5b2de8a7408e14124d08c52c7ab7b8a53a447，说明是否成功、调用方法和参数、实际日志、gas费用，引用读取网络和区块。'}];
try{
 for(const sample of cases.filter(c=>!process.env.CHAIN_CASE||c.label===process.env.CHAIN_CASE)){
  const snapshot=await api('/agents');assert.equal(snapshot.capabilities.goals.chainLookup.chainId,'10143');
  const agent=snapshot.agents.find((a:any)=>a.id===old.agents[sample.actor].agent.id);assert.ok(agent);assert.equal(agent.owner.toLowerCase(),owner.address.toLowerCase());
  const entry=journal.cases[sample.label]??={agentId:agent.id,chainAgentId:agent.binding.agentId,wallet:agent.wallet,original:Object.fromEntries(['name','modelId','strategy','perRunBudgetRaw','totalBudgetRaw','allowCredit'].map(k=>[k,agent[k]])),input:{action:'goal',requestId:randomUUID(),goal:process.env.CHAIN_GOAL??sample.goal}};await save();
  if(!entry.result?.result?.terminal){
   if(!entry.prepared){assert.ok(!agent.activeRequestId);entry.cashBefore=(await account.getFunction('cash').staticCall(agent.binding.agentId)).toString();assert.ok(BigInt(entry.cashBefore)>=BigInt(budgetRaw),'Acceptance needs 0.05 test USDC already in the controlled Agent cash account');await api(`/agents/${agent.id}`,'PATCH',{...entry.original,modelId:'kimi-k2.6',perRunBudgetRaw:budgetRaw});entry.prepared=true;await save();}
   if(!snapshot.runs.some((r:any)=>r.requestId===entry.input.requestId))await api(`/agents/${agent.id}`,'PATCH',{...entry.original,modelId:'kimi-k2.6',perRunBudgetRaw:budgetRaw});
   if(process.env.CHAIN_CANCEL==='1')await api(`/agents/${agent.id}/cancel`,'POST',{requestId:entry.input.requestId});
   else await api(`/agents/${agent.id}/runs`,'POST',entry.input);
   let last='';for(const deadline=Date.now()+1200000;Date.now()<deadline;){const s=await api('/agents'),run=s.runs.find((r:any)=>r.requestId===entry.input.requestId);if(run){const state=JSON.stringify({case:sample.label,status:run.status,stage:run.mission?.stage,calls:run.mission?.calls.length,reason:run.reason});if(state!==last){console.log(state);last=state;}if(!['Running','Queued'].includes(run.status)){entry.result=run;await save();break;}}await new Promise(r=>setTimeout(r,2000));}
  }
  assert.ok(entry.result?.result?.terminal,JSON.stringify(entry.result));
  const run=entry.result;entry.cashAfter=(await account.getFunction('cash').staticCall(agent.binding.agentId)).toString();entry.receipts=[];
  for(const call of run.mission.calls){const receipt=await rpc.getTransactionReceipt(call.txHash);assert.equal(receipt?.status,1);const payment=await account.getFunction('getPayment').staticCall(call.paymentId);assert.equal(payment.agentId,BigInt(agent.binding.agentId));assert.equal(payment.fromCredit,0n);assert.equal(payment.fromCash,BigInt(call.chargedRaw));entry.receipts.push({...call,blockNumber:receipt!.blockNumber,blockHash:receipt!.blockHash,status:receipt!.status});}
  assert.equal(BigInt(entry.cashBefore)-BigInt(entry.cashAfter),BigInt(run.result.chargedRaw));
  const evidence=run.mission.research;assert.equal(evidence.chainId,'10143');const {digest,...core}=evidence;assert.equal(keccak256(toUtf8Bytes(JSON.stringify(core))),digest);
  const nonce=await rpc.getTransactionCount(agent.wallet),before=await(await fetch('http://127.0.0.1:3427/health')).json();await api(`/agents/${agent.id}/runs`,'POST',entry.input);const replay=(await api('/agents')).runs.find((r:any)=>r.requestId===entry.input.requestId);assert.deepEqual(replay.mission,run.mission);assert.equal(await rpc.getTransactionCount(agent.wallet),nonce);const after=await(await fetch('http://127.0.0.1:3427/health')).json();assert.equal(after.acceptedRequests,before.acceptedRequests);entry.replay={sameSnapshot:true,noNewPayments:true,noNewModelCalls:true};
  await api(`/agents/${agent.id}`,'PATCH',entry.original);entry.settingsRestored=true;await save();
  if(process.env.CHAIN_EXPECT_FAILURE)assert.equal(run.result.reason,process.env.CHAIN_EXPECT_FAILURE);else assert.equal(run.status,'Succeeded',JSON.stringify(run));
 }
 if(cases.every(c=>journal.cases[c.label]?.result?.status==='Succeeded'))journal.completedAt=new Date().toISOString();await save();console.log('MONAD_CHAIN_CASES_VERIFIED');
}finally{connection.close();await api('/auth/logout','POST',{});}
