/** Disabled final 2026 Form 8863 physical candidate. Spec: spec/federal/form-8863-2026-template.yaml. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { calculateForm8863 } from "@/engine/forms/form-8863.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { educationStudentReturnName } from "@/utils/education-student-return-name.js";

const page1 = "topmostSubform[0].Page1[0].";
const page2 = "topmostSubform[0].Page2[0].";

export const FORM_8863_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f8863--2026.pdf",
  sourceRevision: "Created 4/28/26",
  retrievedAt: "2026-11-19T05:03:31Z",
  sha256: "290771de5dbbbede2de9e7cb2ba8a7d51a08aa10e89b4ed74cfdbdb631af167f",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedReferences: Object.freeze({
    line1From: "All Parts III, line 30",
    line3From: "Form 1040 or 1040-SR, line 11a",
    line8To: "Form 1040 or 1040-SR, line 29",
    line9To: "Credit Limit Worksheet, line 2",
    line10From: "All Parts III, line 31",
    line14From: "Form 1040 or 1040-SR, line 11a",
    line18To: "Credit Limit Worksheet, line 1",
    line19From: "Credit Limit Worksheet, line 7",
    line19To: "Schedule 3 (Form 1040), line 3",
  }),
  fields: Object.freeze({
    returnName: page1 + "f1_1[0]",
    returnSsnFirst: page1 + "SocialSecurity[0].f1_2[0]",
    returnSsnMiddle: page1 + "SocialSecurity[0].f1_3[0]",
    returnSsnLast: page1 + "SocialSecurity[0].f1_4[0]",
    line1: page1 + "f1_5[0]",
    line2: page1 + "f1_6[0]",
    line3: page1 + "f1_7[0]",
    line4: page1 + "f1_8[0]",
    line5: page1 + "f1_9[0]",
    line6Integer: page1 + "f1_10[0]",
    line6Fraction: page1 + "f1_11[0]",
    line7RefundableRestriction: page1 + "c1_1[0]",
    line7: page1 + "f1_12[0]",
    line8: page1 + "f1_13[0]",
    line9: page1 + "f1_14[0]",
    line10: page1 + "f1_15[0]",
    line11: page1 + "f1_16[0]",
    line12: page1 + "f1_17[0]",
    line13: page1 + "f1_18[0]",
    line14: page1 + "f1_19[0]",
    line15: page1 + "f1_20[0]",
    line16: page1 + "f1_21[0]",
    line17Integer: page1 + "f1_22[0]",
    line17Fraction: page1 + "f1_23[0]",
    line18: page1 + "f1_24[0]",
    line19: page1 + "f1_25[0]",

    // Part III is repeated once per eligible student in the printed instructions.
    partIIIReturnName: page2 + "f2_1[0]",
    partIIIReturnSsnFirst: page2 + "SSN[0].f2_2[0]",
    partIIIReturnSsnMiddle: page2 + "SSN[0].f2_3[0]",
    partIIIReturnSsnLast: page2 + "SSN[0].f2_4[0]",
    line20StudentName: page2 + "f2_5[0]",
    line21StudentSsnFirst: page2 + "StudentSSN[0].f2_6[0]",
    line21StudentSsnMiddle: page2 + "StudentSSN[0].f2_7[0]",
    line21StudentSsnLast: page2 + "StudentSSN[0].f2_8[0]",
    line22aName: page2 + "Line22a[0].f2_9[0]",
    line22aAddress: page2 + "Line22a[0].f2_10[0]",
    line22aCurrent1098TYes: page2 + "Line22a[0].c2_1[0]",
    line22aCurrent1098TNo: page2 + "Line22a[0].c2_1[1]",
    line22aPrior1098TBox7Yes: page2 + "Line22a[0].c2_2[0]",
    line22aPrior1098TBox7No: page2 + "Line22a[0].c2_2[1]",
    line22aEinDigit1: page2 + "Line22a[0].f2_11[0]",
    line22aEinDigit2: page2 + "Line22a[0].f2_12[0]",
    line22aEinDigit3: page2 + "Line22a[0].f2_13[0]",
    line22aEinDigit4: page2 + "Line22a[0].f2_14[0]",
    line22aEinDigit5: page2 + "Line22a[0].f2_15[0]",
    line22aEinDigit6: page2 + "Line22a[0].f2_16[0]",
    line22aEinDigit7: page2 + "Line22a[0].f2_17[0]",
    line22aEinDigit8: page2 + "Line22a[0].f2_18[0]",
    line22aEinDigit9: page2 + "Line22a[0].f2_19[0]",
    line22bName: page2 + "Line22b[0].f2_20[0]",
    line22bAddress: page2 + "Line22b[0].f2_21[0]",
    line22bCurrent1098TYes: page2 + "Line22b[0].c2_3[0]",
    line22bCurrent1098TNo: page2 + "Line22b[0].c2_3[1]",
    line22bPrior1098TBox7Yes: page2 + "Line22b[0].c2_4[0]",
    line22bPrior1098TBox7No: page2 + "Line22b[0].c2_4[1]",
    line22bEinDigit1: page2 + "Line22b[0].f2_22[0]",
    line22bEinDigit2: page2 + "Line22b[0].f2_23[0]",
    line22bEinDigit3: page2 + "Line22b[0].f2_24[0]",
    line22bEinDigit4: page2 + "Line22b[0].f2_25[0]",
    line22bEinDigit5: page2 + "Line22b[0].f2_26[0]",
    line22bEinDigit6: page2 + "Line22b[0].f2_27[0]",
    line22bEinDigit7: page2 + "Line22b[0].f2_28[0]",
    line22bEinDigit8: page2 + "Line22b[0].f2_29[0]",
    line22bEinDigit9: page2 + "Line22b[0].f2_30[0]",
    line23Yes: page2 + "c2_5[0]",
    line23No: page2 + "c2_5[1]",
    line24Yes: page2 + "c2_6[0]",
    line24No: page2 + "c2_6[1]",
    line25Yes: page2 + "c2_7[0]",
    line25No: page2 + "c2_7[1]",
    line26Yes: page2 + "c2_8[0]",
    line26No: page2 + "c2_8[1]",
    line27: page2 + "f2_31[0]",
    line28: page2 + "f2_32[0]",
    line29: page2 + "f2_33[0]",
    line30: page2 + "f2_34[0]",
    line31: page2 + "f2_35[0]",
  }),
});

const wholeDollars = z.string().regex(/^\d{1,12}$/);
const transferWorkpapers = z.object({
  taxYear: z.literal(2026),
  currentWorkpapersConfirmed: z.literal(true),
  canonicalInputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  form1040Line11a: wholeDollars,
  creditLimitWorksheetRemainingTax: wholeDollars,
  form8863Line6: z.string().regex(/^(?:0\.\d{3,}|1\.000)$/),
  form8863Line8: wholeDollars,
  form8863Line19: wholeDollars,
}).strict();

function jointClaimantSsn(person: TaxYearInput["taxpayer"]["primary"], educationAnswer: boolean | undefined, role: "primary" | "spouse") {
  const householdAnswer = person.employmentValidSsnIssuedByDueDate;
  if (householdAnswer !== undefined && educationAnswer !== undefined && householdAnswer !== educationAnswer) {
    throw new Error(`Form 8863 review ${role} employment-valid SSN answers conflict with the return.`);
  }
  const eligible = educationAnswer ?? householdAnswer;
  if (eligible === true && person.tinIssuedByDueDate === false) {
    throw new Error(`Form 8863 review ${role} employment-valid SSN conflicts with the timely TIN answer.`);
  }
  return eligible;
}

/** Verify separate, confirmed original workpapers without turning on the full 2026 return. */
export function projectForm88632026Transfers(rawInput: TaxYearInput, rawWorkpapers: unknown) {
  const { taxYear, sha256, printedReferences } = FORM_8863_2026_CANDIDATE;
  const parsed = TaxYearInputSchema.safeParse(rawInput);
  if (!parsed.success || parsed.data.taxpayer.taxYear !== taxYear) {
    throw new Error("Form 8863 review requires valid canonical 2026 return facts.");
  }
  const input = parsed.data;
  const workpapers = transferWorkpapers.safeParse(rawWorkpapers);
  if (!workpapers.success) {
    throw new Error("Form 8863 review requires the reported line 6 and confirmed original 2026 workpaper amounts in whole dollars.");
  }
  const originals = workpapers.data;
  if (originals.canonicalInputSha256 !== createHash("sha256").update(JSON.stringify(input)).digest("hex")) {
    throw new Error("Form 8863 review workpapers must match the current canonical return.");
  }

  const { educationExpenses: education, taxpayer: { primary, spouse, filingStatus } } = input;
  const joint = filingStatus === "married_filing_jointly";
  if ((!joint && filingStatus !== "single") || !education || education.aocStudents.length !== 1 || education.llcStudents?.length
    || !d(education.llcExpenses).isZero() || input.form2555 || education.possessionIncomeExclusion === undefined
    || !d(education.possessionIncomeExclusion).isZero() || education.claimedAsDependent !== false
    || education.nonresidentAlien !== false || input.standardDeductionFacts?.nonresidentAlien === true
    || input.standardDeductionFacts?.dualStatusAlien === true || education.aocBanInEffect !== false
    || education.form8862Required !== false) {
    throw new Error("Form 8863 review requires one ordinary AOTC claim for a single filer or either spouse on a joint return.");
  }
  const [student] = education.aocStudents;
  const school = student.institutions?.[0];
  const role = student.studentRole;
  const primaryTin = primary.ssn.replaceAll("-", "");
  const spouseTin = spouse?.ssn.replaceAll("-", "");
  const person = role === "primary" ? primary : joint && role === "spouse" ? spouse : undefined;
  const studentTin = person?.ssn.replaceAll("-", "");
  if (!person || !/^\d{9}$/.test(primaryTin) || student.studentTaxId?.replaceAll("-", "") !== studentTin
    || (joint && (!spouse || !spouseTin || !/^\d{9}$/.test(spouseTin) || primaryTin === spouseTin
      || !primary.firstName.trim() || !primary.lastName.trim() || !spouse.firstName.trim() || !spouse.lastName.trim()))) {
    throw new Error("Form 8863 review student identity must match the actual return household role.");
  }
  const name = educationStudentReturnName(student.name, person);
  if (name === undefined) throw new Error("Form 8863 review student name must match the name on the return.");
  if (student.studentTinEligible !== true || person.tinIssuedByDueDate === false || (joint && person.tinIssuedByDueDate !== true)) {
    throw new Error("Form 8863 review requires confirmed student timely TIN facts.");
  }

  const primarySsnEligible = joint ? jointClaimantSsn(primary, education.primarySsnEligible, "primary")
    : education.primarySsnEligible ?? primary.employmentValidSsnIssuedByDueDate;
  const spouseSsnEligible = joint && spouse ? jointClaimantSsn(spouse, education.spouseSsnEligible, "spouse") : undefined;
  if (joint) {
    if (education.primaryTinEligible !== undefined && ((primary.tinIssuedByDueDate !== undefined
      && education.primaryTinEligible !== primary.tinIssuedByDueDate) || (primarySsnEligible === true && !education.primaryTinEligible))) {
      throw new Error("Form 8863 review primary timely TIN answers conflict with the joint return.");
    }
    const studentSsnEligible = role === "spouse" ? spouseSsnEligible : primarySsnEligible;
    if (studentSsnEligible === undefined || (student.studentSsnEligible !== undefined && student.studentSsnEligible !== studentSsnEligible)) {
      throw new Error("Form 8863 review student SSN answers are unknown or conflict with the joint return.");
    }
    if (primarySsnEligible !== true && spouseSsnEligible !== true) {
      throw new Error("Form 8863 review requires at least one spouse with a timely employment-valid SSN.");
    }
  } else if (primarySsnEligible !== true || primary.employmentValidSsnIssuedByDueDate === false
    || education.primaryTinEligible === false || student.studentSsnEligible === false) {
    throw new Error("Form 8863 review requires the actual eligible primary student.");
  }
  if (student.institutionEligible !== true || student.expensesEligibilityConfirmed !== true || student.form1098TRequirementMet !== true) {
    throw new Error("Form 8863 review requires confirmed student education facts.");
  }
  if (student.institutions?.length !== 1 || !school?.name.trim() || !school.address.trim()
    || !school.ein || school.ein.replaceAll("-", "") !== student.institutionEin?.replaceAll("-", "")
    || school.receivedCurrentYear1098T !== true) {
    throw new Error("Form 8863 review requires one matching original institution with a current-year Form 1098-T.");
  }
  const refundableFacts = education.refundableAocFacts;
  const result = calculateForm8863({
    taxYear, filingStatus, primarySsnEligible, spouseSsnEligible, primaryDateOfBirth: primary.dateOfBirth,
    claimedAsDependent: education.claimedAsDependent, nonresidentAlien: education.nonresidentAlien,
    aocBanInEffect: education.aocBanInEffect, form8862Required: education.form8862Required,
    refundableAocEligible: education.refundableAocEligible,
    refundableAocFacts: refundableFacts && {
      ...refundableFacts, earnedIncome: d(refundableFacts.earnedIncome), totalSupport: d(refundableFacts.totalSupport),
    },
    aocStudents: [{ ...student, name, qualifiedExpenses: d(student.qualifiedExpenses) }], llcExpenses: d(0),
    magi: d(originals.form1040Line11a), taxLiabilityLimit: d(originals.creditLimitWorksheetRemainingTax),
  });
  if (!result.sourceFactsVerified || !result.aocAfterPhaseOut.gt(0)) {
    throw new Error("Form 8863 review requires a verified positive AOTC amount before the credit limit.");
  }
  const exactFactor = result.lines.find(row => row.form === "Form 8863" && row.line === "6")?.value;
  if (!exactFactor?.eq(originals.form8863Line6)) {
    throw new Error("Form 8863 review requires the exact calculated factor on line 6.");
  }
  if (!result.totalRefundable.eq(originals.form8863Line8) || !result.totalNonrefundable.eq(originals.form8863Line19)) {
    throw new Error("Form 8863 review line 8 or line 19 disagrees with the current calculated amount.");
  }
  return {
    taxYear, sha256,
    transfers: [
      { line: "8", to: printedReferences.line8To, amount: result.totalRefundable.toFixed() },
      { line: "19", to: printedReferences.line19To, amount: result.totalNonrefundable.toFixed() },
    ],
  };
}
