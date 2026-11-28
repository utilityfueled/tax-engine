/** Spec: spec/federal/form-8889-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFTextField, decodePDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateForm8889 } from "@/engine/forms/form-8889.js";
import { buildTaxInputFromGuidedData } from "@/lib/guided-interview-bridge";
import { emptyAdjustmentData } from "@/lib/guided-interview-flow";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, markReviewPdf, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_8889_2026_CANDIDATE as candidate, fillForm88892026OrdinaryCandidate } from "@/pdf/mappings/2026/form-8889-candidate.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { completeHsaSources, startCompleteInterview } from "../guided-interview/complete-facts";

const blank = new URL("../../forms/blank/2026/f8889.pdf", import.meta.url);
const historicalBlank = new URL("../../forms/blank/2025/f8889.pdf", import.meta.url);
const officialSha256 = "e206d84f0ce3b2a4add7a97e5de8f873b11bd0a16e34e7cd98f9c4dcc87a178d";

const ordinary = TaxYearInputSchema.parse({
  ...simpleW2Fixture,
  taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
  form8889: {
    accountOwner: "primary", coverageByMonth: Array(12).fill("self_only"),
    contributionsMade: "2199.49", qualifiedMedicalExpenses: "350.14",
  },
  w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary", box12CodeW: "1200.51" }],
  form1099SA: ["500.26", "350.39"].map(grossDistribution => ({
    payer: "Fictional HSA Trustee", taxYear: 2026, accountHolder: "primary", accountType: "hsa",
    distributionCode: "1", grossDistribution,
  })),
});
const evidence = {
  taxYear: 2026, accountOwner: "primary", fullYearEligibilityConfirmed: true, ordinaryActivityConfirmed: true,
  coverage: "self_only",
  personalContributions: "2199.49", employerContributions: "1200.51",
  grossDistributions: "850.65", qualifiedMedicalExpenses: "350.14",
} as const;

function ordinaryDistribution(grossDistributions: string, qualifiedMedicalExpenses: string) {
  const input = TaxYearInputSchema.parse({
    ...ordinary,
    form8889: { ...ordinary.form8889, qualifiedMedicalExpenses },
    form1099SA: [{
      payer: "Fictional HSA Trustee", taxYear: 2026, accountHolder: "primary", accountType: "hsa",
      distributionCode: "1", grossDistribution: grossDistributions,
    }],
  });
  const worksheet = input.form8889;
  if (!worksheet) throw new Error("Expected the ordinary fixture to include its HSA worksheet");
  const calculateTaxable = () => calculateForm8889(
    input.taxpayer, { ...worksheet, distributionsReceived: grossDistributions }, FEDERAL_2026_CONSTANTS,
  ).line16.toString();
  return { input, source: { ...evidence, grossDistributions, qualifiedMedicalExpenses }, calculateTaxable };
}

// Native suffix, rectangle in PDF points, and checkbox on-state when present.
const locations = {
  name: ["f1_1[0]", 36, 677.970, 424.050, 689.969],
  ssn: ["f1_2[0]", 424.8, 677.970, 576, 689.969],
  selfOnly: ["c1_1[0]", 482.4, 614.468, 490.4, 622.468, "/1"],
  family: ["c1_1[1]", 536.8, 614.468, 544.8, 622.468, "/2"],
  line2: ["f1_3[0]", 504, 575.968, 576, 587.967],
  line3: ["f1_4[0]", 504, 539.968, 576, 551.967],
  line4: ["f1_5[0]", 504, 503.968, 576, 515.967],
  line5: ["f1_6[0]", 504, 491.969, 576, 503.968],
  line6: ["f1_7[0]", 504, 467.968, 576, 479.967],
  line7: ["f1_8[0]", 504, 443.970, 576, 455.969],
  line8: ["f1_9[0]", 504, 431.968, 576, 443.967],
  line9: ["f1_10[0]", 410.4, 419.969, 481.65, 431.968],
  line10: ["f1_11[0]", 410.4, 407.970, 481.65, 419.969],
  line11: ["f1_12[0]", 504, 395.968, 576, 407.967],
  line12: ["f1_13[0]", 504, 383.969, 576, 395.968],
  line13: ["f1_14[0]", 504, 371.970, 576, 383.969],
  line14a: ["f1_15[0]", 504, 335.970, 576, 347.969],
  line14b: ["f1_16[0]", 504, 299.970, 576, 311.969],
  line14c: ["f1_17[0]", 504, 287.968, 576, 299.967],
  line15: ["f1_18[0]", 504, 275.969, 576, 287.968],
  line16: ["f1_19[0]", 504, 251.968, 576, 263.967],
  line17a: ["c1_2[0]", 467.2, 229.968, 475.2, 237.968, "/1"],
  line17b: ["f1_20[0]", 504, 191.970, 576, 203.969],
  line18: ["f1_21[0]", 504, 143.968, 576, 155.967],
  line19: ["f1_22[0]", 504, 131.969, 576, 143.968],
  line20: ["f1_23[0]", 504, 119.970, 576, 131.969],
  line21: ["f1_24[0]", 504, 95.969, 576, 107.968],
} as const;

describe("Final 2026 Form 8889 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const bytes = await readFile(blank);
    const doc = await PDFDocument.load(bytes);
    expect(bytes).toHaveLength(70785);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(officialSha256);
    expect(candidate).toMatchObject({
      sourceUrl: "https://www.irs.gov/pub/irs-prior/f8889--2026.pdf",
      sourceRevision: "Created 4/30/26",
      sha256: officialSha256,
    });
    expect(doc.getTitle()?.trim()).toBe("2026 Form 8889");
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 611.976, height: 791.968 });
  });

  it("matches every leaf and page widget to its printed location", async () => {
    const doc = await PDFDocument.load(await readFile(blank));
    const form = doc.getForm();
    const page = doc.getPage(0);
    expect(form.getFields()).toHaveLength(27);
    expect(Object.keys(candidate.fields).sort()).toEqual(Object.keys(locations).sort());
    expect(Object.values(candidate.fields).sort()).toEqual(form.getFields().map(field => field.getName()).sort());
    const widgetRefs = page.node.Annots()?.asArray().filter(ref =>
      doc.context.lookup(ref, PDFDict).get(PDFName.of("Subtype")) === PDFName.of("Widget"),
    );
    expect(widgetRefs?.map(String).sort()).toEqual(form.getFields().map(field => String(field.ref)).sort());

    for (const [key, [suffix, left, bottom, right, top, onState]] of Object.entries(locations)) {
      const name = candidate.fields[key as keyof typeof locations];
      expect(name).toBe(`topmostSubform[0].Page1[0].${suffix}`);
      const field = form.getField(name);
      expect(field).toBeInstanceOf(onState ? PDFCheckBox : PDFTextField);
      const widgets = field.acroField.getWidgets();
      expect(widgets).toHaveLength(1);
      const [widget] = widgets;
      expect(widget.P()).toEqual(page.ref);
      const { x, y, width, height } = widget.getRectangle();
      expect(x).toBeCloseTo(left, 3);
      expect(y).toBeCloseTo(bottom, 3);
      expect(x + width).toBeCloseTo(right, 3);
      expect(y + height).toBeCloseTo(top, 3);
      if (field instanceof PDFCheckBox) {
        expect(field.acroField.getOnValue()?.toString()).toBe(onState);
        expect(field.acroField.getValue()).toBe(PDFName.of("Off"));
        expect(widget.getAppearanceState()).toBe(PDFName.of("Off"));
      }
    }
  });

  it("records the final printed limits and transfer destinations", () => {
    expect(candidate.printedLine3FullYearUnder55).toEqual({ selfOnly: "4400", family: "8750" });
    expect(candidate.printedReferences).toEqual({
      line16: "Schedule 1 (Form 1040) line 8f",
      line17b: "Schedule 2 (Form 1040) line 13c",
      line20: "Schedule 1 (Form 1040) line 8f",
      line21: "Schedule 2 (Form 1040) line 13d",
    });
  });

  it("round-trips diagnostic amounts and checkbox states", async () => {
    const bytes = await readFile(blank);
    const { fields } = candidate;
    const amountKeys = Object.keys(locations).filter(key => key.startsWith("line") && key !== "line17a");
    expect(amountKeys).toHaveLength(22);
    const textEntries = new Map<string, string>([[fields.name, "FICTIONAL FIELD PROBE"], [fields.ssn, "REDACTED"]]);
    for (const [index, key] of amountKeys.entries()) {
      textEntries.set(fields[key as keyof typeof fields], index === 0 ? "0" : String(4000 + index));
    }
    for (const [coverage, exception] of [["selfOnly", false], ["family", true], [undefined, false]] as const) {
      const doc = await PDFDocument.load(bytes);
      const form = doc.getForm();
      const checks = {
        [fields.selfOnly]: coverage === "selfOnly" ? "/1" : "/Off",
        [fields.family]: coverage === "family" ? "/2" : "/Off",
        [fields.line17a]: exception ? "/1" : "/Off",
      };
      for (const [name, value] of textEntries) form.getTextField(name).setText(value);
      for (const [name, state] of Object.entries(checks)) {
        const box = form.getCheckBox(name);
        if (state === "/Off") box.uncheck();
        else box.check();
      }
      await markReviewPdf(doc);
      const reopened = await PDFDocument.load(await doc.save());
      const saved = reopened.getForm();
      expect(saved.getFields()).toHaveLength(27);
      for (const [name, value] of textEntries) {
        const field = saved.getTextField(name);
        expect(field.getText()).toBe(value);
        expect(field.acroField.getValue()?.decodeText()).toBe(value);
        const stream = field.acroField.getWidgets()[0].getAppearances()?.normal;
        expect(stream).toBeInstanceOf(PDFRawStream);
        expect(decodePDFRawStream(stream as PDFRawStream).decode().length).toBeGreaterThan(0);
      }
      for (const [name, state] of Object.entries(checks)) {
        const box = saved.getCheckBox(name);
        const [widget] = box.acroField.getWidgets();
        const stateName = PDFName.of(state.slice(1));
        expect(box.isChecked()).toBe(state !== "/Off");
        expect(box.acroField.dict.get(PDFName.of("V"))).toBe(stateName);
        expect(widget.getAppearanceState()).toBe(stateName);
        const normal = widget.getAppearances()?.normal;
        expect(normal).toBeInstanceOf(PDFDict);
        const stream = (normal as PDFDict).lookup(stateName, PDFRawStream);
        expect(decodePDFRawStream(stream).decode().length).toBeGreaterThan(0);
      }
      const contents = reopened.getPage(0).node.normalizedEntries().Contents;
      const noticeStreams = contents?.asArray().map(ref => reopened.context.lookup(ref))
        .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream && stream.dict.has(PDFName.of("TaxEngineReviewNotice"))) ?? [];
      expect(noticeStreams).toHaveLength(1);
      const notice = Buffer.from(decodePDFRawStream(noticeStreams[0]).decode()).toString("ascii");
      expect(notice).toContain(Buffer.from(REVIEW_PDF_NOTICE).toString("hex").toUpperCase());
    }
  });

  it("renders ordinary contributions and partly taxable distributions", async () => {
    const rendered = await fillForm88892026OrdinaryCandidate(ordinary, evidence, await readFile(blank));
    const saved = await PDFDocument.load(await rendered.save());
    const form = saved.getForm();
    // $4,400 - $1,200.51 = $3,199.49; $2,199.49 is deductible.
    // $500.26 + $350.39 - $350.14 = $500.51; 20% is $100.102.
    const expected = {
      line2: "2199", line3: "4400", line4: "0", line5: "4400", line6: "4400", line8: "4400",
      line9: "1201", line10: "0", line11: "1201", line12: "3199", line13: "2199",
      line14a: "851", line14b: "0", line14c: "851", line15: "350", line16: "501", line17b: "100",
    } as const;
    for (const [line, expectedValue] of Object.entries(expected)) {
      const field = form.getTextField(candidate.fields[line as keyof typeof expected]);
      expect(field.getText(), line).toBe(expectedValue);
      expect(field.acroField.getWidgets()[0].getAppearances()?.normal).toBeInstanceOf(PDFRawStream);
    }
    for (const field of ["name", "ssn", "line7", "line18", "line19", "line20", "line21"] as const) {
      expect(form.getTextField(candidate.fields[field]).getText(), field).toBeUndefined();
    }
    expect(form.getCheckBox(candidate.fields.selfOnly).acroField.getValue().toString()).toBe("/1");
    expect(form.getCheckBox(candidate.fields.family).isChecked()).toBe(false);
    expect(form.getCheckBox(candidate.fields.line17a).isChecked()).toBe(false);
    expect(saved.getSubject()).toBe(REVIEW_PDF_NOTICE);
  });

  it("renders a guided ordinary distribution using the confirmed original statement year", async () => {
    const state = startCompleteInterview({ filingStatus: "single", incomeTypes: [], lifeEvents: ["hsa-contributions"], stateCode: null });
    state.taxYear = 2026;
    state.sectionData.adjustments = {
      ...emptyAdjustmentData,
      hsaAccounts: [{
        ...completeHsaSources,
        contributionTaxYear: "2026",
        priorYearSourceTaxYear: "2025",
        hasDistributions: true,
        distributions: [{
          id: "hsa-statement", sourceTaxYear: "2026", accountOwner: "primary", payer: "Fictional HSA trustee",
          payerTin: "12-3456789", accountReference: "HSA-1234", accountType: "hsa", distributionCode: "1",
          grossDistribution: "1000", earningsOnExcessContributions: "0", trusteeToTrusteeTransfer: false,
          sourceFactsConfirmed: true,
          events: [{
            id: "hsa-distribution", distributionDate: "2026-04-01", grossDistribution: "1000",
            medicalExpenses: "800", rolloverAmount: "0",
            medicalEligibility: {
              qualifiedExpense: true, beneficiaryEligible: true, incurredAfterHsaEstablished: true,
              notReimbursedElsewhere: true, notDeductedOnScheduleA: true,
            },
          }],
        }],
      }],
    };
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    const rendered = await fillForm88892026OrdinaryCandidate(input, {
      ...evidence, personalContributions: completeHsaSources.contributionsMade, employerContributions: "0",
      grossDistributions: "1000", qualifiedMedicalExpenses: "800",
    }, await readFile(blank));
    const saved = await PDFDocument.load(await rendered.save());
    const form = saved.getForm();
    expect(form.getTextField(candidate.fields.line14a).getText()).toBe("1000");
    expect(form.getTextField(candidate.fields.line15).getText()).toBe("800");
    expect(form.getTextField(candidate.fields.line16).getText()).toBe("200");
    expect(form.getTextField(candidate.fields.line17b).getText()).toBe("40");
    expect(form.getTextField(candidate.fields.ssn).getText()).toBeUndefined();
    expect(saved.getSubject()).toBe(REVIEW_PDF_NOTICE);
  });

  it("renders contribution-only Part I on the final blank", async () => {
    const input = TaxYearInputSchema.parse({
      ...ordinary,
      form8889: { ...ordinary.form8889, qualifiedMedicalExpenses: "0.00" },
      form1099SA: undefined,
    });
    const doc = await fillForm88892026OrdinaryCandidate(input, {
      ...evidence, grossDistributions: "0.00", qualifiedMedicalExpenses: "0",
    }, await readFile(blank));
    const saved = await PDFDocument.load(await doc.save());
    const form = saved.getForm();
    const amounts = {
      line2: "2199", line3: "4400", line4: "0", line5: "4400", line6: "4400", line8: "4400",
      line9: "1201", line10: "0", line11: "1201", line12: "3199", line13: "2199",
    } as const;
    for (const [line, amount] of Object.entries(amounts)) {
      const field = form.getTextField(candidate.fields[line as keyof typeof amounts]);
      expect(field.getText(), line).toBe(amount);
      expect(field.acroField.getWidgets()[0].getAppearances()?.normal).toBeInstanceOf(PDFRawStream);
    }
    for (const field of ["name", "ssn", "line7", "line14a", "line14b", "line14c", "line15", "line16", "line17b",
      "line18", "line19", "line20", "line21"] as const) {
      expect(form.getTextField(candidate.fields[field]).getText(), field).toBeUndefined();
    }
    expect(form.getCheckBox(candidate.fields.selfOnly).isChecked()).toBe(true);
    expect(form.getCheckBox(candidate.fields.family).isChecked()).toBe(false);
    expect(form.getCheckBox(candidate.fields.line17a).isChecked()).toBe(false);
    expect(saved.getSubject()).toBe(REVIEW_PDF_NOTICE);
  });

  it("holds unconfirmed or conflicting absence of distributions", async () => {
    const bytes = await readFile(blank);
    const worksheet = ordinary.form8889;
    if (!worksheet) throw new Error("Expected the ordinary fixture to include its HSA worksheet");
    const input = { ...ordinary, form1099SA: [], form8889: { ...worksheet, qualifiedMedicalExpenses: "0" } };
    const source = { ...evidence, grossDistributions: "0", qualifiedMedicalExpenses: "0" };
    const withWorksheet = (changes: Partial<typeof worksheet>) => ({
      ...input, form8889: { ...input.form8889, ...changes },
    });
    for (const [returnInput, confirmation, reason] of [
      [input, { ...source, ordinaryActivityConfirmed: false }, /confirmed/],
      [input, { ...source, grossDistributions: "" }, /amount/],
      [input, { ...source, grossDistributions: "0.01" }, /1099-SA/],
      [{ ...input, form1099SA: ordinary.form1099SA }, source, /1099-SA/],
      [withWorksheet({ distributionsReceived: "0.01" }), source, /1099-SA/],
      [withWorksheet({ supported1099SAGrossDistributions: "0.01" }), source, /1099-SA/],
      [withWorksheet({ qualifiedMedicalExpenses: "0.01" }), { ...source, qualifiedMedicalExpenses: "0.01" }, /qualified/],
      [{ ...withWorksheet({ contributionsMade: "0" }), w2s: [] }, { ...source, personalContributions: "0", employerContributions: "0" }, /requires.*contribution or distribution/],
    ] as const) {
      await expect(fillForm88892026OrdinaryCandidate(returnInput, confirmation, bytes)).rejects.toThrow(reason);
    }
  });

  it("renders a fully qualified family distribution as an explicit zero", async () => {
    const spouse = TaxYearInputSchema.parse({
      ...ordinary, taxpayer: {
        ...ordinary.taxpayer,
        filingStatus: "married_filing_jointly",
        spouse: { ...ordinary.taxpayer.primary, firstName: "Fictional spouse", ssn: "999-88-7777" },
      },
      form8889: undefined,
      form8889ByOwner: { spouse: { coverageByMonth: Array(12).fill("family"), contributionsMade: "8750", qualifiedMedicalExpenses: "850.65" } },
      w2s: [], form1099SA: ordinary.form1099SA?.map(statement => ({ ...statement, accountHolder: "spouse" })),
    });
    const doc = await fillForm88892026OrdinaryCandidate(spouse, {
      ...evidence, accountOwner: "spouse", personalContributions: "8750", employerContributions: "0",
      coverage: "family", qualifiedMedicalExpenses: "850.65",
    }, await readFile(blank));
    const saved = (await PDFDocument.load(await doc.save())).getForm();
    expect(saved.getCheckBox(candidate.fields.family).acroField.getValue().toString()).toBe("/2");
    expect(saved.getCheckBox(candidate.fields.selfOnly).isChecked()).toBe(false);
    expect(saved.getTextField(candidate.fields.line3).getText()).toBe("8750");
    expect(saved.getTextField(candidate.fields.line13).getText()).toBe("8750");
    expect(saved.getTextField(candidate.fields.line16).getText()).toBe("0");
    expect(saved.getTextField(candidate.fields.line17b).getText()).toBe("0");
  });

  it("reconciles the displayed line 16 without changing exact HSA amounts", async () => {
    const bytes = await readFile(blank);
    for (const [gross, qualified, exactTaxable] of [
      ["500.49", "499.50", "0.99"],
      ["500.50", "500.49", "0.01"],
    ] as const) {
      const { input, source, calculateTaxable } = ordinaryDistribution(gross, qualified);
      expect(calculateTaxable()).toBe(exactTaxable);
      const failure = await fillForm88892026OrdinaryCandidate(input, source, bytes)
        .then(() => undefined, (error: unknown) => error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty("message", "Form 8889 candidate cannot reconcile displayed lines 14c, 15, and 16");
      expect(calculateTaxable()).toBe(exactTaxable);
    }
  });

  it("reopens reconciled cents and whole-dollar distributions with their exact displayed values", async () => {
    const bytes = await readFile(blank);
    for (const [gross, qualified, displayedGross, displayedQualified] of [
      ["500.49", "499.49", "500", "499"],
      ["501", "500", "501", "500"],
    ] as const) {
      const { input, source, calculateTaxable } = ordinaryDistribution(gross, qualified);
      expect(calculateTaxable()).toBe("1");
      const rendered = await fillForm88892026OrdinaryCandidate(input, source, bytes);
      const form = (await PDFDocument.load(await rendered.save())).getForm();
      for (const [line, value] of [["line14c", displayedGross], ["line15", displayedQualified], ["line16", "1"]] as const) {
        const field = form.getTextField(candidate.fields[line]);
        expect(field.getText(), line).toBe(value);
        expect(field.acroField.getWidgets()[0].getAppearances()?.normal).toBeInstanceOf(PDFRawStream);
      }
    }
  });

  it("rejects unknown and unsupported ordinary candidate facts", async () => {
    const current = await readFile(blank);
    const worksheet = ordinary.form8889;
    if (!worksheet) throw new Error("Expected the ordinary fixture to include its HSA worksheet");
    const withForm = (changes: Partial<typeof worksheet>) => ({
      ...ordinary, form8889: { ...worksheet, ...changes },
    });
    const withStatements = (changes: Partial<NonNullable<typeof ordinary.form1099SA>[number]>) => ({
      ...ordinary, form1099SA: ordinary.form1099SA?.map(statement => ({ ...statement, ...changes })),
    });
    for (const [input, source, reason] of [
      [ordinary, { ...evidence, ordinaryActivityConfirmed: false }, /confirmed/],
      [ordinary, { ...evidence, fullYearEligibilityConfirmed: false }, /confirmed/],
      [ordinary, { ...evidence, taxYear: 2025 }, /2026/],
      [ordinary, { ...evidence, accountOwner: "spouse" }, /owner/],
      [ordinary, { ...evidence, coverage: "family" }, /coverage/],
      [ordinary, { ...evidence, qualifiedMedicalExpenses: "" }, /amount/],
      [ordinary, { ...evidence, personalContributions: "-1" }, /amount/],
      [ordinary, { ...evidence, qualifiedMedicalExpenses: "400.00" }, /worksheet/],
      [ordinary, { ...evidence, personalContributions: "2200.00" }, /worksheet/],
      [ordinary, { ...evidence, employerContributions: "1234" }, /W-2/],
      [ordinary, { ...evidence, grossDistributions: "850.64" }, /1099-SA/],
      [withForm({ distributionsReceived: "900" }), evidence, /1099-SA/],
      [withForm({ distributionsReceived: "0" }), evidence, /1099-SA/],
      [withForm({ rolloverDistributions: "1" }), evidence, /ordinary/],
      [withForm({ lastMonthRuleContributions: "10" }), evidence, /ordinary/],
      [withForm({ medicareMonths: [1] }), evidence, /eligible/],
      [withForm({ coverageByMonth: Array(11).fill("self_only").concat("family") }), evidence, /coverage/],
      [withForm({ contributionsMade: "3199.50" }), { ...evidence, personalContributions: "3199.50" }, /limit/],
      [{ ...ordinary, taxpayer: { ...ordinary.taxpayer, primary: { ...ordinary.taxpayer.primary, dateOfBirth: "2026-02-01" } } }, evidence, /eligible on January 1/],
      [withForm({ qualifiedMedicalExpenses: "900" }), { ...evidence, qualifiedMedicalExpenses: "900" }, /qualified/],
      [withStatements({ taxYear: undefined }), evidence, /1099-SA/],
      [withStatements({ taxYear: 2025 }), evidence, /1099-SA/],
      [withStatements({ accountHolder: undefined }), evidence, /1099-SA/],
      [withStatements({ distributionCode: "3" }), evidence, /1099-SA/],
      [{ ...ordinary, w2s: ordinary.w2s.map(w2 => ({ ...w2, accountHolder: undefined })) }, evidence, /W-2/],
      [{ ...ordinary, taxpayer: { ...ordinary.taxpayer, primary: { ...ordinary.taxpayer.primary, dateOfBirth: "1971-12-31" } } }, evidence, /under 55/],
    ] as const) {
      await expect(fillForm88892026OrdinaryCandidate(input, source, current)).rejects.toThrow(reason);
    }
    await expect(fillForm88892026OrdinaryCandidate(ordinary, evidence, await readFile(historicalBlank))).rejects.toThrow(/template revision/);
    const changed = Buffer.from(current);
    changed[0] ^= 1;
    await expect(fillForm88892026OrdinaryCandidate(ordinary, evidence, changed)).rejects.toThrow(/template revision/);
  });

  it("keeps the annual and historical export gates in effect", async () => {
    const [current, historical] = await Promise.all([readFile(blank), readFile(historicalBlank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending",
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.fields)).toBe(true);
    expect(PDF_MAPPING_PACKS[2026].reviewAvailable).toBe(false);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(() => assertPdfExportAllowed(2026, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/Filing exports are unavailable/);
    expect(() => assertPdfExportAllowed(2025, 2026)).toThrow(/years must match/);
    expect(() => assertPdfExportAllowed(2026, 2025)).toThrow(/years must match/);
    expect(() => assertReviewTemplateBytes("f8889.pdf", current, 2025)).toThrow(/Unreviewed template revision/);
    expect(() => assertReviewTemplateBytes("f8889.pdf", current, 2026)).toThrow(/No qualified review/);
    expect(() => assertReviewTemplateBytes("f8889.pdf", historical, 2026)).toThrow(/No qualified review/);
    expect(assertReviewTemplateBytes("f8889.pdf", historical, 2025).sha256).toBe(createHash("sha256").update(historical).digest("hex"));
  });
});
