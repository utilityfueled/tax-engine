// Spec: spec/federal/marketplace-health-separate-business.yaml.
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { healthInsuranceSourceErrors } from '@/lib/guided-health-insurance-facts';
import { validateSection, updateSectionData } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedMarketplaceHealthOwnersState } from '../fixtures/guided-marketplace-health-owners';

it('passes two distinct actual business plans to the canonical historical calculation', () => {
 const state=guidedMarketplaceHealthOwnersState(), health=state.sectionData.adjustments!.healthInsuranceFacts!, coverage=state.sectionData.credits!.premiumTaxCredit!;
 const spouse=health.plans[1]; if(!spouse) throw Error('Missing actual synthetic source');
 spouse.marketplaceCoverage=false; spouse.premiumTaxCreditInvolved=false;
 spouse.marketplacePolicySourceIds=[]; spouse.allCoveredPersonsInCoverageFamilyConfirmed=null;
 coverage.policies.splice(1);
 coverage.policies[0]!.monthlyPremiums.forEach(row=>{row.slcsp='500';});
 coverage.monthlyReconciliation.forEach(row=>{row.enrolleePremium='500';row.slcsp='500';});
 const before=JSON.stringify(state);
 expect(healthInsuranceSourceErrors(state)).toEqual({});
 expect(validateSection(state,'adjustments').status).toBe('complete');
 expect(validateSection(state,'credits').status).toBe('complete');
 const built=buildTaxInputFromGuidedData(state);expect(built).not.toBeNull();
 expect(built?.form7206?.plans?.map(row=>[row.businessSourceId,row.accountHolder,row.marketplaceCoverage])).toEqual([['scheduleC','primary',true],['formW2:0','spouse',false]]);
 expect(built?.form7206?.plans?.[1]?.payments?.[0]?.personAmounts?.[0]).toMatchObject({amountPaid:'250',advancePremiumTaxCredit:'0',payer:'business_paid_or_reimbursed'});
 const result=calculateFederalTax(TaxYearInputSchema.parse(built));
 expect(result.form7206?.businesses.find(row=>row.businessSourceId==='formW2:0')?.deduction?.toFixed()).toBe('3000');
 const limit=result.marketplaceHealthInsurance?.historicalLimit;expect(limit?.nonspecifiedDeduction.toFixed()).toBe('3000');
 expect(limit?.separateBusinessNonspecifiedDeduction.toFixed()).toBe('3000');
 // ScheduleSE: 27705 net earnings -> separately rounded3435+803 -> half2119.
 expect(limit?.lines.find(row=>row.form==='Pub974 Worksheet W'&&row.line==='13')?.value.toFixed()).toBe('27881');
 expect(limit?.lines.find(row=>row.form==='Pub974 Worksheet W'&&row.line==='15')?.value.toFixed()).toBe('24881');
 expect(JSON.stringify(state)).toBe(before);
 const changed=structuredClone(state.sectionData.adjustments!);changed.healthInsuranceFacts!.plans[1]!.payments[0]!.ownerOrBusinessPaid='250.01';
 const edited=updateSectionData(state,'adjustments',changed);
 expect(edited.sectionData.adjustments?.healthInsuranceFacts?.sourceFactsConfirmed).toBeNull();
 expect(healthInsuranceSourceErrors(edited)).not.toEqual({});
});
