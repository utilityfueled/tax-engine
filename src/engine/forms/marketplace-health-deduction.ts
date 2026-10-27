/** Pub974 Simplified Step3. Spec: spec/federal/marketplace-health-deduction.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form8962Result } from "./form-8962.js";
import type { MarketplaceHealthPremiumGroup } from "./marketplace-health-premiums.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import { calculateMarketplaceHealthLimit, type MarketplaceHealthLimitResult } from "./marketplace-health-limit.js";
import { calculateMarketplaceOwnerDeductions } from "./marketplace-health-owners.js";
import { readMarketplaceCreditAllocationSource } from "./marketplace-credit-allocation-source.js";
import { calculateMarketplaceNonspecifiedStop } from "./marketplace-nonspecified-stop.js";
import { calculateMarketplaceMarriageHealth } from "./marketplace-marriage-health.js";

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
  const selectedCreditMethod = readMarketplaceCreditAllocationSource(input);
  const year = input.taxpayer.taxYear;
  if (![2025,2026].includes(year) || credit.taxYear !== year || !credit.sourceFactsVerified || (year === 2026 && credit.repaymentCap !== null)) throw new Error("Pub974 requires actual matching-year Form8962 source results.");
  const nonspecifiedStop = calculateMarketplaceNonspecifiedStop(groups);
  const auditForm = nonspecifiedStop ? "Pub974 Nonspecified Stop" : "Pub974 Simplified";
  let historicalLimit: MarketplaceHealthLimitResult | undefined;
  if (nonspecifiedStop) {
    if (params.historicalLimit) throw new Error("Pub974 nonspecified stop does not retain W/X repayment limits.");
  } else if (year === 2025) {
    if (!params.historicalLimit) throw new Error("Pub9742025 requires the actual completed W/X limit.");
    historicalLimit = calculateMarketplaceHealthLimit({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups,
      householdIncomeAfterW: params.historicalLimit.householdIncomeAfterW, federalPovertyLine: params.historicalLimit.federalPovertyLine, orderedDeductions: params.historicalLimit.orderedDeductions });
    if (!historicalLimit.maximumSpecifiedDeduction.eq(params.historicalLimit.maximumSpecifiedDeduction)
      || historicalLimit.repaymentLimit?.toFixed() !== params.historicalLimit.repaymentLimit?.toFixed()) throw new Error("Pub9742025 maximum contradicts its actual W/X sources.");
    if (!credit.taxpayerEligible && historicalLimit.specifiedAdvances.gt(0) && historicalLimit.repaymentLimit?.lt(historicalLimit.specifiedAdvances)) throw new Error("Pub9742025 ineligible coverage needs its actual capped-repayment ordinary-premium coordination.");
  } else if (params.historicalLimit) throw new Error("Historical capped-repayment facts cannot change the2026 worksheet.");
  const marriage = calculateMarketplaceMarriageHealth({ input, credit, repaymentLimit: historicalLimit?.repaymentLimit ?? undefined });
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
      const marriageMonth = marriage?.calculation.months.find(row => row.month === month.month);
      const alternativeMonth = marriageMonth !== undefined && marriage?.calculation.electionApplies === true && month.month <= marriage.lastPreMarriageMonth;
      const value = creditAudit(`${month.month + 11}e`, alternativeMonth || (credit.taxpayerEligible && month.coverageEligible && !month.incomeBasedSepEnrollment));
      if (marriage && (marriageMonth ? !marriageMonth.credit.eq(value) : !value.isZero())) throw new Error("Pub974 monthly marriage credit does not reconcile the actual alternative calculation.");
      monthlyCredits.set(month.month, value);
    }
    if (!sum(...monthlyCredits.values()).eq(credit.ptcAllowed)) throw new Error("Pub974 monthly credit audits do not reconcile line24.");
  }
  const audit = new AuditTrail();
  const seen = new Set<string>();
  for (const month of months) {
    const specified = sum(...groups.flatMap(group => group.months.filter(row => row.month === month.month).map(row => row.specifiedPremium)));
    if (specified.gt(d(month.enrolleePremium))) throw new Error("Pub974 business sources duplicate actual household premiums.");
    const selectedPremium = sum(...groups.flatMap(group => group.months.filter(row => row.month === month.month).map(row => row.creditAllocationPremium ?? d(0))));
    if (selectedPremium.gt(d(month.enrolleePremium))) throw new Error("Pub974 chosen method duplicates actual household enrollment premiums.");
  }
  const businesses: MarketplaceHealthDeductionAmount[] = groups.map(group => {
    if (seen.has(group.businessSourceId)) throw new Error("Duplicate Pub974 business source.");
    seen.add(group.businessSourceId);
    if (!group.remainingEarnedIncome.isFinite()) throw new Error("Pub974 signed income must be finite.");
    for (const amount of [group.specifiedPremiums, group.nonspecifiedDeduction]) if (!amount.isFinite() || amount.lt(0)) throw new Error("Pub974 source limits must be finite and nonnegative.");
    if (!sum(...group.months.map(month => month.specifiedPremium)).eq(group.specifiedPremiums)) throw new Error("Pub974 specified monthly sources do not reconcile.");
    if (group.creditAllocationMethod !== undefined && group.creditAllocationMethod !== selectedCreditMethod) throw new Error("Pub974 source method contradicts the actual recorded allocation choice.");
    if (selectedCreditMethod && group.months.length && group.creditAllocationMethod !== selectedCreditMethod) throw new Error("Pub974 source group is missing the actual selected allocation method.");
    let allocatedCredit = d(0);
    const seenMonths = new Set<number>();
    for (const month of group.months) {
      if (seenMonths.has(month.month)) throw new Error("Duplicate Pub974 specified source month.");
      seenMonths.add(month.month);
      const household = months.find(row => row.month === month.month);
      if (!household || !month.specifiedPremium.isFinite() || month.specifiedPremium.lt(0)) throw new Error("Pub974 requires actual corresponding household month.");
      const premium = d(household.enrolleePremium);
      if (month.specifiedPremium.gt(premium)) throw new Error("Pub974 specified premiums exceed the actual household enrollment source.");
      const allocationPremium = group.creditAllocationMethod ? month.creditAllocationPremium : month.specifiedPremium;
      if (!allocationPremium || !allocationPremium.isFinite() || allocationPremium.lt(0) || allocationPremium.gt(month.sourcePremium)) throw new Error("Pub974 chosen allocation requires the actual qualified plan enrollment source.");
      if (allocationPremium.isZero()) continue;
      if (premium.lte(0)) throw new Error("Pub974 positive specified source needs actual enrollment premium.");
      const monthlyCredit = monthlyCredits.get(month.month);
      if (monthlyCredit === undefined) throw new Error("Pub974 source month has no reconciled credit audit.");
      if (!monthlyCredit.isFinite() || monthlyCredit.lt(0)) throw new Error("Pub974 credit allocation must be finite and nonnegative.");
      if (month.fullCorrespondingCredit && groups.filter(row => row.months.length).length !== 1) throw new Error("Coverage-family full credit requires one actual specified business.");
      allocatedCredit = allocatedCredit.plus(month.fullCorrespondingCredit ? monthlyCredit : monthlyCredit.times(allocationPremium).div(premium));
    }
    // A partial coverage-family plan subtracts its full corresponding credit
    // before adding nonspecified premiums. Keep that signed intermediate.
    // The established all-covered route caps credit at those same premiums;
    // its zero treatment also reconciles whole-dollar credit with source cents.
    const signedFamilyCredit = group.creditAllocationMethod !== undefined || group.months.some(month => month.fullCorrespondingCredit === true);
    const difference = group.specifiedPremiums.minus(allocatedCredit);
    const netPremiumsAfterCredit = signedFamilyCredit ? difference : zeroFloor(difference);
    const ordinaryDeduction = min(group.specifiedPremiums, zeroFloor(group.remainingEarnedIncome));
    for (const [line, label, amount, formula] of [
      ["1", "Actual specified premiums", group.specifiedPremiums, "Actual linked source ledger"],
      ["6", "PTC allocated to specified sources", allocatedCredit, group.creditAllocationMethod ? "Actual recorded consistent method: monthly credit times full eligible plan enrollment / household enrollment; no health benchmark ratio" : signedFamilyCredit ? "Full corresponding monthly credit for the actual one-business coverage-family sources; no health benchmark ratio" : "Actual monthly credit times specified enrollment share; annual unchanged credit divided by12"],
      ["7", "Specified premiums after PTC", netPremiumsAfterCredit, signedFamilyCredit ? "line1-line6; retain the signed Step3 intermediate" : "max(0,line1-line6); credit is bounded by the same coverage premiums"],
    ] as const) audit.record(`${auditForm} ${group.businessSourceId}`, line, label, amount, formula, { "Owner": group.accountHolder });
    return { businessSourceId: group.businessSourceId, accountHolder: group.accountHolder, specifiedPremiums: group.specifiedPremiums,
      remainingEarnedIncome: group.remainingEarnedIncome, allocatedCredit, netPremiumsAfterCredit, ordinaryDeduction, nonspecifiedDeduction: group.nonspecifiedDeduction };
  });
  if (roundDollar(sum(...businesses.map(row => row.allocatedCredit))).gt(credit.ptcAllowed)) throw new Error("Pub974 source allocations duplicate the household credit.");
  const specifiedBusinesses = businesses.filter(row => groups.some(group => group.businessSourceId === row.businessSourceId && group.months.length && group.includedInEarnedIncomeLimit !== false));
  const multipleOwners = new Set(specifiedBusinesses.map(row => row.accountHolder)).size > 1;
  const ownerMaximum = multipleOwners && !nonspecifiedStop ? calculateMarketplaceOwnerDeductions({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups, stage: { kind: "maximum" } }) : undefined;
  const maximumSpecifiedDeduction = nonspecifiedStop ? d(0) : historicalLimit?.maximumSpecifiedDeduction ?? ownerMaximum?.specifiedDeduction ?? min(sum(...specifiedBusinesses.map(row => row.specifiedPremiums)), zeroFloor(sum(...specifiedBusinesses.map(row => row.remainingEarnedIncome))));
  const ownerFinal = multipleOwners && credit.taxpayerEligible && !nonspecifiedStop
    ? calculateMarketplaceOwnerDeductions({ taxYear: year, filingStatus: input.taxpayer.filingStatus, groups, stage: { kind: "final", businesses } }) : undefined;
  const specifiedDeduction = nonspecifiedStop ? d(0) : credit.taxpayerEligible
    ? min(ownerFinal?.specifiedDeduction ?? sum(...businesses.map(row => row.netPremiumsAfterCredit)), maximumSpecifiedDeduction)
    : sum(...businesses.map(row => row.ordinaryDeduction));
  const nonspecifiedDeduction = sum(...businesses.map(row => row.nonspecifiedDeduction));
  if (roundDollar(specifiedDeduction.plus(nonspecifiedDeduction)).lt(0)) throw new Error("Pub974 combined health deduction cannot be negative; reconcile actual source attribution.");
  const method = nonspecifiedStop ? (year === 2025 ? "pub974-nonspecified-stop-2025" as const : "pub974-nonspecified-stop-2026" as const)
    : credit.taxpayerEligible ? (year === 2025 ? "pub974-simplified-2025" as const : "pub974-simplified-2026" as const)
    : (year === 2025 ? "ordinary-no-ptc-2025" as const : "ordinary-no-ptc-2026" as const);
  for (const [line, label, amount, formula] of [
    ["7", "Combined premiums after PTC", sum(...businesses.map(row => row.netPremiumsAfterCredit)), "Sum separate business line7"],
    ["8", "Combined specified-premium maximum", maximumSpecifiedDeduction, nonspecifiedStop ? "Every actual specified-plan business has exhausted its income after its own completed nonspecified claim; stop before W/X" : year === 2025 ? "Actual completed Y/Z20, X30 or owner-limited W16 when no attributable advances" : multipleOwners ? "Sum each owner's min(specified premiums, nonnegative remaining earned income)" : "2026 uncapped X30: min(total specified premiums, combined remaining W earned limit)"],
    ["9", "Specified health deduction", specifiedDeduction, nonspecifiedStop ? "Pub974 P/7206 stop: no additional specified deduction; actual final Form8962 calculated independently" : credit.taxpayerEligible ? multipleOwners ? "Sum each owner's min(net premiums after Step2 credit, nonnegative remaining earned income), subject to actual combined maximum; no spouse income transfer" : "min(combined line7,line8), once" : "Ineligible Step2: ordinary separate business limits"],
    ["10", "Nonspecified health deduction", nonspecifiedDeduction, "Actual completed nonspecified worksheets, once"],
    ["11", "Combined health deduction", specifiedDeduction.plus(nonspecifiedDeduction), "Line9+line10; round Schedule1 transfer once"],
  ] as const) audit.record(auditForm, line, label, amount, formula);
  return { method, businesses, maximumSpecifiedDeduction, specifiedDeduction, nonspecifiedDeduction, historicalLimit, lines: audit.getLines() };
}
export type MarketplaceHealthDeductionResult = Omit<ReturnType<typeof calculateMarketplaceHealthDeduction>, "method"> & {
  method: ReturnType<typeof calculateMarketplaceHealthDeduction>["method"] | "pub974-alternative-reentry-2026";
};
