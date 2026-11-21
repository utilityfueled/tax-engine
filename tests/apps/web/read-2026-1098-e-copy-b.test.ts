import { describe, expect, it, vi } from "vitest";
import { read20261098ECopyB } from "../../../apps/web/src/lib/read-2026-1098-e-copy-b";

function textAt(str: string, x: number, y: number, width = 5) {
  return { str, transform: [8, 0, 0, 8, x, y], width };
}

const officialLabels = [
  textAt("1098-E", 424.747, 687.86),
  textAt("20", 403.4, 715.294, 27.808),
  textAt("26", 431.208, 715.294, 29.392),
  textAt("Student", 531.313, 731.73),
  textAt("Loan Interest", 500.221, 717.33),
  textAt("Statement", 516.889, 702.93),
  textAt("Copy B", 541.36, 674.861),
  textAt("For Borrower", 518.833, 662.576),
  textAt("CORRECTED (if checked)", 259.2, 758.86),
  textAt("Student loan interest received by lender", 305.038, 676.002),
  textAt("If checked, box 1 does", 305.038, 568.502),
  textAt("not", 378.426, 568.502),
  textAt("include loan origination", 391.264, 568.502),
  textAt("fees and/or capitalized interest for loans made before", 305.199, 561.502),
  textAt("September 1, 2004", 305.199, 554.502),
  textAt("1098-E", 68.684, 542.86),
];

const prefix = "topmostSubform[0].CopyB[0].";

const visibleWidget = { subtype: "Widget", rotation: 0, hidden: false, annotationFlags: 4, hasAppearance: true };
const box1 = {
  ...visibleWidget,
  fieldName: prefix + "RightCol[0].f2_19[0]", rect: [305.2, 660.002, 495.8, 672.001],
  fieldType: "Tx", fieldValue: "1,234.56", textContent: ["1,234.56"],
};
const box2 = {
  ...visibleWidget,
  fieldName: prefix + "RightCol[0].c2_2[0]", rect: [484.399, 554.002, 492.399, 562.002],
  fieldType: "Btn", checkBox: true, fieldValue: "1", exportValue: "1",
  defaultAppearanceData: { fontName: "ZaDb", fontSize: 5.6 },
};
const correction = {
  ...visibleWidget,
  fieldName: prefix + "CopyBHeader[0].c2_1[0]", rect: [244.8, 757, 254.8, 767],
  fieldType: "Btn", checkBox: true, fieldValue: "Off", exportValue: "2",
  defaultAppearanceData: { fontName: "dummy__noop", fontSize: 0 },
};

describe("2026 Form 1098-E Copy B evidence", () => {
  // Spec: spec/federal/form-1098-e.yaml#sourceEvidence.
  it("retains the printed 2026 year, Box 1 cents and genuine Box 2 checked state for review", async () => {
    const parsed = await read20261098ECopyB(officialLabels, async () => [box1, box2, correction]);
    expect(parsed).toMatchObject({ kind: "1098-e", coverage: "needs-review", taxYear: 2026, seededFactIds: [], detectedFacts: [] });
    expect(parsed?.notes).toContain("Box 1 reports $1234.56.");
    expect(parsed?.notes).toContain("Box 2 is checked");
    expect(parsed?.notes).toContain("loans made before September 1, 2004");
  });

  it("keeps explicit zero, omits an unverified checkbox, and displays a verified unchecked state", async () => {
    const zero = { ...box1, fieldValue: "0", textContent: ["0.00"] };
    const unchecked = { ...box2, fieldValue: "Off", defaultAppearanceData: correction.defaultAppearanceData };
    const parsed = await read20261098ECopyB(officialLabels, async () => [zero, correction]);
    expect(parsed?.notes).toContain("Box 1 reports $0.00.");
    expect(parsed?.notes).not.toContain("Box 2");
    expect((await read20261098ECopyB(officialLabels, async () => [zero, unchecked, correction]))?.notes).toContain("Box 2 is unchecked");
    expect((await read20261098ECopyB(officialLabels, async () => [zero, { ...box2, fieldValue: "Off" }, correction]))?.notes).not.toContain("Box 2");
  });

  it("keeps recognized blank, corrected, flattened and conflicting documents manual", async () => {
    const cases = [
      { items: officialLabels, widgets: [] },
      { items: officialLabels, widgets: [{ ...box1, fieldValue: "", hasAppearance: false, textContent: undefined }, correction] },
      { items: officialLabels, widgets: [box1, { ...correction, fieldValue: "2" }] },
      { items: officialLabels, widgets: [box1, { ...correction, hasAppearance: false }] },
      { items: officialLabels, widgets: [{ ...box1, textContent: ["733.09"] }, correction] },
      { items: officialLabels, widgets: [{ ...box1, annotationFlags: 36 }, correction] },
      { items: officialLabels, widgets: [box1, { ...box1, fieldName: "another-widget" }, correction] },
      { items: [...officialLabels, textAt("1234.56", 385, 663)], widgets: [correction] },
      { items: [...officialLabels, textAt("733.09", 385, 663)], widgets: [box1, correction] },
      { items: [...officialLabels, textAt("X", 247, 760)], widgets: [box1, correction] },
    ];
    for (const { items, widgets } of cases) {
      const parsed = await read20261098ECopyB(items, async () => widgets);
      expect(parsed).toMatchObject({ kind: "1098-e", coverage: "needs-review", taxYear: 2026, seededFactIds: [], detectedFacts: [] });
      expect(parsed?.notes).not.toContain("Box 1 reports $");
    }
    const unavailable = await read20261098ECopyB(officialLabels, async () => { throw Error("Unreadable widgets"); });
    expect(unavailable).toMatchObject({ taxYear: 2026, detectedFacts: [] });
    expect(unavailable?.notes).not.toContain("Box 1 reports $");
  });

  it("rejects other copy layouts and free text", async () => {
    const readAnnotations = vi.fn(async () => [box1, box2, correction]);
    for (const items of [
      officialLabels.map((item) => item.str === "Copy B" ? { ...item, str: "Copy A" } : item),
      officialLabels.map((item) => ({ str: item.str })),
    ]) {
      expect(await read20261098ECopyB(items, readAnnotations)).toBeNull();
    }
    expect(readAnnotations).not.toHaveBeenCalled();
  });

  it("keeps identified Copy B with conflicting years or duplicate titles in manual review", async () => {
    const readAnnotations = vi.fn(async () => [box1, box2, correction]);
    for (const items of [
      officialLabels.map((item) => item.str === "26" ? { ...item, str: "25" } : item),
      [...officialLabels, textAt("2025", 410, 715)],
      [...officialLabels, textAt("Copy B", 120, 368)],
      [...officialLabels, textAt("Copy", 120, 368), textAt("B", 145, 368)],
      [...officialLabels, textAt("Copy B", 541.36, 674.861)],
      [...officialLabels, textAt("Form 1098-E", 120, 368)],
      [...officialLabels, textAt("1098-E", 120, 368)],
      [...officialLabels, textAt("Form 1098-E (2025)", 120, 368)],
      [...officialLabels, textAt("2025 Form 1098-E", 120, 368)],
      [...officialLabels, textAt("Tax year 2025", 120, 368)],
      [...officialLabels, textAt("Calendar year:", 120, 368), textAt("2025", 175, 368)],
      [...officialLabels, textAt("Calendar year", 120, 368), textAt("20", 175, 368), textAt("25", 185, 368)],
    ]) {
      const parsed = await read20261098ECopyB(items, readAnnotations);
      expect(parsed).toMatchObject({ kind: "1098-e", coverage: "needs-review", taxYear: null, seededFactIds: [], detectedFacts: [] });
      expect(parsed?.notes).not.toContain("Box 1 reports $");
    }
    expect(readAnnotations).not.toHaveBeenCalled();
  });

  it("keeps confirmed 2026 despite ordinary dates or an agreeing calendar year", async () => {
    const items = [...officialLabels, textAt("Issued 01/01/2025", 120, 368), textAt("Calendar year 2026", 120, 355)];
    const parsed = await read20261098ECopyB(items, async () => [box1, box2, correction]);
    expect(parsed).toMatchObject({ taxYear: 2026 });
    expect(parsed?.notes).toContain("Box 1 reports $1234.56.");
  });
});
