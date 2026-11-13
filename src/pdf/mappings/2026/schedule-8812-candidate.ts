/**
 * Final 2026 Schedule 8812 physical mapping candidate, Created 8/18/26.
 * Spec: spec/federal/schedule-8812-2026-template.yaml.
 * No calculation, export registry or filing qualification is enabled.
 */
const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";

export const SCHEDULE_8812_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040s8.pdf",
  sourceRevision: "Created 8/18/26",
  retrievedAt: "2026-11-13T01:11:08Z",
  sha256: "05b96bd809b37cfd0c223ac0909d2d82645eb8bfd6244701189f40ab8a4ab45c",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  reservedField: "line15Reserved",
  // These are printed source references, not calculated inputs or engine routes.
  printedReferences: Object.freeze({
    line1: Object.freeze(["Form 1040 / 1040-SR / 1040-NR line 11b"]),
    line22: Object.freeze(["Schedule 1 line 15", "Schedule 2 line 16c", "Schedule 2 line 17c"]),
  }),
  printedAmounts: Object.freeze({ line5: "$2,200", line7: "$500", line16b: "$1,700" }),
  fields: Object.freeze({
    name: `${page1}f1_1[0]`,
    ssn: `${page1}f1_2[0]`,
    line1: `${page1}f1_3[0]`,
    line2a: `${page1}f1_4[0]`,
    line2b: `${page1}f1_5[0]`,
    line2c: `${page1}f1_6[0]`,
    line2d: `${page1}f1_7[0]`,
    line3: `${page1}f1_8[0]`,
    line4: `${page1}f1_9[0]`,
    line5: `${page1}f1_10[0]`,
    line6: `${page1}Line6ReadOrder[0].f1_11[0]`,
    line7: `${page1}f1_12[0]`,
    line8: `${page1}f1_13[0]`,
    line9: `${page1}f1_14[0]`,
    line10: `${page1}f1_15[0]`,
    line11: `${page1}f1_16[0]`,
    line12: `${page1}f1_17[0]`,
    line12No: `${page1}c1_1[0]`,
    line12Yes: `${page1}c1_1[1]`,
    line13: `${page1}f1_18[0]`,
    line14: `${page1}f1_19[0]`,
    line15Reserved: `${page2}f2_1[0]`,
    line16a: `${page2}f2_2[0]`,
    line16bCount: `${page2}f2_3[0]`,
    line16b: `${page2}f2_4[0]`,
    line17: `${page2}f2_5[0]`,
    line18a: `${page2}f2_6[0]`,
    line18b: `${page2}f2_7[0]`,
    line19No: `${page2}c2_1[0]`,
    line19Yes: `${page2}c2_1[1]`,
    line19: `${page2}f2_8[0]`,
    line20: `${page2}f2_9[0]`,
    nextNo: `${page2}c2_2[0]`,
    nextYes: `${page2}c2_2[1]`,
    line21: `${page2}f2_10[0]`,
    line22: `${page2}f2_11[0]`,
    line23: `${page2}f2_12[0]`,
    line24: `${page2}f2_13[0]`,
    line25: `${page2}f2_14[0]`,
    line26: `${page2}f2_15[0]`,
    line27: `${page2}f2_16[0]`,
  }),
});
