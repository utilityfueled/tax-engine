/** Actual Form8962 PartIV Situations3/4. Specs: form-8962-{shared-policy,no-advance-allocation}.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

type HouseholdPerson = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
/** Consumed actual source fields only; guided validation needs no invented return context. */
export type Form8962AllocationInput = Pick<TaxYearInput, 'form1095A' | 'form8962'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {
    primary: HouseholdPerson; spouse?: HouseholdPerson; dependents: HouseholdPerson[];
  };
  standardDeductionFacts?: Pick<NonNullable<TaxYearInput['standardDeductionFacts']>, 'primaryCanBeClaimedAsDependent' | 'spouseCanBeClaimedAsDependent'>;
};
type Packet = NonNullable<NonNullable<TaxYearInput['form8962']>['sharedPolicyAllocations']>;
type Original = NonNullable<NonNullable<Packet['policies']>[number]['original']>;
export interface Form8962AllocationMonth {
  month: number; policyIndex: number; premium: Decimal; slcsp: Decimal; advance: Decimal;
  originalPremium: Decimal; originalSlcsp: Decimal | null; originalAdvance: Decimal;
  benchmarkRatio?: { numerator: Decimal; denominator: Decimal };
  /** Full actual unallocated source; no Part IV percentage is created. */
  unshared?: true;
}
export interface Form8962AllocationPeriod {
  policyIndex: number; firstMonth: number; lastMonth: number; fraction: Decimal;
  method?: 'agreement' | 'default_enrollee_count' | 'no_advance_benchmark';
}
export interface Form8962SharedPolicyResult {
  months: Form8962AllocationMonth[]; householdMonths: Form8962HouseholdMonth[];
  periods: Form8962AllocationPeriod[]; lines: CalculatedLine[];
}
export interface Form8962HouseholdMonth {
  month: number; policyIndexes: number[]; premium: Decimal; slcsp: Decimal; advance: Decimal;
  unsharedBenchmarkGroups: { policyIndexes: number[]; slcsp: Decimal }[];
  /** Complete own-family location groups, counted once for overlapping Situation3. */
  noAdvanceBenchmarkGroups?: { policyIndexes: number[]; slcsp: Decimal }[];
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Form8962 allocation requires actual ${label}`);
  return value.trim().replace(/\s+/g, ' ');
}
function name(value: string | undefined, label: string): string { return text(value, label).toLocaleLowerCase('en-US'); }
function ssn(value: string | undefined, label: string): string {
  const actual = text(value, label).replace(/-/g, '');
  if (!/^\d{9}$/.test(actual)) throw new Error(`Form8962 allocation requires the actual complete ${label}`);
  return actual;
}
function month(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 12) throw new Error('Form8962 allocation requires actual months1 through12');
  return value;
}
function money(value: string | null | undefined): Decimal {
  if (value == null || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Form8962 allocation original source amount is unknown or invalid');
  const amount = d(value);
  if (!amount.isFinite()) throw new Error('Form8962 allocation requires finite original amounts');
  return amount;
}
function normalizedOriginal(original: Original, year: number) {
  if (original.taxYear !== year) throw new Error('Form8962 allocation original source year does not match');
  const people = original.coveredIndividuals;
  if (!people?.length) throw new Error('Form8962 allocation requires every original covered person');
  const seenPeople = new Set<string>();
  const covered = people.map(person => {
    const id = ssn(person.ssn, 'covered-person SSN'), first = month(person.firstMonth), last = month(person.lastMonth);
    if (first > last || seenPeople.has(id)) throw new Error('Form8962 allocation original covered people or months are duplicated or conflicting');
    seenPeople.add(id);
    return { name: name(person.name, 'covered-person name'), ssn: id, firstMonth: first, lastMonth: last };
  }).sort((a, b) => a.ssn.localeCompare(b.ssn));
  if (!original.monthlyPremiums?.length) throw new Error('Form8962 allocation requires original monthly policy amounts');
  const seenMonths = new Set<number>();
  const rows = original.monthlyPremiums.map(row => {
    const actualMonth = month(row.month);
    if (seenMonths.has(actualMonth)) throw new Error('Form8962 allocation original month is duplicated');
    seenMonths.add(actualMonth);
    return { month: actualMonth, enrolleePremium: money(row.enrolleePremium).toFixed(),
      slcsp: row.slcsp === null ? null : money(row.slcsp).toFixed(), advancePremiumTaxCredit: money(row.advancePremiumTaxCredit).toFixed() };
  }).sort((a, b) => a.month - b.month);
  // No positive or omitted source period is silently manufactured or discarded.
  for (const person of covered) for (let m = person.firstMonth; m <= person.lastMonth; m++) {
    if (!seenMonths.has(m)) throw new Error('Form8962 allocation covered person has a missing source month');
  }
  return { taxYear: year, marketplace: text(original.marketplace, 'Marketplace'), policyNumber: text(original.policyNumber, 'policy number'),
    recipientName: name(original.recipientName, 'original recipient name'), recipientSsn: ssn(original.recipientSsn, 'original recipient SSN'),
    coveredIndividuals: covered, monthlyPremiums: rows };
}

type ValidatedPolicySource = { policy: NonNullable<Packet['policies']>[number]; index: number; original: ReturnType<typeof normalizedOriginal> };
type CoverageFamily = {
  people: string[]; slcsp: Decimal;
  groups: { people: string[]; policyIndexes: number[]; slcsp: Decimal }[];
};
type CoverageFamilyMonths = Map<number, Map<string, CoverageFamily>>;

/** Full coverage families are monthly source facts. The original statements and
 * actual family assignments establish their people; no income or credit value
 * can replace the complete Marketplace benchmark records. */
function noAdvanceCoverageFamilies(sources: ValidatedPolicySource[], packet: Packet, year: number,
  primaryId: string, primaryName: string): CoverageFamilyMonths {
  const byMonth = new Map<number, ValidatedPolicySource[]>();
  for (const source of sources) for (const row of source.original.monthlyPremiums) {
    byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), source]);
  }
  const required = [...byMonth.entries()].filter(([, rows]) => rows.length > 1 && rows.some(row => row.policy.situation === 'no_advance_credit')).map(([m]) => m);
  const evidence = packet.noAdvanceCoverageFamilies;
  const result: CoverageFamilyMonths = new Map();
  if (!required.length && evidence === undefined) return result;
  if (!evidence || evidence.sourceTaxYear !== year || evidence.sourceFactsConfirmed !== true || evidence.allBenchmarkMonthsIncluded !== true
    || evidence.months?.length !== required.length) throw new Error('Form8962 overlapping Situation3 policies require complete actual coverage-family benchmark sources for every overlapping month');
  text(evidence.sourceReference, 'full coverage-family benchmark source reference');
  for (const row of evidence.months) {
    const m = month(row.month), active = byMonth.get(m);
    if (!required.includes(m) || result.has(m) || !active) throw new Error('Form8962 full coverage-family benchmark month is duplicated or does not match overlapping original policies');
    if (active.some(source => !['no_advance_credit', 'not_shared'].includes(source.policy.situation ?? ''))) throw new Error('Form8962 overlapping Situation3 and Situation4 policies require their separate complete source method');
    const expected = new Map<string, { name: string; people: Map<string, string> }>();
    expected.set(primaryId, { name: primaryName, people: new Map() });
    const assignedPeople = new Map<string, { family: string; name: string }>();
    for (const source of active) {
      const unshared = source.policy.situation === 'not_shared';
      const otherId = unshared ? undefined : ssn(source.policy.otherTaxpayerSsn, 'other coverage-family taxpayer SSN');
      if (otherId) {
        const otherName = name(source.policy.otherTaxpayerName, 'other coverage-family taxpayer name');
        if (otherId === primaryId || (expected.has(otherId) && expected.get(otherId)!.name !== otherName)) throw new Error('Form8962 original policies have contradictory coverage-family taxpayer identities');
        if (!expected.has(otherId)) expected.set(otherId, { name: otherName, people: new Map() });
      }
      for (const person of source.original.coveredIndividuals.filter(person => person.firstMonth <= m && person.lastMonth >= m)) {
        const assignments = source.policy.coveredFamilyAssignments?.filter(entry => ssn(entry.ssn, 'coverage-family assignment SSN') === person.ssn);
        if (!unshared && (assignments?.length !== 1 || !['this_return', 'other_return'].includes(assignments[0].family ?? ''))) throw new Error('Form8962 full coverage family requires each unique original enrollee assignment');
        const family = unshared || assignments?.[0].family === 'this_return' ? primaryId : otherId!;
        const existing = assignedPeople.get(person.ssn);
        if (existing && (existing.family !== family || existing.name !== person.name)) throw new Error('Form8962 covered person has contradictory names or tax families across original policies');
        assignedPeople.set(person.ssn, { family, name: person.name });
        expected.get(family)!.people.set(person.ssn, person.name);
      }
    }
    if (row.families?.length !== expected.size) throw new Error('Form8962 full coverage benchmark sources omit or duplicate an actual tax family');
    const families = new Map<string, CoverageFamily>();
    for (const family of row.families) {
      const id = ssn(family.taxpayerSsn, 'coverage-family taxpayer SSN'), actual = expected.get(id);
      if (!actual || families.has(id) || name(family.taxpayerName, 'coverage-family taxpayer name') !== actual.name) throw new Error('Form8962 benchmark family identity does not match the original policy assignments');
      text(family.sourceReference, 'coverage-family source reference');
      if (family.allCoverageFamilyMembersIncludedConfirmed !== true || family.allCoveragePoliciesIncludedConfirmed !== true || !family.groups?.length) throw new Error('Form8962 coverage-family benchmark requires complete actual family and policy confirmations');
      const seenPeople = new Set<string>(), seenAreas = new Set<string>(), seenIds = new Set<string>();
      const groups: CoverageFamily['groups'] = [];
      for (const group of family.groups) {
        const sourceId = text(group.sourceId, 'coverage-family group source ID'), area = name(group.ratingArea, 'coverage-family rating area');
        text(group.sourceReference, 'coverage-family group benchmark reference');
        if (seenIds.has(sourceId) || seenAreas.has(area) || group.allCoveredPeopleShareRatingAreaConfirmed !== true) throw new Error('Form8962 coverage-family benchmark groups require unique source/rating areas and actual location confirmation');
        seenIds.add(sourceId); seenAreas.add(area);
        const people = group.coveredIndividualSsns?.map(value => ssn(value, 'coverage-family group person SSN')).sort();
        if (!people?.length || new Set(people).size !== people.length) throw new Error('Form8962 coverage-family benchmark group requires unique actual covered people');
        for (const person of people) {
          if (!actual.people.has(person) || seenPeople.has(person)) throw new Error('Form8962 coverage-family benchmark person is missing from original coverage or duplicated across groups');
          seenPeople.add(person);
        }
        const indexes = active.filter(source => source.original.coveredIndividuals.some(person => person.firstMonth <= m && person.lastMonth >= m && people.includes(person.ssn))).map(source => source.index).sort((a, b) => a - b);
        groups.push({ people, policyIndexes: indexes, slcsp: money(group.slcsp) });
      }
      if (seenPeople.size !== actual.people.size) throw new Error('Form8962 coverage-family benchmark groups omit actual monthly covered people');
      const slcsp = monthlySum(groups.map(group => group.slcsp));
      if (slcsp.lte(0)) throw new Error('Form8962 ordinary full coverage-family benchmarks must be positive');
      families.set(id, { people: [...seenPeople].sort(), slcsp, groups });
    }
    result.set(m, families);
  }
  return result;
}

function noAdvanceBenchmarks(evidence: NonNullable<Packet['policies']>[number]['noAdvanceAllocation'], year: number,
  original: ReturnType<typeof normalizedOriginal>, assignments: Map<string, 'this_return' | 'other_return'>,
  coverageFamilies: CoverageFamilyMonths, primaryId: string, otherId: string) {
  if (!evidence || evidence.sourceTaxYear !== year || evidence.sourceFactsConfirmed !== true
    || evidence.allCoveredPeopleInCoverageFamiliesConfirmed !== true) throw new Error('Form8962 no-advance allocation requires actual complete coverage-family benchmark sources');
  text(evidence.sourceReference, 'no-advance benchmark worksheet reference');
  if (evidence.monthlyBenchmarks?.length !== original.monthlyPremiums.length) throw new Error('Form8962 no-advance allocation requires both actual benchmarks for every original month');
  const result = new Map<number, { own: Decimal; other: Decimal }>();
  for (const row of evidence.monthlyBenchmarks) {
    const m = month(row.month);
    if (result.has(m) || !original.monthlyPremiums.some(entry => entry.month === m)) throw new Error('Form8962 no-advance benchmark month is duplicated or not on the original policy');
    const own = money(row.thisReturnSlcsp), other = money(row.otherReturnSlcsp);
    const full = coverageFamilies.get(m);
    if (full && (!full.get(primaryId)?.slcsp.eq(own) || !full.get(otherId)?.slcsp.eq(other))) throw new Error('Form8962 policy benchmarks do not reconcile with actual complete monthly coverage-family sources');
    if (own.lte(0) || other.lte(0)) throw new Error('Form8962 no-advance ordinary two-family method requires positive actual benchmarks for both coverage families');
    text(row.thisReturnSourceReference, 'this-return benchmark source reference');
    text(row.otherReturnSourceReference, 'other-return benchmark source reference');
    for (const [family, ids] of [['this_return', row.thisReturnCoveredIndividualSsns], ['other_return', row.otherReturnCoveredIndividualSsns]] as const) {
      const actual = ids?.map(id => ssn(id, 'benchmark covered-person SSN')).sort();
      const expected = full?.get(family === 'this_return' ? primaryId : otherId)?.people ?? original.coveredIndividuals.filter(person => person.firstMonth <= m && person.lastMonth >= m && assignments.get(person.ssn) === family).map(person => person.ssn).sort();
      if (!actual?.length || new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Form8962 no-advance benchmark coverage family does not match original monthly people and actual return assignments');
    }
    result.set(m, { own, other });
  }
  return result;
}

/** Preserve the source ratio through multiplication. Two-place rounding is
 * exclusively the printed PartIV share; it must not alter the premium. */
function benchmarkAllocation(premium: Decimal, own: Decimal, other: Decimal) {
  const RatioDecimal = Decimal.clone({ precision: Math.max(80, premium.precision() + own.precision() + other.precision() + 40), rounding: Decimal.ROUND_HALF_UP });
  const numerator = new RatioDecimal(own.toFixed()), denominator = numerator.plus(other.toFixed());
  return { premium: new Decimal(new RatioDecimal(premium.toFixed()).times(numerator).div(denominator).toFixed()),
    fraction: new Decimal(numerator.div(denominator).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed()),
    numerator: new Decimal(numerator.toFixed()), denominator: new Decimal(denominator.toFixed()) };
}

/** Sum source-derived monthly values before form rounding. A one-policy source
 * is retained exactly, including decimals beyond the normal calculation scale. */
function monthlySum(values: Decimal[]): Decimal {
  const precision = Math.max(80, ...values.map(value => value.toFixed().replace('.', '').length + 20));
  const SourceDecimal = Decimal.clone({ precision, rounding: Decimal.ROUND_HALF_UP });
  return new Decimal(values.reduce((total, value) => total.plus(value.toFixed()), new SourceDecimal(0)).toFixed());
}

function householdMonths(rows: Form8962AllocationMonth[], originals: Map<number, ReturnType<typeof normalizedOriginal>>, packet: Packet, year: number, coverageFamilies: CoverageFamilyMonths, primaryId: string): Form8962HouseholdMonth[] {
  const byMonth = new Map<number, Form8962AllocationMonth[]>();
  for (const row of rows) byMonth.set(row.month, [...(byMonth.get(row.month) ?? []), row]);
  const required = [...byMonth.entries()].filter(([m, sources]) => !coverageFamilies.has(m) && sources.filter(row => row.unshared).length > 1).map(([m]) => m);
  const evidence = packet.overlappingCoverage;
  const sourceMonths = new Map<number, NonNullable<NonNullable<Packet['overlappingCoverage']>['months']>[number]>();
  if (required.length || evidence !== undefined) {
    if (!evidence || evidence.sourceTaxYear !== year || evidence.sourceFactsConfirmed !== true || evidence.allBenchmarkMonthsIncluded !== true
      || evidence.months?.length !== required.length) throw new Error('Form8962 overlapping unshared policies require complete actual household benchmark group sources');
    text(evidence.sourceReference, 'overlapping coverage benchmark source reference');
    for (const row of evidence.months) {
      const m = month(row.month);
      if (sourceMonths.has(m) || !required.includes(m)) throw new Error('Form8962 overlapping benchmark source month is duplicated or does not match actual unshared policies');
      sourceMonths.set(m, row);
    }
  }
  return [...byMonth.entries()].map(([m, sources]) => {
    const completeFamily = coverageFamilies.get(m)?.get(primaryId);
    if (completeFamily) {
      for (const source of sources.filter(row => row.unshared)) {
        const original = originals.get(source.policyIndex)!;
        const groups = completeFamily.groups.filter(group => original.coveredIndividuals.some(person => person.firstMonth <= m && person.lastMonth >= m && group.people.includes(person.ssn)));
        if (!source.slcsp.eq(monthlySum(groups.map(group => group.slcsp)))) throw new Error('Form8962 unshared correct benchmark does not reconcile with actual full coverage-family location groups');
      }
      return { month: m, policyIndexes: sources.map(row => row.policyIndex).sort((a, b) => a - b),
        premium: monthlySum(sources.map(row => row.premium)), advance: monthlySum(sources.map(row => row.advance)), slcsp: completeFamily.slcsp,
        unsharedBenchmarkGroups: [], noAdvanceBenchmarkGroups: completeFamily.groups.map(group => ({ policyIndexes: group.policyIndexes, slcsp: group.slcsp })) };
    }
    if (sources.length > 1 && sources.some(row => row.benchmarkRatio)) throw new Error('Form8962 overlapping Situation3 policies require their complete coverage-family benchmark coordination method');
    const unshared = sources.filter(row => row.unshared), groups: Form8962HouseholdMonth['unsharedBenchmarkGroups'] = [];
    if (unshared.length <= 1) {
      for (const source of unshared) groups.push({ policyIndexes: [source.policyIndex], slcsp: source.slcsp });
    } else {
      const actualGroups = sourceMonths.get(m)?.groups;
      if (!actualGroups?.length) throw new Error('Form8962 overlapping coverage requires actual benchmark groups');
      const seenPolicies = new Set<number>(), seenPeople = new Set<string>(), seenAreas = new Set<string>(), seenIds = new Set<string>();
      for (const group of actualGroups) {
        const id = text(group.sourceId, 'benchmark group source ID'), area = name(group.ratingArea, 'actual benchmark rating area');
        text(group.sourceReference, 'benchmark group source reference');
        if (seenIds.has(id) || seenAreas.has(area) || group.allUnsharedCoverageFamilyMembersIncludedConfirmed !== true
          || group.allCoveredPeopleShareRatingAreaConfirmed !== true) throw new Error('Form8962 benchmark group requires unique source/rating area and complete actual coverage-family confirmations');
        seenIds.add(id); seenAreas.add(area);
        if (!group.policySourceIds?.length) throw new Error('Form8962 benchmark group requires its actual original policy indexes');
        const benchmark = money(group.slcsp), people = new Set<string>();
        const indexes = group.policySourceIds.map(sourceId => {
          if (!/^form1095A:(0|[1-9]\d*)$/.test(sourceId)) throw new Error('Form8962 benchmark group policy index is invalid');
          const index = Number(sourceId.slice('form1095A:'.length)), source = unshared.find(row => row.policyIndex === index);
          if (!source || seenPolicies.has(index) || !source.slcsp.eq(benchmark)) throw new Error('Form8962 benchmark group does not reconcile with each unique correct original unshared monthly benchmark');
          seenPolicies.add(index);
          for (const person of originals.get(index)!.coveredIndividuals) if (person.firstMonth <= m && person.lastMonth >= m) people.add(person.ssn);
          return index;
        }).sort((a, b) => a - b);
        const actualPeople = group.coveredIndividualSsns?.map(value => ssn(value, 'benchmark group covered-person SSN')).sort();
        if (!actualPeople?.length || new Set(actualPeople).size !== actualPeople.length || JSON.stringify(actualPeople) !== JSON.stringify([...people].sort())) throw new Error('Form8962 benchmark group people do not reconcile with actual original monthly coverage');
        for (const person of people) {
          if (seenPeople.has(person)) throw new Error('Form8962 overlapping benchmark person appears in different location groups');
          seenPeople.add(person);
        }
        groups.push({ policyIndexes: indexes, slcsp: benchmark });
      }
      if (seenPolicies.size !== unshared.length) throw new Error('Form8962 overlapping benchmark groups omit an actual unshared source policy');
    }
    groups.sort((a, b) => a.policyIndexes[0] - b.policyIndexes[0]);
    return { month: m, policyIndexes: sources.map(row => row.policyIndex).sort((a, b) => a - b),
      premium: monthlySum(sources.map(row => row.premium)), advance: monthlySum(sources.map(row => row.advance)),
      slcsp: monthlySum([...sources.filter(row => !row.unshared).map(row => row.slcsp), ...groups.map(group => group.slcsp)]), unsharedBenchmarkGroups: groups };
  }).sort((a, b) => a.month - b.month);
}

/** This function always derives amounts from originals. No supplied calculation or
 * boolean validation context can replace actual household and policy source facts. */
export function calculateForm8962SharedPolicy(input: Form8962AllocationInput): Form8962SharedPolicyResult {
  const year = input.taxpayer.taxYear, facts = input.form8962, packet = facts?.sharedPolicyAllocations;
  if (![2025, 2026].includes(year) || !packet || facts?.allocationRequired !== true) throw new Error('Form8962 allocation needs the actual shared-policy source packet and allocation answer');
  if (packet.sourceTaxYear !== year || packet.sourceFactsConfirmed !== true || packet.allSharedPoliciesIncluded !== true) throw new Error('Form8962 allocation source year and complete confirmation are required');
  text(packet.sourceReference, 'allocation worksheet reference');
  if (input.taxpayer.filingStatus === 'married_filing_separately') throw new Error('Form8962 separate-return allocation requires its separate actual method');
  if (facts.alternativeMarriageCalculationElected !== false || facts.selfEmployedHealthInsuranceCoordinationRequired !== false
    || facts.qsehraAffected !== false || facts.lawfulPresenceReconciliationRequired !== false) {
    throw new Error('Form8962 allocation requires separate marriage, health, QSEHRA or lawful-presence coordination sources');
  }
  const primary = input.taxpayer.primary;
  if (name(packet.primaryName, 'allocation primary name') !== name(`${primary.firstName} ${primary.lastName}`, 'return primary name')
    || ssn(packet.primarySsn, 'allocation primary SSN') !== ssn(primary.ssn, 'return primary SSN')) throw new Error('Form8962 allocation primary identity does not match the actual return');
  const household = new Map<string, string>();
  const addHousehold = (person: { firstName: string; lastName: string; ssn: string }) => {
    const id = ssn(person.ssn, 'household SSN');
    if (household.has(id)) throw new Error('Form8962 allocation household identity is duplicated');
    household.set(id, name(`${person.firstName} ${person.lastName}`, 'household name'));
  };
  if (input.standardDeductionFacts?.primaryCanBeClaimedAsDependent !== false || facts.canBeClaimedAsDependent !== false) throw new Error('Form8962 allocation requires actual unclaimable primary dependency facts');
  addHousehold(primary);
  if (input.taxpayer.filingStatus === 'married_filing_jointly') {
    const spouse = input.taxpayer.spouse;
    if (!spouse || input.standardDeductionFacts?.spouseCanBeClaimedAsDependent !== false
      || name(packet.spouseName, 'allocation spouse name') !== name(`${spouse.firstName} ${spouse.lastName}`, 'return spouse name')
      || ssn(packet.spouseSsn, 'allocation spouse SSN') !== ssn(spouse.ssn, 'return spouse SSN')) throw new Error('Form8962 allocation requires the actual joint spouse identity and dependency facts');
    addHousehold(spouse);
  } else if (packet.spouseName !== undefined || packet.spouseSsn !== undefined) throw new Error('Form8962 allocation spouse source conflicts with the actual return');
  input.taxpayer.dependents.forEach(addHousehold);
  if (facts.taxFamilySize !== household.size) throw new Error('Form8962 allocation family size must match the actual household');
  if (!packet.policies?.length || packet.policies.length !== input.form1095A.length) throw new Error('Form8962 allocation requires a complete source policy ledger');
  const seenPolicies = new Set<number>(), seenIdentities = new Set<string>();
  const originals = new Map<number, ReturnType<typeof normalizedOriginal>>();
  const validated: ValidatedPolicySource[] = [];
  for (const policy of packet.policies) {
    if (!/^form1095A:(0|[1-9]\d*)$/.test(policy.sourceId ?? '')) throw new Error('Form8962 allocation requires the actual original policy index');
    const index = Number(policy.sourceId!.slice('form1095A:'.length));
    const source = input.form1095A[index];
    if (!source || seenPolicies.has(index) || source.sourceFactsComplete !== true || !policy.original) throw new Error('Form8962 allocation original source is missing, incomplete or duplicated');
    seenPolicies.add(index);
    const original = normalizedOriginal(source, year), snapshot = normalizedOriginal(policy.original, year);
    if (JSON.stringify(original) !== JSON.stringify(snapshot)) throw new Error('Form8962 allocation snapshot does not reconcile with the actual original policy');
    originals.set(index, original);
    const identity = JSON.stringify([original.marketplace, original.policyNumber]);
    if (seenIdentities.has(identity)) throw new Error('Form8962 allocation policy identity is duplicated');
    seenIdentities.add(identity);
    validated.push({ policy, index, original });
  }
  const primaryId = ssn(primary.ssn, 'return primary SSN');
  const coverageFamilies = noAdvanceCoverageFamilies(validated, packet, year, primaryId, name(`${primary.firstName} ${primary.lastName}`, 'return primary name'));
  const months: Form8962AllocationMonth[] = [], periods: Form8962AllocationPeriod[] = [];
  for (const { policy, index, original } of validated) {
    if (policy.situation === 'not_shared') {
      text(policy.unsharedSourceReference, 'unshared policy source reference');
      if (policy.allCoveredPeopleInThisTaxFamilyConfirmed !== true || policy.originalSlcspCorrectConfirmed !== true) throw new Error('Form8962 unshared policy requires actual household coverage and correct original benchmark confirmation');
      if (policy.otherTaxpayerName?.trim() || policy.otherTaxpayerSsn?.trim() || policy.twoTaxFamiliesConfirmed === true
        || policy.agreementConfirmed === true || policy.agreementReference?.trim() || policy.defaultAllocation !== undefined
        || policy.noAdvanceAllocation !== undefined || policy.coveredFamilyAssignments?.length
        || policy.monthlyAllocations?.some(row => row.fraction !== undefined && row.fraction !== '')) throw new Error('Form8962 unshared classification conflicts with actual shared-policy source facts');
      const filerIds = [ssn(primary.ssn, 'primary SSN'), ...(input.taxpayer.filingStatus === 'married_filing_jointly' && input.taxpayer.spouse ? [ssn(input.taxpayer.spouse.ssn, 'spouse SSN')] : [])];
      if (!filerIds.includes(original.recipientSsn) || household.get(original.recipientSsn) !== original.recipientName) throw new Error('Form8962 unshared original recipient does not match an actual return filer');
      if (original.coveredIndividuals.some(person => household.get(person.ssn) !== person.name)) throw new Error('Form8962 unshared covered person does not match this actual tax family');
      for (const row of original.monthlyPremiums) {
        if (!original.coveredIndividuals.some(person => person.firstMonth <= row.month && person.lastMonth >= row.month)) throw new Error('Form8962 unshared original month has no actual covered tax-family person');
        const premium = money(row.enrolleePremium), slcsp = money(row.slcsp), advance = money(row.advancePremiumTaxCredit);
        months.push({ month: row.month, policyIndex: index, premium, slcsp, advance,
          originalPremium: premium, originalSlcsp: slcsp, originalAdvance: advance, unshared: true });
      }
      continue;
    }
    if (policy.unsharedSourceReference?.trim() || policy.allCoveredPeopleInThisTaxFamilyConfirmed === true) throw new Error('Form8962 shared classification conflicts with unshared source facts');
    const otherSsn = ssn(policy.otherTaxpayerSsn, 'other taxpayer SSN'), otherName = name(policy.otherTaxpayerName, 'other taxpayer name');
    if (household.has(otherSsn)) throw new Error('Form8962 allocation other taxpayer is in this return household');
    const recipientName = household.get(original.recipientSsn) ?? (original.recipientSsn === otherSsn ? otherName : undefined);
    if (recipientName !== original.recipientName) throw new Error('Form8962 allocation original recipient does not match either actual tax family taxpayer');
    const noAdvance = policy.situation === 'no_advance_credit';
    if ((!noAdvance && policy.situation !== 'other_two_tax_families') || policy.noCurrentYearMarriageOrDivorceConfirmed !== true
      || policy.twoTaxFamiliesConfirmed !== true || policy.allCoveredPeopleAssignedConfirmed !== true) throw new Error('Form8962 allocation requires actual Situation4 and two-family source facts');
    if (!noAdvance && policy.originalSlcspCorrectConfirmed !== true) throw new Error('Form8962 allocation requires the actual correct original SLCSP source');
    if (!noAdvance && typeof policy.agreementConfirmed !== 'boolean') throw new Error('Form8962 allocation requires a known actual agreement answer');
    const method = noAdvance ? 'no_advance_benchmark' : policy.agreementConfirmed ? 'agreement' : 'default_enrollee_count';
    let enrollingFamily: 'this_return' | 'other_return' | undefined;
    if (noAdvance) {
      if (original.monthlyPremiums.some(row => money(row.advancePremiumTaxCredit).gt(0))) throw new Error('Form8962 Situation3 requires actual zero APTC in every original policy month');
      if (policy.agreementConfirmed === true || policy.agreementReference?.trim() || policy.defaultAllocation !== undefined
        || policy.monthlyAllocations?.some(row => row.fraction !== undefined && row.fraction !== '')) throw new Error('Form8962 no-advance allocation cannot use an agreement or default-enrollee share');
    } else if (policy.noAdvanceAllocation !== undefined) {
      throw new Error('Form8962 no-advance benchmark sources conflict with the actual allocation situation');
    } else if (policy.agreementConfirmed) {
      text(policy.agreementReference, 'allocation agreement reference');
      if (policy.defaultAllocation !== undefined) throw new Error('Form8962 agreed allocation conflicts with supplied no-agreement enrollment facts');
    } else {
      const evidence = policy.defaultAllocation;
      if (policy.agreementReference?.trim()) throw new Error('Form8962 no-agreement default conflicts with a supplied agreement reference');
      text(evidence?.sourceReference, 'default allocation enrollment reference');
      const enrollingSsn = ssn(evidence?.enrollingTaxpayerSsn, 'actual enrolling taxpayer SSN');
      const returnFilers = [ssn(primary.ssn, 'primary SSN'), ...(input.taxpayer.filingStatus === 'married_filing_jointly' && input.taxpayer.spouse ? [ssn(input.taxpayer.spouse.ssn, 'spouse SSN')] : [])];
      if (enrollingSsn !== otherSsn && !returnFilers.includes(enrollingSsn)) throw new Error('Form8962 default enrolling taxpayer must match an actual taxpayer in one of the two returns');
      if (evidence?.allCoveredPeopleEnrolledByTaxpayerConfirmed !== true) throw new Error('Form8962 default allocation requires actual confirmation of who enrolled every covered person');
      enrollingFamily = enrollingSsn === otherSsn ? 'other_return' : 'this_return';
      if (policy.monthlyAllocations?.some(row => row.fraction !== undefined && row.fraction !== '')) throw new Error('Form8962 no-agreement default cannot use supplied agreement fractions');
    }
    if (!noAdvance && sum(...original.monthlyPremiums.map(row => d(row.advancePremiumTaxCredit))).lte(0)) throw new Error('Form8962 no-APTC allocation requires its separate source method');
    const assignments = new Map<string, 'this_return' | 'other_return'>();
    for (const assigned of policy.coveredFamilyAssignments ?? []) {
      const id = ssn(assigned.ssn, 'assigned enrollee SSN');
      if (assignments.has(id) || !original.coveredIndividuals.some(person => person.ssn === id)
        || !['this_return', 'other_return'].includes(assigned.family ?? '')) throw new Error('Form8962 allocation enrollee assignment is duplicated, unknown or not on the original policy');
      assignments.set(id, assigned.family!);
    }
    if (assignments.size !== original.coveredIndividuals.length) throw new Error('Form8962 allocation requires every original covered enrollee assignment');
    for (const person of original.coveredIndividuals) {
      const ownName = household.get(person.ssn);
      if (assignments.get(person.ssn) === 'this_return' ? ownName !== person.name : ownName !== undefined) throw new Error('Form8962 allocation covered person conflicts with the actual return household');
      if (person.ssn === otherSsn && person.name !== otherName) throw new Error('Form8962 allocation other taxpayer name conflicts with the original covered person');
    }
    const benchmarks = noAdvance ? noAdvanceBenchmarks(policy.noAdvanceAllocation, year, original, assignments, coverageFamilies, primaryId, otherSsn) : undefined;
    if (policy.agreementConfirmed && policy.monthlyAllocations?.length !== original.monthlyPremiums.length) throw new Error('Form8962 allocation requires each original month agreement');
    const fractions = new Map<number, Decimal>();
    for (const row of policy.agreementConfirmed ? policy.monthlyAllocations! : []) {
      const m = month(row.month);
      if (fractions.has(m) || !original.monthlyPremiums.some(sourceMonth => sourceMonth.month === m)) throw new Error('Form8962 allocation agreement month is duplicated or has no original source');
      if (row.fraction === undefined || !/^(?:0|1|0?\.\d{1,2}|1\.0{1,2})$/.test(row.fraction) || d(row.fraction).lt(0) || d(row.fraction).gt(1)) throw new Error('Form8962 allocation needs an actual agreed fraction from0 through1 with at most two decimal places');
      fractions.set(m, d(row.fraction));
    }
    for (const row of original.monthlyPremiums) {
      const covered = original.coveredIndividuals.filter(person => person.firstMonth <= row.month && person.lastMonth >= row.month);
      if (!covered.some(person => assignments.get(person.ssn) === 'this_return') || !covered.some(person => assignments.get(person.ssn) === 'other_return')) throw new Error('Form8962 allocation month must have actual enrollees in both tax families');
      const claimingCount = covered.filter(person => assignments.get(person.ssn) !== enrollingFamily).length;
      const claimingFraction = noAdvance || policy.agreementConfirmed ? undefined : d(claimingCount).div(covered.length).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      // The enrolling taxpayer retains the remainder after the claiming share
      // is rounded, including exact half-percentage ties. Source amounts do not
      // supply a residual or a user-entered calculated fraction.
      const originalPremium = money(row.enrolleePremium), originalSlcsp = row.slcsp === null ? null : money(row.slcsp), originalAdvance = money(row.advancePremiumTaxCredit);
      const benchmark = benchmarks?.get(row.month);
      const allocation = benchmark ? benchmarkAllocation(originalPremium, benchmark.own, benchmark.other) : undefined;
      const fraction = allocation ? allocation.fraction : policy.agreementConfirmed ? fractions.get(row.month)!
        : enrollingFamily === 'this_return' ? d(1).minus(claimingFraction!) : claimingFraction!;
      if (!noAdvance && originalSlcsp === null) throw new Error('Form8962 Situation4 requires the actual correct original SLCSP amount, not a printed blank');
      const slcsp = benchmark?.own ?? money(row.slcsp).times(fraction);
      months.push({ month: row.month, policyIndex: index, originalPremium, originalSlcsp, originalAdvance,
        premium: allocation?.premium ?? originalPremium.times(fraction), slcsp, advance: originalAdvance.times(fraction),
        ...(allocation ? { benchmarkRatio: { numerator: allocation.numerator, denominator: allocation.denominator } } : {}) });
      const last = periods.at(-1);
      if (last?.policyIndex === index && last.lastMonth + 1 === row.month && last.fraction.eq(fraction)) last.lastMonth = row.month;
      else periods.push({ policyIndex: index, firstMonth: row.month, lastMonth: row.month, fraction, method });
    }
  }
  if (periods.length === 0) throw new Error('Form8962 allocationRequired needs at least one actual shared-policy allocation');
  months.sort((a, b) => a.month - b.month || a.policyIndex - b.policyIndex);
  const combinedMonths = householdMonths(months, originals, packet, year, coverageFamilies, primaryId);
  periods.sort((a, b) => a.policyIndex - b.policyIndex || a.firstMonth - b.firstMonth);
  const audit = new AuditTrail();
  for (const [index, period] of periods.entries()) for (const column of period.method === 'no_advance_benchmark' ? ['e'] : ['e', 'f', 'g']) {
    const defaultMethod = period.method === 'default_enrollee_count';
    const noAdvanceMethod = period.method === 'no_advance_benchmark';
    audit.record('Form8962 PartIV', `allocation-${index + 1}${column}`, noAdvanceMethod ? 'Printed no-advance benchmark allocation fraction' : defaultMethod ? 'Default allocation fraction from actual enrollees' : 'Actual agreed allocation fraction', period.fraction,
      noAdvanceMethod ? `Situation3 original policy${period.policyIndex + 1},months${period.firstMonth}-${period.lastMonth}; rounded ratio for printed column e only`
        : `Situation4 actual original policy${period.policyIndex + 1},months${period.firstMonth}-${period.lastMonth}; ${defaultMethod ? 'rounded claiming-family enrollee share and enrolling complement' : 'actual agreed fraction'} for all three amounts`);
  }
  for (const row of months) {
    const sourceLine = combinedMonths.find(month => month.month === row.month)!.policyIndexes.length > 1 ? `policy-${row.policyIndex + 1}:month-${row.month}` : `month-${row.month}`;
    if (row.unshared) {
      for (const [column, value, label] of [['premium', row.premium, 'enrollment premium'], ['slcsp', row.slcsp, 'correct original benchmark'], ['advance', row.advance, 'advance credit']] as const) {
        audit.record('Form8962 PartIV', `${sourceLine}:${column}`, `Unallocated ${label} before form rounding`, value,
          `Actual complete unshared original policy${row.policyIndex + 1}; full source amount without a PartIV percentage`);
      }
      continue;
    }
    audit.record('Form8962 PartIV', `${sourceLine}:premium`, 'Allocated enrollment premiums before form rounding', row.premium,
      row.benchmarkRatio ? 'Original monthly premium times actual own benchmark divided by both actual family benchmarks; no printed-fraction rounding'
        : 'Exact original monthly premium times source-derived allocation fraction', row.benchmarkRatio ? { 'Own family benchmark': row.benchmarkRatio.numerator, 'Both family benchmarks': row.benchmarkRatio.denominator } : undefined);
    audit.record('Form8962 PartIV', `${sourceLine}:slcsp`, 'Applicable SLCSP before form rounding', row.slcsp,
      row.benchmarkRatio ? 'Actual own coverage-family benchmark; original statement benchmark is not allocated' : 'Exact correct original monthly benchmark times source-derived allocation fraction');
    audit.record('Form8962 PartIV', `${sourceLine}:advance`, 'Allocated advance credit before form rounding', row.advance, 'Exact original monthly advance credit times source-derived allocation fraction');
  }
  for (const row of combinedMonths.filter(row => row.policyIndexes.length > 1)) {
    for (const [column, value] of [['premium', row.premium], ['slcsp', row.slcsp], ['advance', row.advance]] as const) audit.record('Form8962 PartIV', `household-month-${row.month}:${column}`,
      'Combined household month before form rounding', value, column === 'slcsp' ? row.noAdvanceBenchmarkGroups ? 'Complete own coverage-family benchmark from each actual location group once; no per-policy duplication' : 'Allocated benchmarks plus each actual unshared coverage-group benchmark once' : 'Sum actual allocated and unallocated policy amounts once');
  }
  return { months, householdMonths: combinedMonths, periods, lines: audit.getLines() };
}
