/** Final 2026 Form 2555 physical candidate. See spec/federal/form-2555-2026-template.yaml. */
import { createHash } from "node:crypto";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema, type TaxYearInput } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";

function textField(page: number, number: number, subform = ""): string {
  return `topmostSubform[0].Page${page}[0].${subform}f${page}_${number}[0]`;
}

function checkbox(page: number, number: number, index = 0): string {
  return `topmostSubform[0].Page${page}[0].c${page}_${number}[${index}]`;
}

function page1(number: number): string { return textField(1, number); }
function page2(number: number): string { return textField(2, number); }
function page3(number: number): string { return textField(3, number); }

// Four printed rows on the left, followed by four on the right.
const usTravel = Array.from({ length: 8 }, (_, index) => {
  const start = 18 + index * 4;
  const table = index < 4 ? 1 : 2;
  const subform = `Table${table}_Line14[0].BodyRow${index + 1}[0].`;
  return Object.freeze({
    arrival: textField(1, start, subform), departure: textField(1, start + 1, subform),
    usBusinessDays: textField(1, start + 2, subform), usBusinessIncome: textField(1, start + 3, subform),
  });
});

const physicalPresenceTravel = Array.from({ length: 4 }, (_, index) => {
  const start = 4 + index * 6;
  const subform = `Table_Line18[0].BodyRow${index + 1}[0].`;
  return Object.freeze({
    country: textField(2, start, subform), arrival: textField(2, start + 1, subform), departure: textField(2, start + 2, subform),
    fullDays: textField(2, start + 3, subform), usBusinessDays: textField(2, start + 4, subform), usBusinessIncome: textField(2, start + 5, subform),
  });
});

export const FORM_2555_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  mappingVersion: "2026.1-candidate",
  sourceUrl: "https://www.irs.gov/pub/irs-prior/f2555--2026.pdf",
  sourceRevision: "Created 9/18/26",
  retrievedAt: "2026-11-13",
  sha256: "a88984fa3dd5b5846cc446032aaa2e0a6489d5efc8ac63f62632613c7e3d6b11",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
  printed: Object.freeze({
    dailyHousingBase: "58.26", annualHousingBase: "21264", annualExclusion: "132900", minimumRatioFractionDigits: 3,
    housingDeductionCarryoverYear: 2025, exclusionTransfer: "Schedule 1 line 8d", housingDeductionTransfer: "Schedule 1 line 24j",
  }),
  usTravel: Object.freeze(usTravel),
  physicalPresenceTravel: Object.freeze(physicalPresenceTravel),
  fields: Object.freeze({
    name: page1(1),
    ssn: page1(2),
    line1ForeignAddress: page1(3),
    line2Occupation: page1(4),
    line3EmployerName: page1(5),
    line4aEmployerUsAddress: page1(6),
    line4bEmployerForeignAddress: page1(7),
    line5aForeignEntity: checkbox(1, 1),
    line5bUsCompany: checkbox(1, 2),
    line5cSelf: checkbox(1, 3),
    line5dForeignAffiliate: checkbox(1, 4),
    line5eOther: checkbox(1, 5),
    line5eOtherDetail: page1(8),
    line6aPriorFilingYear: page1(9),
    line6bNeverFiled: checkbox(1, 6),
    line6cYes: checkbox(1, 7),
    line6cNo: checkbox(1, 7, 1),
    line6dRevocation: page1(10),
    line7Citizenship: page1(11),
    line8aYes: checkbox(1, 9),
    line8aNo: checkbox(1, 9, 1),
    line8bSecondHousehold: page1(12),
    line9TaxHomeFirst: page1(13),
    line9TaxHomeContinuation: page1(14),
    line10ResidenceStart: page1(15),
    line10ResidenceEnd: page1(16),
    line11aPurchasedHouse: checkbox(1, 11),
    line11bRentedHouseOrApartment: checkbox(1, 11, 1),
    line11cRentedRoom: checkbox(1, 11, 2),
    line11dEmployerQuarters: checkbox(1, 11, 3),
    line12aYes: checkbox(1, 15),
    line12aNo: checkbox(1, 15, 1),
    line12bFamilyDetail: page1(17),
    line13aYes: checkbox(1, 17),
    line13aNo: checkbox(1, 17, 1),
    line13bYes: checkbox(1, 19),
    line13bNo: checkbox(1, 19, 1),
    line15aContractFirst: page1(50),
    line15aContractContinuation: page1(51),
    line15bVisa: page1(52),
    line15cYes: checkbox(1, 21),
    line15cNo: checkbox(1, 21, 1),
    line15dYes: checkbox(1, 23),
    line15dNo: checkbox(1, 23, 1),
    line15eUsHomeFirst: page1(53),
    line15eUsHomeContinuation: page1(54),
    line16PresenceStart: page2(1),
    line16PresenceEnd: page2(2),
    line17EmploymentCountry: page2(3),
    line19: page2(28),
    line20a: page2(29),
    line20bPartnershipFirst: page2(30),
    line20bPartnershipContinuation: page2(31),
    line20b: page2(32),
    line21a: page2(33),
    line21b: page2(34),
    line21c: page2(35),
    line21dDetailFirst: page2(36),
    line21dDetailContinuation: page2(37),
    line21d: page2(38),
    line22a: page2(39),
    line22b: page2(40),
    line22c: page2(41),
    line22d: page2(42),
    line22e: page2(43),
    line22fDetailFirst: page2(44),
    line22fDetailContinuation: page2(45),
    line22f: page2(46),
    line22g: page2(47),
    line23DetailFirst: page2(48),
    line23DetailContinuation: page2(49),
    line23: page2(50),
    line24: page2(51),
    line25: page2(52),
    line26: page2(53),
    line27: textField(3, 1, "Line27TagCorrectingSubform[0]."),
    claimHousingYes: checkbox(3, 1),
    claimHousingNo: checkbox(3, 1, 1),
    line28: textField(3, 2, "Line28TagCorrectingSubform[0]."),
    line29a: page3(3),
    line29b: page3(4),
    line30: page3(5),
    line31: page3(6),
    line32: page3(7),
    line33: page3(8),
    line34: page3(9),
    line35Integer: page3(10),
    line35Fraction: page3(11),
    line36: page3(12),
    line37: page3(13),
    line38: page3(14),
    line39Integer: page3(15),
    line39Fraction: page3(16),
    line40: page3(17),
    line41: page3(18),
    line42: page3(19),
    line43: page3(20),
    line44: page3(21),
    line45: page3(22),
    line46: page3(23),
    line47: page3(24),
    line48: page3(25),
    line49: page3(26),
    line50: page3(27),
  }),
});

const wageLines = ["19", "20a", "20b", "21a", "21b", "21c", "21d", "22a", "22b", "22c", "22d",
  "22e", "22f", "22g", "23", "24", "25", "26", "27", "37", "38", "40", "41", "42", "43", "44", "45"] as const;

/** Prepare a marked calculation excerpt for manual review of the ordinary wage case. */
export async function fillForm25552026WageCandidate(bytes: Uint8Array, rawInput: TaxYearInput) {
  const { fields, sha256, taxYear } = FORM_2555_2026_CANDIDATE;
  if (createHash("sha256").update(bytes).digest("hex") !== sha256) throw new Error("Form 2555 candidate template differs from the final 2026 blank.");

  const input = TaxYearInputSchema.parse(rawInput);
  const facts = input.form2555;
  const [w2] = input.w2s;
  if (input.taxpayer.taxYear !== taxYear || facts?.taxYear !== taxYear || input.w2s.length !== 1 || w2?.taxYear !== taxYear
    || w2.accountHolder !== "primary" || facts.accountHolder !== "primary" || facts.sourceMapping?.rows.length !== 1
    || facts.sourceMapping.rows[0]?.sourceId !== "formW2:0") {
    throw new Error("Form 2555 candidate requires one original primary 2026 W-2 and its source mapping.");
  }
  if (facts.qualifyingDays !== 365 || facts.totalDaysInYear !== 365 || facts.eligibilityConfirmed !== true
    || facts.electionsValidConfirmed !== true || facts.claimForeignEarnedIncomeExclusion !== true) {
    throw new Error("Form 2555 candidate requires a confirmed full-year exclusion election.");
  }
  if (facts.isSelfEmployed || facts.claimHousingExclusionOrDeduction !== false || !d(facts.qualifiedHousingExpenses).isZero()) {
    throw new Error("Form 2555 candidate requires employment income without a housing claim or housing expenses.");
  }
  if (!facts.partIV || !d(w2.wages).gt(0) || !d(w2.wages).eq(facts.partIV.wages)
    || Object.entries(facts.partIV).some(([key, value]) => key !== "wages" && !d(value).isZero())
    || [facts.priorYearHousingDeductionCarryover, facts.priorYearIncomeExclusion, facts.deductionsAllocableToExcludedIncome,
      facts.foreignEarnedIncomeTaxWorksheetDisallowedDeductions].some(value => value === undefined || !d(value).isZero())) {
    throw new Error("Form 2555 candidate requires all Box 1 wages to be allocated abroad, with zero other receipts, carryovers and allocable deductions.");
  }

  const result = calculateFederalTax(input);
  const computed = result.form2555;
  const schedule1Line8d = result.allLines.find(row => row.form === "Sched 1" && row.line === "8d")?.value;
  if (!computed?.sourceFactsVerified || !schedule1Line8d || !computed.netExclusion.gt(0)
    || !computed.netExclusion.negated().eq(schedule1Line8d)) {
    throw new Error("Form 2555 requires a reconciled original wage calculation and Schedule 1 line 8d.");
  }
  const lines = new Map(computed.lines.map(row => [row.line, row.value]));
  if (!lines.get("39")?.eq(1)) throw new Error("Form 2555 candidate requires the audited full-year ratio.");

  const document = await loadPdfDocumentQuietly(bytes);
  const form = document.getForm();
  for (const line of wageLines) {
    const value = lines.get(line);
    if (!value?.isInteger()) throw new Error(`Missing whole-dollar Form 2555 audit line ${line}.`);
    form.getTextField(fields[`line${line}`]).setText(value.toFixed());
  }
  form.getTextField(fields.line39Integer).setText("1");
  form.getTextField(fields.line39Fraction).setText("000");
  form.getCheckBox(fields.claimHousingNo).check();
  await markReviewPdf(document);
  return { document, schedule1Line8d };
}
