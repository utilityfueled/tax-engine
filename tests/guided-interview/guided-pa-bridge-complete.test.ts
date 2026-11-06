// Spec: spec/state/guided-pa-bridge-complete.yaml. Literal oracles precede fixture implementation.
import {expect,it}from 'vitest';
import {TaxYearInputSchema}from '@/models/inputs';
import {calculateStateLocalIncomeTaxDeduction}from '@/engine/forms/state-local-income-tax-deduction';
import {buildTaxInputFromGuidedData}from '@/lib/guided-interview-bridge';
import {computeGuidedPreview}from '@/lib/guided-preview-compute';
import {guidedPABridgeComplete}from '../fixtures/guided-pa-bridge-complete';
const actualStateData=(f:ReturnType<typeof guidedPABridgeComplete>)=>{const data=f.state.sectionData['state-return'];if(!data)throw Error('Actual state sources missing');return data;};
const actualClaims=(data:ReturnType<typeof actualStateData>)=>{if(!data.additionalStateWithholdingEntries?.length)throw Error('Actual saved claims missing');return data.additionalStateWithholdingEntries;};
const estimates=[{state:'PA',date:'2025-04-15',amount:'1000'},{state:'PA',date:'2025-06-15',amount:'1000'}];
it('complete PA sources without generic state payment entries retain actual2000',()=>{
 const f=guidedPABridgeComplete();const p=computeGuidedPreview(f.state);expect(p?.state).not.toBeNull();expect(p?.state).toMatchObject({stateCode:'PA',stateTax:'1842',stateWithholding:'2000',stateRefund:'158',stateAmountOwed:'0'});
 expect(f.state.sectionData['income-w2']?.entries[0]).toMatchObject({employerName:'Acme Corp',wages:'60000',federalWithheld:'8000',state:'PA',stateWithheld:'2000'});
 expect(f.state.sectionData['state-return']?.stateEstimatedPayments).toEqual([]);expect(f.state.sectionData['state-return']?.additionalStateWithholdingEntries).toBeUndefined();
});
it('actual dated PA receipt originals produce the complete positive estimated-payment preview',()=>{
 const f=guidedPABridgeComplete({stateEstimatedPayments:estimates,additionalStateWithholding:''});const p=computeGuidedPreview(f.state);expect(p?.state).toMatchObject({stateTax:'1842',stateWithholding:'4000',stateRefund:'2158',stateAmountOwed:'0'});
 expect(f.facts.payments.rows.map(r=>r.original)).toEqual([
 {accountName:'Jane Doe',accountSsn:'111-22-3333',taxYear:2025,returnType:'pa40',kind:'estimated',date:'2025-04-15',amount:'1000',confirmationNumber:'Fictional-Jane-PA2025-April15-1000'},
 {accountName:'Jane Doe',accountSsn:'111-22-3333',taxYear:2025,returnType:'pa40',kind:'estimated',date:'2025-06-15',amount:'1000',confirmationNumber:'Fictional-Jane-PA2025-June15-1000'},
 ]);
});
it('actual Example Pension1099R source produces positive2500 without replacing the original payer or form',()=>{
 const f=guidedPABridgeComplete({stateEstimatedPayments:[],additionalStateWithholding:'500',additionalStateWithholdingEntries:[{payer:'Example Pension',documentType:'1099-R',state:'PA',taxYear:'2025',amount:'500'}]});
 expect(f.pensionEvidence?.original).toMatchObject({payer:'Example Pension',taxYear:2025,grossDistribution:'5000',taxableAmount:'5000',employeeContributions:'0',distributionCode:'7',state:'PA',stateWithheld:'500'});
 expect(f.pensionEvidence?.qualification).toMatchObject({planType:'employer_401a_defined_contribution',normalRetirementAge:65,actualRetirementDate:'2025-02-28',distributionDate:'2025-12-31',eligiblePlanConfirmed:true,retirementAgeAndServiceConditionsMetConfirmed:true,allEmployeeContributionsKnownConfirmed:true,paEmployeeContributions:'0',priorRecoveredContributions:'0',noRolloverOrConversionConfirmed:true,noAnnuityInsuranceOrInvestmentContractConfirmed:true});
 const p=computeGuidedPreview(f.state);expect(p?.state).not.toBeNull();expect(p?.state).toMatchObject({stateTax:'1842',stateWithholding:'2500',stateRefund:'658',stateAmountOwed:'0'});
});
it('complete source-only and empty generic payment counterparts agree',()=>{
 const a=computeGuidedPreview(guidedPABridgeComplete().state),b=computeGuidedPreview(guidedPABridgeComplete({stateEstimatedPayments:[],additionalStateWithholding:''}).state);expect(a?.state).toMatchObject({stateWithholding:'2000',stateRefund:'158',stateAmountOwed:'0'});expect(b?.state).toEqual(a?.state);
});
it('reading complete receipts never changes actual source data',()=>{
 const f=guidedPABridgeComplete({stateEstimatedPayments:estimates,additionalStateWithholding:''}),before=JSON.stringify(f.state);expect(computeGuidedPreview(f.state)?.state).toMatchObject({stateWithholding:'4000',stateRefund:'2158'});expect(JSON.stringify(f.state)).toBe(before);
});
it('actual receipt edits cannot be rebound by a saved generic ledger',()=>{
 for(const edit of [(f:ReturnType<typeof guidedPABridgeComplete>)=>{f.facts.payments.rows[0].original.accountSsn='999-88-7777';},(f:ReturnType<typeof guidedPABridgeComplete>)=>{f.facts.payments.rows[0].original.taxYear=2024;},(f:ReturnType<typeof guidedPABridgeComplete>)=>{f.facts.payments.rows[0].original.amount='999';},(f:ReturnType<typeof guidedPABridgeComplete>)=>{f.facts.payments.rows[0].original.date='2025-04-16';}]){
  const f=guidedPABridgeComplete({stateEstimatedPayments:estimates,additionalStateWithholding:''});edit(f);actualStateData(f).paOrdinaryReturnFacts=f.facts;const before=JSON.stringify(f.state);expect(computeGuidedPreview(f.state)?.state).toBeNull();expect(JSON.stringify(f.state)).toBe(before);
 }
});

it('itemized federal and PA payments count actual Pension500 once despite its matching saved ledger',()=>{
 const f=guidedPABridgeComplete({stateEstimatedPayments:[],additionalStateWithholding:'500',additionalStateWithholdingEntries:[{payer:'Example Pension',documentType:'1099-R',state:'PA',taxYear:'2025',amount:'500'}]},{itemized:true}),before=JSON.stringify(f.state);
 const raw=buildTaxInputFromGuidedData(f.state);expect(raw).not.toBeNull();if(!raw)throw Error('Actual complete retirement and matching claimed payment must construct canonical originals');
 const input=TaxYearInputSchema.parse(raw),salt=calculateStateLocalIncomeTaxDeduction(input);expect(salt.w2StateWithholding.toFixed()).toBe('2000');expect(salt.nonW2Withholding.toFixed()).toBe('500');expect(salt.additionalPayments.toFixed()).toBe('0');expect(salt.total.toFixed()).toBe('2500');
 expect(computeGuidedPreview(f.state)?.state).toMatchObject({stateWithholding:'2500',stateRefund:'658'});expect(f.state.sectionData['state-return']?.additionalStateWithholding).toBe('500');expect(JSON.stringify(f.state)).toBe(before);
});
it('unmatched or ambiguous saved Pension claims cannot override the actual source',()=>{
 for(const mutation of ['payer','year','state','amount','duplicate']as const){const f=guidedPABridgeComplete({stateEstimatedPayments:[],additionalStateWithholding:'500',additionalStateWithholdingEntries:[{payer:'Example Pension',documentType:'1099-R',state:'PA',taxYear:'2025',amount:'500'}]}),data=actualStateData(f),row=actualClaims(data)[0];
  if(mutation==='payer')row.payer='Different actual payer';if(mutation==='year')row.taxYear='2024';if(mutation==='state')row.state='NY';if(mutation==='amount'){row.amount='499';data.additionalStateWithholding='499';}if(mutation==='duplicate'){actualClaims(data).push({...row});data.additionalStateWithholding='1000';}
  const before=JSON.stringify(f.state),preview=computeGuidedPreview(f.state);expect(preview===null||preview?.state===null).toBe(true);expect(JSON.stringify(f.state)).toBe(before);
 }
});
