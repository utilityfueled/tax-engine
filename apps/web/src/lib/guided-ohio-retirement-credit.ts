import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

interface OhioRetirementCreditOriginal {
  taxYear: number;
  payer: string;
  payerTin: string;
  accountReference: string;
  grossDistribution: string;
  taxableAmount: string;
}

export interface OhioRetirementCreditDraft {
  original: OhioRetirementCreditOriginal;
  sourceReference: string;
  withdrawnBeforeRetirement: boolean | null;
  sourceFactsConfirmed: boolean | null;
}

export function ohioRetirementCreditOriginal(input: TaxYearInput | null | undefined): OhioRetirementCreditOriginal | undefined {
  if (input?.taxpayer.taxYear !== 2025 || input.taxpayer.filingStatus !== "single" ||
      input.taxpayer.stateResidency !== "full-year" || input.form1099R?.length !== 1) return undefined;
  const [form] = input.form1099R;
  if (!form || form.taxYear !== 2025 || form.accountHolder !== "primary" || !form.payer.trim() ||
      !form.payerTin?.trim() || !form.accountReference || form.iraSepSimple !== false ||
      form.distributionCode !== "1" || form.taxableAmountNotDetermined !== false || form.taxableAmount === undefined ||
      form.militaryPensionOrSurvivorBenefit || form.eligibleGovernmental457bPlan || form.qualifiedJointSurvivorAnnuity ||
      form.simplifiedMethodPlanIdentifier !== undefined) return undefined;
  const taxableAmount = new Decimal(form.taxableAmount);
  if (!taxableAmount.gt(0)) return undefined;
  return {
    taxYear: form.taxYear,
    payer: form.payer,
    payerTin: form.payerTin,
    accountReference: form.accountReference,
    grossDistribution: new Decimal(form.grossDistribution).toFixed(),
    taxableAmount: taxableAmount.toFixed(),
  };
}

export function buildGuidedOhioRetirementIncome(input: TaxYearInput, draft: OhioRetirementCreditDraft | undefined): "0" | undefined {
  if (input.taxpayer.taxYear !== 2025) return undefined;
  const original = ohioRetirementCreditOriginal(input);
  if (!original && !draft) return undefined;
  if (!draft) throw new Error("Add the actual Ohio payment circumstances for the current Form 1099-R.");
  if (!original || guidedSourceValuesChanged(original, draft.original)) {
    throw new Error("Reconcile the retained Ohio retirement facts with the current Form 1099-R or remove them.");
  }
  if (draft.withdrawnBeforeRetirement !== true || !draft.sourceReference.trim() || draft.sourceFactsConfirmed !== true) {
    throw new Error("Confirm a documented early withdrawal before retirement to complete this Ohio return path.");
  }
  return "0";
}
