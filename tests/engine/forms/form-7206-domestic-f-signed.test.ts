// Spec: spec/federal/form-7206-return.yaml, signed-domestic-f-source/facts.
import Decimal from "decimal.js";
import {expect,it} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {domesticFSignedHealthFixture} from "../../fixtures/domestic-f-signed-health.js";
it("uses proven domestic F zero without clamping signed C",()=>{
 const input=domesticFSignedHealthFixture(),r=calculateFederalTax(input);
 expect(r.form2555?.netExclusion.toFixed()).toBe("-568");
 expect(r.scheduleSE.deductibleHalf.toFixed()).toBe("778");
 expect(r.agi.toFixed()).toBe("10690");
 expect(r.form7206?.deductionToSchedule1.toFixed()).toBe("100");
 const farm=r.form7206?.businesses.find(b=>b.businessSourceId==="scheduleF");
 expect(farm?.ownerPositiveBusinessIncome?.toFixed()).toBe("11000");
 expect(farm?.allocatedSelfEmploymentTax?.toFixed()).toBe(new Decimal(778).div(11).toFixed());
 expect(farm?.attributableForeignExclusion?.toFixed()).toBe("0");
 expect(r.form7206?.lines.find(l=>l.line==="domestic-f-foreign-zero")?.value.toFixed()).toBe("0");
});
it("requires independent actual domestic farm evidence",()=>{
 const input=domesticFSignedHealthFixture();
 const proof=(input.form7206 as unknown as {domesticFarmSources:Record<string,unknown>}).domesticFarmSources;
 expect(proof).toBeDefined();
 for(const patch of [{sourceFactsConfirmed:false},{allIncomeDomesticConfirmed:false},{allIncomeDomesticConfirmed:undefined},{sourceReference:""},{sourceTaxYear:2026},{accountHolder:"spouse"},{principalCropOrActivity:"Other farm"},{ein:"99-9999999"},{noSelfEmployedRetirementDeductionConfirmed:false}]){
  const changed=structuredClone(input);Object.assign((changed.form7206 as unknown as {domesticFarmSources:Record<string,unknown>}).domesticFarmSources,patch);
  expect(()=>calculateFederalTax(changed)).toThrow(/domestic|source|method|retirement/i);
 }
});

it("retains the foreign-plan method and rejects incomplete or different compositions",()=>{
 for(const mutate of [
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{delete v.form7206!.domesticFarmSources;},
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{v.form7206!.plans![0]!.businessSourceId="scheduleC";},
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{delete v.adjustments!.seRetirementContributions;},
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{v.adjustments!.seRetirementContributions="1";},
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{v.scheduleF!.salesOfProductsRaised="0";},
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{v.form2555!.sourceMapping!.sourceFactsConfirmed=false;},
  (v:ReturnType<typeof domesticFSignedHealthFixture>)=>{v.form2555!.sourceMapping!.rows[0]!.allBusinessIncomeForeignConfirmed=false;},
 ]) {const v=domesticFSignedHealthFixture();mutate(v);expect(()=>calculateFederalTax(v)).toThrow();}
});
