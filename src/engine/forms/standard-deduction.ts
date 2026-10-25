/** Form1040 standard deduction: spec/federal/standard-deduction.yaml. */
import Decimal from "decimal.js";
import type {TaxYearInput} from "@/models/inputs.js";
import type {YearConstants} from "@/models/constants.js";
import type {CalculatedLine} from "@/models/outputs.js";
import {AuditTrail} from "@/utils/audit.js";
import {d,roundDollar} from "@/utils/decimal.js";
interface StandardDeductionInput {
  taxpayer: TaxYearInput["taxpayer"];
  facts?: TaxYearInput["standardDeductionFacts"];
  constants: YearConstants;
}
export interface StandardDeductionResult {
  eligibleForStandardDeduction: boolean;
  baseDeduction: Decimal;
  additionalDeduction: Decimal;
  standardDeduction: Decimal;
  additionalBoxes: number;
  dependentLimited: boolean;
  lines: CalculatedLine[];
}
function actual(value: unknown,label: string): void {
  if (value === undefined) throw new Error(`Standard deduction actual ${label} is unknown`);
}
function date(value: string,label:string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Standard deduction ${label} must be an actual ISO date`);
  const parsed=new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw new Error(`Standard deduction ${label} is invalid`);
  return parsed;
}
function age65(birth:string,death:string|null|undefined,year:number):boolean {
  const born=date(birth,"birth date");
  const reference=death ? date(death,"death date") : new Date(Date.UTC(year,11,31));
  if (death && (reference.getUTCFullYear()!==year || reference<born)) throw new Error("Standard deduction death date must be in the return year and after birth");
  if (born>reference) throw new Error("Standard deduction birth date is after the tax period");
  const sixtyFifthBirthday=Date.UTC(born.getUTCFullYear()+65,born.getUTCMonth(),born.getUTCDate());
  return reference.getTime() >= sixtyFifthBirthday-86400000;
}
export function calculateStandardDeduction(input: StandardDeductionInput):StandardDeductionResult {
  const {taxpayer,constants}=input;
  const year=taxpayer.taxYear;
  if(year!==2025 && year!==2026) throw new Error("Standard deduction unsupported tax year");
  const strict=year===2026;
  if(strict && !input.facts) throw new Error("Standard deduction actual relevant facts are required for2026");
  const facts=input.facts ?? {};
  const joint=taxpayer.filingStatus==="married_filing_jointly";
  const separate=taxpayer.filingStatus==="married_filing_separately";
  if(strict) {
    for(const key of ["dualStatusAlien","nonresidentAlien","shortTaxYear"] as const) actual(facts[key],key);
    if(separate) actual(facts.spouseItemizes,"spouse itemization");
    if((facts.dualStatusAlien || facts.nonresidentAlien) && joint) actual(facts.residentJointElection,"resident joint election");
  }
  const alienWithoutElection=(facts.dualStatusAlien===true || facts.nonresidentAlien===true) && !(joint && facts.residentJointElection===true);
  const eligible=!(separate && facts.spouseItemizes===true) && facts.shortTaxYear!==true && !alienWithoutElection;
  const audit=new AuditTrail();
  if(!eligible) {
    audit.record("Standard Deduction Worksheet","eligibility","Standard deduction unavailable",d(0),"Spouse itemizes, short accounting year or nonresident/dualstatus without joint resident election");
    return {eligibleForStandardDeduction:false,baseDeduction:d(0),additionalDeduction:d(0),standardDeduction:d(0),additionalBoxes:0,dependentLimited:false,lines:audit.getLines()};
  }
  if(strict) {
    actual(facts.primaryBlind,"primary blindness");
    actual(facts.primaryCanBeClaimedAsDependent,"primary dependency");
    actual(facts.primaryDeathDate,"primary death status");
    if(joint) { actual(facts.spouseBlind,"spouse blindness");actual(facts.spouseCanBeClaimedAsDependent,"spouse dependency");actual(facts.spouseDeathDate,"spouse death status"); }
    if(separate) actual(facts.claimSpouseAdditionalDeduction,"MFS spouse additional deduction election");
  }
  if(joint && !taxpayer.spouse) throw new Error("Standard deduction joint return requires actual spouse identity");
  const dependentLimited=facts.primaryCanBeClaimedAsDependent===true || (joint && facts.spouseCanBeClaimedAsDependent===true);
  let base=constants.standardDeduction[taxpayer.filingStatus];
  if(dependentLimited) {
    actual(facts.dependentEarnedIncome,"dependent earned-income worksheet");
    const earned=d(facts.dependentEarnedIncome);
    if(!earned.isFinite()) throw new Error("Standard deduction earned income must be finite");
    base=Decimal.min(base,Decimal.max(constants.dependentStandardDeduction.minimum,earned.plus(constants.dependentStandardDeduction.earnedIncomeAddition)));
  }
  let boxes=Number(age65(taxpayer.primary.dateOfBirth,facts.primaryDeathDate,year))+Number(facts.primaryBlind===true);
  const claimSeparateSpouse=separate && facts.claimSpouseAdditionalDeduction===true;
  if(claimSeparateSpouse) {
    actual(facts.spouseHasGrossIncome,"MFS spouse gross-income facts");
    actual(facts.spouseFilesReturn,"MFS spouse return facts");
    actual(facts.spouseCanBeClaimedAsDependent,"MFS spouse dependency facts");
    actual(facts.spouseBlind,"MFS spouse blindness");
    actual(facts.spouseDeathDate,"MFS spouse death status");
    if(facts.spouseHasGrossIncome || facts.spouseFilesReturn || facts.spouseCanBeClaimedAsDependent) throw new Error("Standard deduction MFS spouse extra boxes are unavailable under actual spouse facts");
  }
  if(joint || claimSeparateSpouse) {
    if(!taxpayer.spouse) throw new Error("Standard deduction actual spouse identity required for extra boxes");
    boxes+=Number(age65(taxpayer.spouse.dateOfBirth,facts.spouseDeathDate,year))+Number(facts.spouseBlind===true);
  }
  const unmarried=taxpayer.filingStatus==="single" || taxpayer.filingStatus==="head_of_household";
  const addition=(unmarried ? constants.additionalStandardDeduction.unmarried : constants.additionalStandardDeduction.marriedOrSurvivingSpouse).times(boxes);
  const standardDeduction=roundDollar(base.plus(addition));
  audit.record("Standard Deduction Worksheet","base","Base standard deduction",base,dependentLimited ? "min(status base,max(dependent minimum,actual earned income+addition))" : "Tax-year filing-status base amount");
  audit.record("Standard Deduction Worksheet","additional","Age65 and blindness addition",addition,"Actual eligible boxes times indexed per-box amount",{"Eligible boxes":d(boxes)});
  audit.record("Standard Deduction Worksheet","total","Standard deduction",standardDeduction,"round(base+age/blind additions)");
  return {eligibleForStandardDeduction:true,baseDeduction:base,additionalDeduction:addition,standardDeduction,additionalBoxes:boxes,dependentLimited,lines:audit.getLines()};
}
