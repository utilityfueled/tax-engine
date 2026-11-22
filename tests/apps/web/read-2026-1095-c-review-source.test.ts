import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ParseSpeeds, PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { getDocument } from "../../../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { read20261095CReviewSource } from "../../../apps/web/src/lib/read-2026-1095-c-review-source";

const officialPath = new URL("../../../forms/blank/2026/f1095c.pdf", import.meta.url);
const officialHash = "9352f74d93a3015c48a9971b5243e7ba5bfb0cef68ff987bc6916f2fc9957c98";
const fontPath = fileURLToPath(new URL("../../../apps/web/node_modules/pdfjs-dist/standard_fonts/", import.meta.url));
const header = "topmostSubform[0].Page1[0].PgHeader[0]";

function fieldName(line: 14 | 15 | 16, column: number) {
  const firstField = { 14: 18, 15: 31, 16: 44 }[line];
  return `topmostSubform[0].Page1[0].Table1[0].Row${line - 13}[0].f1_${firstField + column}[0]`;
}

type Cell = [line: 14 | 15 | 16, column: number, value: string];

async function read(bytes: Uint8Array, pageNumber = 1) {
  const task = getDocument({ data: bytes, standardFontDataUrl: fontPath });
  try {
    const pdf = await task.promise;
    return await read20261095CReviewSource(await pdf.getPage(pageNumber));
  } finally {
    await task.destroy();
  }
}

async function filled(cells: Cell[], edit?: (pdf: PDFDocument) => void) {
  // Avoid timer yields while constructing these small test-only PDFs.
  const pdf = await PDFDocument.load(await readFile(officialPath), { parseSpeed: ParseSpeeds.Fastest });
  const form = pdf.getForm();
  for (const [line, column, value] of cells) form.getTextField(fieldName(line, column)).setText(value);
  form.getCheckBox(`${header}.c1_1[0]`).uncheck();
  form.getCheckBox(`${header}.c1_1[1]`).uncheck();
  form.updateFieldAppearances();
  edit?.(pdf);
  return pdf.save({ updateFieldAppearances: false, objectsPerTick: Infinity });
}

const annual: Cell[] = [[14, 0, "1E"], [15, 0, "0.00"], [16, 0, "2C"]];
const monthlyOffers: Cell[] = Array.from({ length: 12 }, (_, index) => [14, index + 1, "1H"]);

describe("2026 Form 1095-C Part II review source", () => {
  // Spec: spec/federal/2026/form-1095-c-review-source.yaml
  it("preserves annual and monthly cells from the pinned official PDF", async () => {
    expect(createHash("sha256").update(await readFile(officialPath)).digest("hex")).toBe(officialHash);
    const allYear = await read(await filled(annual, pdf => {
      const form = pdf.getForm();
      form.getTextField("topmostSubform[0].Page1[0].EmployeeName[0].f1_1[0]").setText("Example Employee");
      form.getTextField("topmostSubform[0].Page1[0].EmployerIssuer[0].f1_9[0]").setText("Example Employer");
      form.updateFieldAppearances();
    }));
    expect(allYear).toEqual({
      taxYear: 2026,
      statusMarkers: { void: "unchecked", corrected: "unchecked" },
      employeeAndEmployerIdentity: "unconfirmed",
      columns: expect.any(Array),
    });
    expect(allYear?.columns).toHaveLength(13);
    expect(allYear?.columns.slice(0, 2)).toEqual([
      { period: "all-12-months", offerCode: "1E", contribution: "0.00", reliefCode: "2C", employeeEnrollment: "reported" },
      { period: 1, offerCode: null, contribution: null, reliefCode: null, employeeEnrollment: null },
    ]);

    const monthly = await read(await filled([
      ...monthlyOffers, [14, 1, "1E"], [15, 1, "1,234.56"], [16, 1, "2C"],
      [14, 12, "1F"], [16, 12, "2C"],
    ]));
    expect(monthly?.columns[1]).toEqual({
      period: 1, offerCode: "1E", contribution: "1234.56", reliefCode: "2C", employeeEnrollment: "reported",
    });
    expect(monthly?.columns[12]).toEqual({
      period: 12, offerCode: "1F", contribution: null, reliefCode: "2C", employeeEnrollment: "reported",
    });

    const mixedRows = await read(await filled([
      [14, 0, "1E"],
      ...monthlyOffers.map<Cell>(([, month]) => [15, month, month === 12 ? "25.01" : "0.00"]),
    ]));
    expect(mixedRows?.columns[0]).toMatchObject({ offerCode: "1E", contribution: null });
    expect(mixedRows?.columns[12]).toMatchObject({ offerCode: null, contribution: "25.01" });
  });

  it("keeps other line 16 codes and blanks as unresolved enrollment", async () => {
    const statement = await read(await filled([
      ...monthlyOffers, [16, 1, "2E"], [16, 2, "2A"], [14, 3, "1B"], [15, 3, "19.75"], [16, 3, "2G"],
    ]));
    expect(statement?.columns.slice(1, 5).map(({ reliefCode, employeeEnrollment }) => [reliefCode, employeeEnrollment]))
      .toEqual([["2E", null], ["2A", null], ["2G", null], [null, null]]);
    expect(await read(await filled([[14, 0, "1G"]]))).toMatchObject({ taxYear: 2026 });
  });

  it("holds inconsistent line and column combinations", async () => {
    const cases: Cell[][] = [
      [...annual, [14, 1, "1E"]],
      [...annual, [15, 1, "0.00"]],
      [...annual, [16, 1, "2C"]],
      [[14, 1, "1E"], [15, 1, "0.00"]],
      [[14, 0, "1E"]],
      [[14, 0, "1E"], [15, 0, "12.345"]],
      [[14, 0, "1E"], [15, 0, "-0.01"]],
      [[14, 0, "1I"]],
      [[14, 0, "1A"], [15, 0, "0.00"]],
      [[14, 0, "1A"], [16, 0, "2I"]],
      [[14, 0, "1A"], [16, 0, "2A"]],
      [[14, 0, "1A"], [16, 2, "2B"]],
      [[14, 0, "1H"], [16, 0, "2C"]],
      [[14, 0, "1G"], [16, 0, "2C"]],
      [[14, 0, "1G"], [16, 1, "2A"]],
      [[14, 0, "1A"], [16, 1, "2E"]],
      [...monthlyOffers, [14, 1, "1G"]],
    ];
    for (const cells of cases) expect(await read(await filled(cells)), JSON.stringify(cells)).toBeNull();
  });

  it("holds nonoriginal documents and uncertain physical evidence", async () => {
    expect(await read(Uint8Array.from(await readFile(officialPath)))).toBeNull();
    expect(await read(await filled(annual), 2)).toBeNull();
    const changes = [
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}.c1_1[0]`).check(),
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}.c1_1[1]`).check(),
      (pdf: PDFDocument) => pdf.getForm().flatten(),
      (pdf: PDFDocument) => pdf.getForm().removeField(pdf.getForm().getTextField(fieldName(15, 12))),
      (pdf: PDFDocument) => pdf.getForm().getTextField(fieldName(16, 0)).acroField.getWidgets()[0].dict.delete(PDFName.of("AP")),
      (pdf: PDFDocument) => pdf.getForm().getTextField(fieldName(14, 0)).acroField.setValue(PDFHexString.fromText("1B")),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("7.25", { x: 210, y: 315, size: 8 }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("X", { x: 565, y: 543, size: 8 }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("Form 1095-C (2025)", { x: 80, y: 232, size: 8 }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("2025", { x: 679, y: 515, size: 8 }),
    ];
    for (const edit of changes) expect(await read(await filled(annual, edit)), String(edit)).toBeNull();
  });
});
