/** Spec: spec/federal/form-6781-2026-template.yaml. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { decodePDFRawStream, PDFBool, PDFCheckBox, PDFName, PDFRawStream, PDFStream, PDFTextField } from "pdf-lib";
import { expect, it } from "vitest";
import { calculateScheduleD } from "@/engine/schedules/schedule-d.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f6781.pdf", import.meta.url);
const page1 = "topmostSubform[0].Page1[0].";
const sourcesAndMapper = () => import("@/pdf/mappings/2026/form-6781-candidate.js");

function annualCase(
  box11s: string[] = ["1000.43", "-100.40"],
  gross: [gains: string, losses: string] = ["1000.43", "100.40"],
) {
  const originals = box11s.map((box11, index) => ({
    form: "1099-b", taxYear: 2026, accountHolder: "primary" as const, corrected: false,
    sourceId: `Synthetic original ${index + 1}`, broker: "Fictional Broker",
    payerTin: "12-0000017", accountReference: `Private synthetic account ${index + 1}`, box11,
  }));
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    form1099B: originals.map(original => ({ ...original, transactions: [] })),
    form6781: { accountHolder: "primary", section1256Gains: gross[0], section1256Losses: gross[1] },
  });
  const sources = {
    taxYear: 2026, accountHolder: "primary", originalReturnConfirmed: true,
    allOriginalsReviewedAndIncludedConfirmed: true, calendarYearReturnConfirmed: true, ordinaryMarkToMarketConfirmed: true,
    recipient: { firstName: "Jane", lastName: "Doe", ssnLast4: "6789" },
    elections: { A: false, B: false, C: false, D: false },
    exclusions: { straddles: false, hedges: false, section988Election: false, adjustmentStatement: false,
      unreportedContracts: false, dealerActivity: false, passThroughAmounts: false, qofActivity: false },
    partIII: { noReportablePositionsConfirmed: true, sourceReference: "Private year-end position review" },
    originals,
  };
  return { input, sources };
}

it("reopens positive, negative and offsetting originals on the exact annual fields", async () => {
  const { FORM_6781_2026_CANDIDATE, fillForm67812026OrdinaryCandidate } = await sourcesAndMapper();
  const template = await readFile(blank);
  expect(template).toHaveLength(121700);
  expect(createHash("sha256").update(template).digest("hex")).toBe("40cf032ef46535e8695ffe22d6c76e0524f5be0eb9bc97ddd5a72207010c73c4");
  expect(FORM_6781_2026_CANDIDATE.sha256).toBe(createHash("sha256").update(template).digest("hex"));
  const cases = [
    { box11s: ["1000.43", "-100.40"], gross: ["1000.43", "100.40"], net: "900.03", line6: "", short: "360.01", long: "540.02" },
    { box11s: ["-0.04"], gross: ["0", "0.04"], net: "-0.04", line6: "-0-", short: "-0.02", long: "-0.02" },
    { box11s: ["0.49", "0.49", "-0.98"], gross: ["0.98", "0.98"], net: "0.00", line6: "-0-", short: "0.00", long: "0.00" },
  ] satisfies Array<{ box11s: string[]; gross: [string, string]; net: string; line6: string; short: string; long: string }>;

  for (const scenario of cases) {
    const { input, sources } = annualCase(scenario.box11s, scenario.gross);
    const result = await fillForm67812026OrdinaryCandidate(input, sources, template);
    expect(result.scheduleDLine4.toFixed(2)).toBe(scenario.short);
    expect(result.scheduleDLine11.toFixed(2)).toBe(scenario.long);
    const scheduleD = calculateScheduleD(input, "single", FEDERAL_2026_CONSTANTS);
    expect(scheduleD.lines.find(line => line.form === "Sched D" && line.line === "4")?.value.toFixed(2)).toBe(scenario.short);
    expect(scheduleD.lines.find(line => line.form === "Sched D" && line.line === "11")?.value.toFixed(2)).toBe(scenario.long);
    const reopened = await loadPdfDocumentQuietly(await result.document.save());
    expect(reopened.getTitle()?.trim()).toBe("2026 Form 6781");
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    expect(reopened.getPages().map(page => page.node.Annots()?.size() ?? 0)).toEqual([71, 0, 0, 0]);
    for (const page of reopened.getPages()) {
      const streams = page.node.normalizedEntries().Contents?.asArray() ?? [];
      expect(streams.some(reference => {
        const stream = reopened.context.lookup(reference);
        return stream instanceof PDFStream && stream.dict.get(PDFName.of("TaxEngineReviewNotice")) === PDFBool.True;
      })).toBe(true);
    }
    const form = reopened.getForm();
    const getText = (suffix: string) => {
      const field = form.getTextField(page1 + suffix);
      const text = field.getText() ?? "";
      if (text) {
        expect(field.acroField.dict.has(PDFName.of("V"))).toBe(true);
        const appearance = reopened.context.lookup(field.acroField.getWidgets()[0].getAppearances()?.normal);
        expect(appearance).toBeInstanceOf(PDFRawStream);
        if (appearance instanceof PDFRawStream) {
          const written = Buffer.from(decodePDFRawStream(appearance).decode()).toString("ascii");
          expect(written).toContain(`<${Buffer.from(text, "ascii").toString("hex").toUpperCase()}> Tj`);
        }
      }
      return text;
    };
    expect(getText("f1_1[0]")).toBe("Jane Doe");
    expect(getText("f1_2[0]")).toBe("");
    for (let index = 0; index < 3; index += 1) {
      const base = `Table_Line1[0].Row${index + 1}[0].f1_`;
      const amount = scenario.box11s[index];
      expect(getText(`${base}${3 + index * 3}[0]`)).toBe(amount ? "Form 1099-B Fictional Broker" : "");
      expect(getText(`${base}${4 + index * 3}[0]`)).toBe(amount?.startsWith("-") ? amount.slice(1) : "");
      expect(getText(`${base}${5 + index * 3}[0]`)).toBe(amount && !amount.startsWith("-") ? amount : "");
    }
    const amount = (value: string) => value === "0" ? "0.00" : value;
    const signed = (value: string) => value.startsWith("-") ? `(${value.slice(1)})` : value;
    expect(Array.from({ length: 9 }, (_, index) => getText(`f1_${12 + index}[0]`))).toEqual([
      amount(scenario.gross[1]), amount(scenario.gross[0]), signed(scenario.net), "", signed(scenario.net),
      scenario.line6, signed(scenario.net), signed(scenario.short), signed(scenario.long),
    ]);
    expect(form.getFields().filter(field => field instanceof PDFCheckBox).map(field => field.isChecked())).toEqual([false, false, false, false]);
    const unfilled = form.getFields().filter((field): field is PDFTextField =>
      field instanceof PDFTextField && Number(/\.f1_(\d+)\[0\]$/u.exec(field.getName())?.[1]) >= 21);
    expect(unfilled).toHaveLength(47);
    expect(unfilled.every(field => !field.getText())).toBe(true);
    const storedValues = form.getFields().flatMap(field => field instanceof PDFTextField ? [field.getText()] : []).join(" ");
    for (const marker of [input.taxpayer.primary.ssn, sources.recipient.ssnLast4, sources.partIII.sourceReference,
      ...sources.originals.flatMap(row => [row.sourceId, row.payerTin, row.accountReference])]) {
      expect(storedValues).not.toContain(marker);
    }
  }
});

it("holds incomplete, duplicate and conflicting broker originals", async () => {
  const { fillForm67812026OrdinaryCandidate } = await sourcesAndMapper();
  const template = await readFile(blank);
  const { input, sources } = annualCase();
  const [gain, loss] = sources.originals;
  for (const candidate of [
    { ...sources, allOriginalsReviewedAndIncludedConfirmed: undefined },
    { ...sources, originals: [gain] },
    { ...sources, originals: [gain, { ...loss, sourceId: gain.sourceId.toLowerCase() }] },
    { ...sources, originals: [gain, { ...loss, accountReference: gain.accountReference.toLowerCase(), payerTin: "120000017" }] },
    { ...sources, originals: [gain, { ...loss, taxYear: 2025 }] },
    { ...sources, originals: [gain, { ...loss, accountHolder: "spouse" }] },
    { ...sources, originals: [gain, { ...loss, form: "substitute-statement" }] },
    { ...sources, originals: [gain, { ...loss, corrected: true }] },
    { ...sources, originals: [gain, { ...loss, box11: undefined }] },
    { ...sources, originals: [gain, { ...loss, box11: "unknown" }] },
    { ...sources, originals: [gain, { ...loss, box11: "0.00" }] },
    { ...sources, originals: [gain, { ...loss, box11: "-100.401" }] },
    { ...sources, originals: [gain, { ...loss, broker: "Different Brokerage" }] },
    { ...sources, originals: [gain, { ...loss, payerTin: "00-0000000" }] },
    { ...sources, originals: [{ ...gain, box11: "1001.43" }, { ...loss, box11: "-101.40" }] },
    { ...sources, recipient: { ...sources.recipient, ssnLast4: "9876" } },
  ]) await expect(fillForm67812026OrdinaryCandidate(input, candidate, template).then(() => true)).rejects.toThrow(/Form 6781/);
  await expect(fillForm67812026OrdinaryCandidate({ ...input, form1099B: [] }, sources, template)).rejects.toThrow(/inventory/i);
  const withBrokerSale = TaxYearInputSchema.parse({ ...input, form1099B: input.form1099B.map((row, index) => index === 0
    ? { ...row, transactions: [{ description: "Ordinary security", dateAcquired: "2024-03-01", dateSold: "2026-10-01", proceeds: "100", costBasis: "50", holdingPeriod: "long" }] }
    : row) });
  await expect(fillForm67812026OrdinaryCandidate(withBrokerSale, sources, template)).rejects.toThrow(/transaction detail/i);
});

it("holds unknown elections, unsupported methods and incompatible return facts", async () => {
  const { fillForm67812026OrdinaryCandidate } = await sourcesAndMapper();
  const template = await readFile(blank);
  const { input, sources } = annualCase();
  for (const election of ["A", "B", "C", "D"] as const) {
    await expect(fillForm67812026OrdinaryCandidate(input, { ...sources, elections: { ...sources.elections, [election]: true } }, template)).rejects.toThrow(/Form 6781/);
  }
  for (const exclusion of Object.keys(sources.exclusions)) {
    await expect(fillForm67812026OrdinaryCandidate(input, { ...sources, exclusions: { ...sources.exclusions, [exclusion]: true } }, template)).rejects.toThrow(/Form 6781/);
  }
  await expect(fillForm67812026OrdinaryCandidate(input, { ...sources, elections: { A: false, B: false, C: false } }, template)).rejects.toThrow(/Form 6781/);
  const four = annualCase(["0.49", "0.49", "0.49", "0.49"], ["1.96", "0"]);
  await expect(fillForm67812026OrdinaryCandidate(four.input, four.sources, template)).rejects.toThrow(/Form 6781/);
  for (const candidate of [
    { ...input, form6781: undefined },
    { ...input, form6781: { ...input.form6781, adjustments: "1" } },
    { ...input, form6781: { ...input.form6781, carrybackElection: true } },
    { ...input, form6781: { ...input.form6781, carrybackAmount: "1" } },
    { ...input, form6781: { ...input.form6781, longTermStraddleGains: "1" } },
    { ...input, taxpayer: { ...input.taxpayer, taxYear: 2025 } },
    { ...input, taxpayer: { ...input.taxpayer, primary: { ...input.taxpayer.primary, ssn: "stale6789" } } },
    { ...input, standardDeductionFacts: { ...input.standardDeductionFacts, shortTaxYear: true } },
    { ...input, qofDispositionFacts: { sourceTaxYear: 2026 } },
  ]) await expect(fillForm67812026OrdinaryCandidate(candidate, sources, template).then(() => true)).rejects.toThrow(/Form 6781/);

  const large = "99999999999999.99";
  const overflow = annualCase([large], [large, "0"]);
  await expect(fillForm67812026OrdinaryCandidate(overflow.input, overflow.sources, template)).rejects.toThrow(/fit/i);
  const changed = Buffer.from(template);
  changed[changed.length - 1] ^= 1;
  await expect(fillForm67812026OrdinaryCandidate(input, sources, changed)).rejects.toThrow(/revision/i);
});

it("keeps the standalone candidate outside public review and filing exports", async () => {
  const { FORM_6781_2026_CANDIDATE } = await sourcesAndMapper();
  const template = await readFile(blank);
  expect(FORM_6781_2026_CANDIDATE).toMatchObject({ taxYear: 2026, exportsEnabled: false, filingQualified: false, reviewStatus: "independent-review-pending" });
  expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
  expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
  expect(() => assertReviewTemplateBytes("f6781.pdf", template, 2025)).toThrow(/No registered review template|Unreviewed template revision/);
  expect(() => assertReviewTemplateBytes("f6781.pdf", template, 2026)).toThrow(/No qualified review/);
  expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
});

it("requires documented Part III review even when Box 11 is net positive", async () => {
  const { fillForm67812026OrdinaryCandidate } = await sourcesAndMapper();
  const template = await readFile(blank);
  const scenarios = [
    annualCase(["-0.04"], ["0", "0.04"]),
    annualCase(["-0.04", "0.04"], ["0.04", "0.04"]),
    annualCase(["100.40"], ["100.40", "0"]),
  ];
  for (const { input, sources } of scenarios) {
    const { partIII: _review, ...withoutPartIII } = sources;
    await expect(fillForm67812026OrdinaryCandidate(input, withoutPartIII, template).then(() => true)).rejects.toThrow(/Part III/i);
    for (const partIII of [
      { sourceReference: "Private year-end position review" },
      { noReportablePositionsConfirmed: true, sourceReference: "" },
      { noReportablePositionsConfirmed: false, sourceReference: "Private year-end position review" },
    ]) await expect(fillForm67812026OrdinaryCandidate(input, { ...sources, partIII }, template).then(() => true))
      .rejects.toThrow(/Part III/i);
  }
});

it("holds decedent and contradictory calendar-year originals", async () => {
  const { fillForm67812026OrdinaryCandidate } = await sourcesAndMapper();
  const template = await readFile(blank);
  const { input, sources } = annualCase();
  for (const change of [
    { primaryDeathDate: "2026-06-15" },
    { primaryDeathDate: undefined },
    { spouseDeathDate: "2026-09-30" },
    { shortTaxYear: true },
    { dualStatusAlien: true },
    { nonresidentAlien: true },
    { residentJointElection: true },
  ]) {
    const current = TaxYearInputSchema.parse({ ...input, standardDeductionFacts: { ...input.standardDeductionFacts, ...change } });
    await expect(fillForm67812026OrdinaryCandidate(current, sources, template).then(() => true)).rejects.toThrow(/living.*calendar/i);
  }
});
