// Spec: state/pa-brokerage-composition-successor-independent.yaml.
// Separate existing fictional cohorts are retained, never inferred actual mixed facts.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {currentInvestmentOriginals,incompleteInvestmentWithholdingState,confirmFictionalInvestmentStateSources} from '../../fixtures/pa-ordinary-brokerage-sources';
import {guidedPACompleteDigital} from '../../fixtures/guided-pa-digital-complete';
import {paRoyaltyTaxRefundFixture} from '../../fixtures/pa-royalty-tax-refund-sources';
import {paCreditCompositionFixture} from '../../fixtures/pa-resident-credit-composition';
function settledNY(){
 const state=incompleteInvestmentWithholdingState();confirmFictionalInvestmentStateSources(state,'NY');const actual=state.sectionData['state-return'];
 if(!actual?.paResidencySources?.brokerageSources||!actual.paOrdinaryReturnFacts||!actual.paOrdinaryReturnCompletionSources)throw Error('Explicit complete fictional NY originals required');
 return {input:{...currentInvestmentOriginals(state),paResidencySources:actual.paResidencySources},facts:actual.paOrdinaryReturnFacts,completion:actual.paOrdinaryReturnCompletionSources};
}
it('retains the actual complete NY-only settlement with zero PA credit and no read-time mutation',()=>{
 const f=settledNY(),before=structuredClone(f),result=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
 const account=f.input.paResidencySources.brokerageSources?.settledNYAccounts[0];if(!account)throw Error('Actual fictional account required');
 expect(account.payments[0]?.amount).toBe('400');expect(account.filedReturn.withholdingReported).toBe('0');expect(account.filedReturn.refundRequested).toBe('0');expect(account.refunds[0]?.principalAmount).toBe('400');expect(result.pa40.residentCredit.toFixed()).toBe('0');expect(result.pa40.stateWithholding.toFixed()).toBe('0');expect(result.readiness.filingEligible).toBe(false);expect(f).toEqual(before);
});
it.each(['resident-credit','VA-digital-refund','MI-royalty-refund']as const)('rejects settled NY plus retained separate %s packet explicitly as mixed method',kind=>{
 const f=settledNY();
 // These are existing source cohorts. Their current-source bindings are not repaired to pretend a supported mixed method exists.
 if(kind==='resident-credit')Object.assign(f.completion.otherStateTaxes,{residentCreditSources:paCreditCompositionFixture().packet});
 if(kind==='VA-digital-refund')Object.assign(f.completion.otherStateTaxes,{refundedDigitalSources:guidedPACompleteDigital().refundSources});
 if(kind==='MI-royalty-refund')Object.assign(f.completion.otherStateTaxes,{refundedRoyaltySources:paRoyaltyTaxRefundFixture().refund});
 const before=structuredClone(f);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow(/mixed.*(?:method|packet|source)/i);expect(f).toEqual(before);
});
it.each([false,true])('none_paid cannot suppress actual settled NY remittance even with emptyjurisdictions=%s',empty=>{
 const f=settledNY();f.completion.otherStateTaxes.status='none_paid';if(empty)f.completion.otherStateTaxes.jurisdictions=[];const before=structuredClone(f);
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow(/no-paid.*(?:settled|investment|brokerage|payment)/i);expect(f).toEqual(before);
});
it('unknown history remains unknown despite the retained actual settled NY packet',()=>{
 const f=settledNY();f.completion.otherStateTaxes.status='unknown';expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow(/history is unknown/i);
});
it('none_paid cannot erase a current NY withholding original by deleting its settlement packet',()=>{
 const f=settledNY();f.completion.otherStateTaxes.status='none_paid';const brokerage=f.input.paResidencySources.brokerageSources;if(!brokerage)throw Error('Actual brokerage source required');brokerage.settledNYAccounts=[];
 expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow(/source-qualified|settled|history|payment/i);
});

// Additive source-first adjacent control. The original eight controls above remain byte-exact.
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {brokeragePacket} from '../../fixtures/pa-ordinary-brokerage-sources';
it.each([false,true])('preserves actual digital ScheduleD with complete empty securities packet=%s',explicitEmpty=>{
 const f=guidedPACompleteDigital(),input=structuredClone(f.input),residency=input.paResidencySources;
 if(!residency)throw Error('Existing complete fictional digital residency originals required');
 // The captured digital-only cohort explicitly has no original securities, bank or dividend records.
 expect(input.form1099B).toEqual([]);expect(input.form1099Int).toEqual([]);expect(input.form1099Div).toEqual([]);expect(input.form1099DA).toHaveLength(3);
 if(explicitEmpty){
  const proof=brokeragePacket(input);proof.sourceReference='Explicit fictional complete annual source inventory: no securities originals; retained digital sources unchanged';
  expect(proof.statements).toEqual([]);expect(proof.withholdingOriginals).toEqual([]);expect(proof.settledNYAccounts).toEqual([]);
  residency.brokerageSources=proof;
 }
 const before=structuredClone(input),result=calculatePAResidencySources(input,residency);
 expect(result.digitalSources?.rawGainOrLoss.toFixed()).toBe('60.75');expect(result.reportedCapitalGainOrLoss.toFixed()).toBe('61');
 if(explicitEmpty){expect(result.brokerageSources?.rawGainOrLoss.toFixed()).toBe('0');expect(result.brokerageSources?.paWithholding.toFixed()).toBe('0');}
 expect(result.scheduleD).toBeDefined();const schedule=result.scheduleD;if(!schedule)throw Error('Actual current digital ScheduleD must survive empty securities proof');
 expect(schedule.digitalAssetQuestionYes).toBe(true);expect(schedule.line12.toFixed()).toBe('61');expect(schedule.reportableNetGainOrLoss.toFixed()).toBe('61');expect(input).toEqual(before);
});
