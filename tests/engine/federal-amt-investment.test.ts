// Spec: spec/federal/amt-investment-interest.yaml
import { describe,it,expect,vi } from "vitest";
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const {FEDERAL_2026_CONSTANTS}=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
const source=(year=2025)=>({sourceTaxYear:year,sourceReference:"Synthetic actual source worksheet",sourceFactsConfirmed:true,
  investmentInterestExpense:"10000",priorYearDisallowed:"0",grossInvestmentIncome:"5000",qualifiedDividendsIncluded:"0",
  netGainFromInvestmentProperty:"0",netCapitalGainFromInvestmentProperty:"0",electedPreferentialIncome:"0",investmentExpenses:"0"});
const base={...simpleW2Fixture,deductionElection:"itemized",form4952:source(),form4952Amt:{...source(),grossInvestmentIncome:"8000"}};
const calc=(value:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(value));
const line=(result:ReturnType<typeof calc>,id:string)=>result.form6251?.lines.find(l=>l.line===id)?.value.toString();
describe("Separate AMT investment interest sources",()=>{
  it("uses separate actual deductions and preserves both signs on line2c",()=>{
    const lower=calc(base);
    expect(lower.form4952?.line8.toString()).toBe("5000");
    expect(lower.form4952Amt?.line8.toString()).toBe("8000");
    expect(line(lower,"2c")).toBe("-3000");
    expect(lower.form6251?.amti.toString()).toBe("77000");
    const higher=calc({...base,form4952Amt:{...source(),grossInvestmentIncome:"2000"}});
    expect(line(higher,"2c")).toBe("3000");expect(higher.form6251?.amti.toString()).toBe("83000");
    const standard=calc({...base,deductionElection:"standard"});
    expect(line(standard,"2c")).toBe("0");expect(standard.form6251?.amti.toString()).toBe("85000");
  });
  it("rejects unknown or contradictory AMT sources rather than copying regular amounts",()=>{
    const current={...base,taxpayer:{...base.taxpayer,taxYear:2026},form4952:source(2026),form4952Amt:{...source(2026),grossInvestmentIncome:"8000"}};
    expect(calc(current).form4952Amt?.taxYear).toBe(2026);
    expect(()=>calc({...current,form4952Amt:undefined})).toThrow(/AMT.*source|AMT.*4952/i);
    expect(()=>calc({...current,form4952Amt:{...current.form4952Amt,priorYearDisallowed:undefined}})).toThrow(/actual|source/i);
    expect(()=>calc({...current,form4952Amt:{...current.form4952Amt,sourceTaxYear:2025}})).toThrow(/year/i);
    expect(()=>calc({...base,form4952Amt:{...source(),qualifiedDividendsIncluded:"5000",electedPreferentialIncome:"1000"}})).toThrow(/election/i);
  });
  it("uses actual AMT election and actual regular worksheet ordering",()=>{
    const result=calc({...base,w2s:[{...base.w2s[0],wages:"150000"}],
      form1099Div:[{payer:"Synthetic broker",ordinaryDividends:"20000",qualifiedDividends:"20000"}],
      form4952:{...source(),grossInvestmentIncome:"20000",qualifiedDividendsIncluded:"20000",electedPreferentialIncome:"10000"},
      form4952Amt:{...source(),grossInvestmentIncome:"20000",qualifiedDividendsIncluded:"20000",electedPreferentialIncome:"10000"},
      amtCapitalGains:{sourceTaxYear:2025,sourceReference:"Synthetic actual AMT gain worksheets",sourceFactsConfirmed:true,
        qualifiedDividends:"20000",netCapitalGain:"0",section1250Gain:"0",collectiblesGain:"0"}});
    expect(line(result,"13")).toBe("10000");expect(line(result,"20")).toBe("150000");expect(line(result,"27")).toBe("150000");
    //AMTbase71900; ordinary61900*26%=16094, preferential10000*15%=1500.
    expect(result.form6251?.tentativeMinimumTax.toString()).toBe("17594");
    expect(line(result,"40")).toBe("17594");
    expect(result.allLines.filter(l=>l.form==="Form 4952"&&l.line==="8")).toHaveLength(1);
    expect(result.allLines.filter(l=>l.form==="Form 4952 AMT"&&l.line==="8")).toHaveLength(1);
  });
});
