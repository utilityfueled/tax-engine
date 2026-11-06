// Specs: spec/federal/form-1040.yaml; spec/federal/schedule-2.yaml
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateSchedule2 } from "@/engine/schedules/schedule-2.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const d = (v: string) => new Decimal(v);
describe("Schedule 2 official line routing", () => {
  it("routes Part I to line 17, only Part II to line 23 and no estimated-tax penalty", () => {
    const r = calculateSchedule2({ amt:d("2000"), excessAPTCRepayment:d("500"), selfEmploymentTax:d("1000"), additionalMedicareTax:d("100"), niitTax:d("50"), hsaAdditionalTax:d("20"), hsaRecaptureTax:d("30"), estimatedTaxPenalty:d("900") });
    const line = (id:string) => r.lines.find(l=>l.line===id)?.value.toString();
    expect(line("1a")).toBe("500"); expect(line("2")).toBe("2000");
    expect(line("3")).toBe("2500"); expect(line("18")).toBe("50");
    expect(line("21")).toBe("1200"); expect(r.totalAdditionalTaxes.toString()).toBe("1200");
  });
});
describe("Form 1040 payment and penalty routing", () => {
  const run = (withheld:string, estimated?:string) => calculateFederalTax(TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s:[{...simpleW2Fixture.w2s[0], federalWithheld:withheld}], adjustments: estimated ? { estimatedTaxPayments:[{date:"2026-01-15", amount:estimated, type:"federal"}] } : undefined }));
  it("excludes penalty from total tax and includes it in the amount owed", () => {
    const r=run("0");
    expect(r.estimatedTaxPenalty.gt(0)).toBe(true);
    expect(r.totalAdditionalTaxes.toString()).toBe("0");
    expect(r.totalTax.eq(r.totalTaxBeforeCredits)).toBe(true);
    expect(r.amountOwed.eq(r.totalTax.plus(r.estimatedTaxPenalty).minus(r.totalPayments))).toBe(true);
    expect(r.allLines.find(l=>l.form==="1040"&&l.line==="38")?.value.eq(r.estimatedTaxPenalty)).toBe(true);
  });
  it("keeps refundable AOC on line 29 and out of line 31", () => {
    const r=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture, educationExpenses:{aocStudents:[{name:"Actual student",qualifiedExpenses:"4000"}],llcExpenses:"0"}}));
    expect(r.allLines.find(l=>l.form==="1040"&&l.line==="29")?.value.toString()).toBe("500");
    expect(r.allLines.find(l=>l.form==="1040"&&l.line==="31")?.value.toString()).toBe("0");
  });
  it("gives the digital-asset response a distinct audit identity", () => {
    const r=run("12750");
    expect(r.allLines.find(l=>l.form==="1040"&&l.line==="digital-asset")).toBeDefined();
    expect(r.allLines.filter(l=>l.form==="1040"&&l.line==="1a").some(l=>l.description.includes("Digital"))).toBe(false);
  });
});
