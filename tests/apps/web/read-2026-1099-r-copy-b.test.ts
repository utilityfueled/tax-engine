import { expect, it, vi } from "vitest";
import { read20261099RCopyB } from "../../../apps/web/src/lib/read-2026-1099-r-copy-b";

// Spec: spec/federal/form-1099-r.yaml#2026-copy-b-upload-review.
function text(str: string, x: number, y: number, width = str.length * 3) {
  return { str, width, transform: [8, 0, 0, 8, x, y] };
}

const copyB = [
  text("Form", 406.093, 693.861), text("1099-R", 424.377, 693.861),
  text("20", 406, 716.721), text("26", 431.28, 716.721), text("Copy B", 541.36, 678.861),
  text("CORRECTED (if checked)", 259.2, 758.86),
  text("Form", 50.4, 421.861), text("1099-R", 68.684, 421.861),
  text("1", 297.7, 748.002), text("Gross distribution", 309.376, 748.002),
  text("2a", 297.7, 712.002), text("Taxable amount", 309.502, 712.002),
  text("2b", 297.7, 682.003), text("Taxable amount", 309.761, 682.003),
  text("not", 362.016, 682.003), text("determined", 311.7, 673.603),
  text("Total", 412.4, 682.003), text("distribution", 412.4, 673.603),
  text("4", 398.5, 658.002), text("Federal income tax", 410.176, 658.002), text("withheld", 410.498, 649.252),
  text("7a", 297.7, 580.001), text("Dist.", 309.502, 580.001), text("code(s)", 309.698, 571.601),
  text("7b", 348.1, 580.001), text("IRA/SEP/", 360.161, 580.001), text("SIMPLE", 360.098, 571.601),
  text("7c", 398.5, 580.001), text("Trump", 410.302, 580.001), text("account", 410.497, 571.601),
];

const prefix = "topmostSubform[0].CopyB[0].";
function widget(field: string, rect: number[], fieldValue: string, checkboxExport?: string) {
  return {
    fieldName: prefix + field, subtype: "Widget", rect, rotation: 0, hidden: false,
    annotationFlags: 4, fieldValue,
    ...(checkboxExport === undefined
      ? { fieldType: "Tx", hasAppearance: fieldValue !== "", textContent: fieldValue === "" ? undefined : [fieldValue] }
      : { fieldType: "Btn", checkBox: true, exportValue: checkboxExport, hasAppearance: fieldValue !== "Off" }),
  };
}

function fields({ gross = "3,210.09", taxable = "0.00", determined = "1", total = "Off", withheld = "18", code = "Y7", ira = "Off", corrected = "Off" } = {}) {
  return [
    widget("c2_1[0]", [244.8, 757.75, 254.8, 767.75], corrected, "2"),
    widget("RightCol[0].f2_19[0]", [305.2, 720, 395, 731.999], gross),
    widget("RightCol[0].f2_20[0]", [305.2, 690.001, 395, 702], taxable),
    widget("RightCol[0].c2_2[0]", [374.8, 670.501, 384.8, 680.501], determined, "1"),
    widget("RightCol[0].c2_3[0]", [461.2, 670.501, 471.2, 680.501], total, "1"),
    widget("RightCol[0].f2_22[0]", [406, 630, 495.8, 641.999], withheld),
    widget("RightCol[0].f2_25[0]", [296.2, 551.999, 344.6, 563.999], code),
    widget("RightCol[0].Box7b_ReadOrder[0].c2_4[0]", [364.4, 556.501, 374.4, 566.501], ira, "1"),
    widget("RightCol[0].Box7c_ReadOrder[0].c2_5[0]", [411.6, 556.501, 421.6, 566.501], "1", "1"),
  ];
}

const manualReview = "Confirm the recipient and original statement details in the retirement interview.";
const unknownYearReview = {
  kind: "1099-r", taxYear: null, coverage: "needs-review", seededFactIds: [], detectedFacts: [],
  notes: "Confirm the statement year, recipient, and original details in the retirement interview.",
};

it("retains literal 2026 Copy B evidence for manual retirement review", async () => {
  const parsed = await read20261099RCopyB(copyB, async () => fields());
  expect(parsed).toMatchObject({
    kind: "1099-r", taxYear: 2026, coverage: "needs-review", seededFactIds: [], detectedFacts: [],
  });
  const reportedBoxes = [
    "Box 1 gross distribution $3210.09", "Box 2a taxable amount $0.00", "Box 2b taxable amount not determined (Checked)",
    "Box 2b total distribution (Unchecked)", "Box 4 federal income tax withheld $18.00", "Box 7a distribution code (Y7)",
    "Box 7b IRA/SEP/SIMPLE (Unchecked)",
  ];
  expect(parsed?.notes).toBe(`${reportedBoxes.join(", ")}. ${manualReview}`);
});

it("keeps an observed blank Box 2a distinct from explicit zero and uncertain source text", async () => {
  const amount = "Box 2a taxable amount";
  for (const [taxable, value] of [["", "(Blank)"], ["0", "$0.00"], ["-0-", "$0.00"]]) {
    expect((await read20261099RCopyB(copyB, async () => fields({ taxable })))?.notes).toContain(`${amount} ${value}`);
  }
  const missing = fields().filter(field => field.fieldName !== prefix + "RightCol[0].f2_20[0]");
  expect((await read20261099RCopyB(copyB, async () => missing))?.notes).not.toContain(amount);
  expect((await read20261099RCopyB([...copyB, text("400.00", 312, 694)], async () => fields()))?.notes).not.toContain(amount);
  const ambiguous = fields();
  ambiguous[2] = { ...ambiguous[2], textContent: ["200.00"] };
  expect((await read20261099RCopyB(copyB, async () => ambiguous))?.notes).not.toContain(amount);
  expect((await read20261099RCopyB(copyB, async () => fields({ gross: "9,007,199,254,740,993.01", taxable: "" })))?.notes)
    .toContain("Box 1 gross distribution $9007199254740993.01");
});

it("withholds values when the original statement is blank, corrected or ambiguous", async () => {
  const blank = fields({ gross: "", taxable: "", determined: "Off", withheld: "", code: "" }).slice(0, -1);
  for (const annotations of [blank, fields({ corrected: "2" }), fields().slice(1), []]) {
    expect(await read20261099RCopyB(copyB, async () => annotations))
      .toMatchObject({ kind: "1099-r", taxYear: 2026, seededFactIds: [], detectedFacts: [], notes: manualReview });
  }
  const addedMark = [...copyB, text("X", 246, 760)];
  expect((await read20261099RCopyB(addedMark, async () => fields()))?.notes).toBe(manualReview);
  const conflictingYear = [...copyB, text("Tax year 2025", 100, 397)];
  expect(await read20261099RCopyB(conflictingYear, async () => fields())).toMatchObject(unknownYearReview);
  const secondPanel = [...copyB, text("Copy B", 541.36, 280), text("Form 1099-R", 406, 295)];
  expect(await read20261099RCopyB(secondPanel, async () => fields())).toMatchObject(unknownYearReview);
  expect(await read20261099RCopyB(copyB.filter(item => item.str !== "Copy B"), async () => fields())).toBeNull();
});

it("recognizes the Copy B layout when its printed year is changed, missing or duplicated", async () => {
  const readAnnotations = vi.fn(async () => fields());
  const changed = copyB.map(item => item.str === "26" ? { ...item, str: "25" } : item);
  const missing = copyB.filter(item => item.str !== "20" && item.str !== "26");
  const duplicated = [...copyB, text("26", 431.28, 716.721)];
  for (const items of [changed, missing, duplicated]) {
    expect(await read20261099RCopyB(items, readAnnotations)).toMatchObject(unknownYearReview);
  }
  const olderLayout = changed.filter(item => item.str !== "7a" && item.str !== "7b");
  expect(await read20261099RCopyB(olderLayout, readAnnotations)).toBeNull();
  expect(readAnnotations).not.toHaveBeenCalled();
});

it("treats a split explicit conflicting year as unknown", async () => {
  const readAnnotations = vi.fn(async () => fields());
  for (const [prefix, suffix] of [["Tax year", ""], ["Calendar year:", ""], ["Form 1099-R (", ")"], ["", "Form 1099-R statement"]]) {
    const supplied = [...copyB, text(prefix, 100, 397), text("20", 200, 397), text("25", 215, 397), text(suffix, 230, 397)];
    expect(await read20261099RCopyB(supplied, readAnnotations)).toMatchObject(unknownYearReview);
  }
  expect(readAnnotations).not.toHaveBeenCalled();
  const corroborated = [...copyB, text("Tax year", 100, 397), text("20", 200, 397), text("26", 215, 397)];
  expect(await read20261099RCopyB(corroborated, readAnnotations)).toMatchObject({ taxYear: 2026 });
});

it("keeps ambiguous checkbox evidence local to its own box", async () => {
  const annotations = fields({ determined: "1", total: "1", ira: "1", code: "7" });
  annotations[3] = { ...annotations[3], hasAppearance: false };
  annotations[7] = { ...annotations[7], annotationFlags: 34 };
  const parsed = await read20261099RCopyB(copyB, async () => annotations);
  expect(parsed?.notes).not.toContain("Box 2b taxable amount not determined");
  expect(parsed?.notes).toContain("Box 2b total distribution (Checked)");
  expect(parsed?.notes).toContain("Box 7a distribution code (7)");
  expect(parsed?.notes).not.toContain("Box 7b IRA/SEP/SIMPLE");
});
