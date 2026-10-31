// Spec: spec/federal/form-7206-pdf.yaml; official 2025 Form7206 inspected field-by-field.
import Decimal from "decimal.js";
import { execFileSync } from "../helpers/file-stdin-exec";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm7206, FORM_7206_FIELDS } from "@/pdf/fill-form-7206.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { formatCurrency } from "@/pdf/pdf-utils.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { healthFacts } from "../fixtures/form7206.js";
function inspectPdf(bytes: Uint8Array): { pages: string[]; fields: Record<string, string>; widgets: { name: string; value: string; appearance: boolean }[] } {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
from pypdf import PdfReader
import io,json,sys
reader=PdfReader(io.BytesIO(sys.stdin.buffer.read()))
fields={name:str(field.get('/V','')) for name,field in reader.get_fields().items() if field.get('/FT')=='/Tx'}
widgets=[]
for page in reader.pages:
 for reference in page.get('/Annots',[]):
  widget=reference.get_object()
  if widget.get('/Subtype')!='/Widget': continue
  node=widget; names=[]; value=None
  while node:
   if node.get('/T'): names.insert(0,str(node.get('/T')))
   if value is None and '/V' in node: value=str(node.get('/V'))
   parent=node.get('/Parent'); node=parent.get_object() if parent else None
  appearance=widget.get('/AP',{}).get('/N')
  widgets.append({'name':'.'.join(names),'value':value or '', 'appearance':bool(appearance and appearance.get_object().get_data())})
print(json.dumps({'pages':[(page.extract_text() or '') for page in reader.pages],'fields':fields,'widgets':widgets}))
`], { input: bytes, encoding: "utf8" }));
}
const blank = "forms/blank/2025/f7206.pdf";
const d = (value: string | number) => new Decimal(value);
function fixture(corporate = false) {
  const facts = healthFacts(corporate ? "formW2:0" : "scheduleC");
  if (corporate) Object.assign(facts.plans[0]!, { businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
    payments: facts.plans[0]!.payments.map(payment => ({ ...payment, personAmounts: payment.personAmounts.map(person => ({ ...person, payer: "business_paid_or_reimbursed" })) })) });
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", socialSecurityTips: "0" }],
    scheduleC: { accountHolder: "primary", businessName: "Actual design business", grossReceipts: "50000", qbiMateriallyParticipated: true }, form7206: facts });
}
const field = (doc: PDFDocument, line: keyof typeof FORM_7206_FIELDS) => doc.getForm().getTextField(FORM_7206_FIELDS[line]).getText();

it("copies every applicable actual business line into the registered physical form", async () => {
  for (const corporate of [false, true]) {
    const input = fixture(corporate), result = calculateFederalTax(input), source = corporate ? "formW2:0" : "scheduleC";
    const doc = await fillForm7206(input, result, blank, source, "primary");
    expect(field(doc, "name")).toBe("Jane Doe"); expect(field(doc, "ssn")).toBe("123456789");
    for (let line = 1; line <= 14; line++) {
      const audit = result.form7206!.lines.find(row => row.line === String(line) && row.inputs?.Business === source && row.inputs?.Owner === "primary");
      const text = field(doc, `line${line}` as keyof typeof FORM_7206_FIELDS);
      if ((corporate && line >= 4 && line <= 10) || (!corporate && line === 11)) expect(text).toBeUndefined();
      else if (line === 6) expect(text).toBe("100%");
      else expect(text).toBe(audit!.value.isZero() ? "0" : formatCurrency(audit!.value));
    }
    expect(field(doc, "line14")).toBe("600");
    const reopened = await PDFDocument.load(await doc.save()); expect(field(reopened, "line14")).toBe("600");
    expect(reopened.getForm().getFields()).toHaveLength(16);
    const physical = inspectPdf(await doc.save());
    expect(Object.keys(physical.fields)).toHaveLength(16); expect(physical.widgets).toHaveLength(16);
    for (const widget of physical.widgets) { expect(widget.value).toBe(physical.fields[widget.name]); expect(widget.appearance).toBe(true); }
    expect(physical.fields[FORM_7206_FIELDS.line14]).toBe("600");
  }
  const input = fixture(), result = calculateFederalTax(input);
  const audit = result.form7206!.lines.find(row => row.line === "14")!;
  result.form7206!.lines.push(audit);
  await expect(fillForm7206(input, result, blank, "scheduleC", "primary")).rejects.toThrow(/audit|duplicate/i);
  result.form7206!.lines.pop(); result.form7206!.businesses[0]!.deduction = d("601");
  await expect(fillForm7206(input, result, blank, "scheduleC", "primary")).rejects.toThrow(/audit|calculated|deduction/i);
});

it("preserves cleared review identifiers and closed year gates", async () => {
  const input = fixture(), result = calculateFederalTax(input);
  input.taxpayer.primary.ssn = "";
  const doc = await fillForm7206(input, result, blank, "scheduleC", "primary");
  expect(field(doc, "ssn")).toBeUndefined();
  expect(inspectPdf(await doc.save()).pages.join(" ")).not.toMatch(/123.?45.?6789/);
  await expect(fillForm7206(input, result, blank, "unknown", "primary")).rejects.toThrow(/business/i);
  await expect(fillForm7206(input, result, blank, "scheduleC", "spouse")).rejects.toThrow(/business|owner/i);
  await expect(fillForm7206({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } }, { ...result, taxYear: 2026 }, "/missing", "scheduleC", "primary")).rejects.toThrow(/mapping/i);
  const incomplete = { ...result, form7206: { ...result.form7206!, calculationComplete: false } };
  await expect(fillForm7206(input, incomplete, blank, "scheduleC", "primary")).rejects.toThrow(/complete|audited/i);
});

it("preserves original cents and source facts in a paginated review appendix", async () => {
  const input = fixture();
  input.form7206!.plans![0]!.payments = Array.from({ length: 36 }, (_, index) => ({ ...input.form7206!.plans![0]!.payments![0], sourceId: `actual-premium-${index}` }));
  const result = calculateFederalTax(input), doc = await fillForm7206(input, result, blank, "scheduleC", "primary");
  expect(doc.getPageCount()).toBeGreaterThan(2);
  expect(result.form7206!.paidSourcePremiums.toFixed()).toBe("21603.6");
  expect(field(doc, "line1")).toBe("21604"); expect(field(doc, "line14")).toBe("21604");
  expect(doc.getSubject()).toBe("FOR REVIEW ONLY - NOT FOR FILING");
  const physical = inspectPdf(await doc.save()); const content = physical.pages.join(" ");
  expect(content).toContain("original premium $600.10"); expect(content).toContain("actual-premium-35");
  expect(content).toContain("exact calculations"); expect(content).toContain("2025-01-15");
  for (const page of physical.pages) expect(page).toContain("FOR REVIEW ONLY - NOT FOR FILING");
  input.form7206!.plans![0]!.payments![0]!.datePaid = "2025-02-01";
  const different = { ...result, form7206: { ...result.form7206!, grossSourcePremiums: d(1) } };
  await expect(fillForm7206(input, different, blank, "scheduleC", "primary")).rejects.toThrow(/source|reconcile/i);
});

it("attaches a separate actual form for each business without duplicating legacy summaries", async () => {
  const input = fixture(); const first = input.form7206!.plans![0]!;
  const second = { ...first, planId: "other-medical", businessSourceId: "formW2:0", businessKind: "s_corporation", moreThanTwoPercentShareholder: true, premiumsIncludedInOwnerIncome: true,
    payments: first.payments!.map(payment => ({ ...payment, sourceId: "other-premium", personAmounts: payment.personAmounts!.map(person => ({ ...person, payer: "business_paid_or_reimbursed" })) })) };
  input.form7206!.plans!.push(second as NonNullable<NonNullable<TaxYearInput["form7206"]>["plans"]>[number]);
  const result = calculateFederalTax(input), outputDir = await mkdtemp(join(tmpdir(), "tax-engine-7206-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir, flatten: false });
    const forms = packet.filledForms.filter(path => /form-7206-.*\.pdf$/.test(path));
    const incomplete = { ...result, form7206: { ...result.form7206!, businesses: [] } };
    await expect(fillReturn(input, incomplete, { blankFormsDir: "forms/blank", outputDir, flatten: false })).rejects.toThrow(/source|business|calculation/i);
    expect(forms).toHaveLength(2); expect(packet.filledForms.some(path => /se-health-insurance/.test(path))).toBe(false);
    const amounts = await Promise.all(forms.map(async path => field(await PDFDocument.load(await readFile(path)), "line14")));
    expect(amounts).toEqual(["600", "600"]); expect(result.form7206!.deductionToSchedule1.toFixed()).toBe("1200");
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

it("rejects stale ordinary business and shareholder wage sources", async () => {
  for (const corporate of [false, true]) {
    const input = fixture(corporate), result = calculateFederalTax(input), source = corporate ? "formW2:0" : "scheduleC";
    if (corporate) input.w2s[0].medicareWages = new Decimal(input.w2s[0].medicareWages!).plus(1).toFixed();
    else input.scheduleC!.grossReceipts = "50001";
    await expect(fillForm7206(input, result, blank, source, "primary")).rejects.toThrow(/source|reconcil|income/i);
  }
});
