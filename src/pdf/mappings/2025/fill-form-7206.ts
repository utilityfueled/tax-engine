/** Actual 2025 Form7206 review mapping. Spec: spec/federal/form-7206-pdf.yaml. */
import Decimal from "decimal.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { calculateForm7206, type Form7206BusinessResult } from "@/engine/forms/form-7206.js";
import { roundDollar, sum } from "@/utils/decimal.js";
import { assertPdfExportAllowed, markReviewPdf } from "../../export-policy.js";
import { formatCurrency, loadReviewTemplate, setTextField } from "../../pdf-utils.js";
const field = (number: number) => `topmostSubform[0].Page1[0].f1_${number}[0]`;
/** Sixteen leaf fields inspected against the registered October2,2025 revision. */
export const FORM_7206_FIELDS = {
  name: field(1), ssn: field(2), line1: field(3), line2: field(4), line3: field(5), line4: field(6),
  line5: field(7), line6: field(8), line7: field(9), line8: field(10), line9: field(11), line10: field(12),
  line11: field(13), line12: field(14), line13: field(15), line14: field(16),
} as const;
const properties = {
  "1": "medicalPremiums", "2": "longTermCarePremiums", "3": "eligiblePremiums", "4": "netIncome",
  "5": "ownerPositiveBusinessIncome", "6": "incomeRatio", "7": "allocatedSelfEmploymentTax", "8": "incomeAfterSelfEmploymentTax",
  "9": "attributableRetirementDeduction", "10": "incomeAfterRetirement", "11": "sCorporationMedicareWages",
  "12": "attributableForeignExclusion", "13": "earnedIncomeLimit", "14": "deduction",
} as const;
function exact(value: unknown, label: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite()) throw new Error(`Form7206 requires the actual finite ${label}.`);
  return value;
}
function reconcileSources(input: TaxYearInput, result: NonNullable<TaxReturnResult["form7206"]>) {
  const actual = calculateForm7206({ taxYear: input.taxpayer.taxYear, filingStatus: input.taxpayer.filingStatus, facts: input.form7206! });
  for (const key of ["grossSourcePremiums", "paidSourcePremiums"] as const) if (!actual[key].eq(exact(result[key], key))) throw new Error("Form7206 source totals do not reconcile with the persisted calculation.");
  if (actual.sourceRecords.length !== result.sourceRecords.length || actual.businesses.length !== result.businesses.length) throw new Error("Form7206 source records do not reconcile with the persisted calculation.");
  for (const [index, source] of actual.sourceRecords.entries()) {
    const persisted = result.sourceRecords[index];
    for (const key of ["sourceId", "planId", "accountHolder", "businessSourceId", "personId", "payer"] as const) if (source[key] !== persisted[key]) throw new Error("Form7206 source identities disagree with the persisted calculation.");
    for (const key of ["amountPaid", "excludedFunding", "eligiblePremium"] as const) if (!source[key].eq(exact(persisted[key], key))) throw new Error("Form7206 source amounts disagree with the persisted calculation.");
  }
  for (const source of actual.businesses) {
    const matches = result.businesses.filter(group => group.accountHolder === source.accountHolder && group.businessSourceId === source.businessSourceId && group.kind === source.kind);
    if (matches.length !== 1 || source.planIds.join("\0") !== matches[0].planIds.join("\0")) throw new Error("Form7206 business source identity is missing or duplicated.");
    for (const key of ["medicalPremiums", "longTermCarePremiums", "eligiblePremiums"] as const) if (!source[key].eq(exact(matches[0][key], key))) throw new Error("Form7206 business premium sources disagree with the persisted calculation.");
  }
  if (!sum(...result.businesses.map(group => exact(group.deduction, "business deduction"))).eq(exact(result.deduction, "total source deduction"))) throw new Error("Form7206 business deductions disagree with their calculated source total.");
  const transferred = sum(...result.businesses.map(group => roundDollar(exact(group.deduction, "business deduction"))));
  if (!transferred.eq(exact(result.deductionToSchedule1, "Schedule1 transfer"))) throw new Error("Form7206 separate business deductions disagree with the Schedule1 transfer.");
}

export function assertForm7206ReviewSource(input: TaxYearInput, result: TaxReturnResult) {
  assertPdfExportAllowed(input.taxpayer.taxYear, result.taxYear);
  const calculation = result.form7206;
  if (!input.form7206 || !calculation || calculation.sourceFactsVerified !== true || !calculation.calculationComplete) throw new Error("Form7206 requires actual sources and a completed audited calculation.");
  reconcileSources(input, calculation);
  return calculation;
}

export async function fillForm7206(input: TaxYearInput, result: TaxReturnResult, blankPdfPath: string,
  businessSourceId: string, accountHolder: "primary" | "spouse"): Promise<PDFDocument> {
  const calculation = assertForm7206ReviewSource(input, result);
  const facts = input.form7206!; // The source assertion above requires this original worksheet.
  const groups = calculation.businesses.filter(group => group.businessSourceId === businessSourceId && group.accountHolder === accountHolder);
  if (groups.length !== 1) throw new Error("Form7206 requires one actual business and owner.");
  const group = groups[0];
  const byLine = new Map<string, Decimal>();
  for (const line of calculation.lines) {
    if (line.form !== "Form 7206" || !(line.line in properties) || line.inputs?.Owner !== accountHolder || line.inputs?.Business !== businessSourceId) continue;
    const value = exact(line.value, `line ${line.line} audit`);
    if (byLine.has(line.line) || (!['4', '8', '10'].includes(line.line) && value.lt(0))) throw new Error(`Form7206 line ${line.line} audit is duplicated or invalid.`);
    byLine.set(line.line, value);
  }
  const doc = await loadReviewTemplate(blankPdfPath, 2025), form = doc.getForm();
  const names = [input.taxpayer.primary, ...(input.taxpayer.spouse ? [input.taxpayer.spouse] : [])].map(person => `${person.firstName} ${person.lastName}`).join(" & ");
  setTextField(form, FORM_7206_FIELDS.name, names);
  setTextField(form, FORM_7206_FIELDS.ssn, input.taxpayer.primary.ssn.replace(/-/g, ""));
  for (const [line, property] of Object.entries(properties)) {
    const applies = group.kind === "s_corporation" ? !["4", "5", "6", "7", "8", "9", "10"].includes(line) : line !== "11";
    const value = byLine.get(line), fieldName = FORM_7206_FIELDS[`line${line}` as keyof typeof FORM_7206_FIELDS];
    if (!applies) {
      if (value !== undefined) throw new Error(`Form7206 contains an unexpected branch audit for line ${line}.`);
      setTextField(form, fieldName, ""); continue;
    }
    if (!value || !value.eq(exact(group[property as keyof Form7206BusinessResult], `calculated line ${line}`))) throw new Error(`Form7206 line ${line} audit is missing or disagrees with its calculated total.`);
    setTextField(form, fieldName, line === "6" ? `${value.times(100).toDecimalPlaces(6).toFixed()}%` : value.isZero() ? "0" : formatCurrency(value));
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([612, 792]), y = 752;
  const write = (value: string) => {
    const words = value.replace(/\s+/g, " ").trim().split(" "); let line = "";
    const emit = () => { if (y < 48) { page = doc.addPage([612, 792]); y = 752; } page.drawText(line, { x: 32, y, size: 9, font }); y -= 14; line = ""; };
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, 9) > 548 && line) emit();
      // Long actual source references are wrapped by characters, never truncated.
      for (const char of word) { if (font.widthOfTextAtSize(line + char, 9) > 548) emit(); line += char; }
      line += " ";
    }
    if (line) emit();
  };
  write("FORM 7206 - ACTUAL SOURCE REVIEW STATEMENT");
  write(`Tax year 2025; business source ${businessSourceId}; owner ${accountHolder}; type ${group.kind}.`);
  write("This appendix preserves original source facts and exact calculations. The preceding IRS form is a review copy. Independent filing qualification remains pending.");
  write(`Source reference: ${facts.sourceReference ?? "Unknown"}. Plans: ${group.planIds.join(", ")}.`);
  for (const plan of facts.plans ?? []) {
    if (plan.businessSourceId !== businessSourceId || plan.accountHolder !== accountHolder) continue;
    write(`Plan ${plan.planId}: policy ${plan.policyReference}; ${plan.kind}; policy held by ${plan.policyHolder}.`);
    for (const month of plan.months ?? []) write(`Coverage month ${month.month}: eligible for subsidized employer coverage ${String(month.employerSubsidizedPlanEligible)}.`);
    for (const payment of plan.payments ?? []) {
      write(`Source ${payment.sourceId}; paid ${payment.datePaid}; coverage ${payment.coverageTaxYear}-${payment.coverageMonth}; original premium $${payment.grossPremium}; owner/business paid $${payment.ownerOrBusinessPaid}; other persons paid $${payment.otherPersonPaid}.`);
      for (const source of calculation.sourceRecords.filter(row => row.planId === plan.planId && row.sourceId === payment.sourceId)) {
        const person = facts.persons?.find(row => row.personId === source.personId);
        write(`Person ${person?.name ?? source.personId}; payer ${source.payer}; paid share $${source.amountPaid.toFixed()}; distinct excluded funding $${source.excludedFunding.toFixed()}; eligible before annual and business limits $${source.eligiblePremium.toFixed()}.`);
      }
    }
  }
  const coveredPeople = new Set(calculation.sourceRecords.filter(row => row.businessSourceId === businessSourceId && row.accountHolder === accountHolder).map(row => row.personId));
  for (const person of calculation.longTermCarePersons.filter(row => coveredPeople.has(row.personId))) write(`LTC person ${person.personId}: attained age ${person.attainedAge}; annual limit $${person.annualLimit.toFixed()}; eligible across all businesses $${person.eligiblePremiums.toFixed()}; allowed across all businesses $${person.allowedPremiums.toFixed()}.`);
  for (const [line, value] of byLine) write(`Exact calculated line ${line}: ${value.toFixed()}${line === "6" ? " (ratio; percentage display is rounded to six decimal places)" : " dollars"}.`);
  write(`This business transfers $${roundDollar(group.deduction!).toFixed()} to Schedule 1 line 17. Total across all business forms: $${calculation.deductionToSchedule1.toFixed()}. Eligible premium excess $${group.eligiblePremiumExcess?.toFixed() ?? "Unknown"} is a review amount, not an automatic itemized deduction.`);
  await markReviewPdf(doc);
  return doc;
}
