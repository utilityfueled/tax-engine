/** Ordinary NIIT source handoff. Spec: spec/federal/form-8960-ordinary-sources.yaml. */
import Decimal from 'decimal.js';
import type { FilingStatus } from '@/models/constants.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, min, roundDollar, sum } from '@/utils/decimal.js';
import { isIraForm1099RDistribution, resolveForm1099RTaxableAmount } from './form-1099-r.js';

export interface Form8960OrdinaryContext {
  filingStatus: FilingStatus;
  magi: Decimal;
  niitThreshold: Decimal;
  deductions: {
    itemized: boolean;
    allowedItemizedDeductions: Decimal;
    investmentInterest: Decimal;
    ordinaryLoss: Decimal;
    saltDeduction: Decimal;
    incomeOrSalesTaxes: Decimal;
    realPropertyTaxes: Decimal;
    personalPropertyTaxes: Decimal;
    salesTaxElected: boolean;
  };
}
export interface Form8960OrdinarySourceResult {
  annuityIncome: Decimal;
  investmentInterestExpense: Decimal;
  investmentIncomeTaxes: Decimal;
  ordinaryLossDeduction: Decimal;
  unverifiedAnnuitySourceIds: string[];
  lines: CalculatedLine[];
}

function amount(value: string | undefined, label: string): Decimal {
  if (value === undefined || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new Error(`Form8960 requires actual ${label}`);
  const result = d(value);
  if (!result.isFinite() || result.lt(0)) throw new Error(`Form8960 ${label} must be finite and nonnegative`);
  return result;
}

export function resolveForm8960OrdinarySources(input: Pick<TaxYearInput, 'form1099R' | 'form8960Sources'> & { taxpayer: Pick<TaxYearInput['taxpayer'], 'taxYear'> }, context: Form8960OrdinaryContext): Form8960OrdinarySourceResult {
  const audit = new AuditTrail();
  const sources = input.form8960Sources;
  const deductions = context.deductions;
  if (!context.magi.isFinite() || !context.niitThreshold.isFinite() || context.niitThreshold.lt(0)) throw new Error('Form8960 requires finite actual MAGI and threshold');
  for (const [key, value] of Object.entries(deductions)) {
    if (typeof value !== 'boolean' && (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0))) throw new Error(`Form8960 requires finite nonnegative actual deduction ${key}`);
  }
  if (sources && (sources.sourceTaxYear !== input.taxpayer.taxYear || sources.sourceFactsConfirmed !== true || !sources.sourceReference?.trim())) {
    throw new Error('Form8960 requires actual source year, reference and confirmation');
  }
  const classifications = sources?.annuities ?? [];
  const forms = input.form1099R ?? [];
  const sourceIds = new Set<string>();
  for (const source of classifications) {
    const sourceId = source.sourceId;
    const match = /^form1099R:(0|[1-9]\d*)$/.exec(sourceId ?? '');
    if (!sourceId || !match || !Number.isSafeInteger(Number(match[1])) || !forms[Number(match[1])]) throw new Error('Form8960 annuity classification references a missing actual statement');
    if (sourceIds.has(sourceId)) throw new Error('Form8960 duplicate annuity source classification');
    sourceIds.add(sourceId);
  }
  let annuityIncome = d('0');
  const unverifiedAnnuitySourceIds: string[] = [];
  for (const [index, form] of forms.entries()) {
    const sourceId = `form1099R:${index}`;
    const classification = classifications.find(source => source.sourceId === sourceId);
    const code = form.distributionCode?.toUpperCase().replace(/\s/g, '') ?? '';
    const codeD = code.includes('D');
    const ira = isIraForm1099RDistribution(form);
    if (!codeD && !classification) {
      const gross = amount(form.grossDistribution, 'retirement gross distribution');
      const taxable = form.taxableAmount === undefined ? undefined : amount(form.taxableAmount, 'retirement taxable amount');
      if (!ira && taxable?.gt(gross)) throw new Error('Form8960 retirement taxable amount cannot exceed actual gross distribution');
      if (!ira && gross.gt(0) && (taxable === undefined || taxable.gt(0))) {
        if (sources?.annuities !== undefined || context.magi.gt(context.niitThreshold)) {
          throw new Error('Form8960 requires actual non-IRA pension/annuity classification; a generic distribution code does not prove an exempt plan');
        }
        unverifiedAnnuitySourceIds.push(sourceId);
      }
      continue;
    }
    if (form.accountHolder !== 'primary' && form.accountHolder !== 'spouse') throw new Error('Form8960 annuity source requires its actual owner');
    if (form.accountHolder === 'spouse' && context.filingStatus !== 'married_filing_jointly') throw new Error('Form8960 spouse annuity source requires an actual joint return');
    const gross = amount(form.grossDistribution, 'annuity gross distribution');
    const reportedTaxable = amount(form.taxableAmount, 'annuity taxable amount');
    if (reportedTaxable.gt(gross)) throw new Error('Form8960 annuity taxable amount cannot exceed actual gross distribution');
    const resolvedTaxable = resolveForm1099RTaxableAmount(form);
    const hasSimplifiedMethod = Object.entries(form).some(([key, value]) => key.startsWith('simplifiedMethod') && value !== undefined);
    if ((codeD || classification?.classification === 'nonqualified_annuity') && hasSimplifiedMethod) {
      throw new Error('Form8960 nonqualified annuities cannot use the Simplified Method; actual General Rule sources are required');
    }
    if (codeD && (ira || form.eligibleGovernmental457bPlan || form.qualifiedRothDistribution || form.disabilityPensionBeforeMinimumRetirementAge || d(form.retiredPublicSafetyOfficerInsurancePremiums).gt(0))) {
      throw new Error('Form8960 codeD nonqualified annuity conflicts with an excluded retirement-plan source');
    }
    if (codeD && (!/^(?:[12347C]?D|D[12347C]?)$/.test(code) || form.taxableAmountNotDetermined || !resolvedTaxable.eq(reportedTaxable))) throw new Error('Form8960 codeD annuity needs its actual supported distribution and taxable-source worksheet');
    if (classification) {
      const payerTin = form.payerTin?.replace(/-/g, '');
      if (!/^\d{9}$/.test(payerTin ?? '') || classification.payerTin?.replace(/-/g, '') !== payerTin
        || !form.payer.trim() || classification.payerName?.trim() !== form.payer.trim()) {
        throw new Error('Form8960 annuity classification must bind the actual statement payer name and TIN');
      }
      if (!form.accountReference?.trim() || classification.accountReference?.trim() !== form.accountReference.trim()) {
        throw new Error('Form8960 annuity classification must bind the actual statement account reference');
      }
      if (!classification.sourceReference?.trim() || classification.owner !== form.accountHolder
        || !amount(classification.grossDistribution, 'classified annuity gross distribution').eq(gross)
        || !amount(classification.taxableAmount, 'classified annuity taxable amount').eq(resolvedTaxable)) {
        throw new Error('Form8960 annuity classification must reconcile with the actual owner and statement amounts');
      }
      if (classification.classification === 'excluded_retirement_plan') {
        if (codeD) throw new Error('Form8960 codeD nonqualified annuity cannot be overridden as an exempt plan');
        const section = classification.excludedPlanSection;
        if (!section || !['401', '403a', '403b', '408', '408A', '457b'].includes(section)
          || (ira !== ['408', '408A'].includes(section))
          || (section === '457b' && form.eligibleGovernmental457bPlan !== true)) {
          throw new Error('Form8960 excluded annuity requires an actual consistent section1411 retirement-plan classification');
        }
        audit.record('Form8960 source WS', `${sourceId}:excluded-plan`, 'Actual excluded retirement distribution', resolvedTaxable, `Actual source plan section${section}; no NIIT inclusion`);
        continue;
      }
      if (classification.classification !== 'nonqualified_annuity' || classification.excludedPlanSection !== undefined || ira || form.eligibleGovernmental457bPlan) throw new Error('Form8960 requires an actual consistent annuity classification');
      if (!resolvedTaxable.eq(reportedTaxable) || form.taxableAmountNotDetermined) throw new Error('Form8960 nonqualified annuity needs its completed actual taxable-source worksheet');
    }
    annuityIncome = annuityIncome.plus(resolvedTaxable);
    audit.record('Form8960 source WS', `${sourceId}:taxable-annuity`, 'Actual taxable nonqualified annuity income', resolvedTaxable, 'Form1099R actual taxable amount; Form8960 instructions line3, without adding ordinary income again');
  }

  let taxDeduction = d('0');
  const taxes = sources?.ordinaryTaxAllocation;
  if (taxes) {
    if (!taxes.allocationMethodDescription?.trim() || taxes.noDuplicateDeductionConfirmed !== true) throw new Error('Form8960 tax allocation requires its actual documented method and confirmation that no deduction is used twice');
    let regularTotal = d('0');
    let allocableTotal = d('0');
    for (const key of ['incomeOrSalesTaxes', 'realPropertyTaxes', 'personalPropertyTaxes'] as const) {
      const source = taxes[key];
      const sourceAmount = amount(source?.sourceAmount, `${key} source amount`);
      const regular = amount(source?.regularDeductibleAmount, `${key} actual regular deduction`);
      const allocable = amount(source?.investmentAllocableAmount, `${key} actual investment allocation`);
      if (!sourceAmount.eq(deductions[key]) || regular.gt(sourceAmount) || allocable.gt(regular)) throw new Error('Form8960 tax allocation must reconcile with actual source amounts and allowed regular deductions');
      if (key === 'incomeOrSalesTaxes' && deductions.salesTaxElected && allocable.gt(0)) throw new Error('Form8960 sales taxes cannot be allocated to net investment income');
      regularTotal = regularTotal.plus(regular);
      allocableTotal = allocableTotal.plus(allocable);
      audit.record('Form8960 source WS', `taxes:${key}:regular`, 'Actual tax deduction after SALT limitation', regular, 'Actual completed source allocation; the categories share ScheduleA5e');
      audit.record('Form8960 source WS', `taxes:${key}:investment`, 'Actual tax expense allocable to investment income', allocable, 'Documented reasonable source allocation under Regulations1.1411-4(g)(1)');
    }
    if (!roundDollar(regularTotal).eq(deductions.saltDeduction)) throw new Error('Form8960 regular tax allocations must reconcile to actual ScheduleA5e');
    audit.record('Form8960 source WS', 'taxes:allocable-before-rounding', 'Actual tax allocations before reporting rounding', allocableTotal, 'Sum actual source cents before physical-line rounding');
    taxDeduction = roundDollar(allocableTotal);
  }
  let interest = deductions.itemized ? deductions.investmentInterest : d('0');
  let loss = deductions.itemized ? deductions.ordinaryLoss : d('0');
  let taxesAllowed = deductions.itemized ? taxDeduction : d('0');
  const total = sum(interest, loss, taxesAllowed);
  const limit = deductions.itemized ? min(total, deductions.allowedItemizedDeductions) : d('0');
  const allocation = sources?.itemizedAllocation;
  if (allocation) {
    const actualInterest = amount(allocation.investmentInterest, 'itemized interest allocation');
    const actualLoss = amount(allocation.ordinaryLoss, 'itemized ordinary-loss allocation');
    const actualTaxes = allocation.investmentIncomeTaxes === undefined && taxesAllowed.isZero() ? d('0') : amount(allocation.investmentIncomeTaxes, 'itemized tax allocation');
    if (actualInterest.gt(interest) || actualLoss.gt(loss) || actualTaxes.gt(taxesAllowed) || !sum(actualInterest, actualLoss, actualTaxes).eq(limit)) throw new Error('Form8960 itemized allocation must reconcile with allowed source deductions and their combined limit');
    interest = actualInterest; loss = actualLoss; taxesAllowed = actualTaxes;
  } else if (total.gt(limit)) {
    if ([interest, loss, taxesAllowed].filter(value => value.gt(0)).length > 1) throw new Error('Form8960 requires an actual itemized allocation when section68 limits multiple NIIT deductions');
    interest = min(interest, limit); loss = min(loss, limit); taxesAllowed = min(taxesAllowed, limit);
  }
  if (taxes || allocation || total.gt(0)) audit.record('Form8960 source WS', 'itemized-limit', 'Actual combined NIIT itemized deduction allowance', limit, 'One actual final post-section68 allowance across interest,taxes and ordinary loss');
  return { annuityIncome, investmentInterestExpense: interest, investmentIncomeTaxes: taxesAllowed, ordinaryLossDeduction: loss, unverifiedAnnuitySourceIds, lines: audit.getLines() };
}
