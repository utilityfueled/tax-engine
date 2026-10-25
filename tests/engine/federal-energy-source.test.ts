// Spec: spec/federal/energy-return-sources.yaml
import {describe,it,expect} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
import {energyHome,energySource,sourceImprovement} from "../fixtures/energy-source.js";
describe("Federal energy source integration",()=>{
  it("retains actual joint filing status through both energy computations",()=>{
    const secondHome={...energyHome,id:"home-b",owner:"spouse",mainHomeFor:"spouse",address:{...energyHome.address,street:"54 Separate Home"}};
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,
      taxpayer:{...simpleW2Fixture.taxpayer,filingStatus:"married_filing_jointly",spouse:{firstName:"Alex",lastName:"Doe",ssn:"987-65-4321",dateOfBirth:"1990-01-01"}},
      w2s:[{...simpleW2Fixture.w2s[0],accountHolder:"primary",socialSecurityTips:"0"}],
      energyCredits:{...energySource,homes:[energyHome,secondHome],separateSpousalMainHomes:true,cleanEnergyProperties:[],qualifiedImprovements:[
        {...sourceImprovement,sourceId:"heat-a",category:"heat_pump",qualifiedCost:"10000"},
        {...sourceImprovement,sourceId:"heat-b",homeId:"home-b",category:"heat_pump",qualifiedCost:"10000"},
      ]}});
    const result=calculateFederalTax(input);
    expect(result.form5695?.sourceFactsVerified).toBe(true);
    expect(result.form5695?.improvementHomes).toHaveLength(2);
    expect(result.form5695?.energyImprovementCredit.toString()).toBe("4000");
    expect(result.form5695?.residentialCleanEnergyCredit.toString()).toBe("0");
  });
});
