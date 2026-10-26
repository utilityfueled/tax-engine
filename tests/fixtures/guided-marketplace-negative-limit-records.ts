import { actualGuidedK1Sources } from './guided-k1-qbi-sources';
import { guidedMarketplaceNonspecifiedStopRecords } from './guided-marketplace-nonspecified-stop-records';

/** Explicit fictional originals shared by calculation, shell and browser tests. */
export function guidedMarketplaceNegativeLimitRecords() {
  const k1 = actualGuidedK1Sources(), first = k1.activities?.[0];
  if (!first) throw new Error('Missing actual original');
  k1.activities = ['5000', '20000'].map((amount, index) => ({ ...structuredClone(first), entityName: `Actual ordinary partnership ${index + 1}`, entityEIN: `12-345678${index + 1}`,
    statement: { ...first.statement, ordinaryIncome: amount, section199AQBI: amount, selfEmploymentEarnings: amount } }));
  const records = guidedMarketplaceNonspecifiedStopRecords();
  const health = records.health;
  health.persons = health.persons.filter(person => person.personId === 'primary');
  health.plans = [health.plans[0]];
  for (const payment of health.plans[0].payments) {
    payment.ownerOrBusinessPaid = '200'; payment.advancePremiumTaxCredit = '300';
    for (const person of payment.personAmounts) { person.amountPaid = '200'; person.advancePremiumTaxCredit = '300'; }
  }
  const coverage = records.coverage; coverage.taxFamilySize = '1';
  for (const policy of coverage.policies) for (const month of policy.monthlyPremiums) month.advancePremiumTaxCredit = '300';
  for (const month of coverage.monthlyReconciliation) month.advancePremiumTaxCredit = '300';
  health.plans[0].businessSourceId = 'scheduleK1:0'; health.plans[0].businessKind = 'partnership'; health.plans[0].policyHolder = 'business';
  const other = structuredClone(health.plans[0]);
  Object.assign(other, { planId: 'other-plan', policyReference: 'Actual other partnership policy', businessSourceId: 'scheduleK1:1', marketplaceCoverage: false, premiumTaxCreditInvolved: false,
    marketplacePolicySourceIds: undefined, allCoveredPersonsInCoverageFamilyConfirmed: undefined });
  for (const payment of other.payments) {
    payment.sourceId = `other-${payment.sourceId}`; payment.ownerOrBusinessPaid = '500'; payment.advancePremiumTaxCredit = '0';
    for (const person of payment.personAmounts) { person.amountPaid = '500'; person.advancePremiumTaxCredit = '0'; }
  }
  health.plans.push(other);
  Object.assign(health, { partnershipGrossIncomeSources: { sourceTaxYear: '2025', sourceReference: 'Actual partnership gross statements', sourceFactsConfirmed: true,
    statements: k1.activities.map((original, index) => ({ businessSourceId: `scheduleK1:${index}`, accountHolder: 'primary', sourceReference: `Actual gross attachment ${index + 1}`, sourceFactsConfirmed: true,
      originalK1: { taxYear: original.sourceTaxYear, partnershipName: original.entityName, partnershipEIN: original.entityEIN, accountHolder: original.accountHolder,
        ordinaryIncome: original.statement?.ordinaryIncome, selfEmploymentEarnings: original.statement?.selfEmploymentEarnings, selfEmploymentIncomeType: original.statement?.selfEmploymentIncomeType },
      grossIncome: index === 0 ? '10000' : '40000', ordinaryActivityOnlyConfirmed: true, allGrossIncomeIncludedConfirmed: true })) } });
  return { health, coverage, k1 };
}
