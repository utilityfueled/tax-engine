// Spec: spec/federal/schedule-a.yaml line5a-payment-year
import {describe,it,expect} from "vitest";
import {calculateScheduleA} from "@/engine/schedules/schedule-a.js";
import {calculateFederalTax} from "@/engine/federal.js";
import {TaxYearInputSchema,type TaxYearInput} from "@/models/inputs.js";
import {getConstants} from "@/models/constants.js";
import {d} from "@/utils/decimal.js";
import {simpleW2Fixture} from "../../fixtures/simple-w2.js";
import {actualOhioPayment, ohioPaymentFixture} from "../../fixtures/oh-payments.js";
const record=(date:string,amount:string,type="state")=>({date,amount,type,state:"CA"});
describe("State tax payment calendar year",()=>{
  it("reconciles distinct Ohio receipt originals without counting saved mirrors twice",()=>{
    const input=ohioPaymentFixture();
    const mirror={...record("2025-04-15","400.25"),state:"OH"};
    const adjustments={estimatedTaxPayments:[mirror,record("2025-06-15","10.05")]};
    const first=actualOhioPayment(input,"400.25");
    const second={...first,sourceId:"another-independent-record",original:{...first.original,confirmationNumber:"SECOND-ACTUAL-CONFIRMATION"}};
    const january=actualOhioPayment(input,"100.50","2026-01-15");
    january.sourceId="january-independent-record";
    january.original.confirmationNumber="JANUARY-ACTUAL-CONFIRMATION";
    const {ohioResidency: _residency,ohioPayments,...base}=input;
    const parsed=(paymentRows:typeof first[],saved=adjustments,options:{election:TaxYearInput["deductionElection"];populatedScheduleA?:boolean}={election:"itemized"})=>{
      const scheduleA=options.populatedScheduleA?{realEstateTaxes:"18000"}:undefined;
      const current=TaxYearInputSchema.parse({...base,adjustments:saved,scheduleA,deductionElection:options.election});
      return TaxYearInputSchema.parse({...current,ohioPayments:{...ohioPayments,paymentRows,originalFederalSources:JSON.parse(JSON.stringify(current))}});
    };
    const deduction=(value:ReturnType<typeof parsed>)=>calculateFederalTax(value).allLines.find(l=>l.form==="Sched A"&&l.line==="5a")?.value.toString();
    expect(deduction(parsed([first,second,january]))).toBe("810.55");
    for(const election of ["automatic",undefined] as const){
      const auto=calculateFederalTax(parsed([first,second,january],adjustments,{election,populatedScheduleA:true}));
      expect(auto.deductionUsed).toBe("itemized");
      expect(auto.allLines.find(l=>l.form==="Sched A"&&l.line==="5a")?.value.toString()).toBe("810.55");
      expect(deduction(parsed([first,second,january],adjustments,{election}))).toBe("810.55");
    }
    expect(deduction(parsed([first,second,january],adjustments,{election:"standard",populatedScheduleA:true}))).toBe("410.3");
    expect(()=>deduction(parsed([first,second,january],adjustments,{election:"nonitemized",populatedScheduleA:true}))).toThrow(/nonitemized election requires 2026/i);
    const typedSeparatePayments={
      estimatedTaxPayments:[mirror,record("2025-04-15","400.25")],
      extensionPayments:[record("2025-04-15","400.25")],
      priorYearAppliedCredits:[{sourceTaxYear:2024,amount:"1.25",type:"state",state:"CA"}],
    };
    expect(deduction(parsed([first,second,january],typedSeparatePayments))).toBe("1602.25");
    const conflictingReplay={...second,amount:"400.26",original:{...second.original,amount:"400.26",confirmationNumber:first.original.confirmationNumber.toLowerCase()}};
    expect(()=>deduction(parsed([first,conflictingReplay]))).toThrow(/distinct.*confirmation/i);
    const wrongCents={estimatedTaxPayments:[{...mirror,amount:"400.26"}]};
    expect(()=>deduction(parsed([first,second],wrongCents))).toThrow(/distinct.*original.*receipt/i);
    const duplicateMirror={estimatedTaxPayments:[mirror,mirror]};
    expect(()=>deduction(parsed([first],duplicateMirror))).toThrow(/distinct.*original.*receipt/i);
    expect(()=>deduction(parsed([],adjustments))).toThrow(/distinct.*original.*receipt/i);
    const contradictoryOriginal={...first,original:{...first.original,taxYear:2024}};
    expect(()=>deduction(parsed([contradictoryOriginal]))).toThrow(/original/i);
    const wrongOwner={...first,original:{...first.original,accountName:"Different Receipt Owner"}};
    expect(()=>deduction(parsed([wrongOwner]))).toThrow(/actual payment account identity/i);
    const stale=parsed([first,second,january]);
    expect(()=>deduction({...stale,taxpayer:{...stale.taxpayer,primary:{...stale.taxpayer.primary,firstName:"Current Taxpayer"}}})).toThrow(/original federal snapshot differs/i);
    expect(deduction(parsed([actualOhioPayment(input,"0.00")],{estimatedTaxPayments:[]}))).toBe("0");
  });
  it("automatically itemizes a qualifying Ohio estimate without a separate Schedule A worksheet",()=>{
    const fixture=ohioPaymentFixture();
    const {ohioResidency: _residency,ohioPayments,...base}=fixture;
    const paid=actualOhioPayment(fixture,"16000.25");
    for(const election of ["automatic",undefined] as const){
      const original=TaxYearInputSchema.parse({...base,deductionElection:election});
      expect(original.scheduleA).toBeUndefined();
      expect(calculateFederalTax(original).deductionUsed).toBe("standard");
      const input=TaxYearInputSchema.parse({...original,ohioPayments:{...ohioPayments,paymentRows:[paid],
        originalFederalSources:JSON.parse(JSON.stringify(original)),
        remainingTaxPayment:{status:"no_remaining_tax",sourceReference:"Actual synthetic receipt covered the balance",sourceFactsConfirmed:true},
      }});
      const result=calculateFederalTax(input);
      expect(result.deductionUsed).toBe("itemized");
      expect(result.allLines.find(line=>line.form==="Sched A"&&line.line==="5a")?.value.toString()).toBe("16000.25");
    }
  });
  it("deducts state payments by actual calendar year and preserves applied prior credits",()=>{
    const input=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{estimatedTaxPayments:[record("2025-01-15","1000"),record("2025-12-31","2000"),record("2026-01-15","4000"),record("2024-12-31","8000"),record("2025-06-15","16000","federal")],extensionPayments:[record("2025-04-15","500"),record("2026-04-15","900")],priorYearAppliedCredits:[{sourceTaxYear:2024,amount:"250",type:"state",state:"CA"}]}});
    const result=calculateScheduleA(input,d("85000"),"single",getConstants(2025));
    expect(result.lines.find(l=>l.line==="5a")?.value.toString()).toBe("3750");
    const federal=calculateFederalTax(input);
    expect(federal.allLines.find(l=>l.form==="Sched A"&&l.line==="5a")?.value.toString()).toBe("3750");
    const compared=calculateFederalTax(TaxYearInputSchema.parse({...input,salesTaxDeduction:{state:"CA",method:"actual",actualGeneralSalesTax:"4000",autoCompare:true}}));
    expect(compared.allLines.find(l=>l.form==="Sched A"&&l.line==="5a")?.value.toString()).toBe("4000");
    for(const badDate of ["","2025-02-30","2025-1-01"]){
      const bad=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{estimatedTaxPayments:[record(badDate,"1000")]}});
      expect(()=>calculateScheduleA(bad,d("85000"),"single",getConstants(2025))).toThrow(/actual.*payment date/i);
    }
    const old=TaxYearInputSchema.parse({...simpleW2Fixture,adjustments:{priorYearAppliedCredits:[{sourceTaxYear:2023,amount:"250",type:"state",state:"CA"}]}});
    expect(()=>calculateScheduleA(old,d("85000"),"single",getConstants(2025))).toThrow(/applied.*source year/i);
  });
});
