/**
 * Actual2025 Ohio physical source candidate.
 * Spec: spec/state/oh-official-physical-candidates.yaml.
 * Inactive: no public export, registry registration or filing qualification.
 * Printed page labels control; embedded legacy field tooltips are not authority.
 * Grouped residency/status buttons require explicit actual1/2/3 widget states.
 * This map performs no monetary calculation or source/eligibility inference.
 */
export const OH_IT_NRC_2025_CANDIDATE = Object.freeze({
  taxYear: 2025,
  mappingVersion: "2025.1-candidate",
  sourceUrl: "https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/ohio_individual/individual/2025/itnrc-fi.pdf",
  sourceRevision: "Actual printed2025 official source",
  retrievedAt: "2026-11-02",
  sha256: "7e2f83559370510e129a6d720e090ae08aeefffcc75083c0b91561df85639c52",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  scope: "SectionI only; SectionsII/III require separate source maps",
  fields: Object.freeze({
    "primaryResidentStart": "prim-start",
    "primaryResidentEnd": "prim-end",
    "spouseResidentStart": "spouse-start",
    "spouseResidentEnd": "spouse-end",
    "primarySsn": "ssn",
    "line7AdditionList": "Text1",
    "line8DeductionList": "Text2",
    "line14DeductionList": "Text4",
    "line1a": "1a",
    "line1b": "1b",
    "line2a": "2a",
    "line2b": "2b",
    "line3a": "3a",
    "line3b": "3b",
    "line4a": "4a",
    "line4b": "4b",
    "line5b": "5b",
    "line6b": "6b",
    "line7b": "7b",
    "line8b": "8b",
    "line9b": "9b",
    "line10a": "10a",
    "line10b": "10b",
    "line11a": "11a",
    "line11b": "11b",
    "line12a": "12a",
    "line12b": "12b",
    "line13a": "13a",
    "line13b": "13b",
    "line14a": "14a",
    "line14b": "14b",
    "line15b": "15b",
    "line16b": "16b",
    "line17b": "17b",
    "line18b": "18b",
    "line19": "19",
    "line20": "20"
  }),
});
