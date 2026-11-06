// Spec: spec/federal/qbi-source-deductions.yaml
import { describe,it,expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
describe("Federal QBI source attribution",()=>{
  it("deducts a partner's SE tax from the entity's reported QBI",()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],scheduleK1:[{
      partnershipName:"Actual partnership",partnershipEIN:"12-3456789",ordinaryIncome:"50000",
      section199AQBI:"50000",selfEmploymentEarnings:"50000",isPassiveActivity:false,atRiskAmount:"100000",
    }]});
    const r=calculateFederalTax(input);
    expect(r.scheduleSE.deductibleHalf.toString()).toBe("3533");
    expect(r.form8995?.totalQBI.toString()).toBe("46467");
  });
  it("reduces sole-proprietor QBI by allowed retirement contributions",()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,w2s:[],scheduleC:{grossReceipts:"100000"},adjustments:{seRetirementContributions:"10000"}});
    const r=calculateFederalTax(input);
    expect(r.form8995?.totalQBI.toString()).toBe("82935");
    expect(r.form8995?.qbiComponent.toString()).toBe("16587");
  });
  it("forwards actual source allocations without defaulting missing deduction amounts",()=>{
    const row={sourceId:"scheduleC",accountHolder:"primary",deductibleSelfEmploymentTax:"7065",selfEmployedHealthInsurance:"0",selfEmployedRetirementPlans:"10000"};
    const base={...simpleW2Fixture,w2s:[],scheduleC:{grossReceipts:"100000"},adjustments:{seRetirementContributions:"10000"},
      qbiDeductionAllocations:{sourceFactsConfirmed:true,rows:[row]}};
    const input=TaxYearInputSchema.parse(base);
    expect(calculateFederalTax(input).form8995?.totalQBI.toString()).toBe("82935");
    expect(input.qbiDeductionAllocations?.rows[0].selfEmployedHealthInsurance).toBe("0");
    const {selfEmployedHealthInsurance:_missingHealth,...missing}=row;
    expect(TaxYearInputSchema.safeParse({...base,qbiDeductionAllocations:{sourceFactsConfirmed:true,rows:[missing]}}).success).toBe(false);
  });
});
