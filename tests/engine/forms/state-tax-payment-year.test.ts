// Spec: spec/federal/schedule-a.yaml line5a-payment-year
import {describe,it,expect} from "vitest";
import {calculateScheduleA} from "@/engine/schedules/schedule-a.js";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {getConstants} from "@/models/constants.js";
import {d} from "@/utils/decimal.js";
import {simpleW2Fixture} from "../../fixtures/simple-w2.js";
const record=(date:string,amount:string,type="state")=>({date,amount,type,state:"CA"});
describe("State tax payment calendar year",()=>{
  it("deducts state payments by actual calendar year and preserves applied prior credits",()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{estimatedTaxPayments:[record("2025-01-15","1000"),record("2025-12-31","2000"),record("2026-01-15","4000"),record("2024-12-31","8000"),record("2025-06-15","16000","federal")],extensionPayments:[record("2025-04-15","500"),record("2026-04-15","900")],priorYearAppliedCredits:[{sourceTaxYear:2024,amount:"250",type:"state",state:"CA"}]}});
    const result=calculateScheduleA(input,d("85000"),"single",getConstants(2025));
    expect(result.lines.find(l=>l.line==="5a")?.value.toString()).toBe("3750");
    const federal=calculateFederalTax(input);
    expect(federal.allLines.find(l=>l.form==="Sched A"&&l.line==="5a")?.value.toString()).toBe("3750");
    const compared=calculateFederalTax(TaxYearInputSchema.parse({...input,salesTaxDeduction:{state:"CA",method:"actual",actualGeneralSalesTax:"4000",autoCompare:true}}));
    expect(compared.allLines.find(l=>l.form==="Sched A"&&l.line==="5a")?.value.toString()).toBe("4000");
    for(const badDate of ["","2025-02-30","2025-1-01"]){
      const bad=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{estimatedTaxPayments:[record(badDate,"1000")]}});
      expect(()=>calculateScheduleA(bad,d("85000"),"single",getConstants(2025))).toThrow(/actual.*payment date/i);
    }
    const old=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{priorYearAppliedCredits:[{sourceTaxYear:2023,amount:"250",type:"state",state:"CA"}]}});
    expect(()=>calculateScheduleA(old,d("85000"),"single",getConstants(2025))).toThrow(/applied.*source year/i);
  });
});
