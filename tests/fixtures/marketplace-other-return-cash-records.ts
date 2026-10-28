import type { PaymentData } from '../../apps/web/src/lib/guided-interview-flow';
import { marketplaceOutsidePersonRecords } from './marketplace-outside-person-records';
import { marketplaceActualPaidRecords } from './marketplace-actual-paid-records';
import { marriageOutsidePersonRecords } from './marketplace-marriage-outside-person-records';

/** Fictional original sources shared by guide and browser, with no engine imports. */
export function marketplaceOtherReturnCashRecords(mode: 'cash' | 'advance' | 'marriage' = 'advance') {
  const records = mode === 'marriage' ? marriageOutsidePersonRecords() : mode === 'advance' ? marketplaceActualPaidRecords(true) : marketplaceOutsidePersonRecords(true);
  const plan = records.health.plans[0]!;
  if (mode === 'advance') {
    plan.coveredPersons.find(person => person.personId === 'outside')!.relationshipToOwner = 'child_under_27';
    records.health.persons.find(person => person.personId === 'outside')!.attainedAgeAtYearEnd = '26';
    for (const payment of plan.payments) {
      payment.ownerOrBusinessPaid = '400'; payment.otherPersonPaid = '600';
      payment.personAmounts.find(person => person.personId === 'outside')!.amountPaid = '100';
    }
    const other = records.coverage.sharedPolicyAllocations!.policies[0];
    plan.coverageFamilySources!.outsidePersonReturns = [{ personId: 'outside', sourceTaxYear: '2025',
      sourceReference: 'Actual completed other claimant Form8962', returnStatus: 'completed', claimantName: other.otherTaxpayerName,
      claimantSsn: other.otherTaxpayerSsn, policySourceIds: ['form1095A:0'], allPoliciesIncludedConfirmed: true, form8962Line24: '5000' }];
  }
  const other = plan.coverageFamilySources!.outsidePersonReturns![0];
  other.form8962Line24 = mode === 'marriage' ? '1000' : mode === 'advance' ? '5000' : '3000';
  const cashPaymentSources = {
    sourceTaxYear: '2025', sourceReference: 'Actual original insurer cash and bank records', sourceFactsConfirmed: true,
    allPremiumPaymentsIncludedConfirmed: true, allOtherReturnTaxPaymentsIncludedConfirmed: true,
    premiumPayments: plan.payments.flatMap(payment => payment.personAmounts.filter(person => person.personId === 'outside').map(person => ({
      paymentSourceId: payment.sourceId, payer: person.payer, datePaid: payment.datePaid,
      sourceReference: `Actual insurer receipt ${payment.sourceId}`, cashPaidToInsurer: person.amountPaid,
      reimbursements: [] as { sourceId: string; dateReceived: string; amount: string; sourceReference: string }[],
    }))),
    otherReturnTaxPayments: mode === 'advance' ? [{ sourceId: 'other-tax-payment', datePaid: '2026-04-15', amount: '7000', sourceReference: 'Actual other return payment to Treasury, not insurer premium' }] : [],
  };
  Object.assign(other, { cashPaymentSources });
  return { ...records, cashPaymentSources };
}
/** Complete fictional filed prior return and payment history, never a current tax override. */
export function otherReturnHealthPaymentRecords(marriage = false): PaymentData {
  return { estimatedPayments: [], extensionPayments: [], priorYearAppliedCredits: [], otherPayments: '', estimatedTaxFacts: {
    sourceTaxYear: '2025', sourceReference: marriage ? 'Actual prior separate taxes2000+1000 and AGIs60000+40000; all payments through April15 2026' : 'Actual prior joint tax3000 AGI100000; all payments through April15 2026',
    sourceFactsConfirmed: true, allPaymentRecordsIncluded: true, calendarYearTaxpayer: true, residentReturn: true,
    farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false, calculationMethod: 'regular', withholdingMethod: 'equal-installments',
    priorYearTaxStatus: 'return-filed', priorYearFullYear: true, priorYearResidentAllYear: true, priorYearJointReturn: !marriage,
    priorYearTaxForForm2210: '3000', priorYearAgiForForm2210: '100000', priorYearTaxComputationConfirmed: true,
    withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: false, returnFiledDate: '', returnPaidInFullDate: '',
  } };
}
