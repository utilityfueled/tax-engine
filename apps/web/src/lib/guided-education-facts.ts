import Decimal from "decimal.js";
import type { CreditsData, EducationStudentSourceData, FilingStatus, PersonalInfoData } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";

const present = (value: string | undefined) => !!value?.trim();
function validAmount(value: string | undefined) { if (!present(value)) return false; try { return parseGuidedCurrency(value).gte(0); } catch { return false; } }
function amount(value: string | undefined) { parseGuidedCurrency(value); return (value ?? "").trim().replace(/,/g, ""); }
const cleanId = (value: string | undefined) => value?.trim().replace(/-/g, "") ?? "";

export function educationFactErrors(data: CreditsData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData): Record<string, string> {
  const errors: Record<string, string> = {}, education = data?.education;
  if (!education) return errors;
  const aoc = education.aocStudents, llc = education.llcStudents ?? [];
  let totalLlc = new Decimal(0);
  const ids = new Set<string>();
  function studentFacts(student: EducationStudentSourceData, key: string) {
    if (!student.name.trim()) errors[`${key}-name`] = "Enter the actual student name.";
    if (!validAmount(student.qualifiedExpenses)) errors[`${key}-amount`] = "Enter actual qualified education expenses, including zero.";
    const id = cleanId(student.studentTaxId);
    if (!/^\d{9}$/.test(id)) errors[`${key}-id`] = "Enter the student's actual SSN, ITIN or ATIN.";
    if (ids.has(id) && id) errors[`${key}-duplicate`] = "Only one credit per student is allowed; remove the duplicate student.";
    ids.add(id);
    if (!["primary", "spouse", "dependent"].includes(student.studentRole ?? "") || (student.studentRole === "spouse" && filingStatus && filingStatus !== "mfj")) errors[`${key}-role`] = "Choose the student's actual household role.";
    if (personal && student.studentRole) {
      const actual = student.studentRole === "primary" ? [personal.ssn] : student.studentRole === "spouse" ? [personal.spouse?.ssn] : (personal.dependents ?? []).map(dep => dep.ssn);
      if (!actual.some(tin => cleanId(tin) === id)) errors[`${key}-household`] = "Student identity must match the actual return household role.";
    }
    for (const field of ["institutionEligible", "expensesEligibilityConfirmed", "form1098TRequirementMet"] as const) if (typeof student[field] !== "boolean") errors[`${key}-${field}`] = "Confirm actual institution, net qualified expenses and Form 1098-T requirements.";
    if (taxYear === 2026 && student.studentRole === "dependent" && typeof student.studentSsnEligible !== "boolean") errors[`${key}-ssn`] = "Confirm the dependent student's employment-valid SSN was issued by the due date.";
    if (taxYear === 2026 && student.studentRole !== "dependent" && student.studentSsnEligible !== true && typeof student.studentTinEligible !== "boolean") errors[`${key}-tin`] = "Confirm the primary or spouse student's actual timely TIN.";
    if (taxYear !== 2026 && typeof student.studentTinEligible !== "boolean") errors[`${key}-tin`] = "Confirm the student's timely TIN for 2025; an ITIN is not an employment SSN.";
    if (!student.institutions?.length) errors[`${key}-institutions`] = "Enter the actual educational institution records.";
    for (const institution of student.institutions ?? []) if (!institution.name.trim() || !institution.address.trim() || ((present(institution.ein) || institution.receivedCurrentYear1098T || institution.receivedPriorYear1098TWithBox7) && !/^\d{9}$/.test(cleanId(institution.ein))) || typeof institution.receivedCurrentYear1098T !== "boolean" || typeof institution.receivedPriorYear1098TWithBox7 !== "boolean") errors[`${key}-institutions`] = "Enter actual institution name, address, EIN when a Form 1098-T was received, and both receipt answers.";
  }
  aoc.forEach((student, index) => {
    const key = `student-${index}`;
    // Prior claim history is never a default: preserve the existing legacy reconfirmation gate.
    if (!student.name.trim()) errors[`${key}-name`] = "Enter the actual student name.";
    if (!validAmount(student.qualifiedExpenses)) errors[`${key}-amount`] = "Enter actual qualified education expenses, including zero.";
    if (!/^[0-4]$/.test(student.priorYearsClaimed) || student.requiresPriorYearsConfirmation) errors[`${key}-history`] = "Confirm actual prior AOTC claim history (0–4); older prefilled zero requires reconfirmation.";
    studentFacts(student, key);
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
  return errors;
}

export function buildActualEducationInput(data: CreditsData | undefined, taxYear?: number | null, filingStatus?: FilingStatus | null, personal?: PersonalInfoData) {
  const errors = educationFactErrors(data, taxYear, filingStatus, personal);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const education = data?.education;
  if (!education || (!education.aocStudents.length && !education.llcStudents?.length)) return undefined;
  const common = (student: EducationStudentSourceData) => ({ name: student.name.trim(), studentTaxId: student.studentTaxId?.trim(), studentRole: student.studentRole as "primary" | "spouse" | "dependent", qualifiedExpenses: amount(student.qualifiedExpenses), studentTinEligible: student.studentTinEligible ?? undefined, studentSsnEligible: student.studentSsnEligible ?? undefined, institutionEligible: student.institutionEligible ?? undefined, expensesEligibilityConfirmed: student.expensesEligibilityConfirmed ?? undefined, form1098TRequirementMet: student.form1098TRequirementMet ?? undefined, institutions: student.institutions?.map(institution => ({ name: institution.name.trim(), address: institution.address.trim(), ein: institution.ein?.trim() || undefined, receivedCurrentYear1098T: institution.receivedCurrentYear1098T as boolean, receivedPriorYear1098TWithBox7: institution.receivedPriorYear1098TWithBox7 as boolean })) });
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
