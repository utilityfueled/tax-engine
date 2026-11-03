/** Spec: state/pa-employee-main-independent.yaml. Independent immutable merge controls. */
import Decimal from 'decimal.js';
import {isDeepStrictEqual} from 'node:util';
import {expect,it} from 'vitest';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {buildGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {mixedEmployeeFixture} from '../../fixtures/pa-employee-main-independent';
it.each(['resident','part_year','nonresident'] as const)('merged actual employee business and OID sources preserve all3 literal return boundaries %s',status=>{
 const f=mixedEmployeeFixture(status),before=structuredClone(f),precision=Decimal.precision;
 const income=calculatePAResidencySources(f.input,f.input.paResidencySources),facts=calculatePAOrdinaryReturnFacts(f.input,f.facts),result=calculatePAOrdinaryReturn(f.input,f.facts,f.completion),resident=status==='resident';
 expect(income.reportedCompensation.toFixed()).toBe(resident?'75000':'27000');expect(income.unreimbursedEmployeeExpenses.toFixed()).toBe(resident?'1000':'360');
 expect(income.reportedBusinessIncome.toFixed()).toBe(resident?'15200':'6200');expect(result.scheduleC?.line39.toFixed()).toBe(resident?'15200':'6200');
 expect(result.pa40.totalPATaxableIncome.toFixed()).toBe(resident?'89200':'32840');expect(result.pa40.taxLiability.toFixed()).toBe(resident?'2738':'1008');expect(result.pa40.taxDue.toFixed()).toBe(resident?'2737':'1007');
 expect(result.scheduleA.line1.toFixed()).toBe('1000');expect(result.scheduleA.line7.toFixed()).toBe('1000');expect(result.scheduleA.line16.toFixed()).toBe('0');
 expect(facts.paWithholding.toFixed()).toBe('0.55');expect(result.pa40.stateWithholding.toFixed()).toBe('1');expect(result.pa40.estimatedPayments.toFixed()).toBe('0');
 expect(facts.spOutsidePAIncome.toFixed()).toBe(resident?'0':'56360');expect(facts.spNontaxableIncome.toFixed()).toBe(resident?'1000':'57360');expect(result.scheduleSP.eligibilityIncome.toFixed()).toBe('90200');
 expect(facts.actualPAServiceCompensation.toFixed()).toBe('26640');expect(income.actualPABusinessEarnedIncome.toFixed()).toBe('6200');
 expect(result.employeeSources?.perEmployer).toHaveLength(1);expect(result.readiness.filingEligible).toBe(false);expect(result.readiness.formStatus).toBe('actual_2025_review_only');
 expect(JSON.stringify(result)).not.toContain(f.input.taxpayer.primary.ssn);expect(isDeepStrictEqual(result,calculatePAOrdinaryReturn(f.input,f.facts,f.completion))).toBe(true);expect(Decimal.precision).toBe(precision);expect(f).toEqual(before);
});
it('merged source original guards do not disappear at any of the three methods',()=>{
 const employee=mixedEmployeeFixture('resident');employee.input.w2s[0].employer.name='Different actual same-money employer';expect(()=>calculatePAResidencySources(employee.input,employee.input.paResidencySources)).toThrow(/original|employer|current|source/i);
 const investment=mixedEmployeeFixture('resident');investment.input.form1099OID[0].treasuryOID='1001';expect(()=>calculatePAResidencySources(investment.input,investment.input.paResidencySources)).toThrow(/original|current|source|reconcil/i);
 const business=mixedEmployeeFixture('resident');business.input.form1099Nec[0].nonemployeeCompensation='18001';expect(()=>calculatePAResidencySources(business.input,business.input.paResidencySources)).toThrow(/original|current|source|reconcil/i);
});
it('merged guide reads keep all packets and never refresh changed current originals',()=>{
 const f=mixedEmployeeFixture('nonresident'),before=structuredClone(f.input.paResidencySources),read=buildGuidedPAResidencySources(f.input,f.input.paResidencySources);
 expect(read).toEqual(before);f.input.w2s[0].employer.name='Unconfirmed same-money employer edit';expect(()=>buildGuidedPAResidencySources(f.input,read)).toThrow(/original|employer|current|source/i);expect(read).toEqual(before);
});
