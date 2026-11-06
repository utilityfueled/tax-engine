// Spec: spec/federal/form-1040.yaml
import { describe,it,expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
describe("Form 1040 source classification",()=>{
  it("keeps W-2, 1099 and other withholding separate and includes Additional Medicare withholding",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:"300000",medicareWages:"300000",medicareWithheld:"5250",federalWithheld:"10000"}],form1099Int:[{payer:"Actual bank",interestIncome:"100",federalWithheld:"25"}],formSSA1099:[{recipient:"primary",netBenefits:"1000",federalWithheld:"50"}],formW2G:[{payer:"Actual casino",reportableWinnings:"1000",federalWithheld:"150"}]}));
    const line=(id:string)=>r.allLines.find(l=>l.form==="1040"&&l.line===id)?.value.toString();
    // Medicare withholding $5,250 minus 1.45% of $300,000 ($4,350) = $900.
    expect(line("25a")).toBe("10000"); expect(line("25b")).toBe("75"); expect(line("25c")).toBe("1050");
    expect(r.totalWithholding.toString()).toBe("11125");
    expect(line("1a")).toBe("300000");
  });
  it("preserves Additional Medicare withholding when the joint-return tax is zero",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,filingStatus:"married_filing_jointly",spouse:{firstName:"Actual",lastName:"Spouse",ssn:"999-88-7777",dateOfBirth:"1990-01-01"}},w2s:[{...simpleW2Fixture.w2s[0],wages:"225000",medicareWages:"225000",medicareWithheld:"3487.50",federalWithheld:"10000"}]}));
    // Whole-dollar Form 8959: line 19 $3,488 less line 21 $3,263 = $225.
    expect(r.additionalMedicareTax.toString()).toBe("0");
    expect(r.totalWithholding.toString()).toBe("10225");
  });
  it("routes reported K-1 federal withholding to other-form payments",()=>{
    const r=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,scheduleK1:[{partnershipName:"Actual partnership",partnershipEIN:"12-3456789",ordinaryIncome:"0",federalIncomeTaxWithheld:"75"}],scheduleK1Form1041:[{estateTrustName:"Actual trust",estateTrustEIN:"98-7654321",federalIncomeTaxWithheld:"25"}]}));
    expect(r.allLines.find(l=>l.form==="1040"&&l.line==="25c")?.value.toString()).toBe("100");
  });
});
