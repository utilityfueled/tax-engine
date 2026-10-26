/** Actual marriage and policy evidence. Spec: form-8962-marriage-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';
import type { Form8962MarriageWorksheetInput } from './form-8962-marriage-worksheets.js';

type Person = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
type Owner = 'primary' | 'spouse';
type Packet = NonNullable<NonNullable<TaxYearInput['form8962']>['marriageSources']>;
type Original = NonNullable<NonNullable<Packet['policies']>[number]['original']>;
/** Facts-only consumers need no invented income, tax or unrelated return data. */
export type Form8962MarriageSourceInput = Pick<TaxYearInput, 'form1095A' | 'form8962'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus'> & {primary: Person; spouse?: Person; dependents: Person[]};
  standardDeductionFacts?: Pick<NonNullable<TaxYearInput['standardDeductionFacts']>, 'primaryCanBeClaimedAsDependent' | 'spouseCanBeClaimedAsDependent'>;
};
export interface Form8962MarriageSourceResult extends Pick<Form8962MarriageWorksheetInput, 'familySize' | 'marriageMonth' | 'lastPreMarriageMonth' | 'families' | 'months'> {
  lines: CalculatedLine[];
}
function text(value: string | undefined, label: string): string {
  if (!value?.trim()) throw new Error(`Marriage sources require actual ${label}`);
  return value.trim().replace(/\s+/g, ' ');
}
function name(value: string | undefined): string { return text(value, 'name').toLocaleLowerCase('en-US'); }
function identity(value: string | undefined): string {
  const id = text(value, 'complete person identifier').replaceAll('-', '');
  if (!/^\d{9}$/.test(id)) throw new Error('Marriage sources require actual complete person identities');
  return id;
}
function month(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 1 || value > 12) throw new Error('Marriage sources require actual months 1 through 12');
  return value;
}
function money(value: string | null | undefined): Decimal {
  if (value == null || !/^\d+(?:\.\d+)?$/.test(value)) throw new Error('Marriage source amount is unknown or invalid');
  const amount = d(value);
  if (!amount.isFinite()) throw new Error('Marriage source amount must be finite');
  return amount;
}
function original(source: Original | TaxYearInput['form1095A'][number], year: number) {
  if (source.taxYear !== year) throw new Error('Marriage original policy year does not reconcile');
  if (!source.coveredIndividuals?.length || !source.monthlyPremiums?.length) throw new Error('Marriage requires all original covered people and months');
  const seenPeople = new Set<string>(), seenMonths = new Set<number>();
  const people = source.coveredIndividuals.map(person => {
    const id = identity(person.ssn), first = month(person.firstMonth), last = month(person.lastMonth);
    if (seenPeople.has(id) || first > last) throw new Error('Marriage original coverage periods or people conflict');
    seenPeople.add(id);
    return {id, name: name(person.name), first, last};
  }).sort((a,b) => a.id.localeCompare(b.id));
  const months = source.monthlyPremiums.map(row => {
    const m = month(row.month);
    if (seenMonths.has(m)) throw new Error('Marriage original policy month is duplicated');
    seenMonths.add(m);
    return {month: m, premium: money(row.enrolleePremium).toFixed(), slcsp: money(row.slcsp).toFixed(), advance: money(row.advancePremiumTaxCredit).toFixed()};
  }).sort((a,b) => a.month - b.month);
  for (const person of people) for (let m = person.first; m <= person.last; m++) {
    if (!seenMonths.has(m)) throw new Error('Marriage original covered person has an unknown source month');
  }
  return {taxYear: year, marketplace: text(source.marketplace, 'Marketplace'), policyNumber: text(source.policyNumber, 'policy number'),
    recipientName: name(source.recipientName), recipientId: identity(source.recipientSsn), people, months};
}

/** Bind originals and derive groups without accepting a calculated-income override. */
export function calculateForm8962MarriageSources(input: Form8962MarriageSourceInput): Form8962MarriageSourceResult {
  const {taxpayer} = input, year = taxpayer.taxYear, facts = input.form8962, packet = facts?.marriageSources;
  const spouse = taxpayer.spouse;
  if (![2025,2026].includes(year) || taxpayer.filingStatus !== 'married_filing_jointly' || !spouse || !packet || facts?.alternativeMarriageCalculationElected !== true) throw new Error('Marriage sources require the actual joint election and both spouses');
  if (packet.sourceTaxYear !== year || packet.sourceFactsConfirmed !== true || packet.allPoliciesIncluded !== true
    || packet.allDependentAssignmentsIncluded !== true || facts.householdFactsConfirmed !== true || facts.coverageFactsConfirmed !== true) throw new Error('Marriage household, coverage and complete original sources must be confirmed');
  text(packet.sourceReference, 'marriage worksheet reference');
  if (input.standardDeductionFacts?.primaryCanBeClaimedAsDependent !== false || input.standardDeductionFacts.spouseCanBeClaimedAsDependent !== false || facts.canBeClaimedAsDependent !== false) throw new Error('Marriage sources require both actual unclaimable filer facts');
  if (facts.allocationRequired !== false || facts.sharedPolicyAllocations !== undefined || facts.selfEmployedHealthInsuranceCoordinationRequired !== false
    || facts.qsehraAffected !== false || facts.lawfulPresenceReconciliationRequired !== false || facts.belowPovertyException !== 'none') throw new Error('Marriage allocation, health, QSEHRA or special eligibility requires its separate source method');
  if (packet.primaryUnmarriedOnJanuary1 !== true || packet.spouseUnmarriedOnJanuary1 !== true || packet.marriedToEachOtherOnDecember31 !== true) throw new Error('Marriage requires actual January unmarried and December joint-spouse facts');
  const date = text(packet.marriageDate, 'marriage date'), parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== date || parsed.getUTCFullYear() !== year) throw new Error('Marriage date must be an actual date in the return year');
  const marriageMonth = parsed.getUTCMonth() + 1;
  const lastPreMarriageMonth = marriageMonth - (parsed.getUTCDate() === 1 ? 1 : 0);
  if (lastPreMarriageMonth === 0) throw new Error('Marriage on January 1 is not eligible for the alternative marriage calculation');
  const primaryId = identity(taxpayer.primary.ssn), spouseId = identity(spouse.ssn);
  if (primaryId === spouseId || primaryId !== identity(packet.primarySsn) || spouseId !== identity(packet.spouseSsn)
    || name(packet.primaryName) !== name(`${taxpayer.primary.firstName} ${taxpayer.primary.lastName}`)
    || name(packet.spouseName) !== name(`${spouse.firstName} ${spouse.lastName}`)) throw new Error('Marriage spouse identities do not match the actual return');
  const household = new Map<string,string>([[primaryId,name(packet.primaryName)],[spouseId,name(packet.spouseName)]]);
  const members = {primary: new Set([primaryId]), spouse: new Set([spouseId])};
  if (!Array.isArray(packet.dependents) || packet.dependents.length !== taxpayer.dependents.length) throw new Error('Marriage requires every actual dependent assignment');
  const assigned = new Set<string>();
  for (const person of taxpayer.dependents) {
    const id = identity(person.ssn), actualName = name(`${person.firstName} ${person.lastName}`);
    if (household.has(id)) throw new Error('Marriage household contains a duplicate person identity');
    const rows = packet.dependents.filter(row => identity(row.ssn) === id), row = rows[0];
    if (rows.length !== 1 || !row || name(row.name) !== actualName || assigned.has(id)
      || typeof row.qualifiesForPrimary !== 'boolean' || typeof row.qualifiesForSpouse !== 'boolean'
      || !row.alternativeFamilyOwner || (row.alternativeFamilyOwner === 'primary' ? !row.qualifiesForPrimary : !row.qualifiesForSpouse)) throw new Error('Marriage dependent identity and actual separate qualifications must reconcile');
    text(row.sourceReference, 'dependent qualification source');
    assigned.add(id); household.set(id,actualName); members[row.alternativeFamilyOwner].add(id);
  }
  const familySize = household.size;
  if (facts.taxFamilySize !== familySize) throw new Error('Marriage joint tax family must match the actual claimed people');
  if (!packet.policies?.length || packet.policies.length !== input.form1095A.length) throw new Error('Marriage requires all original Marketplace policies');
  const coverage = new Map<string,Set<number>>([...household.keys()].map(id => [id,new Set<number>()]));
  const seenPolicies = new Set<number>(), policyIdentities = new Set<string>();
  const recipientCoverage = new Map<string,Owner>();
  const joint = new Map<number,{premium: Decimal; advance: Decimal; people: Set<string>}>();
  const groups: Record<Owner,Map<number,{premium: Decimal; people: Set<string>}>> = {primary:new Map(),spouse:new Map()};
  for (const row of packet.policies) {
    const match = /^form1095A:(0|[1-9]\d*)$/.exec(row.sourceId ?? ''), index = match ? Number(match[1]) : -1;
    const actual = input.form1095A[index];
    if (!actual || seenPolicies.has(index) || actual.sourceFactsComplete !== true || !row.original) throw new Error('Marriage original policy index, completeness or duplicate source conflicts');
    seenPolicies.add(index); text(row.sourceReference, 'original policy reference');
    if (row.fullMonthCoverageConfirmed !== true || row.allCoveredIndividualsEligibleForPtcConfirmed !== true) throw new Error('Marriage requires actual full-month eligible coverage evidence');
    const source = original(actual,year);
    if (JSON.stringify(source) !== JSON.stringify(original(row.original,year))) throw new Error('Marriage original policy snapshot is stale or conflicting');
    const policyKey = `${source.marketplace}\u0000${source.policyNumber}`;
    if (policyIdentities.has(policyKey)) throw new Error('Marriage duplicate actual policy statements require reconciliation');
    policyIdentities.add(policyKey);
    const owner: Owner | undefined = source.recipientId === primaryId ? 'primary' : source.recipientId === spouseId ? 'spouse' : undefined;
    if (!owner || source.recipientName !== household.get(source.recipientId)) throw new Error('Marriage policy requires an actual filer recipient');
    for (const person of source.people) {
      const actualCoverage = coverage.get(person.id);
      if (!actualCoverage || household.get(person.id) !== person.name) throw new Error('Marriage policy covered person is not the actual household member');
      for (let m = person.first; m <= person.last; m++) {
        const key = `${person.id}:${m}`, other = recipientCoverage.get(key);
        if (other && other !== owner) throw new Error('Marriage duplicate coverage across filer policy groups needs separate source reconciliation');
        recipientCoverage.set(key,owner); actualCoverage.add(m);
      }
    }
    for (const m of source.months) {
      const covered = source.people.filter(person => person.first <= m.month && person.last >= m.month);
      if (!covered.length && [m.premium,m.slcsp,m.advance].some(value => d(value).gt(0))) throw new Error('Marriage positive original amounts have no actual covered people');
      const combined = joint.get(m.month) ?? {premium:d(0),advance:d(0),people:new Set<string>()};
      combined.premium = combined.premium.plus(m.premium); combined.advance = combined.advance.plus(m.advance);
      for (const person of covered) combined.people.add(person.id);
      joint.set(m.month,combined);
      if (m.month <= lastPreMarriageMonth) {
        const group = groups[owner].get(m.month) ?? {premium:d(0),people:new Set<string>()};
        group.premium = group.premium.plus(m.premium);
        for (const person of covered) group.people.add(person.id);
        groups[owner].set(m.month,group);
      }
    }
  }
  const reconciled = facts.monthlyReconciliation;
  if (!reconciled || reconciled.length !== joint.size || new Set(reconciled.map(row => row.month)).size !== reconciled.length) throw new Error('Marriage requires complete actual joint monthly reconciliation');
  const audit = new AuditTrail();
  audit.record('Form8962 marriage sources','last-premarriage-month','Last month before the first full married month',d(String(lastPreMarriageMonth)),
    'Actual wedding month minus one for a day1 wedding; otherwise actual wedding month');
  const months = reconciled.map(row => {
    const m = month(row.month), actual = joint.get(m);
    if (!actual || !actual.premium.eq(money(row.enrolleePremium)) || !actual.advance.eq(money(row.advancePremiumTaxCredit))) throw new Error('Marriage joint monthly premium and advances must match exact original sources');
    const eligible = actual.people.size > 0, slcsp = money(row.slcsp);
    if (row.coverageEligible !== eligible || row.incomeBasedSepEnrollment !== false || row.qsehraAffordable === true
      || (row.qsehraMonthlyPermittedBenefit !== undefined && !money(row.qsehraMonthlyPermittedBenefit).isZero()) || (!eligible && !slcsp.isZero())) throw new Error('Marriage joint monthly eligibility or special enrollment evidence is incomplete or conflicting');
    audit.record('Form8962 marriage sources',`joint-${m}`,'Actual joint monthly enrollment premiums',actual.premium,'Sum original policy premiums; retain exact cents',{'Advance payments':actual.advance,'Corrected joint benchmark':slcsp});
    return {month:m,premium:actual.premium,advance:actual.advance,slcsp,coverageEligible:eligible};
  }).sort((a,b) => a.month-b.month);
  if (!Array.isArray(packet.benchmarks)) throw new Error('Marriage requires actual alternative benchmark source records');
  const benchmarks = packet.benchmarks;
  const usedBenchmarks = new Set<number>();
  const families = (['primary','spouse'] as const).map(owner => {
    const covered = [...members[owner]].flatMap(id => [...(coverage.get(id) ?? [])]).filter(m => m <= lastPreMarriageMonth);
    const first = covered.length ? Math.min(...covered) : undefined, last = covered.length ? Math.max(...covered) : undefined;
    const rows: Form8962MarriageWorksheetInput['families'][number]['months'] = [];
    if (first !== undefined && last !== undefined) for (let m = first; m <= last; m++) {
      if (!joint.has(m)) throw new Error('Marriage alternative coverage interval needs its actual intervening zero-month sources');
      const group = groups[owner].get(m) ?? {premium:d(0),people:new Set<string>()};
      const matches = benchmarks.map((row,index) => ({row,index})).filter(({row}) => row.owner === owner && row.month === m), entry = matches[0];
      if (matches.length !== 1 || !entry || entry.row.sourceFactsConfirmed !== true || !Array.isArray(entry.row.coveredIndividualSsns)) throw new Error('Marriage requires one confirmed complete alternative benchmark group per month');
      text(entry.row.sourceReference,'alternative benchmark reference');
      const ids = entry.row.coveredIndividualSsns.map(identity).sort(), expected = [...group.people].sort();
      if (new Set(ids).size !== ids.length || JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error('Marriage alternative benchmark covered people do not match actual recipient policies');
      const slcsp = money(entry.row.slcsp);
      if (!ids.length && !slcsp.isZero()) throw new Error('Marriage empty alternative coverage group requires actual zero benchmark');
      usedBenchmarks.add(entry.index);
      rows.push({month:m,premium:group.premium,slcsp,coverageEligible:ids.length>0});
      audit.record('Form8962 marriage sources',`${owner}-${m}`,'Actual alternative monthly enrollment premiums',group.premium,'Group original policies by their actual filer recipient',{'Corrected alternative benchmark':slcsp});
    }
    for (const [m,group] of groups[owner]) if (group.premium.gt(0) && (first === undefined || last === undefined || m < first || m > last)) throw new Error('Marriage recipient premiums outside the actual alternative-family interval need a separate source method');
    return {owner,familySize:members[owner].size,months:rows};
  });
  if (usedBenchmarks.size !== benchmarks.length) throw new Error('Marriage alternative benchmark source month or owner is unmatched');
  const intervals = new Set(families.flatMap(family => family.months.map(row => row.month)));
  return {marriageMonth,lastPreMarriageMonth,familySize,families,months:months.filter(row => row.coverageEligible || intervals.has(row.month)),lines:audit.getLines()};
}
