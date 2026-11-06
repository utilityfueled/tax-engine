import { Form4952InputSchema, type Form4952Input, type TaxYearInput } from '@/models/inputs.js';
import { getConstants } from '@/models/constants.js';
import { calculateForm4952 } from '@/engine/forms/form-4952.js';
import { calculateForm4952ChildSources } from '@/engine/forms/form-4952-child-sources.js';
import { buildGuidedChildElections, type ChildElectionData } from './guided-child-election-facts';
import { parseGuidedCurrency } from './guided-currency';
import { guidedSourceValuesChanged } from './guided-source-confirmation';

export const investmentInterestAmounts = [
  'investmentInterestExpense', 'priorYearDisallowed', 'grossInvestmentIncome', 'qualifiedDividendsIncluded',
  'netGainFromInvestmentProperty', 'netCapitalGainFromInvestmentProperty', 'electedPreferentialIncome', 'investmentExpenses',
] as const;
export const investmentInterestParentAmounts = [
  'parentGrossInvestmentIncome', 'parentQualifiedDividends', 'parentNetInvestmentGain', 'parentNetLongTermGain', 'parentNetShortTermGain',
] as const;
export type InvestmentChildLink = Partial<Record<'sourceId' | 'sourceTaxYear' | 'sourceReference' | 'firstName' | 'lastName' | 'dateOfBirth' | 'ssnLast4', string>>;
export interface InvestmentInterestChildPartition extends Partial<Record<typeof investmentInterestParentAmounts[number] | 'sourceTaxYear' | 'sourceReference', string>> {
  sourceFactsConfirmed?: boolean | null;
  parentSourcesExcludeAllChildrenConfirmed?: boolean | null;
  children?: InvestmentChildLink[];
}
export interface InvestmentInterestWorksheetData extends Partial<Record<typeof investmentInterestAmounts[number] | 'sourceTaxYear' | 'sourceReference' | 'priorYearSourceTaxYear' | 'electedNetCapitalGain', string>> {
  sourceFactsConfirmed?: boolean | null;
  investmentExpensesDeductibleConfirmed?: boolean | null;
  capitalGainElectionMethod?: '' | 'capital_first' | 'explicit';
  childIncomeSources?: InvestmentInterestChildPartition;
}
export interface InvestmentInterestSourceData { regular?: InvestmentInterestWorksheetData; amt?: InvestmentInterestWorksheetData }
type Deductions = { investmentInterestExpense?: string; investmentInterestSources?: InvestmentInterestSourceData };
const hasAmount = (value: string | undefined) => typeof value === 'string' && value.trim() !== '';
function amount(value: string | undefined, label: string): string {
  if (!hasAmount(value)) throw new Error(`Enter the actual investment-interest ${label}, including known zero.`);
  return parseGuidedCurrency(value).toFixed();
}
function year(value: string | undefined): number {
  if (!/^\d{4}$/.test(value ?? '')) throw new Error('Enter the actual investment-interest source year.');
  return Number(value);
}
function worksheet(data: InvestmentInterestWorksheetData, taxYear: number): Form4952Input {
  const amounts = Object.fromEntries(investmentInterestAmounts.map(key => [key, amount(data[key], key)]));
  let electedNetCapitalGain: string | undefined;
  if (parseGuidedCurrency(amounts.electedPreferentialIncome).gt(0)) {
    if (!data.capitalGainElectionMethod) throw new Error('Choose the actual preferential-income election allocation method.');
    if (data.capitalGainElectionMethod === 'explicit') electedNetCapitalGain = amount(data.electedNetCapitalGain, 'explicit net-capital-gain election');
    else if (hasAmount(data.electedNetCapitalGain)) throw new Error('Reconcile the saved explicit election amount before choosing the capital-gain-first method.');
  } else if (hasAmount(data.electedNetCapitalGain)) electedNetCapitalGain = amount(data.electedNetCapitalGain, 'explicit net-capital-gain election');
  const source = data.childIncomeSources;
  const childIncomeSources = source ? {
    ...source, sourceTaxYear: year(source.sourceTaxYear),
    ...Object.fromEntries(investmentInterestParentAmounts.map(key => [key, amount(source[key], key)])),
    children: source.children?.map(child => ({ ...child, sourceTaxYear: year(child.sourceTaxYear) })),
  } : undefined;
  const parsed = Form4952InputSchema.parse({ ...data, ...amounts, sourceTaxYear: year(data.sourceTaxYear),
    priorYearSourceTaxYear: data.priorYearSourceTaxYear?.trim() ? year(data.priorYearSourceTaxYear) : undefined,
    electedNetCapitalGain, childIncomeSources,
    sourceFactsConfirmed: data.sourceFactsConfirmed ?? undefined,
    investmentExpensesDeductibleConfirmed: data.investmentExpensesDeductibleConfirmed ?? undefined,
  });
  calculateForm4952(parsed, taxYear);
  return parsed;
}

export function buildGuidedInvestmentInterestInputs(data: Deductions | undefined, childEntries: ChildElectionData[] | undefined, taxYear?: number | null): Pick<TaxYearInput, 'form4952' | 'form4952Amt'> {
  const sources = data?.investmentInterestSources;
  if (!sources) {
    if (hasAmount(data?.investmentInterestExpense) && !parseGuidedCurrency(data?.investmentInterestExpense).isZero()) throw new Error('Complete the actual regular and AMT investment-interest source worksheets for this saved amount.');
    return {};
  }
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error('Choose the actual return tax year before completing investment-interest worksheets.');
  if (!sources.regular) throw new Error('Complete the actual regular investment-interest worksheet.');
  if (!sources.amt) throw new Error('Complete the separate actual AMT investment-interest worksheet.');
  const form4952 = worksheet(sources.regular, taxYear), form4952Amt = worksheet(sources.amt, taxYear);
  if (hasAmount(data?.investmentInterestExpense) && !parseGuidedCurrency(data?.investmentInterestExpense).eq(form4952.investmentInterestExpense)) {
    throw new Error('Reconcile the saved investment interest with the actual current-year regular worksheet expense.');
  }
  const children = buildGuidedChildElections(childEntries, taxYear);
  if (children.length || form4952.childIncomeSources) calculateForm4952ChildSources(form4952, children, getConstants(taxYear));
  if (children.length || form4952Amt.childIncomeSources) calculateForm4952ChildSources(form4952Amt, children, getConstants(taxYear), 'amt');
  const regular = calculateForm4952(form4952, taxYear), amt = calculateForm4952(form4952Amt, taxYear);
  if (!amt.line4g.eq(regular.line4g.lte(amt.line4b.plus(amt.line4e)) ? regular.line4g : amt.line4b.plus(amt.line4e))) {
    throw new Error('The actual AMT election must match the regular election limited to AMT preferential income.');
  }
  return { form4952, form4952Amt };
}
export function investmentInterestFactErrors(data: Deductions | undefined, childEntries: ChildElectionData[] | undefined, taxYear?: number | null): Record<string, string> {
  try { buildGuidedInvestmentInterestInputs(data, childEntries, taxYear); return {}; }
  catch (error) { return { investmentInterestSources: error instanceof Error ? error.message : 'Complete the actual investment-interest source worksheets.' }; }
}
export function captureInvestmentInterestChildren(children: ChildElectionData[] | undefined): InvestmentChildLink[] {
  return (children ?? []).map((child, index) => ({ sourceId: `form8814:${index}`, sourceTaxYear: child.taxYear, sourceReference: child.sourceReference,
    firstName: child.firstName, lastName: child.lastName, dateOfBirth: child.dateOfBirth, ssnLast4: child.ssn?.replace(/\D/g, '').slice(-4) }));
}
export function updateInvestmentInterestWorksheet(data: InvestmentInterestWorksheetData, patch: Partial<InvestmentInterestWorksheetData>): InvestmentInterestWorksheetData {
  const next = { ...data, ...patch };
  if (!guidedSourceValuesChanged(data, next)) return next;
  return { ...next, sourceFactsConfirmed: null, ...(next.childIncomeSources ? { childIncomeSources: { ...next.childIncomeSources, sourceFactsConfirmed: null } } : {}) };
}
