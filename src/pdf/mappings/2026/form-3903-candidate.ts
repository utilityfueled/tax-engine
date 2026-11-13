/** Disabled final 2026 Form 3903 physical candidate. Spec: spec/federal/form-3903-2026-template.yaml. */
import { calculateForm3903 } from '@/engine/forms/form-3903.js';
import { assertMovingCodePReconciliation } from '@/engine/moving-code-p-sources.js';
import { Form3903Sources2026Schema, type TaxYearInput } from '@/models/inputs.js';
import { roundDollar } from '@/utils/decimal.js';

const page = "topmostSubform[0].Page1[0].";

export const FORM_3903_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f3903--2026.pdf",
  sourceRevision: "Created 9/17/26",
  retrievedAt: "2026-11-13T01:23:09Z",
  sha256: "d1d0b934ba9b046509b33f1aa7617d619241c3334b476f233dfb8e04a9902373",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedReferences: Object.freeze({
    line4: Object.freeze(["Form W-2 box 1", "Form W-2 box 12 code P"]),
    line5Yes: Object.freeze(["Schedule 1 (Form 1040) line 14"]),
    line5NoWithExcess: Object.freeze(["Form 1040 / 1040-SR / 1040-NR line 1h"]),
  }),
  fields: Object.freeze({
    name: `${page}f1_1[0]`,
    ssn: `${page}f1_2[0]`,
    certification: `${page}c1_1[0]`,
    line1: `${page}f1_3[0]`,
    line2: `${page}f1_4[0]`,
    line3: `${page}f1_5[0]`,
    line4: `${page}f1_6[0]`,
    line5No: `${page}c1_2[0]`,
    line5Yes: `${page}c1_2[1]`,
    line5: `${page}f1_7[0]`,
  }),
});

export function projectForm3903CandidateFields(input: TaxYearInput): Record<string, string | boolean> {
  if (input.taxpayer.taxYear !== 2026) throw new Error('This Form 3903 candidate requires a 2026 return');
  if (input.taxpayer.filingStatus !== 'single' || input.taxpayer.spouse) {
    throw new Error('This Form 3903 candidate requires a single-taxpayer return');
  }
  if (input.form2555 || input.stateReturns?.illinois || input.ohioResidency || input.ohioPayments
    || input.ohioReturnHeaderSources || input.ohioSchoolDistrict || input.paResidencySources || input.paReciprocitySources
    || input.paOrdinaryReturnFacts || input.paMarriedOrdinarySources || input.paOrdinaryReturnCompletionSources) {
    throw new Error('This Form 3903 candidate requires federal-only moving sources without Form 2555');
  }
  const parsed = Form3903Sources2026Schema.safeParse(input.form3903);
  if (!parsed.success) throw new Error('The confirmed 2026 moving source packet is required');
  const moving = parsed.data;
  if (moving.moves.length !== 1 || moving.moves[0].accountHolder !== 'primary') {
    throw new Error('This Form 3903 candidate requires one move by the primary taxpayer');
  }
  const result = calculateForm3903(moving, 2026);
  assertMovingCodePReconciliation(input.w2s, 2026, false, moving, result, true);
  const move = result.moveResults[0];
  const [line1, line2, line3, line4, line5] = [move.line1, move.line2, move.line3, move.line4, move.line5].map(roundDollar);
  const taxableReimbursement = move.taxableReimbursement;
  if (taxableReimbursement === undefined || !line1.plus(line2).eq(line3)
    || move.line3.cmp(move.line4) !== line3.cmp(line4)
    || (line3.gt(line4) && !line3.minus(line4).eq(line5))
    || (line4.gt(line3) && !line4.minus(line3).eq(roundDollar(taxableReimbursement)))) {
    throw new Error('This Form 3903 candidate cannot reconcile the rounded moving amounts');
  }
  const yes = line3.gt(line4);
  const fields = FORM_3903_2026_CANDIDATE.fields;
  return {
    [fields.certification]: true,
    [fields.line1]: line1.toFixed(0),
    [fields.line2]: line2.toFixed(0),
    [fields.line3]: line3.toFixed(0),
    [fields.line4]: line4.toFixed(0),
    [fields.line5Yes]: yes,
    [fields.line5No]: !yes,
    ...(yes ? { [fields.line5]: line5.toFixed(0) } : {}),
  };
}
