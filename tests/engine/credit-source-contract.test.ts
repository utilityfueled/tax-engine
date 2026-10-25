// Spec: spec/federal/form-1040.yaml, credit-source-contract.
import {describe,it,expect} from "vitest";
import {Form8839Schema,Form8936Schema} from "@/models/inputs.js";
describe("Personal credit source contracts",()=>{
  it("keeps missing prior AGI distinct from known zero",()=>{
    expect(Form8936Schema.parse({}).priorYearAgi).toBeUndefined();
    expect(Form8936Schema.parse({priorYearAgi:"0"}).priorYearAgi).toBe("0");
  });
  it("preserves actual vehicle dates, transfer and MAGI facts",()=>{
    const vehicle={dateAcquired:"2025-09-30",criticalMineralsRequirementMet:true,batteryComponentsRequirementMet:true,msrp:"45000",vehicleType:"other",personalUsePercentage:"100",creditTransferredToDealer:true,vin:"1TEST234567890123",datePlacedInService:"2026-01-02",bindingContractDate:"2025-09-29",paymentDate:"2025-09-30",bindingContractConfirmed:true,sellerReportReceived:true,sellerReportCreditAmount:"7500",eligibilityConfirmed:true,creditTransferredAmount:"7500",powertrain:"battery"};
    const r=Form8936Schema.parse({newCleanVehicles:[vehicle],agiAdjustmentsConfirmed:true,possessionIncomeExclusion:"0"});
    expect(r.newCleanVehicles[0]).toMatchObject({...vehicle,sourceFactsComplete:true});
    expect(r.agiAdjustmentsConfirmed).toBe(true);
  });
  it("does not accept a forged completeness marker when original legacy facts are omitted",()=>{
    const r=Form8936Schema.parse({newCleanVehicles:[{dateAcquired:"2025-09-30",criticalMineralsRequirementMet:true,batteryComponentsRequirementMet:true,sourceFactsComplete:true}]});
    expect(r.newCleanVehicles[0].sourceFactsComplete).toBe(false);
  });
  it("keeps original missing vehicle and adoption facts incomplete after reparsing",()=>{
    // Spec: spec/federal/form-1040.yaml, credit-source-reparse.
    const vehicles=Form8936Schema.parse({newCleanVehicles:[{dateAcquired:"2025-09-30",criticalMineralsRequirementMet:true,batteryComponentsRequirementMet:true}],previouslyOwnedCleanVehicles:[{dateAcquired:"2025-09-30"}]});
    const reparsed=Form8936Schema.parse(vehicles);
    expect(reparsed.newCleanVehicles[0].sourceFactsComplete).toBe(false);
    expect(reparsed.previouslyOwnedCleanVehicles[0].sourceFactsComplete).toBe(false);
    const adoption=Form8839Schema.parse({children:[{childName:"Synthetic source"}]});
    expect(adoption.children[0].sourceFactsComplete).toBe(false);
    expect(Form8839Schema.parse(adoption).children[0].sourceFactsComplete).toBe(false);
    const explicit=Form8839Schema.parse({children:[{childName:"Synthetic source",isSpecialNeeds:false,isForeignAdoption:false,employerBenefits:"0",priorYearCreditsClaimed:"0",priorYearExclusionsClaimed:"0"}]});
    expect(Form8839Schema.parse(explicit).children[0].sourceFactsComplete).toBe(true);
  });
  it("preserves actual adoption year, expenses, exclusion worksheet and carryforward origin",()=>{
    const r=Form8839Schema.parse({eligibilityConfirmed:true,exclusionMagi:"120000",possessionIncomeExclusion:"0",carryforwards:[{originTaxYear:2025,amount:"1000"}],carryforwardReconciled2025:true,children:[{childName:"Synthetic",adoptionFinalizedYear:2026,expensesByYear:[{year:2026,amount:"10000"}],employerPlanQualified:true,priorYearForeignBenefits:"0"}]});
    expect(r).toMatchObject({eligibilityConfirmed:true,exclusionMagi:"120000",carryforwards:[{originTaxYear:2025,amount:"1000"}],carryforwardReconciled2025:true});
    expect(r.children[0]).toMatchObject({adoptionFinalizedYear:2026,expensesByYear:[{year:2026,amount:"10000"}],employerPlanQualified:true,priorYearForeignBenefits:"0"});
  });
});
