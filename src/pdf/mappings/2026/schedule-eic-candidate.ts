/** Disabled final 2026 Schedule EIC physical candidate. Spec: spec/federal/schedule-eic-2026-template.yaml. */
import { createHash } from "node:crypto";
import type { PDFDocument } from "pdf-lib";
import { calculateEicQualifyingChildSources, type EicQualifyingChildInput } from "@/engine/forms/eic-qualifying-child-sources.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly, setCheckBox, setTextField } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

const page = "topmostSubform[0].Page1[0].";
const firstYear = page + "Year1_ReadOrder[0].";
const secondYear = page + "Year2_ReadOrder[0].";

export const SCHEDULE_EIC_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f1040sei.pdf",
  sourceRevision: "Created 5/28/26",
  retrievedAt: "2026-11-20T12:47:43Z",
  sha256: "c46a19f4dc50bfaa6d676579a529602653a4035dabdfeb6112a2a32ce4de631c",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printedReferences: Object.freeze({
    attachmentSequence: 43,
    attachesTo: Object.freeze(["Form 1040", "Form 1040-SR"]),
    creditInstructions: "Form 1040, line 27a",
  }),
  checkboxStates: Object.freeze({ yes: "/1", no: "/2", off: "/Off" }),
  fields: Object.freeze({
    name: page + "f1_01[0]",
    ssn: page + "f1_02[0]",
    child1Name: page + "f1_03[0]",
    child2Name: page + "f1_04[0]",
    child3Name: page + "f1_05[0]",
    child1SSN: page + "f1_06[0]",
    child2SSN: page + "f1_07[0]",
    child3SSN: page + "f1_08[0]",
    child1YearDigit1: firstYear + "f1_09[0]",
    child1YearDigit2: firstYear + "f1_10[0]",
    child1YearDigit3: firstYear + "f1_11[0]",
    child1YearDigit4: firstYear + "f1_12[0]",
    child2YearDigit1: secondYear + "f1_13[0]",
    child2YearDigit2: secondYear + "f1_14[0]",
    child2YearDigit3: secondYear + "f1_15[0]",
    child2YearDigit4: secondYear + "f1_16[0]",
    child3YearDigit1: page + "f1_17[0]",
    child3YearDigit2: page + "f1_18[0]",
    child3YearDigit3: page + "f1_19[0]",
    child3YearDigit4: page + "f1_20[0]",
    child1Line4aYes: page + "Line4a_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_1[0]",
    child1Line4aNo: page + "Line4a_Child1_ReadOrder[0].c1_1[0]",
    child2Line4aYes: page + "Line4a_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_2[0]",
    child2Line4aNo: page + "Line4a_Child2_ReadOrder[0].c1_2[0]",
    child3Line4aYes: page + "Line4a_Child3_Yes_ReadOrder[0].c1_3[0]",
    child3Line4aNo: page + "c1_3[0]",
    child1Line4bYes: page + "Line4b_Child1_ReadOrder[0].Yes_ReadOrder[0].c1_4[0]",
    child1Line4bNo: page + "Line4b_Child1_ReadOrder[0].c1_4[0]",
    child2Line4bYes: page + "Line4b_Child2_ReadOrder[0].Yes_ReadOrder[0].c1_5[0]",
    child2Line4bNo: page + "Line4b_Child2_ReadOrder[0].c1_5[0]",
    child3Line4bYes: page + "Line4b_Child3_Yes_ReadOrder[0].c1_6[0]",
    child3Line4bNo: page + "c1_6[0]",
    child1Relationship: page + "f1_21[0]",
    child2Relationship: page + "f1_22[0]",
    child3Relationship: page + "f1_23[0]",
    child1Months: page + "Line6_Child1_ReadOrder[0].f1_24[0]",
    child2Months: page + "Line6_Child2_ReadOrder[0].f1_25[0]",
    child3Months: page + "f1_26[0]",
  }),
});

type Taxpayer = EicQualifyingChildInput["taxpayer"];
type ClaimantIdentity = Pick<Taxpayer["primary"], "firstName" | "lastName" | "ssn" | "dateOfBirth">;
type ChildSource = NonNullable<EicQualifyingChildInput["children"]>[number] & {
  monthsLivedInUnitedStates?: number;
  neverHadSsn?: boolean;
};
type ScheduleEic2026Sources = Pick<EicQualifyingChildInput, "allCandidateChildrenIncluded"> & {
  sourceTaxYear: number;
  sourceReference: string;
  sourceFactsConfirmed: boolean;
  primary: ClaimantIdentity;
  spouse?: ClaimantIdentity;
  children?: ChildSource[];
};

function matchesClaimant(current: ClaimantIdentity | undefined, original: ClaimantIdentity | undefined): boolean {
  return !!current && !!original && !!current.firstName.trim() && !!current.lastName.trim()
    && /^\d{9}$/.test(current.ssn.replaceAll("-", ""))
    && current.firstName === original.firstName && current.lastName === original.lastName
    && current.ssn === original.ssn && current.dateOfBirth === original.dateOfBirth;
}

const calendarMonthLengthsShortestFirst = [28, 30, 30, 30, 30, 31, 31, 31, 31, 31, 31, 31];

/** Use calendar limits to spot contradictions while preserving the sourced month count. */
function residenceDaysCanMatchMonths(days: number, months: number): boolean {
  if (months === 12) return days === 365;
  const shortest = calendarMonthLengthsShortestFirst.slice(0, months).reduce((total, length) => total + length, 0);
  const longestNextMonthCount = calendarMonthLengthsShortestFirst.slice(-(months + 1)).reduce((total, length) => total + length, 0);
  return days >= shortest && days < longestNextMonthCount;
}

/** Render original child facts for internal physical review. Claimant and child SSNs stay private. */
export async function fillScheduleEic2026Candidate(
  taxpayer: Taxpayer,
  sources: ScheduleEic2026Sources,
  blank: Uint8Array,
): Promise<PDFDocument> {
  const candidate = SCHEDULE_EIC_2026_CANDIDATE;
  if (taxpayer.taxYear !== candidate.taxYear || sources.sourceTaxYear !== candidate.taxYear) {
    throw new Error("Schedule EIC candidate requires 2026 household and 2026 source records");
  }
  if (sources.sourceFactsConfirmed !== true || !sources.sourceReference?.trim()) {
    throw new Error("Schedule EIC candidate requires confirmed original records");
  }
  const joint = taxpayer.filingStatus === "married_filing_jointly";
  if (!matchesClaimant(taxpayer.primary, sources.primary)
    || (joint ? !matchesClaimant(taxpayer.spouse, sources.spouse) : sources.spouse !== undefined)) {
    throw new Error("Schedule EIC candidate claimant identity does not match original household records");
  }
  const actual = calculateEicQualifyingChildSources({
    taxpayer, allCandidateChildrenIncluded: sources.allCandidateChildrenIncluded, children: sources.children,
  });
  const counted = actual.children.filter(row => row.ssnCounted).slice(0, 3);
  if (!counted.length) throw new Error("Schedule EIC candidate requires an original SSN-counted qualifying child");

  const name = (person: ClaimantIdentity) => `${person.firstName} ${person.lastName}`;
  const spouse = joint ? taxpayer.spouse : undefined;
  const returnName = [name(taxpayer.primary), ...(spouse ? [name(spouse)] : [])].join(" & ");
  const rows = counted.map(row => {
    const child = taxpayer.dependents[Number(row.sourceId.slice("dependent:".length))];
    const source = sources.children?.find(source => source.sourceId === row.sourceId);
    if (!child || !source) throw new Error("Schedule EIC candidate original child is missing");
    if (source.deathDate === undefined) throw new Error("Schedule EIC candidate requires the original child death status");
    if (row.actualResidenceDays === undefined) throw new Error("Schedule EIC candidate requires measured residence days for each printed child");
    const died = row.requiresLiveBirthEvidence === true;
    if ((died && source.neverHadSsn !== true) || (source.neverHadSsn === true && child.ssn !== "")) {
      throw new Error("Schedule EIC candidate Died entry requires confirmation that the child never had an SSN and an empty original identifier");
    }
    const birthYear = child.dateOfBirth.slice(0, 4);
    const younger = child.dateOfBirth > taxpayer.primary.dateOfBirth || (!!spouse && child.dateOfBirth > spouse.dateOfBirth);
    const skip = Number(birthYear) > 2007 && younger;
    // For federal age tests the next birthday is reached on the preceding day.
    const line4a = skip ? undefined : child.dateOfBirth > "2003-01-01" && younger && source.fullTimeStudentForFiveMonths === true;
    const line4b = skip || line4a ? undefined : source.permanentlyAndTotallyDisabled === true;
    const bornOrDied = row.birthInYear !== undefined || row.deathInYear !== undefined;
    let months = 12;
    if (!bornOrDied) {
      const usMonths = source.monthsLivedInUnitedStates;
      if (usMonths === undefined || !Number.isInteger(usMonths) || usMonths < 6 || usMonths > 12
        || usMonths > child.monthsLivedWithYou || !residenceDaysCanMatchMonths(row.actualResidenceDays, usMonths)) {
        throw new Error("Schedule EIC candidate requires actual U.S. co-residence months that match the residence records");
      }
      months = Math.max(7, usMonths);
    }
    return { name: name(child), birthYear, line4a, line4b, relationship: child.relationship, months, died };
  });

  const bytes = Uint8Array.from(blank);
  if (createHash("sha256").update(bytes).digest("hex") !== candidate.sha256) {
    throw new Error("Unreviewed Schedule EIC candidate template revision");
  }
  const doc = await loadPdfDocumentQuietly(bytes);
  removeTrustedTemplateLegacyFormData(doc);
  const form = doc.getForm();
  const fields = candidate.fields;
  const columns = [1, 2, 3] as const;
  const digits = [1, 2, 3, 4] as const;
  setTextField(form, fields.name, returnName);
  for (const [index, row] of rows.entries()) {
    const child = `child${columns[index]}` as const;
    setTextField(form, fields[`${child}Name`], row.name);
    if (row.died) setTextField(form, fields[`${child}SSN`], "Died");
    for (const digit of digits) setTextField(form, fields[`${child}YearDigit${digit}`], row.birthYear[digit - 1]);
    if (row.line4a !== undefined) setCheckBox(form, fields[`${child}Line4a${row.line4a ? "Yes" : "No"}`], true);
    if (row.line4b !== undefined) setCheckBox(form, fields[`${child}Line4b${row.line4b ? "Yes" : "No"}`], true);
    setTextField(form, fields[`${child}Relationship`], row.relationship);
    setTextField(form, fields[`${child}Months`], String(row.months));
  }
  await markReviewPdf(doc);
  return doc;
}
