// Spec: spec/federal/schedule-k-1-1041.yaml
import {describe,it,expect} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {fillScheduleA,SCHEDULE_A_FIELDS as F} from "@/pdf/fill-schedule-a.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
describe("ScheduleA estate deduction review",()=>{
  it("prints estate and gambling deductions exactly once",async()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,scheduleA:{gamblingLosses:"2000"},
      formW2G:[{payer:"Synthetic casino",reportableWinnings:"5000"}],
      scheduleK1Form1041:[{estateTrustName:"Synthetic estate",estateTrustEIN:"11-1111111",estateTaxDeduction:"3000"}]});
    const doc=await fillScheduleA(input,calculateFederalTax(input),"forms/blank/2025/f1040sa.pdf");
    expect(doc.getForm().getTextField(F.line16).getText()).toBe("5000");
    expect(doc.getForm().getTextField(F.line16Desc).getText()).toContain("Estate tax");
    expect(doc.getForm().getTextField(F.line17).getText()).toBe("5000");
  });
});
