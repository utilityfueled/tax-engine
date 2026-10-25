import type { PDFDocument } from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";

export interface QualifiedFilingForm {
  readonly id: string;
  readonly taxYear: number;
  readonly filename: string;
  readonly sha256: string;
  readonly finalRevision: string;
  readonly officialSource: string;
  readonly independentMappingReview: string;
  /** A dedicated final-form renderer. Review mappings must never be registered. */
  readonly render: (input: TaxYearInput, result: TaxReturnResult, template: Uint8Array) => Promise<PDFDocument>;
}

export interface QualifiedFilingScenario {
  readonly id: string;
  readonly taxYear: number;
  readonly ruleVersion: string;
  readonly independentTaxReview: string;
  readonly independentSecurityReview: string;
  readonly releaseApproval: string;
  readonly forms: Readonly<Record<string, QualifiedFilingForm>>;
  /** Must reject unknown required facts and all scenarios outside the reviewed scope. */
  readonly validateCompleteInput: (input: TaxYearInput) => void;
  /** Complete attachment list, derived from the independently checked result. */
  readonly selectForms: (input: TaxYearInput, result: TaxReturnResult) => readonly string[];
}

/** Compiled, reviewed allowlist. No environment, request, AI or runtime override.
 * No scenario has the required final-form, tax, security and release evidence.
 * Adding a scenario is a separately reviewed release change, never a user flag.
 */
export const QUALIFIED_FILING_SCENARIOS: Readonly<Record<string, QualifiedFilingScenario>> = Object.freeze({});
