// Spec: spec/federal/schedule-1.yaml lines8d/24j; final IRS2555 instructions.
import {describe,it,expect} from "vitest";
import {calculateFederalTax} from "@/engine/federal.js";
import {calculateSchedule1} from "@/engine/schedules/schedule-1.js";
import {d} from "@/utils/decimal.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
import {Form2555Schema} from "@/models/inputs.js";
function sourceFacts(overrides:Record<string,unknown>={}) {
  return Form2555Schema.parse({taxYear:2025,foreignEarnedIncome:"150000",qualifyingDays:365,totalDaysInYear:365,qualifiedHousingExpenses:"0",isSelfEmployed:false,
    sourceFactsConfirmed:true,eligibilityConfirmed:true,electionsValidConfirmed:true,claimForeignEarnedIncomeExclusion:true,claimHousingExclusionOrDeduction:true,
    employerProvidedForeignEarnedIncome:"150000",deductionsAllocableToExcludedIncome:"0",foreignEarnedIncomeTaxWorksheetDisallowedDeductions:"0",priorYearHousingDeductionCarryover:"0",priorYearIncomeExclusion:"0",housingExpensesQualificationConfirmed:true,incomeSourceMappingConfirmed:true,housingLocationPeriods:[{locationId:"default",days:365}],
    partIV:{wages:"150000",businessPersonalServices:"0",partnershipPersonalServices:"0",noncashLodging:"0",noncashMeals:"0",noncashCar:"0",noncashOther:"0",allowanceCostOfLiving:"0",allowanceFamily:"0",allowanceEducation:"0",allowanceHomeLeave:"0",allowanceQuarters:"0",allowanceOther:"0",otherEarnedIncome:"0",section119MealsAndLodging:"0"},
    incomeSources:{foreignEmploymentIncomeIncludedOnW2:"150000",foreignEmploymentIncomeNotOnW2:"0",foreignBusinessIncomeAlreadyReported:"0",foreignPartnershipIncomeAlreadyReported:"0",otherForeignIncomeAlreadyReported:"0"},...overrides});
}
describe("Foreign income return routing",()=>{
  it("uses net Form2555 amounts for education MAGI",()=>{
    const f=sourceFacts();
    const form2555=sourceFacts({foreignEarnedIncome:"80000",employerProvidedForeignEarnedIncome:"80000",deductionsAllocableToExcludedIncome:"7000",partIV:{...f.partIV,wages:"80000"},incomeSources:{...f.incomeSources,foreignEmploymentIncomeIncludedOnW2:"80000"}});
    const result=calculateFederalTax({...simpleW2Fixture,form2555,educationExpenses:{aocStudents:[],llcExpenses:"10000"}});
    expect(result.agi.toString()).toBe("12000");
    expect(result.form8863?.lines.find(l=>l.line==="14")?.value.toString()).toBe("85000");
    expect(result.form8863?.lines.find(l=>l.line==="18")?.value.toString()).toBe("1000");
  });
  it("limits preferential gains to actual taxable income before foreign stacking",()=>{
    const f=sourceFacts();
    const form2555=sourceFacts({foreignEarnedIncome:"120000",employerProvidedForeignEarnedIncome:"120000",partIV:{...f.partIV,wages:"120000"},incomeSources:{...f.incomeSources,foreignEmploymentIncomeIncludedOnW2:"120000"}});
    const result=calculateFederalTax({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:"120000"}],form1099Div:[{payer:"Synthetic",ordinaryDividends:"30000",qualifiedDividends:"30000"}],form2555});
    expect(result.taxableIncome.toString()).toBe("14250");
    expect(result.ordinaryTax.toString()).toBe("0");
    expect(result.capitalGainsTax.toString()).toBe("2138");
    expect(result.allLines.find(l=>l.form==="FEI Tax WS"&&l.line==="capitalGainExcess")?.value.toString()).toBe("15750");
  });
  it("adds only actual foreign employment income absent from W2",()=>{
    const f=sourceFacts();
    const form2555=sourceFacts({incomeSources:{...f.incomeSources,foreignEmploymentIncomeIncludedOnW2:"50000",foreignEmploymentIncomeNotOnW2:"100000"}});
    const result=calculateFederalTax({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:"50000",socialSecurityWages:"50000",socialSecurityWithheld:"3100",medicareWages:"50000",medicareWithheld:"725"}],form2555});
    expect(result.totalWages.toString()).toBe("150000");
    expect(result.allLines.find(l=>l.form==="1040"&&l.line==="1a")?.value.toString()).toBe("50000");
    expect(result.allLines.find(l=>l.form==="1040"&&l.line==="1h")?.value.toString()).toBe("100000");
    expect(result.totalIncome.toString()).toBe("20000");
    expect(()=>calculateFederalTax({...simpleW2Fixture,form2555:sourceFacts()})).toThrow(/foreign.*W2|W2.*foreign/i);
    expect(()=>calculateFederalTax({...simpleW2Fixture,form2555:{...form2555,taxYear:2026}})).toThrow(/year/i);
  });
  it("uses net exclusions and actual disallowed deductions in the foreign income tax worksheet",()=>{
    const form2555=sourceFacts({qualifiedHousingExpenses:"30000",deductionsAllocableToExcludedIncome:"7000",foreignEarnedIncomeTaxWorksheetDisallowedDeductions:"2000"});
    const result=calculateFederalTax({...simpleW2Fixture,w2s:[{...simpleW2Fixture.w2s[0],wages:"350000",socialSecurityWages:"176100",socialSecurityWithheld:"10918.20",medicareWages:"350000",medicareWithheld:"5075"}],form2555});
    //139200 gross exclusion -7000 allocable deductions =132200 net45;
    //2c=132200-2000=130200; taxable202050; tax332250(85834.75)-tax130200(24095)=61739.75.
    expect(result.form2555?.totalIncomeReduction.toString()).toBe("132200");
    expect(result.taxableIncome.toString()).toBe("202050");
    expect(result.ordinaryTax.toString()).toBe("61740");
    const values=Object.fromEntries(result.allLines.filter(l=>l.form==="FEI Tax WS").map(l=>[l.line,l.value.toString()]));
    expect(values).toMatchObject({"1":"202050","2a":"132200","2b":"2000","2c":"130200","3":"332250","4":"85835","5":"24095","6":"61740"});
  });
  it("routes foreign exclusion through Schedule1 while preserving gross wages and payroll taxes",()=>{
    const base=calculateFederalTax(simpleW2Fixture);
    const r=calculateFederalTax({...simpleW2Fixture,form2555:{foreignEarnedIncome:"85000",qualifyingDays:365,totalDaysInYear:365}});
    expect(r.totalWages.toString()).toBe("85000");
    expect(r.allLines.find(l=>l.form==="1040"&&l.line==="1a")?.value.toString()).toBe("85000");
    expect(r.schedule1?.lines.find(l=>l.line==="8d")?.value.toString()).toBe("-85000");
    expect(r.schedule1?.totalAdditionalIncome.toString()).toBe("-85000");
    expect(r.totalIncome.toString()).toBe("0");
    expect(r.agi.toString()).toBe("0");
    expect(r.form8959?.additionalMedicareTax.toString()).toBe(base.form8959?.additionalMedicareTax.toString());
    // Exclusion must also offset business income when no wages exist.
    const schedule=calculateSchedule1({...simpleW2Fixture,w2s:[]},{schedCNetProfit:d("50000"),form2555IncomeReduction:d("40000")});
    expect(schedule.totalAdditionalIncome.toString()).toBe("10000");
    expect(schedule.lines.find(l=>l.line==="8d")?.value.toString()).toBe("-40000");
  });
  it("routes housing deduction to the official Schedule1 adjustment line",()=>{
    const r=calculateSchedule1(simpleW2Fixture,{form2555HousingDeduction:d("2000")});
    expect(r.lines.find(l=>l.line==="24j")?.value.toString()).toBe("2000");
    expect(r.lines.some(l=>l.line==="24d")).toBe(false);
    expect(r.totalAdjustments.toString()).toBe("2000");
  });
});
