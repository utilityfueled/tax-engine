/** Form8960 — individual NIIT; spec/federal/form-8960.yaml. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus, YearConstants } from "@/models/constants.js";
import { zeroFloor, min, roundDollar, sum } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form8960Input {
  taxableInterest: Decimal;
  ordinaryDividends: Decimal;
  /** Actual signed Form1040line7a plus Schedule1line4, before lines5b/5c. */
  netCapitalGain: Decimal;
  annuityIncome?: Decimal;
  tradeOrBusinessIncome?: Decimal;
  nonInvestmentBusinessAdjustment?: Decimal;
  excludedDispositionAdjustment?: Decimal;
  passthroughDispositionAdjustment?: Decimal;
  cfcPficInvestmentAdjustment?: Decimal;
  otherModifications?: Decimal;
  /** Historical direct-call alias for the already-net business component. */
  otherInvestmentIncome?: Decimal;
  investmentInterestExpense?: Decimal;
  investmentIncomeTaxes?: Decimal;
  miscellaneousInvestmentExpenses?: Decimal;
  /** Historical aggregate. If components are supplied they must reconcile. */
  investmentExpenses?: Decimal;
  additionalModifications?: Decimal;
  magi: Decimal;
}

export interface Form8960Result {
  taxableInterest: Decimal;
  dividends: Decimal;
  netCapitalGain: Decimal;
  grossInvestmentIncome: Decimal;
  investmentExpenses: Decimal;
  additionalModifications: Decimal;
  netInvestmentIncome: Decimal;
  magi: Decimal;
  threshold: Decimal;
  magiExcess: Decimal;
  taxableBase: Decimal;
  niitTax: Decimal;
  requiresForm8960: boolean;
  lines: CalculatedLine[];
}

export function calculateForm8960(input: Form8960Input, filingStatus: FilingStatus, constants: YearConstants): Form8960Result {
  const audit = new AuditTrail();
  const zero = new Decimal(0);
  for (const [name, value] of Object.entries(input)) {
    if (value !== undefined && (!Decimal.isDecimal(value) || !value.isFinite())) throw new Error(`Form8960 ${name} must be finite`);
  }
  const deductions = [input.investmentInterestExpense, input.investmentIncomeTaxes, input.miscellaneousInvestmentExpenses, input.investmentExpenses, input.additionalModifications];
  if (deductions.some(value => value?.lt(0))) throw new Error("NIIT deduction amounts must be finite and nonnegative");
  const record = (line: string, description: string, value: Decimal, formula: string) => {
    audit.record("Form 8960", line, description, value, formula); return value;
  };
  const interest = record("1", "Taxable interest", input.taxableInterest, "Actual taxable interest");
  const dividends = record("2", "Ordinary dividends", input.ordinaryDividends, "Form1040line3b, including qualified dividends");
  const annuity = record("3", "Taxable investment annuities", input.annuityIncome ?? zero, "Actual nonqualified annuity income");
  const business = record("4a", "Business and rental income", input.tradeOrBusinessIncome ?? input.otherInvestmentIncome ?? zero, "Actual potentially subject business income");
  const businessAdjustment = record("4b", "Excluded business adjustment", input.nonInvestmentBusinessAdjustment ?? zero, "Actual non-section1411 business adjustment");
  const netBusiness = record("4c", "Combined business income", business.plus(businessAdjustment), "Lines4a+4b");
  if (input.otherInvestmentIncome !== undefined && input.tradeOrBusinessIncome !== undefined && !netBusiness.eq(input.otherInvestmentIncome)) throw new Error("Form8960 business sources must reconcile with the historical net alias");
  record("5a", "Net disposition gain or loss", input.netCapitalGain, "Signed Form1040line7a plus Schedule1line4");
  const excludedGain = record("5b", "Excluded disposition adjustment", input.excludedDispositionAdjustment ?? zero, "Actual excluded gains negative and losses positive");
  const passThroughGain = record("5c", "Pass-through disposition adjustment", input.passthroughDispositionAdjustment ?? zero, "Actual section1411(c)(4) adjustment");
  const netGains = record("5d", "Combined disposition income", sum(input.netCapitalGain, excludedGain, passThroughGain), "Lines5a+5b+5c");
  const cfcPfic = record("6", "CFC and PFIC investment adjustment", input.cfcPficInvestmentAdjustment ?? zero, "Actual applicable foreign-entity worksheet");
  const other = record("7", "Other investment modifications", input.otherModifications ?? zero, "Actual modifications not already reported");
  const grossInvestmentIncome = record("8", "Total investment income", sum(interest, dividends, annuity, netBusiness, netGains, cfcPfic, other), "Lines1+2+3+4c+5d+6+7");
  const hasComponents = input.investmentInterestExpense !== undefined || input.investmentIncomeTaxes !== undefined || input.miscellaneousInvestmentExpenses !== undefined;
  const componentExpenses = sum(input.investmentInterestExpense ?? zero, input.investmentIncomeTaxes ?? zero, input.miscellaneousInvestmentExpenses ?? zero);
  if (hasComponents && input.investmentExpenses !== undefined && !componentExpenses.eq(input.investmentExpenses)) throw new Error("Form8960 expense components must reconcile with their aggregate");
  // An old aggregate proves no component allocation. Keep its printed components blank.
  if (input.investmentExpenses === undefined || hasComponents) {
    record("9a", "Investment interest", input.investmentInterestExpense ?? zero, "Actual allowed investment interest");
    record("9b", "Allocable taxes", input.investmentIncomeTaxes ?? zero, "Actual allowable taxes allocated to investment income");
    record("9c", "Other allowed investment expenses", input.miscellaneousInvestmentExpenses ?? zero, "Actual regularly deductible investment expenses");
  }
  const investmentExpenses = record("9d", "Investment expense total", input.investmentExpenses ?? componentExpenses, "Lines9a+9b+9c or retained historical aggregate");
  const additionalModifications = record("10", "Additional modifications", input.additionalModifications ?? zero, "Actual properly allocable deductions not already included");
  const totalDeductions = record("11", "Total deductions and modifications", investmentExpenses.plus(additionalModifications), "Lines9d+10");
  const netInvestmentIncome = record("12", "Net investment income", zeroFloor(grossInvestmentIncome.minus(totalDeductions)), "max(0,line8-line11)");
  const magi = record("13", "Modified adjusted gross income", input.magi, "Actual MAGI worksheet result");
  const threshold = record("14", "Filing-status threshold", constants.niit.threshold[filingStatus], `${filingStatus} statutory threshold`);
  const magiExcess = record("15", "MAGI excess", zeroFloor(magi.minus(threshold)), "max(0,line13-line14)");
  const taxableBase = record("16", "Taxable base", min(netInvestmentIncome, magiExcess), "min(line12,line15)");
  const niitTax = record("17", "Net investment income tax", roundDollar(taxableBase.times(constants.niit.rate)), "Round line16*0.038");
  return { taxableInterest: interest, dividends, netCapitalGain: input.netCapitalGain, grossInvestmentIncome, investmentExpenses, additionalModifications, netInvestmentIncome, magi, threshold, magiExcess, taxableBase, niitTax, requiresForm8960: magi.gt(threshold), lines: audit.getLines() };
}
