/** Literal synthetic actual records; no production defaults. */
import { TaxYearInputSchema } from "@/models/inputs.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { confirmGuidedOhioResidencyFacts, buildGuidedOhioResidencyFacts } from "@/lib/guided-ohio-residency-facts";
import { confirmGuidedOhioPaymentFacts, buildGuidedOhioPaymentFacts } from "@/lib/guided-ohio-payment-facts";
import type { GuidedFlowState, StateReturnData } from "@/lib/guided-interview-flow";
import { ohioPaymentFixture, actualOhioPayment } from "./oh-payments.js";
import { startCompleteInterview, completeW2Entry } from "../guided-interview/complete-facts";
export const ohioNavigationStatuses = ["full_year_resident", "part_year_resident", "nonresident"] as const;
export function guidedOhioNavigationFixture(status: typeof ohioNavigationStatuses[number] = "full_year_resident") {
  const actual = ohioPaymentFixture(status);
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: "OH" });
  const personal = state.sectionData["personal-info"]; if (!personal) throw new Error("Synthetic personal originals required");
  Object.assign(personal, { firstName: "Avery", lastName: "Payment", ssn: "900-70-0311", stateResidency: status === "full_year_resident" ? "full-year" : status === "part_year_resident" ? "part-year" : "nonresident" });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: "2025", wages: "100000", federalWithheld: "0", socialSecurityWages: "100000", socialSecurityWithheld: "6200", medicareWages: "100000", medicareWithheld: "1450", stateTaxReporting: "single", state: "OH", stateWages: status === "full_year_resident" ? "100000" : status === "part_year_resident" ? "40000" : "20000", stateWithheld: "0", localWages: "0", localTaxWithheld: "0", localityName: "" }] };
  const data: StateReturnData = { stateEstimatedPayments: [], additionalStateWithholding: "", ohioResidency: { ...actual.ohioResidency, taxYear: "2025" }, ohioPayments: { ...actual.ohioPayments, taxYear: "2025", paymentRows: [actualOhioPayment(actual, "100.01", "2025-04-15")], specialFacts: { farmingFishingIncome: "known_none", militaryDisasterRelief: "known_none" } } };
  state.sectionData["state-return"] = data;
  const raw = buildTaxInputFromGuidedData(state); if (!raw) throw new Error("Literal actual federal facts must be complete");
  const original = TaxYearInputSchema.parse(raw);
  // Explicit synthetic retained originals are supplied as facts for source-read controls.
  // Separate controls exercise the UI/exported confirm action; reads must never replace these.
  Object.assign(required(data.ohioResidency), { originalFederalSources: structuredClone(original) });
  Object.assign(required(data.ohioPayments), { originalFederalSources: structuredClone(original) });
  // These independent existing builders prove fixture admissibility without a return calculation.
  const residency = buildGuidedOhioResidencyFacts(data.ohioResidency, original);
  const payments = buildGuidedOhioPaymentFacts(data.ohioPayments, original);
  return { state, data, original, residency, payments };
}

/** Explicit whole-year synthetic source setup for existing guide-only regressions.
 * Residency and payment facts are literal existing fixture records, not inferred
 * from a postal address, liability, old scalar or generic payment entry. */
export function explicitlyConfirmFullYearOhioNavigationFixture(state: GuidedFlowState) {
  const actual = ohioPaymentFixture("full_year_resident");
  const raw = buildTaxInputFromGuidedData(state); if (!raw) throw new Error("Existing fixture must supply complete actual federal originals before confirmation");
  const original = TaxYearInputSchema.parse(raw);
  const current = state.sectionData["state-return"] ?? { stateEstimatedPayments: [], additionalStateWithholding: "" };
  state.sectionData["state-return"] = { ...current,
    ohioResidency: confirmGuidedOhioResidencyFacts(original, { ...actual.ohioResidency, taxYear: "2025" }),
    ohioPayments: confirmGuidedOhioPaymentFacts(original, { ...actual.ohioPayments, taxYear: "2025", specialFacts: { farmingFishingIncome: "known_none", militaryDisasterRelief: "known_none" } }),
  };
  return state;
}

function required<T>(value: T | undefined | null): T { if (value == null) throw new Error("Explicit source fixture value required"); return value; }
