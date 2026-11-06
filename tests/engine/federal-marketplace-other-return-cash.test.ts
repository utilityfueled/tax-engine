// Spec: spec/federal/marketplace-other-return-cash.yaml.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { d, sum } from '@/utils/decimal';
import { attachOutsideCashSources, positiveOtherReturnCashInput } from '../fixtures/marketplace-other-return-cash';
import { simpleW2Fixture } from '../fixtures/simple-w2';

it('retains actual outside cash independently of the other taxpayers positive credit', () => {
  for (const [mode, deduction, agi] of [['ordinary', '4200', '32974'], ['cash', '6600', '278465']] as const) {
    for (const credit of ['0', '3000', '3000.01']) {
      const { input } = positiveOtherReturnCashInput(mode);
      input.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0].form8962Line24 = credit;
      const before = structuredClone(input), result = calculateFederalTax(input);
      expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed()]).toEqual([deduction, agi]);
      expect(result.form7206!.paidSourcePremiums.toFixed()).toBe(mode === 'cash' ? '6600' : '16200');
      expect(input).toEqual(before);
    }
  }
});
it('excludes outside advances and other return tax payments from actual paid costs', () => {
  const { input, cashSources } = positiveOtherReturnCashInput('advance'), before = structuredClone(input);
  const result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['16800', '268265', '0', '12000']);
  expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('16800');
  expect(result.marketplaceActualPaidRepaymentHealth!.originalPolicyAdvances.toFixed()).toBe('24000');
  expect(sum(...result.form7206!.sourceRecords.filter(row => row.personId === 'outside').map(row => row.eligiblePremium)).toFixed()).toBe('1200');
  expect(result.allLines.find(row => row.form === 'QBI Source Deductions' && row.line === 'scheduleC')!.inputs['SE health insurance'].toString()).toBe('16800');
  expect(input).toEqual(before);
  cashSources.otherReturnTaxPayments[0].amount = '7001';
  expect(calculateFederalTax(input).schedule1!.seHealthInsurance.toFixed()).toBe('16800');
});
it('derives net cash from actual reimbursements and preserves own business limits', () => {
  const { input } = positiveOtherReturnCashInput('cash');
  for (const payment of input.form7206!.plans![0].payments!) {
    payment.ownerOrBusinessPaid = '550.01'; payment.otherPersonPaid = '1324.99';
    payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '100.01';
  }
  attachOutsideCashSources(input, '3000', '25.02');
  const result = calculateFederalTax(input);
  expect(result.form7206!.businesses[0].eligiblePremiums.toFixed()).toBe('6299.88');
  expect(result.form7206!.paidSourcePremiums.toFixed()).toBe('6600.12');
  expect(result.form7206!.grossSourcePremiums.toFixed()).toBe('22500');
  expect([result.schedule1!.seHealthInsurance.toFixed(), result.agi.toFixed()]).toEqual(['6300', '278765']);
  input.scheduleC!.grossReceipts = '5000';
  input.w2s = [{ ...simpleW2Fixture.w2s[0], accountHolder: 'spouse', wages: '300000', federalWithheld: '0', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', socialSecurityTips: '0', medicareWages: '300000', medicareWithheld: '4350' }];
  expect(calculateFederalTax(input).schedule1!.seHealthInsurance.toFixed()).toBe('4646');
});
it('rejects incomplete contradictory or duplicated outside cash evidence', () => {
  const changes: ((source: ReturnType<typeof attachOutsideCashSources>) => void)[] = [
    source => { source.sourceFactsConfirmed = false; }, source => { source.sourceTaxYear = 2024; }, source => { source.sourceReference = ''; },
    source => { source.allPremiumPaymentsIncludedConfirmed = false; }, source => { source.allOtherReturnTaxPaymentsIncludedConfirmed = false; },
    source => { source.premiumPayments.pop(); }, source => { source.premiumPayments.push(structuredClone(source.premiumPayments[0])); },
    source => { source.premiumPayments[0].paymentSourceId = 'unlinked-original'; }, source => { source.premiumPayments[0].payer = 'business_paid_or_reimbursed'; },
    source => { source.premiumPayments[0].cashPaidToInsurer = '100.01'; }, source => { source.premiumPayments[0].datePaid = '2025-01-02'; },
    source => { source.premiumPayments[0].sourceReference = ''; }, source => { source.premiumPayments[0].reimbursements = undefined as never; },
    source => { source.premiumPayments[0].reimbursements = [{ sourceId: 'refund', dateReceived: '2025-12-31', amount: '100.01', sourceReference: 'Actual bank refund' }]; },
    source => { source.premiumPayments[0].reimbursements = [{ sourceId: 'refund', dateReceived: '2026-01-01', amount: '1', sourceReference: 'Actual later bank refund' }]; },
    source => { source.otherReturnTaxPayments = undefined as never; },
    source => { source.otherReturnTaxPayments = [{ sourceId: 'tax', datePaid: '2026-02-30', amount: '1', sourceReference: 'Actual tax payment' }]; },
  ];
  for (const change of changes) {
    const { input, cashSources } = positiveOtherReturnCashInput('cash'); change(cashSources);
    expect(() => calculateFederalTax(input)).toThrow(/outside|cash|reimburse|payment|source/i);
  }
  const { input } = positiveOtherReturnCashInput('ordinary');
  Object.assign(input.form7206!.plans![0].coverageFamilySources!.outsidePersonReturns![0], { cashPaymentSources: undefined });
  expect(() => calculateFederalTax(input)).toThrow(/outside|cash|source/i);
});
it('separates positive outside advances from a zero own advance cash method', () => {
  const { input } = positiveOtherReturnCashInput('cash'), plan = input.form7206!.plans![0];
  const sharedOriginal = structuredClone(input.form1095A[0]);
  sharedOriginal.policyNumber += '-separate-shared';
  for (const month of sharedOriginal.monthlyPremiums) { month.advancePremiumTaxCredit = '200'; month.slcsp = '1500'; }
  const ownOriginal = input.form1095A[0];
  ownOriginal.coveredIndividuals = ownOriginal.coveredIndividuals!.filter(person => person.ssn !== '234-56-7890');
  for (const month of ownOriginal.monthlyPremiums) { month.enrolleePremium = '1250'; month.slcsp = '1000'; }
  input.form1095A.push(sharedOriginal);
  const shared = input.form8962!.sharedPolicyAllocations!.policies![0];
  shared.sourceId = 'form1095A:1'; shared.original = structuredClone(sharedOriginal);
  shared.situation = 'other_two_tax_families'; shared.noAdvanceAllocation = undefined;
  shared.agreementConfirmed = true; shared.agreementReference = 'Actual zero share of the separate shared original'; shared.originalSlcspCorrectConfirmed = true;
  shared.monthlyAllocations = sharedOriginal.monthlyPremiums.map(row => ({ month: row.month, fraction: '0' }));
  input.form8962!.sharedPolicyAllocations!.policies!.unshift({ sourceId: 'form1095A:0', original: structuredClone(ownOriginal), situation: 'not_shared', unsharedSourceReference: 'Actual complete separate own-family policy', allCoveredPeopleInThisTaxFamilyConfirmed: true, originalSlcspCorrectConfirmed: true });
  plan.marketplacePolicySourceIds = ['form1095A:0', 'form1095A:1'];
  plan.coverageFamilySources!.policies = input.form1095A.map((original,index) => ({ sourceId: `form1095A:${index}`, original: structuredClone(original) }));
  const outsidePayments = structuredClone(plan.payments!);
  for (const payment of plan.payments!) {
    payment.grossPremium = '1250'; payment.ownerOrBusinessPaid = '450'; payment.otherPersonPaid = '800';
    payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '0';
  }
  for (const payment of outsidePayments) {
    payment.sourceId += '-shared'; payment.ownerOrBusinessPaid = '100'; payment.otherPersonPaid = '1575'; payment.advancePremiumTaxCredit = '200';
    for (const person of payment.personAmounts!) { person.amountPaid = person.personId === 'outside' ? '100' : '0'; person.advancePremiumTaxCredit = person.personId === 'outside' ? '200' : '0'; }
  }
  plan.payments!.push(...outsidePayments);
  plan.coverageFamilySources!.outsidePersonReturns = undefined;
  attachOutsideCashSources(input, '3000');
  const result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance, result.form8962!.ptcAllowed, result.form8962!.advancePTCTotal, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['6600', '0', '0', '0']);
  expect(sum(...result.form7206!.coverageFamilyAllocations!.map(row => row.outsideAdvance)).toFixed()).toBe('2400');
});
it('composes positive other credit with actual marriage and monthly child qualification', () => {
  const { input, cashSources } = positiveOtherReturnCashInput('marriage'), before = structuredClone(input);
  const result = calculateFederalTax(input);
  expect([result.schedule1!.seHealthInsurance, result.agi, result.form8962!.ptcAllowed, result.form8962!.excessAPTCRepayment].map(value => value.toFixed())).toEqual(['6875', '86060', '5192', '808']);
  expect(input).toEqual(before);
  cashSources.premiumPayments.reverse(); input.form7206!.plans![0].payments!.reverse();
  expect(calculateFederalTax(input).agi.toFixed()).toBe('86060');
  input.form7206!.plans![0].coveredPersons![1].childRelationshipSources!.relationshipStartDate = '2025-07-01';
  expect(() => calculateFederalTax(input)).toThrow(/child|relationship|source/i);
});
it('preserves exact cash and reported own repayment cents without borrowing outside advances', () => {
  const { input } = positiveOtherReturnCashInput('advance', '1000.49');
  const result = calculateFederalTax(input);
  expect(result.marketplaceActualPaidRepaymentHealth!.exactSourceAdvances.toFixed()).toBe('12005.88');
  expect(result.marketplaceActualPaidRepaymentHealth!.originalPolicyAdvances.toFixed()).toBe('24011.76');
  expect([result.schedule1!.seHealthInsurance.toFixed(), result.form8962!.excessAPTCRepayment.toFixed()]).toEqual(['16800', '12000']);
  expect(result.form7206!.businesses[0].eligiblePremiums).toEqual(d(16800));
});
