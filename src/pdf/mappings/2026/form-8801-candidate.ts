/** Disabled Form 8801 source receipt and verified Part II widget identifiers. */
const page2 = "topmostSubform[0].Page2[0].";

export const FORM_8801_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8801.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8801--2026.pdf",
  sourceRevision: "Created 5/27/26",
  postedDate: "2026-11-23",
  retrievedAt: "2026-11-24T14:38:25Z",
  sha256: "782d879f1d6e3ca636c129a61092f957f86e028e056e5261e5feb3895410d8f1",
  reviewStatus: "independent-review-pending",
  exportsEnabled: false,
  filingQualified: false,
  partIIFields: Object.freeze({
    "16": page2 + "f2_1[0]",
    "17": page2 + "f2_2[0]",
    "18": page2 + "f2_3[0]",
    "19": page2 + "f2_4[0]",
    "20": page2 + "f2_5[0]",
    "21": page2 + "f2_6[0]",
    "22": page2 + "f2_7[0]",
    "23": page2 + "f2_8[0]",
    "24": page2 + "f2_9[0]",
    "25": page2 + "f2_10[0]",
    "26": page2 + "f2_11[0]",
  }),
});
