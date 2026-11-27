import type { Form1099Nec, Form8919Input } from "@/models/inputs";
import { currentLocalCivilDate, isActualDate } from "@/utils/civil-date";
import { d } from "@/utils/decimal";
import type { GuidedFlowState } from "./guided-interview-flow";
import { hasEnteredAmount } from "./guided-required-facts";
import { buildTipIncomeInputs } from "./guided-tip-income-facts";

export interface GuidedForm8919ReasonA {
  taxYear: string;
  firmName: string;
  employerEin: string;
  determinationDate: string;
  determinationReceivedDate?: string;
  determinationReference?: string;
  wages: string;
  confirmed: boolean;
  originalNec?: GuidedForm8919OriginalNec;
}

export interface GuidedForm8919OriginalNec {
  statementReference: string;
  payerName: string;
  payerTin: string;
  recipientTin: string;
  nonemployeeCompensation: string;
  federalWithheld: string;
  qualifiedOvertimeCompensation: string;
  currentOriginalNoCorrectionsOrVoidsConfirmed: boolean | null;
  noDirectSalesOrParachutePaymentConfirmed: boolean | null;
  noTipsOrStateBoxesConfirmed: boolean | null;
  federalOnlyConfirmed?: boolean;
}

interface GuidedForm8919Sources {
  form8919: Form8919Input;
  originalNec?: Form1099Nec;
}

export const form8919NecSourceId = "form1099Nec:0";
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

function recipientId(value: string | undefined) {
  const digits = value?.trim().replace(/^(\d{3})-(\d{2})-(\d{4})$/, "$1$2$3") ?? "";
  return /^\d{9}$/.test(digits) && digits !== "000000000" ? digits : undefined;
}

function originalMoney(value: string | undefined, box: string) {
  const entered = value?.trim() ?? "";
  const cents = entered.replaceAll(",", "");
  if (!exactWages.test(entered) || !/^\d{1,12}(?:\.\d{1,2})?$/.test(cents)) {
    throw new Error(`Enter the actual Form 1099-NEC ${box} in dollars and cents, including a known zero.`);
  }
  return d(cents);
}

const normalizedFirmName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

function buildOriginalNec(original: GuidedForm8919ReasonA, nec: GuidedForm8919OriginalNec, form8919: Form8919Input, state: GuidedFlowState): GuidedForm8919Sources {
  const additional = state.sectionData["additional-deductions"];
  const personal = state.sectionData["personal-info"];
  if (state.sectionData["state-return"] || additional?.schedule1A?.businessTips.length) {
    throw new Error("Linked Form 8919 wages require a federal-only return without separate business tips.");
  }
  if (nec.federalOnlyConfirmed !== true) {
    throw new Error("Confirm that you are preparing the federal return only and will address state filing separately.");
  }
  const statementReference = nec.statementReference?.trim();
  const determinationReference = original.determinationReference?.trim();
  const receiptDate = original.determinationReceivedDate;
  if (!statementReference || !determinationReference || !receiptDate || !isActualDate(receiptDate)
    || receiptDate < original.determinationDate || receiptDate > currentLocalCivilDate()) {
    throw new Error("Enter both original references and the date you received the IRS determination, on or after its issue date and on or before today.");
  }
  const recipientTin = recipientId(nec.recipientTin);
  if (!recipientTin || recipientTin !== recipientId(personal?.ssn)) {
    throw new Error("Match the original Form 1099-NEC recipient TIN to the primary filer.");
  }
  const payerTin = employerId(nec.payerTin ?? "");
  const payerName = nec.payerName?.trim();
  if (!payerTin || payerTin !== employerId(original.employerEin) || !payerName || normalizedFirmName(payerName) !== normalizedFirmName(original.firmName)) {
    throw new Error("Match the original Form 1099-NEC payer name and EIN to the IRS determination.");
  }
  if (nec.currentOriginalNoCorrectionsOrVoidsConfirmed !== true || nec.noDirectSalesOrParachutePaymentConfirmed !== true
    || nec.noTipsOrStateBoxesConfirmed !== true) {
    throw new Error("Confirm the current original Form 1099-NEC and absence of corrections, direct sales, parachute payments, tips and state reporting.");
  }
  const wages = originalMoney(nec.nonemployeeCompensation, "Box 1a");
  const overtime = originalMoney(nec.qualifiedOvertimeCompensation, "Box 1d");
  const withholding = originalMoney(nec.federalWithheld, "Box 4");
  if (!wages.eq(form8919.wagesNotReportedOnW2) || overtime.gt(wages) || withholding.gt(wages)) {
    throw new Error("Form 1099-NEC Box 1a must equal the full Form 8919 wages. Box 1d and Box 4 cannot exceed Box 1a.");
  }
  return {
    form8919: { ...form8919, reasonANecSource: {
      necSourceId: form8919NecSourceId, sourceTaxYear: 2026, statementReference,
      employerEin: original.employerEin.trim(), employerName: original.firmName.trim(),
      determinationReference, determinationDate: original.determinationDate, determinationReceivedDate: receiptDate,
      employeeDeterminationConfirmed: true, allCompensationEmployeeWagesConfirmed: true,
      noEmployeeFicaWithheldConfirmed: true, receivedInsteadOfW2Confirmed: true, federalOnlyConfirmed: true,
    } },
    originalNec: {
      taxYear: 2026, payer: payerName, payerTin, accountHolder: "primary",
      originalForForm8919: {
        statementReference, recipientTin,
        currentOriginalNoCorrectionsOrVoidsConfirmed: true, noDirectSalesOrParachutePaymentConfirmed: true,
      },
      nonemployeeCompensation: wages.toFixed(), qualifiedOvertimeCompensation: overtime.toFixed(),
      federalWithheld: withholding.toFixed(), stateWithheld: "0",
    },
  };
}

export function buildGuidedForm8919ReasonA(state: GuidedFlowState): GuidedForm8919Sources | undefined {
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
  const date = original.determinationDate;
  const validDate = original.originalNec ? isActualDate(date) && !date.startsWith("0000-") && date <= currentLocalCivilDate() : isDeterminationDate(date);
  if (!original.firmName.trim() || !ein || !validDate || !exactWages.test(wages) || !d(wages.replaceAll(",", "")).gt(0)) {
    throw new Error("Enter the employer name and EIN, the IRS determination date, and positive wages from the original records.");
  }
  if (original.confirmed !== true) throw new Error("Confirm the IRS determination and that these wages were never reported or subject to payroll withholding.");
  if (additional.rrtaPayrollSources || state.sectionData["income-self-employment"] || state.sectionData["income-royalties"]) {
    throw new Error("Railroad, business, and miscellaneous income sources require their own reconciliation before Form 8919 can be calculated here.");
  }

  const w2s = state.sectionData["income-w2"]?.entries ?? [];
  const allocatedTipEmployers = new Set<string>();
  for (const w2 of w2s) {
    if (Object.values(w2.aiSuggestedFields ?? {}).some(field => field?.status === "pending-confirmation")) {
      throw new Error("Confirm original W-2 sources before reconciling Form 8919.");
    }
    if (!hasEnteredAmount(w2.wages) && !hasEnteredAmount(w2.federalWithheld) && !w2.stateLocalSources) continue;
    const w2Ein = employerId(w2.employerEin);
    if (!w2Ein || w2Ein === ein) throw new Error("Enter W-2s with original EINs that establish these wages are from a different employer.");
    if (w2.sourceTaxYear?.trim() !== original.taxYear || w2.accountHolder === "spouse" || !exactWages.test(w2.socialSecurityWages.trim()) || !exactWages.test(w2.socialSecurityTips?.trim() ?? "")) {
      throw new Error("Enter original 2026 W-2 Boxes 3 and 7 for the primary filer, including known zero.");
    }
    const allocatedTips = w2.allocatedTips?.trim();
    if (allocatedTips) {
      if (!exactWages.test(allocatedTips)) throw new Error("Enter the actual allocated tips from W-2 Box 8.");
      if (d(allocatedTips.replaceAll(",", "")).gt(0)) allocatedTipEmployers.add(w2Ein);
    }
  }

  const tipInputs = buildTipIncomeInputs(additional.tipIncomeAccounts, state.segmentation.filingStatus, state.taxYear, w2s);
  if (original.originalNec && (tipInputs?.primary || tipInputs?.spouse)) {
    throw new Error("Linked Form 8919 wages require separate reconciliation when there are Form 4137 records.");
  }
  const tips = tipInputs?.primary?.sourceFacts;
  if (d(tips?.noncashTipsNotIncludedInWages).gt(0)) {
    throw new Error("Noncash tips require separate employer attribution before combining them with Form 8919 wages.");
  }
  const tipEmployers = new Set<string>();
  for (const employer of tips?.employers ?? []) {
    const tipEin = employerId(employer.employerEin ?? "");
    if (!tipEin || tipEin === ein) throw new Error("Forms 4137 and 8919 here require original EINs from separate employers.");
    tipEmployers.add(tipEin);
  }
  if ([...allocatedTipEmployers].some(employer => !tipEmployers.has(employer))) {
    throw new Error("Reconcile allocated W-2 Box 8 tips with confirmed Form 4137 records before continuing.");
  }

  const form8919: Form8919Input = { accountHolder: "primary", wagesNotReportedOnW2: d(wages.replaceAll(",", "")).toFixed() };
  return original.originalNec ? buildOriginalNec(original, original.originalNec, form8919, state) : { form8919 };
}

export function form8919ReasonAFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    buildGuidedForm8919ReasonA(state);
    return {};
  } catch (error) {
    return { form8919ReasonA: error instanceof Error ? error.message : "Confirm the original Form 8919 wage facts." };
  }
}
