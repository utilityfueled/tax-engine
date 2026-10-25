import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleA, SCHEDULE_A_FIELDS as F } from "@/pdf/fill-schedule-a.js";
import { prepareCharitableReview } from "@/pdf/charitable-review-context.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { charityReportingFixture } from "../fixtures/charity-reporting.js";
const blank = "forms/blank/2025/f1040sa.pdf";

describe("ScheduleA charity source reporting review", () => {
  // Spec: schedule-a-charity-reporting.yaml exact-review-conservation.
  it("rejects changed retained cents and missing exact audit evidence before rendering", async () => {
    const input = charityReportingFixture(); const result = calculateFederalTax(input);
    const sa = result.scheduleA;
    const changedResults = [
      { ...sa, cashCharitable: sa.cashCharitable.minus("0.01") },
      { ...sa, nonCashCharitable: sa.nonCashCharitable.plus("0.01") },
      { ...sa, charitableCarryforwardDetail: sa.charitableCarryforwardDetail.map(row => ({ ...row, amountUsed: row.amountUsed.plus("0.01") })) },
    ];
    for (const scheduleA of changedResults) {
      await expect(fillScheduleA(input, { ...result, scheduleA }, "nonexistent-template.pdf")).rejects.toThrow(/charitable.*(audit|source|reconcile)/i);
    }
    for (const [number, exactKey] of [["11", "Exact current cash"], ["12", "Exact current noncash"], ["13", "Exact prior carry used"]] as const) {
      const actual = sa.lines.find(row => row.form === "Sched A" && row.line === number);
      if (!actual) throw new Error("Missing synthetic charity audit");
      for (const value of [undefined, "NaN", "0.01"]) {
        const inputs = { ...actual.inputs };
        if (value === undefined) delete inputs[exactKey]; else inputs[exactKey] = value;
        const lines = sa.lines.map(row => row === actual ? { ...row, inputs } : row);
        await expect(fillScheduleA(input, { ...result, scheduleA: { ...sa, lines } }, "nonexistent-template.pdf")).rejects.toThrow(/charitable.*audit/i);
      }
    }
    for (const number of ["cash", "noncash"]) {
      const actual = sa.lines.find(row => row.form === "Charitable Computation" && row.line === number);
      if (!actual) throw new Error("Missing synthetic charity computational audit");
      for (const lines of [sa.lines.filter(row => row !== actual), [...sa.lines, actual],
        sa.lines.map(row => row === actual ? { ...row, value: row.value.plus("0.01") } : row)]) {
        await expect(fillScheduleA(input, { ...result, scheduleA: { ...sa, lines } }, "nonexistent-template.pdf")).rejects.toThrow(/charitable.*audit/i);
      }
    }
  });
  // Spec: schedule-a-charity-reporting.yaml saved-review.
  it("preserves source-separated charity lines in reopened review fields and appearances", async () => {
    const input = charityReportingFixture(); const result = calculateFederalTax(input);
    const doc = await fillScheduleA(redactReviewIdentifiers(input), result, blank, prepareCharitableReview(input));
    const bytes = await doc.save(); const reopened = await PDFDocument.load(bytes);
    const expected = { [F.line11]: "20000", [F.line12]: "10001", [F.line13]: "1234", [F.line14]: "31235", [F.line17]: "31235" };
    for (const [key, value] of Object.entries(expected)) expect(reopened.getForm().getTextField(key).getText()).toBe(value);
    const inspected = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import io,json,sys
from pypdf import PdfReader
reader=PdfReader(io.BytesIO(sys.stdin.buffer.read())); widgets={}
for page in reader.pages:
 for ref in page.get('/Annots',[]):
  obj=ref.get_object()
  if obj.get('/Subtype')!='/Widget': continue
  chain=[]; node=obj
  while node is not None:
   chain.append(node); parent=node.get('/Parent'); node=parent.get_object() if parent else None
  key='.'.join(str(item['/T']) for item in reversed(chain) if '/T' in item)
  value=next((str(item['/V']) for item in chain if '/V' in item),'')
  appearance=obj.get('/AP',{}).get('/N'); stream=appearance.get_object() if appearance else None
  widgets[key]={'value':value,'appearance':bool(stream and hasattr(stream,'get_data') and stream.get_data())}
print(json.dumps({'widgets':widgets,'pages':[page.extract_text() or '' for page in reader.pages]}))
`], { input: bytes, encoding: "utf8" })) as { widgets: Record<string, { value: string; appearance: boolean }>; pages: string[] };
    for (const [key, value] of Object.entries(expected)) expect(inspected.widgets[key]).toEqual({ value, appearance: true });
    for (const page of inspected.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
    expect(inspected.pages.join(" ")).not.toContain("123-45-6789");
    expect(input.taxpayer.primary.ssn).toBe("123-45-6789");
  });
  // Spec: schedule-a-charity-reporting.yaml review-source.
  it("rejects missing conflicting and stale same-total charity sources before rendering", async () => {
    const input = charityReportingFixture(); const result = calculateFederalTax(input);
    for (const line of ["11", "12", "13", "14"]) {
      const actual = result.scheduleA.lines.find(row => row.form === "Sched A" && row.line === line);
      expect(actual).toBeDefined();
      if (!actual) throw new Error("Missing synthetic charity audit");
      for (const lines of [result.scheduleA.lines.filter(row => row !== actual), [...result.scheduleA.lines, actual],
        result.scheduleA.lines.map(row => row === actual ? { ...row, value: row.value.plus(1) } : row)]) {
        await expect(fillScheduleA(input, { ...result, scheduleA: { ...result.scheduleA, lines } }, "nonexistent-template.pdf")).rejects.toThrow(/charit.*audit/i);
      }
    }
    const changed = structuredClone(input); changed.donations[0].amount = "20001.49";
    changed.priorYear.charitableCarryforward = "1233.49"; changed.priorYear.charitableCarryforwardByYear[0].amount = "1233.49";
    await expect(fillScheduleA(changed, result, "nonexistent-template.pdf")).rejects.toThrow(/charit.*source/i);
    const centsOnly = structuredClone(input); centsOnly.donations[0].amount = "20000.48";
    await expect(fillScheduleA(centsOnly, result, "nonexistent-template.pdf")).rejects.toThrow(/charit.*source/i);
  });
});
