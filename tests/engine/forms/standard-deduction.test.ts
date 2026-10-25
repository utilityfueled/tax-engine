import {describe,it,expect} from "vitest";
import {calculateStandardDeduction} from "@/engine/forms/standard-deduction.js";
import {getConstants} from "@/models/constants.js";
import {FEDERAL_2026_CONSTANTS} from "@/models/federal-2026-indexed.js";
import {TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../../fixtures/simple-w2.js";
// Spec: spec/federal/standard-deduction.yaml
const facts={primaryBlind:false,spouseBlind:false,primaryCanBeClaimedAsDependent:false,spouseCanBeClaimedAsDependent:false,dualStatusAlien:false,nonresidentAlien:false,shortTaxYear:false,primaryDeathDate:null,spouseDeathDate:null,spouseItemizes:false,claimSpouseAdditionalDeduction:false};
const taxpayer=(year=2026,status="single",birth="1990-01-15")=>({...simpleW2Fixture.taxpayer,taxYear:year,filingStatus:status as typeof simpleW2Fixture.taxpayer.filingStatus,primary:{...simpleW2Fixture.taxpayer.primary,dateOfBirth:birth}});
const calc=(changes:Partial<Parameters<typeof calculateStandardDeduction>[0]>={})=>calculateStandardDeduction({taxpayer:taxpayer(),constants:FEDERAL_2026_CONSTANTS,facts,...changes});
describe("Actual standard deduction",()=>{
 it("applies dependent minimum earned-income addition and ordinary status cap",()=>{
  for(const [earned,expected] of [["0","1350"],["900","1350"],["901","1351"],["5000","5450"],["50000","16100"],["-1000","1350"]]) expect(calc({facts:{...facts,primaryCanBeClaimedAsDependent:true,dependentEarnedIncome:earned}}).standardDeduction.toString()).toBe(expected);
  expect(()=>calc({facts:{...facts,primaryCanBeClaimedAsDependent:true}})).toThrow(/earned.income/i);
 });
 it("uses the day-before birthday and actual death date for age65",()=>{
  expect(calc({taxpayer:taxpayer(2026,"single","1962-01-01")}).standardDeduction.toString()).toBe("18150");
  expect(calc({taxpayer:taxpayer(2026,"single","1962-01-02")}).standardDeduction.toString()).toBe("16100");
  expect(calc({taxpayer:taxpayer(2026,"single","1961-02-14"),facts:{...facts,primaryDeathDate:"2026-02-13"}}).standardDeduction.toString()).toBe("18150");
  expect(calc({taxpayer:taxpayer(2026,"single","1961-02-14"),facts:{...facts,primaryDeathDate:"2026-02-12"}}).standardDeduction.toString()).toBe("16100");
 });
 it("matches the IRS blind-dependent and married examples",()=>{
  const c2025=getConstants(2025);
  expect(calc({taxpayer:taxpayer(2025),constants:c2025,facts:{...facts,primaryBlind:true,primaryCanBeClaimedAsDependent:true,dependentEarnedIncome:"2900"}}).standardDeduction.toString()).toBe("5350");
  const joint={...taxpayer(2025,"married_filing_jointly"),spouse:{...simpleW2Fixture.taxpayer.primary,dateOfBirth:"1991-02-01"}};
  expect(calc({taxpayer:joint,constants:c2025,facts:{...facts,spouseBlind:true}}).standardDeduction.toString()).toBe("33100");
  const aged={...taxpayer(2026,"married_filing_jointly","1950-05-01"),spouse:{...simpleW2Fixture.taxpayer.primary,dateOfBirth:"1951-05-01"}};
  expect(calc({taxpayer:aged,facts:{...facts,primaryBlind:true,spouseBlind:true}}).standardDeduction.toString()).toBe("38800");
  expect(calc({taxpayer:taxpayer(2026,"qualifying_surviving_spouse","1950-05-01")}).standardDeduction.toString()).toBe("33850");
 });
 it("disallows standard deduction for actual spouse itemization and residency exceptions",()=>{
  expect(calc({taxpayer:taxpayer(2026,"married_filing_separately","1950-05-01"),facts:{...facts,spouseItemizes:true,primaryBlind:true}}).standardDeduction.toString()).toBe("0");
  for(const key of ["dualStatusAlien","nonresidentAlien","shortTaxYear"] as const) expect(calc({facts:{...facts,[key]:true}}).eligibleForStandardDeduction).toBe(false);
  const joint={...taxpayer(2026,"married_filing_jointly"),spouse:{...simpleW2Fixture.taxpayer.primary}};
  expect(calc({taxpayer:joint,facts:{...facts,nonresidentAlien:true,residentJointElection:true}}).standardDeduction.toString()).toBe("32200");
 });
 it("requires actual relevant2026 facts and preserves them in the model",()=>{
  expect(()=>calc({facts:undefined})).toThrow(/actual.*facts/i);
  expect(()=>calc({facts:{...facts,primaryBlind:undefined}})).toThrow(/blind/i);
  expect(()=>calc({facts:{...facts,primaryDeathDate:undefined}})).toThrow(/death/i);
  const parsed=TaxYearInputSchema.parse({...simpleW2Fixture,standardDeductionFacts:facts,deductionElection:"itemized"});
  expect(parsed.standardDeductionFacts).toEqual(facts);expect(parsed.deductionElection).toBe("itemized");
 });
 it("requires actual MFS spouse facts before taking extra spouse boxes",()=>{
  const separate={...taxpayer(2026,"married_filing_separately"),spouse:{...simpleW2Fixture.taxpayer.primary,dateOfBirth:"1950-06-01"}};
  const spouseFacts={...facts,claimSpouseAdditionalDeduction:true,spouseHasGrossIncome:false,spouseFilesReturn:false,spouseBlind:true};
  expect(calc({taxpayer:separate,facts:spouseFacts}).standardDeduction.toString()).toBe("19400");
  expect(()=>calc({taxpayer:separate,facts:{...spouseFacts,spouseHasGrossIncome:undefined}})).toThrow(/spouse/i);
  expect(()=>calc({taxpayer:separate,facts:{...spouseFacts,spouseFilesReturn:true}})).toThrow(/spouse/i);
 });
});
