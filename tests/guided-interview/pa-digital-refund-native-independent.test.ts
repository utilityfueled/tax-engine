// Spec: spec/state/pa-digital-refund-native-independent.yaml. Independent source/behavior oracles frozen before runtime.
import {expect,it} from 'vitest';
import {PADigitalTaxRefundSourcesSchema} from '@/models/pa-digital-tax-refund-sources';
import {PAOrdinaryReturnCompletionSourcesSchema} from '@/models/pa-ordinary-return-completion';
import {calculatePADigitalTaxRefundSources} from '@/engine/state/pa-digital-tax-refund-sources';
import {assertGuidedPADigitalTaxRefundPair,buildGuidedPADigitalTaxRefundSources,confirmGuidedPADigitalTaxRefundSources,draftGuidedPADigitalTaxRefundSources,emptyPADigitalRefundApplication} from '@/lib/guided-pa-digital-tax-refund-sources';
import {buildGuidedPAOrdinaryReturnCompletionSources,confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {nativeRefundFixture} from '../fixtures/pa-digital-refund-native';
import {independentRefundThreshold} from '../fixtures/pa-digital-refund-native-independent';
it('independent VA application threshold is strictly below one dollar',()=>{
 for(const [amount,application]of [['1.00',false],['0.99',true]]as const){const f=independentRefundThreshold(amount,application),packet=confirmGuidedPADigitalTaxRefundSources(f.input,f.facts,f.raw),draft=draftGuidedPADigitalTaxRefundSources(packet),result=calculatePADigitalTaxRefundSources(f.input,f.facts,buildGuidedPADigitalTaxRefundSources(f.input,f.facts,draft));expect(result.actualReceivedRefund.toFixed()).toBe(amount==='1.00'?'1':'0.99');expect(result.actualNetTaxPaid.toFixed()).toBe('0');expect(result.paResidentCredit.toFixed()).toBe('0');expect(result.filingEligible).toBe(false);expect(draft.specialApplicationStatus).toBe(application?'reported':'none');}
 const below=independentRefundThreshold('0.99',false);expect(()=>confirmGuidedPADigitalTaxRefundSources(below.input,below.facts,below.raw)).toThrow('actual sub-dollar refund requires its special written taxpayer application');
});
it.each(['unknown application choice','retained application with none choice','request without actual receipt','zero actual receipt','unknown row source year','unknown actual original index']as const)('independent refund replay rejects %s and retains private records',kind=>{
 const f=nativeRefundFixture(),d=draftGuidedPADigitalTaxRefundSources(f.records);
 if(kind==='unknown application choice')d.specialApplicationStatus='unknown';if(kind==='retained application with none choice')d.specialApplicationStatus='none';if(kind==='request without actual receipt')d.refund.actuallyReceivedConfirmed=null;if(kind==='zero actual receipt')d.refund.amount='0';if(kind==='unknown row source year')d.statements[0].withholdingOriginal.sourceTaxYear=null;if(kind==='unknown actual original index')d.statements[0].originalIndex=null;
 const before=structuredClone(d);expect(()=>buildGuidedPADigitalTaxRefundSources(f.input,f.facts,d)).toThrow();expect(d).toEqual(before);
});
it.each(['pending draft','pending packet','equal-dollar award source edit','changed actual payer identity','changed ordinary asof','missing explicit application choice']as const)('independent canonical boundary rejects %s without repairing either side',kind=>{
 const f=nativeRefundFixture(),d=draftGuidedPADigitalTaxRefundSources(f.records),packet=structuredClone(f.records),input=structuredClone(f.input),facts=structuredClone(f.facts);
 if(kind==='pending draft')d.sourceFactsConfirmed=null;if(kind==='pending packet')packet.sourceFactsConfirmed=null;if(kind==='equal-dollar award source edit')d.agencyAward.sourceReference+=' independent edited document';if(kind==='changed actual payer identity')input.form1099DA[2].brokerName+=' independent edited broker';if(kind==='changed ordinary asof')facts.timing.asOfDate='2026-03-02';if(kind==='missing explicit application choice')Reflect.deleteProperty(d,'specialApplicationStatus');
 const before=structuredClone({d,packet,input,facts});expect(()=>assertGuidedPADigitalTaxRefundPair(input,facts,d,packet)).toThrow();expect({d,packet,input,facts}).toEqual(before);
});
it('independent completion preserves mixed-credit and unknown-field guards',()=>{
 const f=nativeRefundFixture(),d=draftGuidedPADigitalTaxRefundSources(f.records),base={...f.completion,otherStateTaxes:{...f.completion.otherStateTaxes,refundedDigitalDraft:d}};
 const mixed={...base,otherStateTaxes:{...base.otherStateTaxes,residentCreditDraft:{}}};expect(()=>confirmGuidedPAOrdinaryReturnCompletionSources(f.input,mixed,f.facts)).toThrow(/mixed resident-credit/i);
 const unknown={...base,otherStateTaxes:{...base.otherStateTaxes,paidTaxOverride:'0'}};expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,unknown,f.facts)).toThrow();
 const noChild={...base,otherStateTaxes:{...base.otherStateTaxes,refundedDigitalSources:undefined}};expect(()=>confirmGuidedPAOrdinaryReturnCompletionSources(f.input,noChild,f.facts)).toThrow();
});
it('independent confirmed draft roundtrip emits strict canonical zero-credit sources',()=>{
 const f=nativeRefundFixture(),d=draftGuidedPADigitalTaxRefundSources(f.records),saved=JSON.parse(JSON.stringify({...f.completion,otherStateTaxes:{...f.completion.otherStateTaxes,refundedDigitalDraft:d}})),before=structuredClone(saved),canonical=buildGuidedPAOrdinaryReturnCompletionSources(f.input,saved,f.facts);
 expect(PAOrdinaryReturnCompletionSourcesSchema.safeParse(canonical).success).toBe(true);expect(Reflect.has(canonical.otherStateTaxes,'refundedDigitalDraft')).toBe(false);expect(saved).toEqual(before);
 const packet=PADigitalTaxRefundSourcesSchema.parse(canonical.otherStateTaxes.refundedDigitalSources),r=calculatePADigitalTaxRefundSources(f.input,f.facts,packet);expect(r.actualVAWithholding.toFixed()).toBe('0.3');expect(r.actualReceivedRefund.toFixed()).toBe('0.3');expect(r.paResidentCredit.toFixed()).toBe('0');expect(packet.filedReturn.reportedWithholding).toBe('0');expect(packet.specialWrittenApplication?.amountRequested).toBe('0.30');
 const none=independentRefundThreshold('1.00',false),p=confirmGuidedPADigitalTaxRefundSources(none.input,none.facts,none.raw),knownNone=draftGuidedPADigitalTaxRefundSources(p);expect(knownNone.specialWrittenApplication).toEqual(emptyPADigitalRefundApplication());expect(knownNone.specialApplicationStatus).toBe('none');
});
