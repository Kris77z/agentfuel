import { Contract, Transaction, Wallet, keccak256, type JsonRpcProvider } from 'ethers';
import { ACCOUNT_ABI } from '@agentfuel/sdk';
import type { GoalState, GoalCall } from './executor.js';
import { reconcileGoalPayment } from './reconciliation.js';

/** Replace only an expired, unpaid signature. Persist replacement bytes before
 * broadcast; recovery must never sign a new payment or silently release funds. */
export async function voidExpiredGoalPayment(state:GoalState,call:GoalCall,accountAddress:string,asset:string,rpc:JsonRpcProvider,wallet:Pick<Wallet,'address'|'signTransaction'>,save:()=>Promise<void>,timeoutMs:number){
 const reconciled=await reconcileGoalPayment(state,call,accountAddress,asset,rpc);
 if(reconciled)return reconciled;
 const h=call.handle;
 if(!h)return;
 const head=await rpc.getBlock('latest');
 if(!head?.hash||BigInt(h.quote.quoteExpiry)>=BigInt(head.timestamp))return;
 const account=new Contract(accountAddress,ACCOUNT_ABI,rpc);
 const payment=await account.getFunction('getPayment').staticCall(h.quote.paymentId,{blockTag:head.number});
 if(payment.agentId!==0n||payment.fromCash!==0n||payment.fromCredit!==0n||payment.refundedAmount!==0n)return;
 if(!h.submission)return {chargedRaw:'0',refundedRaw:'0',resolved:true,voided:true};
 if(!h.submission.rawTransaction||!h.submission.txHash)return;
 // reconcileGoalPayment above has validated the complete quote and signed call.
 const original=Transaction.from(h.submission.rawTransaction);
 if(wallet.address.toLowerCase()!==state.input.wallet.toLowerCase())throw Error('HOSTED_GOAL_BINDING_CHANGED');
 if(await rpc.getTransactionReceipt(h.submission.txHash))return;
 if(await rpc.getTransactionCount(wallet.address,head.number)!==original.nonce)return;
 if((await rpc.getBlock(head.number))?.hash!==head.hash)throw Error('HOSTED_GOAL_PAYMENT_UNCONFIRMED');
 if(!call.voidSubmission){
  const fees=await rpc.getFeeData(),bump=(n:bigint)=>n*125n/100n+1n,max=(a:bigint,b:bigint)=>a>b?a:b;
  const priority=max(fees.maxPriorityFeePerGas??0n,bump(original.maxPriorityFeePerGas??original.gasPrice??0n));
  const fee=max(max(fees.maxFeePerGas??fees.gasPrice??0n,bump(original.maxFeePerGas??original.gasPrice??0n)),priority);
  const raw=await wallet.signTransaction({type:2,chainId:BigInt(state.input.chainId),nonce:original.nonce,to:wallet.address,value:0n,data:'0x',gasLimit:21000n,maxFeePerGas:fee,maxPriorityFeePerGas:priority});
  call.voidSubmission={raw,hash:keccak256(raw)};await save();
 }
 const cancel=Transaction.from(call.voidSubmission.raw);
 if(cancel.hash!==call.voidSubmission.hash||cancel.chainId!==original.chainId||cancel.nonce!==original.nonce||cancel.from?.toLowerCase()!==wallet.address.toLowerCase()||cancel.to?.toLowerCase()!==wallet.address.toLowerCase()||cancel.value!==0n||cancel.data!=='0x'||cancel.gasLimit!==21000n)throw Error('HOSTED_GOAL_BINDING_CHANGED');
 try{
  if(!await rpc.getTransactionReceipt(call.voidSubmission.hash)){
   const tx=await rpc.broadcastTransaction(call.voidSubmission.raw);await tx.wait(1,timeoutMs);
  }
 }catch{
  // Either the original or its replacement can win the nonce race. Only chain
  // reconciliation decides the outcome, never a broadcast response or timeout.
 }
 return reconcileGoalPayment(state,call,accountAddress,asset,rpc);
}
