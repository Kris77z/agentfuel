import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Contract,Transaction} from 'ethers';
import {monadProvider,readRpcUrlFile} from '../demo-rpc.js';
const root='demo-output/monad-hosted-20261012/runtime';
const journal=JSON.parse(await readFile(process.env.CHAIN_JOURNAL??'demo-output/chain-lookup-20261013/monad-address-verified.json','utf8')).cases.address;
const ready=JSON.parse(await readFile(root+'/ready.json','utf8'));
const state=JSON.parse(await readFile(`${root}/hosted/agents/${journal.agentId}/runs/${journal.input.requestId}/mission/session.json`,'utf8'));
const call=state.calls.find((c:any)=>c.voidSubmission);assert.ok(call);assert.equal(journal.result.reason,'HOSTED_GOAL_PAYMENT_VOIDED');
const connection=await monadProvider(await readRpcUrlFile(ready.rpcUrlFile),ready.rpcTransport),rpc=connection.provider;
try{
 const original=Transaction.from(call.handle.submission.rawTransaction),replacement=Transaction.from(call.voidSubmission.raw);
 assert.equal(replacement.from,original.from);assert.equal(replacement.to,replacement.from);assert.equal(replacement.nonce,original.nonce);assert.equal(replacement.value,0n);assert.equal(replacement.data,'0x');
 const receipt=await rpc.getTransactionReceipt(call.voidSubmission.hash);assert.equal(receipt?.status,1);assert.equal((await rpc.getBlock(receipt!.blockNumber))?.hash,receipt!.blockHash);
 assert.equal(await rpc.getTransactionReceipt(call.handle.submission.txHash),null);
 const account=new Contract(ready.account,['function getPayment(bytes32) view returns(uint256,uint256,uint256,uint256,uint256)'],rpc);
 const paid=await account.getFunction('getPayment').staticCall(call.handle.quote.paymentId);assert.deepEqual([...paid],[0n,0n,0n,0n,0n]);
 const proof={requestId:journal.input.requestId,agentId:journal.agentId,chainId:'10143',paymentId:call.handle.quote.paymentId,expiredPaymentTxHash:call.handle.submission.txHash,voidTxHash:call.voidSubmission.hash,nonce:replacement.nonce,blockNumber:receipt!.blockNumber,blockHash:receipt!.blockHash,status:receipt!.status,oldPaymentRaw:'0',sameNonce:true,selfTransferValue:'0',terminalPhase:journal.result.result.phase,retainedChargesRaw:journal.result.result.chargedRaw,replay:journal.replay};
 await writeFile(process.env.CHAIN_PROOF_OUT??'frontend/acceptance/chain-lookup-20261013/expired-payment-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
}finally{connection.close();}
