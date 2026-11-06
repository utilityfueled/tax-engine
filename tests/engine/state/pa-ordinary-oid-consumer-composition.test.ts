// Spec: state/pa-ordinary-oid-consumer-precision.yaml full-composition-probe.
import {it,expect} from 'vitest';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {oidConsumerPrecisionFixture,oidHugePlus} from '../../fixtures/pa-ordinary-oid-consumer-precision.js';
it('preserves accepted actual OID values through full PA composition',()=>{
 const f=oidConsumerPrecisionFixture();
 f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'307'+'0'.repeat(136),sourceReference:'Fictional explicit actual expected April15 principal from independent printed tax and withholding trace'};
 const r=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);
 expect.soft(r.pa40.totalPATaxableIncome.toFixed()).toBe(oidHugePlus('50123'));
 expect.soft(r.pa40.taxLiability.toFixed()).toBe('307'+'0'.repeat(132)+'1539');
 expect.soft(r.pa40.taxDue.toFixed()).toBe('307'+'0'.repeat(136));
 expect(r.readiness.filingEligible).toBe(false);
});
