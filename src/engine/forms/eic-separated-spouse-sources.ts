/** Actual Rule3 sources; spec/federal/eic-separated-spouse-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { EicSeparatedSpouseSources } from '@/models/eic-separated-spouse-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';

export type EicSeparatedSpouseInput = Pick<TaxYearInput, 'standardDeductionFacts'> & {
  taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear' | 'filingStatus' | 'primary' | 'dependents' | 'livedWithSpouseAtAnyTimeDuringYear'>;
  eic?: Pick<NonNullable<TaxYearInput['eic']>, 'separatedSpouseSources' | 'mfsEligible' | 'claimantEligibility'>;
};
export interface EicSeparatedSpouseResult {
  sourceFactsComplete: boolean;
  separatedSpouseEligible: boolean | undefined;
  qualifyingChildPresent: boolean;
  qualifyingChildSourceIds: string[];
  ssnCountedChildSourceIds: string[];
  lines: CalculatedLine[];
}
type Row = NonNullable<EicSeparatedSpouseSources['children']>[number];
const relationshipKey = (value: string): string => value.trim().toLowerCase().replaceAll('_', ' ').replaceAll('-', ' ');
const childRelationships = new Set(['child', 'son', 'daughter', 'adopted child', 'stepchild', 'foster child', 'grandchild',
  'sibling', 'brother', 'sister', 'half brother', 'half sister', 'stepbrother', 'stepsister', 'step sibling', 'niece', 'nephew', 'niece nephew']);
const instrumentStates = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
const text = (v: string | undefined, label: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`EIC ${label} needs an actual source value`);
  return v.trim();
};
function answer(v: boolean | undefined, label: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`EIC ${label} is unknown`);
  return v;
}
function date(v: string | undefined, label: string): Date {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`EIC ${label} needs an actual calendar date`);
  const d = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) throw new Error(`EIC ${label} needs an actual calendar date`);
  return d;
}
function originalIdentity(actual: { firstName: string; lastName: string; ssn: string; dateOfBirth: string },
  saved: EicSeparatedSpouseSources['taxpayer'], label: string): void {
  if (!saved || ['firstName', 'lastName', 'ssn', 'dateOfBirth'].some(k => saved[k as keyof typeof saved] !== actual[k as keyof typeof actual])) {
    throw new Error(`EIC ${label} original source identity does not match the current household`);
  }
  text(actual.firstName, `${label} first name`); text(actual.lastName, `${label} last name`); date(actual.dateOfBirth, `${label} birth date`);
}
function qualifyingChild(input: EicSeparatedSpouseInput, row: Row, child: TaxYearInput['taxpayer']['dependents'][number]): boolean {
  originalIdentity(child, row.original, 'child');
  if (row.original?.relationship !== child.relationship || row.original.monthsLivedWithYou !== child.monthsLivedWithYou) throw new Error('EIC child original source relationship or residence months changed');
  text(row.sourceReference, 'child reference');
  const home = answer(row.livedWithTaxpayerInUnitedStatesMoreThanHalfYear, 'child U.S. shared-home answer');
  if (answer(row.specialResidencePeriodClaimed, 'child special residence-period answer')) throw new Error('EIC child special residence-period method requires separate actual allocation sources');
  // Schedule EIC line6 explicitly permits >half-year but <7 actual months.
  // Retain the original month count; the actual home answer settles the test.
  if (home && child.monthsLivedWithYou < 6) throw new Error('EIC actual child shared-home answer conflicts with original residence months below six');
  if (answer(row.marriedAtYearEnd, 'child marital status')) throw new Error('EIC married-child dependency method needs separate actual sources');
  const joint = answer(row.jointReturnFiled, 'child joint-return answer');
  const refundOnly = joint ? answer(row.jointReturnRefundOnly, 'child joint-return refund-only answer') : false;
  const validSsn = answer(row.validSsnIssuedByDueDate, 'child timely valid SSN answer');
  if (validSsn && !/^\d{9}$/.test(child.ssn.replace(/-/g, ''))) throw new Error('EIC child valid SSN answer needs the actual original nine-digit SSN');
  if (row.allOtherEligibleClaimantsIncluded !== true || row.otherEligibleClaimants === undefined) throw new Error('EIC child needs complete actual competing-claim records, including known empty records');
  const relationship = relationshipKey(child.relationship);
  if (!childRelationships.has(relationship)) throw new Error('EIC child relationship needs a supported actual qualifying-child source category');
  if (relationship === 'foster child' && row.authorizedFosterPlacement !== true) throw new Error('EIC foster child needs actual authorized placement source confirmation');
  if (row.otherEligibleClaimants.length && !['child', 'son', 'daughter', 'adopted child'].includes(relationship)) throw new Error('EIC competing nonparent tiebreak method needs actual priority sources');
  const others = new Set<string>();
  for (const other of row.otherEligibleClaimants) {
    const name = text(other.name, 'other eligible claimant name'); text(other.sourceReference, 'other eligible claimant reference');
    if (others.has(name.trim().toLowerCase())) throw new Error('EIC duplicate competing claimant record');
    others.add(name.trim().toLowerCase());
    if (answer(other.claimsAnyChildTaxBenefit, 'competing child tax benefit answer')) throw new Error('EIC contested competing-claim tiebreak method needs actual priority sources');
  }
  const birth = date(child.dateOfBirth, 'child birth date');
  const yearEnd = date(`${input.taxpayer.taxYear}-12-31`, 'year end');
  if (birth > yearEnd) throw new Error('EIC child original birth date is after the return year');
  const younger = birth > date(input.taxpayer.primary.dateOfBirth, 'claimant birth date');
  const reaches = (age: number) => { const d = new Date(birth); d.setUTCFullYear(d.getUTCFullYear() + age); d.setUTCDate(d.getUTCDate() - 1); return d; };
  let ageEligible = yearEnd < reaches(19) && younger;
  if (!ageEligible && yearEnd < reaches(24) && younger) ageEligible = answer(row.fullTimeStudentForFiveMonths, 'child full-time student answer');
  if (!ageEligible) ageEligible = answer(row.permanentlyAndTotallyDisabled, 'child permanent disability answer');
  return home && (!joint || refundOnly) && ageEligible;
}

export function calculateEicSeparatedSpouseSources(input: EicSeparatedSpouseInput): EicSeparatedSpouseResult {
  const facts = input.eic?.separatedSpouseSources;
  if (facts === undefined) {
    if (input.eic?.mfsEligible === true && (input.taxpayer.taxYear !== 2025 || input.eic.claimantEligibility !== undefined)) throw new Error('EIC actual separated-spouse claim needs source records, not an affirmative legacy override');
    const legacy = input.taxpayer.dependents.flatMap((child, i) => child.qualifiesForEIC ? [`dependent:${i}`] : []);
    return { sourceFactsComplete: false, separatedSpouseEligible: input.eic?.mfsEligible, qualifyingChildPresent: legacy.length > 0,
      qualifyingChildSourceIds: legacy, ssnCountedChildSourceIds: legacy, lines: [] };
  }
  const { taxpayer } = input;
  if (![2025, 2026].includes(taxpayer.taxYear) || facts.sourceTaxYear !== taxpayer.taxYear) throw new Error('EIC separated-spouse source year must match the supported return year');
  text(facts.sourceReference, 'separated-spouse reference');
  if (facts.sourceFactsConfirmed !== true) throw new Error('EIC separated-spouse source confirmation is required');
  originalIdentity(taxpayer.primary, facts.taxpayer, 'claimant');
  text(taxpayer.primary.ssn, 'claimant original identifier');
  if (!['married_filing_separately', 'head_of_household'].includes(taxpayer.filingStatus)) throw new Error('EIC separated-spouse sources require an actual married nonjoint filing status');
  if (answer(facts.marriedAtYearEnd, 'married-at-year-end answer') !== true) throw new Error('EIC separated-spouse sources conflict with actual unmarried year-end status');
  date(facts.applicableYearStart, 'applicable tax year start'); date(facts.applicableYearEnd, 'applicable tax year end');
  if (facts.applicableYearStart !== `${taxpayer.taxYear}-01-01` || facts.applicableYearEnd !== `${taxpayer.taxYear}-12-31`) throw new Error('EIC separated-spouse short-year method requires separate applicable-year sources');
  const death = input.standardDeductionFacts?.primaryDeathDate;
  if (death != null && death !== facts.applicableYearEnd) throw new Error('EIC separated-spouse applicable year conflicts with the actual death date');
  const apart = facts.principalHomesApartLastSixMonths;
  if (apart !== undefined) answer(apart, 'last-six-month principal residence answer');
  if (facts.legallySeparatedUnderStateLaw !== undefined) answer(facts.legallySeparatedUnderStateLaw, 'state-law separation answer');
  if (facts.differentHouseholdsAtYearEnd !== undefined) answer(facts.differentHouseholdsAtYearEnd, 'year-end different-household answer');
  if (apart === true && facts.differentHouseholdsAtYearEnd === false) throw new Error('EIC last-six-month residence and year-end household answers conflict');
  if (apart === false && taxpayer.livedWithSpouseAtAnyTimeDuringYear === false) throw new Error('EIC last-six-month residence conflicts with the known never-lived-with-spouse answer');
  const instrument = facts.separationInstrument;
  if (instrument !== undefined) {
    if (!['written-separation-agreement', 'decree-of-separate-maintenance'].includes(instrument.kind ?? '')) throw new Error('EIC state-law separation instrument type is unknown');
    if (!instrumentStates.has(text(instrument.state, 'separation state'))) throw new Error('EIC separation instrument needs its actual supported state');
    text(instrument.sourceReference, 'separation instrument reference');
    if (date(instrument.effectiveDate, 'separation effective date') > date(facts.applicableYearEnd, 'applicable year end')) throw new Error('EIC separation instrument was not effective by year end');
    if (facts.legallySeparatedUnderStateLaw !== true) throw new Error('EIC supplied separation instrument needs its actual state-law qualification answer');
  }
  // Each statutory alternative stands on its own actual facts. An unused
  // unknown answer is retained; it cannot turn an unresolved claim into No.
  const stateLawAlternative = facts.legallySeparatedUnderStateLaw === false || facts.differentHouseholdsAtYearEnd === false
    ? false : facts.legallySeparatedUnderStateLaw === true && facts.differentHouseholdsAtYearEnd === true ? true : undefined;
  let separated: boolean;
  if (apart === true) separated = true;
  else if (stateLawAlternative === true) {
    if (!instrument) throw new Error('EIC state-law alternative requires the actual separation instrument');
    separated = true;
  } else if (apart === false && stateLawAlternative === false) separated = false;
  else throw new Error('EIC separated-spouse separation alternative is unknown');
  if (facts.allCandidateChildrenIncluded !== true || facts.children === undefined) throw new Error('EIC separated-spouse claim needs all actual candidate child records, including known empty records');
  const seen = new Set<string>(); const identities = new Set<string>(); const qualified: string[] = []; const counted: string[] = [];
  for (const row of facts.children) {
    const sourceId = text(row.sourceId, 'child source ID'); const match = /^dependent:(0|[1-9]\d*)$/.exec(sourceId);
    if (!match) throw new Error('EIC child source ID must identify an original dependent');
    const child = taxpayer.dependents[Number(match[1])];
    if (!child) throw new Error('EIC original child source is missing');
    const identifier = child.ssn.replace(/[-\s]/g, '');
    if (identifier && identifier === taxpayer.primary.ssn.replace(/[-\s]/g, '')) throw new Error('EIC original child identifier duplicates the claimant identifier');
    const identity = identifier || `${child.firstName.trim().toLowerCase()}|${child.lastName.trim().toLowerCase()}|${child.dateOfBirth}`;
    if (seen.has(sourceId) || identities.has(identity)) throw new Error('EIC duplicate original child source');
    seen.add(sourceId); identities.add(identity);
    if (qualifyingChild(input, row, child)) { qualified.push(sourceId); if (row.validSsnIssuedByDueDate === true) counted.push(sourceId); }
  }
  for (const [i, child] of taxpayer.dependents.entries()) {
    if ((child.qualifiesForEIC || childRelationships.has(relationshipKey(child.relationship))) && !seen.has(`dependent:${i}`)) {
      throw new Error('EIC represented candidate child is missing from the actual source records');
    }
  }
  const eligible = separated && qualified.length > 0;
  const audit = new AuditTrail();
  audit.record('EIC', 'separatedSpouseSources', 'Actual separated-spouse and qualifying-child sources', new Decimal(eligible ? 1 : 0),
    'IRC32(d)(2)(B): actual qualifying child and a sourced separation alternative; SSN count applies only to credit amount', {
      'Qualifying children before SSN amount test': qualified.length.toString(), 'SSN-counted children': counted.length.toString(),
      'Separation alternative': apart ? 'Principal homes apart throughout last six months' : separated ? 'State-law instrument and different households at year end' : 'Known separation conditions not met',
    });
  return { sourceFactsComplete: true, separatedSpouseEligible: eligible, qualifyingChildPresent: qualified.length > 0,
    qualifyingChildSourceIds: qualified, ssnCountedChildSourceIds: counted, lines: audit.getLines() };
}
