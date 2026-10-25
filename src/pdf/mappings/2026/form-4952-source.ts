/** Final source inspection only. Unregistered; no2026 export or filing qualification. */
const p1 = (field: string) => `topmostSubform[0].Page1[0].${field}`;
export const FORM_4952_2026_SOURCE = Object.freeze({
  taxYear: 2026,
  filename: "f4952.pdf",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f4952.pdf",
  retrievedAt: "2026-10-25",
  revision: "2026; created2026-05-28",
  sha256: "90b9fc0bd6778983521b61ed5c94cc5668e62af858e38e94a1a6fd4b631bfb6d",
  qualification: "source-inspected; independent-human-and-export-review-pending",
  filingQualified: false,
  fields: Object.freeze({
    name: p1("f1_1[0]"), ssn: p1("f1_2[0]"),
    line1: p1("f1_3[0]"), line2: p1("f1_4[0]"), line3: p1("f1_5[0]"),
    line4a: p1("Line4a_ReadOrder[0].f1_6[0]"), line4b: p1("f1_7[0]"),
    line4c: p1("f1_8[0]"), line4d: p1("f1_9[0]"), line4e: p1("f1_10[0]"),
    line4f: p1("f1_11[0]"), line4g: p1("f1_12[0]"), line4h: p1("f1_13[0]"),
    line5: p1("f1_14[0]"), line6: p1("f1_15[0]"), line7: p1("f1_16[0]"), line8: p1("f1_17[0]"),
  }),
});
