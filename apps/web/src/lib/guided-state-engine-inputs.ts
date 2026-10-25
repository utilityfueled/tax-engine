import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs";
import { extractOhioWithholding, type OhioOverlayInput } from "@/engine/state/oh-input-adapter";
import type { PAOrchestratorOverrides } from "@/engine/state/pa-orchestrator";
import type { GuidedFlowState, StateReturnData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { assertKnownFacts } from "./guided-required-facts";
import { statePaymentFactErrors, sumAdditionalStateWithholding } from "./guided-state-facts";

function actualStatePayments(state: GuidedFlowState, code: string): StateReturnData | undefined {
  const data = state.sectionData["state-return"];
  assertKnownFacts(statePaymentFactErrors(data, state.taxYear, code));
  return data;
}
function estimatedPayments(data: StateReturnData): string {
  return data.stateEstimatedPayments.reduce((sum, entry) => sum.plus(parseGuidedCurrency(entry.amount)), new Decimal(0)).toFixed();
}

/** The same actual payment overlay is used for the preview and saved review PDF. */
export function buildGuidedOhioOverlay(taxInput: TaxYearInput, state?: GuidedFlowState | null): OhioOverlayInput {
  if (!state || state.segmentation.stateCode !== "OH") return {};
  const data = actualStatePayments(state, "OH");
  if (!data) return {};
  const result: OhioOverlayInput = {};
  if (data.additionalStateWithholdingEntries?.length) {
    const sourceWithholding = extractOhioWithholding(taxInput.w2s, taxInput.formW2G, taxInput.form1099G,
      taxInput.form1099K, taxInput.form1099R, taxInput.form1099Nec, taxInput.form1099Misc,
      taxInput.form1099Int, taxInput.form1099Div, taxInput.form1099B, taxInput.form1099OID);
    result.ohioWithholdingOverride = sourceWithholding.plus(sumAdditionalStateWithholding(data)).toFixed();
  }
  if (data.stateEstimatedPayments.length) result.estimatedPayments = estimatedPayments(data);
  return result;
}

export function buildGuidedPennsylvaniaOverrides(state?: GuidedFlowState | null): PAOrchestratorOverrides {
  if (!state || state.segmentation.stateCode !== "PA") return {};
  const data = actualStatePayments(state, "PA");
  if (!data) return {};
  return {
    ...(data.additionalStateWithholdingEntries?.length ? { additionalStateWithholding: sumAdditionalStateWithholding(data) } : {}),
    ...(data.stateEstimatedPayments.length ? { estimatedPayments: new Decimal(estimatedPayments(data)) } : {}),
  };
}
