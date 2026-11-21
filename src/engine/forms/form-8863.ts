/** Form8863: actual education eligibility, printed lines and credit-limit worksheet.
 * Spec: spec/federal/form-8863.yaml. No filing qualification is implied by a calculation. */
import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { FilingStatus } from "@/models/constants.js";
import { zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

interface StudentFacts {
  name: string;
  qualifiedExpenses: Decimal;
  studentTaxId?: string;
  studentRole?: "primary" | "spouse" | "dependent";
  studentSsnEligible?: boolean;
  studentTinEligible?: boolean;
  institutionEligible?: boolean;
  expensesEligibilityConfirmed?: boolean;
  form1098TRequirementMet?: boolean;
}
export interface AOCStudent extends StudentFacts {
  priorYearsClaimed?: number;
  institutionEin?: string;
  institutions?: ReadonlyArray<{ ein?: string }>;
  completedFirstFourYearsBeforeYear?: boolean;
  enrolledAtLeastHalfTime?: boolean;
  pursuingDegreeOrCredential?: boolean;
  felonyDrugConviction?: boolean;
}
export interface LLCStudent extends StudentFacts { courseEligibilityConfirmed?: boolean }
export interface Form8863Input {
  aocStudents: AOCStudent[];
  llcExpenses: Decimal;
  llcStudents?: LLCStudent[];
  magi: Decimal;
  filingStatus: FilingStatus;
  taxYear?: number;
  requireAocPriorClaimHistory?: boolean;
  taxLiabilityLimit?: Decimal;
  primarySsnEligible?: boolean;
  spouseSsnEligible?: boolean;
  primaryTinEligible?: boolean;
  canBeClaimedAsDependent?: boolean;
  claimedAsDependent?: boolean;
  nonresidentAlien?: boolean;
  residentJointElection?: boolean;
  aocBanInEffect?: boolean;
  form8862Required?: boolean;
  form8862Completed?: boolean;
  primaryAgeAtYearEnd?: number;
  primaryDateOfBirth?: string;
  refundableAocEligible?: boolean;
  refundableAocFacts?: { fullTimeStudent: boolean; earnedIncome: Decimal; totalSupport: Decimal; parentAlive: boolean };
}
export interface Form8863Result {
  aocPerStudent: Array<{name: string; tentativeCredit: Decimal}>;
  llcPerStudent: Array<{name: string; eligibleExpenses: Decimal}>;
  aocTotalTentative: Decimal;
  aocAfterPhaseOut: Decimal;
  aocNonrefundable: Decimal;
  aocRefundable: Decimal;
  llcTentative: Decimal;
  llcAfterPhaseOut: Decimal;
  nonrefundableBeforeLimit: Decimal;
  totalNonrefundable: Decimal;
  totalRefundable: Decimal;
  refundableAocEligible: boolean;
  sourceFactsVerified: boolean;
  lines: CalculatedLine[];
}
function nonnegative(value: Decimal, label: string): void {
  if (!value.isFinite() || value.isNegative()) throw new Error(`Form8863 ${label} must be finite and nonnegative`);
}
function required(value: unknown, label: string): void {
  if (value === undefined) throw new Error(`Form8863 actual ${label} required for2026`);
}
function studentEligible(student: StudentFacts, strict: boolean): boolean {
  if (strict && student.qualifiedExpenses.gt(0)) {
    if (!student.studentTaxId || !/^\d{9}$/.test(student.studentTaxId.replaceAll("-", ""))) throw new Error("Form8863 actual student identity required for2026");
    required(student.studentRole, "student role");
    required(student.institutionEligible, "student institution facts");
    required(student.expensesEligibilityConfirmed, "student expense facts");
    required(student.form1098TRequirementMet, "student1098T requirement facts");
    if (student.studentRole === "dependent") required(student.studentSsnEligible, "dependent student SSN facts");
    else if (student.studentSsnEligible !== true) required(student.studentTinEligible, "student timely TIN facts");
  }
  return student.institutionEligible !== false && student.expensesEligibilityConfirmed !== false && student.form1098TRequirementMet !== false
    && !(strict && student.studentRole === "dependent" && student.studentSsnEligible === false)
    && student.studentTinEligible !== false;
}
function refundableEligible(input: Form8863Input, year: number, hasAoc: boolean): boolean {
  if (!hasAoc) return false;
  const strict = year >= 2026;
  const joint = input.filingStatus === "married_filing_jointly";
  let age = input.primaryAgeAtYearEnd;
  if (input.primaryDateOfBirth !== undefined) {
    const birth = new Date(`${input.primaryDateOfBirth}T00:00:00Z`);
    if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== input.primaryDateOfBirth ||
        input.primaryDateOfBirth > `${year}-12-31`) {
      throw new Error("Form8863 claimant birth date must be an actual calendar date in or before the return year");
    }
    // A January 1 birthday is attained on December 31 of the previous year.
    age = year - birth.getUTCFullYear() + (input.primaryDateOfBirth.endsWith("-01-01") ? 1 : 0);
  }
  if (strict) required(age, "claimant age for refundable AOC");
  if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 120)) throw new Error("Form8863 claimant age must be an actual whole age");
  let result: boolean | undefined;
  if (joint || (age !== undefined && age >= 24)) result = true;
  else if (age !== undefined && input.refundableAocFacts) {
    const facts = input.refundableAocFacts;
    nonnegative(facts.earnedIncome, "refundable AOC earned income");
    nonnegative(facts.totalSupport, "refundable AOC support");
    const lowEarned = facts.earnedIncome.lt(facts.totalSupport.div(2));
    const restrictedAge = age < 18 || (age === 18 && lowEarned) || (age > 18 && age < 24 && facts.fullTimeStudent && lowEarned);
    result = !(facts.parentAlive && restrictedAge);
  } else if (strict) throw new Error("Form8863 actual claimant support facts required for refundable AOC");
  if (result !== undefined && input.refundableAocEligible !== undefined && result !== input.refundableAocEligible) throw new Error("Form8863 refundable AOC answer does not reconcile with claimant age/support facts");
  return result ?? input.refundableAocEligible ?? true;
}
export function calculateForm8863(input: Form8863Input): Form8863Result {
  const year = input.taxYear ?? 2025;
  if (year !== 2025 && year !== 2026) throw new Error("Form8863 unsupported tax year");
  const strict = year >= 2026;
  const audit = new AuditTrail();
  if (!input.magi.isFinite()) throw new Error("Form8863 MAGI must be finite");
  nonnegative(input.llcExpenses, "LLC expenses");
  for (const s of [...input.aocStudents, ...(input.llcStudents ?? [])]) nonnegative(s.qualifiedExpenses, "student expenses");
  if (input.taxLiabilityLimit !== undefined) nonnegative(input.taxLiabilityLimit, "tax liability limit");
  const hasExpenses = input.aocStudents.some(s => s.qualifiedExpenses.gt(0)) || input.llcExpenses.gt(0) || (input.llcStudents ?? []).some(s => s.qualifiedExpenses.gt(0));
  const joint = input.filingStatus === "married_filing_jointly";
  if (strict && hasExpenses && input.filingStatus !== "married_filing_separately") {
    required(input.taxLiabilityLimit, "tax liability limit");
    required(input.claimedAsDependent, "actual claimant dependency claim");
    required(input.nonresidentAlien, "claimant residency facts");
    if (input.primarySsnEligible !== true && !(joint && input.spouseSsnEligible === true)) {
      required(input.primarySsnEligible, "claimant SSN eligibility");
      if (joint) required(input.spouseSsnEligible, "spouse SSN eligibility");
    }
  }
  const claimantEligible = input.filingStatus !== "married_filing_separately" && input.claimedAsDependent !== true
    && !(input.nonresidentAlien === true && !(joint && input.residentJointElection === true))
    && (!strict || input.primarySsnEligible === true || (joint && input.spouseSsnEligible === true));
  const seen = new Set<string>();
  for (const s of [...input.aocStudents, ...(input.llcStudents ?? [])]) {
    if (!s.studentTaxId) continue;
    const id = s.studentTaxId.replaceAll("-", "");
    if (seen.has(id)) throw new Error("Form8863 duplicate student: only one credit per student is allowed");
    seen.add(id);
  }
  if (strict && input.aocStudents.some(s => s.qualifiedExpenses.gt(0)) && claimantEligible) {
    required(input.aocBanInEffect, "AOC ban facts"); required(input.form8862Required, "Form8862 requirement");
  }
  if (input.form8862Required && input.form8862Completed !== true && input.aocStudents.some(s => s.qualifiedExpenses.gt(0))) throw new Error("Form8863 required Form8862 must be completed before AOC claim");
  const upper = new Decimal(joint ? 180000 : 90000);
  const range = new Decimal(joint ? 20000 : 10000);
  const remaining = zeroFloor(upper.minus(input.magi));
  const factor = claimantEligible ? Decimal.min(1,remaining.div(range)) : new Decimal(0);
  const aocPerStudent = input.aocStudents.map((student, index) => {
    const sourceEligible = studentEligible(student, strict && claimantEligible);
    const summaryInstitutionEin = student.institutionEin?.replaceAll("-", "");
    if (strict && claimantEligible && student.qualifiedExpenses.gt(0)) {
      for (const field of ["priorYearsClaimed", "completedFirstFourYearsBeforeYear", "enrolledAtLeastHalfTime", "pursuingDegreeOrCredential", "felonyDrugConviction"] as const) required(student[field], `student facts: ${field}`);
      if (!summaryInstitutionEin || !/^\d{9}$/.test(summaryInstitutionEin)) throw new Error("Form8863 actual institution EIN required for AOC");
    }
    const priorYears = student.priorYearsClaimed;
    if (priorYears !== undefined && (!Number.isInteger(priorYears) || priorYears < 0)) throw new Error("Form8863 prior claim years must be a nonnegative integer");
    const eligibleApartFromHistory = claimantEligible && sourceEligible && input.aocBanInEffect !== true
      && (strict || input.primaryTinEligible !== false) && student.completedFirstFourYearsBeforeYear !== true
      && student.enrolledAtLeastHalfTime !== false && student.pursuingDegreeOrCredential !== false && student.felonyDrugConviction !== true;
    const adjustedExpenses = roundDollar(Decimal.min(student.qualifiedExpenses, 4000));
    if (input.requireAocPriorClaimHistory && priorYears === undefined && eligibleApartFromHistory && adjustedExpenses.gt(0) && factor.gt(0)) {
      throw new Error(`Form 8863 requires actual prior AOC claim history for student ${index + 1}`);
    }
    const meetsHistoryLimit = priorYears === undefined ? !input.requireAocPriorClaimHistory : priorYears < 4;
    const eligible = eligibleApartFromHistory && meetsHistoryLimit;
    const line27 = eligible ? adjustedExpenses : new Decimal(0);
    const line28 = zeroFloor(line27.minus(2000));
    const line29 = roundDollar(line28.times("0.25"));
    const credit = line28.isZero() ? line27 : new Decimal(2000).plus(line29);
    audit.record("Form 8863", "27", `Adjusted AOC expenses for ${student.name}`, line27, "min(actual adjusted qualified expenses,4000), if eligible");
    audit.record("Form 8863", "28", `Second-tier expenses for ${student.name}`, line28, "max(0,line27-2000)");
    audit.record("Form 8863", "29", `Second-tier credit for ${student.name}`, line29, "round(line28*0.25)");
    audit.record("Form 8863", "30", `AOC for ${student.name}`, credit, eligible ? "100% of first $2K + 25% of next $2K" : "Ineligible under actual AOC qualification facts", {
      "Qualified expenses": student.qualifiedExpenses,
      "Prior AOC years claimed": priorYears === undefined ? "Unknown" : new Decimal(priorYears),
      "Current-year AOC eligible": eligible ? "yes" : "no",
    });
    return {name:student.name,tentativeCredit:credit};
  });
  const aocTotalTentative = aocPerStudent.reduce((total,s)=>total.plus(s.tentativeCredit), new Decimal(0));
  const aocAfterPhaseOut = roundDollar(aocTotalTentative.times(factor));
  if (strict && aocAfterPhaseOut.gt(0)) {
    input.aocStudents.forEach((student, index) => {
      if (!student.institutions || !aocPerStudent[index].tentativeCredit.gt(0)) return;
      if (student.institutions.some(institution => !/^\d{2}-?\d{7}$/.test(institution.ein ?? ""))) {
        throw new Error("Form 8863 requires an actual EIN for every AOTC institution");
      }
      const summaryInstitutionEin = student.institutionEin?.replaceAll("-", "");
      if (!student.institutions.some(institution => institution.ein?.replaceAll("-", "") === summaryInstitutionEin)) {
        throw new Error("Form 8863 requires a school record matching the AOTC summary EIN");
      }
    });
  }
  const refundEligible = refundableEligible(input, year, aocAfterPhaseOut.gt(0));
  const aocRefundable = refundEligible ? roundDollar(aocAfterPhaseOut.times("0.40")) : new Decimal(0);
  const aocNonrefundable = aocAfterPhaseOut.minus(aocRefundable);
  let llcEligibleExpenses = input.llcExpenses;
  const llcPerStudent: Form8863Result["llcPerStudent"] = [];
  if (strict && input.llcExpenses.gt(0) && !input.llcStudents) throw new Error("Form8863 actual LLC student records required for2026");
  if (input.llcStudents) {
    const actualTotal = input.llcStudents.reduce((total,s)=>total.plus(s.qualifiedExpenses),new Decimal(0));
    if (!actualTotal.eq(input.llcExpenses)) throw new Error("Form8863 LLC student amounts do not reconcile with LLC total");
    llcEligibleExpenses = input.llcStudents.reduce((total,student)=>{
      const sourceEligible = studentEligible(student,strict && claimantEligible);
      if (strict && claimantEligible && student.qualifiedExpenses.gt(0)) required(student.courseEligibilityConfirmed,"LLC course eligibility");
      const eligible = claimantEligible && sourceEligible && student.courseEligibilityConfirmed !== false;
      const amount = eligible ? roundDollar(student.qualifiedExpenses) : new Decimal(0);
      llcPerStudent.push({name:student.name,eligibleExpenses:amount});
      audit.record("Form 8863","31",`LLC adjusted expenses for ${student.name}`,amount,"Actual adjusted eligible expenses for this separate student");
      return total.plus(amount);
    },new Decimal(0));
  }
  if (!claimantEligible) llcEligibleExpenses = new Decimal(0);
  const llcCapped = Decimal.min(llcEligibleExpenses,10000);
  const llcTentative = roundDollar(llcCapped.times("0.20"));
  const llcAfterPhaseOut = roundDollar(llcTentative.times(factor));
  const nonrefundableBeforeLimit = aocNonrefundable.plus(llcAfterPhaseOut);
  const totalNonrefundable = Decimal.min(nonrefundableBeforeLimit,input.taxLiabilityLimit ?? nonrefundableBeforeLimit);
  const entries: Array<[string,string,Decimal,string]> = [
    ["1","Total tentative AOC",aocTotalTentative,"Sum PartIIIline30"],["2","AOC MAGI upper limit",upper,"180000 joint;90000 otherwise"],["3","Education MAGI",input.magi,"AGI plus actual excluded income and housing adjustments"],
    ["4","AOC remaining phase-out range",remaining,"max(0,line2-line3)"],["5","AOC phase-out band",range,"20000 joint;10000 otherwise"],["6","AOC phase-out factor",factor,"min(1,line4/line5), at least3 decimal places"],
    ["7","AOC after phase-out",aocAfterPhaseOut,"round(line1*line6)"],["8","Refundable AOC",aocRefundable,"If eligible round(line7*0.40); Form1040line29"],["9","Nonrefundable AOC before tax limit",aocNonrefundable,"line7-line8"],
    ["10","LLC adjusted qualified expenses",llcEligibleExpenses,"Sum eligible PartIIIline31"],["11","Capped LLC expenses",llcCapped,"min(line10,10000)"],["12","Tentative LLC",llcTentative,"round(line11*0.20)"],
    ["13","LLC MAGI upper limit",upper,"180000 joint;90000 otherwise"],["14","Education MAGI for LLC",input.magi,"Same actual MAGI asline3"],["15","LLC remaining phase-out range",remaining,"max(0,line13-line14)"],["16","LLC phase-out band",range,"20000 joint;10000 otherwise"],["17","LLC phase-out factor",factor,"min(1,line15/line16), at least3 decimal places"],["18","LLC after phase-out",llcAfterPhaseOut,"round(line12*line17)"],["19","Allowed nonrefundable education credit",totalNonrefundable,"min(line9+line18,actual remaining tax liability); Schedule3line3"]
  ];
  for(const [line,description,value,formula] of entries) audit.record("Form 8863",line,description,value,formula);
  return {aocPerStudent,llcPerStudent,aocTotalTentative,aocAfterPhaseOut,aocNonrefundable,aocRefundable,llcTentative,llcAfterPhaseOut,nonrefundableBeforeLimit,totalNonrefundable,totalRefundable:aocRefundable,refundableAocEligible:refundEligible,sourceFactsVerified:strict && claimantEligible && hasExpenses,lines:audit.getLines()};
}
