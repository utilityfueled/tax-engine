// Spec: spec/federal/form-6251.yaml
import {describe,it,expect} from "vitest";
import {calculateForm6251} from "@/engine/forms/form-6251.js";
import {getConstants} from "@/models/constants.js";
import {d} from "@/utils/decimal.js";
const input=()=>({taxableIncome:d("200000"),totalDeductions:d("21750"),standardDeductionAmount:d("15750"),seniorDeduction:d("6000"),
  saltDeduction:d("9999"),regularTax:d("50000"),filingStatus:"single" as const,isItemizing:false});
describe("Official Form6251 printed audit",()=>{
  it("records senior and standard deductions in official1a1b2a without changing AMTI",()=>{
    const r=calculateForm6251(input(),getConstants(2025));
    const get=(id:string)=>r.lines.find(line=>line.form==="Form 6251"&&line.line===id)?.value.toString();
    expect(["1a","1b","2a","4","5","6","7","9","10","11"].map(get)).toEqual(
      ["15750","206000","15750","221750","88100","133650","34749","34749","50000","0"]);
    expect(get("8")).toBeUndefined(); // No actual AMTFTC source is represented.
    expect(r.amti.toString()).toBe("221750");
    expect(new Set(r.lines.map(line=>line.line)).size).toBe(r.lines.length);
  });
  it("retains signed income and uses2d for depletion",()=>{
    const r=calculateForm6251({...input(),taxableIncome:d("-10000"),depletionAdjustment:d("1000")},getConstants(2025));
    expect(r.lines.find(line=>line.line==="1b")?.value.toString()).toBe("-4000");
    expect(r.lines.find(line=>line.line==="2d")?.value.toString()).toBe("1000");
    expect(r.lines.find(line=>line.line==="2c")).toBeUndefined();
    expect(r.amti.toString()).toBe("12750");
  });
  it("does not invent line1a when total deductions are unknown",()=>{
    const {totalDeductions:_unknown,...legacy}=input();
    const r=calculateForm6251(legacy,getConstants(2025));
    expect(r.lines.find(line=>line.line==="1a")).toBeUndefined();
    expect(()=>calculateForm6251({...input(),totalDeductions:d("5000")},getConstants(2025))).toThrow(/senior|deduction/i);
  });
});
