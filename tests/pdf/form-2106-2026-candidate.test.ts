/** Spec: spec/federal/form-2106-2026-template.yaml. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { assertPdfExportAllowed, PDF_MAPPING_PACKS, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { fillForm2106ReservistReviewCandidate } from "@/pdf/mappings/2026/form-2106-candidate.js";
import { assertReviewTemplateBytes, REVIEW_TEMPLATE_PACKS } from "@/pdf/template-registry.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const blank = new URL("../../forms/blank/2026/f2106.pdf", import.meta.url);

async function loadCandidate() {
  const { FORM_2106_2026_CANDIDATE } = await import("@/pdf/mappings/2026/form-2106-candidate.js");
  return FORM_2106_2026_CANDIDATE;
}

function reserveLodgingFixture(manualAmount = "80") {
  const taxpayer = simpleW2Fixture.taxpayer;
  const input = TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...taxpayer, taxYear: 2026 },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary" }],
    adjustments: { businessExpenseAdjustments: manualAmount },
  });
  const owner = { accountHolder: "primary", firstName: "Jane", lastName: "Doe" };
  const sources = {
    duty: {
      taxYear: 2026, owner: { ...owner }, reserveComponent: "Air Force Reserve",
      orderReference: "Synthetic 2026 reserve orders", performanceReference: "Synthetic attendance and completion record",
      taxHome: { city: "Dallas", state: "TX" }, taxHomeAndDistanceReference: "Synthetic business location and distance record",
      distanceFromTaxHomeMiles: 180, city: "Abilene", state: "TX", startDate: "2026-01-17", endDate: "2026-01-18",
      officialDutyPerformedConfirmed: true, overnightTravelRequiredConfirmed: true,
      noOtherTripsExpensesOrDuplicateClaimsConfirmed: true,
      noPaymentOrReimbursementAvailableConfirmed: true,
      reimbursementReference: "Synthetic unit and payroll records, including Box 12 code L check",
    },
    lodging: {
      taxYear: 2026, owner: { ...owner }, provider: "Synthetic Hotel", receiptReference: "Synthetic paid folio and card record",
      city: "Abilene", state: "TX", checkInDate: "2026-01-17", checkOutDate: "2026-01-18", paidDate: "2026-01-18",
      roomAmountPaid: "80.00", taxpayerPaidItemizedRoomOnlyConfirmed: true,
    },
  };
  return { input, sources };
}

function reopenWithStrictPypdf(bytes: Uint8Array) {
  const python = process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? ".local/pdf-test-venv/bin/python";
  const proc = spawnSync(python, ["-c", `
import io, json, sys
from pypdf import PdfReader

reader = PdfReader(io.BytesIO(sys.stdin.buffer.read()), strict=True)
fields = reader.get_fields()
widgets = []
for page in reader.pages:
    values = {}
    for ref in page['/Annots']:
        widget = ref.get_object()
        if widget.get('/Subtype') != '/Widget':
            continue
        names = []
        current = widget
        value = None
        while current is not None:
            if current.get('/T') is not None:
                names.append(current.get('/T'))
            if value is None:
                value = current.get('/V')
            parent = current.get('/Parent')
            current = parent.get_object() if parent is not None else None
        name = '.'.join(reversed(names))
        assert name in fields and fields[name].get('/V') == value
        if value not in (None, '', '/Off'):
            assert widget['/AP']['/N'].get_data()
            values[name] = value
    widgets.append(values)
print(json.dumps({'values': widgets, 'pages': [page.extract_text() for page in reader.pages]}))
`], { input: bytes, encoding: "utf8" });
  expect(proc.status, proc.stderr || proc.error?.message).toBe(0);
  return JSON.parse(proc.stdout) as { values: Record<string, string>[]; pages: string[] };
}

describe("Final 2026 Form 2106 physical candidate", () => {
  it("pins the exact final annual source", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(sha256).toBe("794f7d7f84fd3a878e18751622949403d8499474c807fb05b3ee2e0bd811bc1b");
    expect(bytes.length).toBe(108061);
    expect(candidate).toMatchObject({
      sha256,
      sourceUrl: "https://www.irs.gov/pub/irs-pdf/f2106.pdf",
      annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f2106--2026.pdf",
      sourceRevision: "Created 8/18/26",
      postedDate: "2026-11-20",
      retrievedAt: "2026-11-20T18:56:43Z",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()?.trim()).toBe("2026 Form 2106");
    expect(pdf.getPages().map(page => page.getSize())).toEqual([
      { width: 611.976, height: 791.968 },
      { width: 611.976, height: 791.968 },
    ]);
  });

  it("confirms the physical page and widget census", async () => {
    const pdf = await PDFDocument.load(await readFile(blank));
    const fields = pdf.getForm().getFields();
    expect(fields).toHaveLength(87);
    expect(fields.filter(field => field instanceof PDFTextField)).toHaveLength(79);
    expect(fields.filter(field => field instanceof PDFCheckBox)).toHaveLength(8);
    const pages = pdf.getPages();
    const widgets = fields.flatMap(field => field.acroField.getWidgets());
    expect(widgets).toHaveLength(87);
    expect(pages.map(page => page.node.Annots()?.size())).toEqual([24, 63]);
    expect(pages.map(page => widgets.filter(widget => widget.P() === page.ref).length)).toEqual([24, 63]);
  });

  it("round-trips original lodging through Form 2106 and Schedule 1 line 12", async () => {
    const { input, sources } = reserveLodgingFixture();
    const { document, schedule1Line12 } = await fillForm2106ReservistReviewCandidate(input, sources, await readFile(blank));
    // $80 in qualifying room costs is below the $110 Abilene limit. With $0 reimbursed and no other expenses,
    // lines 3, 6A, 8A, 9A and 10 show the same $80. Other money fields and all three SSN cells remain blank.
    const { values, pages } = reopenWithStrictPypdf(await document.save());
    const page1 = "topmostSubform[0].Page1[0].";
    expect(values).toEqual([{
      [page1 + "f1_01[0]"]: "Jane Doe",
      [page1 + "f1_02[0]"]: "Armed Forces reservist",
      [page1 + "Table_Step1[0].Line3[0].f1_10[0]"]: "80",
      [page1 + "Table_Step1[0].Line6[0].f1_17[0]"]: "80",
      [page1 + "Table_Step3[0].Line8[0].f1_21[0]"]: "80",
      [page1 + "Table_Step3[0].Line9[0].f1_23[0]"]: "80",
      [page1 + "f1_25[0]"]: "80",
    }, {}]);
    expect(pages).toHaveLength(2);
    for (const page of pages) expect(page).toContain(REVIEW_PDF_NOTICE);
    expect(schedule1Line12.toFixed()).toBe("80");
    const ordinaryReturn = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      adjustments: { businessExpenseAdjustments: input.adjustments?.businessExpenseAdjustments },
    });
    const ordinaryLine12 = calculateFederalTax(ordinaryReturn).allLines.find(row => row.form === "Sched 1" && row.line === "12");
    expect(ordinaryLine12?.value.toFixed()).toBe("80");
  });

  it("accepts the exact published lodging ceiling", async () => {
    const { input, sources } = reserveLodgingFixture("110");
    sources.lodging.roomAmountPaid = "110.00";
    const result = await fillForm2106ReservistReviewCandidate(input, sources, await readFile(blank));
    expect(result.schedule1Line12.toFixed()).toBe("110");
  });

  it.each<[string, (fixture: ReturnType<typeof reserveLodgingFixture>) => void, RegExp]>([
    ["wrong return year", ({ input }) => { input.taxpayer.taxYear = 2025; }, /2026.*primary/],
    ["joint return", ({ input }) => { input.taxpayer.filingStatus = "married_filing_jointly"; }, /2026.*primary/],
    ["wrong orders year", ({ sources }) => { sources.duty.taxYear = 2025; }, /original.*record/i],
    ["wrong lodging year", ({ sources }) => { sources.lodging.taxYear = 2025; }, /original.*record/i],
    ["spouse lodging record", ({ sources }) => { sources.lodging.owner.accountHolder = "spouse"; }, /original.*record/i],
    ["different person in duty order", ({ sources }) => { sources.duty.owner.lastName = "Baker"; }, /same primary taxpayer/i],
    ["different person on receipt", ({ sources }) => { sources.lodging.owner.lastName = "Baker"; }, /same primary taxpayer/i],
    ["unqualified Reserve designation", ({ sources }) => { sources.duty.reserveComponent = "State Defense Force"; }, /original.*record/i],
    ["absent duty-performance evidence", ({ sources }) => { sources.duty.performanceReference = ""; }, /original.*record/i],
    ["unconfirmed duty performance", ({ sources }) => { sources.duty.officialDutyPerformedConfirmed = false; }, /original.*record/i],
    ["exactly 100 miles", ({ sources }) => { sources.duty.distanceFromTaxHomeMiles = 100; }, /more than 100 miles/i],
    ["duty city conflicts with tax home", ({ sources }) => { sources.duty.taxHome.city = "Abilene"; }, /more than 100 miles/i],
    ["unsubstantiated distance", ({ sources }) => { sources.duty.taxHomeAndDistanceReference = " "; }, /original.*record/i],
    ["unconfirmed required overnight stay", ({ sources }) => { sources.duty.overnightTravelRequiredConfirmed = false; }, /original.*record/i],
    ["Abilene outside published fixture scope", ({ sources }) => { sources.duty.startDate = "2026-10-17"; }, /January.*Abilene/i],
    ["different lodging place", ({ sources }) => { sources.lodging.city = "Dallas"; }, /January.*Abilene/i],
    ["unmatched lodging night", ({ sources }) => { sources.lodging.checkInDate = "2026-01-16"; }, /January.*Abilene/i],
    ["unmatched receipt payment date", ({ sources }) => { sources.lodging.paidDate = "2026-01-17"; }, /January.*Abilene/i],
    ["receipt without original reference", ({ sources }) => { sources.lodging.receiptReference = ""; }, /original.*record/i],
    ["lodging paid by someone else", ({ sources }) => { sources.lodging.taxpayerPaidItemizedRoomOnlyConfirmed = false; }, /original.*record/i],
    ["unconfirmed or available reimbursement", ({ sources }) => { sources.duty.noPaymentOrReimbursementAvailableConfirmed = false; }, /original.*record/i],
    ["other expenses or duplicates", ({ sources }) => { sources.duty.noOtherTripsExpensesOrDuplicateClaimsConfirmed = false; }, /original.*record/i],
    ["room cost above ceiling", ({ sources }) => { sources.lodging.roomAmountPaid = "111"; }, /lodging.*ceiling/i],
    ["nonzero cents", ({ sources }) => { sources.lodging.roomAmountPaid = "80.01"; }, /original.*record/i],
    ["zero room cost", ({ sources }) => { sources.lodging.roomAmountPaid = "0"; }, /positive.*lodging/i],
    ["conflicting manual transfer", ({ input }) => { input.adjustments!.businessExpenseAdjustments = "79.99"; }, /Schedule 1 line 12/],
    ["missing manual transfer", ({ input }) => { delete input.adjustments; }, /Schedule 1 line 12/],
  ])("holds incomplete, conflicting, or out-of-scope originals (%s)", async (_name, change, error) => {
    const fixture = reserveLodgingFixture();
    change(fixture);
    await expect(fillForm2106ReservistReviewCandidate(fixture.input, fixture.sources, await readFile(blank))).rejects.toThrow(error);
  });

  it("rejects substituted template bytes before writing a PDF", async () => {
    const { input, sources } = reserveLodgingFixture();
    const changed = await readFile(blank);
    changed[0] ^= 1;
    await expect(fillForm2106ReservistReviewCandidate(input, sources, changed)).rejects.toThrow(/template revision/i);
  });

  it("keeps the physical candidate outside public exports", async () => {
    const [candidate, bytes] = await Promise.all([loadCandidate(), readFile(blank)]);
    expect(candidate).toMatchObject({
      taxYear: 2026,
      reviewStatus: "independent-review-pending",
      exportsEnabled: false,
      filingQualified: false,
    });
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.hasOwn(REVIEW_TEMPLATE_PACKS, 2026)).toBe(false);
    expect(PDF_MAPPING_PACKS[2026]).toMatchObject({ reviewAvailable: false, filingQualified: false });
    expect(() => calculateFederalTax(reserveLodgingFixture().input)).toThrow(/2026.*incomplete.*unavailable/);
    expect(() => assertReviewTemplateBytes("f2106.pdf", bytes, 2025)).toThrow(/No registered review template/);
    expect(() => assertReviewTemplateBytes("f2106.pdf", bytes, 2026)).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "review")).toThrow(/No qualified review/);
    expect(() => assertPdfExportAllowed(2026, 2026, "filing")).toThrow(/unavailable/);
  });
});
