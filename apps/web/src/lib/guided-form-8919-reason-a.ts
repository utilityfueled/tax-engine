import { d } from "@/utils/decimal";
import type { GuidedFlowState } from "./guided-interview-flow";
import { hasEnteredAmount } from "./guided-required-facts";

export interface GuidedForm8919ReasonA {
  taxYear: string;
  firmName: string;
  employerEin: string;
  determinationDate: string;
  wages: string;
  confirmed: boolean;
}

const exactWages = /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

function employerId(ein: string): string | undefined {
  const digits = ein.trim().replace(/^(\d{2})-(\d{7})$/, "$1$2");
  return /^\d{9}$/.test(digits) && digits !== "000000000" ? digits : undefined;
}

function isDeterminationDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return false;
  const value = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(value.valueOf()) && value.toISOString().slice(0, 10) === date
    && date <= new Date().toISOString().slice(0, 10);
}

export function buildGuidedForm8919ReasonA(state: GuidedFlowState) {
  const additional = state.sectionData["additional-deductions"];
  const original = additional?.form8919ReasonA;
  if (!original) return undefined;

  if (state.taxYear !== 2026 || original.taxYear !== "2026") {
    throw new Error("Confirm the Form 8919 original belongs to this 2026 return.");
  }
  if (!state.segmentation.filingStatus || state.segmentation.filingStatus === "mfj" || state.segmentation.stateCode) {
    throw new Error("This Form 8919 interview currently supports one federal filer only.");
  }
  const ein = employerId(original.employerEin);
  const wages = original.wages.trim();
  if (!original.firmName.trim() || !ein || !isDeterminationDate(original.determinationDate) || !exactWages.test(wages) || !d(wages.replaceAll(",", "")).gt(0)) {
    throw new Error("Enter the employer name and EIN, the IRS determination date, and positive wages from the original records.");
  }
  if (original.confirmed !== true) throw new Error("Confirm the IRS determination and that these wages were never reported or subject to payroll withholding.");
  if (additional.rrtaPayrollSources || additional.tipIncomeAccounts?.length || state.sectionData["income-self-employment"] || state.sectionData["income-royalties"]) {
    throw new Error("Separate tip, railroad, business, and miscellaneous income sources require their own reconciliation before Form 8919 can be calculated here.");
  }

  for (const w2 of state.sectionData["income-w2"]?.entries ?? []) {
    if (Object.values(w2.aiSuggestedFields ?? {}).some(field => field?.status === "pending-confirmation")) {
      throw new Error("Confirm original W-2 sources before reconciling Form 8919.");
    }
    if (!hasEnteredAmount(w2.wages) && !hasEnteredAmount(w2.federalWithheld) && !w2.stateLocalSources) continue;
    const w2Ein = employerId(w2.employerEin);
    if (!w2Ein || w2Ein === ein) throw new Error("Enter W-2s with original EINs that establish these wages are from a different employer.");
    if (w2.sourceTaxYear?.trim() !== original.taxYear || w2.accountHolder === "spouse" || !exactWages.test(w2.socialSecurityWages.trim()) || !exactWages.test(w2.socialSecurityTips?.trim() ?? "")) {
      throw new Error("Enter original 2026 W-2 Boxes 3 and 7 for the primary filer, including known zero.");
    }
  }

  return { accountHolder: "primary" as const, wagesNotReportedOnW2: d(wages.replaceAll(",", "")).toFixed() };
}

export function form8919ReasonAFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    buildGuidedForm8919ReasonA(state);
    return {};
  } catch (error) {
    return { form8919ReasonA: error instanceof Error ? error.message : "Confirm the original Form 8919 wage facts." };
  }
}
