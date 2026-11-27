// Specs: spec/federal/qbi-minimum-deduction.yaml and spec/federal/form-8995.yaml.
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

describe("Form 8995 annual deduction and carryforward audit", () => {
  function deductionLines(result: ReturnType<typeof calculateForm8995>) {
    return Object.fromEntries(result.lines.filter(row => row.form === "Form 8995"
      && ["15", "16", "17", "18", "19", "reit-ptp-loss-carryforward"].includes(row.line))
      .map(row => [row.line, row.value.toFixed()]));
  }

  it("audits the ordinary, minimum, and final deductions on the 2026 draft lines", () => {
    const claim = calculateForm8995(base);
    expect(deductionLines(claim)).toEqual({ 15: "200", 16: "400", 17: "400", 18: "0", 19: "0" });
    expect(claim.qbiDeduction.toFixed()).toBe("400");

    const inactive = calculateForm8995({ ...base, qbiSources: [{ ...base.qbiSources[0], materiallyParticipated: false }] });
    expect(deductionLines(inactive)).toEqual({ 15: "200", 16: "0", 17: "200", 18: "0", 19: "0" });

    const ordinaryLarger = calculateForm8995({ ...base, qbiSources: [{ ...base.qbiSources[0], qbi: d("2500") }] });
    expect(deductionLines(ordinaryLarger)).toEqual({ 15: "500", 16: "400", 17: "500", 18: "0", 19: "0" });
  });

  it("reports signed draft loss carryforwards with positive named magnitudes", () => {
    const losses = calculateForm8995({ ...base, qbiSources: [{ name: "Actual trade loss", qbi: d("-250"), materiallyParticipated: true }],
      qualifiedPTPIncome: d("-40"), priorYearReitPtpLoss: d("60") });
    expect(deductionLines(losses)).toEqual({ 15: "0", 16: "0", 17: "0", 18: "-250", 19: "-100" });
    expect(losses.qbiLossCarryforward.toFixed()).toBe("250");
    expect(losses.reitPtpLossCarryforward.toFixed()).toBe("100");
  });

  it("keeps an unresolved minimum distinct from confirmed zero", () => {
    const qbiSources = [{ name: "Actual trade", qbi: d("2500") }];
    const unresolved = calculateForm8995({ ...base, qbiSources });
    expect(deductionLines(unresolved)).toEqual({ 15: "500", 17: "500", 18: "0", 19: "0" });
    expect(unresolved.lines.find(row => row.form === "Form 8995" && row.line === "17")?.formula).toMatch(/line 16.*unresolved/i);
    expect(unresolved.qbiDeduction.toFixed()).toBe("500");

    const ineligible = calculateForm8995({ ...base, qbiSources: [{ ...qbiSources[0], qbi: d("500") }], qualifiedReitDividends: d("2000") });
    expect(deductionLines(ineligible)).toEqual({ 15: "500", 16: "0", 17: "500", 18: "0", 19: "0" });
  });

  it("preserves 2025 final deduction and loss audit identifiers", () => {
    const result = calculateForm8995({ ...base, taxYear: 2025,
      qbiSources: [{ name: "Actual trade loss", qbi: d("-250") }], qualifiedReitDividends: d("2000") });
    expect(deductionLines(result)).toEqual({ 15: "400", 16: "250", "reit-ptp-loss-carryforward": "0" });
  });
});
