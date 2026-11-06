// Spec: state/pa-40.yaml and state/pa-schedule-sp.yaml accepted-source precision entries.
import Decimal from 'decimal.js';
import {it,expect} from 'vitest';
import {calculatePA40} from '@/engine/state/pa-40.js';
import {calculateScheduleSP} from '@/engine/state/pa-schedule-sp.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {oidPrintedPA40Input,oidConsumerPrecisionFixture,oidHugePlus} from '../../fixtures/pa-ordinary-oid-consumer-precision.js';
it('preserves accepted OID printed inputs through standalone PA40',()=>{
 const r=calculatePA40(oidPrintedPA40Input());expect.soft(r.totalPATaxableIncome.toFixed()).toBe(oidHugePlus('50123'));expect.soft(r.taxLiability.toFixed()).toBe('307'+'0'.repeat(132)+'1539');expect.soft(r.taxDue.toFixed()).toBe('307'+'0'.repeat(136));
});
it('preserves accepted OID eligibility through standalone Schedule SP',()=>{
 const r=calculateScheduleSP({taxYear:2025,filingCategory:'unmarried',dependents:0,paTaxableIncome:new Decimal(oidHugePlus('50123')),nontaxableIncome:new Decimal(0),taxLiability:new Decimal('307'+'0'.repeat(132)+'1539'),taxPaidToOtherStates:new Decimal(0)});
 expect.soft(r.eligibilityIncome.toFixed()).toBe(oidHugePlus('50123'));expect.soft(r.taxLiabilityAfterOtherStateTaxes.toFixed()).toBe('307'+'0'.repeat(132)+'1539');expect(r.taxForgivenessCredit.toFixed()).toBe('0');
});
it('preserves actual OID full composition SP eligibility and printed PA40 line20',()=>{
 const f=oidConsumerPrecisionFixture();f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'307'+'0'.repeat(136),sourceReference:'Fictional independently traced expected actual April15 principal'};
 const r=calculatePAOrdinaryReturn(f.input,f.facts,f.completion);expect.soft(r.scheduleSP.eligibilityIncome.toFixed()).toBe(oidHugePlus('50123'));expect.soft(r.pa40.taxForgivenessEligibilityIncome.toFixed()).toBe(oidHugePlus('50123'));expect(r.readiness.filingEligible).toBe(false);
});
