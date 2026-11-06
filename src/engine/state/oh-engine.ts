import {calculateOhio2026EarnedSchoolDraft,type Ohio2026EarnedSchoolDraftResult} from './oh-2026-earned-school-draft.js';
import { calculateOhio2026BusinessDraft, type Ohio2026BusinessDraftResult } from './oh-2026-business-draft.js';
import { calculateOhio2026OrdinarySource, calculateOhio2026PaReciprocalEmployeeSource, calculateOhio2026VaResidentCreditEmployeeSource } from "./oh-2026-ordinary-source.js";
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
export type Ohio2026DraftFromSourcesResult<T> = T extends {methodId:'oh-2026-earned-school-employee-draft-v1'} ? Ohio2026EarnedSchoolDraftResult : T extends { employmentOriginals: unknown }
  ? Ohio2026ReturnDraftResult : T extends { methodId: 'oh-2026-canonical-business-draft-v1' }
    ? Ohio2026BusinessDraftResult : Ohio2026ReturnDraftResult | Ohio2026BusinessDraftResult;
export function calculateOhio2026ReturnDraftFromSources<T>(input: { taxInput: TaxYearInput; sources: T }): Ohio2026DraftFromSourcesResult<T>;
export function calculateOhio2026ReturnDraftFromSources(input: { taxInput: TaxYearInput; sources: unknown }): Ohio2026ReturnDraftResult | Ohio2026BusinessDraftResult | Ohio2026EarnedSchoolDraftResult {
  const method = input.sources !== null && typeof input.sources === 'object' && 'methodId' in input.sources ? input.sources.methodId : undefined;
  if(method==='oh-2026-earned-school-employee-draft-v1')return calculateOhio2026EarnedSchoolDraft(input.taxInput,input.sources);
  if (method === 'oh-2026-canonical-business-draft-v1') return calculateOhio2026BusinessDraft(input.taxInput, input.sources);
  const context = method === 'oh-2026-pa-reciprocal-employee-draft-v1'
    ? calculateOhio2026PaReciprocalEmployeeSource(input.taxInput, input.sources)
    : method === 'oh-2026-va-resident-credit-employee-draft-v1'
      ? calculateOhio2026VaResidentCreditEmployeeSource(input.taxInput, input.sources)
      : calculateOhio2026OrdinarySource(input.taxInput, input.sources);
  return calculateOhio2026ReturnDraft(input.taxInput, input.sources, context);
}
