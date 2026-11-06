// Spec: spec/federal/qbi-source-deductions.yaml
import { describe, it, expect } from "vitest";
import { d } from "@/utils/decimal.js";
import { calculateQBISourceDeductions } from "@/engine/forms/qbi-source-deductions.js";

const source = (id: string, amount: string, accountHolder: "primary" | "spouse" = "primary") => ({
  id, name:id, qbi:d(amount), netSEEarnings:d(amount), accountHolder,
});
const params = () => ({taxYear:2026,sources:[source("scheduleC","100000")],
  selfEmploymentDeductions:[{accountHolder:"primary" as const,amount:d("7065")}],
  healthInsuranceDeduction:d("0"),retirementPlanDeduction:d("0"),sourceFactsVerified:true});
describe("QBI source deduction attribution",()=>{
  it("reduces a partnership source by its owner's actual SE deduction",()=>{
    const r=calculateQBISourceDeductions({...params(),sources:[source("scheduleK1:0","50000")],
      selfEmploymentDeductions:[{accountHolder:"primary",amount:d("3533")}]});
    expect(r.sources[0].qbi.toString()).toBe("46467");
    expect(r.sourceFactsVerified).toBe(true);
  });
  it("keeps each spouse's deductions with that spouse's business",()=>{
    const r=calculateQBISourceDeductions({...params(),sources:[source("scheduleC","100000","spouse"),source("scheduleF","20000")],
      selfEmploymentDeductions:[{accountHolder:"primary",amount:d("268")},{accountHolder:"spouse",amount:d("7065")}]});
    expect(r.sources.map(s=>s.qbi.toString())).toEqual(["92935","19732"]);
  });
  it("subtracts all three allowed deductions for a single business",()=>{
    const r=calculateQBISourceDeductions({...params(),healthInsuranceDeduction:d("3000"),retirementPlanDeduction:d("10000")});
    expect(r.sources[0].qbi.toString()).toBe("79935");
  });
  it("requires actual multiple-trade and excluded-income allocations in 2026",()=>{
    expect(()=>calculateQBISourceDeductions({...params(),sources:[source("scheduleC","60000"),source("scheduleF","40000")]})).toThrow(/allocation/i);
    expect(()=>calculateQBISourceDeductions({...params(),sources:[{...source("scheduleK1:0","50000"),excludedSEIncome:true}]})).toThrow(/allocation/i);
  });
  it("reconciles actual deductions and keeps non-QBI deductions separate",()=>{
    const r=calculateQBISourceDeductions({...params(),sources:[source("scheduleC","60000"),source("scheduleF","40000")],
      healthInsuranceDeduction:d("1000"),retirementPlanDeduction:d("5000"),allocation:{sourceFactsConfirmed:true,rows:[
        {sourceId:"scheduleC",accountHolder:"primary",deductibleSelfEmploymentTax:"4000",selfEmployedHealthInsurance:"1000",selfEmployedRetirementPlans:"5000"},
        {sourceId:"scheduleF",accountHolder:"primary",deductibleSelfEmploymentTax:"2000",selfEmployedHealthInsurance:"0",selfEmployedRetirementPlans:"0"},
        {sourceId:"nonQbi",accountHolder:"primary",deductibleSelfEmploymentTax:"1065",selfEmployedHealthInsurance:"0",selfEmployedRetirementPlans:"0"},
      ]}});
    expect(r.sources.map(s=>s.qbi.toString())).toEqual(["50000","38000"]);
    expect(r.sourceFactsVerified).toBe(true);
  });
  it("rejects mismatched, duplicated, unknown-owner and invalid actual allocations",()=>{
    const row={sourceId:"scheduleC",accountHolder:"primary" as const,deductibleSelfEmploymentTax:"7065",selfEmployedHealthInsurance:"0",selfEmployedRetirementPlans:"0"};
    const run=(rows:typeof row[])=>calculateQBISourceDeductions({...params(),allocation:{sourceFactsConfirmed:true,rows}});
    expect(()=>run([{...row,deductibleSelfEmploymentTax:"7064"}])).toThrow(/reconcile/i);
    expect(()=>run([row,row])).toThrow(/duplicate/i);
    expect(()=>run([{...row,sourceId:"missing"}])).toThrow(/source/i);
    expect(()=>run([{...row,deductibleSelfEmploymentTax:"-1"}])).toThrow(/nonnegative/i);
    expect(()=>calculateQBISourceDeductions({...params(),sources:[{...source("scheduleC","100000"),accountHolder:undefined}],allocation:{sourceFactsConfirmed:true,rows:[row]}})).toThrow(/owner/i);
  });
  it("preserves a legacy preview without asserting source verification",()=>{
    const r=calculateQBISourceDeductions({...params(),taxYear:2025,sources:[source("scheduleC","60000"),source("scheduleF","40000")]});
    expect(r.sources.map(s=>s.qbi.toString())).toEqual(["55761","37174"]);
    expect(r.sourceFactsVerified).toBe(false);
  });
  it("preserves signed source losses and does not fabricate a deduction source",()=>{
    const r=calculateQBISourceDeductions({...params(),sources:[source("scheduleC","-1000")],selfEmploymentDeductions:[]});
    expect(r.sources[0].qbi.toString()).toBe("-1000");
    expect(()=>calculateQBISourceDeductions({...params(),sources:[]})).toThrow(/source/i);
  });
});

it("keeps actual health deductions on their source business and reconciles mixed allocations", () => {
  const sources = [
    { id: "scheduleC", name: "First", accountHolder: "primary" as const, qbi: d(30000), netSEEarnings: d(30000) },
    { id: "scheduleF", name: "Second", accountHolder: "primary" as const, qbi: d(70000), netSEEarnings: d(70000) },
  ];
  const input = { taxYear: 2025, sources, selfEmploymentDeductions: [], healthInsuranceDeduction: d(1000), retirementPlanDeduction: d(0), sourceFactsVerified: true,
    healthInsuranceSources: [{ sourceId: "scheduleC", accountHolder: "primary" as const, amount: d(1000) }] };
  const result = calculateQBISourceDeductions(input);
  expect(result.sources.map(source => source.qbi.toString())).toEqual(["29000", "70000"]);
  const rows = [{ sourceId: "scheduleC", accountHolder: "primary" as const, deductibleSelfEmploymentTax: "0", selfEmployedHealthInsurance: "500", selfEmployedRetirementPlans: "0" },
    { sourceId: "scheduleF", accountHolder: "primary" as const, deductibleSelfEmploymentTax: "0", selfEmployedHealthInsurance: "500", selfEmployedRetirementPlans: "0" }];
  expect(() => calculateQBISourceDeductions({ ...input, allocation: { sourceFactsConfirmed: true, rows } })).toThrow(/health.*source|source.*health/i);
  const mixed = { ...input, sources: [{ ...sources[0], excludedSEIncome: true }, sources[1]] };
  expect(() => calculateQBISourceDeductions(mixed)).toThrow(/mixed|allocation/i);
  const correct = calculateQBISourceDeductions({ ...mixed, allocation: { sourceFactsConfirmed: true, rows: [rows[0], { ...rows[1], sourceId: "nonQbi" }] } });
  expect(correct.sources.map(source => source.qbi.toString())).toEqual(["29500", "70000"]);
});
