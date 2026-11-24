/** Disabled Schedule B source pin. Spec: spec/federal/schedule-b-2026-template.yaml. */
const page1 = "topmostSubform[0].Page1[0].";

export const SCHEDULE_B_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sb.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f1040sb--2026.pdf",
  aboutUrl: "https://www.irs.gov/forms-pubs/about-schedule-b-form-1040",
  catalogUrl: "https://www.irs.gov/forms-instructions-and-publications?find=1040&items_per_page=25&order=posted_date&page=0&sort=desc",
  instructionsUrl: "https://www.irs.gov/pub/irs-pdf/i1040sb.pdf",
  sourceRevision: "Created 6/9/26",
  postedDate: "2026-11-24",
  retrievedAt: "2026-11-24T20:32:40Z",
  byteLength: 72863,
  sha256: "f4b1827b12113dcdc2b5e14181b3c658fa5553a277dea02e5106000b592815af",
  reviewStatus: "independent-review-pending",
  exportsEnabled: false,
  filingQualified: false,
  nativeTextFields: Object.freeze(Array.from({ length: 66 }, (_, index) => {
    const fieldNumber = index + 1;
    const grouping = fieldNumber === 3 ? "Line1_ReadOrder[0]." : fieldNumber === 34 ? "ReadOrderControl[0]." : "";
    return `${page1}${grouping}f1_${String(fieldNumber).padStart(2, "0")}[0]`;
  })),
  nativeCheckboxFields: Object.freeze([
    "TagcorrectingSubform[0].c1_1[0]", "TagcorrectingSubform[0].c1_1[1]",
    "c1_2[0]", "c1_2[1]", "c1_3[0]", "c1_3[1]",
  ].map(name => page1 + name)),
});
