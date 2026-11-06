// Spec: spec/federal/qbi-minimum-deduction.yaml
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateQBIMinimumDeduction } from "@/engine/forms/qbi-minimum-deduction.js";
import { calculateForm8995 } from "@/engine/forms/form-8995.js";
import { calculateForm8995A } from "@/engine/forms/form-8995-a.js";
const d=(v:string)=>new Decimal(v);
const base={taxYear:2026,taxableIncomeBeforeQBI:d("10000"),netCapitalGain:d("0"),qualifiedDividends:d("0"),qbiSources:[{name:"Actual trade",qbi:d("1000"),materiallyParticipated:true}]};
describe("2026 active QBI minimum",()=>{
  it.each([["999.99","200"],["1000","400"],["1000.01","400"],["2500","500"]])("uses exact active threshold for %s",(qbi,expected)=>{
    expect(calculateForm8995({...base,qbiSources:[{...base.qbiSources[0],qbi:d(qbi)}]}).qbiDeduction.toString()).toBe(expected);
  });
  it("preserves the 2025 deduction",()=>expect(calculateForm8995({...base,taxYear:2025}).qbiDeduction.toString()).toBe("200"));
  it("does not treat an inactive trade as active",()=>expect(calculateForm8995({...base,qbiSources:[{...base.qbiSources[0],materiallyParticipated:false}]}).qbiDeduction.toString()).toBe("200"));
  it("does not infer missing participation",()=>expect(()=>calculateForm8995({...base,qbiSources:[{name:"Unknown activity",qbi:d("1000")}]})).toThrow(/participation/i));
  it("does not require participation when it cannot change the deduction",()=>expect(calculateForm8995({...base,qbiSources:[{name:"Unknown activity",qbi:d("5000")}]}).qbiDeduction.toString()).toBe("1000"));
  it("nets active losses while excluding inactive losses from the active threshold",()=>{
    const sources=[...base.qbiSources,{name:"Active loss",qbi:d("-1"),materiallyParticipated:true},{name:"Inactive loss",qbi:d("-200"),materiallyParticipated:false}];
    expect(calculateForm8995({...base,qbiSources:sources}).qbiDeduction.toString()).toBe("160");
    expect(calculateForm8995({...base,qbiSources:sources.slice(0,1).concat(sources.slice(2))}).qbiDeduction.toString()).toBe("400");
  });
  it("does not reapply the ordinary taxable-income cap to the statutory minimum",()=>{
    expect(calculateForm8995({...base,taxableIncomeBeforeQBI:d("500")}).qbiDeduction.toString()).toBe("400");
    expect(calculateForm8995({...base,taxableIncomeBeforeQBI:d("0")}).qbiDeduction.toString()).toBe("400");
  });
  it("preserves actual active carryover loss instead of inferring its character",()=>{
    expect(()=>calculateForm8995({...base,priorYearQBILoss:d("100")})).toThrow(/active.*carryover/i);
    expect(calculateForm8995({...base,priorYearQBILoss:d("100"),priorYearActiveQBILoss:d("0")}).qbiDeduction.toString()).toBe("400");
    expect(calculateForm8995({...base,priorYearQBILoss:d("100"),priorYearActiveQBILoss:d("100")}).qbiDeduction.toString()).toBe("180");
  });
  it("applies the minimum after the detailed wage/basis limit",()=>{
    const r=calculateForm8995A({...base,taxableIncomeBeforeQBI:d("400000"),simplifiedThreshold:d("201750"),phaseInRange:d("75000"),qbiSources:[{...base.qbiSources[0],w2Wages:d("0"),ubia:d("0"),isSST:false}]});
    expect(r.qbiDeduction.toString()).toBe("400");
  });
  it("does not create active qualified business income from an excluded SSTB",()=>{
    const r=calculateForm8995A({...base,taxableIncomeBeforeQBI:d("400000"),simplifiedThreshold:d("201750"),phaseInRange:d("75000"),qbiSources:[{...base.qbiSources[0],w2Wages:d("0"),ubia:d("0"),isSST:true}]});
    expect(r.qbiDeduction.toString()).toBe("0");
  });
});

describe("QBI minimum validation",()=>{
  const minimum={taxYear:2026,ordinaryDeduction:d("0"),sources:[{qbi:d("1000"),materiallyParticipated:true}]};
  it.each([
    {taxYear:2027}, {priorYearQBILoss:d("-1")}, {priorYearQBILoss:d("Infinity")},
    {priorYearQBILoss:d("100"),priorYearActiveQBILoss:d("101")},
    {priorYearQBILoss:d("100"),priorYearActiveQBILoss:d("-1")},
    {sources:[{qbi:d("NaN"),materiallyParticipated:true}]},
  ])("rejects invalid threshold facts %j",patch=>expect(()=>calculateQBIMinimumDeduction({...minimum,...patch})).toThrow());
  it("zero sources need no participation inference",()=>expect(calculateQBIMinimumDeduction({...minimum,sources:[{qbi:d("0")}]}).deduction.toString()).toBe("0"));
});
