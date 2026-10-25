/** Pub974 Simplified Step3. Spec: spec/federal/marketplace-health-deduction.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8962Result } from "./form-8962.js";
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { calculateMarketplaceHealthLimit, type MarketplaceHealthLimitResult } from "./marketplace-health-limit.js";

export interface MarketplaceHealthDeductionAmount {
  businessSourceId: string;
  accountHolder: "primary" | "spouse";
  specifiedPremiums: Decimal;
  remainingEarnedIncome: Decimal;
  allocatedCredit: Decimal;
  netPremiumsAfterCredit: Decimal;
  ordinaryDeduction: Decimal;
  nonspecifiedDeduction: Decimal;
}
export function calculateMarketplaceHealthDeduction(params: {
  input: TaxYearInput; groups: MarketplaceHealthPremiumGroup[]; credit: Form8962Result;
  historicalLimit?: MarketplaceHealthLimitResult;
}) {
  const { input, groups, credit } = params;
  const year = input.taxpayer.taxYear;
  if (![2025,2026].includes(year) || credit.taxYear !== year || !credit.sourceFactsVerified || (year === 2026 && credit.repaymentCap !== null)) throw new Error("Pub974 requires actual matching-year Form8962 source results.");
  let historicalLimit: MarketplaceHealthLimitResult | undefined;
  if (year === 2025) {
    if (!params.historicalLimit) throw new Error("Pub9742025 requires the actual completed W/X limit.");
    historicalLimit = calculateMarketplaceHealthLimit({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups,
      householdIncomeAfterW: params.historicalLimit.householdIncomeAfterW, federalPovertyLine: params.historicalLimit.federalPovertyLine, orderedDeductions: params.historicalLimit.orderedDeductions });
    if (!historicalLimit.maximumSpecifiedDeduction.eq(params.historicalLimit.maximumSpecifiedDeduction)
      || historicalLimit.repaymentLimit?.toFixed() !== params.historicalLimit.repaymentLimit?.toFixed()) throw new Error("Pub9742025 maximum contradicts its actual W/X sources.");
    if (!credit.taxpayerEligible && historicalLimit.specifiedAdvances.gt(0) && historicalLimit.repaymentLimit?.lt(historicalLimit.specifiedAdvances)) throw new Error("Pub9742025 ineligible coverage needs its actual capped-repayment ordinary-premium coordination.");
  } else if (params.historicalLimit) throw new Error("Historical capped-repayment facts cannot change the2026 worksheet.");
  const months = input.form8962?.monthlyReconciliation;
  if (!months) throw new Error("Pub974 needs actual household monthly sources.");
  const creditAudit = (line: string, required: boolean): Decimal => {
    const entries = credit.lines.filter(row => row.form === "Form 8962" && row.line === line);
    if (entries.length > 1 || (required && entries.length !== 1)) throw new Error("Pub974 requires a unique actual Form8962 credit audit.");
    if (entries.length === 0) return d(0); // Only an explicitly ineligible branch may omit the column.
    const value = entries[0].value;
    if (!value.isFinite() || value.lt(0)) throw new Error("Pub974 credit audit must be finite and nonnegative.");
    if (!required && !value.isZero()) throw new Error("Pub974 ineligible coverage contradicts its credit audit.");
    return value;
  };
  if (!creditAudit("24", true).eq(credit.ptcAllowed) || typeof credit.taxpayerEligible !== "boolean") throw new Error("Pub974 retained credit must reconcile its actual audit and eligibility.");
  const monthlyCredits = new Map<number, Decimal>();
  if (credit.calculationMethod === "annual") {
    if (months.length !== 12 || credit.lines.some(row => row.form === "Form 8962" && /^(1[2-9]|2[0-3])e$/.test(row.line))) throw new Error("Pub974 annual credit audit contradicts monthly sources.");
    const annual = creditAudit("11e", credit.taxpayerEligible && months.every(row => row.coverageEligible && !row.incomeBasedSepEnrollment));
    if (!annual.eq(credit.ptcAllowed)) throw new Error("Pub974 annual credit audit does not reconcile line24.");
    for (const month of months) monthlyCredits.set(month.month, annual.div(12));
  } else {
    if (credit.lines.some(row => row.form === "Form 8962" && row.line === "11e")) throw new Error("Pub974 monthly credit audit contradicts annual sources.");
    for (const month of months) {
      if (monthlyCredits.has(month.month)) throw new Error("Pub974 monthly credit source is duplicated.");
      monthlyCredits.set(month.month, creditAudit(`${month.month + 11}e`, credit.taxpayerEligible && month.coverageEligible && !month.incomeBasedSepEnrollment));
    }
    if (!sum(...monthlyCredits.values()).eq(credit.ptcAllowed)) throw new Error("Pub974 monthly credit audits do not reconcile line24.");
  }
  const audit = new AuditTrail();
  const seen = new Set<string>();
  for (const month of months) {
    const specified = sum(...groups.flatMap(group => group.months.filter(row => row.month === month.month).map(row => row.specifiedPremium)));
    if (specified.gt(d(month.enrolleePremium))) throw new Error("Pub974 business sources duplicate actual household premiums.");
  }
  const businesses: MarketplaceHealthDeductionAmount[] = groups.map(group => {
    if (seen.has(group.businessSourceId)) throw new Error("Duplicate Pub974 business source.");
    seen.add(group.businessSourceId);
    if (!group.remainingEarnedIncome.isFinite()) throw new Error("Pub974 signed income must be finite.");
    for (const amount of [group.specifiedPremiums, group.nonspecifiedDeduction]) if (!amount.isFinite() || amount.lt(0)) throw new Error("Pub974 source limits must be finite and nonnegative.");
    if (!sum(...group.months.map(month => month.specifiedPremium)).eq(group.specifiedPremiums)) throw new Error("Pub974 specified monthly sources do not reconcile.");
    let allocatedCredit = d(0);
    const seenMonths = new Set<number>();
    for (const month of group.months) {
      if (seenMonths.has(month.month)) throw new Error("Duplicate Pub974 specified source month.");
      seenMonths.add(month.month);
      const household = months.find(row => row.month === month.month);
      if (!household || !month.specifiedPremium.isFinite() || month.specifiedPremium.lt(0)) throw new Error("Pub974 requires actual corresponding household month.");
      const premium = d(household.enrolleePremium);
      if (month.specifiedPremium.gt(premium)) throw new Error("Pub974 specified premiums exceed the actual household enrollment source.");
      if (month.specifiedPremium.isZero()) continue;
      if (premium.lte(0)) throw new Error("Pub974 positive specified source needs actual enrollment premium.");
      const monthlyCredit = monthlyCredits.get(month.month);
      if (monthlyCredit === undefined) throw new Error("Pub974 source month has no reconciled credit audit.");
      if (!monthlyCredit.isFinite() || monthlyCredit.lt(0)) throw new Error("Pub974 credit allocation must be finite and nonnegative.");
      allocatedCredit = allocatedCredit.plus(monthlyCredit.times(month.specifiedPremium).div(premium));
    }
    const netPremiumsAfterCredit = zeroFloor(group.specifiedPremiums.minus(allocatedCredit));
    const ordinaryDeduction = min(group.specifiedPremiums, zeroFloor(group.remainingEarnedIncome));
    for (const [line, label, amount, formula] of [
      ["1", "Actual specified premiums", group.specifiedPremiums, "Actual linked source ledger"],
      ["6", "PTC allocated to specified sources", allocatedCredit, "Actual monthly credit times specified enrollment share; annual unchanged credit divided by12"],
      ["7", "Specified premiums after PTC", netPremiumsAfterCredit, "max(0,line1-line6)"],
    ] as const) audit.record(`Pub974 Simplified ${group.businessSourceId}`, line, label, amount, formula, { "Owner": group.accountHolder });
    return { businessSourceId: group.businessSourceId, accountHolder: group.accountHolder, specifiedPremiums: group.specifiedPremiums,
      remainingEarnedIncome: group.remainingEarnedIncome, allocatedCredit, netPremiumsAfterCredit, ordinaryDeduction, nonspecifiedDeduction: group.nonspecifiedDeduction };
  });
  if (roundDollar(sum(...businesses.map(row => row.allocatedCredit))).gt(credit.ptcAllowed)) throw new Error("Pub974 source allocations duplicate the household credit.");
  const specifiedBusinesses = businesses.filter(row => groups.find(group => group.businessSourceId === row.businessSourceId)?.months.length);
  const maximumSpecifiedDeduction = historicalLimit?.maximumSpecifiedDeduction ?? min(sum(...specifiedBusinesses.map(row => row.specifiedPremiums)), zeroFloor(sum(...specifiedBusinesses.map(row => row.remainingEarnedIncome))));
  const specifiedDeduction = credit.taxpayerEligible
    ? min(sum(...businesses.map(row => row.netPremiumsAfterCredit)), maximumSpecifiedDeduction)
    : sum(...businesses.map(row => row.ordinaryDeduction));
  const nonspecifiedDeduction = sum(...businesses.map(row => row.nonspecifiedDeduction));
  const method = credit.taxpayerEligible ? (year === 2025 ? "pub974-simplified-2025" as const : "pub974-simplified-2026" as const)
    : (year === 2025 ? "ordinary-no-ptc-2025" as const : "ordinary-no-ptc-2026" as const);
  for (const [line, label, amount, formula] of [
    ["7", "Combined premiums after PTC", sum(...businesses.map(row => row.netPremiumsAfterCredit)), "Sum separate business line7"],
    ["8", "Combined specified-premium maximum", maximumSpecifiedDeduction, year === 2025 ? "Actual completed Y/Z20, X30 or W16 when no attributable advances" : "2026 uncapped X30: min(total specified premiums, combined remaining W earned limit)"],
    ["9", "Specified health deduction", specifiedDeduction, credit.taxpayerEligible ? "min(combined line7,line8), once" : "Ineligible Step2: ordinary separate business limits"],
    ["10", "Nonspecified health deduction", nonspecifiedDeduction, "Actual completed nonspecified worksheets, once"],
    ["11", "Combined health deduction", specifiedDeduction.plus(nonspecifiedDeduction), "Line9+line10; round Schedule1 transfer once"],
  ] as const) audit.record("Pub974 Simplified", line, label, amount, formula);
  return { method, businesses, maximumSpecifiedDeduction, specifiedDeduction, nonspecifiedDeduction, historicalLimit, lines: audit.getLines() };
}
export type MarketplaceHealthDeductionResult = ReturnType<typeof calculateMarketplaceHealthDeduction>;
