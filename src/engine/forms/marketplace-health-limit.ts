/** Pub974 W/X source limit. Spec: spec/federal/marketplace-health-limit.yaml. */
import Decimal from "decimal.js";
import type { FilingStatus } from "@/models/inputs.js";
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, zeroFloor } from "@/utils/decimal.js";

export function calculateMarketplaceHealthLimit(params: {
  taxYear: number;
  filingStatus: FilingStatus;
  groups: MarketplaceHealthPremiumGroup[];
  /** Initial canonical pass prepares W17 before actual X household income exists. */
  stage?: "w" | "complete";
  /** Actual canonical X8+X13 after deducting W17, excluding ordered deductions. */
  householdIncomeAfterW?: Decimal;
  federalPovertyLine?: Decimal;
}) {
  if (params.taxYear !== 2025) throw new Error("This capped Marketplace worksheet requires tax year2025.");
  const audit = new AuditTrail();
  const seen = new Set<string>();
  const specified = params.groups.filter(row => row.months.length > 0);
  let specifiedPremiums = d(0), specifiedAdvances = d(0), remainingEarnedIncome = d(0), nonspecifiedDeduction = d(0);
  for (const group of params.groups) {
    if (seen.has(group.businessSourceId)) throw new Error("Duplicate Marketplace limit business source.");
    seen.add(group.businessSourceId);
    for (const value of [group.specifiedPremiums,group.nonspecifiedDeduction]) if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0)) throw new Error("Marketplace limit requires finite nonnegative source amounts.");
    if (!Decimal.isDecimal(group.remainingEarnedIncome) || !group.remainingEarnedIncome.isFinite()) throw new Error("Marketplace limit requires finite signed earned income.");
    if (!group.months.length && group.nonspecifiedDeduction.gt(0)) throw new Error("Historical W/X needs the separate non-Marketplace-business deduction coordination.");
    nonspecifiedDeduction = nonspecifiedDeduction.plus(group.nonspecifiedDeduction);
    if (!group.months.length) continue;
    const months = new Set<number>();
    let groupPremium = d(0);
    for (const month of group.months) {
      if (!Number.isInteger(month.month) || month.month < 1 || month.month > 12 || months.has(month.month)) throw new Error("Duplicate or invalid Marketplace limit month.");
      months.add(month.month);
      for (const value of [month.specifiedPremium,month.sourcePremium,month.advancePremiumTaxCredit]) if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0)) throw new Error("Marketplace limit requires finite actual monthly amounts.");
      if (month.specifiedPremium.gt(month.sourcePremium) || month.advancePremiumTaxCredit.gt(month.sourcePremium)) throw new Error("Marketplace specified premiums or advances exceed the actual enrollment source.");
      groupPremium = groupPremium.plus(month.specifiedPremium);
      if (month.sourcePremium.gt(0)) specifiedAdvances = specifiedAdvances.plus(month.advancePremiumTaxCredit.times(month.specifiedPremium).div(month.sourcePremium));
    }
    if (!groupPremium.eq(group.specifiedPremiums)) throw new Error("Marketplace monthly specified premiums must reconcile the business total.");
    specifiedPremiums = specifiedPremiums.plus(groupPremium);
    remainingEarnedIncome = remainingEarnedIncome.plus(group.remainingEarnedIncome);
  }
  if (!specified.length) throw new Error("Marketplace limit requires actual specified-plan sources.");
  const earnedLimit = zeroFloor(remainingEarnedIncome);
  const taxpayerPaidSpecifiedPremiums = specifiedPremiums.minus(specifiedAdvances);
  const preliminarySpecifiedDeduction = min(taxpayerPaidSpecifiedPremiums, earnedLimit);
  const remainingAfterW = earnedLimit.minus(preliminarySpecifiedDeduction);
  for (const [line,label,value,formula] of [
    ["1","Specified premiums",specifiedPremiums,"Actual source total"],
    ["2","Advances attributable to specified premiums",specifiedAdvances,"Actual monthly advance times specified enrollment share"],
    ["3","Specified premiums less advances",taxpayerPaidSpecifiedPremiums,"Line1-line2"],
    ["13","Combined earned income after attributable deductions",remainingEarnedIncome.plus(nonspecifiedDeduction),"Actual separate canonical business W4-13; preserve signed losses"],
    ["14","Nonspecified health deduction",nonspecifiedDeduction,"Actual completed nonspecified worksheets"],
    ["15","Remaining combined earned income",remainingEarnedIncome,"Line13-line14"],
    ["16","Initial specified deduction",preliminarySpecifiedDeduction,"min(line3,nonnegative line15)"],
    ["17","Initial total health deduction",nonspecifiedDeduction.plus(preliminarySpecifiedDeduction),"Line14+line16"],
  ] as const) audit.record("Pub974 Worksheet W",line,label,value,formula);
  const requiresWorksheetX = specifiedAdvances.gt(0);
  const worksheetXCompleted = requiresWorksheetX && params.stage !== "w";
  let repaymentLimit: Decimal | null = null;
  let maximumSpecifiedDeduction = preliminarySpecifiedDeduction;
  if (worksheetXCompleted) {
    const income = params.householdIncomeAfterW;
    const poverty = params.federalPovertyLine;
    if (!Decimal.isDecimal(income) || !income.isFinite()) throw new Error("WorksheetX requires actual finite canonical household income after W17.");
    if (!Decimal.isDecimal(poverty) || !poverty.isFinite() || poverty.lte(0)) throw new Error("WorksheetX requires the actual positive federal poverty line.");
    audit.record("Pub974 Worksheet W","19","Remaining earned income after initial deduction",remainingAfterW,"Nonnegative line15-line16");
    audit.record("Pub974 Worksheet X","5","Nonspecified health deduction",nonspecifiedDeduction,"WorksheetW14");
    audit.record("Pub974 Worksheet X","6","Initial specified deduction",preliminarySpecifiedDeduction,"WorksheetW16");
    audit.record("Pub974 Worksheet X","14","Canonical household income",income,"Actual taxpayer X8 plus required-filing dependent X13, after W17");
    audit.record("Pub974 Worksheet X","17b","Actual federal poverty line",poverty,"Return-year household size and region");
    const tiers = params.filingStatus === "single" ? [375,975,1625] : [750,1950,3250];
    for (let index = 0; index < tiers.length; index++) {
      const adjustment = min(remainingAfterW,d(tiers[index]));
      const adjustedIncome = zeroFloor(income.minus(adjustment));
      const percentage = adjustedIncome.div(poverty).times(100).floor();
      const line = [15,19,22][index];
      audit.record("Pub974 Worksheet X",String(line),"Tentative repayment reduction",adjustment,"min(WorksheetW19, actual statutory repayment tier)");
      audit.record("Pub974 Worksheet X",String(line+1),"Income after tentative repayment",adjustedIncome,`max(0,line14-line${line})`);
      audit.record("Pub974 Worksheet X",String(index === 0 ? 18 : line+2),"Poverty percentage for repayment test",percentage,`floor(line${line+1}/line17b times100)`);
      if (percentage.lt(200 + index * 100)) { repaymentLimit = d(tiers[index]); break; }
    }
    repaymentLimit ??= specifiedAdvances;
    const beforePremiumLimit = preliminarySpecifiedDeduction.plus(repaymentLimit);
    const premiumLimit = min(beforePremiumLimit,specifiedPremiums);
    maximumSpecifiedDeduction = min(premiumLimit,earnedLimit);
    for (const [line,label,value,formula] of [
      ["25","Historical repayment limitation",repaymentLimit,"First qualifying tier; otherwise WorksheetW2; replaces Form8962Table5"],
      ["26","Initial deduction plus repayment limit",beforePremiumLimit,"Line6+line25"],
      ["27","Specified premiums",specifiedPremiums,"WorksheetW1"],
      ["28","Premium-limited maximum",premiumLimit,"min(line26,line27)"],
      ["29","Remaining earned income",remainingEarnedIncome,"WorksheetW15"],
      ["30","Maximum specified deduction",maximumSpecifiedDeduction,"min(line28,nonnegative line29)"],
      ["31","Maximum total health deduction",maximumSpecifiedDeduction.plus(nonspecifiedDeduction),"Line5+line30"],
    ] as const) audit.record("Pub974 Worksheet X",line,label,value,formula);
  }
  return { taxYear: 2025, worksheetXCompleted, requiresWorksheetX, householdIncomeAfterW: params.householdIncomeAfterW, federalPovertyLine: params.federalPovertyLine,
    specifiedPremiums, specifiedAdvances, remainingEarnedIncome, nonspecifiedDeduction,
    preliminarySpecifiedDeduction, repaymentLimit, maximumSpecifiedDeduction, maximumHealthDeduction: maximumSpecifiedDeduction.plus(nonspecifiedDeduction), lines: audit.getLines() };
}
export type MarketplaceHealthLimitResult = ReturnType<typeof calculateMarketplaceHealthLimit>;
