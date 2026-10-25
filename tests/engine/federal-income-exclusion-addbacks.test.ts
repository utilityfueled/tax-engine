// Spec: spec/federal/social-security-benefits-worksheet.yaml and form-1040.yaml.
import {describe,it,expect} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
const fixture=(overrides:Record<string,unknown>={})=>TaxYearInputSchema.parse({...simpleW2Fixture,...overrides});
const wage=(amount:string)=>({...simpleW2Fixture.w2s[0],wages:amount,socialSecurityWages:amount,medicareWages:amount});
const adoption={exclusionMagi:"30000",children:[{childName:"Synthetic",isSpecialNeeds:false,isForeignAdoption:false,adoptionBecameFinal:true,qualifiedExpenses:"0",employerBenefits:"20000",priorYearCreditsClaimed:"0",priorYearExclusionsClaimed:"0",employerPlanQualified:true}]};
const bondSources={form1099Int:[{payer:"Treasury",interestIncome:"0",usSavingsBondInterest:"2000"}],savingsBondRedemptions:[{proceeds:"10000",interest:"2000",qualifiedExpenses:"10000"}]};
describe("Income exclusion worksheet addbacks",()=>{
  it("restores actual foreign and adoption exclusions for Social Security benefits",()=>{
    const foreign=calculateFederalTax(fixture({formSSA1099:[{netBenefits:"20000"}],form2555:{foreignEarnedIncome:"85000",qualifyingDays:365}}));
    expect(foreign.socialSecurityBenefitsTaxable.toString()).toBe("17000");
    expect(foreign.socialSecurityBenefitsWorksheet?.lines.find(l=>l.form==="Pub915 WS1"&&l.line==="5")?.value.toString()).toBe("85000");
    expect(foreign.socialSecurityBenefitsWorksheet?.lines.find(l=>l.form==="Pub915 WS1"&&l.line==="19")?.value.toString()).toBe("17000");
    const adopted=calculateFederalTax(fixture({w2s:[wage("10000")],form8839:adoption,formSSA1099:[{netBenefits:"20000"}]}));
    expect(adopted.form8839?.allowableExclusion.toString()).toBe("17280");
    // Other12720 + half benefits10000 + exclusion17280 =40000.
    // min(20000*.85,4500+(40000-34000)*.85)=9600.
    expect(adopted.socialSecurityBenefitsTaxable.toString()).toBe("9600");
  });
  it("restores actual foreign and adoption exclusions for savings bond MAGI",()=>{
    const foreign=calculateFederalTax(fixture({...bondSources,w2s:[wage("105000")],form2555:{foreignEarnedIncome:"100000",qualifyingDays:365}}));
    expect(foreign.form8815?.modifiedAGI.toString()).toBe("107000");
    expect(foreign.form8815?.excludableSavingsBondInterest.toString()).toBe("1000");
    const adopted=calculateFederalTax(fixture({...bondSources,w2s:[wage("100000")],form8839:{...adoption,exclusionMagi:"120000"}}));
    expect(adopted.form8815?.modifiedAGI.toString()).toBe("122000");
    expect(adopted.form8815?.excludableSavingsBondInterest.toString()).toBe("0");
  });
  it("includes actual farm income in Social Security and savings bond MAGI",()=>{
    const result=calculateFederalTax(fixture({...bondSources,w2s:[],scheduleF:{salesOfProductsRaised:"100000",expenses:{}},formSSA1099:[{netBenefits:"20000"}]}));
    expect(result.socialSecurityBenefitsTaxable.toString()).toBe("17000");
    expect(result.form8815?.modifiedAGI.toString()).toBe("111935");
  });
});
