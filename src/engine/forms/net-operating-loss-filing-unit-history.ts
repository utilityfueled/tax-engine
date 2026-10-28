/** Filed ownership records under Reg1.172-7(d)-(e). No current deduction inputs.
 * Spec: net-operating-loss-filing-unit-history.yaml.
 */
import Decimal from 'decimal.js';
import type { FilingStatus } from '@/models/constants.js';
import type { NetOperatingLossSources } from './net-operating-loss.js';
import { validateNolFilingUnitTimeline } from '@/utils/nol-filing-unit-timeline.js';
import { AuditTrail } from '@/utils/audit.js';

function required(value: string | undefined, label: string): string {
  if (!value?.trim() || value !== value.trim()) throw new Error(`NOL filing history requires actual ${label}`);
  return value;
}
interface JointOwner { sourceId: string; ownerPersonId: string; originalReturnSourceId: string }
function firstRelevantYear(row: NonNullable<NetOperatingLossSources['vintages']>[number]): number {
  const year = row.lossTaxYear!;
  return row.carrybackTreatment === 'completed' ? year - (year >= 2018 && year <= 2020 ? 5 : 2) : year;
}
function validateSameCouple(facts: NetOperatingLossSources, timeline: ReturnType<typeof validateNolFilingUnitTimeline>, taxYear: number): void {
  const proof = facts.sameCoupleJointHistory;
  if (!proof || proof.sourceFactsConfirmed !== true || proof.allRelevantYearsIncluded !== true || !Array.isArray(proof.years)) {
    throw new Error('NOL changed membership on a current joint return requires complete actual same-couple marital-year history');
  }
  required(proof.sourceReference, 'same-couple history reference');
  const pair = timeline.current.members;
  if (pair.length !== 2) throw new Error('NOL current joint same-couple pooling requires two actual joint owners');
  const years = new Set<number>();
  for (const record of proof.years) {
    const year = record.taxYear;
    required(record.sourceReference, 'marital-year reference');
    if (!Number.isInteger(year) || year === undefined || year < 1900 || year > taxYear || years.has(year)
      || record.marriedToEachOther !== true || record.firstPersonId === record.secondPersonId
      || !pair.includes(record.firstPersonId ?? '') || !pair.includes(record.secondPersonId ?? '')) {
      throw new Error('NOL same-couple marital years require the actual same pair, distinct years and affirmative married-to-each-other facts');
    }
    years.add(year);
    for (const owner of pair) {
      const unit = timeline.byPersonYear.get(`${owner}:${year}`);
      if (!unit || !['married_filing_jointly', 'married_filing_separately'].includes(unit.filingStatus!)
        || unit.members.some(id => !pair.includes(id))) {
        throw new Error('NOL same-couple history conflicts with the actual filed owners or marital-year filing status');
      }
    }
  }
  const start = Math.min(taxYear, ...(facts.vintages ?? []).map(firstRelevantYear));
  if (!Number.isInteger(start) || start < 1900) throw new Error('NOL same-couple history requires each actual original loss year');
  for (let year = start; year <= taxYear; year++) {
    if (!years.has(year)) throw new Error('NOL same-couple history requires every relevant actual marital year, including the current joint year');
  }
}
export function calculateNolFilingUnitHistory(input: {
  taxYear: number; filingStatus: FilingStatus;
  taxpayer: { taxYear: number; filingStatus: FilingStatus; primary: { firstName: string; lastName: string; ssn: string }; spouse?: { firstName: string; lastName: string; ssn: string } };
  standardDeductionFacts?: { primaryDeathDate?: string | null; spouseDeathDate?: string | null };
  facts: NetOperatingLossSources;
}): { lines: ReturnType<AuditTrail['getLines']>; jointOwners?: JointOwner[] } {
  const { facts, taxYear } = input, audit = new AuditTrail();
  const attached = facts.filingUnitHistory !== undefined || facts.sameCoupleJointHistory !== undefined || facts.vintages?.some(row => row.filingUnitOrigin !== undefined
    || row.history?.some(year => year.filingUnitUses !== undefined));
  if (facts.returnMembership !== 'changed_membership') {
    if (attached) throw new Error('NOL filing history cannot be hidden under an unchanged-membership confirmation');
    return { lines: audit.getLines() };
  }
  if (facts.membershipUnchangedConfirmed !== false || !Array.isArray(facts.vintages)) {
    throw new Error('NOL changed membership requires an actual false unchanged answer and complete original vintages');
  }
  if (input.filingStatus === 'married_filing_jointly' && facts.sameCoupleJointHistory === undefined) {
    throw new Error('NOL changed membership on a current joint return requires complete actual same-couple marital-year history');
  }
  const timeline = validateNolFilingUnitTimeline(input.taxpayer, facts.filingUnitHistory, input.standardDeductionFacts);
  const joint = input.filingStatus === 'married_filing_jointly';
  if (joint) validateSameCouple(facts, timeline, taxYear);
  else if (facts.sameCoupleJointHistory !== undefined) throw new Error('NOL current separate return cannot hide a current joint-pooling source attachment');
  const jointOwners: JointOwner[] = [], ownerYears = new Set<string>(), sourceIds = new Set<string>();
  const sharedOriginals = new Map<string, { value: string; owners: Set<string>; expected: string[] }>();
  audit.record('Section172 Filing Unit History', 'timeline', 'Actual filing-unit source history verified', new Decimal(0),
    'Complete original identity and filed-unit evidence, independent of any current deduction', { 'Current year': String(taxYear) });
  // Products and owner sums are exact at the precision of every supplied filed
  // integer. This does not invent a whole-dollar residual allocation.
  const precision = Math.max(80, JSON.stringify(facts.vintages).length * 2);
  const Exact = Decimal.clone({ precision });
  const amount = (value: string | undefined, label: string): Decimal => {
    if (value === undefined || !/^\d+$/.test(value)) throw new Error(`NOL filing history requires actual filed whole-dollar ${label}`);
    const parsed = new Exact(value);
    if (!parsed.isFinite()) throw new Error(`NOL filing history requires finite ${label}`);
    return parsed;
  };
  const money = (value: Decimal) => new Decimal(value.toFixed());
  for (const [index, row] of facts.vintages.entries()) {
    const origin = row.filingUnitOrigin;
    if (!origin || !Array.isArray(origin.separateComputations) || !Array.isArray(row.history)
      || !Number.isInteger(row.lossTaxYear) || row.lossTaxYear === undefined || row.lossTaxYear >= taxYear) {
      throw new Error('NOL filing history requires each original return, separate computations and intervening records');
    }
    const currentOwner = joint ? required(origin.ownerPersonId, 'original current-joint owner') : timeline.current.primaryPersonId;
    if (!timeline.current.members.includes(currentOwner) || !joint && origin.ownerPersonId !== undefined && origin.ownerPersonId !== currentOwner) {
      throw new Error('NOL original owner must match an actual current filing-unit member');
    }
    if (joint) {
      const sourceId = required(row.sourceId, 'original carry source identity'), ownerYear = `${currentOwner}:${row.lossTaxYear}`;
      if (sourceIds.has(sourceId) || ownerYears.has(ownerYear)) throw new Error('NOL current joint pool has duplicate original source identity or same-owner loss year');
      sourceIds.add(sourceId); ownerYears.add(ownerYear);
      jointOwners.push({ sourceId, ownerPersonId: currentOwner, originalReturnSourceId: required(origin.returnSourceId, 'origin return identity') });
    }
    const originUnit = timeline.returns.get(required(origin.returnSourceId, 'origin return identity'));
    if (!originUnit || originUnit.taxYear !== row.lossTaxYear || !originUnit.members.includes(currentOwner)) {
      throw new Error('NOL original owner must belong to the actual originating return; another spouse loss is not inherited');
    }
    const originalTotal = amount(origin.originalReturnLoss, 'original return loss');
    if (!originalTotal.gt(0)) throw new Error('NOL filing history requires a positive actual original return loss');
    const separate = new Map<string, Decimal>();
    for (const source of origin.separateComputations) {
      const owner = required(source.personId, 'original owner identity');
      required(source.sourceReference, 'separate original computation reference');
      if (separate.has(owner) || !originUnit.members.includes(owner)) throw new Error('NOL original separate computations contain a duplicate or unrelated owner');
      separate.set(owner, amount(source.netOperatingLoss, 'separately computed original loss'));
    }
    if (separate.size !== originUnit.members.length) throw new Error('NOL original allocation requires both actual separate computations, including zero');
    const totalSeparate = [...separate.values()].reduce((a, b) => a.plus(b), new Exact(0));
    if (!totalSeparate.gt(0) || originUnit.members.length === 1 && !totalSeparate.eq(originalTotal)) {
      throw new Error('NOL original separate computation must reconcile the actual original allocation');
    }
    const originalOwner = amount(row.originalLoss, 'original owner allocation');
    if (!originalOwner.times(totalSeparate).eq(originalTotal.times(separate.get(currentOwner)!))) {
      throw new Error('NOL exact original owner allocation must reconcile the filed allocation without an invented precision residual');
    }
    const balances = new Map<string, Decimal>();
    for (const owner of originUnit.members) {
      // With a two-person original, the other balance is the exact remainder;
      // the preceding cross-product proves it follows the same allocation.
      balances.set(owner, owner === currentOwner ? originalOwner : originalTotal.minus(originalOwner));
    }
    const history = new Map<number, NonNullable<typeof row.history>[number]>();
    for (const year of row.history) {
      if (!Number.isInteger(year.taxYear) || year.taxYear === undefined || year.taxYear >= taxYear
        || history.has(year.taxYear) || !Array.isArray(year.filingUnitUses)) {
        throw new Error('NOL filing history requires distinct earlier years and actual annual owner worksheets');
      }
      history.set(year.taxYear, year);
    }
    const firstYear = firstRelevantYear(row);
    if (joint && originUnit.members.length === 2) {
      // Both incoming owner records refer to the same filed original and later
      // allocation worksheets. Their owner summaries differ; the filed totals
      // and each owner's actual uses cannot differ between the two copies.
      const filed = JSON.stringify({ original: originalTotal.toFixed(),
        separate: [...separate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([owner, value]) => [owner, value.toFixed()]),
        carryback: [row.carrybackTreatment, row.ordinaryHistoricalCarrybackConfirmed],
        periods: [...history.entries()].sort(([a], [b]) => a - b).map(([year, record]) => [year,
          record.filingUnitUses!.map(use => ({ id: use.returnSourceId,
            claimed: amount(use.claimedDeduction, 'historical return deduction').toFixed(),
            absorbed: amount(use.modifiedAbsorption, 'historical return absorption').toFixed(),
            attributes: amount(use.attributeReduction, 'historical return attribute reduction').toFixed(),
            owners: (use.owners ?? []).map(owner => [owner.personId, amount(owner.claimedDeduction, 'historical owner deduction').toFixed(),
              amount(owner.modifiedAbsorption, 'historical owner absorption').toFixed(), amount(owner.attributeReduction, 'historical owner attribute reduction').toFixed()])
              .sort(([a], [b]) => String(a).localeCompare(String(b))),
          })).sort((a, b) => String(a.id).localeCompare(String(b.id)))]) });
      const shared = sharedOriginals.get(originUnit.sourceId);
      if (shared && shared.value !== filed) throw new Error('NOL same original joint return contains conflicting filed owner histories');
      if (shared) shared.owners.add(currentOwner);
      else sharedOriginals.set(originUnit.sourceId, { value: filed, owners: new Set([currentOwner]), expected: originUnit.members });
    }
    // Trace only owners whose filed balances can feed this return. A former
    // owner's later unrelated return is not presumed to exist or to have no use.
    const needed = new Set([currentOwner]);
    for (let year = taxYear - 1; year >= firstYear; year--) {
      if (year === row.lossTaxYear && !history.has(year)) continue;
      const sourceYear = history.get(year);
      if (!sourceYear) throw new Error('NOL filing history requires each relevant filed year, including explicit zero use');
      const units = new Map<string, NonNullable<typeof sourceYear.filingUnitUses>[number]>();
      for (const use of sourceYear.filingUnitUses!) {
        const id = required(use.returnSourceId, 'historical return identity'), unit = timeline.returns.get(id);
        if (!unit || unit.taxYear !== year || units.has(id) || !unit.members.some(owner => separate.has(owner))) {
          throw new Error('NOL historical owner worksheet must identify one actual relevant return in its year');
        }
        units.set(id, use);
        for (const owner of unit.members) if (separate.has(owner)) needed.add(owner);
      }
      for (const owner of needed) {
        const person = timeline.persons.get(owner)!;
        if (person.deathYear !== undefined && year > person.deathYear) continue;
        const unit = timeline.byPersonYear.get(`${owner}:${year}`);
        if (!unit || !units.has(unit.sourceId)) throw new Error('NOL filing history is missing an owner return or its actual allocation worksheet');
        for (const member of unit.members) if (separate.has(member)) needed.add(member);
      }
    }
    const periods = [...history.entries()].sort(([a], [b]) => a - b);
    for (const [year, sourceYear] of periods) {
      if (year < firstYear || year < row.lossTaxYear && row.carrybackTreatment !== 'completed') {
        throw new Error('NOL historical owner use is outside the actual supported carry period');
      }
      let currentAbsorption = new Exact(0), currentAttribute = new Exact(0), currentClaim = new Exact(0);
      const seenOwners = new Set<string>();
      for (const use of sourceYear.filingUnitUses!) {
        const unit = timeline.returns.get(required(use.returnSourceId, 'historical return identity'));
        if (!unit || unit.taxYear !== year || use.sourceFactsConfirmed !== true || use.allOriginOwnersIncluded !== true
          || use.allOtherNolSourcesIncluded !== true || !Array.isArray(use.owners)) {
          throw new Error('NOL historical owner allocation requires complete confirmed original filed worksheets');
        }
        required(use.sourceReference, 'historical allocation reference');
        const expectedOwners = unit.members.filter(owner => separate.has(owner));
        let claimed = new Exact(0), absorbed = new Exact(0), attributes = new Exact(0);
        const unitOwners = new Set<string>();
        for (const ownerSource of use.owners) {
          const owner = required(ownerSource.personId, 'historical owner identity');
          if (!expectedOwners.includes(owner) || unitOwners.has(owner) || seenOwners.has(owner)) {
            throw new Error('NOL historical allocation has duplicate or unrelated actual owners');
          }
          unitOwners.add(owner); seenOwners.add(owner);
          const deduction = amount(ownerSource.claimedDeduction, 'historical owner deduction');
          const absorption = amount(ownerSource.modifiedAbsorption, 'historical owner modified absorption');
          const reduction = amount(ownerSource.attributeReduction, 'historical owner attribute reduction');
          const opening = balances.get(owner)!;
          if (deduction.gt(opening) || absorption.plus(reduction).gt(opening)
            || year === row.lossTaxYear && (!deduction.isZero() || !absorption.isZero())
            || year < row.lossTaxYear && !reduction.isZero()) {
            throw new Error('NOL historical owner deduction, absorption and attribute reduction must conserve their original source');
          }
          balances.set(owner, opening.minus(absorption).minus(reduction));
          claimed = claimed.plus(deduction); absorbed = absorbed.plus(absorption); attributes = attributes.plus(reduction);
          if (owner === currentOwner) {
            currentClaim = currentClaim.plus(deduction); currentAbsorption = currentAbsorption.plus(absorption); currentAttribute = currentAttribute.plus(reduction);
          }
        }
        if (unitOwners.size !== expectedOwners.length || !claimed.eq(amount(use.claimedDeduction, 'historical return deduction'))
          || !absorbed.eq(amount(use.modifiedAbsorption, 'historical return modified absorption'))
          || !attributes.eq(amount(use.attributeReduction, 'historical return attribute reduction'))) {
          throw new Error('NOL historical owner amounts must reconcile each actual return allocation total');
        }
      }
      if (!seenOwners.has(currentOwner) || !currentAbsorption.eq(amount(sourceYear.nolUsed, 'owner historical absorption summary'))
        || !currentAttribute.eq(amount(sourceYear.attributeReduction, 'owner historical attribute summary'))) {
        throw new Error('NOL owner history summary must reconcile actual modified absorption and attribute reductions');
      }
      audit.record('Section172 Filing Unit History', `${index + 1}:${year}`, 'Filed current-owner historical absorption', money(currentAbsorption),
        'Actual filed owner allocation, separately retaining historical tax claim and attribute reductions',
        { 'Loss year': String(row.lossTaxYear), 'Filed year': String(year), 'Historical deduction': money(currentClaim),
          'Attribute reduction': money(currentAttribute), 'Owner remaining after year': money(balances.get(currentOwner)!) });
    }
    if (!balances.get(currentOwner)!.eq(amount(row.openingCarryforward, 'current owner opening carry'))) {
      throw new Error('NOL actual owner opening carry must reconcile original allocation and each filed historical reduction');
    }
    audit.record('Section172 Filing Unit History', `${index + 1}:opening`, 'Actual current-owner NOL opening carry', money(balances.get(currentOwner)!),
      'Original owner allocation less actual intervening owner absorption and attribute reductions; no resplit of a joint closing balance',
      { 'Loss year': String(row.lossTaxYear), 'Original return loss': money(originalTotal), 'Original owner allocation': money(originalOwner),
        'Current-owner separate original NOL': money(separate.get(currentOwner)!), 'All separate original NOLs': money(totalSeparate) });
  }
  for (const original of sharedOriginals.values()) {
    if (original.expected.some(owner => !original.owners.has(owner))) throw new Error('NOL current joint pooling requires each original owner, including an actual zero share');
  }
  return { lines: audit.getLines(), ...(joint ? { jointOwners } : {}) };
}
