/**
 * Final 2026 schedule-r physical field candidate.
 * Spec: spec/federal/schedule-r-2026-template.yaml.
 * This immutable source map is absent from all public exports and registries.
 * It performs no tax calculation and does not grant review or filing readiness.
 */
export const SCHEDULE_R_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sr.pdf",
  sourceRevision: "Created 4/21/26",
  retrievedAt: "2026-11-01",
  sha256: "945275e6be3cc7353a3faf165ddd7ccb79e3c8a43abe6678d4c47f8207594cb5",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  line14Source: "Form 1040 line 11b",
  fields: Object.freeze({
    name: "topmostSubform[0].Page1[0].f1_1[0]",
    ssn: "topmostSubform[0].Page1[0].f1_2[0]",
    box1: "topmostSubform[0].Page1[0].c1_1[0]",
    box2: "topmostSubform[0].Page1[0].c1_1[1]",
    box3: "topmostSubform[0].Page1[0].Married[0].c1_1[0]",
    box4: "topmostSubform[0].Page1[0].Married[0].c1_1[1]",
    box5: "topmostSubform[0].Page1[0].Married[0].c1_1[2]",
    box6: "topmostSubform[0].Page1[0].Married[0].c1_1[3]",
    box7: "topmostSubform[0].Page1[0].Married[0].c1_1[4]",
    box8: "topmostSubform[0].Page1[0].MarriedSeparate[0].c1_1[0]",
    box9: "topmostSubform[0].Page1[0].MarriedSeparate[0].c1_1[1]",
    priorPhysicianStatement: "topmostSubform[0].Page1[0].c1_2[0]",
    line10: "topmostSubform[0].Page2[0].f2_1[0]",
    line11: "topmostSubform[0].Page2[0].f2_2[0]",
    line12: "topmostSubform[0].Page2[0].f2_3[0]",
    line13a: "topmostSubform[0].Page2[0].f2_4[0]",
    line13b: "topmostSubform[0].Page2[0].f2_5[0]",
    line13c: "topmostSubform[0].Page2[0].f2_6[0]",
    line14Agi: "topmostSubform[0].Page2[0].f2_7[0]",
    line15: "topmostSubform[0].Page2[0].f2_8[0]",
    line16: "topmostSubform[0].Page2[0].f2_9[0]",
    line17: "topmostSubform[0].Page2[0].f2_10[0]",
    line18: "topmostSubform[0].Page2[0].f2_11[0]",
    line19: "topmostSubform[0].Page2[0].f2_12[0]",
    line20: "topmostSubform[0].Page2[0].f2_13[0]",
    line21: "topmostSubform[0].Page2[0].f2_14[0]",
    line22: "topmostSubform[0].Page2[0].f2_15[0]",
  }),
});
