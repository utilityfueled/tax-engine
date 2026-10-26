/** Reconcile actual Pub974 review sources without recalculating a redacted tax return. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";
import type { Form7206Result } from "@/engine/forms/form-7206.js";
import { calculateMarketplaceHealthPremiums } from "@/engine/forms/marketplace-health-premiums.js";
import { calculateMarketplaceHealthLimit } from "@/engine/forms/marketplace-health-limit.js";
import { calculateMarketplaceHealthDeduction } from "@/engine/forms/marketplace-health-deduction.js";
import { calculateMarketplaceOwnerDeductions } from "@/engine/forms/marketplace-health-owners.js";
import { d, roundDollar, sum } from "@/utils/decimal.js";

function exact(value: unknown): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error("Pub974 review requires actual finite calculation amounts.");
  return value;
}
function same(actual: unknown, expected: Decimal) {
  if (!exact(actual).eq(expected)) throw new Error("Pub974 review calculation does not reconcile its actual sources.");
}
const auditKey = (line: CalculatedLine) => `${line.form}\0${line.line}\0${line.inputs?.Owner ?? ""}\0${line.inputs?.Business ?? ""}`;
function audits(expected: CalculatedLine[], actual: CalculatedLine[], exactLength = true) {
  if (exactLength && expected.length !== actual.length) throw new Error("Pub974 review audit is incomplete or duplicated.");
  for (const line of expected) {
    const matches = actual.filter(row => auditKey(row) === auditKey(line));
    if (matches.length !== 1) throw new Error("Pub974 review requires each unique actual source audit.");
    same(matches[0].value, line.value);
  }
}
function line(lines: CalculatedLine[], form: string, number: string, value: Decimal, owner?: string) {
  const matches = lines.filter(row => row.form === form && row.line === number && (owner === undefined || row.inputs?.Owner === owner));
  if (matches.length !== 1) throw new Error("Pub974 review requires each unique business and aggregate audit.");
  same(matches[0].value, value);
}

export function assertMarketplaceHealthReviewSources(input: TaxYearInput, result: TaxReturnResult, physical: Form7206Result, nonspecified: Form7206Result) {
  const calculation = result.form7206, marketplace = result.marketplaceHealthInsurance, credit = result.form8962;
  if (!calculation || !input.form7206 || !marketplace || !credit || !credit.sourceFactsVerified || credit.taxYear !== 2025 || credit.orderedDeductionInterim) {
    throw new Error("Pub974 review requires actual completed health and final credit sources.");
  }
  const ordinary = marketplace.method === "ordinary-no-ptc-2025";
  if ((!ordinary && marketplace.method !== "pub974-simplified-2025")
    || calculation.marketplaceHandling !== (ordinary ? "ordinary-no-ptc" : "separate-specified-premiums")
    || credit.taxpayerEligible !== !ordinary) throw new Error("Pub974 review method contradicts the final actual calculation.");
  for (const amount of [marketplace.step2Credit, marketplace.finalCredit, marketplace.specifiedDeduction, marketplace.nonspecifiedDeduction, marketplace.maximumDeduction]) {
    if (exact(amount).lt(0)) throw new Error("Pub974 review requires nonnegative source calculation amounts.");
  }
  same(marketplace.finalCredit, credit.ptcAllowed);
  line(credit.lines, "Form 8962", "24", marketplace.finalCredit);
  if (ordinary && (!marketplace.step2Credit.isZero() || !marketplace.finalCredit.isZero())) throw new Error("Ordinary no-credit review contains a positive credit.");

  same(calculation.deduction, exact(physical.deduction));
  audits(physical.lines.filter(row => row.form === "Form 7206"), calculation.lines.filter(row => row.form === "Form 7206"));
  const ownerAudits = physical.lines.filter(row => row.form === "Pub974 Owner Allocation");
  audits(ownerAudits, calculation.lines.filter(row => row.form === "Pub974 Owner Allocation"));
  audits(ownerAudits, result.allLines.filter(row => row.form === "Pub974 Owner Allocation"));
  const { groups } = calculateMarketplaceHealthPremiums({ input, healthInsurance: nonspecified });
  if (groups.length !== marketplace.businesses.length || new Set(marketplace.businesses.map(row => row.businessSourceId)).size !== groups.length) {
    throw new Error("Pub974 review business sources are missing or duplicated.");
  }
  for (const group of groups) {
    const actual = marketplace.businesses.find(row => row.businessSourceId === group.businessSourceId);
    if (!actual || actual.accountHolder !== group.accountHolder) throw new Error("Pub974 review business source owner does not reconcile.");
    for (const key of ["specifiedPremiums", "remainingEarnedIncome", "nonspecifiedDeduction"] as const) same(actual[key], group[key]);
    if (exact(actual.allocatedCredit).lt(0) || roundDollar(actual.allocatedCredit).gt(roundDollar(group.specifiedPremiums))) throw new Error("Pub974 review credit allocation exceeds the actual source premium.");
    same(actual.netPremiumsAfterCredit, Decimal.max(0, group.specifiedPremiums.minus(actual.allocatedCredit)));
    same(actual.ordinaryDeduction, Decimal.min(group.specifiedPremiums, Decimal.max(0, group.remainingEarnedIncome)));
    for (const [number, amount] of [["1", group.specifiedPremiums], ["6", actual.allocatedCredit], ["7", actual.netPremiumsAfterCredit]] as const) {
      line(marketplace.lines, `Pub974 Simplified ${group.businessSourceId}`, number, amount, group.accountHolder);
    }
  }
  // Annual credit is allocated through12 monthly Decimal fractions; use the
  // same printed-dollar conservation boundary as the canonical source helper.
  if (roundDollar(sum(...marketplace.businesses.map(row => row.allocatedCredit))).gt(marketplace.step2Credit)) throw new Error("Pub974 review duplicates the actual Step2 credit.");
  const historical = marketplace.historicalLimit;
  if (!historical) throw new Error("Pub9742025 review needs the actual historical source worksheet.");
  const checkedLimit = calculateMarketplaceHealthLimit({ taxYear: 2025, filingStatus: input.taxpayer.filingStatus, groups,
    householdIncomeAfterW: historical.householdIncomeAfterW, federalPovertyLine: historical.federalPovertyLine, orderedDeductions: historical.orderedDeductions });
  for (const key of ["specifiedPremiums", "specifiedAdvances", "remainingEarnedIncome", "nonspecifiedDeduction", "specifiedBusinessNonspecifiedDeduction", "separateBusinessNonspecifiedDeduction", "preliminarySpecifiedDeduction", "maximumSpecifiedDeduction", "maximumHealthDeduction"] as const) same(historical[key], checkedLimit[key]);
  if (historical.repaymentLimit?.toFixed() !== checkedLimit.repaymentLimit?.toFixed()) throw new Error("Pub974 review historical repayment source does not reconcile.");
  audits(checkedLimit.lines, historical.lines);
  audits(historical.lines, result.allLines.filter(row => /^Pub974 Worksheet [WXYZ]/.test(row.form) || row.form === "Pub974 Separate Business Sources"));
  same(marketplace.maximumSpecifiedDeduction, checkedLimit.maximumSpecifiedDeduction);
  same(marketplace.nonspecifiedDeduction, exact(nonspecified.deduction));
  same(marketplace.maximumDeduction, checkedLimit.maximumSpecifiedDeduction.plus(marketplace.nonspecifiedDeduction));
  const net = sum(...marketplace.businesses.map(row => row.netPremiumsAfterCredit));
  const ownerDeduction = !ordinary && new Set(groups.filter(row => row.months.length > 0).map(row => row.accountHolder)).size > 1
    ? calculateMarketplaceOwnerDeductions({ taxYear: 2025, filingStatus: input.taxpayer.filingStatus, groups,
      stage: { kind: "final", businesses: marketplace.businesses } }).specifiedDeduction : undefined;
  same(marketplace.specifiedDeduction, ordinary ? sum(...marketplace.businesses.map(row => row.ordinaryDeduction)) : Decimal.min(ownerDeduction ?? net, checkedLimit.maximumSpecifiedDeduction));
  const combined = marketplace.specifiedDeduction.plus(marketplace.nonspecifiedDeduction);
  for (const [number, amount] of [["7", net], ["8", marketplace.maximumSpecifiedDeduction], ["9", marketplace.specifiedDeduction], ["10", marketplace.nonspecifiedDeduction], ["11", combined]] as const) line(marketplace.lines, "Pub974 Simplified", number, amount);
  if (marketplace.lines.length !== groups.length * 3 + 5) throw new Error("Pub974 review has unexpected or duplicated business audits.");
  audits(marketplace.lines, result.allLines.filter(row => row.form === "Pub974 Simplified" || row.form.startsWith("Pub974 Simplified ")));
  same(calculation.deductionToSchedule1, roundDollar(combined));
  same(result.schedule1?.seHealthInsurance, calculation.deductionToSchedule1);
  line(result.allLines, "Sched 1", "17", calculation.deductionToSchedule1);
  const ordered = result.allLines.filter(row => row.form === "Pub974 Ordered Deductions");
  const refigured = ordinary && historical.orderedDeductions.length > 0;
  if (ordered.length !== historical.orderedDeductions.length + (refigured ? 1 : 0)) throw new Error("Pub974 review ordered-source audit is missing or duplicated.");
  for (const deduction of historical.orderedDeductions) line(ordered, "Pub974 Ordered Deductions", deduction.kind, deduction.amount);
  if (refigured) line(ordered, "Pub974 Ordered Deductions", "ordinary-refigure", calculation.deductionToSchedule1);
  if (ordinary) same(calculation.deductionToSchedule1, roundDollar(exact(physical.deduction)));
  // The final credit differs from Step2. Reuse the actual final monthly credit
  // audit only to validate premium conservation, not to replace Step3's deduction.
  const finalAllocation = calculateMarketplaceHealthDeduction({ input, groups, credit, historicalLimit: checkedLimit });
  if (roundDollar(marketplace.specifiedDeduction.plus(sum(...finalAllocation.businesses.map(row => row.allocatedCredit))))
    .gt(roundDollar(sum(...groups.map(row => row.specifiedPremiums))))) throw new Error("Pub974 review deduction and final credit exceed actual source premiums.");
}
