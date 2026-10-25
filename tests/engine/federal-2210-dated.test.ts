// Spec: spec/federal/estimated-tax-integration.yaml
import { describe,it,expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const facts={calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
  calculationMethod:"regular",withholdingMethod:"equal-installments",priorYearTaxStatus:"no-return"};
const base=()=>({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],federalWithheld:"0"}]});
describe("Federal dated estimated-tax integration",()=>{
  it("does not erase earlier installment penalties with a late annual payment",()=>{
    const input=TaxYearInputSchema.parse({...base(),form2210:facts,adjustments:{estimatedTaxPayments:[{date:"2026-01-15",amount:"10000",type:"federal"}]}});
    const r=calculateFederalTax(input);
    expect(r.form2210?.installments.map(row=>row.required.toString())).toEqual(["2285","2285","2285","2285"]);
    // Published2025 single69250–69300 table row=10155;90% rounds9140.
    // First three installments unpaid275,214,122days:2285*611*7%/365=267.7519.
    expect(r.form2210?.penalty.toString()).toBe("268");
    expect(r.form2210?.sourceFactsVerified).toBe(true);
    expect(r.totalTax.toString()).toBe("10155");
    expect(r.allLines.find(line=>line.form==="1040"&&line.line==="38")?.value.toString()).toBe("268");
  });
  it("uses actual prior-credit dates and excludes state estimated payments",()=>{
    const input=TaxYearInputSchema.parse({...base(),form2210:{...facts,priorYearCreditPayments:[{date:"2025-04-15",amount:"10000"}]},
      adjustments:{priorYearAppliedCredits:[{sourceTaxYear:2024,type:"federal",amount:"10000"}],estimatedTaxPayments:[{date:"2025-04-15",type:"state",state:"CA",amount:"1000"}]}});
    expect(calculateFederalTax(input).form2210?.penalty.toString()).toBe("0");
    const invalid=TaxYearInputSchema.parse({...input,form2210:{...input.form2210,priorYearCreditPayments:[]}});
    expect(()=>calculateFederalTax(invalid)).toThrow(/reconcile/i);
  });
  it("excludes excess-contribution taxes from the estimated-tax base",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...base(),form5329:{traditionalIRACurrentYearExcessContributions:"1000",traditionalIRAValueDec31:"1000"}}));
    expect(r.form5329?.line17.toString()).toBe("60");
    expect(r.form2210?.lines.find(line=>line.line==="2")?.value.toString()).toBe("0");
    expect(r.totalTax.toString()).toBe("10215"); // Table10155 plus separate60excise tax.
  });
  it("excludes employee misclassification payroll tax from the estimated-tax base",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...base(),form8919:{wagesNotReportedOnW2:"1000"}}));
    expect(r.form8919?.line13.gt(0)).toBe(true);
    expect(r.form2210?.lines.find(line=>line.line==="2")?.value.toString()).toBe("0");
  });
  it("honors both conditions of the household-employment exception",()=>{
    const scheduleH={employees:[{name:"Synthetic worker",cashWages:"10000",isSpouse:false,isChildUnder21:false,isParent:false,isUnder18NonPrincipal:false}],futaApplies:true,futaSectionA:true};
    const noOtherIncome=calculateFederalTax(TaxYearInputSchema.parse({...base(),w2s:[],scheduleH}));
    expect(noOtherIncome.scheduleH?.totalTax.toString()).toBe("1572");
    expect(noOtherIncome.form2210?.lines.find(line=>line.line==="2")?.value.toString()).toBe("0");
    expect(noOtherIncome.form2210?.penalty.toString()).toBe("0");
    const requiredWithoutHousehold=calculateFederalTax(TaxYearInputSchema.parse({...base(),scheduleH}));
    expect(requiredWithoutHousehold.form2210?.lines.find(line=>line.line==="2")?.value.toString()).toBe("1572");
    const actualWithholding=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,scheduleH}));
    expect(actualWithholding.form2210?.lines.find(line=>line.line==="2")?.value.toString()).toBe("1572");
  });
  it("forwards extension payments as payments on their actual dates",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...base(),form2210:facts,
      adjustments:{extensionPayments:[{date:"2026-01-15",amount:"10000",type:"federal"}]}}));
    expect(r.form2210?.penalty.toString()).toBe("268");
    expect(r.form2210?.underpayment.toString()).toBe("0");
  });
});
