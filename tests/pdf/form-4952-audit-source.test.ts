/** Printed source mapping: spec/federal/form-4952.yaml. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_4952_2026_SOURCE } from "@/pdf/mappings/2026/form-4952-source.js";
import { PDFDocument } from "pdf-lib";
import { Form4952InputSchema, TaxYearInputSchema } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateForm4952 } from "@/engine/forms/form-4952.js";
import { fillForm4952, FORM_4952_FIELDS as F } from "@/pdf/fill-form-4952.js";

const input = TaxYearInputSchema.parse({ taxpayer: { taxYear: 2025, filingStatus: "single", primary: { firstName:"Sample",lastName:"Investor",ssn:"111-22-3333",dateOfBirth:"1980-01-01" }, address:{street:"1TestSt",city:"Test",state:"PA",zip:"19000"},dependents:[] } });
function result(electedNetCapitalGain?: string) {
  const form4952 = calculateForm4952(Form4952InputSchema.parse({ sourceTaxYear:2025, sourceReference:"synthetic4952",sourceFactsConfirmed:true, investmentInterestExpense:"16000",priorYearDisallowed:"2000",priorYearSourceTaxYear:2024,grossInvestmentIncome:"12000",qualifiedDividendsIncluded:"4000",netGainFromInvestmentProperty:"9000",netCapitalGainFromInvestmentProperty:"6000",electedPreferentialIncome:"2500",investmentExpenses:"500",investmentExpensesDeductibleConfirmed:true, electedNetCapitalGain }),2025);
  return { taxYear:2025, form4952 } as TaxReturnResult;
}
const template = "forms/blank/2025/f4952.pdf";
describe("Form4952 audited physical mapping", () => {
  it("rejects a missing audited calculation before creating an identified blank", async () => {
    await expect(fillForm4952(input,{ taxYear:2025 } as TaxReturnResult,template)).rejects.toThrow(/audit/i);
  });
  it("copies every canonical audit line to the matching printed field", async () => {
    const filled = await fillForm4952(input,result(),template);
    const saved = await PDFDocument.load(await filled.save());
    const expected = {line1:"16000",line2:"2000",line3:"18000",line4a:"12000",line4b:"4000",line4c:"8000",line4d:"9000",line4e:"6000",line4f:"3000",line4g:"2500",line4h:"13500",line5:"500",line6:"13000",line7:"5000",line8:"13000"} as const;
    for(const [key,value] of Object.entries(expected)) expect(saved.getForm().getTextField(F[key as keyof typeof expected]).getText(),key).toBe(value);
  });
  it("preserves the actual Elec allocation annotation and review notice", async () => {
    const doc=await fillForm4952(input,result("2000"),template);
    const bytes=await doc.save();
    const pages=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", "import sys,json,io; from pypdf import PdfReader; print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"], { input:bytes, encoding:"utf8" })) as string[];
    expect(pages[0]).toContain("Elec. 2000");
    expect(pages[0]).toContain("filing qualification pending");
    const saved=await PDFDocument.load(bytes);
    expect(saved.getSubject()).toBe(REVIEW_PDF_NOTICE);
    expect(saved.getForm().getTextField(F.line4e).getText()).toBe("6000");
    expect(saved.getForm().getTextField(F.line4g).getText()).toBe("2500");
  });
  it("rejects missing duplicate invalid and inconsistent audits", async () => {
    for (const kind of ["missing","duplicate","nonfinite","negative","mismatch"] as const) {
      const value=result(); const form=value.form4952;
      if (!form) throw new Error("Synthetic fixture has no4952 calculation");
      const index=form.lines.findIndex(line=>line.form==="Form 4952"&&line.line==="4e");
      if(kind==="missing") form.lines.splice(index,1);
      if(kind==="duplicate") form.lines.push({...form.lines[index]});
      if(kind==="nonfinite") form.lines[index]={...form.lines[index],value:new Decimal(NaN)};
      if(kind==="negative") form.lines[index]={...form.lines[index],value:new Decimal(-1)};
      if(kind==="mismatch") form.line4e=new Decimal(7000);
      await expect(fillForm4952(input,value,template),kind).rejects.toThrow(/audit/i);
    }
  });
  it("pins the final2026 revision with its own physical field identifiers", async () => {
    const bytes=await readFile("forms/blank/2026/f4952.pdf");
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(FORM_4952_2026_SOURCE.sha256);
    const document=await PDFDocument.load(bytes);
    expect(document.getPages()).toHaveLength(4);
    for(const field of Object.values(FORM_4952_2026_SOURCE.fields)) expect(document.getForm().getTextField(field)).toBeDefined();
    expect(FORM_4952_2026_SOURCE.fields.line1).not.toBe(F.line1);
    expect(() => document.getForm().getTextField(F.line1)).toThrow();
    expect(FORM_4952_2026_SOURCE.filingQualified).toBe(false);
  });
  it("rejects a return-year mismatch and keeps the2026 export gate closed", async () => {
    const value=result();
    if (!value.form4952) throw new Error("Synthetic fixture has no4952 calculation");
    value.form4952.taxYear=2026;
    await expect(fillForm4952(input,value,template)).rejects.toThrow(/year/i);
    const next={...input,taxpayer:{...input.taxpayer,taxYear:2026}};
    await expect(fillForm4952(next,{...value,taxYear:2026},"forms/blank/2026/f4952.pdf")).rejects.toThrow(/2026|unavailable|qualified/i);
  });
});
