// Spec: spec/federal/form-7206-return.yaml, signed-domestic-f-facts.
import {expect,it} from "vitest";
import {buildHealthInsuranceInput,invalidateHealthInsuranceSources,healthInsuranceSourceErrors,emptyHealthInsuranceFacts,type HealthInsuranceData} from "@/lib/guided-health-insurance-facts";
import {emptyAdjustmentData,updateSectionData} from "@/lib/guided-interview-flow";
import {startCompleteInterview,completeBusinessSection} from "./complete-facts";
it("retains unknown and false domestic proof and revokes confirmations on source edits",()=>{
 const data:HealthInsuranceData={...emptyHealthInsuranceFacts,sourceTaxYear:"2025",sourceReference:"Actual known empty plans ledger",sourceFactsConfirmed:true,allPlansIncluded:true};data.domesticFarmSources={sourceTaxYear:"2025",sourceReference:"Actual US-only farm ledger",sourceFactsConfirmed:true,businessSourceId:"scheduleF",accountHolder:"primary",principalCropOrActivity:"Vegetables",ein:"12-2222222",allIncomeDomesticConfirmed:false,noSelfEmployedRetirementDeductionConfirmed:true};
 expect(buildHealthInsuranceInput(data,"single",2025)?.domesticFarmSources?.allIncomeDomesticConfirmed).toBe(false);
 data.domesticFarmSources.allIncomeDomesticConfirmed=null;
 expect(buildHealthInsuranceInput(data,"single",2025)?.domesticFarmSources?.allIncomeDomesticConfirmed).toBeUndefined();
 const invalid=invalidateHealthInsuranceSources(data);expect(invalid.domesticFarmSources?.sourceFactsConfirmed).toBeNull();expect(invalid.domesticFarmSources?.sourceReference).toBe("Actual US-only farm ledger");
 const state=startCompleteInterview({filingStatus:"single",incomeTypes:["self-employment"],lifeEvents:[],stateCode:null});
 state.sectionData["income-self-employment"]=structuredClone(completeBusinessSection);
 state.sectionData.adjustments={...emptyAdjustmentData,healthInsuranceFacts:data};
 expect(healthInsuranceSourceErrors(state).healthInsuranceBusiness).toMatch(/cannot originate Schedule F/);
 const changed=updateSectionData(state,"income-self-employment",{...completeBusinessSection,manualGrossReceipts:"50001"});
 expect(changed.sectionData.adjustments?.healthInsuranceFacts?.domesticFarmSources?.sourceFactsConfirmed).toBeNull();
 expect(changed.sectionData.adjustments?.healthInsuranceFacts?.domesticFarmSources?.ein).toBe("12-2222222");
});
