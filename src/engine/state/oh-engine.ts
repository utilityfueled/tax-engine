import { calculateOhio2026OrdinarySource, calculateOhio2026PaReciprocalEmployeeSource } from "./oh-2026-ordinary-source.js";
import { calculateOhio2026ReturnDraft, type Ohio2026ReturnDraftResult } from "./oh-2026-return-draft.js";
import {
  buildOhioResidentReturnInput,
  type OhioOverlayInput,
} from "@/engine/state/oh-input-adapter.js";
import {
  calculateOhioResidentReturn,
  type OhioResidentReturnResult,
} from "@/engine/state/oh-return.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

export interface CalculateOhioResidentReturnFromFederalInput {
  taxInput: TaxYearInput;
  federalResult: TaxReturnResult;
  overlay?: OhioOverlayInput;
}

export function calculateOhioResidentReturnFromFederal(
  input: CalculateOhioResidentReturnFromFederalInput,
): OhioResidentReturnResult {
  const ohioInput = buildOhioResidentReturnInput(
    input.taxInput,
    input.federalResult,
    input.overlay ?? {},
  );

  return calculateOhioResidentReturn(ohioInput);
}

/** Explicit finite2026 draft; never fabricates a full federal return or opens filing.
 * Spec: state/oh-2026-return-draft.yaml. Historical FromFederal is unchanged.
 */
export function calculateOhio2026ReturnDraftFromSources(input: { taxInput: TaxYearInput; sources: unknown }): Ohio2026ReturnDraftResult {
  const method = input.sources !== null && typeof input.sources === 'object' && 'methodId' in input.sources ? input.sources.methodId : undefined;
  const context = method === 'oh-2026-pa-reciprocal-employee-draft-v1'
    ? calculateOhio2026PaReciprocalEmployeeSource(input.taxInput, input.sources)
    : calculateOhio2026OrdinarySource(input.taxInput, input.sources);
  return calculateOhio2026ReturnDraft(input.taxInput, input.sources, context);
}
