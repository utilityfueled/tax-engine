/** Final 2026 Form 3903 physical source. Spec: spec/federal/form-3903-2026-template.yaml. */
const page = "topmostSubform[0].Page1[0].";

export const FORM_3903_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f3903.pdf",
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
