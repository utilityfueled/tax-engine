import Decimal from "decimal.js";
import { Form2210Schema, type TaxYearInput } from "@/models/inputs";
import type { EstimatedPaymentEntry, PaymentData } from "./guided-interview-flow";
import { amountError, isActualDate } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";

export interface EstimatedTaxFactsData {
  sourceTaxYear: string; sourceReference: string; sourceFactsConfirmed: boolean | null; allPaymentRecordsIncluded: boolean | null;
  calendarYearTaxpayer: boolean | null; residentReturn: boolean | null; farmerOrFisher: boolean | null; disasterReliefClaimed: boolean | null; waiverRequested: boolean | null;
  calculationMethod: "" | "regular" | "annualized"; withholdingMethod: "" | "equal-installments" | "actual-dates";
  annualizedIncomePeriods?: AnnualizedPeriodData[]; bothSpousesSelfEmployed?: boolean | null;
  priorYearTaxStatus: "" | "return-filed" | "no-return" | "no-tax-liability";
  priorYearFullYear: boolean | null; priorYearResidentAllYear: boolean | null; priorYearJointReturn: boolean | null;
  priorYearTaxForForm2210: string; priorYearAgiForForm2210: string; priorYearTaxComputationConfirmed: boolean | null;
  withholdingPayments: EstimatedPaymentEntry[]; priorYearCreditPayments: (EstimatedPaymentEntry & { appliedCreditIndex: string })[]; returnPayments: EstimatedPaymentEntry[];
  earlyReturnExceptionClaimed: boolean | null; returnFiledDate: string; returnPaidInFullDate: string;
}
export const emptyEstimatedTaxFacts: EstimatedTaxFactsData = {
  sourceTaxYear: "", sourceReference: "", sourceFactsConfirmed: null, allPaymentRecordsIncluded: null,
  calendarYearTaxpayer: null, residentReturn: null, farmerOrFisher: null, disasterReliefClaimed: null, waiverRequested: null,
  calculationMethod: "", withholdingMethod: "", priorYearTaxStatus: "", priorYearFullYear: null, priorYearResidentAllYear: null, priorYearJointReturn: null,
  priorYearTaxForForm2210: "", priorYearAgiForForm2210: "", priorYearTaxComputationConfirmed: null,
  withholdingPayments: [], priorYearCreditPayments: [], returnPayments: [], earlyReturnExceptionClaimed: null, returnFiledDate: "", returnPaidInFullDate: "",
};
function known(value: boolean | null | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Confirm the actual ${label}; an unanswered fact is unknown.`); return value;
}
function money(value: string | undefined, label: string, required = true, signed = false): string | undefined {
  if (!value?.trim() && !required) return undefined;
  if (signed) { if (!value?.trim()) throw new Error(`Enter the actual ${label}.`); return parseGuidedCurrency(value).toFixed(); }
  const error = amountError(value, label); if (error) throw new Error(error); return parseGuidedCurrency(value).toFixed();
}
export const ANNUALIZED_PERIOD_FIELDS = [
  ["adjustedGrossIncome", "Adjusted gross income", true], ["itemizedDeductions", "Itemized deductions, or 0 if you do not itemize", false],
  ["qbiDeduction", "QBI deduction", false], ["qualifiedDividends", "Qualified dividends", false], ["netCapitalGain", "Net capital gain", false],
  ["netProfitFromSelfEmployment", "Net profit from self-employment", true], ["socialSecurityWages", "Wages subject to social security tax", false],
  ["otherTaxes", "Other taxes", false], ["credits", "Credits", false],
] as const;
export type AnnualizedPeriodData = Record<(typeof ANNUALIZED_PERIOD_FIELDS)[number][0], string>;
export const emptyAnnualizedPeriods = (): AnnualizedPeriodData[] => Array.from({ length: 4 }, () =>
  Object.fromEntries(ANNUALIZED_PERIOD_FIELDS.map(([key]) => [key, ""])) as AnnualizedPeriodData);
function buildAnnualizedPeriods(facts: EstimatedTaxFactsData): AnnualizedPeriodData[] {
  if (facts.annualizedIncomePeriods?.length !== 4) throw new Error("Annualized income needs all four actual cumulative periods.");
  return facts.annualizedIncomePeriods.map((period, index) => Object.fromEntries(ANNUALIZED_PERIOD_FIELDS.map(([key, label, signed]) =>
    [key, money(period[key], `period ${index + 1} ${label.toLowerCase()}`, true, signed)])) as AnnualizedPeriodData);
}
export function buildEstimatedTaxFacts(data: PaymentData | undefined, taxYear?: number | null): TaxYearInput["form2210"] {
  const facts = data?.estimatedTaxFacts; if (!facts) return undefined;
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Select the actual supported return year before the estimated-tax worksheet.");
  const year = taxYear;
  if (facts.sourceTaxYear !== String(taxYear)) throw new Error("Estimated-tax source year must match the actual return year.");
  if (!facts.sourceReference.trim() || facts.sourceFactsConfirmed !== true || facts.allPaymentRecordsIncluded !== true) throw new Error("Confirm the actual prior-return and complete payment history after the last edit, including its source reference.");
  for (const [key, expected, label] of [
    ["calendarYearTaxpayer", true, "calendar-year taxpayer"], ["residentReturn", true, "resident return"], ["farmerOrFisher", false, "farmer or fisher special rule"],
    ["disasterReliefClaimed", false, "disaster relief"], ["waiverRequested", false, "penalty waiver"],
  ] as const) if (known(facts[key], label) !== expected) throw new Error(`The ${label} scenario needs its separate estimated-tax method; retain these actual facts for review.`);
  if (facts.calculationMethod !== "regular" && facts.calculationMethod !== "annualized") throw new Error("Choose the actual estimated-tax method.");
  const annualizedIncomePeriods = facts.calculationMethod === "annualized" ? buildAnnualizedPeriods(facts) : undefined;
  if (facts.withholdingMethod !== "equal-installments" && facts.withholdingMethod !== "actual-dates") throw new Error("Choose the actual withholding timing method.");
  if (!["return-filed", "no-return", "no-tax-liability"].includes(facts.priorYearTaxStatus)) throw new Error("Confirm actual prior-year return/tax status.");
  if (facts.priorYearTaxStatus !== "no-return") {
    known(facts.priorYearFullYear, "prior return covering a full12 months");
    known(facts.priorYearJointReturn, "prior-year joint-return status");
    if (facts.priorYearFullYear) {
      if (facts.priorYearTaxComputationConfirmed !== true) throw new Error("Confirm actual prior-year tax under the Form2210 line8 instructions before any110% multiplier, including any filing-status allocation.");
      const prior = money(facts.priorYearTaxForForm2210, "prior-year Form2210 tax");
      if (facts.priorYearTaxStatus === "return-filed") money(facts.priorYearAgiForForm2210, "prior-year AGI", true, true);
      else {
        if (prior !== "0") throw new Error("The actual no-tax-liability status conflicts with the prior-year tax amount.");
        known(facts.priorYearResidentAllYear, "prior-year full-year U.S. citizenship or residence");
      }
    }
  } else if (facts.priorYearJointReturn === true) throw new Error("No prior return conflicts with a prior joint return.");
  // Validate even retained values that the chosen prior-return branch will not use.
  const priorTax = money(facts.priorYearTaxForForm2210, "prior-year Form2210 tax", false);
  const priorAgi = money(facts.priorYearAgiForForm2210, "prior-year AGI", false, true);
  function dated(entries: EstimatedPaymentEntry[], label: string, withinYear: boolean, afterYear = false) {
    if (!Array.isArray(entries)) throw new Error(`Enter the actual ${label} history, including an empty list if there were none.`);
    return entries.map((entry, index) => {
      if (!isActualDate(entry.date) || entry.date < `${year}-01-01` || entry.date > `${year + (withinYear ? 0 : 1)}-12-31`
        || (afterYear && entry.date <= `${year}-12-31`)) throw new Error(`Enter the actual ${label} ${index + 1} date within its source payment period.`);
      return { date: entry.date, amount: money(entry.amount, `${label} ${index + 1} amount`) as string };
    });
  }
  const withholdingPayments = dated(facts.withholdingPayments, "withholding", true);
  const priorYearCreditPayments = dated(facts.priorYearCreditPayments, "applied-credit", false);
  const returnPayments = dated(facts.returnPayments, "return payment", false, true);
  const credits = data.priorYearAppliedCredits ?? [], allocated = credits.map(() => new Decimal(0));
  facts.priorYearCreditPayments.forEach((entry, index) => {
    if (!/^(0|[1-9]\d*)$/.test(entry.appliedCreditIndex)) throw new Error("Link each actual effective-date payment to its original applied-refund source.");
    const sourceIndex = Number(entry.appliedCreditIndex), original = credits[sourceIndex];
    if (!Number.isSafeInteger(sourceIndex) || !original || original.sourceTaxYear !== String(taxYear - 1)) throw new Error("The effective-date entry has no matching actual prior-year credit source.");
    allocated[sourceIndex] = allocated[sourceIndex].plus(priorYearCreditPayments[index].amount);
  });
  credits.forEach((credit, index) => {
    if (credit.sourceTaxYear !== String(taxYear - 1)) throw new Error("Applied refund source year must be the actual immediately preceding tax year.");
    const original = money(credit.amount, "original applied refund");
    if (!allocated[index].eq(original as string) || (new Decimal(original as string).gt(0) && !facts.priorYearCreditPayments.some(row => row.appliedCreditIndex === String(index)))) throw new Error("Actual effective-date payments must reconcile every original applied-refund source, including zero.");
  });
  const early = known(facts.earlyReturnExceptionClaimed, "early filing and full-payment exception");
  const hasDates = !!facts.returnFiledDate || !!facts.returnPaidInFullDate;
  if (early || hasDates) {
    if (!isActualDate(facts.returnFiledDate) || !isActualDate(facts.returnPaidInFullDate)
      || [facts.returnFiledDate, facts.returnPaidInFullDate].some(date => date <= `${taxYear}-12-31` || date > `${taxYear + 1}-12-31`)) throw new Error("Enter both actual filing and full-payment dates after the tax year.");
    const deadline = taxYear === 2025 ? "2026-02-02" : "2027-02-01";
    if (early !== (facts.returnFiledDate <= deadline && facts.returnPaidInFullDate <= deadline)) throw new Error("Actual filing/payment dates conflict with the early-return exception answer.");
  }
  return Form2210Schema.parse({
    calendarYearTaxpayer: facts.calendarYearTaxpayer, residentReturn: facts.residentReturn, farmerOrFisher: facts.farmerOrFisher,
    disasterReliefClaimed: facts.disasterReliefClaimed, waiverRequested: facts.waiverRequested, calculationMethod: facts.calculationMethod, withholdingMethod: facts.withholdingMethod,
    annualizedIncomePeriods, bothSpousesSelfEmployed: facts.bothSpousesSelfEmployed ?? undefined,
    priorYearTaxStatus: facts.priorYearTaxStatus, priorYearFullYear: facts.priorYearFullYear ?? undefined, priorYearResidentAllYear: facts.priorYearResidentAllYear ?? undefined,
    priorYearJointReturn: facts.priorYearJointReturn ?? undefined, priorYearTaxComputationConfirmed: facts.priorYearTaxComputationConfirmed ?? undefined,
    priorYearTaxForForm2210: priorTax, priorYearAgiForForm2210: priorAgi, withholdingPayments, priorYearCreditPayments, returnPayments,
    returnFiledDate: facts.returnFiledDate || undefined, returnPaidInFullDate: facts.returnPaidInFullDate || undefined,
  });
}
export function estimatedTaxFactErrors(data: PaymentData | undefined, taxYear?: number | null): Record<string, string> {
  try { buildEstimatedTaxFacts(data, taxYear); return {}; } catch (error) { return { estimatedTaxFacts: error instanceof Error ? error.message : "Reconcile the actual estimated-tax source worksheet." }; }
}
