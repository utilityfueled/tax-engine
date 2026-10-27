// Spec: spec/federal/marketplace-marriage-health.yaml.
import { expect, it } from 'vitest';
import { calculateMarketplaceMarriageHealthSources } from '@/engine/forms/marketplace-marriage-health-sources.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { marketplaceMarriageHealthInput, twoOwnerMarketplaceMarriageHealthInput } from '../fixtures/marketplace-marriage-health.js';

it('binds actual covered people and does not infer premarital spouse qualification', () => {
  const input = marketplaceMarriageHealthInput(), person = input.taxpayer.spouse!, name = `${person.firstName} ${person.lastName}`;
  const original = input.form1095A[0];
  original.recipientName = name; original.recipientSsn = person.ssn;
  original.coveredIndividuals = [{name,ssn:person.ssn,firstMonth:1,lastMonth:12}];
  input.form8962!.marriageSources!.policies![0].original = structuredClone(original);
  input.form8962!.marriageSources!.benchmarks = input.form8962!.marriageSources!.benchmarks!.map(row => ({...row,owner:'spouse',coveredIndividualSsns:[person.ssn]}));
  expect(() => calculateFederalTax(input)).toThrow(/marriage.*(person|identity)|covered.*(person|identity)/i);
  input.form7206!.persons!.push({personId:'spouse',name,householdRole:'spouse',attainedAgeAtYearEnd:35});
  const plan = input.form7206!.plans![0];
  plan.coveredPersons = [{personId:'spouse',relationshipToOwner:'spouse'}];
  plan.payments = plan.payments!.map(row => ({...row,personAmounts:row.personAmounts!.map(value=>({...value,personId:'spouse'}))}));
  expect(() => calculateFederalTax(input)).toThrow(/premarital|before.*marriage/i);
  original.coveredIndividuals[0].firstMonth = 8;
  original.monthlyPremiums = original.monthlyPremiums.filter(row => row.month >= 8);
  input.form8962!.marriageSources!.policies![0].original = structuredClone(original);
  input.form8962!.marriageSources!.benchmarks = [];
  input.form8962!.monthlyReconciliation = input.form8962!.monthlyReconciliation!.filter(row => row.month >= 8);
  plan.months = plan.months!.filter(row => row.month! >= 8);
  plan.payments = plan.payments!.filter(row => row.coverageMonth! >= 8);
  const result = calculateFederalTax(input);
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('4115');
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('855');
  expect(result.form8962!.marriageCalculation!.electionApplies).toBe(false);
});

it('preserves separate marriage families and the existing two-owner health allocation', () => {
  const input=twoOwnerMarketplaceMarriageHealthInput(), before=structuredClone(input), result=calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('10302');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('7698');
  expect(result.agi.toFixed()).toBe('85237');
  expect(result.form8962!.ptcAllowed.toFixed()).toBe('8748');
  expect(result.marketplaceHealthInsurance!.businesses.map(row => row.netPremiumsAfterCredit.toFixed(2))).toEqual(['5132.00','2566.00']);
  expect(input).toEqual(before);
});

it('preserves marriage health results after exact original source rebinding', () => {
  const input = twoOwnerMarketplaceMarriageHealthInput();
  input.form1095A.reverse();
  expect(() => calculateFederalTax(input)).toThrow(/original|snapshot|source/i);
  for (const policy of input.form8962!.marriageSources!.policies!) {
    policy.sourceId = policy.sourceId === 'form1095A:0' ? 'form1095A:1' : 'form1095A:0';
  }
  input.form8962!.marriageSources!.policies!.reverse();
  input.form8962!.marriageSources!.benchmarks!.reverse();
  input.form8962!.monthlyReconciliation!.reverse();
  input.form7206!.persons!.reverse();
  input.form7206!.plans!.reverse();
  for (const plan of input.form7206!.plans!) {
    plan.marketplacePolicySourceIds = plan.marketplacePolicySourceIds!.map(id => id === 'form1095A:0' ? 'form1095A:1' : 'form1095A:0');
    plan.payments!.reverse(); plan.months!.reverse();
  }
  const before = structuredClone(input), result = calculateFederalTax(input);
  expect([result.agi, result.form8962!.ptcAllowed, result.schedule1!.seHealthInsurance].map(value => value.toFixed())).toEqual(['85237', '8748', '7698']);
  expect(result.marketplaceHealthInsurance!.businesses.map(row => [row.businessSourceId, row.netPremiumsAfterCredit.toFixed(2)]).sort()).toEqual([['scheduleC', '5132.00'], ['scheduleF', '2566.00']]);
  expect(input).toEqual(before);
});

it('composes actual marriage and health sources without changing the joint income', () => {
  const input = marketplaceMarriageHealthInput(), before = structuredClone(input);
  const result = calculateFederalTax(input), credit = result.form8962!;
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('5662');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('6338');
  expect(result.agi.toFixed()).toBe('86597');
  expect([credit.ptcAllowed, credit.excessAPTCRepayment, credit.netPTC].map(value => value.toFixed())).toEqual(['5149', '3251', '0']);
  expect(credit.marriageCalculation!.electionApplies).toBe(true);
  expect(result.allLines.find(row => row.form === 'Pub974 QBI Allocation' && row.line === 'scheduleC')?.value.toFixed()).toBe('6338');
  expect(result.allLines.filter(row => row.form === 'Form 8962' && row.line === '24').map(row => row.value.toFixed())).toEqual(['5149']);
  expect(input).toEqual(before);
});
it('retains the computed X repayment limit through both marriage calculations', () => {
  const result = calculateFederalTax(marketplaceMarriageHealthInput(2025, true));
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe('10227');
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe('1773');
  expect(result.agi.toFixed()).toBe('61427');
  expect(result.form8962!.fplPercentageForTable.toFixed()).toBe('300');
  expect(result.form8962!.repaymentCap?.toFixed()).toBe('1950');
  expect([result.form8962!.ptcAllowed, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['10087', '713']);
  expect(result.allLines.filter(row => row.form === 'Form 8962' && row.line === '28').map(row => row.value.toFixed())).toEqual(['1950']);
});
it('retains independent original health and marriage source requirements', () => {
  for (const mutate of [
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.sourceFactsConfirmed = false; },
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form8962!.marriageSources!.policies![0].original!.policyNumber = 'different'; },
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.plans![0].marketplacePolicySourceIds = ['form1095A:1']; },
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.plans![0].payments![0].ownerOrBusinessPaid = '300.01'; },
  ]) {
    const input = marketplaceMarriageHealthInput(); mutate(input);
    expect(() => calculateFederalTax(input)).toThrow();
  }
  const original = marketplaceMarriageHealthInput();
  expect(calculateFederalTax(original).schedule1!.seHealthInsurance.toFixed()).toBe('6338');
});

it('retains original zero coverage months without inventing alternative credits', () => {
  const input = marketplaceMarriageHealthInput();
  const policy = input.form1095A[0];
  policy.coveredIndividuals![0].firstMonth = 2;
  Object.assign(policy.monthlyPremiums[0], {enrolleePremium:'0',slcsp:'0',advancePremiumTaxCredit:'0'});
  input.form8962!.marriageSources!.policies![0].original = structuredClone(policy);
  input.form8962!.marriageSources!.benchmarks = input.form8962!.marriageSources!.benchmarks!.filter(row => row.month !== 1);
  Object.assign(input.form8962!.monthlyReconciliation![0], {enrolleePremium:'0',slcsp:'0',advancePremiumTaxCredit:'0',coverageEligible:false});
  const plan = input.form7206!.plans![0];
  Object.assign(plan.payments![0], {grossPremium:'0',ownerOrBusinessPaid:'0',otherPersonPaid:'0',advancePremiumTaxCredit:'0'});
  Object.assign(plan.payments![0].personAmounts![0], {amountPaid:'0',advancePremiumTaxCredit:'0'});
  const omitted = structuredClone(input);
  omitted.form1095A[0].monthlyPremiums.shift();
  omitted.form7206!.plans![0].payments!.shift();
  omitted.form7206!.plans![0].months!.shift();
  omitted.form8962!.monthlyReconciliation!.shift();
  omitted.form8962!.marriageSources!.policies![0].original = structuredClone(omitted.form1095A[0]);
  const expected = calculateFederalTax(omitted), before = structuredClone(input), result = calculateFederalTax(input);
  expect(result.form8962!.ptcAllowed).toEqual(expected.form8962!.ptcAllowed);
  expect(result.schedule1!.seHealthInsurance).toEqual(expected.schedule1!.seHealthInsurance);
  expect(result.form8962!.marriageCalculation!.months.some(row => row.month === 1)).toBe(false);
  expect(input).toEqual(before);
});
it('requires actual known person payments before marriage health source binding', () => {
  for (const mutate of [
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.sourceFactsConfirmed=undefined; },
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.plans![0].payments![0].personAmounts![0].amountPaid=undefined; },
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.plans![0].payments![0].personAmounts![0].advancePremiumTaxCredit=undefined; },
    (input: ReturnType<typeof marketplaceMarriageHealthInput>) => { input.form7206!.plans![0].payments![0].datePaid=undefined; },
  ]) {
    const input=marketplaceMarriageHealthInput(); mutate(input);
    expect(() => calculateMarketplaceMarriageHealthSources(input)).toThrow();
  }
});
