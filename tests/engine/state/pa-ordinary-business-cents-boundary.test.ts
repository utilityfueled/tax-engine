/** Source-first cents addendum; original55 controls and first product bytes remain retained. */
import {expect,it} from 'vitest';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {paOrdinaryBusinessFixture,rebindBusinessFixture} from '../../fixtures/pa-ordinary-business-sources';
it('business raw excluded and earned cents remain distinct from printed class income',()=>{
 const f=paOrdinaryBusinessFixture('part_year'),c=f.input.scheduleC;if(!c?.expenses)throw Error('Actual original complete business required');
 f.input.form1099Nec[0].nonemployeeCompensation='0.98';f.input.form1099Nec[0].stateIncome='0.49';c.grossReceipts='0.98';
 for(const key of Object.keys(c.expenses))c.expenses[key as keyof typeof c.expenses]='0';
 for(const receipt of f.business.incomeReceipts)receipt.amount='0.49';f.business.expenseReceipts=[];for(const category of Object.values(f.business.expenseCategories))category.status='known_none';
 f.business.originalScheduleC=structuredClone(c);f.business.necOriginals[0].original=structuredClone(f.input.form1099Nec[0]);
 f.input.form1099Int[0].interestIncome='120.49';f.input.paResidencySources.interest[0].credits[0].amount='80.49';f.input.paResidencySources.interest[0].original=structuredClone(f.input.form1099Int[0]);
 f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Explicit fictional actual799 withholding covers799 printed principal'};rebindBusinessFixture(f);
 const r=calculatePAResidencySources(f.input,f.input.paResidencySources),p=calculatePAOrdinaryReturnFacts(f.input,f.facts);
 expect(r.scheduleC?.line39.toFixed()).toBe('0');expect(r.netBusinessIncome.toFixed()).toBe('0.49');expect(r.reportedBusinessIncome.toFixed()).toBe('0');expect(r.excludedNonPABusinessIncome.toFixed()).toBe('0.49');expect(r.actualPABusinessEarnedIncome.toFixed()).toBe('0.49');expect(p.spOutsidePAIncome.toFixed()).toBe('24081');
});
