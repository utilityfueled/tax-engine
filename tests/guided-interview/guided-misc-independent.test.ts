// Spec: spec/state/guided-misc-independent.yaml. Independent source-first review only.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildScheduleAInput,buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {buildGuidedZeroIncomeMiscSources,confirmZeroIncomeMiscSource} from '@/lib/guided-zero-income-misc-sources';
import {reconcileGuidedZeroIncomeMiscOriginalClaims,reconcileGuidedZeroIncomeMiscWithholding} from '@/lib/guided-zero-income-misc-withholding-reconciliation';
import {calculateStateLocalIncomeTaxDeduction} from '@/engine/forms/state-local-income-tax-deduction';
import {completeTreasuryRouting} from '../fixtures/guided-state-routing-complete';
import {guidedPARetirementSourceFixture} from '../fixtures/guided-pa-bridge-complete';
import {fictionalMiscOriginal} from '../fixtures/guided-zero-income-misc';

function complete(code:'PA'|'OH'='PA'){return completeTreasuryRouting(code,true,true).state;}
function data(state:ReturnType<typeof complete>){const value=state.sectionData['state-return'];if(!value)throw Error('Explicit fictional state source required');return value;}
function input(state:ReturnType<typeof complete>){const raw=buildTaxInputFromGuidedData(state);if(!raw)throw Error('Current original builder did not produce input');return TaxYearInputSchema.parse(raw);}
function itemized(state:ReturnType<typeof complete>){state.sectionData.deductions={method:'itemized',medicalExpenses:'0',stateLocalTaxes:'0',nonW2IncomeTaxesDeductedElsewhere:'0',realEstateTaxes:'0',personalPropertyTaxes:'0',mortgageInterest:'0',mortgageEntries:[],charitableContributions:'0',donationEntries:[],casualtyLosses:'0',otherItemized:'0',investmentInterestExpense:'0',gamblingWinnings:'0',gamblingLosses:'0',gamblingExpenses:'0'};return state;}
function claimedState(code:'PA'|'OH',rows:ReturnType<typeof fictionalMiscOriginal>[]){const state=complete(code),packet=data(state);packet.zeroIncomeMiscSources=rows.map(row=>confirmZeroIncomeMiscSource(row,2025,'single'));packet.additionalStateWithholdingEntries=rows.map(row=>({payer:row.payer,documentType:'1099-MISC' as const,state:code,taxYear:'2025',amount:row.stateWithheld}));packet.additionalStateWithholding=rows.reduce((total,row)=>total.plus(row.stateWithheld),new Decimal(0)).toFixed();return state;}
function secondOriginal(code:'PA'|'OH',samePayer=false){const row=fictionalMiscOriginal(code);Object.assign(row,{sourceId:'Distinct actual source B',accountReference:'Distinct actual account B',payer:samePayer?row.payer:'Independent other payer',payerTin:samePayer?row.payerTin:'87-6543210',stateWithheld:samePayer?'0.20':'0.37'});Object.assign(row.remittance,{payerTin:row.payerTin,accountReference:row.accountReference,confirmationNumber:'Distinct actual remittance B',amountPaid:row.stateWithheld});return row;}

it('independent raw original SALT money counts each original once',()=>{
 for(const code of ['PA','OH']as const){const state=itemized(complete(code)),before=structuredClone(state),actual=input(state),worksheet=calculateStateLocalIncomeTaxDeduction(actual);
  // Literal independent original amounts pinned before output: 2000+.10+.20+.30.
  expect(actual.w2s[0].stateTaxWithheld).toBe('2000');expect(actual.form1099Misc[0].stateWithheld).toBe('0.20');
  expect(worksheet.w2StateWithholding.toFixed()).toBe('2000');expect(worksheet.nonW2Withholding.toFixed()).toBe('0.3');expect(worksheet.statePaymentsInYear.toFixed()).toBe('0.3');expect(worksheet.additionalPayments.toFixed()).toBe('0');expect(worksheet.total.toFixed(2)).toBe('2000.60');expect(state).toEqual(before);
 }
 const state=itemized(guidedPARetirementSourceFixture().state),packet=data(state),misc=fictionalMiscOriginal('PA');Object.assign(misc,{recipientFirstName:'Jane',recipientLastName:'Doe'});packet.zeroIncomeMiscSources=[confirmZeroIncomeMiscSource(misc,2025,'single')];packet.additionalStateWithholdingEntries=[...(packet.additionalStateWithholdingEntries??[]),{payer:misc.payer,documentType:'1099-MISC',state:'PA',taxYear:'2025',amount:'0.20'}];packet.additionalStateWithholding='500.20';
 const before=structuredClone(state),actual=input(state),worksheet=calculateStateLocalIncomeTaxDeduction(actual);expect(actual.form1099R[0].stateWithheld).toBe('500');expect(worksheet.additionalPayments.toFixed()).toBe('0');expect(worksheet.nonW2Withholding.toFixed()).toBe('500.2');expect(worksheet.total.toFixed(2)).toBe('2500.20');expect(state).toEqual(before);
});

it('independent distinct source order and exact cents remain source-bound',()=>{
 for(const code of ['PA','OH']as const){
  const state=claimedState(code,[fictionalMiscOriginal(code),secondOriginal(code)]),originals=buildGuidedZeroIncomeMiscSources(state).reverse(),before=structuredClone(state);
  const actual=reconcileGuidedZeroIncomeMiscOriginalClaims(originals,state,code);expect(actual.matchedOriginalIndices).toEqual([1,0]);expect(actual.matchedAmount.toFixed(2)).toBe('0.57');expect(state).toEqual(before);
  const ambiguous=claimedState(code,[fictionalMiscOriginal(code),secondOriginal(code,true)]),packet=data(ambiguous);packet.additionalStateWithholdingEntries=packet.additionalStateWithholdingEntries?.slice(0,1);packet.additionalStateWithholding='0.20';
  expect(()=>reconcileGuidedZeroIncomeMiscOriginalClaims(buildGuidedZeroIncomeMiscSources(ambiguous),ambiguous,code)).toThrow(/ambiguous/);
 }
});

it.each(['unknown-amount','unknown-owner','unknown-current','false-current','unknown-remittance','false-remittance','unknown-zero','positive-income','overprecision','unknown-payer','unknown-account','stale-reference','stale-paid-date','wrong-household','missing-snapshot','duplicate-original']as const)('independent native source unknowns remain unknown (%s)',kind=>{
 const state=complete(),packet=data(state),row=packet.zeroIncomeMiscSources?.[0];if(!row)throw Error('Explicit original required');
 switch(kind){case'unknown-amount':row.stateWithheld='';break;case'unknown-owner':row.accountHolder='';break;case'unknown-current':row.currentOriginalConfirmed=null;break;case'false-current':row.currentOriginalConfirmed=false;break;case'unknown-remittance':row.remittance.actuallyRemittedConfirmed=null;break;case'false-remittance':row.remittance.actuallyRemittedConfirmed=false;break;case'unknown-zero':row.otherIncome='';break;case'positive-income':row.otherIncome='0.01';break;case'overprecision':row.stateWithheld='0.201';row.remittance.amountPaid='0.201';break;case'unknown-payer':row.payerTin='';break;case'unknown-account':row.accountReference='';break;case'stale-reference':row.remittance.sourceReference='Private changed ledger ref';break;case'stale-paid-date':row.remittance.paidDate='2026-01-16';break;case'wrong-household':row.recipientSsn='222-33-4444';break;case'missing-snapshot':delete row.confirmedOriginal;break;case'duplicate-original':packet.zeroIncomeMiscSources?.push(structuredClone(row));break;}
 const before=structuredClone(state);expect(()=>buildGuidedZeroIncomeMiscSources(state),kind).toThrow();expect(state).toEqual(before);
});

it.each(['schema-zero','missing-source','duplicate-canonical','same-cash-new-account','missing-owner','wrong-year','unknown-payer','private-reference-edit']as const)('independent canonical source replacement rejects (%s)',kind=>{
 const state=complete(),actual=buildGuidedStateOriginals(input(state),state),row=actual.form1099Misc[0];
 switch(kind){case'schema-zero':{const raw=structuredClone(row);delete raw.stateWithheld;actual.form1099Misc[0]=TaxYearInputSchema.parse({...actual,form1099Misc:[raw]}).form1099Misc[0];expect(actual.form1099Misc[0].stateWithheld).toBe('0');break;}case'missing-source':actual.form1099Misc=[];break;case'duplicate-canonical':actual.form1099Misc.push(structuredClone(row));break;case'same-cash-new-account':row.accountReference='Another actual account';break;case'missing-owner':delete row.accountHolder;break;case'wrong-year':row.taxYear=2024;break;case'unknown-payer':delete row.payerTin;break;case'private-reference-edit':row.sourceId='Another actual original';break;}
 const before=structuredClone({actual,state});expect(()=>reconcileGuidedZeroIncomeMiscWithholding(actual,state,'PA'),kind).toThrow();expect({actual,state}).toEqual(before);
});

it.each(['zero','unmatched-cent','overprecision','duplicate','wrong-type','missing-row-total','wrong-year','wrong-state','unknown-amount']as const)('independent saved ledger edits cannot create cash (%s)',kind=>{
 const state=complete('OH'),packet=data(state),row=packet.additionalStateWithholdingEntries?.[0];if(!row)throw Error('Explicit saved source claim required');
 switch(kind){case'zero':row.amount='0';packet.additionalStateWithholding='0';break;case'unmatched-cent':row.amount='0.21';packet.additionalStateWithholding='0.21';break;case'overprecision':row.amount='0.201';packet.additionalStateWithholding='0.201';break;case'duplicate':packet.additionalStateWithholdingEntries?.push(structuredClone(row));packet.additionalStateWithholding='0.40';break;case'wrong-type':row.documentType='1099-G';break;case'missing-row-total':packet.additionalStateWithholdingEntries=[];break;case'wrong-year':row.taxYear='2026';break;case'wrong-state':row.state='PA';break;case'unknown-amount':row.amount='';break;}
 const before=structuredClone(state);expect(()=>reconcileGuidedZeroIncomeMiscOriginalClaims(buildGuidedZeroIncomeMiscSources(state),state,'OH',kind==='duplicate'?packet.additionalStateWithholdingEntries:[row]),kind).toThrow();expect(state).toEqual(before);
});

it.each(['missing','copied-state-data','empty-originals','canonical-schema-zero','stale-remittance','duplicate-claim']as const)('independent source context cannot be replaced (%s)',kind=>{
 const state=itemized(complete('OH')),packet=data(state),actual=input(state);let context:{state:typeof state;originals:typeof actual.form1099Misc}|undefined={state,originals:actual.form1099Misc};let passed=packet;
 switch(kind){case'missing':context=undefined;break;case'copied-state-data':passed=structuredClone(packet);break;case'empty-originals':context.originals=[];break;case'canonical-schema-zero':context.originals=actual.form1099Misc.map(row=>({...row,stateWithheld:'0'}));break;case'stale-remittance':if(!packet.zeroIncomeMiscSources?.[0])throw Error('Original required');packet.zeroIncomeMiscSources[0].remittance.confirmationNumber='Changed original payment';break;case'duplicate-claim':if(!packet.additionalStateWithholdingEntries?.[0])throw Error('Claim required');packet.additionalStateWithholdingEntries.push(structuredClone(packet.additionalStateWithholdingEntries[0]));packet.additionalStateWithholding='0.40';break;}
 const before=structuredClone({state,actual,passed});expect(()=>buildScheduleAInput(state.sectionData.deductions,passed,undefined,2025,context)).toThrow();expect({state,actual,passed}).toEqual(before);
});

it('independent replay preserves raw originals and returns no private identifiers',()=>{
 for(const code of ['PA','OH']as const){const state=complete(code),actual=buildGuidedStateOriginals(input(state),state),before=structuredClone({state,actual}),result=reconcileGuidedZeroIncomeMiscWithholding(actual,state,code),serialized=JSON.stringify(result);
  expect(result.matchedAmount.constructor).toBe(Decimal);expect(result.matchedAmount.toFixed(2)).toBe('0.20');expect(Object.keys(result).sort()).toEqual(['matchedAmount','matchedOriginalIndices']);expect(result.matchedOriginalIndices).toEqual([0]);
  for(const privateText of ['987654321','98-7654321','111-22-3333','Fictional private source account A','Fictional remittance A'])expect(serialized).not.toContain(privateText);
  expect({state,actual}).toEqual(before);expect(reconcileGuidedZeroIncomeMiscWithholding(actual,state,code).matchedAmount.toFixed(2)).toBe('0.20');expect({state,actual}).toEqual(before);
 }
});

it.each(['PA-packet','PA-confirmation','OH-both-packets','OH-payments','OH-residency']as const)('independent current state proof cannot be removed (%s)',kind=>{
 const code=kind.startsWith('PA')?'PA':'OH',state=complete(code),packet=data(state);
 if(kind==='PA-packet')delete packet.paResidencySources;
 else if(kind==='PA-confirmation'){if(!packet.paResidencySources)throw Error('Original packet required');packet.paResidencySources.sourceFactsConfirmed=null;}
 else if(kind==='OH-both-packets'){delete packet.ohioPayments;delete packet.ohioResidency;}
 else if(kind==='OH-payments')delete packet.ohioPayments;else delete packet.ohioResidency;
 const before=structuredClone(state);expect(computeGuidedPreview(state)?.state??null).toBeNull();expect(state).toEqual(before);
});
