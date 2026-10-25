// Spec: spec/federal/form-6251.yaml
import {describe,it,expect} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {fillForm6251,FORM_6251_FIELDS as F} from "@/pdf/fill-form-6251.js";
import {formatCurrency} from "@/pdf/pdf-utils.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
const path="forms/blank/2025/f6251.pdf";
describe("Form6251 audited review fields",()=>{
  it("prints actual standard and senior adjustments and regular tax",async()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,primary:{...simpleW2Fixture.taxpayer.primary,dateOfBirth:"1950-01-01"}},
      schedule1A:{employeeTips:[],businessTips:[],overtime:[],vehicleLoans:[],primarySsnEligible:true,excludedPuertoRicoIncome:"0",form4563Exclusion:"0",seniorOwners:["primary"]}});
    const r=calculateFederalTax(input);
    const doc=await fillForm6251(input,r,path),form=doc.getForm();
    // AGI85000; standard17750, senior5400;1a17750,1b67250;2a17750.
    expect(form.getTextField(F.line1a).getText()).toBe("17750");
    expect(form.getTextField(F.line1b).getText()).toBe("67250");
    expect(form.getTextField(F.line2a).getText()).toBe("17750");
    expect(form.getTextField(F.line4).getText()).toBe("85000");
    const line10=r.form6251?.lines.find(line=>line.line==="10")?.value;
    expect(line10).toBeDefined();
    if(!line10)throw new Error("Missing actual regular-tax audit");
    expect(form.getTextField(F.line10).getText()).toBe(formatCurrency(line10));
  });
  it("rejects duplicate and inconsistent audited amounts",async()=>{
    const r=calculateFederalTax(simpleW2Fixture);
    if(!r.form6251)throw new Error("Missing calculation");
    const row=r.form6251.lines.find(line=>line.line==="11");
    if(!row)throw new Error("Missing audit");
    await expect(fillForm6251(simpleW2Fixture,{...r,form6251:{...r.form6251,lines:[...r.form6251.lines,row]}},path).then(()=>undefined)).rejects.toThrow(/unique|duplicate/i);
    await expect(fillForm6251(simpleW2Fixture,{...r,form6251:{...r.form6251,amt:r.form6251.amt.plus(1)}},path).then(()=>undefined)).rejects.toThrow(/reconcile|match/i);
  });
});
