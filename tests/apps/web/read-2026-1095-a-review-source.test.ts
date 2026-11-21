import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { getDocument } from "../../../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { read20261095AReviewSource } from "../../../apps/web/src/lib/read-2026-1095-a-review-source";

const officialPath = new URL("../../../forms/blank/2026/f1095a.pdf", import.meta.url);
const fontPath = fileURLToPath(new URL("../../../apps/web/node_modules/pdfjs-dist/standard_fonts/", import.meta.url));
const prefix = "topmostSubform[0].Page1[0].";
const header = `${prefix}Pg1Header[0].c1_1`;
const policy = {
  taxYear: 2026,
  originalStatementConfirmed: true,
  marketplace: "PA",
  policyNumber: "MARKET-ABC-123",
  issuerName: "Example Issuer",
  recipientName: "Casey Example",
  recipientSsn: "000001234",
};
type Column = 0 | 1 | 2;
type Cell = [line: number, column: Column, value: string];

function cellName(line: number, column: Column) {
  return `${prefix}Table_PartIII[0].Row${line}[0].f1_${41 + (line - 21) * 3 + column}[0]`;
}

function setText(pdf: PDFDocument, fieldName: string, value: string) {
  const form = pdf.getForm();
  const field = form.getTextField(fieldName);
  field.setText(value);
  field.defaultUpdateAppearances(form.getDefaultFont());
}

const amounts: Cell[] = [
  [23, 0, "545.10"], [23, 2, "-0-"],
  [24, 0, "1,012.01"], [24, 1, "603.35"], [24, 2, "300.25"],
  [33, 0, "1,557.11"], [33, 1, "603.35"], [33, 2, "300.25"],
];

function populate(pdf: PDFDocument, cells: Cell[], recipientSsn: string) {
  [policy.marketplace, policy.policyNumber, policy.issuerName, policy.recipientName, recipientSsn]
    .forEach((value, index) => setText(pdf, `${prefix}f1_${index + 1}[0]`, value));
  for (const [line, column, value] of cells) setText(pdf, cellName(line, column), value);
}

async function filled(cells = amounts, edit?: (pdf: PDFDocument) => void, recipientSsn = "***-**-1234") {
  const pdf = await PDFDocument.load(await readFile(officialPath));
  populate(pdf, cells, recipientSsn);
  edit?.(pdf);
  return pdf.save({ updateFieldAppearances: false });
}

async function read(bytes: Uint8Array, confirmation = policy) {
  const task = getDocument({ data: bytes, standardFontDataUrl: fontPath });
  try {
    return await read20261095AReviewSource(await task.promise, confirmation);
  } finally {
    await task.destroy();
  }
}

describe("2026 Form 1095-A Part III review source", () => {
  // Spec: spec/federal/2026/form-1095-a-review-source.yaml
  it("reads exact monthly cells and reported totals from the saved official layout", async () => {
    expect(createHash("sha256").update(await readFile(officialPath)).digest("hex"))
      .toBe("161686f5866e18c350c0b4397a72441b26091a2962bc4bab149433762c4efca1");
    const bytes = await filled();
    const reopened = await PDFDocument.load(bytes);
    expect(reopened.getForm().getTextField(cellName(23, 2)).getText()).toBe("-0-");
    expect(reopened.getForm().getTextField(cellName(23, 1)).getText()).toBeUndefined();

    const result = await read(bytes);
    expect(result).toEqual({
      taxYear: 2026,
      months: Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        if (month === 3) return { month, enrollmentPremium: "545.10", slcspPremium: null, advancePTC: "0.00" };
        if (month === 4) return { month, enrollmentPremium: "1012.01", slcspPremium: "603.35", advancePTC: "300.25" };
        return { month, enrollmentPremium: null, slcspPremium: null, advancePTC: null };
      }),
      annualTotals: { enrollmentPremium: "1557.11", slcspPremium: "603.35", advancePTC: "300.25" },
    });

    const edges: Cell[] = [[21, 0, "0"], [32, 0, "81.2"], [33, 0, "81.20"], [33, 1, "0.00"]];
    const explicit = await read(await filled(edges, undefined, "XXX-XX-1234"));
    expect(explicit?.months[0]).toEqual({ month: 1, enrollmentPremium: "0.00", slcspPremium: null, advancePTC: null });
    expect(explicit?.months[11]).toEqual({ month: 12, enrollmentPremium: "81.20", slcspPremium: null, advancePTC: null });
    expect(explicit?.annualTotals).toEqual({ enrollmentPremium: "81.20", slcspPremium: "0.00", advancePTC: null });
  });

  it("holds annual values that do not reconcile to the monthly source", async () => {
    const cases: Cell[][] = [
      [[33, 0, "1557.11"]],
      [[23, 0, "545.10"]],
      [[23, 0, "0.00"]],
      [...amounts, [33, 0, "1557.10"]],
      [...amounts, [23, 1, "0.001"]],
      [...amounts, [23, 1, "-0.01"]],
      [...amounts, [23, 1, "5,45.10"]],
      [...amounts, [23, 1, "unknown"]],
    ];
    for (const cells of cases) expect(await read(await filled(cells)), JSON.stringify(cells)).toBeNull();
  });

  it("holds status and policy evidence outside the pinned original", async () => {
    const bytes = await filled(amounts, undefined, "000-00-1234");
    expect(await read(Uint8Array.from(bytes))).toMatchObject({ taxYear: 2026 });
    for (const confirmation of [
      { ...policy, taxYear: 2025 },
      { ...policy, originalStatementConfirmed: false },
      { ...policy, marketplace: "OH" },
      { ...policy, policyNumber: "WRONG-POLICY" },
      { ...policy, issuerName: "Different issuer" },
      { ...policy, recipientName: "Other person" },
      { ...policy, recipientSsn: "000001235" },
    ]) expect(await read(Uint8Array.from(bytes), confirmation)).toBeNull();

    expect(await read(await filled(amounts, pdf => setText(pdf, `${prefix}f1_6[0]`, "01/01/1990"), ""))).toBeNull();
    expect(await read(await filled(amounts, pdf => setText(pdf, `${prefix}f1_6[0]`, "01/01/1990")))).toBeNull();
    const edits = [
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}[0]`).check(),
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}[1]`).check(),
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}[1]`).acroField.dict.set(PDFName.of("V"), PDFName.of("2")),
      (pdf: PDFDocument) => pdf.getForm().flatten(),
      (pdf: PDFDocument) => pdf.removePage(1),
      (pdf: PDFDocument) => { pdf.addPage(); },
      (pdf: PDFDocument) => pdf.getPages()[0].node.removeAnnot(pdf.getForm().getTextField(cellName(23, 1)).ref),
      (pdf: PDFDocument) => pdf.getForm().getTextField(cellName(23, 2)).acroField.getWidgets()[0].dict.delete(PDFName.of("AP")),
      (pdf: PDFDocument) => pdf.getForm().getTextField(cellName(23, 2)).acroField.setValue(PDFHexString.fromText("0.00")),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("891.22", { x: 330, y: 280, size: 8 }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawLine({ start: { x: 420, y: 748 }, end: { x: 424, y: 752 } }),
    ];
    for (const edit of edits) expect(await read(await filled(amounts, edit)), String(edit)).toBeNull();

    const dualView = await PDFDocument.load(await readFile(officialPath));
    const acro = dualView.catalog.getOrCreateAcroForm();
    const xfa = acro.dict.get(PDFName.of("XFA"));
    if (!xfa) throw new Error("Expected the official blank to contain an XFA form");
    populate(dualView, amounts, "***-**-1234");
    acro.dict.set(PDFName.of("XFA"), xfa);
    expect(await read(await dualView.save({ updateFieldAppearances: false }))).toBeNull();
  });
});
