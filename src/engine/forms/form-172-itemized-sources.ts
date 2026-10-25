/** Ordinary current-loss itemized sources; spec/federal/form-172-itemized-origin.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { getConstants } from "@/models/constants.js";
import type { ScheduleAResult } from "@/engine/schedules/schedule-a.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { calculateForm4952 } from "./form-4952.js";
import { calculateStateLocalIncomeTaxDeduction } from "./state-local-income-tax-deduction.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";

interface Form172ItemizedSourceResult {
  regular: Decimal;
  alternative: Decimal;
  investment: Decimal;
  lines: CalculatedLine[];
}

export function calculateForm172ItemizedSources(input: TaxYearInput, context: {
  agi: Decimal;
  deductionAmount: Decimal;
  scheduleA?: ScheduleAResult;
  investmentIncome: Decimal;
  alternativeTaxPrivateActivityInterest: Decimal;
}): Form172ItemizedSourceResult {
  const year = input.taxpayer.taxYear;
  const nonnegative = (value: string | undefined, label: string): Decimal => {
    const amount = d(value);
    if (!amount.isFinite() || amount.lt(0)) throw new Error(`Form172 ${label} must be finite and nonnegative`);
    return amount;
  };
  const medical = nonnegative(input.scheduleA?.medicalExpenses, "medical expenses");
  const personalProperty = nonnegative(input.scheduleA?.personalPropertyTaxes, "personal property taxes");
  for (const form of input.form1098) nonnegative(form.propertyTax, "property taxes");
  nonnegative(input.scheduleA?.investmentInterestExpense, "investment interest");
  let sales: Decimal | undefined;
  let salesElected = false;
  if (input.salesTaxDeduction) {
    const source = input.salesTaxDeduction;
    if (source.method !== "actual") throw new Error("Form172 sales-tax table sources require their separate actual-year method");
    sales = sum(nonnegative(source.actualGeneralSalesTax, "actual receipt sales taxes"),
      ...source.specificPurchaseSalesTax.map(row => nonnegative(row.salesTaxPaid, "specific purchase sales taxes")));
    salesElected = !source.autoCompare || sales.gt(calculateStateLocalIncomeTaxDeduction(input).total);
  }
  const regularInterest = input.form4952 ? calculateForm4952(input.form4952, year) : undefined;
  const alternativeInterest = input.form4952Amt ? calculateForm4952(input.form4952Amt, year) : undefined;
  if (regularInterest || alternativeInterest || d(input.scheduleA?.investmentInterestExpense).gt(0)) {
    if (!regularInterest?.sourceFactsVerified) throw new Error("Form172 investment interest requires actual complete regular source facts");
    if (!alternativeInterest?.sourceFactsVerified) throw new Error("Form172 requires separate actual AMT investment interest sources");
    const qualifiedDividends = roundDollar(sum(...input.form1099Div.map(source => d(source.qualifiedDividends))));
    for (const [calculation, income] of [
      [regularInterest, context.investmentIncome],
      [alternativeInterest, context.investmentIncome.plus(context.alternativeTaxPrivateActivityInterest)],
    ] as const) {
      if (!calculation.line4a.eq(roundDollar(income)) || !calculation.line4b.eq(qualifiedDividends)) {
        throw new Error("Form172 investment-interest sources must reconcile to actual ordinary investment income");
      }
      if (!calculation.line4d.isZero() || !calculation.line4e.isZero() || !calculation.line5.isZero()) {
        throw new Error("Form172 investment gains and other investment expense classifications require their separate source method");
      }
    }
    if (!alternativeInterest.line4g.eq(Decimal.min(regularInterest.line4g, alternativeInterest.line4b.plus(alternativeInterest.line4e)))) {
      throw new Error("Form172 AMT investment election must reconcile to the actual regular election");
    }
  }
  const fresh = calculateScheduleA(input, context.agi, input.taxpayer.filingStatus, getConstants(year), {
    medicalExpenses: medical, personalPropertyTaxes: personalProperty,
    investmentInterestExpense: regularInterest?.deductibleAmount ?? d("0"),
    salesTaxDeduction: salesElected ? sales : undefined, salesTaxElected: salesElected,
  });
  const taxSource = fresh.lines.filter(line => line.form === "Sched A" && line.line === "5a");
  if (taxSource.length !== 1 || (!fresh.salesTaxElected && !taxSource[0].value.isZero())) {
    throw new Error("Form172 state/local income-tax business and nonbusiness classification requires actual source attribution");
  }
  if ([fresh.foreignIncomeTaxDeduction, fresh.mortgageInsurancePremiums, fresh.casualtyLossDeduction,
    fresh.cashCharitable, fresh.nonCashCharitable, fresh.charitablePriorYearUsed, fresh.otherItemizedDeductions].some(value => !value.isZero())) {
    throw new Error("Form172 other itemized deduction classifications require their separate regular and AMT source methods");
  }
  const mortgage = fresh.mortgageInterest.plus(fresh.mortgageWorksheet.deductiblePoints);
  if (mortgage.gt(0)) {
    if (!fresh.mortgageWorksheet.sourceFactsVerified || !input.mortgageInterestWorksheet) {
      throw new Error("Form172 mortgage deduction requires actual complete Pub936 source facts");
    }
    // Current cash payments omit prior amortized points and prepaid interest.
    // Use the qualified deductions produced from every actual loan's sources.
    if (fresh.mortgageWorksheet.sourceDeductions.some(source => {
      const loan = input.mortgageInterestWorksheet?.loans.find(row => row.sourceId === source.sourceId);
      if (!loan) throw new Error("Form172 mortgage deduction source identity does not reconcile");
      return loan.homeUse !== "main" && source.interestBeforeLimit.plus(source.pointsBeforeLimit).gt(0);
    })) {
      throw new Error("Form172 second-home AMT qualified dwelling facts require their separate source method");
    }
  }
  const components = ["medicalDeduction", "saltDeduction", "foreignIncomeTaxDeduction", "mortgageInterest",
    "mortgageInsurancePremiums", "investmentInterestDeduction", "casualtyLossDeduction", "cashCharitable",
    "nonCashCharitable", "otherItemizedDeductions", "totalItemized"] as const;
  if (!context.scheduleA || components.some(key => !Decimal.isDecimal(context.scheduleA?.[key])
    || !fresh[key].eq(context.scheduleA[key])) || fresh.salesTaxElected !== context.scheduleA.salesTaxElected
    || !fresh.mortgageWorksheet.deductiblePoints.eq(context.scheduleA.mortgageWorksheet.deductiblePoints)
    || !context.deductionAmount.eq(fresh.totalItemized)) {
    throw new Error("Form172 itemized source components and selected deduction must reconcile");
  }
  // The cap and nonbusiness limit may hide a changed source total. Bind the
  // original line amounts as well as the ultimately allowed deductions.
  for (const sourceLine of fresh.lines.filter(line => line.form === "Sched A")) {
    const saved = context.scheduleA.lines.filter(line => line.form === "Sched A" && line.line === sourceLine.line);
    if (saved.length !== 1 || !Decimal.isDecimal(saved[0].value) || !saved[0].value.eq(sourceLine.value)) {
      throw new Error("Form172 itemized source lines must reconcile before limitation");
    }
  }
  const regular = sum(fresh.medicalDeduction, fresh.saltDeduction, mortgage, fresh.investmentInterestDeduction);
  if (!regular.eq(fresh.totalItemized)) throw new Error("Form172 ordinary itemized source components do not reconcile");
  const alternative = sum(fresh.medicalDeduction, mortgage, alternativeInterest?.deductibleAmount ?? d("0"));
  const investment = fresh.investmentInterestDeduction;
  const audit = new AuditTrail();
  audit.record("Current Form172 itemized sources", "regular", "Regular nonbusiness itemized deductions", regular,
    "Actual medical, personal taxes, principal-residence interest/points and allowed ordinary investment interest");
  audit.record("Current Form172 itemized sources", "alternative", "Alternative nonbusiness itemized deductions", alternative,
    "Same regular-AGI medical and verified principal-residence costs plus separate AMT investment interest; personal taxes excluded");
  audit.record("Current Form172 itemized sources", "investment", "Investment-origin itemized deductions", investment,
    "Actual allowed ordinary investment interest; active nontrading business and personal costs excluded");
  return { regular, alternative, investment, lines: audit.getLines() };
}
