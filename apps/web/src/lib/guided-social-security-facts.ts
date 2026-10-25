import Decimal from "decimal.js";
import { parseGuidedCurrency } from "./guided-currency";
import { amountError, hasEnteredAmount } from "./guided-required-facts";
import type { AdjustmentData, FilingStatus, PersonalInfoData, SocialSecurityData } from "./guided-interview-flow";

export interface SocialSecurityEntryData {
  sourceType?: "ssa-1099" | "rrb-1099" | "ssa-1042s" | "rrb-1042s" | "foreign" | "";
  sourceTaxYear?: string;
  accountReference?: string;
  beneficiaryRole?: "primary" | "spouse" | "other" | "";
  recipient?: string;
  beneficiaryTaxIdLast4?: string;
  benefitsPaid?: string;
  benefitsRepaid?: string;
  netBenefits: string;
  federalWithheld: string;
  priorYearBenefits?: boolean | null;
  priorYearBenefitsAmount?: string;
  sourceFactsConfirmed?: boolean | null;
}
export interface SocialSecurityEarlierYearData {
  taxYear: string;
  filingStatus: FilingStatus | "";
  livedWithSpouseAtAnyTimeDuringYear?: boolean | null;
  benefitsReceivedInEarlierYear: string;
  delayedBenefitsReceivedInCurrentYear: string;
  adjustedGrossIncome: string;
  taxExemptInterest: string;
  exclusionsAdjustments: string;
  taxableBenefitsPreviouslyReported: string;
  sourceFactsConfirmed?: boolean | null;
}
export interface SocialSecuritySourceData {
  entries?: SocialSecurityEntryData[];
  residentTreatmentConfirmed?: boolean | null;
  puertoRicoIncomeExclusion?: string;
  americanSamoaIncomeExclusion?: string;
  sourceFactsConfirmed?: boolean | null;
  lumpSumMethod?: "current-year" | "election" | "";
  earlierYears?: SocialSecurityEarlierYearData[];
  currentYearExclusionsAdjustments?: string;
}
export const emptySocialSecurityEntry: SocialSecurityEntryData = { netBenefits: "", federalWithheld: "" };
export const emptySocialSecurityEarlierYear: SocialSecurityEarlierYearData = { taxYear: "", filingStatus: "", benefitsReceivedInEarlierYear: "", delayedBenefitsReceivedInCurrentYear: "", adjustedGrossIncome: "", taxExemptInterest: "", exclusionsAdjustments: "", taxableBenefitsPreviouslyReported: "" };

export function isStartedSocialSecurity(entry: SocialSecurityEntryData): boolean {
  return Object.values(entry).some(value => typeof value === "string" ? value.trim() !== "" : typeof value === "boolean");
}
export function socialSecurityEntries(data: SocialSecurityData | undefined): SocialSecurityEntryData[] {
  if (!data) return [];
  return data.entries ?? (hasEnteredAmount(data.netBenefits) || hasEnteredAmount(data.federalWithheld) ? [{ netBenefits: data.netBenefits, federalWithheld: data.federalWithheld }] : []);
}
export function signedSourceAmountError(value: string | undefined, label: string): string | undefined {
  if (!hasEnteredAmount(value)) return `Enter the actual ${label}; blank is unknown.`;
  try { parseGuidedCurrency(value); } catch { return `Enter a valid ${label}.`; }
  return undefined;
}
export function socialSecuritySourceTotal(entries: SocialSecurityEntryData[], field: "netBenefits" | "federalWithheld"): Decimal | null {
  const included = entries.filter(entry => isStartedSocialSecurity(entry) && entry.beneficiaryRole !== "other");
  if (included.some(entry => !["primary", "spouse"].includes(entry.beneficiaryRole ?? "") || signedSourceAmountError(entry[field], field))) return null;
  return included.reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry[field])), new Decimal(0));
}
export function withSocialSecurityEntries(data: SocialSecurityData, entries: SocialSecurityEntryData[]): SocialSecurityData {
  return { ...data, entries, netBenefits: socialSecuritySourceTotal(entries, "netBenefits")?.toFixed() ?? "", federalWithheld: socialSecuritySourceTotal(entries, "federalWithheld")?.toFixed() ?? "", sourceFactsConfirmed: null };
}

export function socialSecurityFactErrors(data: SocialSecurityData | undefined, filingStatus?: FilingStatus | null, taxYear?: number | null, personalInfo?: PersonalInfoData, adjustments?: AdjustmentData): Record<string, string> {
  const errors: Record<string, string> = {};
  const entries = socialSecurityEntries(data).filter(isStartedSocialSecurity);
  if (!data || !entries.length) return errors;
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    const fail = (field: string, message: string) => { errors[`social-security-${index}-${field}`] = message; };
    if (!["ssa-1099", "rrb-1099"].includes(entry.sourceType ?? "")) fail("type", "Confirm the actual SSA-1099 or RRB-1099. Foreign or nonresident benefit statements need their separate source and treaty worksheet.");
    if (!["2025", "2026"].includes(entry.sourceTaxYear ?? "") || (taxYear != null && entry.sourceTaxYear !== String(taxYear))) fail("year", "Confirm the benefit statement year matches this return.");
    if (!entry.recipient?.trim()) fail("recipient", "Enter the actual legal beneficiary's name, which may differ from the representative payee.");
    if (!/^\d{4}$/.test(entry.beneficiaryTaxIdLast4 ?? "")) fail("beneficiary-id", "Enter the last four digits of the actual beneficiary's taxpayer ID from the statement.");
    if (!["primary", "spouse", "other"].includes(entry.beneficiaryRole ?? "")) fail("owner", "Confirm whose legal benefits this statement reports.");
    if (filingStatus && filingStatus !== "mfj" && entry.beneficiaryRole === "spouse") fail("owner", "A spouse's benefits belong only on their own return or a joint return.");
    const actualPerson = entry.beneficiaryRole === "primary" ? personalInfo : entry.beneficiaryRole === "spouse" ? personalInfo?.spouse : undefined;
    if (actualPerson && entry.beneficiaryTaxIdLast4 !== (actualPerson.ssn ?? "").replace(/-/g, "").slice(-4)) fail("beneficiary-id", "The source beneficiary ID does not match the selected taxpayer or spouse.");
    if (!entry.accountReference?.trim()) fail("reference", "Enter a local statement reference to identify duplicate or corrected benefit statements.");
    const key = `${entry.sourceType}|${entry.beneficiaryTaxIdLast4}|${entry.accountReference?.trim().toLowerCase()}`;
    if (ids.has(key)) fail("duplicate", "Reconcile duplicate or corrected benefit statements before calculation.");
    ids.add(key);
    for (const [field, label] of [["benefitsPaid", "gross benefits in Box 3"], ["benefitsRepaid", "benefits repaid in Box 4"], ["federalWithheld", "federal withholding"]] as const) { const error = amountError(entry[field], label); if (error) fail(field, error); }
    const netError = signedSourceAmountError(entry.netBenefits, "signed net benefits in Box 5");
    if (netError) fail("net", netError);
    else if (!amountError(entry.benefitsPaid, "benefits") && !amountError(entry.benefitsRepaid, "repayments") && !parseGuidedCurrency(entry.benefitsPaid).minus(parseGuidedCurrency(entry.benefitsRepaid)).eq(parseGuidedCurrency(entry.netBenefits))) fail("reconciliation", "Box 3 minus Box 4 must equal the signed Box 5 amount. Check the actual source rather than changing a computed total.");
    if (typeof entry.priorYearBenefits !== "boolean") fail("prior-year", "Confirm whether the statement includes benefits paid for earlier years.");
    if (entry.priorYearBenefits === true) {
      const error = amountError(entry.priorYearBenefitsAmount, "benefits paid for earlier years shown on this statement");
      if (error) fail("prior-amount", error);
      else if (!amountError(entry.benefitsPaid, "gross benefits") && parseGuidedCurrency(entry.priorYearBenefitsAmount).gt(parseGuidedCurrency(entry.benefitsPaid))) fail("prior-amount", "Benefits for earlier years cannot exceed the gross source benefits.");
    } else if (entry.priorYearBenefits === false && hasEnteredAmount(entry.priorYearBenefitsAmount) && (amountError(entry.priorYearBenefitsAmount, "prior benefits") || !parseGuidedCurrency(entry.priorYearBenefitsAmount).isZero())) fail("prior-amount", "Reconcile saved earlier-year benefit amounts with the answer that no earlier-year benefits were paid.");
    if (entry.sourceFactsConfirmed !== true) fail("confirmation", "Confirm this benefit source after its last edit.");
  });
  for (const field of ["netBenefits", "federalWithheld"] as const) {
    if (!data.entries || !hasEnteredAmount(data[field])) continue;
    const total = socialSecuritySourceTotal(entries, field);
    if (signedSourceAmountError(data[field], field) || total === null || !total.eq(parseGuidedCurrency(data[field]))) errors[`social-security-total-${field}`] = "Reconcile the saved aggregate with actual statement amounts belonging to this return.";
  }
  const included = entries.filter(entry => entry.beneficiaryRole !== "other");
  if (!included.length) return errors;
  if (data.residentTreatmentConfirmed !== true) errors.socialSecurityResidency = "Confirm that ordinary U.S. citizen/resident benefit rules apply; foreign or treaty/nonresident treatment needs its own worksheet.";
  if (personalInfo?.standardDeductionFacts?.nonresidentAlien === true && personalInfo.standardDeductionFacts.residentJointElection !== true) errors.socialSecurityResidency = "Reconcile actual nonresident status before using ordinary resident benefit rules.";
  for (const field of ["puertoRicoIncomeExclusion", "americanSamoaIncomeExclusion"] as const) { const error = amountError(data[field], field === "puertoRicoIncomeExclusion" ? "Puerto Rico excluded income" : "American Samoa excluded income"); if (error) errors[field] = error; }
  if (data.sourceFactsConfirmed !== true) errors.socialSecuritySourceFacts = "Confirm the current-year benefit treatment and exclusion facts after the last edit.";
  const net = socialSecuritySourceTotal(included, "netBenefits");
  if (net?.isNegative()) errors.socialSecurityRepayment = "Preserve negative net benefits. Excess repayments require their actual prior-year deduction or credit worksheet before this return can calculate.";
  const ira = adjustments?.iraContributions;
  if (ira && (ira.primaryIsActiveParticipant === true || ira.spouseIsActiveParticipant === true) && [ira.primaryContributions, ira.spouseContributions].some(value => !amountError(value, "contributions") && parseGuidedCurrency(value).gt(0))) errors.socialSecurityIra = "Social Security with retirement-plan-covered IRA contributions needs the actual Publication 590-A Appendix B interaction worksheet.";
  const priorBenefits = included.some(entry => entry.priorYearBenefits === true);
  if (priorBenefits && !["current-year", "election"].includes(data.lumpSumMethod ?? "")) errors.socialSecurityLumpSum = "Choose the actual current-year method or supply the earlier-year records for the lump-sum election comparison.";
  if (!priorBenefits && (data.lumpSumMethod === "election" || data.earlierYears?.length)) errors.socialSecurityLumpSum = "Reconcile saved earlier-year benefit records with the source answer that no prior-year benefits were received.";
  if (data.lumpSumMethod === "current-year" && data.earlierYears?.length) errors.socialSecurityLumpSum = "Review saved election history before switching to the current-year method; source history must not be silently ignored.";
  if (data.lumpSumMethod === "election") {
    const error = amountError(data.currentYearExclusionsAdjustments, "current-year total Publication 915 exclusion addbacks"); if (error) errors.socialSecurityCurrentExclusions = error;
    if (!error && [data.puertoRicoIncomeExclusion, data.americanSamoaIncomeExclusion].every(value => !amountError(value, "exclusion")) && parseGuidedCurrency(data.currentYearExclusionsAdjustments).lt(parseGuidedCurrency(data.puertoRicoIncomeExclusion).plus(parseGuidedCurrency(data.americanSamoaIncomeExclusion)))) errors.socialSecurityCurrentExclusions = "The actual aggregate cannot be less than the separately established possession exclusions.";
    if (!data.earlierYears?.length) errors.socialSecurityEarlierYears = "Enter each actual earlier-year return and delayed-benefit allocation for the election.";
    const years = new Set<string>(); let delayed = new Decimal(0);
    data.earlierYears?.forEach((year, index) => {
      const fail = (field: string, message: string) => { errors[`social-security-earlier-${index}-${field}`] = message; };
      if (!/^\d{4}$/.test(year.taxYear) || Number(year.taxYear) < 1994 || (taxYear != null && Number(year.taxYear) >= taxYear) || years.has(year.taxYear)) fail("year", "Use each actual supported earlier year once, from 1994 through the year before this return.");
      years.add(year.taxYear);
      if (!["single", "mfj", "mfs", "hoh", "qss"].includes(year.filingStatus)) fail("status", "Enter the actual filing status on that earlier return.");
      if (year.filingStatus === "mfs" && typeof year.livedWithSpouseAtAnyTimeDuringYear !== "boolean") fail("spouse", "Confirm whether you lived with your spouse during that earlier year.");
      for (const field of ["benefitsReceivedInEarlierYear", "delayedBenefitsReceivedInCurrentYear", "taxExemptInterest", "exclusionsAdjustments", "taxableBenefitsPreviouslyReported"] as const) { const error = amountError(year[field], field); if (error) fail(field, error); }
      const agiError = signedSourceAmountError(year.adjustedGrossIncome, "earlier-year adjusted gross income"); if (agiError) fail("agi", agiError);
      if (!amountError(year.delayedBenefitsReceivedInCurrentYear, "delayed benefits")) delayed = delayed.plus(parseGuidedCurrency(year.delayedBenefitsReceivedInCurrentYear));
      if (year.sourceFactsConfirmed !== true) fail("confirmation", "Confirm the actual earlier-year return, allocation and exclusion worksheet after its last edit.");
    });
    const priorSources = included.filter(entry => entry.priorYearBenefits === true);
    if (priorSources.every(entry => !amountError(entry.priorYearBenefitsAmount, "source earlier-year benefits"))) {
      const sourceDelayed = priorSources.reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.priorYearBenefitsAmount)), new Decimal(0));
      if (!delayed.eq(sourceDelayed)) errors.socialSecurityDelayedReconciliation = "The earlier-year allocations must reconcile exactly to prior-year benefit amounts on the actual source statements.";
    }
    if (new Set(priorSources.map(entry => entry.beneficiaryRole)).size > 1 && data.earlierYears?.some(year => year.filingStatus !== "mfj")) errors.socialSecurityEarlierHouseholds = "Benefits for both spouses with separate earlier returns need separate beneficiary history worksheets; this combined earlier-year route cannot calculate that allocation yet.";
    if (net !== null && delayed.gt(net)) errors.socialSecurityDelayedTotal = "Earlier-year benefits cannot exceed the net benefit source amounts reported this year.";
  }
  return errors;
}
