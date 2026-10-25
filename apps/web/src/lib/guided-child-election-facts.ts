import { Form8814ChildSchema, type Form8814ChildInput } from '@/models/inputs.js';
import { calculateForm8814AmtSources } from '@/engine/forms/form-8814-amt-sources.js';
import { parseGuidedCurrency } from './guided-currency';

export const childElectionAmounts = [
  ['taxableInterest', 'Child taxable interest'], ['taxExemptInterest', 'Child tax-exempt interest'],
  ['ordinaryDividends', 'Child ordinary dividends'], ['qualifiedDividends', 'Child qualified dividends'],
  ['capitalGainDistributions', 'Child capital gain distributions'], ['otherGrossIncome', 'Child other gross income'],
  ['estimatedTaxPayments', 'Child estimated tax payments'], ['priorYearOverpaymentApplied', 'Child prior overpayment applied to this year'],
  ['federalIncomeTaxWithheld', 'Child federal income tax withheld'],
] as const;
type AmountKey = typeof childElectionAmounts[number][0];
type TextKey = AmountKey | 'taxYear' | 'sourceReference' | 'firstName' | 'lastName' | 'ssn' | 'dateOfBirth'
  | 'timelyElectionStatus' | 'studentProgram' | 'studentMonths' | 'studentSourceReference' | 'electingTaxpayer'
  | 'relationshipToChild' | 'parentSituation' | 'comparisonTaxYear' | 'returnTaxableIncomeWithoutChild'
  | 'otherParentTaxableIncomeWithoutChild' | 'returnSourceReference' | 'otherParentSourceReference'
  | 'otherwiseAllowableDeduction' | 'deductionSourceReference';
type BooleanKey = 'sourceFactsConfirmed' | 'electionRequested' | 'childRequiredToFile' | 'childFilesJointReturn'
  | 'custodialParentConfirmed' | 'consideredUnmarriedUnder7703Confirmed' | 'excludesElectedChildIncomeConfirmed'
  | 'alaskaDividendPresent' | 'specialCapitalDistributionPresent' | 'foreignAccountOrTrustPresent'
  | 'amtFactsConfirmed' | 'deductionAllowanceAndNoDuplicationConfirmed';
export interface ChildPreferenceStatement { sourceId?: string; form?: string; taxExemptInterest?: string; specifiedPrivateActivityBondInterest?: string }
export type ChildElectionData = Partial<Record<TextKey, string>> & Partial<Record<BooleanKey, boolean | null>> & { amtStatements?: ChildPreferenceStatement[] };
const comparisonSituations = ['married_separate', 'custodial_separate_stepparent', 'surviving_separate_stepparent', 'never_married_together_all_year'];
function text(value: string | undefined, name: string) { if (!value?.trim()) throw new Error(`Enter the actual ${name}.`); return value.trim(); }
function money(value: string | undefined, name: string) {
  const parsed = parseGuidedCurrency(text(value, `${name}, including known zero`));
  if (!parsed.isFinite() || parsed.lt(0)) throw new Error(`The actual ${name} must be finite and nonnegative.`);
  return parsed.toFixed();
}
function bool(value: boolean | null | undefined, name: string) { if (typeof value !== 'boolean') throw new Error(`Confirm the actual ${name}.`); return value; }

export function buildGuidedChildElections(entries: ChildElectionData[] | undefined, taxYear: number | null | undefined): Form8814ChildInput[] {
  if (!entries?.length) return [];
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error('Choose the actual supported child election year.');
  const seen = new Set<string>();
  const children = entries.map(entry => {
    if (entry.taxYear !== String(taxYear)) throw new Error('Match the actual child source year to the return.');
    if (entry.sourceFactsConfirmed !== true) throw new Error('Review and confirm the actual child election sources after the last edit.');
    for (const [key, label] of [['alaskaDividendPresent', 'Alaska dividend'], ['specialCapitalDistributionPresent', 'special capital distribution'], ['foreignAccountOrTrustPresent', 'foreign account or trust']] as const) {
      if (bool(entry[key], `${label} answer`)) throw new Error(`This child ${label} source needs its separate method. Keep the source for review; do not substitute zero.`);
    }
    const ssn = text(entry.ssn, 'child SSN');
    if (!/^\d{3}-?\d{2}-?\d{4}$/.test(ssn)) throw new Error('Enter the actual nine-digit child SSN.');
    const identity = ssn.replace(/-/g, '');
    if (seen.has(identity)) throw new Error('Duplicate child election identity.');
    seen.add(identity);
    const amounts = Object.fromEntries(childElectionAmounts.map(([key, label]) => [key, money(entry[key], label)]));
    const studentStarted = !!(entry.studentProgram || entry.studentMonths || entry.studentSourceReference);
    if (studentStarted && !/^\s*(?:[1-9]|1[0-2])(?:\s*,\s*(?:[1-9]|1[0-2]))*\s*$/.test(entry.studentMonths ?? '')) throw new Error('Enter the actual student months as distinct month numbers separated by commas.');
    const comparisonStarted = comparisonSituations.includes(entry.parentSituation ?? '') || [entry.comparisonTaxYear, entry.returnTaxableIncomeWithoutChild, entry.otherParentTaxableIncomeWithoutChild, entry.returnSourceReference, entry.otherParentSourceReference].some(value => value?.trim());
    if (comparisonStarted && entry.comparisonTaxYear !== String(taxYear)) throw new Error('Match both actual parent comparison worksheets to this return year.');
    const comparison = comparisonStarted ? {
      taxYear, returnTaxableIncomeWithoutChild: money(entry.returnTaxableIncomeWithoutChild, 'return parent taxable income without child elections'),
      otherParentTaxableIncomeWithoutChild: money(entry.otherParentTaxableIncomeWithoutChild, 'other parent taxable income without child elections'),
      returnSourceReference: text(entry.returnSourceReference, 'return parent worksheet reference'), otherParentSourceReference: text(entry.otherParentSourceReference, 'other parent worksheet reference'),
      excludesElectedChildIncomeConfirmed: bool(entry.excludesElectedChildIncomeConfirmed, 'exclusion of child election income from both parent worksheets'),
    } : undefined;
    const amtStarted = parseGuidedCurrency(amounts.taxExemptInterest).gt(0) || entry.amtFactsConfirmed != null || !!entry.amtStatements?.length || !!entry.otherwiseAllowableDeduction?.trim() || !!entry.deductionSourceReference?.trim();
    const parsed = Form8814ChildSchema.safeParse({ ...amounts, electionFacts: {
      taxYear, sourceReference: text(entry.sourceReference, 'child election worksheet reference'), sourceFactsConfirmed: true,
      child: { firstName: text(entry.firstName, 'child first name'), lastName: text(entry.lastName, 'child last name'), ssn, dateOfBirth: text(entry.dateOfBirth, 'child birth date') },
      electionRequested: bool(entry.electionRequested, 'affirmative election choice'), timelyElectionStatus: entry.timelyElectionStatus,
      childRequiredToFile: bool(entry.childRequiredToFile, 'child required-return determination'), childFilesJointReturn: bool(entry.childFilesJointReturn, 'child joint-return answer'),
      ...Object.fromEntries(['otherGrossIncome', 'estimatedTaxPayments', 'priorYearOverpaymentApplied', 'federalIncomeTaxWithheld'].map(key => [key, amounts[key]])),
      student: studentStarted ? { program: entry.studentProgram, fullTimeMonths: entry.studentMonths?.split(',').map(value => Number(value.trim())), sourceReference: text(entry.studentSourceReference, 'student enrollment reference') } : undefined,
      electingTaxpayer: entry.electingTaxpayer, relationshipToChild: entry.relationshipToChild, parentSituation: entry.parentSituation,
      custodialParentConfirmed: entry.custodialParentConfirmed ?? undefined, consideredUnmarriedUnder7703Confirmed: entry.consideredUnmarriedUnder7703Confirmed ?? undefined,
      parentIncomeComparison: comparison,
    }, amtSources: amtStarted ? {
      taxYear, allStatementsConfirmed: bool(entry.amtFactsConfirmed, 'complete child AMT source review'),
      otherwiseAllowableDeduction: money(entry.otherwiseAllowableDeduction, 'child otherwise allowable preference deduction'),
      deductionSourceReference: entry.deductionSourceReference?.trim() || undefined, deductionAllowanceAndNoDuplicationConfirmed: entry.deductionAllowanceAndNoDuplicationConfirmed ?? undefined,
      statements: (entry.amtStatements ?? []).map(row => ({ sourceId: text(row.sourceId, 'child statement source reference'), form: row.form,
        taxExemptInterest: money(row.taxExemptInterest, 'child statement exempt interest'), specifiedPrivateActivityBondInterest: money(row.specifiedPrivateActivityBondInterest, 'child statement specified preference') })),
    } : undefined });
    if (!parsed.success) throw new Error('Complete the actual child identity, parent selection, election and statement choices.');
    return parsed.data;
  });
  calculateForm8814AmtSources(children, taxYear);
  return children;
}
export function childElectionFactErrors(entries: ChildElectionData[] | undefined, taxYear?: number | null): Record<string, string> {
  try { buildGuidedChildElections(entries, taxYear); return {}; }
  catch (error) { return { childElectionSources: error instanceof Error ? error.message : 'Complete the actual child election sources.' }; }
}
export function updateChildElection(entry: ChildElectionData, patch: Partial<ChildElectionData>): ChildElectionData {
  if (Object.entries(patch).every(([key, value]) => JSON.stringify(entry[key as keyof ChildElectionData]) === JSON.stringify(value))) return entry;
  const sourceEdit = Object.keys(patch).some(key => key !== 'sourceFactsConfirmed');
  const amtEdit = Object.keys(patch).some(key => ['amtStatements', 'taxExemptInterest', 'otherwiseAllowableDeduction', 'deductionSourceReference'].includes(key));
  return { ...entry, ...patch, ...(sourceEdit ? { sourceFactsConfirmed: null } : {}), ...(amtEdit ? { amtFactsConfirmed: null, deductionAllowanceAndNoDuplicationConfirmed: null } : {}) };
}
