/** Spec: spec/state/oh-official-physical-candidates.yaml. Physical probes, not tax returns. */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { OH_IT1040_2025_CANDIDATE as it1040 } from "@/pdf/mappings/2025/oh-it1040-candidate.js";
import { OH_IT_NRC_2025_CANDIDATE as nrc } from "@/pdf/mappings/2025/oh-it-nrc-candidate.js";
import { assertPdfExportAllowed, markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes } from "@/pdf/template-registry.js";

type Location = { fieldName: string; type: string; page: number | null; pageReference: string; inPageAnnotations: boolean; rect: number[]; onValues: string[] };
type SourceWitness = { filename: string; sha256: string; pages: number; totalSourceFields: number;
  locations: Record<string, Location[]> };
const witnesses = await Promise.all(["it1040", "itnrc"].map(async name =>
  JSON.parse(await readFile(`tests/fixtures/pdf-ohio-2025/${name}-source.json`, "utf8")) as SourceWitness));
const candidates = [it1040, nrc] as const;

describe("Actual2025 Ohio inactive physical candidates", () => {
  it("Ohio physical candidates pin actual2025 sources without enabling exports", async () => {
    for (const [index, candidate] of candidates.entries()) {
      const witness = witnesses[index];
      const bytes = await readFile(`forms/blank/2025/${witness.filename}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(witness.sha256);
      expect(candidate.sha256).toBe(witness.sha256);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getPageCount()).toBe(witness.pages);
      expect(pdf.getForm().getFields()).toHaveLength(witness.totalSourceFields);
      expect(candidate).toMatchObject({ taxYear: 2025, exportsEnabled: false, filingQualified: false,
        reviewStatus: "independent-review-pending" });
      expect(Object.isFrozen(candidate)).toBe(true);
      expect(Object.isFrozen(candidate.fields)).toBe(true);
      expect(() => assertReviewTemplateBytes(witness.filename, bytes, 2025)).toThrow(/No registered review template/);
    }
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });

  it("Ohio physical candidates preserve every declared physical location", async () => {
    for (const [index, candidate] of candidates.entries()) {
      const witness = witnesses[index];
      const pdf = await PDFDocument.load(await readFile(`forms/blank/2025/${witness.filename}`));
      expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(witness.locations).sort());
      const names = candidate.fields as Readonly<Record<string, string>>;
      for (const [key, locations] of Object.entries(witness.locations)) {
        const name = names[key];
        const field = pdf.getForm().getField(name);
        expect(name).toBe(locations[0].fieldName);
        expect(field.acroField.dict.get(PDFName.of("FT"))?.toString()).toBe(locations[0].type);
        const widgets = field.acroField.getWidgets();
        expect(widgets).toHaveLength(locations.length);
        for (const [i, widget] of widgets.entries()) {
          const location = locations[i];
          const rectangle = widget.getRectangle();
          const [left, bottom, right, top] = location.rect;
          expect(rectangle.x).toBeCloseTo(left, 3);
          expect(rectangle.y).toBeCloseTo(bottom, 3);
          expect(rectangle.width).toBeCloseTo(right - left, 3);
          expect(rectangle.height).toBeCloseTo(top - bottom, 3);
          expect(widget.P()?.toString()).toBe(location.pageReference);
          if (location.page !== null) {
            expect(location.inPageAnnotations).toBe(true);
            expect(widget.P()).toEqual(pdf.getPages()[location.page - 1].ref);
          } else {
            expect(location.inPageAnnotations).toBe(false);
            expect(pdf.getPages().some(page => page.ref.toString() === location.pageReference)).toBe(false);
          }
          const normal = widget.getAppearances()?.normal;
          if (normal instanceof PDFDict) {
            for (const onValue of location.onValues) expect(normal.has(PDFName.of(onValue))).toBe(true);
          } else expect(location.onValues).toEqual([]);
        }
      }
    }
  });

  it("Ohio physical candidates retain printed2025 line meanings", () => {
    expect(it1040.fields.line2a).toBe("L2A");
    expect(it1040.printedSources.line2a).toBe("Ohio Schedule of Adjustments line12");
    expect(it1040.printedSources.line2b).toBe("Ohio Schedule of Adjustments line47");
    expect(it1040.printedSources.line8b).toBe("Ohio Schedule of Business Income line16");
    expect(it1040.printedSources.line9).toBe("Ohio Schedule of Credits line40");
    expect(it1040.printedSources.line16).toBe("Ohio Schedule of Credits line47");
    expect(it1040.printedSources.line17).toBe("Printed14 plus15 plus16");
    expect(it1040.printedSources.line19).toBe("Printed17 minus18");
    expect(it1040.printedSources.line26).toBe("Printed23 minus24 minus25g; before no-issue policy");
    expect(it1040.printedSources.line25a).toBe("Nature Preserves/Scenic Rivers");
    expect(it1040.printedSources.line25f).toBe("Ohio History Fund");
    expect(it1040.fields.line25a).toBe("L25A");
    expect(it1040.fields.line25f).toBe("L25F");
    expect(nrc.fields.primaryResidentStart).toBe("prim-start");
    expect(nrc.fields.line19).toBe("19");
    expect(nrc.fields.line20).toBe("20");
    expect(nrc.scope).toBe("SectionI only; SectionsII/III require separate source maps");
  });

  it("Ohio physical status groups preserve each actual on-value after save", async () => {
    for (const selected of ["1", "2", "3"]) {
      const pdf = await PDFDocument.load(await readFile("forms/blank/2025/oh-it1040-bundle.pdf"));
      for (const name of [it1040.fields.primaryResidency, it1040.fields.spouseResidency, it1040.fields.filingStatus]) {
        const field = pdf.getForm().getField(name);
        // The actual grouped /Btn fields do not have the radio flag. Do not use boolean check().
        field.acroField.dict.set(PDFName.of("V"), PDFName.of(selected));
        for (const widget of field.acroField.getWidgets()) {
          const normal = widget.getAppearances()?.normal;
          expect(normal).toBeInstanceOf(PDFDict);
          widget.setAppearanceState((normal as PDFDict).has(PDFName.of(selected)) ? PDFName.of(selected) : PDFName.of("Off"));
        }
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save({ updateFieldAppearances: false });
      const saved = await PDFDocument.load(bytes);
      for (const name of [it1040.fields.primaryResidency, it1040.fields.spouseResidency, it1040.fields.filingStatus]) {
        const field = saved.getForm().getField(name);
        expect(field.acroField.dict.get(PDFName.of("V"))?.toString()).toBe(`/${selected}`);
        const states = field.acroField.getWidgets().map(w => w.getAppearanceState()?.asString());
        expect(states).toEqual(["1", "2", "3"].map(value => value === selected ? `/${value}` : "/Off"));
      }
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        await mkdir(process.env.TAX_CANDIDATE_ARTIFACT_DIR, { recursive: true });
        await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, `oh-status-${selected}-diagnostic.pdf`), bytes);
      }
    }
  });

  it("Ohio physical candidates preserve saved diagnostic values and review notices", async () => {
    for (const [index, candidate] of candidates.entries()) {
      const witness = witnesses[index];
      const pdf = await PDFDocument.load(await readFile(`forms/blank/2025/${witness.filename}`));
      const values: Record<string, string> = {};
      let count = 0;
      for (const [key, name] of Object.entries(candidate.fields)) {
        const field = pdf.getForm().getField(name);
        if (!(field instanceof PDFTextField)) continue;
        const value = key.toLowerCase().includes("ssn") ? "REDACTED" : String(count++ % 9 + 1);
        field.setText(value); values[name] = value;
      }
      // Source-cell probes only: arithmetic $1 refund must not become economic issued0.
      if (index === 0) for (const name of [it1040.fields.line23, it1040.fields.line26]) {
        pdf.getForm().getTextField(name).setText("1"); values[name] = "1";
      }
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const saved = await PDFDocument.load(bytes);
      for (const [name, value] of Object.entries(values)) expect(saved.getForm().getTextField(name).getText()).toBe(value);
      const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
      for (const page of saved.getPages()) {
        const contents = page.node.Contents();
        const streams = contents instanceof PDFArray ? contents.asArray().map(ref => saved.context.lookup(ref)) : [contents];
        const text = streams.filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
          .map(stream => Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii")).join("\n");
        expect(text.split(noticeHex).length - 1).toBe(1);
      }
      if (process.env.TAX_CANDIDATE_ARTIFACT_DIR) {
        await mkdir(process.env.TAX_CANDIDATE_ARTIFACT_DIR, { recursive: true });
        await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, `oh-${index === 0 ? "it1040" : "itnrc"}-diagnostic.pdf`), bytes);
        await writeFile(join(process.env.TAX_CANDIDATE_ARTIFACT_DIR, `oh-${index === 0 ? "it1040" : "itnrc"}-values.json`), JSON.stringify(values, null, 2));
      }
    }
  });
});
