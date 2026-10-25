// Spec: spec/federal/investment-interest-return.yaml
import { describe,it,expect,vi } from "vitest";
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS }=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const source=(year=2025)=>({ sourceTaxYear:year,sourceReference:"Synthetic combined investment worksheet",sourceFactsConfirmed:true,
  investmentInterestExpense:"10000",priorYearDisallowed:"0",grossInvestmentIncome:"10000",qualifiedDividendsIncluded:"10000",
  netGainFromInvestmentProperty:"0",netCapitalGainFromInvestmentProperty:"0",electedPreferentialIncome:"10000",investmentExpenses:"0" });
const prior={ calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,
  calculationMethod:"regular",withholdingMethod:"equal-installments",priorYearTaxStatus:"no-tax-liability",priorYearFullYear:true,
  priorYearResidentAllYear:true,priorYearTaxForForm2210:"0",priorYearTaxComputationConfirmed:true };
const base={ ...simpleW2Fixture,deductionElection:"itemized",form2210:prior,w2s:[{...simpleW2Fixture.w2s[0],wages:"80000"}],
  form1099Div:[{payer:"Synthetic brokerage",ordinaryDividends:"10000",qualifiedDividends:"10000"}],form4952:source() };
const calc=(input:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(input));
const line=(result:ReturnType<typeof calc>,id:string)=>result.allLines.find(l=>l.form==="Sched D Tax WS"&&l.line===id)?.value.toString();
describe("Investment interest federal source coordination",()=>{
  it("routes actual dividend and capital gain elections through the tax worksheet",()=>{
    const result=calc(base);
    expect(result.qualifiedDividends.toString()).toBe("10000");
    expect(result.form4952?.line8.toString()).toBe("10000");
    expect(result.taxableIncome.toString()).toBe("80000");
    expect(line(result,"3")).toBe("10000");expect(line(result,"6")).toBe("0");
    expect(line(result,"47")).toBe("12520"); //Published2025single80000–80050 row
    const allocated=calc({...base,w2s:[{...base.w2s[0],wages:"50000"}],
      form1099Div:[{...base.form1099Div[0],totalCapitalGainDistributions:"10000"}],
      form4952:{...source(),investmentInterestExpense:"8000",netGainFromInvestmentProperty:"10000",netCapitalGainFromInvestmentProperty:"10000",
        electedPreferentialIncome:"8000",electedNetCapitalGain:"4000"}});
    expect(allocated.taxableIncome.toString()).toBe("62000");
    expect(line(allocated,"4")).toBe("4000");expect(line(allocated,"6")).toBe("6000");expect(line(allocated,"9")).toBe("6000");
    expect(line(allocated,"47")).toBe("7720"); //5920 published50000ordinary +1800preferential
  });
  it("uses actual combined sources once and preserves source year and missingness",()=>{
    const combined=calc({...base,form1099Div:[],scheduleK1:[{partnershipName:"Synthetic LP",partnershipEIN:"11-0000000",
      ordinaryIncome:"10000",investmentInterestExpense:"3000",investmentIncome:"5000",investmentExpenses:"2000"}],
      form4952:{...source(),investmentInterestExpense:"3000",grossInvestmentIncome:"5000",qualifiedDividendsIncluded:"0",electedPreferentialIncome:"0",investmentExpenses:"500",investmentExpensesDeductibleConfirmed:true}});
    expect(combined.form4952?.line1.toString()).toBe("3000");expect(combined.form4952?.line4a.toString()).toBe("5000");
    expect(combined.form4952?.line5.toString()).toBe("500");expect(combined.form4952?.sourceFactsVerified).toBe(true);
    const current={...base,taxpayer:{...base.taxpayer,taxYear:2026},w2s:[{...base.w2s[0],wages:"40000"}],form4952:{...source(2026),investmentInterestExpense:"5000",electedPreferentialIncome:"5000"},
      form4952Amt:{...source(2026),investmentInterestExpense:"5000",electedPreferentialIncome:"5000"},
      amtCapitalGains:{sourceTaxYear:2026,sourceReference:"Synthetic actual AMT worksheets",sourceFactsConfirmed:true,
        qualifiedDividends:"10000",netCapitalGain:"0",section1250Gain:"0",collectiblesGain:"0"}};
    const result=calc(current);expect(result.form4952?.taxYear).toBe(2026);expect(line(result,"47")).toBe("4552");
    expect(()=>calc({...current,form4952:{...current.form4952,netCapitalGainFromInvestmentProperty:undefined}})).toThrow(/actual|source/i);
    expect(()=>calc({...current,form4952:{...current.form4952,sourceTaxYear:2025}})).toThrow(/year/i);
  });
  it("applies foreign capital gain excess after the investment income election",()=>{
    const result=calc({...base,w2s:[{...base.w2s[0],wages:"80000"}],
      form1099Div:[{payer:"Synthetic brokerage",ordinaryDividends:"20000",qualifiedDividends:"20000"}],
      form4952:{...source(),investmentInterestExpense:"15000",grossInvestmentIncome:"20000",qualifiedDividendsIncluded:"20000",electedPreferentialIncome:"5000"},
      form2555:{foreignEarnedIncome:"80000",qualifyingDays:365,totalDaysInYear:365,qualifiedHousingExpenses:"0",employerProvidedForeignEarnedIncome:"80000",isSelfEmployed:false},
      scheduleA:{medicalExpenses:"0",personalPropertyTaxes:"5000"}});
    //Income20000 minus5000investment/5000taxes leaves10000. Post-election15000preferential creates5000excess.
    expect(result.taxableIncome.toString()).toBe("10000");
    expect(line(result,"3")).toBe("5000");expect(line(result,"6")).toBe("10000");
    expect(result.allLines.find(l=>l.form==="FEI Tax WS"&&l.line==="capitalGainExcess")?.value.toString()).toBe("5000");
    expect(result.qualifiedDividends.toString()).toBe("20000");
    expect(line(result,"47")).toBe("14020"); //12520 published ordinary tax +1500 preferential tax
    expect(result.allLines.find(l=>l.form==="FEI Tax WS"&&l.line==="6")?.value.toString()).toBe("1500");
  });
});
