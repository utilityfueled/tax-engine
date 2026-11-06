/**
 * Final 2026 Schedule SE physical mapping candidate, Created 4/27/26.
 * Spec: spec/federal/schedule-se-2026-template.yaml.
 * No calculation, export registry or filing qualification is enabled.
 */
const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";

export const SCHEDULE_SE_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sse.pdf",
  sourceRevision: "Created 4/27/26",
  retrievedAt: "2026-11-06T00:18:55.962869Z",
  sha256: "a42f5a19c0e84a966a49b5f4ca021d3f49c4fda2e087da0b00bf2003525f8655",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  // The printed constants are source text, not calculated or writable amounts.
  printedConstants: Object.freeze({ line7: "$184,500", line14: "$7,560" }),
  emptyPrintedAmountAnchors: Object.freeze([
    "line7PrintedAmountAnchor", "line14PrintedAmountAnchor",
  ] as const),
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    ssn: `${page1}f1_2[0]`,
    ministerForm4361: `${page1}c1_1[0]`,
    line1a: `${page1}f1_3[0]`,
    line1b: `${page1}f1_4[0]`,
    line2: `${page1}f1_5[0]`,
    line3: `${page1}f1_6[0]`,
    line4a: `${page1}f1_7[0]`,
    line4b: `${page1}f1_8[0]`,
    line4c: `${page1}f1_9[0]`,
    line5a: `${page1}f1_10[0]`,
    line5b: `${page1}f1_11[0]`,
    line6: `${page1}f1_12[0]`,
    line7PrintedAmountAnchor: `${page1}f1_13[0]`,
    line8a: `${page1}f1_14[0]`,
    line8b: `${page1}f1_15[0]`,
    line8c: `${page1}f1_16[0]`,
    line8d: `${page1}f1_17[0]`,
    line9: `${page1}f1_18[0]`,
    line10: `${page1}f1_19[0]`,
    line11: `${page1}f1_20[0]`,
    line12: `${page1}f1_21[0]`,
    line13: `${page1}f1_22[0]`,
    line14PrintedAmountAnchor: `${page2}f2_1[0]`,
    line15: `${page2}f2_2[0]`,
    line16: `${page2}f2_3[0]`,
    line17: `${page2}f2_4[0]`,
  }),
});
