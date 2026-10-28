import type { TaxYearInput } from '@/models/inputs';
import { d } from '@/utils/decimal';
import { marketplaceOutsidePersonInput } from './marketplace-outside-person';
import { actualPaidRepaymentInput } from './marketplace-actual-paid-repayment';
import { marriageOutsidePersonInput } from './marketplace-marriage-outside-person';

/** Fictional original bank/insurer records, not calculated tax amounts. */
export function attachOutsideCashSources(input: TaxYearInput, credit = '3000', refund = '0') {
  const plan = input.form7206!.plans![0], other = input.form8962!.sharedPolicyAllocations!.policies!.find(row => row.situation !== 'not_shared')!;
  if (!plan.coverageFamilySources!.outsidePersonReturns?.length) plan.coverageFamilySources!.outsidePersonReturns = [{
    personId: 'outside', sourceTaxYear: input.taxpayer.taxYear, sourceReference: 'Actual other claimant completed Form8962',
    returnStatus: 'completed', claimantName: other.otherTaxpayerName, claimantSsn: other.otherTaxpayerSsn,
    policySourceIds: plan.coverageFamilySources!.policies!.filter(policy => policy.original!.coveredIndividuals!.some(person => person.ssn?.replaceAll('-', '') === '234567890')).map(policy => policy.sourceId!), allPoliciesIncludedConfirmed: true, form8962Line24: credit,
  }];
  const record = plan.coverageFamilySources!.outsidePersonReturns![0];
  record.form8962Line24 = credit;
  const cashPaymentSources = {
    sourceTaxYear: input.taxpayer.taxYear, sourceReference: 'Actual insurer and owner bank reconciliation', sourceFactsConfirmed: true,
    allPremiumPaymentsIncludedConfirmed: true, allOtherReturnTaxPaymentsIncludedConfirmed: true,
    premiumPayments: plan.payments!.flatMap(payment => payment.personAmounts!.filter(person => person.personId === 'outside').map(person => ({
      paymentSourceId: payment.sourceId!, payer: person.payer!, datePaid: payment.datePaid!,
      sourceReference: `Actual insurer cash receipt ${payment.sourceId}`, cashPaidToInsurer: person.amountPaid!,
      reimbursements: d(person.amountPaid).gt(0) && d(refund).gt(0) ? [{
        sourceId: `refund-${payment.sourceId}`, dateReceived: `${input.taxpayer.taxYear}-12-31`, amount: refund,
        sourceReference: `Actual refund bank entry ${payment.sourceId}`,
      }] : [],
    }))),
    otherReturnTaxPayments: [] as { sourceId: string; datePaid: string; amount: string; sourceReference: string }[],
  };
  Object.assign(record, { cashPaymentSources });
  return cashPaymentSources;
}

export function positiveOtherReturnCashInput(mode: 'ordinary' | 'cash' | 'advance' | 'marriage' = 'ordinary', advance = '1000', year = 2025) {
  const input = mode === 'advance' ? actualPaidRepaymentInput(true, advance, year)
    : mode === 'marriage' ? marriageOutsidePersonInput() : marketplaceOutsidePersonInput(mode === 'cash');
  if (mode === 'advance') {
    const plan = input.form7206!.plans![0];
    plan.coveredPersons!.find(person => person.personId === 'outside')!.relationshipToOwner = 'child_under_27';
    input.form7206!.persons!.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd = 26;
    for (const payment of plan.payments!) {
      payment.ownerOrBusinessPaid = d(payment.ownerOrBusinessPaid).plus(100).toFixed();
      payment.otherPersonPaid = d(payment.otherPersonPaid).minus(100).toFixed();
      payment.personAmounts!.find(person => person.personId === 'outside')!.amountPaid = '100';
    }
  }
  const cashSources = attachOutsideCashSources(input, mode === 'advance' ? '5000' : mode === 'marriage' ? '1000' : '3000');
  if (mode === 'advance') cashSources.otherReturnTaxPayments.push({ sourceId: 'other-tax-payment', datePaid: `${input.taxpayer.taxYear + 1}-04-15`, amount: '7000', sourceReference: 'Actual other return tax payment, not insurer premium' });
  return { input, cashSources };
}
