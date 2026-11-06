// Spec: spec/federal/form-8582.yaml review-copy.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fillReturn } from "@/pdf/fill-return.js";
import { expect, it } from "vitest";
import Decimal from "decimal.js";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm8582, FORM_8582_FIELDS as F } from "@/pdf/fill-form-8582.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const blank = "forms/blank/2025/f8582.pdf";
const field = (doc: PDFDocument, name: string) => doc.getForm().getTextField(name).getText();
function source() {
  return TaxYearInputSchema.parse({ ...simpleW2Fixture,
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "120000" }],
    rentalProperties: Array.from({ length: 6 }, (_, index) => ({ description: `Actual property ${index + 1}`,
      rents: "0", otherExpenses: index === 0 ? "4000.25" : "1000", isActiveParticipant: true,
      propertyType: "single_family", rentalDays: 365, personalUseDays: 0 })),
    priorYear: { suspendedPassiveLosses: [{ partnershipName: "Actual property 1", amount: "2000" }] },
  });
}
function texts(doc: PDFDocument): string {
  return doc.getPages().slice(3).flatMap(page => {
    const content = page.node.Contents();
    const objects = content instanceof PDFArray ? content.asArray().map(ref => doc.context.lookup(ref)) : [content];
    return objects.filter((obj): obj is PDFRawStream => obj instanceof PDFRawStream).flatMap(stream =>
      [...Buffer.from(decodePDFRawStream(stream).decode()).toString("ascii").matchAll(/<([\dA-F]+)> Tj/g)]
        .map(match => Buffer.from(match[1], "hex").toString("utf8")));
  }).join(" ");
}
it("copies actual audited MAGI and prior losses with every source row", async () => {
  const input = source(), result = calculateFederalTax(input);
  const doc = await fillForm8582(input, result, blank);
  expect(field(doc, F.line1b)).toBe("9000"); // preprinted parentheses already on the form.
  expect(field(doc, F.line1c)).toBe("2000");
  expect(field(doc, F.line6)).toBe("120000");
  expect(field(doc, F.line8)).toBe("15000");
  expect(field(doc, F.line9)).toBe("11000");
  expect(field(doc, F.part4.rows[0].b)).toBe("4000");
  expect(field(doc, F.part4.rows[0].c)).toBe("2000");
  expect(doc.getPageCount()).toBeGreaterThan(3);
  const saved = await PDFDocument.load(await doc.save());
  expect(texts(saved)).toContain("Actual property 6");
  expect(texts(saved)).toContain("4000.25");
  expect(texts(saved)).toContain("Schedule E, line 22");
});

it("refuses changed activity sources and altered intermediate passive audits", async () => {
  const input = source(), result = calculateFederalTax(input);
  if (!result.form8582) throw new Error("Actual synthetic passive worksheet missing");
  const changed = { ...result, form8582: { ...result.form8582, lines: result.form8582.lines.map(row => row.line === "6" ? { ...row, value: new Decimal(1) } : row) } };
  await expect(fillForm8582(input, changed, blank)).rejects.toThrow(/audit|reconcile/i);
  const firstProperty = input.rentalProperties?.[0];
  if (!firstProperty) throw new Error("Missing actual test property");
  firstProperty.otherExpenses = "4001";
  await expect(fillForm8582(input, result, blank)).rejects.toThrow(/source|reconcile/i);
});

it("attaches the passive worksheet when all losses are allowed", async () => {
  const input = source(), result = calculateFederalTax(input);
  expect(result.form8582?.requiresForm8582).toBe(true);
  expect(result.form8582?.suspendedLoss.toFixed()).toBe("0");
  const outputDir = await mkdtemp(join(tmpdir(), "passive-source-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir });
    expect(packet.filledForms.some(path => path.endsWith("f8582-filled.pdf"))).toBe(true);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

it("reconciles printed ratios and preserves official stop branches", async () => {
  const input = source();
  input.w2s[0].wages = "149999";
  input.priorYear = undefined;
  input.rentalProperties = input.rentalProperties?.slice(0, 3).map(row => ({ ...row, otherExpenses: "1000" }));
  const result = calculateFederalTax(input), doc = await fillForm8582(input, result, blank);
  const specialRatios = F.part6.rows.slice(0, 3).map(row => field(doc, row.b));
  expect(specialRatios).toEqual(["0.333334", "0.333333", "0.333333"]);
  expect(specialRatios.reduce((total, ratio) => total.plus(ratio ?? "NaN"), new Decimal(0)).toFixed()).toBe("1");
  expect(F.part6.rows.slice(0, 3).map(row => field(doc, row.c) ?? "0")).toEqual(["1", "0", "0"]);
  const unallowedRatios = F.part7.rows.slice(0, 3).map(row => field(doc, row.b));
  expect(unallowedRatios.reduce((total, ratio) => total.plus(ratio ?? "NaN"), new Decimal(0)).toFixed()).toBe("1");
  expect(field(doc, F.part7.totalC)).toBe("2999");
  expect(field(doc, F.part8.totalC)).toBe("1");
  input.w2s[0].wages = "150000";
  const ceiling = await fillForm8582(input, calculateFederalTax(input), blank);
  expect(field(ceiling, F.line7)).toBeUndefined();
  expect(field(ceiling, F.line8)).toBeUndefined();
  expect(field(ceiling, F.line9)).toBe("0");
  const actualRental = input.rentalProperties?.[0];
  if (!actualRental) throw new Error("Missing actual rental source");
  input.rentalProperties = [{ ...actualRental, rents: "10000", otherExpenses: "1000" }];
  input.priorYear = { suspendedPassiveLosses: [{ partnershipName: "Actual property 1", amount: "2000" }] };
  const gain = await fillForm8582(input, calculateFederalTax(input), blank);
  expect(field(gain, F.line3)).toBe("7000");
  expect(field(gain, F.line6)).toBeUndefined();
  expect(field(gain, F.line11)).toBeUndefined();
});
