import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFHexString, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { getDocument } from "../../../apps/web/node_modules/pdfjs-dist/legacy/build/pdf.mjs";
import { read20261095BReviewSource } from "../../../apps/web/src/lib/read-2026-1095-b-review-source";

const officialPath = new URL("../../../forms/blank/2026/f1095b.pdf", import.meta.url);
const fontPath = fileURLToPath(new URL("../../../apps/web/node_modules/pdfjs-dist/standard_fonts/", import.meta.url));
const header = "topmostSubform[0].Page1[0].Pg1Header[0]";
const subject = {
  taxYear: 2026,
  originalStatementConfirmed: true,
  line: 23,
  firstName: "Casey",
  middleInitial: "",
  lastName: "Example",
  tin: "000001234",
};
const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function rowName(line: number) {
  return `topmostSubform[0].Page1[0].Table1_Part4[0].Row${line}[0]`;
}

function coverageName(line: number, month: number) {
  return `${rowName(line)}.c1_${String(1 + (line - 23) * 13 + month).padStart(2, "0")}[0]`;
}

function identityName(line: number, index: number) {
  return `${rowName(line)}.f1_${25 + (line - 23) * 5 + index}[0]`;
}

function setText(pdf: PDFDocument, field: string, value: string) {
  const form = pdf.getForm();
  const text = form.getTextField(field);
  text.setText(value);
  text.defaultUpdateAppearances(form.getDefaultFont());
}

function fillRow(pdf: PDFDocument, line: number, coverage: number[], names = ["Casey", "", "Example", "000-00-1234"]) {
  const form = pdf.getForm();
  names.forEach((value, index) => {
    if (value) setText(pdf, identityName(line, index), value);
  });
  coverage.forEach(month => form.getCheckBox(coverageName(line, month)).check());
}

async function filled(coverage: number[], edit?: (pdf: PDFDocument) => void) {
  const pdf = await PDFDocument.load(await readFile(officialPath));
  fillRow(pdf, 23, coverage);
  edit?.(pdf);
  return pdf.save({ updateFieldAppearances: false });
}

async function read(bytes: Uint8Array, confirmation = subject) {
  const task = getDocument({ data: bytes, standardFontDataUrl: fontPath });
  try {
    return await read20261095BReviewSource(await task.promise, confirmation);
  } finally {
    await task.destroy();
  }
}

describe("2026 Form 1095-B Part IV review source", () => {
  // Spec: spec/federal/2026/form-1095-b-review-source.yaml
  it("reads selected and annual coverage from the saved official PDF", async () => {
    expect(createHash("sha256").update(await readFile(officialPath)).digest("hex"))
      .toBe("8ddccf8782981961d9591067d08161519f78605e2234ab58e94597adc49e763b");
    const saved = await filled([3, 4], pdf => {
      fillRow(pdf, 28, [0], ["Jordan", "Q", "Different", "000-00-4321"]);
    });
    const reopened = await PDFDocument.load(saved);
    const form = reopened.getForm();
    expect(form.getCheckBox(coverageName(23, 0)).isChecked()).toBe(false);
    expect(form.getCheckBox(coverageName(23, 3)).acroField.getWidgets()[0].getAppearanceState()?.decodeText()).toBe("1");
    expect(form.getCheckBox(coverageName(23, 4)).isChecked()).toBe(true);
    expect(await read(Uint8Array.from(saved))).toEqual({
      taxYear: 2026,
      line: 23,
      reportedBy: "selected-months-boxes",
      monthsWithReportedCoverage: [3, 4],
    });
    expect(await read(Uint8Array.from(saved), {
      ...subject, line: 28, firstName: "Jordan", middleInitial: "Q", lastName: "Different", tin: "000004321",
    })).toEqual({
      taxYear: 2026,
      line: 28,
      reportedBy: "annual-box",
      monthsWithReportedCoverage: months,
    });
  });

  it("requires the selected covered person's confirmed identity", async () => {
    const saved = await filled([3]);
    for (const confirmation of [
      { ...subject, taxYear: 2025 },
      { ...subject, originalStatementConfirmed: false },
      { ...subject, line: 24 },
      { ...subject, line: 29 },
      { ...subject, firstName: "Other" },
      { ...subject, tin: "000001235" },
      { ...subject, tin: "1234" },
    ]) expect(await read(Uint8Array.from(saved), confirmation)).toBeNull();

    for (const [tin, dob] of [["", "01/01/1990"], ["XXX-XX-1234", ""], ["000-00-1234", "01/01/1990"]]) {
      expect(await read(await filled([3], pdf => {
        setText(pdf, identityName(23, 3), tin);
        setText(pdf, identityName(23, 4), dob);
      }))).toBeNull();
    }
    expect(await read(await filled([3], pdf => {
      setText(pdf, identityName(23, 0), "");
      setText(pdf, "topmostSubform[0].Page1[0].Part1Contents[0].Line1[0].f1_1[0]", "Casey");
    }))).toBeNull();
  });

  it("holds empty, contradictory and conflicting box evidence", async () => {
    for (const coverage of [[], [0, 3], months]) {
      expect(await read(await filled(coverage))).toBeNull();
    }
    for (const state of ["Off", "Other"]) {
      expect(await read(await filled([3], pdf => {
        pdf.getForm().getCheckBox(coverageName(23, 3)).acroField.getWidgets()[0].setAppearanceState(PDFName.of(state));
      }))).toBeNull();
    }
    expect(await read(await filled([3], pdf => {
      const box = pdf.getForm().getCheckBox(coverageName(23, 3));
      box.acroField.dict.set(PDFName.of("V"), PDFName.of("Off"));
    }))).toBeNull();
  });

  it("holds documents outside the pinned original layout", async () => {
    expect(await read(Uint8Array.from(await readFile(officialPath)))).toBeNull();
    const edits = [
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}.cb_1[0]`).check(),
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(`${header}.cb_1[1]`).check(),
      (pdf: PDFDocument) => pdf.getForm().flatten(),
      (pdf: PDFDocument) => pdf.removePage(0),
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(coverageName(23, 3)).acroField.getWidgets()[0].setRectangle({
        x: 477, y: 240, width: 12.5, height: 12.5,
      }),
      (pdf: PDFDocument) => pdf.getPages()[0].node.removeAnnot(pdf.getForm().getCheckBox(coverageName(23, 12)).ref),
      (pdf: PDFDocument) => pdf.getForm().getCheckBox(coverageName(23, 3)).acroField.getWidgets()[0].dict.delete(PDFName.of("AP")),
      (pdf: PDFDocument) => pdf.getForm().getTextField(identityName(23, 0)).acroField.setValue(PDFHexString.fromText("Other")),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("X", { x: 508, y: 243, size: 8 }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawLine({ start: { x: 508, y: 243 }, end: { x: 515, y: 250 } }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("2025", { x: 682, y: 530, size: 8 }),
      (pdf: PDFDocument) => pdf.getPages()[0].drawText("Form 1095-B (2025)", { x: 44, y: 65, size: 8 }),
    ];
    for (const edit of edits) expect(await read(await filled([3], edit)), String(edit)).toBeNull();
  });
});
