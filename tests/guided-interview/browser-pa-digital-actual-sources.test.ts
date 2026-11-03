// Spec: spec/state/browser-pa-digital-actual-sources.yaml
import {it,expect} from 'vitest';
import {loadGuidedFlowState} from '@/lib/guided-interview-flow';
import {browserPADigitalActualSources,browserPADigitalIncompleteFlow} from '../fixtures/browser-pa-digital-actual-sources';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {calculateFederalTax} from '@/engine/federal';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {TaxYearInputSchema} from '@/models/inputs';
it('complete browser digital sources preserve original federal and PA money',()=>{
 const f=browserPADigitalActualSources(),before=structuredClone(f.state),raw=buildTaxInputFromGuidedData(f.state);expect(raw).not.toBeNull();const input=buildGuidedStateOriginals(TaxYearInputSchema.parse(raw),f.state),federal=calculateFederalTax(input),pa=calculatePAOrdinaryReturn(input,input.paOrdinaryReturnFacts,input.paOrdinaryReturnCompletionSources);
 expect(federal.totalIncome.toFixed()).toBe('50010.25');expect(federal.totalTax.toFixed()).toBe('3875');expect(input.w2s[0]).toMatchObject({wages:'50000',federalWithheld:'3875',socialSecurityWithheld:'3100',medicareWithheld:'725',stateTaxWithheld:'0'});expect(input.form1099DA[0]).toMatchObject({federalWithheld:'0.10',stateWithheld:'0'});expect(input.form1099DA[0].transactions[0]).toMatchObject({proceeds:'100.49',costBasis:'90.24',paCostBasis:'80.24'});
 expect(pa.pa40.totalPATaxableIncome.toFixed()).toBe('50020');expect(pa.pa40.taxLiability.toFixed()).toBe('1536');expect(pa.pa40.stateWithholding.toFixed()).toBe('0');expect(pa.pa40.taxDue.toFixed()).toBe('1536');expect(pa.rev1630.totalInterest.toFixed()).toBe('0');expect(computeGuidedPreview(f.state)?.state?.stateAmountOwed).toBe('1536');expect(f.state).toEqual(before);
});
it('original incomplete browser flow remains a separate source guard',()=>{
 const state=browserPADigitalIncompleteFlow(),before=structuredClone(state);expect(computeGuidedPreview(state)?.state??null).toBeNull();expect(state).toEqual(before);
});
it('basis reference edit stales actual containing sources without mutating them',()=>{
 const f=browserPADigitalActualSources(),section=f.state.sectionData['income-investments'];if(!section?.digitalAssetEntries?.[0]?.transactions?.[0])throw Error('Complete fictional actual digital original required');section.digitalAssetEntries[0].transactions[0].paBasisSourceReference='Equal money, different private acquisition original';const before=structuredClone(f.state.sectionData['state-return']);expect(computeGuidedPreview(f.state)?.state??null).toBeNull();expect(f.state.sectionData['state-return']).toEqual(before);
});
it('missing actual browser payment and source facts cannot qualify the positive',()=>{
 for(const kind of ['prior','remaining','household','payroll','completion']){
  const f=browserPADigitalActualSources(),s=f.state.sectionData['state-return'];if(!s?.paOrdinaryReturnFacts||!s.paResidencySources||!s.paOrdinaryReturnCompletionSources)throw Error('Complete fictional original packets required');
  if(kind==='prior')s.paOrdinaryReturnFacts.payments.priorReturn.status='';else if(kind==='remaining')s.paOrdinaryReturnFacts.timing.remainingTaxPayment.amountAppliedToTax='';else if(kind==='household')s.paOrdinaryReturnFacts.filing.claimedAsDependentOnAnotherReturn=null;else if(kind==='payroll')s.paResidencySources.wages[0].payroll=[];else s.paOrdinaryReturnCompletionSources.care.status='unknown';
  const before=structuredClone(f.state);expect(computeGuidedPreview(f.state)?.state??null,kind).toBeNull();expect(f.state).toEqual(before);
 }
});
it('complete PA roots preserve explicitly admitted federal originals exactly',()=>{
 const f=browserPADigitalActualSources(),raw=buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f.state)),f.state);expect(snapshotPAOrdinaryReturnOriginals(raw)).toEqual(snapshotPAOrdinaryReturnOriginals(f.admittedOriginals));expect(raw.taxpayer.address).toMatchObject({city:'Austin',state:'TX',zip:'78701'});
});

it('saved browser source packets replay through actual storage hydration',()=>{
 const f=browserPADigitalActualSources(),serialized=JSON.stringify(f.state);
 const storage={getItem:()=>serialized} as Storage;
 const loaded=loadGuidedFlowState(storage,'explicit-fictional-digital-browser');
 expect(loaded).not.toBeNull();
 expect(computeGuidedPreview(loaded)?.state?.stateAmountOwed).toBe('1536');
 expect(loaded?.sectionData['income-investments']).toEqual(f.state.sectionData['income-investments']);
 expect(loaded?.sectionData['income-w2']).toEqual(f.state.sectionData['income-w2']);
 expect(loaded?.sectionData['state-return']).toEqual(f.state.sectionData['state-return']);
 expect(JSON.stringify(f.state)).toBe(serialized);
});
