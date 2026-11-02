/** Explicit fictional records; no defaults in product. Spec state/guided-pa-ordinary-panels.yaml. */
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import type { PAOrdinaryReturnFacts } from "@/models/pa-ordinary-return-facts.js";
import type { PAOrdinaryReturnCompletionSources } from "@/models/pa-ordinary-return-completion.js";
import type { StateReturnData } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { confirmGuidedPAResidencySources } from "@/lib/guided-pa-residency-facts";
import { confirmGuidedPAOrdinaryReturnFacts } from "@/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "@/lib/guided-pa-ordinary-return-completion";
import { paOrdinaryReturnFixture } from "./pa-ordinary-return.js";
import { completeW2Entry, completeInterestSource, startCompleteInterview } from "../guided-interview/complete-facts";
export const paPanelStatuses = ["resident", "part_year", "nonresident"] as const;
export type PAOrdinaryPanelData = StateReturnData & { paOrdinaryReturnFacts?: PAOrdinaryReturnFacts; paOrdinaryReturnCompletionSources?: PAOrdinaryReturnCompletionSources };
export function required<T>(value: T | undefined | null): T { if (value == null) throw new Error("Expected explicit fictional source"); return value; }
export function guidedPAOrdinaryPanelFixture(status: typeof paPanelStatuses[number] = "resident") {
  const f = paOrdinaryReturnFixture(status), originalW2 = required(f.input.w2s[0]), originalBank = required(f.input.form1099Int[0]);
  const state = startCompleteInterview({ filingStatus: "single", incomeTypes: ["w2-wages", "investments"], lifeEvents: [], stateCode: "PA" });
  const personal = required(state.sectionData["personal-info"]);
  Object.assign(personal, { firstName: "Avery", lastName: "Pennsylvania", ssn: "900-70-0311", stateResidency: status === "resident" ? "full-year" : status === "part_year" ? "part-year" : "nonresident", addressLine1: "10 Fictional Way", city: "Albany", state: "NY", zip: "12201" });
  state.sectionData["income-w2"] = { entries: [{ ...completeW2Entry, sourceTaxYear: "2025", employerName: originalW2.employer.name, employerEin: originalW2.employer.ein, wages: "50000", federalWithheld: originalW2.federalWithheld, socialSecurityWages: "50000", socialSecurityWithheld: "3100", medicareWages: "50000", medicareWithheld: "725", stateTaxReporting: "single", state: "PA", stateWages: originalW2.stateWages, stateWithheld: originalW2.stateTaxWithheld, localWages: "0", localTaxWithheld: "0", localityName: "" }] };
  state.sectionData["income-investments"] = { interestEntries: [{ ...completeInterestSource, payer: originalBank.payer, payerTin: originalBank.payerTin, accountReference: originalBank.accountReference, interestIncome: "120", stateTaxReporting: "single", state: "PA", stateWithheld: "0" }], dividendEntries: [], brokerageEntries: [] };
  state.sectionData["state-return"] = { stateEstimatedPayments: [], additionalStateWithholding: "" };
  const raw = buildTaxInputFromGuidedData(state); if (!raw) throw new Error("Explicit fictional federal facts must be source-complete");
  const federalOriginal = TaxYearInputSchema.parse(raw);
  const residency = confirmGuidedPAResidencySources(federalOriginal, f.input.paResidencySources);
  const sourceInput: TaxYearInput = { ...federalOriginal, paResidencySources: residency };
  const facts = confirmGuidedPAOrdinaryReturnFacts(sourceInput, f.facts);
  const sources = confirmGuidedPAOrdinaryReturnCompletionSources(sourceInput, f.sources);
  const data: PAOrdinaryPanelData = { stateEstimatedPayments: [], additionalStateWithholding: "", paResidencySources: residency, paOrdinaryReturnFacts: facts, paOrdinaryReturnCompletionSources: sources };
  state.sectionData["state-return"] = data;
  return { state, data, federalOriginal, sourceInput, facts, sources };
}
