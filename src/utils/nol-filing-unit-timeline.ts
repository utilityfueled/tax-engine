/** Validate actual people and filed units before deriving any ownership amount. */
import type { FilingUnitHistory } from '@/models/filing-unit-sources.js';
import type { FilingStatus } from '@/models/constants.js';
interface NolTimelineTaxpayer { taxYear: number; filingStatus: FilingStatus; primary: { firstName: string; lastName: string; ssn: string }; spouse?: { firstName: string; lastName: string; ssn: string } }
type PersonSource = NonNullable<FilingUnitHistory['persons']>[number];
type ReturnSource = NonNullable<FilingUnitHistory['returns']>[number];
interface Person extends PersonSource { sourceId: string; name: string; taxpayerIdLast4: string }
interface FiledReturn extends ReturnSource { sourceId: string; taxYear: number; primaryPersonId: string; members: string[] }
function text(value: string | undefined, label: string): string {
  if (!value?.trim() || value !== value.trim()) throw new Error(`NOL filing history requires unambiguous actual ${label}`);
  return value;
}
function normalizedName(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
export function validateNolFilingUnitTimeline(taxpayer: NolTimelineTaxpayer, timeline: FilingUnitHistory | undefined, actualDeathFacts?: { primaryDeathDate?: string | null; spouseDeathDate?: string | null }) {
  if (!timeline || timeline.sourceFactsConfirmed !== true || timeline.allRelevantReturnsIncluded !== true || timeline.allRelevantCarryoversIncluded !== true
    || !Array.isArray(timeline.persons) || !Array.isArray(timeline.returns)) {
    throw new Error('NOL filing history requires confirmed complete original people and filed returns');
  }
  text(timeline.sourceReference, 'timeline reference');
  const persons = new Map<string, Person>(), identities = new Set<string>();
  for (const source of timeline.persons) {
    const id = text(source.sourceId, 'person identity'), name = text(source.name, 'person name');
    if (!/^\d{4}$/.test(source.taxpayerIdLast4 ?? '')) throw new Error('NOL filing history requires actual identity suffixes');
    const key = `${normalizedName(name)}:${source.taxpayerIdLast4}`;
    if (persons.has(id) || identities.has(key)) throw new Error('Duplicate NOL filing person or original identity');
    if (source.deathStatus === 'alive_through_return_year') {
      if (source.deathYear !== undefined) throw new Error('NOL filing death facts conflict with the actual alive status');
    } else if (source.deathStatus !== 'deceased' || !Number.isInteger(source.deathYear)
      || source.deathYear === undefined || source.deathYear < 1900 || source.deathYear > taxpayer.taxYear) {
      throw new Error('NOL filing history requires actual death status and applicable year');
    }
    persons.set(id, { ...source, sourceId: id, name, taxpayerIdLast4: source.taxpayerIdLast4! }); identities.add(key);
  }
  const returns = new Map<string, FiledReturn>(), byPersonYear = new Map<string, FiledReturn>();
  for (const source of timeline.returns) {
    const id = text(source.sourceId, 'return identity'), primary = text(source.primaryPersonId, 'return primary person');
    text(source.sourceReference, 'filed return reference');
    if (returns.has(id) || !Number.isInteger(source.taxYear) || source.taxYear === undefined || source.taxYear < 1900 || source.taxYear > taxpayer.taxYear
      || !['single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_surviving_spouse'].includes(source.filingStatus ?? '')) {
      throw new Error('NOL filing history requires unique actual returns, years and filing statuses');
    }
    const members = [primary];
    if (source.filingStatus === 'married_filing_jointly') members.push(text(source.spousePersonId, 'joint return spouse'));
    else if (source.spousePersonId !== undefined) throw new Error('NOL separate return cannot include another filing-unit owner');
    if (new Set(members).size !== members.length) throw new Error('NOL joint return requires two distinct actual people');
    const unit = { ...source, sourceId: id, taxYear: source.taxYear, primaryPersonId: primary, members };
    for (const personId of members) {
      const person = persons.get(personId), key = `${personId}:${source.taxYear}`;
      if (!person || byPersonYear.has(key)) throw new Error('NOL filing history person has missing or duplicate same-year returns');
      if (person.deathYear !== undefined && (source.taxYear > person.deathYear
        || source.taxYear === person.deathYear && members.length === 1 && source.finalReturnForDeceased !== true)) {
        throw new Error('NOL deceased-owner use requires the actual death-year joint or final separate return');
      }
      if (source.finalReturnForDeceased === true && (members.length !== 1 || person.deathYear !== source.taxYear)) {
        throw new Error('NOL final-return assertion conflicts with actual death facts');
      }
      byPersonYear.set(key, unit);
    }
    returns.set(id, unit);
  }
  const current = returns.get(text(timeline.currentReturnSourceId, 'current return identity'));
  const matches = (personId: string | undefined, actual: typeof taxpayer.primary | undefined): boolean => {
    const person = personId ? persons.get(personId) : undefined, ssn = actual?.ssn.replaceAll('-', '');
    return !!person && !!actual && /^\d{9}$/.test(ssn ?? '') && ssn!.slice(-4) === person.taxpayerIdLast4
      && normalizedName(`${actual.firstName} ${actual.lastName}`) === normalizedName(person.name);
  };
  if (!current || current.taxYear !== taxpayer.taxYear || current.filingStatus !== taxpayer.filingStatus
    || !matches(current.primaryPersonId, taxpayer.primary)
    || current.members.length === 2 && !matches(current.spousePersonId, taxpayer.spouse)) {
    throw new Error('NOL filing history current unit and identities must match the actual return');
  }
  for (const [personId, actualDate] of [[current.primaryPersonId, actualDeathFacts?.primaryDeathDate],
    [current.spousePersonId, actualDeathFacts?.spouseDeathDate]] as const) {
    if (!personId || actualDate === undefined) continue;
    const person = persons.get(personId)!;
    if (actualDate === null) {
      if (person.deathStatus !== 'alive_through_return_year') throw new Error('NOL death timeline conflicts with actual current-owner death facts');
    } else {
      const parsed = new Date(`${actualDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(actualDate) || !Number.isFinite(parsed.getTime())
        || parsed.toISOString().slice(0, 10) !== actualDate || person.deathStatus !== 'deceased'
        || person.deathYear !== Number(actualDate.slice(0, 4))) {
        throw new Error('NOL death timeline conflicts with the actual current-owner death date');
      }
    }
  }
  return { persons, returns, byPersonYear, current };
}

/** Monetary histories are independent, but a person's actual filed unit and
 * death status cannot change between regular and AMT records. */
export function assertNolFilingUnitAgreement(taxpayer: NolTimelineTaxpayer, regular: FilingUnitHistory | undefined,
  alternative: FilingUnitHistory | undefined, actualDeathFacts?: { primaryDeathDate?: string | null; spouseDeathDate?: string | null }): void {
  const a = validateNolFilingUnitTimeline(taxpayer, regular, actualDeathFacts);
  const b = validateNolFilingUnitTimeline(taxpayer, alternative, actualDeathFacts);
  const identity = (person: Person) => `${normalizedName(person.name)}:${person.taxpayerIdLast4}`;
  const personFacts = new Map([...a.persons.values()].map(person => [identity(person), person]));
  for (const person of b.persons.values()) {
    const same = personFacts.get(identity(person));
    if (same && (same.deathStatus !== person.deathStatus || same.deathYear !== person.deathYear)) {
      throw new Error('Independent NOL histories contain conflicting actual owner death facts');
    }
  }
  const units = new Map<string, string>();
  for (const unit of a.returns.values()) {
    const members = unit.members.map(id => identity(a.persons.get(id)!)).sort();
    const value = JSON.stringify([unit.filingStatus, members, unit.finalReturnForDeceased === true]);
    for (const member of members) units.set(`${member}:${unit.taxYear}`, value);
  }
  for (const unit of b.returns.values()) {
    const members = unit.members.map(id => identity(b.persons.get(id)!)).sort();
    const value = JSON.stringify([unit.filingStatus, members, unit.finalReturnForDeceased === true]);
    for (const member of members) {
      const same = units.get(`${member}:${unit.taxYear}`);
      if (same !== undefined && same !== value) throw new Error('Independent NOL histories contain conflicting actual filing units');
    }
  }
}
