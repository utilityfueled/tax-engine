// Spec: spec/federal/form-461.yaml
import { describe, expect, it } from "vitest";
import { calculateForm461, type Form461Input } from "@/engine/forms/form-461.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { getConstants } from "@/models/constants.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
const base = (overrides: Partial<Form461Input> = {}): Form461Input => ({
  totalWages:d("50000"),scheduleCNetProfit:d("-550000"),scheduleFNetProfit:d("0"),form4797OrdinaryGainOrLoss:d("0"),
  nonpassiveK1Income:d("0"),nonpassiveK1Loss:d("0"),otherBusinessIncome:d("0"),deductibleSETax:d("0"),
  seHealthInsurance:d("0"),seRetirementContributions:d("0"),priorYearEBLNol:d("0"),
  capitalGainOrLoss:d("0"),tradeOrBusinessCapitalGainNetIncome:d("0"),scheduleESupplementalIncome:d("0"),
  noncapitalNonbusinessIncome:d("0"),noncapitalNonbusinessLoss:d("0"),noncapitalBusinessNet:d("-550000"),otherBusinessDeductions:d("0"),
  sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,...overrides,
});
const constants=getConstants(2025);
describe("Form461 official source worksheet",()=>{
  it("excludes employee wages and preserves Schedule1 source conservation",()=>{
    const result=calculateFederalTax(TaxYearInputSchema.parse({...simpleW2Fixture,
      w2s:[{...simpleW2Fixture.w2s[0],wages:"50000",socialSecurityWages:"50000",medicareWages:"50000"}],
      scheduleC:{businessName:"Loss source",grossReceipts:"10000",expenses:{otherExpenses:"560000"}},
    }));
    expect(result.form461?.line16ExcessBusinessLoss.toString()).toBe("237000");
    expect(result.otherIncome.toString()).toBe("-313000");
    expect(result.totalIncome.toString()).toBe("-263000");
    expect(result.agi.toString()).toBe("-263000");
    expect(result.allLines.filter(l=>l.form==="Sched 1"&&l.line==="8p").at(-1)?.value.toString()).toBe("237000");
    expect(result.form461?.lines.find(l=>l.line==="1")).toBeUndefined();
  });
  it("emits the official sixteen-line arithmetic",()=>{
    const result=calculateForm461(base({scheduleCNetProfit:d("-400000"),capitalGainOrLoss:d("30000"),
      tradeOrBusinessCapitalGainNetIncome:d("20000"),form4797OrdinaryGainOrLoss:d("-5000"),scheduleESupplementalIncome:d("20000"),
      scheduleFNetProfit:d("-10000"),otherBusinessIncome:d("1000"),deductibleSETax:d("1000"),seHealthInsurance:d("2000"),
      seRetirementContributions:d("3000"),noncapitalNonbusinessIncome:d("7000"),noncapitalNonbusinessLoss:d("4000"),noncapitalBusinessNet:d("-403000")}),"single",constants);
    const entries=Object.fromEntries(result.lines.filter(l=>/^\d+$/.test(l.line)).map(l=>[l.line,l.value.toString()]));
    expect(entries).toEqual({2:"-400000",3:"30000",4:"-5000",5:"20000",6:"-10000",8:"-5000",9:"-370000",10:"17000",11:"4000",12:"13000",13:"-13000",14:"-383000",15:"313000",16:"-70000"});
    expect(result.line16ExcessBusinessLoss.toString()).toBe("70000");
    expect(result.sourceFactsVerified).toBe(true);
  });
  it("limits business capital gains and removes all capital losses",()=>{
    const capped=calculateForm461(base({scheduleCNetProfit:d("-400000"),noncapitalBusinessNet:d("-400000"),capitalGainOrLoss:d("30000"),tradeOrBusinessCapitalGainNetIncome:d("80000")}),"single",constants);
    expect(capped.line14NetBusinessAmount.toString()).toBe("-370000");
    const loss=calculateForm461(base({scheduleCNetProfit:d("-400000"),noncapitalBusinessNet:d("-400000"),capitalGainOrLoss:d("-3000"),tradeOrBusinessCapitalGainNetIncome:d("2000")}),"single",constants);
    expect(loss.line14NetBusinessAmount.toString()).toBe("-400000");
    expect(loss.line11NonbusinessLosses.toString()).toBe("3000");
    const businessLoss=calculateForm461(base({scheduleCNetProfit:d("-400000"),noncapitalBusinessNet:d("-400000"),capitalGainOrLoss:d("30000"),tradeOrBusinessCapitalGainNetIncome:d("-2000")}),"single",constants);
    expect(businessLoss.line10NonbusinessIncome.toString()).toBe("30000");
  });
  it("applies year thresholds and the separate return-attachment boundary",()=>{
    expect(calculateForm461(base({scheduleCNetProfit:d("-156500"),noncapitalBusinessNet:d("-156500")}),"married_filing_jointly",constants).requiresForm461).toBe(false);
    const required=calculateForm461(base({scheduleCNetProfit:d("-156501"),noncapitalBusinessNet:d("-156501")}),"married_filing_jointly",constants);
    expect(required.requiresForm461).toBe(true);
    expect(required.applies).toBe(false);
    expect(calculateForm461(base({scheduleCNetProfit:d("-256001"),noncapitalBusinessNet:d("-256001")}),"single",FEDERAL_2026_CONSTANTS).line16ExcessBusinessLoss.toString()).toBe("1");
  });

  it("reconciles completed supplemental business classification with the return",()=>{
    const source={sourceTaxYear:2025,sourceReference:"Synthetic completed loss worksheet",sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,
      scheduleESupplementalIncome:"0",noncapitalBusinessNet:"-400000",tradeOrBusinessCapitalGainNetIncome:"0",noncapitalNonbusinessIncome:"0",noncapitalNonbusinessLoss:"0",otherBusinessIncome:"0",otherBusinessDeductions:"0"};
    const raw={...simpleW2Fixture,form461:source,scheduleC:{businessName:"Actual loss",grossReceipts:"10000",expenses:{otherExpenses:"410000"}}};
    const result=calculateFederalTax(TaxYearInputSchema.parse(raw));
    expect(result.form461?.sourceFactsVerified).toBe(true);
    expect(result.form461?.line16ExcessBusinessLoss.toString()).toBe("87000");
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:{...source,scheduleESupplementalIncome:"1"}}))).toThrow(/reconcile/i);
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:{...source,otherBusinessIncome:"1"}}))).toThrow(/reconcile/i);
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:{...source,otherBusinessDeductions:"1"}}))).toThrow(/reconcile/i);
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:{...source,sourceTaxYear:2024}}))).toThrow(/year/i);
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:{...source,otherBusinessIncome:undefined}}))).toThrow(/source/i);
  });
  it("requires actual passive worksheet sources before material business limitation",()=>{
    const raw={...simpleW2Fixture,scheduleC:{businessName:"Actual loss",grossReceipts:"0",expenses:{otherExpenses:"550000"}},
      rentalProperties:[{description:"Actual rental",propertyType:"single_family",rentalDays:365,personalUseDays:0,rents:"10000",repairs:"410000",isActiveParticipant:true}]};
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse(raw))).toThrow(/post-passive|source classification/i);
    const source={sourceTaxYear:2025,sourceReference:"Completed at-risk and passive worksheets",sourceFactsConfirmed:true,atRiskAndPassiveLimitationsApplied:true,
      scheduleESupplementalIncome:"-25000",noncapitalBusinessNet:"-575000",tradeOrBusinessCapitalGainNetIncome:"0",noncapitalNonbusinessIncome:"0",noncapitalNonbusinessLoss:"0",otherBusinessIncome:"0",otherBusinessDeductions:"0"};
    expect(()=>calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:source}))).toThrow(/passive.*MAGI|passive.*worksheet/i);
    const result=calculateFederalTax(TaxYearInputSchema.parse({...raw,form461:{...source,passiveLossModifiedAgi:"-465000"}}));
    expect(result.form461?.line5ScheduleE.toString()).toBe("-25000");
    expect(result.form461?.line16ExcessBusinessLoss.toString()).toBe("262000");
    expect(result.otherIncome.toString()).toBe("-313000");
    expect(result.totalIncome.toString()).toBe("-228000");
  });
  it("rejects incomplete and contradictory source classifications",()=>{
    for(const field of ["capitalGainOrLoss","tradeOrBusinessCapitalGainNetIncome","scheduleESupplementalIncome","noncapitalNonbusinessIncome","noncapitalNonbusinessLoss","noncapitalBusinessNet","otherBusinessDeductions"] as const){
      expect(()=>calculateForm461(base({[field]:undefined}),"single",FEDERAL_2026_CONSTANTS)).toThrow(/source|actual|classification/i);
    }
    expect(()=>calculateForm461(base({noncapitalNonbusinessIncome:d("1")}),"single",constants)).toThrow(/income|reconcile/i);
    expect(()=>calculateForm461(base({noncapitalNonbusinessLoss:d("-1")}),"single",constants)).toThrow(/nonnegative/i);
    expect(()=>calculateForm461(base({atRiskAndPassiveLimitationsApplied:false}),"single",constants)).toThrow(/at-risk|passive/i);
  });
  it("reconciles offsetting business and nonbusiness components within one printed line",()=>{
    const mixedLoss = { ...base(), scheduleCNetProfit:d("0"), scheduleESupplementalIncome:d("-100000"),
      noncapitalNonbusinessLoss:d("200000"), noncapitalBusinessNet:d("100000") };
    const profit = calculateForm461(mixedLoss,"single",constants);
    expect(profit.line5ScheduleE.toString()).toBe("-100000");
    expect(profit.line11NonbusinessLosses.toString()).toBe("200000");
    expect(profit.line14NetBusinessAmount.toString()).toBe("100000");
    expect(profit.line16ExcessBusinessLoss.toString()).toBe("0");
    const mixedIncome = { ...base(), scheduleCNetProfit:d("0"), scheduleESupplementalIncome:d("-100000"),
      noncapitalNonbusinessIncome:d("200000"), noncapitalBusinessNet:d("-300000") };
    const loss = calculateForm461(mixedIncome,"single",constants);
    expect(loss.line10NonbusinessIncome.toString()).toBe("200000");
    expect(loss.line14NetBusinessAmount.toString()).toBe("-300000");
    expect(loss.line16ExcessBusinessLoss.toString()).toBe("0");
    expect(()=>calculateForm461({...mixedIncome,noncapitalBusinessNet:d("-299999")},"single",constants)).toThrow(/reconcile/i);
  });
});
