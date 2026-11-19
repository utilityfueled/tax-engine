/** Spec: spec/federal/form-8962-married-third-family.yaml. Finite Pub974 WorksheetE originals. */
import Decimal from 'decimal.js';
import { assertMarketplaceStatementUsable, Form8962MarriedThirdFamilySchema, MarketplaceOriginalPolicySchema } from '@/models/form-8962-shared-policy.js';
import type { Form8962AllocationInput, Form8962SharedPolicyResult } from './form-8962-shared-policy.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

function requireFact(value: unknown, label: string): asserts value {
  if (!value) throw new Error(`Form8962 WorksheetE requires actual ${label}`);
}
function text(value: string | undefined, label: string): string {
  requireFact(typeof value === 'string' && value.trim(), label); return value.trim().replace(/\s+/g, ' ');
}
function name(value: string | undefined): string { return text(value, 'source name').toLocaleLowerCase('en-US'); }
function ssn(value: string | undefined): string {
  const result = text(value, 'source SSN').replace(/-/g, '');
  requireFact(/^\d{9}$/.test(result), 'complete source SSN'); return result;
}
function money(value: string | null | undefined): Decimal {
  requireFact(typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value), 'known nonnegative amount');
  const result = d(value); requireFact(result.isFinite(), 'finite amount'); return result;
}
function fraction(value: string | undefined): Decimal {
  requireFact(value !== undefined && /^(?:0|1|0\.\d{1,2}|1\.0{1,2})$/.test(value), 'agreed fraction with a leading digit and at most two decimal places');
  const result = money(value); requireFact(result.lte(1), 'agreed fraction at most one'); return result;
}
function month(value: number | undefined): number {
  requireFact(value !== undefined && Number.isInteger(value) && value >= 1 && value <= 12, 'source month1 through12'); return value;
}

export function calculateForm8962MarriedThirdFamily(input: Form8962AllocationInput): Form8962SharedPolicyResult {
  const facts = input.form8962, packet = facts?.sharedPolicyAllocations, year = input.taxpayer.taxYear;
  requireFact(facts && packet && [2025, 2026].includes(year) && packet.sourceTaxYear === year && packet.sourceFactsConfirmed === true
    && packet.allSharedPoliciesIncluded === true && facts.allocationRequired === true, 'complete supported-year shared-policy packet');
  text(packet.sourceReference, 'allocation source reference');
  requireFact(input.taxpayer.filingStatus === 'married_filing_separately' && facts.marriedFilingSeparatelyExceptionConfirmed === false
    && facts.alternativeMarriageCalculationElected === false && facts.selfEmployedHealthInsuranceCoordinationRequired === false
    && facts.qsehraAffected === false && facts.lawfulPresenceReconciliationRequired === false && input.form7206 === undefined,
  'separate return without an exception or other coordination method');
  requireFact(packet.noAdvanceCoverageFamilies === undefined && packet.overlappingCoverage === undefined
    && packet.spouseName === undefined && packet.spouseSsn === undefined, 'only the WorksheetE source method');
  requireFact(input.standardDeductionFacts?.primaryCanBeClaimedAsDependent === false && facts.canBeClaimedAsDependent === false
    && facts.taxFamilySize === 1 && input.taxpayer.dependents.length === 0, 'one unclaimable primary tax-family member');
  const primary = input.taxpayer.primary, spouse = input.taxpayer.spouse;
  requireFact(spouse, 'actual spouse identity');
  const primaryId = ssn(primary.ssn), spouseId = ssn(spouse.ssn);
  requireFact(primaryId !== spouseId && name(packet.primaryName) === name(`${primary.firstName} ${primary.lastName}`)
    && ssn(packet.primarySsn) === primaryId, 'matching actual primary identity');
  const source = Form8962MarriedThirdFamilySchema.parse(packet.marriedThirdFamily);
  requireFact(source.sourceTaxYear === year && source.sourceFactsConfirmed === true && source.noOtherAllocationsRequiredConfirmed === true
    && source.allAgreementsAndCoverageMonthsIncludedConfirmed === true, 'complete original three-family sources');
  text(source.sourceReference, 'three-family source reference');
  requireFact(source.families?.length === 3, 'exactly three original tax-family returns');
  const familyPeople = new Map<string, { name: string; family: 'primary' | 'spouse' | 'third' }>();
  const familyIds = new Map<'primary' | 'spouse' | 'third', string>();
  for (const family of source.families) {
    const role = family.role;
    requireFact(role && !familyIds.has(role) && family.sourceTaxYear === year && family.allTaxFamilyMembersIncludedConfirmed === true
      && family.dependents !== undefined, 'unique complete original tax-family return');
    text(family.sourceReference, 'tax-family original source reference');
    const id = ssn(family.taxpayerSsn), actualName = name(family.taxpayerName);
    if (role === 'primary' || role === 'spouse') {
      const actual = role === 'primary' ? primary : spouse;
      requireFact(id === ssn(actual.ssn) && actualName === name(`${actual.firstName} ${actual.lastName}`) && family.dependents.length === 0,
        'matching one-person primary and spouse tax families');
      requireFact(family.filingStatus === 'married_filing_separately', 'actual separate-filer original return status');
    } else requireFact(family.dependents.length > 0 && ['single', 'head_of_household'].includes(family.filingStatus ?? ''), 'actual nonjoint third-family return and claimed people');
    familyIds.set(role, id);
    for (const person of [{ name: family.taxpayerName, ssn: family.taxpayerSsn }, ...family.dependents]) {
      const personId = ssn(person.ssn);
      requireFact(!familyPeople.has(personId), 'nonoverlapping original tax-family members');
      familyPeople.set(personId, { name: name(person.name), family: role });
    }
  }
  requireFact(input.form1095A.length === 1 && packet.policies?.length === 1, 'exactly one original policy');
  const actual = input.form1095A[0], policy = packet.policies[0];
  requireFact(actual && policy, 'actual original policy');
  requireFact(actual.sourceFactsComplete === true && policy.sourceId === 'form1095A:0' && policy.original
    && policy.situation === 'married_separate' && policy.twoTaxFamiliesConfirmed === false && policy.allCoveredPeopleAssignedConfirmed === true
    && ssn(policy.otherTaxpayerSsn) === spouseId && name(policy.otherTaxpayerName) === name(`${spouse.firstName} ${spouse.lastName}`),
  'matching complete original policy and actual spouse');
  const evidence = policy.separateReturn;
  requireFact(evidence?.marriedAtYearEndConfirmed === true && evidence.onlySpouseTaxFamiliesConfirmed === false
    && evidence.livingApartExceptionConfirmed === false, 'explicit married three-family history without a living-apart exception');
  text(evidence.sourceReference, 'marriage source reference');
  requireFact(policy.coveredFamilyAssignments === undefined && policy.agreementConfirmed === undefined && policy.agreementReference === undefined
    && policy.defaultAllocation === undefined && policy.monthlyAllocations === undefined && policy.noAdvanceAllocation === undefined
    && evidence.ownCoverageFamilySlcsp === undefined && evidence.benchmarkAboveReportedReference === undefined
    && policy.noCurrentYearMarriageOrDivorceConfirmed === undefined && policy.originalSlcspCorrectConfirmed === undefined,
  'no competing two-family, output-share or benchmark method');
  const normalize = (original: typeof policy.original) => {
    const raw = MarketplaceOriginalPolicySchema.parse(original);
    assertMarketplaceStatementUsable(raw.statementStatus);
    requireFact(raw.taxYear === year && raw.coveredIndividuals?.length && raw.monthlyPremiums?.length, 'complete original policy year and rows');
    const ids = new Set<string>(), months = new Set<number>();
    const people = raw.coveredIndividuals.map(person => {
      const id = ssn(person.ssn), first = month(person.firstMonth), last = month(person.lastMonth);
      requireFact(!ids.has(id) && first <= last, 'unique original covered people and valid periods'); ids.add(id);
      return { id, name: name(person.name), first, last };
    }).sort((a, b) => a.id.localeCompare(b.id));
    const rows = raw.monthlyPremiums.map(row => {
      const m = month(row.month); requireFact(!months.has(m), 'unique original policy months'); months.add(m);
      return { month: m, premium: money(row.enrolleePremium).toFixed(), slcsp: row.slcsp === null ? null : money(row.slcsp).toFixed(), advance: money(row.advancePremiumTaxCredit).toFixed() };
    }).sort((a, b) => a.month - b.month);
    const coveredMonths = new Set(people.flatMap(person => Array.from({ length: person.last - person.first + 1 }, (_, index) => person.first + index)));
    requireFact(rows.length === coveredMonths.size && rows.every(row => coveredMonths.has(row.month)), 'every actual covered month on the original policy');
    return { year, statementStatus: raw.statementStatus, marketplace: text(raw.marketplace, 'Marketplace'), policyNumber: text(raw.policyNumber, 'policy number'),
      recipientId: ssn(raw.recipientSsn), recipientName: name(raw.recipientName), people, rows };
  };
  const original = normalize(actual);
  requireFact(JSON.stringify(original) === JSON.stringify(normalize(policy.original)), 'snapshot identical to actual original policy');
  requireFact(familyPeople.get(original.recipientId)?.name === original.recipientName, 'original recipient matching an actual tax-family source');
  requireFact(original.people.every(person => familyPeople.get(person.id)?.name === person.name), 'every original person matching a tax-family return source');
  const coveredIds = new Set(original.people.map(person => person.id));
  requireFact(coveredIds.has(primaryId) && coveredIds.has(spouseId)
    && [...familyPeople].filter(([, person]) => person.family === 'third').every(([id]) => id === familyIds.get('third') || coveredIds.has(id))
    && original.people.some(person => familyPeople.get(person.id)?.family === 'third'), 'actual members of all three families covered');
  requireFact(source.coverageFamilyAssignments?.length === original.people.length, 'complete original parental coverage-family assignment');
  const coverage = new Map<string, 'primary' | 'spouse'>();
  for (const assignment of source.coverageFamilyAssignments) {
    const id = ssn(assignment.ssn);
    requireFact(coveredIds.has(id) && !coverage.has(id) && assignment.family, 'unique actual parental coverage-family member');
    requireFact((id !== primaryId || assignment.family === 'primary') && (id !== spouseId || assignment.family === 'spouse')
      && id !== familyIds.get('third'), 'actual parent or third dependent coverage assignment');
    coverage.set(id, assignment.family);
  }
  requireFact(source.monthlySources?.length === original.rows.length, 'complete agreement and benchmark months');
  const monthlySources = new Map<number, NonNullable<typeof source.monthlySources>[number]>();
  for (const row of source.monthlySources) {
    const m = month(row.month); requireFact(!monthlySources.has(m) && original.rows.some(actualRow => actualRow.month === m), 'unique actual agreement month'); monthlySources.set(m, row);
  }
  const audit = new AuditTrail(), result: Form8962SharedPolicyResult = { months: [], householdMonths: [], periods: [], lines: [] };
  for (const row of original.rows) {
    const sourceRow = monthlySources.get(row.month);
    requireFact(sourceRow, 'matching original agreement month');
    requireFact(original.people.filter(person => person.first <= row.month && person.last >= row.month).some(person => person.id === primaryId)
      && original.people.filter(person => person.first <= row.month && person.last >= row.month).some(person => person.id === spouseId)
      && original.people.filter(person => person.first <= row.month && person.last >= row.month).some(person => familyPeople.get(person.id)?.family === 'third'), 'actual monthly coverage in all three tax families');
    text(sourceRow.primaryBenchmarkSourceReference, 'primary coverage benchmark reference'); text(sourceRow.spouseBenchmarkSourceReference, 'spouse coverage benchmark reference');
    const ownBenchmark = money(sourceRow.primaryBenchmark), spouseBenchmark = money(sourceRow.spouseBenchmark);
    requireFact(ownBenchmark.gt(0) && spouseBenchmark.gt(0), 'positive actual parental coverage-family benchmarks');
    requireFact(sourceRow.primaryAgreementConfirmed === true && sourceRow.spouseAgreementConfirmed === true, 'both actual signed agreement confirmations');
    text(sourceRow.primaryAgreementSourceReference, 'primary-third agreement reference'); text(sourceRow.spouseAgreementSourceReference, 'spouse-third agreement reference');
    const ownOther = fraction(sourceRow.primaryAgreementFraction), spouseOther = fraction(sourceRow.spouseAgreementFraction);
    const remaining = d(1).minus(ownOther), printedShare = remaining.div(2).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const advance = d(row.advance).times(printedShare);
    result.months.push({ month: row.month, policyIndex: 0, originalPremium: d(row.premium), originalSlcsp: row.slcsp === null ? null : d(row.slcsp), originalAdvance: d(row.advance), premium: d(0), slcsp: d(0), advance });
    result.householdMonths.push({ month: row.month, policyIndexes: [0], premium: d(0), slcsp: d(0), advance, unsharedBenchmarkGroups: [] });
    const prior = result.periods.at(-1);
    if (prior?.lastMonth === row.month - 1 && prior.fraction.eq(printedShare)) prior.lastMonth = row.month;
    else result.periods.push({ policyIndex: 0, firstMonth: row.month, lastMonth: row.month, fraction: printedShare, method: 'separate_return_advance_only' });
    for (const [line, value, description] of [['1', d(1), 'Starting allocation'], ['2', ownOther, 'Actual agreed third-family share'], ['3', remaining, 'Remaining share before equal spousal allocation'], ['4', printedShare, 'Printed remaining spouse allocation fraction'], ['5', ownBenchmark, 'Actual primary parental coverage-family benchmark']] as const)
      audit.record('Publication974 WorksheetE', `worksheet-e:month-${row.month}:${line}`, description, value, 'Pub974 WorksheetE; original agreements and family sources; line4 rounded to two places before APTC multiplication');
    audit.record('Publication974 WorksheetE', `worksheet-e:month-${row.month}:other-spouse-agreement`, 'Actual separate agreement between the spouse and third taxpayer', spouseOther, 'Distinct original agreement retained; no other return or third-family PTC calculated');
    audit.record('Publication974 WorksheetE', `worksheet-e:month-${row.month}:spouse-benchmark`, 'Actual other parental coverage-family benchmark', spouseBenchmark, 'Step1 actual allocation source, not a claimed benchmark on this return');
    audit.record('Form8962 PartIV', `month-${row.month}:advance`, 'Original advance credit allocated to this separate return', advance, 'Actual original APTC times WorksheetE printed line4; no premium or benchmark claimed');
  }
  result.periods.forEach((period, index) => audit.record('Form8962 PartIV', `allocation-${index + 1}g`, 'WorksheetE remaining spouse advance-credit allocation', period.fraction, `Pub974 Step4 column g; months${period.firstMonth}-${period.lastMonth}; columns e/f blank and actual spouse SSN`));
  result.lines = audit.getLines(); return result;
}
