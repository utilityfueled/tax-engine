/** Spec: form-2555-all-foreign-capital-loss.yaml. Current source validation only. */
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { Form2555AllForeignCapitalLossSchema } from '@/models/form-2555-all-foreign-capital-loss.js';
import { roundDollar } from '@/utils/decimal.js';

interface CanonicalCurrentBusiness {
  input: TaxYearInput; source: unknown; grossIncome: Decimal; netProfit: Decimal;
  foreignGrossIncome: Decimal; foreignBusinessExpenses: Decimal; currentForeignEarned: Decimal;
  actualExcludedIncome: Decimal; actualSeDeduction: Decimal; materialLossBoundary: Decimal;
}

/** Reconcile the actual printed-percentage loss worksheet before any guard exception. */
export function resolveForm2555AllForeignCapitalLoss(context: CanonicalCurrentBusiness) {
  const facts = Form2555AllForeignCapitalLossSchema.parse(context.source), input = context.input;
  const business = input.scheduleC, form = input.form2555, rows = form?.sourceMapping?.rows;
  const row = rows?.[0];
  const fail = (message: string): never => { throw new Error(`Form2555 all-foreign capital loss ${message}`); };
  const sameName = (left: string, right: string | undefined) => left.trim().replace(/\s+/g, ' ').toLowerCase() === right?.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!business || !form || rows?.length !== 1 || row?.sourceId !== 'scheduleC') return fail('requires its sole actual ScheduleC source');
  if (facts.taxYear !== input.taxpayer.taxYear || facts.accountHolder !== form.accountHolder
    || facts.accountHolder !== business.accountHolder || !sameName(facts.businessName, business.businessName)
    || facts.businessEin.replace(/-/g, '') !== business.ein?.replace(/-/g, '')
    || facts.businessIncomeSourceReference !== row.sourceReference.trim()
    || facts.expenseSourceReference !== row.foreignBusinessExpenseSourceReference?.trim()) return fail('original identity year owner or reference does not reconcile');
  if (row.capitalMaterialIncomeFactor !== true || row.allBusinessIncomeForeignConfirmed !== true || row.mixedCapitalServices !== undefined
    || business.accountingMethod !== 'cash' || business.allInvestmentAtRisk !== true || business.qbiMateriallyParticipated !== true)
    return fail('requires actual wholly foreign active all-at-risk cash services');

  const zero = (value: string | undefined) => value === undefined || new Decimal(value).isZero();
  const requiredZero = ['businessW2WagesPaid', 'businessUbiaQualifiedProperty', 'businessWithholding', 'priorServiceReceipts',
    'priorBusinessExpenses', 'priorQbiLoss', 'priorActiveQbiLoss', 'priorEblNol', 'priorGeneralNol', 'priorSuspendedLosses', 'retirementContributions'] as const;
  if (requiredZero.some(key => !new Decimal(facts[key]).isZero()) || !zero(business.w2WagesPaid) || !zero(business.ubiaQualifiedProperty)
    || !zero(row.priorYearIncomeReceived) || !context.actualSeDeduction.isZero()) return fail('requires actual zero wages property withholding retirement and loss histories');
  // The explicit original zeros above establish absence; legacy omitted fields never do so alone.
  for (const values of [input.priorYear, input.adjustments]) for (const value of Object.values(values ?? {})) {
    if (Array.isArray(value) ? value.length > 0 : typeof value !== 'string' || !new Decimal(value).isZero())
      return fail('requires its separate prior carry or adjustment method');
  }
  const permitted = new Set(['taxpayer', 'standardDeductionFacts', 'scheduleC', 'form2555', 'priorYear', 'adjustments']);
  for (const [key, value] of Object.entries(input)) {
    if (!permitted.has(key) && (Array.isArray(value) ? value.length > 0 : value !== undefined))
      return fail('requires a separate other activity payment credit or source composition');
  }
  if (business.homeOffice || business.sourceFacts || business.professionalWagering || business.standardMileage
    || Object.entries(business.expenses ?? {}).some(([key, value]) => key !== 'supplies' && !zero(value))
    || !zero(business.returnsAndAllowances) || !zero(business.costOfGoodsSold) || !zero(business.otherIncome))
    return fail('requires actual current supplies without other expense or inventory methods');

  const gross = new Decimal(facts.grossIncome), expenses = new Decimal(facts.currentBusinessExpenses);
  const allowance = new Decimal(facts.reasonableServicesAllowance), percentage = new Decimal(facts.allocationPercentage);
  if (!gross.gt(0) || !allowance.gt(0) || allowance.gt(gross) || !context.netProfit.lt(0)
    || context.netProfit.negated().gt(context.materialLossBoundary)
    || !gross.eq(context.grossIncome) || !gross.eq(context.foreignGrossIncome)
    || !expenses.eq(gross.minus(context.netProfit)) || !expenses.eq(context.foreignBusinessExpenses)
    || business.expenses?.supplies === undefined || !expenses.eq(business.expenses.supplies)
    || !allowance.eq(context.currentForeignEarned) || row.reasonableServicesAllowance === undefined || !allowance.eq(row.reasonableServicesAllowance))
    return fail('must reconcile the actual strictly negative current business and nonmaterial loss boundary');
  if (form.electionsValidConfirmed !== true || form.eligibilityConfirmed !== true || form.claimForeignEarnedIncomeExclusion !== true
    || form.claimHousingExclusionOrDeduction !== false || form.isSelfEmployed !== true
    || !allowance.eq(context.actualExcludedIncome) || !zero(form.priorYearIncomeReceived) || !zero(form.priorYearIncomeExclusion)
    || !zero(form.priorYearHousingDeductionCarryover) || !zero(form.qualifiedHousingExpenses)
    || !zero(form.employerProvidedForeignEarnedIncome) || !zero(form.foreignEarnedIncomeTaxWorksheetDisallowedDeductions))
    return fail('requires its actual valid current exclusion choice without other allocable amounts');
  const expectedPercentage = allowance.div(gross).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const allocatedDeductions = roundDollar(expenses.times(percentage).div(100));
  if (!percentage.eq(expectedPercentage) || !allocatedDeductions.eq(facts.allocatedDeductions)
    || form.deductionsAllocableToExcludedIncome === undefined || !allocatedDeductions.eq(form.deductionsAllocableToExcludedIncome))
    return fail('actual printed-percentage worksheet and line44 do not reconcile');
  return { allocatedDeductions, foreignNetProfit: context.netProfit };
}
