// Spec: spec/federal/form-8962-marriage-return.yaml.
import { expect,it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { calculatePremiumTaxCreditReturn } from '@/engine/forms/premium-tax-credit-return.js';
import { calculateForm8962 } from '@/engine/forms/form-8962.js';
import { d } from '@/utils/decimal.js';
import { marriageSourcesFixture } from '../fixtures/marriage-sources.js';

function source(year=2025) {
  const input=marriageSourcesFixture(year);
  Object.assign(input.w2s[0],{wages:'117000',socialSecurityWages:'117000',medicareWages:'117000',federalWithheld:'0',accountHolder:'primary'});
  return input;
}
function facts(input:ReturnType<typeof source>) {
  const form=input.form8962,packet=form?.marriageSources;
  if(!form||!packet?.policies||!form.monthlyReconciliation) throw new Error('Source fixture incomplete');
  return {form,packet,policies:packet.policies,months:form.monthlyReconciliation};
}
function isolated(input:ReturnType<typeof source>,agi='117000') {
  return calculatePremiumTaxCreditReturn({input,agi:d(agi),taxExemptInterest:d(0),foreignIncomeReduction:d(0),
    foreignHousingDeduction:d(0),socialSecurityBenefitsGross:d(0),socialSecurityBenefitsTaxable:d(0)});
}
it('uses actual canonical household income and transfers marriage repayment once',()=>{
  const input=source(),before=JSON.stringify(input),result=calculateFederalTax(input),credit=result.form8962;
  expect(result.agi.toFixed()).toBe('117000');expect(credit?.modifiedAGI.toFixed()).toBe('117000');
  expect(credit?.marriageCalculation?.ordinaryCredit.toFixed()).toBe('5481');
  expect(credit?.marriageCalculation?.electionApplies).toBe(true);
  expect([credit?.ptcAllowed.toFixed(),credit?.advancePTCTotal.toFixed(),credit?.netPTC.toFixed(),credit?.excessAPTCRepayment.toFixed()])
    .toEqual(['7021','8423','0','1402']);
  expect(credit?.marriageCalculation?.partV.map(row=>[row.owner,row.familySize,row.monthlyContribution.toFixed(),row.startMonth,row.stopMonth]))
    .toEqual([['primary',1,'400',1,7],['spouse',3,'148',1,7]]);
  const transfer=result.allLines.filter(row=>row.form==='Sched 2'&&row.line==='1a');
  expect(transfer).toHaveLength(1);expect(transfer[0].value.toFixed()).toBe('1402');
  expect(new Set(credit?.lines.filter(row=>row.form==='Form 8962').map(row=>row.line)).size)
    .toBe(credit?.lines.filter(row=>row.form==='Form 8962').length);
  expect(JSON.stringify(input)).toBe(before);
});
it('retains actual ordinary credit when there is no excess advance',()=>{
  const input=source(),{policies,months}=facts(input);
  for(const original of input.form1095A) for(const row of original.monthlyPremiums) row.advancePremiumTaxCredit='0';
  for(const row of policies) {
    const index=Number(row.sourceId?.split(':')[1]);row.original=structuredClone(input.form1095A[index]);
  }
  for(const row of months) row.advancePremiumTaxCredit='0';
  const result=calculateFederalTax(input).form8962;
  expect(result?.marriageCalculation?.reason).toBe('no-excess-advance');
  expect(result?.marriageCalculation?.partV).toEqual([]);
  expect([result?.ptcAllowed.toFixed(),result?.netPTC.toFixed(),result?.excessAPTCRepayment.toFixed()]).toEqual(['5481','5481','0']);
  expect(result?.lines.some(row=>row.form==='Form 8962'&&/^(35|36)/.test(row.line))).toBe(false);
});
it('applies separate actual 2026 family limits without changing joint household income',()=>{
  const input=source(2026),result=isolated(input,'130000');
  expect(result.modifiedAGI.toFixed()).toBe('130000');expect(result.fplPercentageForTable.toFixed()).toBe('401');
  expect(result.marriageCalculation?.families.map(row=>[row.owner,row.fplPercentageForTable.toFixed()])).toEqual([['primary','401'],['spouse','243']]);
  expect(result.marriageCalculation?.partV.map(row=>[row.owner,row.monthlyContribution.toFixed()])).toEqual([['spouse','443']]);
  expect([result.ptcAllowed.toFixed(),result.advancePTCTotal.toFixed(),result.excessAPTCRepayment.toFixed()]).toEqual(['2730','8423','5693']);
  expect(result.taxpayerEligible).toBe(false);expect(result.repaymentCap).toBeNull();
  expect(result.marriageCalculation?.electionApplies).toBe(true);
  expect(result.lines.some(row=>row.form==='Form 8962'&&row.line==='12e')).toBe(true);
  expect(result.lines.some(row=>row.form==='Form 8962'&&row.line==='19e')).toBe(false);
  expect(()=>calculateFederalTax(input)).toThrow(/2026|readiness|qualified/i);
});
it('rejects stale sources income overrides and conflicting coordination',()=>{
  const input=source();facts(input).form.taxpayerModifiedAGI='1';
  expect(()=>calculateFederalTax(input)).toThrow(/modified income|MAGI/i);
  const missing=source();facts(missing).form.marriageSources=undefined;
  expect(()=>calculateFederalTax(missing)).toThrow(/marriage|worksheets/i);
  const replaced=source();replaced.form1095A[0].policyNumber='Replacement';
  expect(()=>calculateFederalTax(replaced)).toThrow(/snapshot|source/i);
  const health=source();facts(health).form.selfEmployedHealthInsuranceCoordinationRequired=true;
  expect(()=>isolated(health)).toThrow(/health|coordination|source/i);
  const mismatch=source();const form={...facts(mismatch).form,taxpayerModifiedAGI:'117000'};
  expect(()=>calculateForm8962({taxYear:2026,filingStatus:'married_filing_jointly',facts:form,form1095A:mismatch.form1095A,
    allocationHousehold:{taxpayer:mismatch.taxpayer,standardDeductionFacts:mismatch.standardDeductionFacts}})).toThrow(/year|context|source/i);
});
