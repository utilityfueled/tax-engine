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
export interface CoverageFamilyHealthData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPolicySourcesIncluded: boolean | null;
  policies: { sourceId: string; original: MarketplacePolicyData }[];
  persons: { personId: string; coveredIndividualSsn: string }[];
  months: CoverageFamilyHealthMonthData[];
}
export function emptyCoverageFamilyHealthMonth(month = ''): CoverageFamilyHealthMonthData {
  return { month, sourceReference: '', allCoveredPersonsIncludedConfirmed: null, personFacts: [], coverageFamilySlcsp: '', nonCoverageFamilySlcsp: '',
    coverageFamilySourceReference: '', nonCoverageFamilySourceReference: '', coverageFamilyMemberSsns: [], nonCoverageFamilyMemberSsns: [],
    allCoverageFamilyMembersIncludedConfirmed: null, allNonCoverageFamilyMembersIncludedConfirmed: null };
}
export function emptyCoverageFamilyHealth(): CoverageFamilyHealthData {
  return { sourceTaxYear: '', sourceReference: '', sourceFactsConfirmed: null, allPolicySourcesIncluded: null, policies: [], persons: [], months: [] };
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
function money(value: string): string | undefined {
  if (!value?.trim()) return undefined;
  const amount = parseGuidedCurrency(value);
  if (!amount.isFinite() || amount.lt(0)) throw new Error('Coverage-family benchmarks must be actual finite nonnegative amounts.');
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
