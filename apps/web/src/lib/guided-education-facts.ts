import Decimal from "decimal.js";
import { educationStudentReturnName } from "@/utils/education-student-return-name";
import type { CreditsData, EducationCreditData, EducationStudentSourceData, FilingStatus, GuidedFlowState, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";
import { combineGivenNameWithMiddleInitial } from "./guided-taxpayer-identity";

export const LLC_YEAR_FACTS_VERSION = 3;

export function requiresLlcYearReview(state: GuidedFlowState): boolean {
  return state.factsVersion !== LLC_YEAR_FACTS_VERSION && !!state.sectionData.credits?.education?.llcStudents?.length;
}

const present = (value: string | undefined) => !!value?.trim();
function validAmount(value: string | undefined) { if (!present(value)) return false; try { return parseGuidedCurrency(value).gte(0); } catch { return false; } }
function amount(value: string | undefined) { parseGuidedCurrency(value); return (value ?? "").trim().replace(/,/g, ""); }
const cleanId = (value: string | undefined) => value?.trim().replace(/-/g, "") ?? "";

function householdStudent(student: EducationStudentSourceData, personal: PersonalInfoData) {
  const id = cleanId(student.studentTaxId);
  if (student.studentRole === "dependent") return personal.dependents?.find(dependent => cleanId(dependent.ssn) === id);
  if (student.studentRole === "spouse" && personal.spouse && cleanId(personal.spouse.ssn) === id) return personal.spouse;
  if (student.studentRole === "primary" && cleanId(personal.ssn) === id) {
    return { firstName: combineGivenNameWithMiddleInitial(personal.firstName, personal.middleName), lastName: personal.lastName };
  }
  return undefined;
}

export function requiresAotcClaimantYearReview(education: EducationCreditData | undefined, taxYear?: number | null): boolean {
  return !!education && Number.isInteger(taxYear) && education.aotcClaimantFactsTaxYear !== taxYear &&
    education.aocStudents.some(student => validAmount(student.qualifiedExpenses) && parseGuidedCurrency(student.qualifiedExpenses).gt(0));
}

export function educationFactErrors(data: CreditsData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  const errors: Record<string, string> = {}, education = data?.education;
  if (!education) return errors;
  const aoc = education.aocStudents, llc = education.llcStudents ?? [];
  const { primarySsnEligible, spouseSsnEligible } = education;
  const claimantMayQualifyForAoc = filingStatus !== "mfs" && education.claimedAsDependent !== true && education.aocBanInEffect !== true
    && (education.nonresidentAlien !== true || (filingStatus === "mfj" && education.residentJointElection !== false))
    && (taxYear === 2026
      ? education.primarySsnEligible !== false || (filingStatus === "mfj" && education.spouseSsnEligible !== false)
      : education.primaryTinEligible !== false);
  let totalLlc = new Decimal(0);
  let hasPositiveStudentExpenses = false;
  const ids = new Set<string>();
  function studentFacts(student: EducationStudentSourceData, key: string, potentiallyEligibleAoc = false) {
    if (!student.name.trim()) errors[`${key}-name`] = "Enter the actual student name.";
    const hasValidExpenses = validAmount(student.qualifiedExpenses);
    const hasPositiveExpenses = hasValidExpenses && parseGuidedCurrency(student.qualifiedExpenses).gt(0);
    hasPositiveStudentExpenses ||= hasPositiveExpenses;
    if (!hasValidExpenses) errors[`${key}-amount`] = "Enter actual qualified education expenses, including zero.";
    const id = cleanId(student.studentTaxId);
    if (!/^\d{9}$/.test(id)) errors[`${key}-id`] = "Enter the student's actual SSN, ITIN or ATIN.";
    if (ids.has(id) && id) errors[`${key}-duplicate`] = "Only one credit per student is allowed; remove the duplicate student.";
    ids.add(id);
    if (!["primary", "spouse", "dependent"].includes(student.studentRole ?? "") || (student.studentRole === "spouse" && filingStatus && filingStatus !== "mfj")) errors[`${key}-role`] = "Choose the student's actual household role.";
    if (personal && student.studentRole) {
      const adult = student.studentRole === "primary" ? personal : student.studentRole === "spouse" ? personal.spouse : undefined;
      const actual = householdStudent(student, personal);
      if (!actual) errors[`${key}-household`] = "Student identity must match the actual return household role.";
      else if (adult && hasPositiveExpenses && (student.studentRole === "primary" || filingStatus === "mfj")) {
        const studentTin = taxYear === 2026 && student.studentSsnEligible === true ? true : student.studentTinEligible;
        if ((taxYear === 2025 || taxYear === 2026) && typeof adult.tinIssuedByDueDate === "boolean" &&
          typeof studentTin === "boolean" && adult.tinIssuedByDueDate !== studentTin) {
          errors[`${key}-tin`] = "Reconcile the student's timely TIN answer with the same person's Personal Info answer.";
        }
        const claimantSsn = (student.studentRole === "primary" ? primarySsnEligible : spouseSsnEligible)
          ?? adult.employmentValidSsnIssuedByDueDate;
        if (taxYear === 2026 && typeof claimantSsn === "boolean" && typeof student.studentSsnEligible === "boolean" &&
          student.studentSsnEligible !== claimantSsn) {
          errors[`${key}-ssn`] = "Reconcile the student's employment-valid SSN answer with the same person's claimant answer.";
        }
      }
      if (taxYear === 2026 && hasPositiveExpenses && actual && !educationStudentReturnName(student.name, actual)) {
        errors[`${key}-name`] = "Enter the student's name as shown on the return.";
      }
    }
    if (taxYear === 2026 && hasPositiveExpenses && student.studentSsnEligible === true && student.studentTinEligible === false) {
      errors[`${key}-tin`] = "Reconcile the student's employment-valid SSN and timely TIN answers.";
    }
    for (const field of ["institutionEligible", "expensesEligibilityConfirmed", "form1098TRequirementMet"] as const) if (typeof student[field] !== "boolean") errors[`${key}-${field}`] = "Confirm actual institution, net qualified expenses and Form 1098-T requirements.";
    if (taxYear === 2026 && student.studentRole === "dependent" && typeof student.studentSsnEligible !== "boolean") errors[`${key}-ssn`] = "Confirm the dependent student's employment-valid SSN was issued by the due date.";
    if (taxYear === 2026 && student.studentRole !== "dependent" && student.studentSsnEligible !== true && typeof student.studentTinEligible !== "boolean") errors[`${key}-tin`] = "Confirm the primary or spouse student's actual timely TIN.";
    if (taxYear !== 2026 && typeof student.studentTinEligible !== "boolean") errors[`${key}-tin`] = "Confirm the student's timely TIN for 2025; an ITIN is not an employment SSN.";
    if (!student.institutions?.length) errors[`${key}-institutions`] = "Enter the actual educational institution records.";
    const requireEveryEin = potentiallyEligibleAoc && hasPositiveExpenses;
    for (const institution of student.institutions ?? []) {
      const requireEin = requireEveryEin || present(institution.ein) || institution.receivedCurrentYear1098T || institution.receivedPriorYear1098TWithBox7;
      if (!institution.name.trim() || !institution.address.trim()
        || (requireEin && !/^\d{2}-?\d{7}$/.test(institution.ein?.trim() ?? ""))
        || typeof institution.receivedCurrentYear1098T !== "boolean" || typeof institution.receivedPriorYear1098TWithBox7 !== "boolean") {
        errors[`${key}-institutions`] = requireEveryEin
          ? "For each AOTC institution, enter its actual name, address, EIN and both Form 1098-T receipt answers."
          : "Enter actual institution name, address, EIN when a Form 1098-T was received, and both receipt answers.";
      }
    }
  }
  aoc.forEach((student, index) => {
    const key = `student-${index}`;
    // Prior claim history is never a default: preserve the existing legacy reconfirmation gate.
    if (!student.name.trim()) errors[`${key}-name`] = "Enter the actual student name.";
    const hasValidExpenses = validAmount(student.qualifiedExpenses);
    if (!hasValidExpenses) errors[`${key}-amount`] = "Enter actual qualified education expenses, including zero.";
    if (!/^[0-4]$/.test(student.priorYearsClaimed) || student.requiresPriorYearsConfirmation) errors[`${key}-history`] = "Confirm actual prior AOTC claim history (0–4); older prefilled zero requires reconfirmation.";
    if (student.sourceFactsConfirmed !== undefined && student.sourceFactsConfirmed !== true) errors[`${key}-source-review`] = "Review and confirm the actual AOTC education records for this student and tax year.";
    const enrollmentAllowsAoc = student.priorYearsClaimed !== "4" && student.completedFirstFourYearsBeforeYear !== true
      && student.enrolledAtLeastHalfTime !== false && student.pursuingDegreeOrCredential !== false && student.felonyDrugConviction !== true;
    const sourceFactsAllowAoc = student.institutionEligible !== false && student.expensesEligibilityConfirmed !== false
      && student.form1098TRequirementMet !== false && student.studentTinEligible !== false
      && !(taxYear === 2026 && student.studentRole === "dependent" && student.studentSsnEligible === false);
    studentFacts(student, key, claimantMayQualifyForAoc && enrollmentAllowsAoc && sourceFactsAllowAoc);
    if (taxYear === 2025 && student.studentRole === "dependent" && student.studentTinEligible === true
      && hasValidExpenses && parseGuidedCurrency(student.qualifiedExpenses).gt(0)) {
      const studentId = cleanId(student.studentTaxId);
      if (/^\d{9}$/.test(studentId) && personal?.dependents?.some(dependent => cleanId(dependent.ssn) === studentId
        && dependent.qualifiesForODC === true && dependent.odcTinEligible === false)) {
        errors[`${key}-tin`] = "Reconcile this student's timely TIN answer with the Credit for Other Dependents answer in Personal Info.";
      }
    }
    for (const field of ["completedFirstFourYearsBeforeYear", "enrolledAtLeastHalfTime", "pursuingDegreeOrCredential", "felonyDrugConviction"] as const) if (typeof student[field] !== "boolean") errors[`${key}-${field}`] = "Confirm all actual AOTC eligibility facts.";
    if (!/^\d{9}$/.test(cleanId(student.institutionEin)) || !student.institutions?.some(institution => cleanId(institution.ein) === cleanId(student.institutionEin))) errors[`${key}-ein`] = "Enter the actual AOTC institution EIN and matching institution record.";
  });
  llc.forEach((student, index) => { studentFacts(student, `llc-${index}`); if (typeof student.courseEligibilityConfirmed !== "boolean") errors[`llc-${index}-course`] = "Confirm actual postsecondary or job-skills course eligibility."; if (validAmount(student.qualifiedExpenses)) totalLlc = totalLlc.plus(parseGuidedCurrency(student.qualifiedExpenses)); });
  if (present(education.llcExpenses) && (!validAmount(education.llcExpenses) || !totalLlc.eq(parseGuidedCurrency(education.llcExpenses)))) errors.llcExpenses = "Reconcile the saved Lifetime Learning total to actual individual student expenses.";
  if (!aoc.length && !llc.length && (!validAmount(education.llcExpenses) || parseGuidedCurrency(education.llcExpenses).isZero())) return errors;
  for (const field of ["canBeClaimedAsDependent", "claimedAsDependent", "nonresidentAlien"] as const) if (typeof education[field] !== "boolean") errors[field] = "Confirm the taxpayer's actual dependency and residency facts, including whether another return actually claims the taxpayer.";
  if (education.nonresidentAlien && filingStatus === "mfj" && typeof education.residentJointElection !== "boolean") errors.residentJointElection = "Confirm whether the actual resident joint-return election applies.";
  if (!validAmount(education.possessionIncomeExclusion)) errors.educationPossessionExclusion = "Enter the actual education MAGI possession-income exclusion, including zero.";
  if (taxYear === 2026) {
    if (typeof education.primarySsnEligible !== "boolean") errors.primarySsnEligible = "Confirm the taxpayer's employment-valid SSN eligibility.";
    if (filingStatus === "mfj" && typeof education.spouseSsnEligible !== "boolean") errors.spouseSsnEligible = "Confirm the spouse's employment-valid SSN eligibility.";
    if (hasPositiveStudentExpenses && primarySsnEligible === true && personal?.tinIssuedByDueDate === false) {
      errors.primarySsnEligible = "Reconcile the taxpayer's employment-valid SSN and timely TIN answers.";
    }
    if (hasPositiveStudentExpenses && filingStatus === "mfj" && spouseSsnEligible === true && personal?.spouse?.tinIssuedByDueDate === false) {
      errors.spouseSsnEligible = "Reconcile the spouse's employment-valid SSN and timely TIN answers.";
    }
  } else if (aoc.length && typeof education.primaryTinEligible !== "boolean") errors.primaryTinEligible = "Confirm the taxpayer's actual timely TIN for 2025.";
  for (const [actual, answer, label] of [
    [personal?.employmentValidSsnIssuedByDueDate, education.primarySsnEligible, "taxpayer SSN"],
    [filingStatus === "mfj" ? personal?.spouse?.employmentValidSsnIssuedByDueDate : undefined, education.spouseSsnEligible, "spouse SSN"],
    [personal?.tinIssuedByDueDate, education.primaryTinEligible, "taxpayer TIN"],
    [personal?.standardDeductionFacts?.primaryCanBeClaimedAsDependent, education.canBeClaimedAsDependent, "claimable dependency"],
    [personal?.standardDeductionFacts?.nonresidentAlien, education.nonresidentAlien, "nonresident status"],
    [personal?.standardDeductionFacts?.residentJointElection, education.residentJointElection, "resident joint election"],
  ] as const) if (typeof actual === "boolean" && typeof answer === "boolean" && actual !== answer) errors[`education-${label}`] = `Reconcile the ${label} answer with the actual personal-information facts.`;
  if (aoc.length) {
    for (const field of ["aocBanInEffect", "form8862Required"] as const) if (typeof education[field] !== "boolean") errors[field] = "Confirm actual AOTC prior-disallowance history.";
    if (education.form8862Required && typeof education.form8862Completed !== "boolean") errors.form8862Completed = "Confirm whether the required Form 8862 is complete.";
    const dob = personal?.dateOfBirth, age = taxYear && dob && /^\d{4}-\d{2}-\d{2}$/.test(dob) ? taxYear - Number(dob.slice(0, 4)) + (dob.slice(5) === "01-01" ? 1 : 0) : undefined;
    if ((filingStatus !== "mfj" && (age === undefined || age < 24)) || education.refundableAocFacts) {
      const facts = education.refundableAocFacts;
      if (!facts || typeof facts.fullTimeStudent !== "boolean" || typeof facts.parentAlive !== "boolean" || !validAmount(facts.earnedIncome) || !validAmount(facts.totalSupport)) errors.refundableAocFacts = "Enter actual claimant student, earned-income, support and parent-alive facts for refundable AOTC.";
    }
  }
  if (requiresAotcClaimantYearReview(education, taxYear)) {
    errors.aotcClaimantFactsTaxYear = `Confirm the AOTC claimant answers for ${taxYear}.`;
  }
  return errors;
}

export function buildActualEducationInput(data: CreditsData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData) {
  const errors = educationFactErrors(data, taxYear, filingStatus, personal);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const education = data?.education;
  if (!education || (!education.aocStudents.length && !education.llcStudents?.length)) return undefined;
  const common = (student: EducationStudentSourceData) => {
    const qualifiedExpenses = amount(student.qualifiedExpenses);
    const returnName = taxYear === 2026 && personal && parseGuidedCurrency(qualifiedExpenses).gt(0)
      ? educationStudentReturnName(student.name, householdStudent(student, personal)) : undefined;
    return {
      name: returnName ?? student.name.trim(), studentTaxId: student.studentTaxId?.trim(),
      studentRole: student.studentRole as "primary" | "spouse" | "dependent", qualifiedExpenses,
      studentTinEligible: student.studentTinEligible ?? undefined, studentSsnEligible: student.studentSsnEligible ?? undefined,
      institutionEligible: student.institutionEligible ?? undefined, expensesEligibilityConfirmed: student.expensesEligibilityConfirmed ?? undefined,
      form1098TRequirementMet: student.form1098TRequirementMet ?? undefined,
      institutions: student.institutions?.map(institution => ({
        name: institution.name.trim(), address: institution.address.trim(), ein: institution.ein?.trim() || undefined,
        receivedCurrentYear1098T: institution.receivedCurrentYear1098T as boolean,
        receivedPriorYear1098TWithBox7: institution.receivedPriorYear1098TWithBox7 as boolean,
      })),
    };
  };
  return {
    aocStudents: education.aocStudents.map(student => ({ ...common(student), priorYearsClaimed: Number(student.priorYearsClaimed), completedFirstFourYearsBeforeYear: student.completedFirstFourYearsBeforeYear ?? undefined, enrolledAtLeastHalfTime: student.enrolledAtLeastHalfTime ?? undefined, pursuingDegreeOrCredential: student.pursuingDegreeOrCredential ?? undefined, felonyDrugConviction: student.felonyDrugConviction ?? undefined, institutionEin: student.institutionEin?.trim() })),
    llcStudents: education.llcStudents?.map(student => ({ ...common(student), courseEligibilityConfirmed: student.courseEligibilityConfirmed ?? undefined })),
    llcExpenses: present(education.llcExpenses) ? amount(education.llcExpenses) : (education.llcStudents ?? []).reduce((total, student) => total.plus(parseGuidedCurrency(student.qualifiedExpenses)), new Decimal(0)).toString(),
    primarySsnEligible: education.primarySsnEligible ?? undefined, spouseSsnEligible: education.spouseSsnEligible ?? undefined, primaryTinEligible: education.primaryTinEligible ?? undefined,
    canBeClaimedAsDependent: education.canBeClaimedAsDependent ?? undefined, claimedAsDependent: education.claimedAsDependent ?? undefined, nonresidentAlien: education.nonresidentAlien ?? undefined, residentJointElection: education.residentJointElection ?? undefined, aocBanInEffect: education.aocBanInEffect ?? undefined, form8862Required: education.form8862Required ?? undefined, form8862Completed: education.form8862Completed ?? undefined, possessionIncomeExclusion: amount(education.possessionIncomeExclusion),
    refundableAocEligible: education.refundableAocEligible ?? undefined,
    refundableAocFacts: education.refundableAocFacts ? { fullTimeStudent: education.refundableAocFacts.fullTimeStudent as boolean, parentAlive: education.refundableAocFacts.parentAlive as boolean, earnedIncome: amount(education.refundableAocFacts.earnedIncome), totalSupport: amount(education.refundableAocFacts.totalSupport) } : undefined,
  };
}
