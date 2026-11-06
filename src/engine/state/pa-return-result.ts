/** Distinct PA result families; separate returns never expose a household PA40. */
import type {PAOrchestratorResult} from './pa-orchestrator.js';
import type {PAOrdinaryReturnResult} from './pa-ordinary-return.js';
import type {PANonresidentOrchestratorResult} from './pa-nonresident-orchestrator.js';
import type {PAMarriedOrdinaryReturnResult} from './pa-married-ordinary-return.js';
export type PennsylvaniaReturnResult=PAOrchestratorResult|PAOrdinaryReturnResult|PANonresidentOrchestratorResult|PAMarriedOrdinaryReturnResult;
export function isPAMarriedOrdinaryReturnResult(value:unknown):value is PAMarriedOrdinaryReturnResult{return !!value&&typeof value==='object'&&'methodVersion'in value&&value.methodVersion==='pa-married-ordinary-return-v1';}
/** This native/public successor has no qualified separately owned paper context. */
export function assertNoPAMarriedPaperExport(input:{paMarriedOrdinarySources?:unknown},result?:unknown):void{if(input.paMarriedOrdinarySources!==undefined||isPAMarriedOrdinaryReturnResult(result))throw new Error('Married Pennsylvania paper export requires its actual separately owned prepared review and qualified PA40/SP successor.');}
