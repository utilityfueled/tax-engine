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
  it("prints actual AMT investment adjustment and complete capital-gain worksheet",async()=>{
    const source={sourceTaxYear:2025,sourceReference:"Synthetic actual investment source",sourceFactsConfirmed:true,
      investmentInterestExpense:"10000",priorYearDisallowed:"0",grossInvestmentIncome:"20000",qualifiedDividendsIncluded:"20000",
      netGainFromInvestmentProperty:"0",netCapitalGainFromInvestmentProperty:"0",electedPreferentialIncome:"5000",investmentExpenses:"0"};
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,deductionElection:"itemized",w2s:[{...simpleW2Fixture.w2s[0],wages:"150000"}],
      form1099Div:[{payer:"Synthetic broker",ordinaryDividends:"20000",qualifiedDividends:"20000"}],
      form4952:source,form4952Amt:{...source,grossInvestmentIncome:"23000"},
      amtCapitalGains:{sourceTaxYear:2025,sourceReference:"Synthetic actual AMT basis sources",sourceFactsConfirmed:true,
        qualifiedDividends:"20000",netCapitalGain:"0",section1250Gain:"0",collectiblesGain:"0"}});
    const r=calculateFederalTax(input);
    const doc=await fillForm6251(input,r,path),form=doc.getForm();
    expect(form.getTextField(F.line2c).getText()).toBe("(3000)");
    expect(form.getTextField(F.line13).getText()).toBe("15000");
    expect(form.getTextField(F.line20).getText()).toBe("150000");
    expect(form.getTextField(F.line27).getText()).toBe("150000");
    expect(form.getTextField(F.line40).getText()).toBe("17564");
    if(!r.form6251)throw new Error("Missing actual AMT result");
    const bad={...r,form6251:{...r.form6251,lines:r.form6251.lines.map(l=>l.line==="40"?{...l,value:l.value.plus(1)}:l)}};
    await expect(fillForm6251(input,bad,path)).rejects.toThrow(/reconcile|PartIII/i);
  });

});
