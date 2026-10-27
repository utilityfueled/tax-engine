import { Form1095ASchema, Form8962Schema, type Form7206Input } from "@/models/inputs";
import { calculateForm8962SharedPolicy, type Form8962AllocationInput } from "@/engine/forms/form-8962-shared-policy";
import type { FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import type { MarketplacePolicyData, PremiumTaxCreditData, MarketplaceCoverageMonthData } from "./guided-premium-tax-credit-facts";
import { parseGuidedCurrency } from "./guided-currency";

export interface SharedPolicyAllocationData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allSharedPoliciesIncluded: boolean | null;
  primaryName: string; primarySsn: string; spouseName?: string; spouseSsn?: string;
  policies: SharedPolicyAgreementData[];
  overlappingCoverage?: OverlappingBenchmarkData;
  noAdvanceCoverageFamilies?: NoAdvanceCoverageFamiliesData;
}
export interface OverlappingBenchmarkGroupData {
  sourceId: string; sourceReference: string; ratingArea: string; slcsp: string;
  allUnsharedCoverageFamilyMembersIncludedConfirmed: boolean | null; allCoveredPeopleShareRatingAreaConfirmed: boolean | null;
  policySourceIds: string[]; coveredIndividualSsns: string[];
}
export interface OverlappingBenchmarkData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allBenchmarkMonthsIncluded: boolean | null;
  months: { month: string; groups: OverlappingBenchmarkGroupData[] }[];
}
export interface SharedPolicyAgreementData {
  sourceId: string; original?: MarketplacePolicyData; otherTaxpayerName: string; otherTaxpayerSsn: string;
  situation: "" | "other_two_tax_families" | "divorce_during_year" | "married_separate" | "no_advance_credit" | "not_shared";
  noCurrentYearMarriageOrDivorceConfirmed: boolean | null; twoTaxFamiliesConfirmed: boolean | null;
  otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed?: boolean | null;
  otherTaxpayerRelationshipSourceReference?: string;
  allCoveredPeopleAssignedConfirmed: boolean | null; originalSlcspCorrectConfirmed: boolean | null;
  agreementConfirmed: boolean | null; agreementReference: string;
  unsharedSourceReference?: string;
  allCoveredPeopleInThisTaxFamilyConfirmed?: boolean | null;
  noAdvanceAllocation?: NoAdvanceBenchmarkData;
  defaultAllocation?: { sourceReference: string; enrollingTaxpayerSsn: string; allCoveredPeopleEnrolledByTaxpayerConfirmed: boolean | null };
  coveredFamilyAssignments: { ssn: string; family: "" | "this_return" | "other_return" }[];
  monthlyAllocations: { month: string; fraction: string }[];
}
export interface NoAdvanceBenchmarkData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allCoveredPeopleInCoverageFamiliesConfirmed: boolean | null;
  monthlyBenchmarks: { month: string; thisReturnSlcsp: string; otherReturnSlcsp: string; thisReturnSourceReference: string; otherReturnSourceReference: string;
    thisReturnCoveredIndividualSsns: string[]; otherReturnCoveredIndividualSsns: string[] }[];
}
export interface CoverageFamilyGroupData {
  sourceId: string; sourceReference: string; ratingArea: string; slcsp: string;
  coveredIndividualSsns: string[]; allCoveredPeopleShareRatingAreaConfirmed: boolean | null;
}
export interface CoverageFamilyData {
  taxpayerName: string; taxpayerSsn: string; sourceReference: string;
  /** Copied originals for choosing source groups, not an eligibility inference. */
  coveredIndividuals: { name: string; ssn: string }[];
  allCoverageFamilyMembersIncludedConfirmed: boolean | null; allCoveragePoliciesIncludedConfirmed: boolean | null;
  groups: CoverageFamilyGroupData[];
}
export interface NoAdvanceCoverageFamiliesData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allBenchmarkMonthsIncluded: boolean | null;
  months: { month: string; families: CoverageFamilyData[] }[];
}
/** Copy only original monthly identities and actual assignments. Source groups,
 * amounts, references and completeness answers are never supplied by capture. */
function completeCoverageFamilyMonths(packet: SharedPolicyAllocationData): NoAdvanceCoverageFamiliesData['months'] {
  const year = whole(packet.sourceTaxYear, "coverage-family source year"), ownId = identity(packet.primarySsn, "return primary SSN").replaceAll("-", "");
  const sources = packet.policies.map(policy => {
    if (!policy.original) throw new Error("Copy the actual original policies before grouping complete coverage families.");
    return { policy, original: normalizeMarketplacePolicy(policy.original, year, true) };
  });
  const months = [...new Set(sources.flatMap(source => source.original.monthlyPremiums.map(row => row.month)))].sort((a, b) => a - b);
  return months.flatMap(m => {
    const active = sources.filter(source => source.original.monthlyPremiums.some(row => row.month === m));
    if (active.length <= 1 || !active.some(source => source.policy.situation === "no_advance_credit")) return [];
    if (active.some(source => !["no_advance_credit", "not_shared"].includes(source.policy.situation))) throw new Error("Reconcile each original policy's actual no-advance or unshared situation before copying full families.");
    const families = new Map<string, CoverageFamilyData>();
    const family = (taxpayerName: string, taxpayerSsn: string) => ({ taxpayerName: text(taxpayerName, "coverage-family taxpayer name"), taxpayerSsn: identity(taxpayerSsn, "coverage-family taxpayer SSN"), sourceReference: "", coveredIndividuals: [], allCoverageFamilyMembersIncludedConfirmed: null, allCoveragePoliciesIncludedConfirmed: null, groups: [] } satisfies CoverageFamilyData);
    families.set(ownId, family(packet.primaryName, packet.primarySsn));
    const people = new Map<string, { family: string; name: string }>();
    for (const { policy, original } of active) {
      const unshared = policy.situation === "not_shared", otherId = unshared ? undefined : identity(policy.otherTaxpayerSsn, "other taxpayer SSN").replaceAll("-", "");
      if (otherId) {
        if (otherId === ownId) throw new Error("The other tax family must have its own actual taxpayer identity.");
        const next = family(policy.otherTaxpayerName, policy.otherTaxpayerSsn), previous = families.get(otherId);
        if (previous && previous.taxpayerName.toLocaleLowerCase() !== next.taxpayerName.toLocaleLowerCase()) throw new Error("The original policies have contradictory other-family taxpayer names.");
        if (!previous) families.set(otherId, next);
      }
      for (const person of original.coveredIndividuals ?? []) if (person.firstMonth! <= m && person.lastMonth! >= m) {
        const id = identity(person.ssn, "original covered-person SSN").replaceAll("-", "");
        const assigned = policy.coveredFamilyAssignments.filter(row => identity(row.ssn, "assignment SSN").replaceAll("-", "") === id);
        if (!unshared && (assigned.length !== 1 || !["this_return", "other_return"].includes(assigned[0].family))) throw new Error("Complete each original covered-person assignment before copying full families.");
        const familyId = unshared || assigned[0]?.family === "this_return" ? ownId : otherId!;
        const actualName = text(person.name, "covered-person name"), previous = people.get(id);
        if (previous && (previous.family !== familyId || previous.name.toLocaleLowerCase() !== actualName.toLocaleLowerCase())) throw new Error("An original person has contradictory names or family assignments.");
        if (!previous) families.get(familyId)!.coveredIndividuals.push({ name: actualName, ssn: person.ssn! });
        people.set(id, { family: familyId, name: actualName });
      }
    }
    return [{ month: String(m), families: [...families.values()] }];
  });
}
export function captureNoAdvanceCoverageFamilies(packet: SharedPolicyAllocationData): NoAdvanceCoverageFamiliesData {
  const months = completeCoverageFamilyMonths(packet);
  if (!months.length) throw new Error("There are no overlapping no-advance source months to group.");
  return { sourceTaxYear: packet.sourceTaxYear, sourceReference: "", sourceFactsConfirmed: null, allBenchmarkMonthsIncluded: null, months };
}

export function invalidateSharedPolicySources(packet: SharedPolicyAllocationData): SharedPolicyAllocationData {
  return { ...packet, sourceFactsConfirmed: null,
    ...(packet.noAdvanceCoverageFamilies ? { noAdvanceCoverageFamilies: { ...packet.noAdvanceCoverageFamilies, sourceFactsConfirmed: null } } : {}),
    ...(packet.overlappingCoverage ? { overlappingCoverage: { ...packet.overlappingCoverage, sourceFactsConfirmed: null } } : {}), policies: packet.policies.map(policy => ({ ...policy,
    ...(policy.noAdvanceAllocation ? { noAdvanceAllocation: { ...policy.noAdvanceAllocation, sourceFactsConfirmed: null } } : {}) })) };
}
/** Copies actual overlapping months only; locations, groups and money stay unknown. */
export function captureOverlappingBenchmarkSources(packet: SharedPolicyAllocationData): OverlappingBenchmarkData {
  const year = whole(packet.sourceTaxYear, "overlapping benchmark source year"), counts = new Map<number, number>();
  for (const policy of packet.policies.filter(row => row.situation === "not_shared")) {
    if (!policy.original) throw new Error("Copy the actual original unshared policies first.");
    for (const row of normalizeMarketplacePolicy(policy.original, year, true).monthlyPremiums) counts.set(row.month, (counts.get(row.month) ?? 0) + 1);
  }
  const noAdvanceMonths = new Set(packet.policies.filter(row => row.situation === "no_advance_credit").flatMap(row => row.original?.monthlyPremiums.map(month => whole(month.month, "no-advance source month")) ?? []));
  const months = [...counts.entries()].filter(([month, count]) => count > 1 && !noAdvanceMonths.has(month)).sort(([a], [b]) => a - b).map(([month]) => ({ month: String(month), groups: [] }));
  if (!months.length) throw new Error("There are no overlapping unshared source months to group.");
  return { sourceTaxYear: packet.sourceTaxYear, sourceReference: "", sourceFactsConfirmed: null, allBenchmarkMonthsIncluded: null, months };
}
/** Explicit group selection copies the selected originals' active people, never a benchmark. */
export function copyBenchmarkGroupPeople(packet: SharedPolicyAllocationData, actualMonth: string, policyIds: string[]): string[] {
  const m = whole(actualMonth, "benchmark group month"), year = whole(packet.sourceTaxYear, "benchmark source year"), people = new Map<string, string>();
  if (m < 1 || m > 12 || new Set(policyIds).size !== policyIds.length) throw new Error("Select each actual original policy once for a valid source month.");
  for (const id of policyIds) {
    const policy = packet.policies.find(row => row.sourceId === id);
    if (policy?.situation !== "not_shared" || !policy.original) throw new Error("Select an actual unshared original policy for this group.");
    const original = normalizeMarketplacePolicy(policy.original, year, true);
    if (!original.monthlyPremiums.some(row => row.month === m)) throw new Error("The selected original policy has no coverage source for this month.");
    for (const person of original.coveredIndividuals ?? []) if (person.firstMonth! <= m && person.lastMonth! >= m) {
      const value = identity(person.ssn, "actual covered-person SSN"); people.set(value.replaceAll("-", ""), value);
    }
  }
  return [...people.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value);
}
function originalSlcsp(row: MarketplacePolicyData["monthlyPremiums"][number]): string | null {
  if (row.slcspReportedBlank === true) {
    if (row.slcsp?.trim()) throw new Error("The original SLCSP printed-blank answer contradicts a supplied amount.");
    return null;
  }
  return money(row.slcsp, "original SLCSP premium");
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}.`);
  return value.trim();
}
function whole(value: string | undefined, label: string): number {
  if (!value?.trim() || !/^\d{1,4}$/.test(value.trim())) throw new Error(`Enter the actual whole number for ${label}.`);
  return Number(value);
}
function money(value: string | undefined, label: string): string {
  text(value, label);
  const amount = parseGuidedCurrency(value);
  if (amount.lt(0)) throw new Error(`The actual ${label} cannot be negative.`);
  return amount.toFixed();
}
function identity(value: string | undefined, label: string): string {
  const actual = text(value, label);
  if (!/^\d{9}$/.test(actual.replace(/-/g, ""))) throw new Error(`Enter the actual complete ${label}.`);
  return actual;
}
function person(value: { firstName?: string; lastName?: string; ssn?: string } | undefined, label: string) {
  return { firstName: text(value?.firstName, `${label} first name`), lastName: text(value?.lastName, `${label} last name`), ssn: identity(value?.ssn, `${label} SSN`) };
}
const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;

export function normalizeMarketplacePolicy(policy: MarketplacePolicyData, taxYear: number, shared = false) {
  const year = whole(policy.taxYear, "original statement year");
  if (year !== taxYear) throw new Error("An original Marketplace statement has a different tax year.");
  const covered = policy.coveredIndividuals?.map(entry => {
    const first = whole(entry.firstMonth, "original covered person's first month"), last = whole(entry.lastMonth, "original covered person's last month");
    if (first < 1 || last > 12 || first > last) throw new Error("Enter the actual original covered-person months from 1 through 12.");
    return { name: text(entry.name, "original covered-person name"), ssn: identity(entry.ssn, "original covered-person SSN"), firstMonth: first, lastMonth: last };
  });
  if (shared && !covered?.length) throw new Error("Enter every original covered person for the shared policy.");
  return Form1095ASchema.parse({ taxYear: year, marketplace: text(policy.marketplace, "Marketplace"), policyNumber: text(policy.policyNumber, "policy number"),
    recipientName: shared ? text(policy.recipientName, "original recipient name") : policy.recipientName,
    recipientSsn: shared ? identity(policy.recipientSsn, "original recipient SSN") : policy.recipientSsn,
    coveredIndividuals: covered,
    monthlyPremiums: policy.monthlyPremiums.map(row => ({ month: whole(row.month, "original statement month"),
      enrolleePremium: money(row.enrolleePremium, "original enrollment premium"), slcsp: originalSlcsp(row), advancePremiumTaxCredit: money(row.advancePremiumTaxCredit, "original advance credit") })) });
}
/** Explicit copy of entered sources; unknown agreement answers stay unknown. */
export function captureSharedPolicySources(data: PremiumTaxCreditData, personal: PersonalInfoData | undefined, filingStatus: FilingStatus | null | undefined): SharedPolicyAllocationData {
  const year = whole(data.sourceTaxYear, "allocation source year");
  if (![2025, 2026].includes(year) || !filingStatus) throw new Error("Complete the actual allocation year and filing status.");
  const primary = person(personal, "primary taxpayer"), spouse = filingStatus === "mfj" ? person(personal?.spouse, "joint spouse") : undefined;
  if (!data.policies.length) throw new Error("Enter actual original Marketplace policy statements before copying.");
  const policies = data.policies.map((source, index): SharedPolicyAgreementData => {
    normalizeMarketplacePolicy(source, year, true);
    return { sourceId: `form1095A:${index}`, original: structuredClone(source), otherTaxpayerName: "", otherTaxpayerSsn: "", situation: "",
      noCurrentYearMarriageOrDivorceConfirmed: null, otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: null, otherTaxpayerRelationshipSourceReference: '',
      twoTaxFamiliesConfirmed: null, allCoveredPeopleAssignedConfirmed: null, originalSlcspCorrectConfirmed: null,
      agreementConfirmed: null, agreementReference: "", unsharedSourceReference: "", allCoveredPeopleInThisTaxFamilyConfirmed: null,
      coveredFamilyAssignments: (source.coveredIndividuals ?? []).map(entry => ({ ssn: entry.ssn, family: "" })),
      monthlyAllocations: source.monthlyPremiums.map(row => ({ month: row.month, fraction: "" })) };
  });
  return { sourceTaxYear: data.sourceTaxYear, sourceReference: "", sourceFactsConfirmed: null, allSharedPoliciesIncluded: null,
    primaryName: `${primary.firstName} ${primary.lastName}`, primarySsn: primary.ssn,
    ...(spouse ? { spouseName: `${spouse.firstName} ${spouse.lastName}`, spouseSsn: spouse.ssn } : {}), policies };
}
/** Copy only actual original month/person facts. Benchmark values remain unknown. */
export function captureNoAdvanceBenchmarkSources(policy: SharedPolicyAgreementData, packet?: SharedPolicyAllocationData): NoAdvanceBenchmarkData {
  if (policy.situation !== "no_advance_credit" || !policy.original) throw new Error("Select the actual no-advance situation and copy its original policy first.");
  const year = whole(policy.original.taxYear, "original statement year"), original = normalizeMarketplacePolicy(policy.original, year, true);
  const assignments = new Map<string, string>();
  for (const row of policy.coveredFamilyAssignments) {
    const id = identity(row.ssn, "assigned covered-person SSN").replaceAll("-", "");
    if (assignments.has(id) || !["this_return", "other_return"].includes(row.family)) throw new Error("Complete each actual covered-person family assignment before copying benchmark rows.");
    assignments.set(id, row.family);
  }
  const people = (original.coveredIndividuals ?? []).map(person => ({ ...person,
    ssn: identity(person.ssn, "original covered-person SSN"),
    firstMonth: whole(person.firstMonth?.toString(), "original first covered month"),
    lastMonth: whole(person.lastMonth?.toString(), "original last covered month") }));
  if (assignments.size !== people.length || people.some(person => !assignments.has(person.ssn.replaceAll("-", "")))) throw new Error("Reconcile every original covered person before copying benchmark rows.");
  const fullMonths = packet ? completeCoverageFamilyMonths(packet) : [];
  return { sourceTaxYear: policy.original.taxYear, sourceReference: "", sourceFactsConfirmed: null, allCoveredPeopleInCoverageFamiliesConfirmed: null,
    monthlyBenchmarks: original.monthlyPremiums.map(row => {
      const covered = people.filter(person => person.firstMonth <= row.month && person.lastMonth >= row.month);
      const full = fullMonths.find(month => Number(month.month) === row.month);
      const fullPeople = (id: string | undefined) => full?.families.find(family => family.taxpayerSsn.replaceAll("-", "") === id?.replaceAll("-", ""))?.coveredIndividuals.map(person => person.ssn);
      const own = fullPeople(packet?.primarySsn) ?? covered.filter(person => assignments.get(person.ssn.replaceAll("-", "")) === "this_return").map(person => person.ssn);
      const other = fullPeople(policy.otherTaxpayerSsn) ?? covered.filter(person => assignments.get(person.ssn.replaceAll("-", "")) === "other_return").map(person => person.ssn);
      if (!own.length || !other.length) throw new Error("Each actual shared month needs people in both coverage families.");
      return { month: String(row.month), thisReturnSlcsp: "", otherReturnSlcsp: "", thisReturnSourceReference: "", otherReturnSourceReference: "",
        thisReturnCoveredIndividualSsns: own, otherReturnCoveredIndividualSsns: other };
    }) };
}
/** Actual household identity only; no placeholder income or calculated eligibility. */
export function guidedMarketplaceHousehold(personal: PersonalInfoData | undefined, filingStatus: FilingStatus | null | undefined, taxYear: number | null | undefined): Pick<Form8962AllocationInput, 'taxpayer' | 'standardDeductionFacts'> {
  if (!personal || !filingStatus || (taxYear !== 2025 && taxYear !== 2026)) throw new Error('Complete actual Marketplace household, filing status and year.');
  return { taxpayer: { taxYear, filingStatus: statuses[filingStatus], primary: person(personal, 'primary taxpayer'),
    ...(filingStatus === 'mfj' ? { spouse: person(personal.spouse, 'joint spouse') } : {}), dependents: (personal.dependents ?? []).map(entry => person(entry, 'claimed dependent')) },
    standardDeductionFacts: { primaryCanBeClaimedAsDependent: personal.standardDeductionFacts?.primaryCanBeClaimedAsDependent ?? undefined,
      spouseCanBeClaimedAsDependent: personal.standardDeductionFacts?.spouseCanBeClaimedAsDependent ?? undefined } };
}
export function resolveGuidedSharedPolicy(data: PremiumTaxCreditData, taxYear: number | null | undefined, filingStatus: FilingStatus | null | undefined, personal?: PersonalInfoData, form7206?: Form7206Input) {
  const packet = data.sharedPolicyAllocations;
  if (!packet || data.allocationRequired !== true) throw new Error("Complete the actual shared-policy allocation worksheet and reconcile its required answer.");
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus || !personal) throw new Error("Complete the actual return household, year and filing status for the allocation.");
  const policies = data.policies.map(policy => normalizeMarketplacePolicy(policy, taxYear, true));
  const sharedPolicyAllocations = {
    ...packet, sourceTaxYear: whole(packet.sourceTaxYear, "allocation source year"), sourceFactsConfirmed: packet.sourceFactsConfirmed ?? undefined, allSharedPoliciesIncluded: packet.allSharedPoliciesIncluded ?? undefined,
    noAdvanceCoverageFamilies: packet.noAdvanceCoverageFamilies ? { ...packet.noAdvanceCoverageFamilies,
      sourceTaxYear: whole(packet.noAdvanceCoverageFamilies.sourceTaxYear, "complete coverage-family source year"), sourceFactsConfirmed: packet.noAdvanceCoverageFamilies.sourceFactsConfirmed ?? undefined,
      allBenchmarkMonthsIncluded: packet.noAdvanceCoverageFamilies.allBenchmarkMonthsIncluded ?? undefined,
      months: packet.noAdvanceCoverageFamilies.months.map(row => ({ month: whole(row.month, "complete coverage-family month"), families: row.families.map(family => ({ ...family,
        allCoverageFamilyMembersIncludedConfirmed: family.allCoverageFamilyMembersIncludedConfirmed ?? undefined,
        allCoveragePoliciesIncludedConfirmed: family.allCoveragePoliciesIncludedConfirmed ?? undefined,
        groups: family.groups.map(group => ({ ...group, slcsp: money(group.slcsp, "coverage-family group benchmark"), allCoveredPeopleShareRatingAreaConfirmed: group.allCoveredPeopleShareRatingAreaConfirmed ?? undefined })) })) })) } : undefined,
    overlappingCoverage: packet.overlappingCoverage ? { ...packet.overlappingCoverage,
      sourceTaxYear: whole(packet.overlappingCoverage.sourceTaxYear, "overlapping benchmark source year"), sourceFactsConfirmed: packet.overlappingCoverage.sourceFactsConfirmed ?? undefined,
      allBenchmarkMonthsIncluded: packet.overlappingCoverage.allBenchmarkMonthsIncluded ?? undefined,
      months: packet.overlappingCoverage.months.map(row => ({ month: whole(row.month, "overlapping benchmark month"), groups: row.groups.map(group => ({ ...group,
        slcsp: money(group.slcsp, "applicable group benchmark"), allUnsharedCoverageFamilyMembersIncludedConfirmed: group.allUnsharedCoverageFamilyMembersIncludedConfirmed ?? undefined,
        allCoveredPeopleShareRatingAreaConfirmed: group.allCoveredPeopleShareRatingAreaConfirmed ?? undefined })) })) } : undefined,
    policies: packet.policies.map(policy => ({ ...policy, original: policy.original ? normalizeMarketplacePolicy(policy.original, taxYear, true) : undefined,
      situation: policy.situation || undefined, noCurrentYearMarriageOrDivorceConfirmed: policy.noCurrentYearMarriageOrDivorceConfirmed ?? undefined,
      otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed: policy.otherTaxpayerNotMarriedToEitherFilerDuringYearConfirmed ?? undefined,
      twoTaxFamiliesConfirmed: policy.twoTaxFamiliesConfirmed ?? undefined, allCoveredPeopleAssignedConfirmed: policy.allCoveredPeopleAssignedConfirmed ?? undefined,
      originalSlcspCorrectConfirmed: policy.originalSlcspCorrectConfirmed ?? undefined, agreementConfirmed: policy.agreementConfirmed ?? undefined,
      allCoveredPeopleInThisTaxFamilyConfirmed: policy.allCoveredPeopleInThisTaxFamilyConfirmed ?? undefined,
      noAdvanceAllocation: policy.noAdvanceAllocation ? { ...policy.noAdvanceAllocation,
        sourceTaxYear: whole(policy.noAdvanceAllocation.sourceTaxYear, "benchmark source year"), sourceFactsConfirmed: policy.noAdvanceAllocation.sourceFactsConfirmed ?? undefined,
        allCoveredPeopleInCoverageFamiliesConfirmed: policy.noAdvanceAllocation.allCoveredPeopleInCoverageFamiliesConfirmed ?? undefined,
        monthlyBenchmarks: policy.noAdvanceAllocation.monthlyBenchmarks.map(row => ({ ...row, month: whole(row.month, "benchmark source month"),
          thisReturnSlcsp: money(row.thisReturnSlcsp, "this-return benchmark"), otherReturnSlcsp: money(row.otherReturnSlcsp, "other-return benchmark") })) } : undefined,
      defaultAllocation: policy.defaultAllocation ? { ...policy.defaultAllocation, allCoveredPeopleEnrolledByTaxpayerConfirmed: policy.defaultAllocation.allCoveredPeopleEnrolledByTaxpayerConfirmed ?? undefined } : undefined,
      coveredFamilyAssignments: policy.coveredFamilyAssignments.map(entry => ({ ...entry, family: entry.family || undefined })),
      monthlyAllocations: policy.monthlyAllocations.map(row => ({ month: whole(row.month, "agreement month"), fraction: row.fraction.trim() })) })) };
  const form8962 = Form8962Schema.parse({ sharedPolicyAllocations, taxFamilySize: whole(data.taxFamilySize, "actual tax family size"), allocationRequired: data.allocationRequired,
    canBeClaimedAsDependent: data.canBeClaimedAsDependent ?? undefined,
    alternativeMarriageCalculationElected: data.alternativeMarriageCalculationElected ?? undefined,
    selfEmployedHealthInsuranceCoordinationRequired: data.selfEmployedHealthInsuranceCoordinationRequired ?? undefined,
    qsehraAffected: data.qsehraAffected ?? undefined, lawfulPresenceReconciliationRequired: data.lawfulPresenceReconciliationRequired ?? undefined });
  const input: Form8962AllocationInput = { ...guidedMarketplaceHousehold(personal, filingStatus, taxYear), form1095A: policies, form8962, form7206 };
  return { policies, packet: form8962.sharedPolicyAllocations, allocation: calculateForm8962SharedPolicy(input), sourceInput: input };
}
export function deriveSharedPolicyMonths(data: PremiumTaxCreditData, taxYear: number | null | undefined, filingStatus: FilingStatus | null | undefined, personal?: PersonalInfoData, form7206?: Form7206Input): MarketplaceCoverageMonthData[] {
  const result = resolveGuidedSharedPolicy(data, taxYear, filingStatus, personal, form7206);
  const existingMonths = data.monthlyReconciliation.map(row => whole(row.month, "household coverage month"));
  if (new Set(existingMonths).size !== existingMonths.length) throw new Error("Reconcile duplicate household coverage months before deriving allocations.");
  if (existingMonths.some(month => !result.allocation.householdMonths.some(row => row.month === month))) throw new Error("Reconcile household coverage months without an actual original source before deriving allocations.");
  return result.allocation.householdMonths.map(row => {
    const previous = data.monthlyReconciliation.find(entry => Number(entry.month) === row.month);
    return { ...previous, month: String(row.month), enrolleePremium: row.premium.toFixed(), slcsp: row.slcsp.toFixed(), advancePremiumTaxCredit: row.advance.toFixed(),
      coverageEligible: previous?.coverageEligible ?? null, incomeBasedSepEnrollment: previous?.incomeBasedSepEnrollment ?? null };
  });
}
