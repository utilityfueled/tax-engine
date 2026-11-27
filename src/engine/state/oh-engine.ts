import {calculateOhio2026EarnedSchoolDraft,type Ohio2026EarnedSchoolDraftResult} from './oh-2026-earned-school-draft.js';
import { calculateOhio2026ResidentCapitalGainDraft, type Ohio2026ResidentCapitalGainDraftResult } from './oh-2026-resident-capital-gain-draft.js';
import { calculateOhio2026BusinessDraft, type Ohio2026BusinessDraftResult } from './oh-2026-business-draft.js';
import { calculateOhio2026BankInterestAndDividendsSource, calculateOhio2026OrdinarySource, calculateOhio2026PartYearPaReciprocalEmployeeSource, calculateOhio2026PaReciprocalEmployeeSource, calculateOhio2026VaResidentCreditEmployeeSource } from "./oh-2026-ordinary-source.js";
import { calculateOhio2026BankInterestReturnDraft, calculateOhio2026CashDividendReturnDraft, calculateOhio2026ReturnDraft, calculateOhio2026UnemploymentReturnDraft, type Ohio2026ReturnDraftResult } from "./oh-2026-return-draft.js";
import {
  buildOhioResidentReturnInput,
  type OhioOverlayInput,
} from "@/engine/state/oh-input-adapter.js";
import {
  calculateOhioResidentReturn,
  type OhioResidentReturnResult,
} from "@/engine/state/oh-return.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { OHIO_2026_PA_PART_YEAR_RECIPROCAL_METHOD } from '@/models/ohio-2026-part-year-reciprocal-wage-sources.js';
import type { TaxReturnResult } from "@/models/outputs.js";
import { OHIO_2026_UNEMPLOYMENT_EMPLOYEE_METHOD, Ohio2026BankInterestAndDividendsMethodSchema, Ohio2026BankInterestMethodSchema, Ohio2026CashDividendMethodSchema } from '@/models/ohio-2026-return-draft.js';

export { calculateOhio2026RefundableJobsCreditDraft } from './oh-2026-refundable-jobs-credit-draft.js';
export { calculateOhio2026TraditionalSchoolDraft } from './oh-2026-traditional-school-draft.js';

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
export type Ohio2026DraftFromSourcesResult<T> = T extends { methodId: 'oh-2026-resident-capital-gain-draft-v1' } ? Ohio2026ResidentCapitalGainDraftResult : T extends {methodId:'oh-2026-earned-school-employee-draft-v1'} ? Ohio2026EarnedSchoolDraftResult : T extends { employmentOriginals: unknown }
  ? Ohio2026ReturnDraftResult : T extends { methodId: 'oh-2026-canonical-business-draft-v1' }
    ? Ohio2026BusinessDraftResult : Ohio2026ReturnDraftResult | Ohio2026BusinessDraftResult | Ohio2026ResidentCapitalGainDraftResult;
export function calculateOhio2026ReturnDraftFromSources<T>(input: { taxInput: TaxYearInput; sources: T }): Ohio2026DraftFromSourcesResult<T>;
export function calculateOhio2026ReturnDraftFromSources(input: { taxInput: TaxYearInput; sources: unknown }): Ohio2026ReturnDraftResult | Ohio2026BusinessDraftResult | Ohio2026EarnedSchoolDraftResult | Ohio2026ResidentCapitalGainDraftResult {
  const method = input.sources !== null && typeof input.sources === 'object' && 'methodId' in input.sources ? input.sources.methodId : undefined;
  if (method === 'oh-2026-resident-capital-gain-draft-v1') return calculateOhio2026ResidentCapitalGainDraft(input.taxInput, input.sources);
  if(method==='oh-2026-earned-school-employee-draft-v1')return calculateOhio2026EarnedSchoolDraft(input.taxInput,input.sources);
  if (method === 'oh-2026-canonical-business-draft-v1') return calculateOhio2026BusinessDraft(input.taxInput, input.sources);
  if (method === OHIO_2026_UNEMPLOYMENT_EMPLOYEE_METHOD) return calculateOhio2026UnemploymentReturnDraft(input.taxInput, input.sources);
  if (Ohio2026BankInterestMethodSchema.safeParse(method).success) return calculateOhio2026BankInterestReturnDraft(input.taxInput, input.sources);
  if (Ohio2026CashDividendMethodSchema.safeParse(method).success) return calculateOhio2026CashDividendReturnDraft(input.taxInput, input.sources);
  if (Ohio2026BankInterestAndDividendsMethodSchema.safeParse(method).success) {
    const context = calculateOhio2026BankInterestAndDividendsSource(input.taxInput, input.sources);
    return calculateOhio2026ReturnDraft(input.taxInput, input.sources, context);
  }
  if (method === OHIO_2026_PA_PART_YEAR_RECIPROCAL_METHOD) {
    const context = calculateOhio2026PartYearPaReciprocalEmployeeSource(input.taxInput, input.sources);
    return calculateOhio2026ReturnDraft(input.taxInput, input.sources, context);
  }
  const context = method === 'oh-2026-pa-reciprocal-employee-draft-v1'
    ? calculateOhio2026PaReciprocalEmployeeSource(input.taxInput, input.sources)
    : method === 'oh-2026-va-resident-credit-employee-draft-v1'
      ? calculateOhio2026VaResidentCreditEmployeeSource(input.taxInput, input.sources)
      : calculateOhio2026OrdinarySource(input.taxInput, input.sources);
  return calculateOhio2026ReturnDraft(input.taxInput, input.sources, context);
}
