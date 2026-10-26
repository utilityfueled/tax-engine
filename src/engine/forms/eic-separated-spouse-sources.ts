/** Actual Rule3 sources; spec/federal/eic-separated-spouse-sources.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { EicSeparatedSpouseSources } from '@/models/eic-separated-spouse-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { calculateEicQualifyingChildSources } from './eic-qualifying-child-sources.js';

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
  const childSources = calculateEicQualifyingChildSources({ taxpayer,
    allCandidateChildrenIncluded: facts.allCandidateChildrenIncluded, children: facts.children });
  const qualified = childSources.qualifyingChildSourceIds;
  const counted = childSources.ssnCountedChildSourceIds;
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
