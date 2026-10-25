/**
 * Final 2026 Form4952 physical mapping candidate, created5/28/26.
 * Spec: spec/federal/form-4952-2026-template.yaml.
 * Deliberately absent from public exports, template registries and fillReturn.
 * This immutable map supports independent review; it does not grant readiness.
 */
const page = "topmostSubform[0].Page1[0].";

export const FORM_4952_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f4952.pdf",
  sourceRevision: "Created 5/28/26",
  retrievedAt: "2026-10-25",
  sha256: "90b9fc0bd6778983521b61ed5c94cc5668e62af858e38e94a1a6fd4b631bfb6d",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  fields: Object.freeze({
    name: `${page}f1_1[0]`,
    ssn: `${page}f1_2[0]`,
    line1: `${page}f1_3[0]`,
    line2: `${page}f1_4[0]`,
    line3: `${page}f1_5[0]`,
    line4a: `${page}Line4a_ReadOrder[0].f1_6[0]`,
    line4b: `${page}f1_7[0]`,
    line4c: `${page}f1_8[0]`,
    line4d: `${page}f1_9[0]`,
    line4e: `${page}f1_10[0]`,
    line4f: `${page}f1_11[0]`,
    line4g: `${page}f1_12[0]`,
    line4h: `${page}f1_13[0]`,
    line5: `${page}f1_14[0]`,
    line6: `${page}f1_15[0]`,
    line7: `${page}f1_16[0]`,
    line8: `${page}f1_17[0]`,
  }),
});
