/** Spec: spec/federal/form-6198-2026-template.yaml. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FORM_6198_2026_CANDIDATE } from "@/pdf/mappings/2026/form-6198-candidate.js";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS } from "@/pdf/export-policy.js";
import { REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";

const prefix = "topmostSubform[0].Page1[0].";
const sha256 = "8ae169186ad9f62910e73205ebaeb02a73bc74bb1a47954074ec14e4645a6389";
const blank = process.env.TAX_ENGINE_FORM_6198_BLANK;

// Transcribed against the printed labels and checked against the original PDF's page annotations.
const printedCells = {
  namesShownOnReturn: ["f1_1[0]", [36, 684, 460.05, 698.001]],
  identifyingNumber: ["f1_2[0]", [460.8, 684, 576, 698.001]],
  activityDescription: ["f1_3[0]", [36, 659.999, 576, 674]],
  line1: ["f1_4[0]", [504, 624.002, 576, 636.001]],
  line2a: ["f1_5[0]", [504, 588.002, 576, 600.001]],
  line2b: ["f1_6[0]", [504, 576, 576, 587.999]],
  line2c: ["f1_7[0]", [504, 564.001, 576, 576]],
  line3: ["f1_8[0]", [504, 540, 576, 551.999]],
  line4: ["f1_9[0]", [508, 516.002, 573, 528.001]],
  line5: ["f1_10[0]", [504, 492.001, 576, 504]],
  line6: ["f1_11[0]", [504, 456.001, 576, 468]],
  line7: ["f1_12[0]", [504, 444.002, 576, 456.001]],
  line8: ["f1_13[0]", [504, 432, 576, 443.999]],
  line9: ["f1_14[0]", [504, 420.001, 576, 432]],
  line10a: ["f1_15[0]", [410.4, 408.002, 481.65, 420.001]],
  line10b: ["f1_16[0]", [504, 384.001, 576, 396]],
  line11: ["f1_17[0]", [504, 336.002, 576, 348.001]],
  line12: ["f1_18[0]", [504, 324, 576, 335.999]],
  line13: ["f1_19[0]", [504, 312.001, 576, 324]],
  line14: ["f1_20[0]", [504, 300.002, 576, 312.001]],
  line15aEffectiveDate: ["c1_1[0]", [66.799, 278.001, 74.799, 286.001], "/1"],
  line15bPriorYearForm6198: ["c1_1[1]", [66.799, 266.002, 74.799, 274.002], "/2"],
  line15: ["f1_21[0]", [504, 264.002, 576, 276.001]],
  line16aEffectiveDate: ["c1_2[0]", [66.799, 230.002, 74.799, 238.002], "/1"],
  line16bPriorYearEnd: ["c1_2[1]", [160.399, 230.002, 168.399, 238.002], "/2"],
  line16: ["f1_22[0]", [504, 228.002, 576, 240.001]],
  line17: ["f1_23[0]", [504, 216, 576, 227.999]],
  line18aEffectiveDate: ["c1_3[0]", [66.799, 194.002, 74.799, 202.002], "/1"],
  line18bPriorYearEnd: ["c1_3[1]", [160.399, 194.002, 168.399, 202.002], "/2"],
  line18: ["f1_24[0]", [504, 192.002, 576, 204.001]],
  line19a: ["f1_25[0]", [410.4, 180, 481.65, 191.999]],
  line19b: ["f1_26[0]", [504, 156.002, 576, 168.001]],
  line20: ["f1_27[0]", [504, 132.001, 576, 144]],
  line21: ["f1_28[0]", [508, 108, 573, 119.999]],
} as const;

const inspectBlank = `
import io, json, sys
from pypdf import PdfReader

reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()), strict=True)
fields = reader.get_fields()
page = reader.pages[0]
widgets = []
for ref in page["/Annots"]:
    widget = ref.get_object()
    if widget["/Subtype"] != "/Widget":
        continue
    partial_names = []
    node = widget
    while node is not None:
        partial_names.append(node["/T"])
        node = node.get("/Parent")
        node = node.get_object() if node else None
    name = ".".join(reversed(partial_names))
    field = fields[name]
    field_type = field["/FT"]
    widgets.append({
        "name": name,
        "bounds": list(widget["/Rect"]),
        "fieldType": field_type,
        "checkedStates": sorted(key for key in widget["/AP"]["/N"] if key != "/Off")
                         if field_type == "/Btn" else [],
        "blankValue": widget.get("/V"),
        "registered": field.indirect_reference == widget.indirect_reference,
    })
print(json.dumps({
    "title": reader.metadata.title,
    "pageCount": len(reader.pages),
    "annotationCount": len(page["/Annots"]),
    "registeredFields": sorted(name for name, field in fields.items() if field.get("/FT")),
    "widgets": widgets,
    "layout": page.extract_text(extraction_mode="layout"),
}))
`;

describe("Form 6198 current IRS physical candidate for 2026", () => {
  it("pins the current official revision", () => {
    expect(FORM_6198_2026_CANDIDATE).toMatchObject({
      taxYear: 2026,
      mappingVersion: "2026.1-candidate",
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f6198.pdf",
      sourceRevision: "Rev. November 2025",
      sourceTitle: "Form 6198 (Rev. November 2025)",
      sourceFooter: "Created 9/9/25",
      retrievedAt: "2026-11-28",
      sha256,
      byteLength: 82547,
      pageCount: 1,
      widgetCount: 34,
    });
  });

  it("maps all 34 physical widgets once", () => {
    const entries = Object.entries(printedCells);
    const expectedFields = Object.fromEntries(entries.map(([key, [suffix]]) => [key, prefix + suffix]));
    const expectedCheckStates = Object.fromEntries(entries.flatMap(([key, [, , state]]) =>
      state ? [[key, state]] : []));
    const { fields, checkboxCheckedStates, printedParentheses } = FORM_6198_2026_CANDIDATE;
    expect(fields).toEqual(expectedFields);
    expect(new Set(Object.values(fields)).size).toBe(34);
    expect(checkboxCheckedStates).toEqual(expectedCheckStates);
    expect(printedParentheses).toEqual(["line4", "line21"]);
  });

  it.skipIf(!blank)("matches the supplied official AcroForm and printed layout", async () => {
    if (!blank) throw new Error("Set TAX_ENGINE_FORM_6198_BLANK to the original IRS PDF");
    const bytes = await readFile(blank);
    const candidate = FORM_6198_2026_CANDIDATE;
    expect(bytes.byteLength).toBe(candidate.byteLength);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(sha256);
    const physical = JSON.parse(execFileSync(
      process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3",
      ["-c", inspectBlank], { input: bytes, encoding: "utf8", timeout: 5000 },
    )) as {
      title: string;
      pageCount: number;
      annotationCount: number;
      registeredFields: string[];
      widgets: Array<{ name: string }>;
      layout: string;
    };
    expect(physical.title).toBe(candidate.sourceTitle);
    expect(physical.pageCount).toBe(candidate.pageCount);
    expect(physical.annotationCount).toBe(candidate.widgetCount);
    expect(physical.registeredFields).toEqual(Object.values(candidate.fields).sort());
    expect(physical.widgets).toEqual(Object.entries(printedCells).map(([key, [, bounds, checkedState]]) => ({
      name: candidate.fields[key as keyof typeof printedCells],
      bounds,
      fieldType: checkedState ? "/Btn" : "/Tx",
      checkedStates: checkedState ? [checkedState] : [],
      blankValue: checkedState ? "/Off" : null,
      registered: true,
    })));
    const layout = physical.layout.split("\n").map(row => row.trim().replace(/\s+/gu, " "));
    expect(layout.join("\n")).toContain("Form 6198 (Rev. 11-2025) " + candidate.sourceFooter);
    const lossRows = layout.filter(row => /\d+ \( \)$/u.test(row));
    expect(lossRows).toHaveLength(2);
    expect(lossRows[0]).toMatch(/^Form 4952, that were not included on lines 1 through 2c .* 4 \( \)$/u);
    expect(lossRows[1]).toMatch(/^instructions to find out how to report any deductible loss .* 21 \( \)$/u);
  });

  it("keeps the candidate outside 2026 export and filing", () => {
    expect(FORM_6198_2026_CANDIDATE).toMatchObject({
      reviewStatus: "independent-review-pending",
      exportsEnabled: false,
      filingQualified: false,
    });
    expect(REVIEW_TEMPLATE_PACKS).not.toHaveProperty("2026");
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review PDF mapping/u);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/u);
  });
});
