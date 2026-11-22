/** Spec: spec/federal/form-8606-2026-template.yaml. */
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { removeTrustedTemplateLegacyFormData } from "@/pdf/trusted-review-template-cleanup.js";
import { ordinaryIraBasisFixture } from "../fixtures/ira-basis.js";

const blank = new URL("../../forms/blank/2026/f8606.pdf", import.meta.url);
const officialSha = "eeb2c5a11da6903e30c468572da0242c28f19ee135b9853562d7ce9fc037cb56";
type Location = { name: string; page: number; rect: number[]; type: "/Tx" | "/Btn"; onState?: string };

async function sourceContract() {
  const source = new URL("../fixtures/pdf-2026/form-8606-source.json", import.meta.url);
  return JSON.parse(await readFile(source, "utf8")) as Record<string, Location>;
}

async function mapping() {
  const { FORM_8606_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-8606-candidate.js");
  return FORM_8606_2026_CANDIDATE;
}

function ordinary2026IraBasisFixture() {
  const source = ordinaryIraBasisFixture();
  source.taxpayer.taxYear = 2026;
  source.iraBasisSources.taxYear = 2026;
  for (const owner of source.iraBasisSources.owners) {
    owner.basisHistory.taxYear = 2025;
    for (const account of owner.accounts) account.taxYear = 2026;
  }
  for (const form of source.form1099R) {
    form.taxYear = 2026;
    form.trumpAccount = false;
    form.excessContributionEarnings = "0";
  }
  for (const distribution of source.iraBasisSources.distributions) distribution.taxYear = 2026;
  return source;
}

function ordinaryDistributionWithNoYearEndValue(priorBasis: string, gross: string) {
  const source = ordinary2026IraBasisFixture();
  const owner = source.iraBasisSources.owners[0];
  owner.accounts[0].yearEndValue = "0";
  owner.basisHistory.line14 = priorBasis;
  source.form1099R[0].grossDistribution = gross;
  source.iraBasisSources.distributions[0].grossDistribution = gross;
  return source;
}

describe("Final 2026 Form 8606 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank).catch(() => undefined);
    expect(bytes, "the final 2026 physical source must exist").toBeDefined();
    if (!bytes) return;
    const [candidate, pdf] = await Promise.all([mapping(), PDFDocument.load(bytes)]);
    expect(bytes.length).toBe(92889);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(officialSha);
    expect(candidate.sha256).toBe(officialSha);
    expect(candidate.sourceRevision).toBe("Created 4/21/26");
    expect(pdf.getTitle()).toBe("2026 Form 8606");
    expect(pdf.getPages().map(page => page.getSize())).toEqual(Array.from({ length: 2 }, () => ({
      width: expect.closeTo(612, 0), height: expect.closeTo(792, 0),
    })));
  });

  it("maps every leaf to its exact annual physical location", async () => {
    const [candidate, locations, pdf] = await Promise.all([mapping(), sourceContract(), readFile(blank).then(bytes => PDFDocument.load(bytes))]);
    const form = pdf.getForm();
    expect(candidate.fields).toMatchObject({
      preparerName: "topmostSubform[0].Page2[0].f2_16[0]",
      preparerFirmAddress: "topmostSubform[0].Page2[0].f2_19[0]",
      preparerFirmEin: "topmostSubform[0].Page2[0].f2_20[0]",
    });
    expect(form.getFields()).toHaveLength(47);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    for (const [key, location] of Object.entries(locations)) {
      const name = candidate.fields[key as keyof typeof candidate.fields];
      expect(name).toBe(location.name);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(location.type === "/Tx" ? PDFTextField : PDFCheckBox);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      const { x, y, width, height } = widget.getRectangle();
      const [left, bottom, right, top] = location.rect;
      expect(x).toBeCloseTo(left, 3);
      expect(y).toBeCloseTo(bottom, 3);
      expect(width).toBeCloseTo(right - left, 3);
      expect(height).toBeCloseTo(top - bottom, 3);
      expect(widget.P()).toEqual(pdf.getPage(location.page - 1).ref);
      if (field instanceof PDFCheckBox) expect(field.acroField.getOnValue()?.toString()).toBe(location.onState);
    }
  });

  it("records the printed dates and transfer destinations", async () => {
    const candidate = await mapping();
    expect(candidate.contributionWindow).toEqual({ from: "2027-01-01", through: "2027-04-15" });
    expect(candidate.printedLine10).toEqual({ minimumFractionDigits: 3, maximum: "1.000" });
    expect(candidate.printedReferences).toEqual({
      line15b: "2026 Form 8915-F line 18",
      line15c: "2026 Form 1040 / 1040-SR / 1040-NR line 4b",
      line18: "2026 Form 1040 / 1040-SR / 1040-NR line 4b",
      line25b: "2026 Form 8915-F line 19",
      line25c: "2026 Form 1040 / 1040-SR / 1040-NR line 4b",
    });
  });

  it("retains diagnostic fields and blank standalone controls after save", async () => {
    const [candidate, source] = await Promise.all([mapping(), readFile(blank)]);
    for (const fullRatio of [false, true]) {
      const pdf = await PDFDocument.load(source);
      const form = pdf.getForm();
      const { fields } = candidate;
      const entries = new Map<string, string>([[fields.name, "FICTIONAL FIELD PROBE"], [fields.ssn, "REDACTED"]]);
      for (const [key, name] of Object.entries(fields)) {
        if (/^line\d/u.test(key)) entries.set(name, String(3100 + entries.size));
      }
      entries.set(fields.line10Integer, fullRatio ? "1" : "0");
      entries.set(fields.line10Fraction, fullRatio ? "000" : "375");
      for (const [name, value] of entries) form.getTextField(name).setText(value);
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const reopened = await PDFDocument.load(bytes);
      const saved = reopened.getForm();
      expect(saved.hasXFA()).toBe(false);
      expect(saved.getFields()).toHaveLength(47);
      for (const field of saved.getFields()) {
        const expected = entries.get(field.getName());
        if (field instanceof PDFCheckBox) {
          expect(field.isChecked()).toBe(false);
          expect(field.acroField.getWidgets()[0].getAppearanceState()).toEqual(PDFName.of("Off"));
        } else if (field instanceof PDFTextField) {
          expect(field.getText()).toBe(expected);
          expect(field.acroField.getValue()?.decodeText()).toBe(expected);
          if (expected !== undefined) {
            const stream = field.acroField.getWidgets()[0].getAppearances()?.normal;
            expect(stream).toBeInstanceOf(PDFRawStream);
            expect(decodePDFRawStream(stream as PDFRawStream).decode().length).toBeGreaterThan(0);
          }
        } else throw new Error("Unexpected final Form 8606 widget type");
      }
      const noticeHex = Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase();
      for (const page of reopened.getPages()) {
        const contents = page.node.normalizedEntries().Contents;
        const notices = contents?.asArray().map(ref => reopened.context.lookup(ref))
          .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream && stream.dict.has(PDFName.of("TaxEngineReviewNotice"))) ?? [];
        expect(notices).toHaveLength(1);
        expect(Buffer.from(decodePDFRawStream(notices[0]).decode()).toString("ascii")).toContain(noticeHex);
      }
      const directory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
      if (directory) {
        const stat = await lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Artifact directory must be a real directory");
        await writeFile(join(directory, `form-8606-${fullRatio ? "ratio-one" : "ratio-partial"}.pdf`), bytes, { flag: "wx", mode: 0o600 });
      }
    }
  });

  it("keeps every export gate closed", async () => {
    const [candidate, source] = await Promise.all([mapping(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
    expect(() => assertReviewTemplateBytes("f8606.pdf", source, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8606.pdf", source, 2026)).toThrow(/No qualified review/);
  });

  it("projects separate owners from the confirmed ordinary IRA originals", async () => {
    const { projectForm86062026OrdinaryDistribution, FORM_8606_2026_CANDIDATE: { fields } } =
      await import("@/pdf/mappings/2026/form-8606-candidate.js");
    const source = ordinary2026IraBasisFixture();
    const input = TaxYearInputSchema.parse(source);
    const keys = [fields.line1, fields.line2, fields.line3, fields.line4, fields.line5, fields.line6, fields.line7, fields.line8,
      fields.line9, fields.line10Integer, fields.line10Fraction, fields.line11, fields.line12, fields.line13, fields.line14,
      fields.line15a, fields.line15b, fields.line15c];
    const expected = {
      primary: ["0", "1000", "1000", "0", "1000", "2002", "1001", "0", "3003", "0", "333", "0", "333", "333", "667", "668", "0", "668"],
      spouse: ["0", "2000", "2000", "0", "2000", "8000", "2000", "0", "10000", "0", "200", "0", "400", "400", "1600", "1600", "0", "1600"],
    };
    for (const owner of ["primary", "spouse"] as const) {
      const fieldsToFill = projectForm86062026OrdinaryDistribution(input, owner);
      expect(fieldsToFill).toEqual(Object.fromEntries(keys.map((key, index) => [key, expected[owner][index]])));
      const pdf = await PDFDocument.load(await readFile(blank));
      const permissionsKey = PDFName.of("Perms");
      const permissions = pdf.catalog.get(permissionsKey);
      const readerRights = pdf.context.lookupMaybe(permissions, PDFDict)?.get(PDFName.of("UR3"));
      expect(permissions).toBeInstanceOf(PDFRef);
      expect(readerRights).toBeInstanceOf(PDFRef);
      // Rewriting the pinned blank invalidates its Reader rights signature.
      pdf.catalog.delete(permissionsKey);
      if (permissions instanceof PDFRef) pdf.context.delete(permissions);
      if (readerRights instanceof PDFRef) pdf.context.delete(readerRights);
      pdf.catalog.getAcroForm()?.dict.delete(PDFName.of("SigFlags"));
      const form = pdf.getForm();
      for (const [name, value] of Object.entries(fieldsToFill)) form.getTextField(name).setText(value);
      await markReviewPdf(pdf);
      const bytes = await pdf.save();
      const saved = await PDFDocument.load(bytes);
      expect(saved.catalog.get(permissionsKey)).toBeUndefined();
      expect(saved.context.lookup(permissions)).toBeUndefined();
      expect(saved.context.lookup(readerRights)).toBeUndefined();
      expect(saved.catalog.getAcroForm()?.dict.get(PDFName.of("SigFlags"))).toBeUndefined();
      const reopened = saved.getForm();
      for (const field of reopened.getFields()) {
        if (field instanceof PDFTextField) expect(field.getText()).toBe(fieldsToFill[field.getName()]);
        if (field instanceof PDFCheckBox) expect(field.isChecked()).toBe(false);
      }
      const directory = process.env.TAX_CANDIDATE_ARTIFACT_DIR;
      if (directory) await writeFile(join(directory, `form-8606-ordinary-${owner}.pdf`), bytes, { flag: "wx", mode: 0o600 });
    }

    for (const modify of [
      (value: typeof source) => { value.taxpayer.taxYear = 2025; },
      (value: typeof source) => { value.iraBasisSources.owners[0].basisHistory.line14 = "0"; },
      (value: typeof source) => { value.iraBasisSources.owners[0].basisHistory.line15cWorksheetAdjustment = "1"; },
      (value: typeof source) => { value.iraBasisSources.owners[0].ordinaryFacts.conversionsPresent = true; },
      (value: typeof source) => { value.form1099R[0].grossDistribution = "1001.50"; },
      (value: typeof source) => { value.form1099R[0].grossDistribution = "0.01"; value.iraBasisSources.distributions[0].grossDistribution = "0.01"; },
    ]) {
      const changed = structuredClone(source);
      modify(changed);
      expect(() => projectForm86062026OrdinaryDistribution(TaxYearInputSchema.parse(changed), "primary")).toThrow(/IRA|8606/iu);
    }
    const full = structuredClone(source);
    full.iraBasisSources.owners[0].accounts[0].yearEndValue = "0";
    full.iraBasisSources.owners[0].basisHistory.line14 = "1100";
    expect(projectForm86062026OrdinaryDistribution(TaxYearInputSchema.parse(full), "primary")).toMatchObject({
      [fields.line10Integer]: "1", [fields.line10Fraction]: "000", [fields.line14]: "99", [fields.line15c]: "0",
    });
    full.iraBasisSources.owners[0].basisHistory.line14 = "1000";
    full.form1099R[0].grossDistribution = "10000";
    full.iraBasisSources.distributions[0].grossDistribution = "10000";
    full.iraBasisSources.owners[0].accounts[0].yearEndValue = "-1";
    expect(() => projectForm86062026OrdinaryDistribution(TaxYearInputSchema.parse(full), "primary")).toThrow();
  });

  it("reopens the four-place basis ratio and its reconciled taxable amount", async () => {
    const { projectForm86062026OrdinaryDistribution, FORM_8606_2026_CANDIDATE: { fields } } =
      await import("@/pdf/mappings/2026/form-8606-candidate.js");
    const blankBytes = await readFile(blank);
    for (const [basis, gross] of [["9999", "10000"], ["9998", "9999"]] as const) {
      const input = TaxYearInputSchema.parse(ordinaryDistributionWithNoYearEndValue(basis, gross));
      const projection = projectForm86062026OrdinaryDistribution(input, "primary");
      const pdf = await PDFDocument.load(blankBytes);
      removeTrustedTemplateLegacyFormData(pdf);
      const form = pdf.getForm();
      const fraction = form.getTextField(fields.line10Fraction);
      const [widget] = fraction.acroField.getWidgets();
      const width = widget.getRectangle().width;
      const inset = 1 + (widget.getBorderStyle()?.getWidth() ?? 0);
      const font = form.getDefaultFont();
      expect(widget.getDefaultAppearance()).toMatch(/\b9\.00 Tf\b/u);
      expect(fraction.getMaxLength()).toBeUndefined();
      for (const digit of "0123456789") expect(font.widthOfTextAtSize(digit.repeat(4), 9) + 2 * inset).toBeLessThan(width);
      expect(font.widthOfTextAtSize("99999", 9) + 2 * inset).toBeGreaterThan(width);

      for (const [name, value] of Object.entries(projection)) form.getTextField(name).setText(value);
      await markReviewPdf(pdf);
      const saved = (await PDFDocument.load(await pdf.save())).getForm();
      const exactFields = { line10Integer: "0", line10Fraction: "9999", line12: basis, line13: basis, line14: "0", line15a: "1", line15c: "1" } as const;
      for (const [line, value] of Object.entries(exactFields)) {
        const field = saved.getTextField(fields[line as keyof typeof exactFields]);
        expect(field.acroField.getValue()?.decodeText(), line).toBe(value);
        const appearance = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(appearance, line).toBeInstanceOf(PDFRawStream);
        const commands = Buffer.from(decodePDFRawStream(appearance as PDFRawStream).decode()).toString("ascii");
        expect(commands, line).toContain(`<${Buffer.from(value).toString("hex").toUpperCase()}> Tj`);
        if (line === "line10Fraction") expect(commands).toContain("/Helvetica 9 Tf");
      }
    }
  });

  it("holds a distribution that still overuses basis at four places and excludes special repayments", async () => {
    const { projectForm86062026OrdinaryDistribution } = await import("@/pdf/mappings/2026/form-8606-candidate.js");
    const overuse = ordinaryDistributionWithNoYearEndValue("999999", "1000000");
    expect(() => projectForm86062026OrdinaryDistribution(TaxYearInputSchema.parse(overuse), "primary")).toThrow(/basis/iu);
    const special = ordinaryDistributionWithNoYearEndValue("9999", "10000");
    special.iraBasisSources.owners[0].ordinaryFacts.specialDistributionsOrRepaymentsPresent = true;
    expect(() => projectForm86062026OrdinaryDistribution(TaxYearInputSchema.parse(special), "primary")).toThrow(/separate actual method/iu);
  });
});
