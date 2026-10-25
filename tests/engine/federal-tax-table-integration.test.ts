// Spec: spec/federal/tax-table.yaml, official IRS1040 and ScheduleJ instructions.
import {describe,it,expect} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {calculateForm8615} from "@/engine/forms/form-8615.js";
import {calculateScheduleJ} from "@/engine/forms/schedule-j.js";
import {getConstants} from "@/models/constants.js";
import {FEDERAL_2026_CONSTANTS} from "@/models/federal-2026-indexed.js";
import {d} from "@/utils/decimal.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
describe("Tax Table return routing",()=>{
  it("uses the published table for Form1040 and foreign exclusions",()=>{
    const r=calculateFederalTax(simpleW2Fixture);
    expect(r.taxableIncome.toString()).toBe("69250");
    expect(r.totalTaxBeforeCredits.toString()).toBe("10155"); // Published69250–69300.
    expect(r.incomeTaxSourceStatus).toBe("final-year-tax-table");
    const foreign=calculateFederalTax({...simpleW2Fixture,form2555:{foreignEarnedIncome:"30000",qualifyingDays:365,totalDaysInYear:365}});
    const get=(line:string)=>foreign.allLines.find(l=>l.form==="FEI Tax WS"&&l.line===line)?.value.toString();
    expect([get("1"),get("2c"),get("3"),get("4"),get("5"),get("6")]).toEqual(["39250","30000","69250","10155","3365","6790"]);
  });
  it("uses the published table for parent and child kiddie tax",()=>{
    const r=calculateForm8615({childUnearnedIncome:"5000",parentTaxableIncome:"30000",parentFilingStatus:"single",otherChildrenNetUnearnedIncome:"0",childQualifiedDividends:"0",childNetLTCG:"0",parentQualifiedDividends:"0",parentNetLTCG:"0"},d("3650"),"single",getConstants(2025));
    const get=(line:string)=>r.lines.find(l=>l.line===line)?.value.toString();
    // Parent combined32300 row3641, parent30000 row3365; child1350 row136/3650row368.
    expect([get("11"),get("12"),get("15"),get("17")]).toEqual(["3641","3365","136","368"]);
    expect(r.tax.toString()).toBe("412");
  });
  it("keeps ScheduleJ base years on actual rate schedules",()=>{
    const base={taxableIncome:"20000",filingStatus:"single" as const,originalTax:"0"};
    const input={electedFarmIncome:"3000",baseYear1:base,baseYear2:base,baseYear3:base};
    const r=calculateScheduleJ(input,d("50000"),d("5919"),"single",getConstants(2025));
    expect(r.line4.toString()).toBe("5405"); // Current47000–47050 table.
    expect([r.line8,r.line12,r.line16].map(x=>x.toString())).toEqual(["2315","2300","2288"]); // Actual21000 rate schedules2022/23/24.
    const next=calculateScheduleJ(input,d("50000"),d("5752"),"single",FEDERAL_2026_CONSTANTS);
    expect([next.line8,next.line12,next.line16].map(x=>x.toString())).toEqual(["2300","2288","2282"]); // Actual2023/24/25, no copied2022.
  });
});
