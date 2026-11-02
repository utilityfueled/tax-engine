// Spec: spec/state/guided-state-routing.yaml, PA-guided-raw-and-printed-boundary.
import { expect } from "vitest";
import type { GuidedFlowState } from "@/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { buildGuidedPennsylvaniaOverrides } from "@/lib/guided-state-engine-inputs";
import { calculatePAReturn } from "@/engine/state/pa-orchestrator";
import { TaxYearInputSchema } from "@/models/inputs";

/** Compare independent literal expectations at both real production boundaries. */
export function assertPAGuidedPaymentBoundary(state: GuidedFlowState, exactSources: string, printedWithholding: string): void {
  const input = buildTaxInputFromGuidedData(state);
  expect(input).not.toBeNull();
  const result = calculatePAReturn(TaxYearInputSchema.parse(input), buildGuidedPennsylvaniaOverrides(state));
  expect(result.stateWithholding.toFixed()).toBe(exactSources);
  expect(result.pa40.stateWithholding.toFixed()).toBe(printedWithholding);
}
