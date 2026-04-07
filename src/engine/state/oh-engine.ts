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
