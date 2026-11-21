import { useTemporaryPdfOutput } from "./temporary-output.js";
const testOutputDir = useTemporaryPdfOutput();
/**
 * Tests for Schedule B, D, and SE PDF filling.
 * Verifies that engine results are correctly mapped to PDF form fields.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument, PDFTextField, PDFCheckBox } from "pdf-lib";
import { execFileSync } from "../helpers/file-stdin-exec.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { fillScheduleB, SCHEDULE_B_FIELDS } from "@/pdf/fill-schedule-b.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { fillScheduleD, SCHEDULE_D_FIELDS } from "@/pdf/fill-schedule-d.js";
import { fillScheduleSE, SCHEDULE_SE_FIELDS } from "@/pdf/fill-schedule-se.js";
import { complexMFJFixture, simpleW2Fixture } from "../fixtures/simple-w2.js";
import { syntheticChildElection } from "../fixtures/form-8814-election.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";

/** Helper: get text value from a filled PDF field. */
function getFieldText(doc: PDFDocument, fieldName: string): string | undefined {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFTextField) {
      return field.getText() ?? undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Helper: check if a checkbox is checked. */
function isChecked(doc: PDFDocument, fieldName: string): boolean {
  try {
    const field = doc.getForm().getField(fieldName);
    if (field instanceof PDFCheckBox) {
      return field.isChecked();
    }
  } catch {
    return false;
  }
  return false;
}

const BLANK_SB = "forms/blank/2025/f1040sb.pdf";
const BLANK_SD = "forms/blank/2025/f1040sd.pdf";
const BLANK_SSE = "forms/blank/2025/f1040sse.pdf";

function scheduleBWithChildElection(parentPayerCount: number) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    form1099Div: Array.from({ length: parentPayerCount }, (_, index) => ({
      taxYear: 2025, payer: `Parent Fund ${index + 1}`, ordinaryDividends: "100", qualifiedDividends: "0",
    })),
    form8814: [{
      taxableInterest: "0", taxExemptInterest: "0", ordinaryDividends: "5000", qualifiedDividends: "5000",
      capitalGainDistributions: "0", electionFacts: syntheticChildElection(),
    }],
  });
}

function scheduleBWithOrdinaryPayers(interestCount: number, dividendCount: number) {
  const number = (index: number) => String(index + 1).padStart(3, "0");
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    form1099Int: Array.from({ length: interestCount }, (_, index) => ({
      taxYear: 2025, payer: `Bay Bank ${number(index)}`, interestIncome: String(101 + index),
      payerTin: "96-5432108", accountReference: "SCHEDULE-B-PRIVATE-BANK-ACCOUNT",
    })),
    form1099Div: Array.from({ length: dividendCount }, (_, index) => ({
      taxYear: 2025, payer: `Harbor Fund ${number(index)}`, ordinaryDividends: String(201 + index),
      qualifiedDividends: "0", payerTin: "96-5432107", accountReference: "SCHEDULE-B-PRIVATE-FUND-ACCOUNT",
    })),
  });
}

function extractPdfPages(bytes: Uint8Array): string[] {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", [
    "-c", "import io,json,sys; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read()), strict=True).pages]))",
  ], { input: bytes, encoding: "utf8" }));
}

// ─── Schedule B — MFJ with interest and dividends ─────────────────────────

describe("Schedule B PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleB(complexMFJFixture, result, BLANK_SB);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.ssn)).toBe("111223333");
  });

  it("fills interest payer names and amounts", () => {
    const sb = result.scheduleB!;
    expect(sb.interestPayers.length).toBeGreaterThan(0);
    // First payer name should be present
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerName[0])).toBeTruthy();
    // First payer amount should be present
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerAmount[0])).toBeTruthy();
  });

  it("fills Line 2 with total interest", () => {
    const sb = result.scheduleB!;
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.line2)).toBe(
      formatCurrency(sb.totalInterest),
    );
  });

  it("fills Line 4 with taxable interest", () => {
    const sb = result.scheduleB!;
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.line4)).toBe(
      formatCurrency(sb.taxableInterest),
    );
  });

  it("fills dividend payer names", () => {
    const sb = result.scheduleB!;
    expect(sb.dividendPayers.length).toBeGreaterThan(0);
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.dividendPayerName[0])).toBeTruthy();
  });

  it("fills Line 6 with total ordinary dividends", () => {
    const sb = result.scheduleB!;
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.line6)).toBe(
      formatCurrency(sb.totalOrdinaryDividends),
    );
  });
});

describe("Schedule B PDF fill — Part III printed questions", () => {
  function expectPrintedAnswers(saved: PDFDocument, marks: readonly string[], countries?: string, continuation?: string) {
    const savedForm = saved.getForm();
    const annotations = new Set(saved.getPage(0).node.Annots()?.asArray().map(ref => saved.context.lookup(ref)));
    const checkboxes = savedForm.getFields().filter(field => field instanceof PDFCheckBox).map(field => {
      const [widget] = field.acroField.getWidgets();
      expect(annotations.has(widget.dict)).toBe(true);
      const { x, y } = widget.getRectangle();
      return { x, y, value: field.acroField.getValue().toString(), appearance: widget.getAppearanceState()?.toString() };
    }).sort((a, b) => b.y - a.y || a.x - b.x);

    // Physical Yes/No columns in the IRS form, ordered by foreign account, FBAR, and trust.
    const rows = [133.001, 97.001, 37];
    const columns = [539.4, 561];
    expect(checkboxes).toEqual(rows.flatMap((y, row) => columns.map((x, column) => {
      const mark = marks[row * columns.length + column];
      return { x, y, value: mark, appearance: mark };
    })));
    expect(savedForm.getTextField("topmostSubform[0].Page1[0].f1_65[0]").getText()).toBe(countries);
    expect(savedForm.getTextField("topmostSubform[0].Page1[0].f1_66[0]").getText()).toBe(continuation);
  }

  it("writes explicit Schedule B Part III answers to their printed PDF fields", async () => {
    const input = TaxYearInputSchema.parse({
      ...complexMFJFixture,
      scheduleBPartThree: {
        hasForeignAccounts: true, fbarRequired: true, foreignAccountCountries: ["Canada", "Japan"], hasForeignTrust: false,
      },
    });
    const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
    expectPrintedAnswers(
      await PDFDocument.load(await doc.save()), ["/1", "/Off", "/1", "/Off", "/Off", "/2"], "Canada, Japan",
    );
  });

  it.each([
    {
      name: "leaves unanswered questions blank",
      facts: undefined,
      marks: ["/Off", "/Off", "/Off", "/Off", "/Off", "/Off"],
    },
    {
      name: "prints no foreign account and no foreign trust with FBAR skipped",
      facts: { hasForeignAccounts: false, hasForeignTrust: false },
      marks: ["/Off", "/2", "/Off", "/Off", "/Off", "/2"],
    },
    {
      name: "prints foreign account yes, FBAR no, and foreign trust yes on separate rows",
      facts: { hasForeignAccounts: true, fbarRequired: false, hasForeignTrust: true },
      marks: ["/1", "/Off", "/Off", "/2", "/1", "/Off"],
    },
    {
      name: "prints foreign account yes without inventing an FBAR answer",
      facts: { hasForeignAccounts: true },
      marks: ["/1", "/Off", "/Off", "/Off", "/Off", "/Off"],
    },
    {
      name: "prints FBAR yes and its countries while leaving an unanswered trust blank",
      facts: { hasForeignAccounts: true, fbarRequired: true, foreignAccountCountries: ["Canada", "Japan"] },
      marks: ["/1", "/Off", "/1", "/Off", "/Off", "/Off"],
      countries: "Canada, Japan",
    },
    {
      name: "uses both printed country lines for a longer reported list",
      facts: {
        hasForeignAccounts: true, fbarRequired: true,
        foreignAccountCountries: [
          "United Kingdom", "Democratic Republic of the Congo", "Federated States of Micronesia",
          "United Arab Emirates", "Papua New Guinea", "Bosnia and Herzegovina",
        ],
      },
      marks: ["/1", "/Off", "/1", "/Off", "/Off", "/Off"],
      countries: "United Kingdom, Democratic Republic of the Congo",
      countryContinuation: "Federated States of Micronesia, United Arab Emirates, Papua New Guinea, Bosnia and Herzegovina",
    },
  ])("$name", async ({ facts, marks, countries, countryContinuation }) => {
    const input = TaxYearInputSchema.parse({ ...complexMFJFixture, scheduleBPartThree: facts });
    const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
    expectPrintedAnswers(await PDFDocument.load(await doc.save()), marks, countries, countryContinuation);
  });

  it("attaches a review statement with the countries that do not fit on Line 7b", async () => {
    const countries = [
      "United Kingdom", "Democratic Republic of the Congo", "Federated States of Micronesia",
      "United Arab Emirates", "Papua New Guinea", "Bosnia and Herzegovina", "Trinidad and Tobago",
      "Sao Tome and Principe", "Central African Republic", "New Zealand",
    ];
    const input = TaxYearInputSchema.parse({
      ...complexMFJFixture,
      scheduleBPartThree: {
        hasForeignAccounts: true, fbarRequired: true, foreignAccountCountries: countries,
      },
    });
    const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
    const bytes = await doc.save();
    expectPrintedAnswers(
      await PDFDocument.load(bytes), ["/1", "/Off", "/1", "/Off", "/Off", "/Off"],
      "United Kingdom, Democratic Republic of the Congo", "See attached statement",
    );
    const pages = extractPdfPages(bytes);
    expect(pages).toHaveLength(2);
    expect(pages[1]).toContain("2025 Schedule B - Line 7b Foreign Account Countries");
    expect(pages[1]).toContain("FOR REVIEW ONLY - NOT FOR FILING");
    for (const country of countries.slice(2)) expect(pages[1]).toContain(country);
  });

  it("flags unsupported country spellings without blocking the review PDF or changing the source", async () => {
    const countries = ["Canada", "中国", "Ελλάδα", "Україна"];
    const input = TaxYearInputSchema.parse({
      ...complexMFJFixture,
      scheduleBPartThree: { hasForeignAccounts: true, fbarRequired: true, foreignAccountCountries: countries },
    });
    const result = calculateFederalTax(input);
    const doc = await fillScheduleB(input, result, BLANK_SB);
    const bytes = await doc.save();
    expectPrintedAnswers(
      await PDFDocument.load(bytes), ["/1", "/Off", "/1", "/Off", "/Off", "/Off"],
      "Canada", "See attached statement",
    );
    expect(extractPdfPages(bytes)[1]).toContain("Provide printable English spellings for 3 country names on this review PDF.");
    expect(input.scheduleBPartThree?.foreignAccountCountries).toEqual(countries);
    expect(result.scheduleB?.foreignAccountCountries).toEqual(countries);
  });
});

// ─── Schedule B — simple filer (no Schedule B needed) ─────────────────────

describe("Schedule B PDF fill — simple filer with no interest/dividends", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleB(simpleW2Fixture, result, BLANK_SB);
  });

  it("fills header even when no Schedule B data", () => {
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves payer rows empty when no Schedule B result", () => {
    if (!result.scheduleB) {
      expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerName[0])).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_B_FIELDS.line2)).toBeUndefined();
    }
  });
});

// ─── Schedule D — MFJ with capital gains/losses ───────────────────────────

describe("Schedule D PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleD(complexMFJFixture, result, BLANK_SD);
  });

  it("fills header with taxpayer names and SSN", () => {
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.name)).toBe("John Smith & Jane Smith");
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.ssn)).toBe("111223333");
  });

  it("preserves the unknown QOF disposition answer", () => {
    expect(isChecked(doc, SCHEDULE_D_FIELDS.qofDispositionYes)).toBe(false);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.qofDispositionNo)).toBe(false);
  });

  it("fills Line 7 with net short-term gain/loss", () => {
    const sd = result.scheduleD!;
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.line7)).toBe(
      formatCurrency(sd.netShortTerm),
    );
  });

  it("fills Line 15 with net long-term gain/loss", () => {
    const sd = result.scheduleD!;
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.line15)).toBe(
      formatCurrency(sd.netLongTerm),
    );
  });

  it("fills Line 16 with net capital gain/loss", () => {
    const sd = result.scheduleD!;
    expect(getFieldText(doc, SCHEDULE_D_FIELDS.line16)).toBe(
      formatCurrency(sd.netCapitalGainLoss),
    );
  });

  it("fills Line 17 checkbox based on gain status", () => {
    const sd = result.scheduleD!;
    const bothGains = sd.netLongTerm.gt(0) && sd.netCapitalGainLoss.gt(0);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line17Yes)).toBe(bothGains);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line17No)).toBe(sd.netCapitalGainLoss.gt(0) && !bothGains);
  });

  it("skips Line22 when the printed both-gain path ends at20", () => {
    expect(result.scheduleD!.netLongTerm.gt(0)).toBe(true);
    expect(result.scheduleD!.netCapitalGainLoss.gt(0)).toBe(true);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line22Yes)).toBe(false);
    expect(isChecked(doc, SCHEDULE_D_FIELDS.line22No)).toBe(false);
  });
});

// ─── Schedule SE — MFJ with self-employment income ────────────────────────

describe("Schedule SE PDF fill — MFJ complex filer", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(complexMFJFixture);
    doc = await fillScheduleSE(complexMFJFixture, result, BLANK_SSE);
  });

  it("preserves an unknown joint-return SE owner", () => {
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.name)).toBeUndefined();
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.ssn)).toBeUndefined();
  });

  it("fills Line 2 with net nonfarm profit", () => {
    const se = result.scheduleSE!;
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line2)).toBe(
      formatCurrency(se.netNonfarmProfit),
    );
  });

  it("fills Line 12 with total SE tax", () => {
    const se = result.scheduleSE!;
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line12)).toBe(
      formatCurrency(se.totalSETax),
    );
  });

  it("fills Line 13 with deductible half", () => {
    const se = result.scheduleSE!;
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line13)).toBe(
      formatCurrency(se.deductibleHalf),
    );
  });

  it("fills Line 10 with Social Security portion (or empty when zero)", () => {
    const se = result.scheduleSE!;
    const expected = formatCurrency(se.socialSecurityPortion);
    if (expected === "") {
      // formatCurrency returns "" for zero; setTextField skips empty values
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line10)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line10)).toBe(expected);
    }
  });

  it("fills Line 11 with Medicare portion", () => {
    const se = result.scheduleSE!;
    const expected = formatCurrency(se.medicarePortion);
    if (expected === "") {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line11)).toBeUndefined();
    } else {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line11)).toBe(expected);
    }
  });
});

// ─── Schedule SE — simple filer (no SE needed) ───────────────────────────

describe("Schedule SE PDF fill — simple filer with no SE income", () => {
  let doc: PDFDocument;
  let result: ReturnType<typeof calculateFederalTax>;

  beforeAll(async () => {
    result = calculateFederalTax(simpleW2Fixture);
    doc = await fillScheduleSE(simpleW2Fixture, result, BLANK_SSE);
  });

  it("fills header even when no Schedule SE data", () => {
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.name)).toBe("Jane Doe");
    expect(getFieldText(doc, SCHEDULE_SE_FIELDS.ssn)).toBe("123456789");
  });

  it("leaves SE lines empty when no SE result", () => {
    if (!result.scheduleSE) {
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line12)).toBeUndefined();
      expect(getFieldText(doc, SCHEDULE_SE_FIELDS.line13)).toBeUndefined();
    }
  });
});

// ─── Orchestrator integration ────────────────────────────────────────────

describe("fillReturn orchestrator with Schedule B, D, SE", () => {
  // Spec: spec/federal/schedule-b.yaml, 1-and-5-2025-review-continuations.
  it("keeps a single Schedule B page at the exact ordinary payer capacities", async () => {
    const input = scheduleBWithOrdinaryPayers(14, 15);
    const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
    expect(doc.getPageCount()).toBe(1);
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.interestPayerName[13])).toBe("Bay Bank 014");
    expect(getFieldText(doc, SCHEDULE_B_FIELDS.dividendPayerName[14])).toBe("Harbor Fund 015");
    expect(extractPdfPages(await doc.save())[0]).not.toContain("Additional Schedule B payer rows");
  });

  it("continues only the Schedule B line that exceeds capacity", async () => {
    for (const [interestCount, dividendCount, expectedLine] of [[15, 15, 1], [14, 16, 5]] as const) {
      const input = scheduleBWithOrdinaryPayers(interestCount, dividendCount);
      const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
      const pages = extractPdfPages(await doc.save());
      expect(pages).toHaveLength(2);
      expect(pages[0]).toContain("Additional Schedule B payer rows");
      expect(pages[1]).toContain(`2025 Schedule B - Line ${expectedLine}`);
      expect(pages[1]).toContain("FOR REVIEW ONLY - NOT FOR FILING");
      expect(pages[1]).toMatch(expectedLine === 1 ? /Bay Bank 015\s+115/ : /Harbor Fund 016\s+216/);
      expect(pages[1]).not.toContain(expectedLine === 1 ? "Harbor Fund" : "Bay Bank");
      expect(pages[1]).not.toContain("123456789");
    }
  });

  it("wraps a long continuation payer name and prints its rounded amount once", async () => {
    const input = scheduleBWithOrdinaryPayers(15, 0);
    const payer = `CréditPayerStart${"W".repeat(120)}PayerEnd`;
    input.form1099Int[14].payer = payer;
    input.form1099Int[14].interestIncome = "114.50";
    const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
    const [, continuation] = extractPdfPages(await doc.save());
    expect(continuation.match(/\b115\b/g)).toHaveLength(1);
    expect(continuation.replace("115", "").replace(/\s/g, "")).toContain(payer);
  });

  it("fits the complete return name within the statement header", async () => {
    const input = scheduleBWithOrdinaryPayers(15, 0);
    input.taxpayer.primary.lastName = "W".repeat(110) + "End";
    const doc = await fillScheduleB(input, calculateFederalTax(input), BLANK_SB);
    const [text, x, size]: [string, number, number] = JSON.parse(execFileSync(
      process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3",
      ["-c", [
        "import io,json,sys; from pypdf import PdfReader",
        "runs = []",
        "PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages[1].extract_text(visitor_text=lambda text, cm, tm, font, size: runs.append([text.strip(), tm[4], size]) if text.startswith('Jane WWW') else None)",
        "print(json.dumps(runs[0]))",
      ].join("\n")], { input: await doc.save(), encoding: "utf8" },
    ));
    expect(text).toBe(`Jane ${input.taxpayer.primary.lastName}`);
    expect(size).toBeGreaterThan(0);
    // In Helvetica, W is 944 units per 1,000. These glyphs alone would extend beyond the page at 10 pt.
    expect(x + 110 * 0.944 * size).toBeLessThan(572);
  });

  it("retains every overflow payer in the 2025 Schedule B review packet", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const input = scheduleBWithOrdinaryPayers(66, 17);
    const result = calculateFederalTax(input);
    const reviewInput = redactReviewIdentifiers(input);
    const reviewResult = redactReviewIdentifiers(result);
    const doc = await fillScheduleB(reviewInput, reviewResult, BLANK_SB);
    const saved = await PDFDocument.load(await doc.save());
    const field = (suffix: string) => getFieldText(saved, `topmostSubform[0].Page1[0].${suffix}[0]`);
    expect(field("f1_02")).toBeUndefined();
    expect(field("f1_29")).toBe("Bay Bank 014");
    expect(field("f1_30")).toBe("114");
    expect(field("f1_31")).toBe("8811");
    expect(field("f1_33")).toBe("8811");
    expect(field("f1_62")).toBe("Harbor Fund 015");
    expect(field("f1_63")).toBe("215");
    expect(field("f1_64")).toBe("3553");

    const outputDir = join(testOutputDir, "schedule-b-ordinary-overflow");
    const packet = await fillReturn(reviewInput, reviewResult, {
      blankFormsDir: "forms/blank", outputDir, flatten: true, useObjectStreams: false, pageOnlyTemporaryMerge: true,
    });
    const path = join(outputDir, "f1040sb-filled.pdf");
    expect(packet.filledForms).toContain(path);
    const pages = extractPdfPages(await readFile(path));
    expect(pages).toHaveLength(4);
    expect(pages[0]).toContain("Additional Schedule B payer rows");
    expect(pages[1]).toContain("2025 Schedule B - Line 1");
    expect(pages[2]).toContain("2025 Schedule B - Line 1");
    expect(pages[3]).toContain("2025 Schedule B - Line 5");
    for (const page of pages.slice(1)) {
      expect(page).toContain("Jane Doe");
      expect(page).toContain("FOR REVIEW ONLY - NOT FOR FILING");
    }
    const continuation = pages.slice(1).join("\n");
    const rows = (payer: string) => [...continuation.matchAll(new RegExp(`${payer} (\\d{3})\\s+(\\d+)`, "g"))]
      .map(([, position, amount]) => [Number(position), Number(amount)]);
    expect(rows("Bay Bank")).toEqual(Array.from({ length: 52 }, (_, i) => [15 + i, 115 + i]));
    expect(rows("Harbor Fund")).toEqual([[16, 216], [17, 217]]);
    expect(continuation).not.toMatch(/8811|3553/);
    expect(pages.join(" ")).not.toMatch(/123-45-6789|123456789|96-543210[78]|96543210[78]|SCHEDULE-B-PRIVATE/);
  });

  it("writes the Form 8814 payer and full Line 6 in distinct saved PDF fields at capacity", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const input = scheduleBWithChildElection(14);
    const result = calculateFederalTax(input);
    const outputDir = join(testOutputDir, "schedule-b-election-at-capacity");
    await fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir });
    const saved = await PDFDocument.load(await readFile(join(outputDir, "f1040sb-filled.pdf")));

    // Literal official widget names independently bind the physical rows and total.
    const field = (suffix: string) => getFieldText(saved, `topmostSubform[0].Page1[0].${suffix}[0]`);
    expect(field("ReadOrderControl[0].f1_34")).toBe("Parent Fund 1");
    expect(field("f1_35")).toBe("100");
    expect(field("f1_60")).toBe("Parent Fund 14");
    expect(field("f1_61")).toBe("100");
    expect(field("f1_62")).toBe("Form 8814");
    expect(field("f1_63")).toBe("2300");
    expect(field("f1_64")).toBe("3700");
    expect(field("f1_65")).toBeUndefined();
  });

  it("rejects a review PDF when Form 8814 exceeds dividend row capacity and preserves every calculated payer", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const overflow = /Schedule B review PDF cannot include Form 8814 with more than 15 dividend payer rows/;
    for (const [parentPayerCount, total] of [[15, "3800"], [16, "3900"]] as const) {
      const input = scheduleBWithChildElection(parentPayerCount);
      const result = calculateFederalTax(input);

      expect(result.scheduleB?.dividendPayers.map(({ name }) => name)).toEqual([
        ...input.form1099Div.map(({ payer }) => payer), "Form 8814",
      ]);
      expect(result.scheduleB?.totalOrdinaryDividends.toFixed()).toBe(total);
      expect(result.totalDividends.toFixed()).toBe(total);
      await expect(fillScheduleB(input, result, BLANK_SB).then(() => undefined)).rejects.toThrow(overflow);
      const outputDir = join(testOutputDir, `schedule-b-election-overflow-${parentPayerCount}`);
      await expect(fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir })).rejects.toThrow(overflow);
      await expect(access(outputDir)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("fills all applicable forms for complex filer", { timeout: 30_000 }, async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(complexMFJFixture);
    const { filledForms } = await fillReturn(complexMFJFixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    // Complex filer should have: 1040 + S1 + S2 + S3 + SB + SD + SSE
    expect(filledForms.length).toBeGreaterThanOrEqual(7);
    expect(filledForms.some((f) => f.includes("f1040sb-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040sd-filled"))).toBe(true);
    expect(filledForms.some((f) => f.includes("f1040sse-filled"))).toBe(true);
  }, 15_000);

  it("does not fill Schedule B/D/SE for simple W-2 filer", async () => {
    const { fillReturn } = await import("@/pdf/fill-return.js");
    const result = calculateFederalTax(simpleW2Fixture);
    const { filledForms } = await fillReturn(simpleW2Fixture, result, {
      blankFormsDir: "forms/blank",
      outputDir: testOutputDir,
    });
    // Simple W-2 filer: no self-employment income
    expect(filledForms.some((f) => f.includes("f1040sse-filled"))).toBe(false);
    // Simple W-2 filer: no interest/dividends exceeding $1,500
    expect(filledForms.some((f) => f.includes("f1040sb-filled"))).toBe(false);
  }, 15_000);
});
