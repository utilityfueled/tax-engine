import { parseGuidedCurrency } from "./guided-currency";
import type { FilingStatus, GuidedFlowState, PersonalInfoData } from "./guided-interview-flow";
import { amountError, guidedAmountChanged } from "./guided-required-facts";
import { guidedSourceValuesChanged } from "./guided-source-confirmation";

export interface GuidedReitPtpLossSource {
  sourceTaxYear?: string;
  sourceForm?: "form_8995" | "form_8995_a";
  sourceReference?: string;
  amount?: string;
  priorFilingStatus?: FilingStatus;
  primaryName?: string;
  primaryTaxIdLast4?: string;
  spouseName?: string;
  spouseTaxIdLast4?: string;
  sameJointFilersConfirmed?: boolean | null;
  sourceFactsConfirmed?: boolean | null;
}

export function invalidateEditedReitPtpLossSource(before: GuidedReitPtpLossSource | undefined, after: GuidedReitPtpLossSource | undefined) {
  if (!before || !after || before === after) return after;
  const { amount: beforeAmount, ...beforeFacts } = before;
  const { amount: afterAmount, ...afterFacts } = after;
  return guidedAmountChanged(beforeAmount, afterAmount) || guidedSourceValuesChanged(beforeFacts, afterFacts)
    ? { ...after, sourceFactsConfirmed: null } : after;
}

function matchesFiler(name: string | undefined, last4: string | undefined, person?: { firstName: string; lastName: string; ssn: string }) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const tin = person?.ssn?.replace(/[-\s]/g, "");
  return typeof name === "string" && typeof last4 === "string" && /^\d{4}$/.test(last4)
    && person?.firstName?.trim() && person.lastName?.trim() && tin?.match(/^\d{9}$/)
    && last4 === tin.slice(-4) && normalize(name) === normalize(`${person.firstName} ${person.lastName}`);
}

export function buildGuidedReitPtpLossSource(state: GuidedFlowState) {
  const source = state.sectionData.adjustments?.reitPtpLossSource;
  if (source === undefined) {
    if (state.segmentation.lifeEvents.includes("reit-ptp-loss-carryforward")) {
      throw new Error("Add the preceding filed REIT and PTP loss form or correct your carryforward answer.");
    }
    return undefined;
  }
  const { taxYear } = state;
  const { filingStatus } = state.segmentation;
  const personal: PersonalInfoData | undefined = state.sectionData["personal-info"];
  if (!source || taxYear == null || !Number.isInteger(taxYear) || source.sourceTaxYear !== String(taxYear - 1)) {
    throw new Error("Enter the tax year from the immediately preceding filed REIT and PTP loss form.");
  }
  if (source.sourceForm !== "form_8995" && source.sourceForm !== "form_8995_a") {
    throw new Error("Choose the filed form that reports the REIT and PTP loss carryforward.");
  }
  if (typeof source.sourceReference !== "string" || !source.sourceReference.trim()) {
    throw new Error("Enter a reference to the filed REIT and PTP loss form.");
  }
  const amountIssue = amountError(source.amount, "filed REIT and PTP loss carryforward");
  if (amountIssue) throw new Error(amountIssue);
  if (filingStatus == null || source.priorFilingStatus !== filingStatus || !matchesFiler(source.primaryName, source.primaryTaxIdLast4, personal)) {
    throw new Error("Match the prior filing status and primary filer to the current return.");
  }
  if (filingStatus === "mfj" && (source.sameJointFilersConfirmed !== true || !matchesFiler(source.spouseName, source.spouseTaxIdLast4, personal?.spouse))) {
    throw new Error("Match both filers and confirm the same joint filing unit on the prior return.");
  }
  if (filingStatus !== "mfj" && (source.sameJointFilersConfirmed === true || source.spouseName || source.spouseTaxIdLast4)) {
    throw new Error("Reconcile the joint filer details before using this carryforward on a separate return.");
  }
  if (source.sourceFactsConfirmed !== true) throw new Error("Confirm the carryforward against the preceding filed form.");
  return {
    sourceTaxYear: taxYear - 1,
    sourceForm: source.sourceForm,
    sourceReference: source.sourceReference.trim(),
    sourceFactsConfirmed: true,
    ...(filingStatus === "mfj" ? { owner: "joint" as const, sameJointFilersConfirmed: true } : { owner: "primary" as const }),
    amount: parseGuidedCurrency(source.amount).toFixed(),
  };
}

export function reitPtpLossSourceFactErrors(state: GuidedFlowState): Record<string, string> {
  try {
    buildGuidedReitPtpLossSource(state);
    return {};
  } catch (error) {
    return { reitPtpLossSource: error instanceof Error ? error.message : "Review the filed REIT and PTP loss carryforward source." };
  }
}
