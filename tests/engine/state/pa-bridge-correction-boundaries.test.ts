// Spec: spec/state/pa-bridge-correction-boundaries.yaml
import {expect,it} from 'vitest';
import {calculatePARetirementSources} from '@/engine/state/pa-retirement-sources';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {guidedPARetirementSourceFixture,guidedPABridgeComplete} from '../../fixtures/guided-pa-bridge-complete';
it('retains a conservative leap-day age boundary with actual valid dates',()=>{
 for(const date of ['2025-02-27','2025-02-28','2025-03-01','2025-03-02']){
  const f=guidedPARetirementSourceFixture(),t=f.input.taxpayer.primary;t.dateOfBirth='1960-02-29';
  const identity={firstName:t.firstName,lastName:t.lastName,ssn:t.ssn,dateOfBirth:t.dateOfBirth};f.source.owner.originalTaxpayer={...identity};
  const row=f.source.statements[0],original=f.input.form1099R?.[0];if(!row||!original)throw new Error('Actual pension sources required');
  row.owner={...identity};row.qualification.actualRetirementDate=date;row.qualification.distributionDate='2025-12-01';original.distributionDate='2025-12-01';row.original=structuredClone(original);
  const before=JSON.stringify(f),run=()=>calculatePARetirementSources(f.input,f.source,{status:'resident'});
  if(date<'2025-03-01')expect(run,date).toThrow();else{expect(run().excludedEligibleRetirement.toFixed(),date).toBe('5000');expect(run().paWithholding.toFixed(),date).toBe('500');}
  expect(JSON.stringify(f)).toBe(before);
 }
});
it('rejects internal whitespace duplicate receipts while preserving distinct actual originals',()=>{
 const make=()=>guidedPABridgeComplete({stateEstimatedPayments:[{state:'PA',date:'2025-04-15',amount:'1000'},{state:'PA',date:'2025-06-15',amount:'1000'}],additionalStateWithholding:''});
 for(const variant of ['  actual   receipt  q1  ','ACTUAL\tRECEIPT Q1','actual receipt\nq1']){
  const f=make(),row=f.facts.payments.rows[0];if(!row)throw new Error('Actual estimate receipt required');row.original.confirmationNumber='ACTUAL RECEIPT Q1';const duplicate=structuredClone(row);duplicate.original.confirmationNumber=variant;f.facts.payments.rows.push(duplicate);
  const before=JSON.stringify(f);expect(()=>calculatePAOrdinaryReturnFacts(f.input,f.facts)).toThrow(/duplicate.*receipt/i);expect(JSON.stringify(f)).toBe(before);
 }
 const f=make(),row=f.facts.payments.rows[0];if(!row)throw new Error('Actual estimate receipt required');const separate=structuredClone(row);separate.sourceReference='Fictional independently supplied additional Q1 payment500';separate.original.confirmationNumber='ACTUAL SEPARATE Q1 500';separate.original.amount='500';f.facts.payments.rows.push(separate);
 expect(calculatePAOrdinaryReturnFacts(f.input,f.facts).estimatedPayments.toFixed()).toBe('2500');
});
