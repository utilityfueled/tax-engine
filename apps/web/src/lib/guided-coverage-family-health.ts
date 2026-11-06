import type { Form7206Input } from '@/models/inputs';
import { parseGuidedCurrency } from './guided-currency';
import { normalizeMarketplacePolicy } from './guided-shared-policy';
import type { MarketplacePolicyData } from './guided-premium-tax-credit-facts';
import type { MarketplacePolicyOption } from './guided-marketplace-health-facts';

export interface CoverageFamilyHealthMonthData {
  month: string; sourceReference: string; allCoveredPersonsIncludedConfirmed: boolean | null;
  personFacts: { personId: string; sourceReference: string; fullCoverageMonthConfirmed: boolean | null; otherMecEligible: boolean | null }[];
  coverageFamilySlcsp: string; nonCoverageFamilySlcsp: string;
  coverageFamilySourceReference: string; nonCoverageFamilySourceReference: string;
  coverageFamilyMemberSsns: string[]; nonCoverageFamilyMemberSsns: string[];
  allCoverageFamilyMembersIncludedConfirmed: boolean | null; allNonCoverageFamilyMembersIncludedConfirmed: boolean | null;
}
export interface OutsidePersonCashData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null;
  allPremiumPaymentsIncludedConfirmed: boolean | null; allOtherReturnTaxPaymentsIncludedConfirmed: boolean | null;
  premiumPayments?: {
    paymentSourceId: string; payer: '' | 'owner_after_tax' | 'business_paid_or_reimbursed';
    datePaid: string; sourceReference: string; cashPaidToInsurer: string;
    reimbursements?: { sourceId: string; dateReceived: string; amount: string; sourceReference: string }[];
  }[];
  otherReturnTaxPayments?: { sourceId: string; datePaid: string; amount: string; sourceReference: string }[];
}
export function emptyOutsidePersonCash(): OutsidePersonCashData {
  return { sourceTaxYear: '', sourceReference: '', sourceFactsConfirmed: null,
    allPremiumPaymentsIncludedConfirmed: null, allOtherReturnTaxPaymentsIncludedConfirmed: null };
}
export interface OutsidePersonReturnData {
  personId: string; sourceTaxYear: string; sourceReference: string; returnStatus: '' | 'draft' | 'completed';
  claimantName: string; claimantSsn: string; policySourceIds: string[]; allPoliciesIncludedConfirmed: boolean | null;
  form8962Line24: string;
  cashPaymentSources?: OutsidePersonCashData;
}
export function emptyOutsidePersonReturn(): OutsidePersonReturnData {
  return { personId: '', sourceTaxYear: '', sourceReference: '', returnStatus: '', claimantName: '', claimantSsn: '',
    policySourceIds: [], allPoliciesIncludedConfirmed: null, form8962Line24: '' };
}
export interface CoverageFamilyHealthData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPolicySourcesIncluded: boolean | null;
  policies: { sourceId: string; original: MarketplacePolicyData }[];
  persons: { personId: string; coveredIndividualSsn: string }[];
  outsidePersonReturns?: OutsidePersonReturnData[];
  months: CoverageFamilyHealthMonthData[];
}
export function emptyCoverageFamilyHealthMonth(month = ''): CoverageFamilyHealthMonthData {
  return { month, sourceReference: '', allCoveredPersonsIncludedConfirmed: null, personFacts: [], coverageFamilySlcsp: '', nonCoverageFamilySlcsp: '',
    coverageFamilySourceReference: '', nonCoverageFamilySourceReference: '', coverageFamilyMemberSsns: [], nonCoverageFamilyMemberSsns: [],
    allCoverageFamilyMembersIncludedConfirmed: null, allNonCoverageFamilyMembersIncludedConfirmed: null };
}
export function emptyCoverageFamilyHealth(): CoverageFamilyHealthData {
  return { sourceTaxYear: '', sourceReference: '', sourceFactsConfirmed: null, allPolicySourcesIncluded: null, policies: [], persons: [], outsidePersonReturns: [], months: [] };
}
/** Copy actual originals only. No person role, eligibility, benchmark or confirmation is inferred. */
export function captureCoverageFamilyHealthSources(sourceIds: string[], options: MarketplacePolicyOption[]): CoverageFamilyHealthData {
  if (!sourceIds.length || new Set(sourceIds).size !== sourceIds.length) throw new Error('Choose each actual original Marketplace source once before copying it.');
  const policies = sourceIds.map(sourceId => {
    const option = options.find(row => row.sourceId === sourceId);
    if (!option?.original) throw new Error('The linked original Marketplace source is missing.');
    return { sourceId, original: structuredClone(option.original) };
  });
  const years = new Set(policies.map(row => row.original.taxYear));
  const months = [...new Set(policies.flatMap(row => row.original.monthlyPremiums.map(month => month.month)))];
  const identifiers = [...new Set(policies.flatMap(row => (row.original.coveredIndividuals ?? []).map(person => person.ssn)))];
  return { ...emptyCoverageFamilyHealth(), sourceTaxYear: years.size === 1 ? policies[0]!.original.taxYear : '', policies,
    persons: identifiers.map(coveredIndividualSsn => ({ personId: '', coveredIndividualSsn })), months: months.map(emptyCoverageFamilyHealthMonth) };
}
function integer(value: string, label: string): number | undefined {
  if (!value?.trim()) return undefined;
  if (!/^\d{1,4}$/.test(value.trim())) throw new Error(`Enter the actual whole number for ${label}.`);
  return Number(value);
}
function money(value: string, label = 'Coverage-family benchmarks'): string | undefined {
  if (!value?.trim()) return undefined;
  const amount = parseGuidedCurrency(value);
  if (!amount.isFinite() || amount.lt(0)) throw new Error(`${label} must be actual finite nonnegative amounts.`);
  return amount.toFixed();
}
type Family = NonNullable<NonNullable<Form7206Input['plans']>[number]['coverageFamilySources']>;
export function buildCoverageFamilyHealthSources(data: CoverageFamilyHealthData | undefined): Family | undefined {
  if (!data) return undefined;
  const year = integer(data.sourceTaxYear, 'coverage-family source year');
  if (year === undefined) throw new Error('Enter the actual coverage-family source year.');
  return { sourceTaxYear: year, sourceReference: data.sourceReference.trim(), sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    allPolicySourcesIncluded: data.allPolicySourcesIncluded ?? undefined,
    policies: data.policies.map(row => ({ sourceId: row.sourceId.trim(), original: normalizeMarketplacePolicy(row.original, year, true) })),
    persons: data.persons.map(row => ({ personId: row.personId.trim(), coveredIndividualSsn: row.coveredIndividualSsn.trim() })),
    outsidePersonReturns: data.outsidePersonReturns?.map(row => ({ personId: row.personId.trim(),
      sourceTaxYear: integer(row.sourceTaxYear, 'other-return source year'), sourceReference: row.sourceReference.trim(),
      returnStatus: row.returnStatus || undefined, claimantName: row.claimantName.trim(), claimantSsn: row.claimantSsn.trim(),
      policySourceIds: row.policySourceIds.map(id => id.trim()), allPoliciesIncludedConfirmed: row.allPoliciesIncludedConfirmed ?? undefined,
      form8962Line24: money(row.form8962Line24),
      cashPaymentSources: row.cashPaymentSources ? {
        sourceTaxYear: integer(row.cashPaymentSources.sourceTaxYear, 'outside cash source year'),
        sourceReference: row.cashPaymentSources.sourceReference.trim(), sourceFactsConfirmed: row.cashPaymentSources.sourceFactsConfirmed ?? undefined,
        allPremiumPaymentsIncludedConfirmed: row.cashPaymentSources.allPremiumPaymentsIncludedConfirmed ?? undefined,
        allOtherReturnTaxPaymentsIncludedConfirmed: row.cashPaymentSources.allOtherReturnTaxPaymentsIncludedConfirmed ?? undefined,
        premiumPayments: row.cashPaymentSources.premiumPayments?.map(payment => ({
          paymentSourceId: payment.paymentSourceId.trim(), payer: payment.payer || undefined,
          datePaid: payment.datePaid.trim(), sourceReference: payment.sourceReference.trim(),
          cashPaidToInsurer: money(payment.cashPaidToInsurer, 'Outside insurer cash payments'),
          reimbursements: payment.reimbursements?.map(refund => ({ sourceId: refund.sourceId.trim(), dateReceived: refund.dateReceived.trim(),
            amount: money(refund.amount, 'Actual reimbursements'), sourceReference: refund.sourceReference.trim() })),
        })),
        otherReturnTaxPayments: row.cashPaymentSources.otherReturnTaxPayments?.map(payment => ({
          sourceId: payment.sourceId.trim(), datePaid: payment.datePaid.trim(), amount: money(payment.amount, 'Other-return tax payments'), sourceReference: payment.sourceReference.trim(),
        })),
      } : undefined,
    })),
    months: data.months.map(row => ({ month: integer(row.month, 'coverage-family month'), sourceReference: row.sourceReference.trim(),
      allCoveredPersonsIncludedConfirmed: row.allCoveredPersonsIncludedConfirmed ?? undefined,
      personFacts: row.personFacts.map(person => ({ personId: person.personId.trim(), sourceReference: person.sourceReference.trim(),
        fullCoverageMonthConfirmed: person.fullCoverageMonthConfirmed ?? undefined, otherMecEligible: person.otherMecEligible ?? undefined })),
      coverageFamilySlcsp: money(row.coverageFamilySlcsp), nonCoverageFamilySlcsp: money(row.nonCoverageFamilySlcsp),
      coverageFamilySourceReference: row.coverageFamilySourceReference.trim(), nonCoverageFamilySourceReference: row.nonCoverageFamilySourceReference.trim(),
      coverageFamilyMemberSsns: row.coverageFamilyMemberSsns.map(value => value.trim()), nonCoverageFamilyMemberSsns: row.nonCoverageFamilyMemberSsns.map(value => value.trim()),
      allCoverageFamilyMembersIncludedConfirmed: row.allCoverageFamilyMembersIncludedConfirmed ?? undefined,
      allNonCoverageFamilyMembersIncludedConfirmed: row.allNonCoverageFamilyMembersIncludedConfirmed ?? undefined,
    })),
  };
}
