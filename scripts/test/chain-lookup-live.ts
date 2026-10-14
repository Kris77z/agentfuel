import {readFile,writeFile} from 'node:fs/promises';
import {collectChainResearch} from '../../services/hosted-agents/src/goals/chain-lookup.js';
const daemon=JSON.parse(await readFile('demo-output/monad-hosted-20261012/runtime/hosted.json','utf8'));
const task=JSON.parse(await readFile(daemon.executor.taskConfigFile,'utf8'));
const goal=process.argv[2]??'分析合约 0x534b2f3A21130d7a60830c2Df862319e593943A3';
const result=await collectChainResearch(goal,'10143',task);
await writeFile(process.argv[3]??'demo-output/chain-lookup-20261013/address-research.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({digest:result?.evidence.digest,contextBytes:Buffer.byteLength(result?.context??''),records:result?.evidence.records.map(r=>({kind:r.kind,target:r.target,block:r.blockNumber,source:r.source,facts:JSON.parse(r.dataJson)}))}));
