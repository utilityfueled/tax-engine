/** Actual Form8962 PartIV Situation4. Spec: form-8962-shared-policy.yaml. */
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
  originalPremium: Decimal; originalSlcsp: Decimal; originalAdvance: Decimal;
}
export interface Form8962AllocationPeriod {
  policyIndex: number; firstMonth: number; lastMonth: number; fraction: Decimal;
}
export interface Form8962SharedPolicyResult {
  months: Form8962AllocationMonth[]; periods: Form8962AllocationPeriod[]; lines: CalculatedLine[];
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
function money(value: string | undefined): Decimal {
  if (value === undefined || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Form8962 allocation original source amount is unknown or invalid');
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
      slcsp: money(row.slcsp).toFixed(), advancePremiumTaxCredit: money(row.advancePremiumTaxCredit).toFixed() };
  }).sort((a, b) => a.month - b.month);
  // No positive or omitted source period is silently manufactured or discarded.
  for (const person of covered) for (let m = person.firstMonth; m <= person.lastMonth; m++) {
    if (!seenMonths.has(m)) throw new Error('Form8962 allocation covered person has a missing source month');
  }
  return { taxYear: year, marketplace: text(original.marketplace, 'Marketplace'), policyNumber: text(original.policyNumber, 'policy number'),
    recipientName: name(original.recipientName, 'original recipient name'), recipientSsn: ssn(original.recipientSsn, 'original recipient SSN'),
    coveredIndividuals: covered, monthlyPremiums: rows };
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
  const seenPolicies = new Set<number>(), seenIdentities = new Set<string>(), usedMonths = new Set<number>();
  const months: Form8962AllocationMonth[] = [], periods: Form8962AllocationPeriod[] = [];
  for (const policy of packet.policies) {
    if (!/^form1095A:(0|[1-9]\d*)$/.test(policy.sourceId ?? '')) throw new Error('Form8962 allocation requires the actual original policy index');
    const index = Number(policy.sourceId!.slice('form1095A:'.length));
    const source = input.form1095A[index];
    if (!source || seenPolicies.has(index) || source.sourceFactsComplete !== true || !policy.original) throw new Error('Form8962 allocation original source is missing, incomplete or duplicated');
    seenPolicies.add(index);
    const original = normalizedOriginal(source, year), snapshot = normalizedOriginal(policy.original, year);
    if (JSON.stringify(original) !== JSON.stringify(snapshot)) throw new Error('Form8962 allocation snapshot does not reconcile with the actual original policy');
    const identity = JSON.stringify([original.marketplace, original.policyNumber]);
    if (seenIdentities.has(identity)) throw new Error('Form8962 allocation policy identity is duplicated');
    seenIdentities.add(identity);
    const otherSsn = ssn(policy.otherTaxpayerSsn, 'other taxpayer SSN'), otherName = name(policy.otherTaxpayerName, 'other taxpayer name');
    if (household.has(otherSsn)) throw new Error('Form8962 allocation other taxpayer is in this return household');
    const recipientName = household.get(original.recipientSsn) ?? (original.recipientSsn === otherSsn ? otherName : undefined);
    if (recipientName !== original.recipientName) throw new Error('Form8962 allocation original recipient does not match either actual tax family taxpayer');
    if (policy.situation !== 'other_two_tax_families' || policy.noCurrentYearMarriageOrDivorceConfirmed !== true
      || policy.twoTaxFamiliesConfirmed !== true || policy.allCoveredPeopleAssignedConfirmed !== true) throw new Error('Form8962 allocation requires actual Situation4 and two-family source facts');
    if (policy.originalSlcspCorrectConfirmed !== true) throw new Error('Form8962 allocation requires the actual correct original SLCSP source');
    if (policy.agreementConfirmed !== true) throw new Error('Form8962 allocation requires the actual agreed-percentage method');
    text(policy.agreementReference, 'allocation agreement reference');
    if (sum(...original.monthlyPremiums.map(row => d(row.advancePremiumTaxCredit))).lte(0)) throw new Error('Form8962 no-APTC allocation requires its separate source method');
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
    if (policy.monthlyAllocations?.length !== original.monthlyPremiums.length) throw new Error('Form8962 allocation requires each original month agreement');
    const fractions = new Map<number, Decimal>();
    for (const row of policy.monthlyAllocations) {
      const m = month(row.month);
      if (fractions.has(m) || !original.monthlyPremiums.some(sourceMonth => sourceMonth.month === m)) throw new Error('Form8962 allocation agreement month is duplicated or has no original source');
      if (row.fraction === undefined || !/^(?:0|1|0?\.\d{1,2}|1\.0{1,2})$/.test(row.fraction) || d(row.fraction).lt(0) || d(row.fraction).gt(1)) throw new Error('Form8962 allocation needs an actual agreed fraction from0 through1 with at most two decimal places');
      fractions.set(m, d(row.fraction));
    }
    for (const row of original.monthlyPremiums) {
      if (usedMonths.has(row.month)) throw new Error('Form8962 overlapping-policy allocation requires its actual household benchmark method');
      usedMonths.add(row.month);
      const covered = original.coveredIndividuals.filter(person => person.firstMonth <= row.month && person.lastMonth >= row.month);
      if (!covered.some(person => assignments.get(person.ssn) === 'this_return') || !covered.some(person => assignments.get(person.ssn) === 'other_return')) throw new Error('Form8962 allocation month must have actual enrollees in both tax families');
      const fraction = fractions.get(row.month)!;
      const originalPremium = d(row.enrolleePremium), originalSlcsp = d(row.slcsp), originalAdvance = d(row.advancePremiumTaxCredit);
      months.push({ month: row.month, policyIndex: index, originalPremium, originalSlcsp, originalAdvance,
        premium: originalPremium.times(fraction), slcsp: originalSlcsp.times(fraction), advance: originalAdvance.times(fraction) });
      const last = periods.at(-1);
      if (last?.policyIndex === index && last.lastMonth + 1 === row.month && last.fraction.eq(fraction)) last.lastMonth = row.month;
      else periods.push({ policyIndex: index, firstMonth: row.month, lastMonth: row.month, fraction });
    }
  }
  months.sort((a, b) => a.month - b.month);
  periods.sort((a, b) => a.policyIndex - b.policyIndex || a.firstMonth - b.firstMonth);
  const audit = new AuditTrail();
  for (const [index, period] of periods.entries()) for (const column of ['e', 'f', 'g']) {
    audit.record('Form8962 PartIV', `allocation-${index + 1}${column}`, 'Actual agreed allocation fraction', period.fraction,
      `Situation4 actual original policy${period.policyIndex + 1},months${period.firstMonth}-${period.lastMonth}; same agreed fraction for all three amounts`);
  }
  for (const row of months) {
    audit.record('Form8962 PartIV', `month-${row.month}:premium`, 'Allocated enrollment premiums before form rounding', row.premium, 'Exact original monthly premium times actual agreed fraction');
    audit.record('Form8962 PartIV', `month-${row.month}:slcsp`, 'Allocated SLCSP before form rounding', row.slcsp, 'Exact correct original monthly benchmark times actual agreed fraction');
    audit.record('Form8962 PartIV', `month-${row.month}:advance`, 'Allocated advance credit before form rounding', row.advance, 'Exact original monthly advance credit times actual agreed fraction');
  }
  return { months, periods, lines: audit.getLines() };
}
