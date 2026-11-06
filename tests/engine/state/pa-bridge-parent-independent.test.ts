// Spec: spec/state/pa-bridge-parent-independent.yaml
import {expect,it} from 'vitest';
import {calculatePARetirementSources} from '@/engine/state/pa-retirement-sources';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {guidedPARetirementSourceFixture,guidedPABridgeComplete} from '../../fixtures/guided-pa-bridge-complete';
it('admits fully documented retirement after the leap-day owner has certainly reached65',()=>{
 const f=guidedPARetirementSourceFixture();
 f.input.taxpayer.primary.dateOfBirth='1960-02-29';
 const identity={firstName:f.input.taxpayer.primary.firstName,lastName:f.input.taxpayer.primary.lastName,ssn:f.input.taxpayer.primary.ssn,dateOfBirth:'1960-02-29'};
 f.source.owner.originalTaxpayer=structuredClone(identity);
 const row=f.source.statements[0];row.owner=structuredClone(identity);
 row.qualification.actualRetirementDate='2025-03-01';row.qualification.distributionDate='2025-12-01';
 if(!f.input.form1099R?.[0])throw new Error('Actual pension original required');
 f.input.form1099R[0].distributionDate='2025-12-01';row.original=structuredClone(f.input.form1099R[0]);
 const before=JSON.stringify(f),result=calculatePARetirementSources(f.input,f.source,{status:'resident'});
 expect(result.excludedEligibleRetirement.toFixed()).toBe('5000');expect(result.paWithholding.toFixed()).toBe('500');expect(JSON.stringify(f)).toBe(before);
});
it('rejects spacing-only duplicate actual estimated-payment receipt identifiers',()=>{
 const f=guidedPABridgeComplete({stateEstimatedPayments:[{state:'PA',date:'2025-04-15',amount:'1000'},{state:'PA',date:'2025-06-15',amount:'1000'}],additionalStateWithholding:''});
 const original=f.facts.payments.rows[0];original.original.confirmationNumber='ACTUAL RECEIPT Q1';
 const duplicate=structuredClone(original);duplicate.original.confirmationNumber='  actual   receipt  q1  ';
 f.facts.payments.rows.push(duplicate);
 expect(()=>calculatePAOrdinaryReturnFacts(f.input,f.facts)).toThrow(/duplicate.*receipt/i);
});
