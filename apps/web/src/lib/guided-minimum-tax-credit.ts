import Decimal from "decimal.js";
import { Form8801Schema, type TaxYearInput } from "@/models/inputs";
import type { FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import { amountError } from "./guided-required-facts";
import { parseGuidedCurrency } from "./guided-currency";

export const minimumTaxCreditAmounts = [
  "priorYearForm6251Line1And2e", "priorYearExclusionItemAdjustments", "priorYearMinimumTaxCreditNOLDeduction",
  "priorYearMinimumTaxForeignTaxCredit", "priorYearForm6251Line10", "priorYearAMT",
  "unusedMinimumTaxCreditCarryforward", "priorYearUnallowedQualifiedElectricVehicleCredit",
] as const;
export interface MinimumTaxCreditData extends Record<typeof minimumTaxCreditAmounts[number], string> {
  sourceTaxYear: string;
  priorYear: string;
  sourceReference: string;
  sourceFactsConfirmed: boolean | null;
  allSourcesIncluded: boolean | null;
  sameTaxpayersAsPriorYear: boolean | null;
  primaryName: string;
  primaryTaxIdLast4: string;
  spouseName: string;
  spouseTaxIdLast4: string;
  priorYearFilingStatus: "" | FilingStatus;
  priorYearFiledForm2555: boolean | null;
  priorYearFiledForm1040NR: boolean | null;
  priorYearCapitalGainsRequired: boolean | null;
  priorYearNetUSRealPropertyGain: string;
  foreignEarnedIncome: {
    form2555Lines45And50: string;
    disallowedDeductions: string;
    capitalGainAdjustmentsConfirmed: boolean | null;
  };
  capitalGainsWorksheet: {
    method: "" | "qualified_dividends" | "schedule_d";
    preferentialIncome: string;
    ordinaryIncomeForZeroRate: string;
    ordinaryIncomeForFifteenRate: string;
    section1250Gain: string;
    scheduleDTaxWorksheetLine10: string;
  };
}
export const emptyMinimumTaxCredit: MinimumTaxCreditData = {
  sourceTaxYear: "", priorYear: "", sourceReference: "", sourceFactsConfirmed: null, allSourcesIncluded: null, sameTaxpayersAsPriorYear: null,
  primaryName: "", primaryTaxIdLast4: "", spouseName: "", spouseTaxIdLast4: "", priorYearFilingStatus: "",
  priorYearForm6251Line1And2e: "", priorYearExclusionItemAdjustments: "", priorYearMinimumTaxCreditNOLDeduction: "",
  priorYearMinimumTaxForeignTaxCredit: "", priorYearForm6251Line10: "", priorYearAMT: "", unusedMinimumTaxCreditCarryforward: "", priorYearUnallowedQualifiedElectricVehicleCredit: "",
  priorYearFiledForm2555: null, priorYearFiledForm1040NR: null, priorYearCapitalGainsRequired: null, priorYearNetUSRealPropertyGain: "",
  foreignEarnedIncome: { form2555Lines45And50: "", disallowedDeductions: "", capitalGainAdjustmentsConfirmed: null },
  capitalGainsWorksheet: { method: "", preferentialIncome: "", ordinaryIncomeForZeroRate: "", ordinaryIncomeForFifteenRate: "", section1250Gain: "", scheduleDTaxWorksheetLine10: "" },
};
const statuses = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
function known(value: boolean | null | undefined, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Confirm the actual ${label}; an unanswered fact remains unknown.`);
  return value;
}
function money(value: string | undefined, label: string, signed = false): string {
  if (!value?.trim()) throw new Error(`Enter the actual ${label}, including zero when established by the source.`);
  if (!signed) { const error = amountError(value, label); if (error) throw new Error(error); }
  return parseGuidedCurrency(value).toFixed();
}
function identity(name: string, last4: string, person: { firstName: string; lastName: string; ssn: string } | undefined, label: string) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const ssn = person?.ssn.replace(/\D/g, "");
  if (!person?.firstName.trim() || !person.lastName.trim() || ssn?.length !== 9 || !/^\d{4}$/.test(last4)
    || last4 !== ssn.slice(-4) || normalize(name) !== normalize(`${person.firstName} ${person.lastName}`)) {
    throw new Error(`Reconcile the prior-source ${label} identity with the actual current household.`);
  }
}
export function buildMinimumTaxCreditInput(data: MinimumTaxCreditData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): TaxYearInput["form8801"] {
  if (!data) return undefined;
  if ((taxYear !== 2025 && taxYear !== 2026) || !filingStatus) throw new Error("Select the actual return year and filing status for the minimum-tax-credit worksheet.");
  if (data.sourceTaxYear !== String(taxYear) || data.priorYear !== String(taxYear - 1)) throw new Error("Minimum-tax-credit worksheets must identify the actual return year and immediately preceding source year.");
  if (!data.sourceReference.trim() || data.sourceFactsConfirmed !== true || data.allSourcesIncluded !== true) throw new Error("Confirm the complete original minimum-tax-credit sources after the last edit, with their source reference.");
  if (!data.priorYearFilingStatus || !(data.priorYearFilingStatus in statuses)) throw new Error("Confirm the actual prior-year filing status.");
  if (data.sameTaxpayersAsPriorYear !== true || (data.priorYearFilingStatus === "mfj") !== (filingStatus === "mfj")) {
    throw new Error("Changed taxpayer membership or joint/separate minimum-tax-credit allocation needs its separate source method; do not infer an ownership split.");
  }
  identity(data.primaryName, data.primaryTaxIdLast4, personal, "taxpayer");
  if (filingStatus === "mfj") identity(data.spouseName, data.spouseTaxIdLast4, personal?.spouse, "spouse");
  else if (data.spouseName.trim() || data.spouseTaxIdLast4.trim()) throw new Error("Reconcile retained spouse source identity with the actual single-taxpayer worksheet.");
  const foreignApplies = known(data.priorYearFiledForm2555, "prior Form2555 applicability");
  const nonresidentApplies = known(data.priorYearFiledForm1040NR, "prior Form1040-NR applicability");
  const capitalApplies = known(data.priorYearCapitalGainsRequired, "prior capital-gain worksheet applicability");
  const amounts = Object.fromEntries(minimumTaxCreditAmounts.map(key => [key, money(data[key], key, key === "priorYearForm6251Line1And2e" || key === "priorYearExclusionItemAdjustments")]));
  let capital: NonNullable<TaxYearInput["form8801"]>["priorYearCapitalGainsWorksheet"];
  const savedCapital = Object.values(data.capitalGainsWorksheet).some(value => value.trim() !== "");
  if (!capitalApplies && savedCapital) throw new Error("Reconcile the retained capital worksheet with its actual applicability answer.");
  if (capitalApplies) {
    const worksheet = data.capitalGainsWorksheet;
    if (worksheet.method !== "qualified_dividends" && worksheet.method !== "schedule_d") throw new Error("Choose the actual prior capital-gain worksheet method.");
    capital = {
      method: worksheet.method,
      preferentialIncome: money(worksheet.preferentialIncome, "capital worksheet preferential income"),
      ordinaryIncomeForZeroRate: money(worksheet.ordinaryIncomeForZeroRate, "capital worksheet zero-rate ordinary income"),
      ordinaryIncomeForFifteenRate: money(worksheet.ordinaryIncomeForFifteenRate, "capital worksheet fifteen-rate ordinary income"),
    };
    if (worksheet.method === "schedule_d") {
      capital.section1250Gain = money(worksheet.section1250Gain, "Schedule D section1250 gain");
      capital.scheduleDTaxWorksheetLine10 = money(worksheet.scheduleDTaxWorksheetLine10, "Schedule D Tax Worksheet line10");
      if (new Decimal(capital.ordinaryIncomeForFifteenRate).gt(capital.ordinaryIncomeForZeroRate) || new Decimal(capital.scheduleDTaxWorksheetLine10).lt(capital.preferentialIncome)) throw new Error("Reconcile the actual Schedule D worksheet ordinary-income sources and preferential-gain cap.");
    } else if (!new Decimal(capital.ordinaryIncomeForZeroRate).eq(capital.ordinaryIncomeForFifteenRate) || worksheet.section1250Gain.trim() || worksheet.scheduleDTaxWorksheetLine10.trim()) {
      throw new Error("The qualified-dividend worksheet uses the same ordinary-income source and no separate Schedule D special-gain sources.");
    }
  }
  let foreign: NonNullable<TaxYearInput["form8801"]>["priorYearForeignEarnedIncome"];
  const savedForeign = data.foreignEarnedIncome.form2555Lines45And50.trim() || data.foreignEarnedIncome.disallowedDeductions.trim() || typeof data.foreignEarnedIncome.capitalGainAdjustmentsConfirmed === "boolean";
  if (!foreignApplies && savedForeign) throw new Error("Reconcile retained foreign-income worksheet sources with actual Form2555 applicability.");
  if (foreignApplies) {
    foreign = { form2555Lines45And50: money(data.foreignEarnedIncome.form2555Lines45And50, "prior foreign exclusions and housing deduction"),
      disallowedDeductions: money(data.foreignEarnedIncome.disallowedDeductions, "deductions or exclusion items disallowed for excluded foreign income"),
      capitalGainAdjustmentsConfirmed: data.foreignEarnedIncome.capitalGainAdjustmentsConfirmed ?? undefined };
    if (capitalApplies && foreign.capitalGainAdjustmentsConfirmed !== true) throw new Error("Confirm the actual foreign-income capital-gain worksheet adjustments.");
  }
  const realProperty = nonresidentApplies || data.priorYearNetUSRealPropertyGain.trim() ? money(data.priorYearNetUSRealPropertyGain, "prior net U.S. real-property gain") : undefined;
  if (!nonresidentApplies && realProperty !== undefined && new Decimal(realProperty).gt(0)) throw new Error("Positive prior nonresident real-property gain contradicts its applicability answer.");
  return Form8801Schema.parse({
    ...amounts, priorYear: Number(data.priorYear), priorYearFilingStatus: statuses[data.priorYearFilingStatus], sourceFactsConfirmed: true,
    priorYearFiledForm2555: foreignApplies, priorYearFiledForm1040NR: nonresidentApplies, priorYearCapitalGainsRequired: capitalApplies,
    priorYearCapitalGainsWorksheet: capital, priorYearForeignEarnedIncome: foreign, priorYearNetUSRealPropertyGain: realProperty,
  });
}
export function minimumTaxCreditFactErrors(data: MinimumTaxCreditData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  try { buildMinimumTaxCreditInput(data, taxYear, filingStatus, personal); return {}; }
  catch (error) { return { minimumTaxCredit: error instanceof Error ? error.message : "Reconcile the actual prior-year minimum-tax-credit sources." }; }
}
