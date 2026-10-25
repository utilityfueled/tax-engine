/**
 * Form 4137 — Social Security and Medicare Tax on Unreported Tip Income.
 * Spec: spec/federal/form-4137.yaml
 *
 * Actual sources preserve the employer/month and reporting-year distinctions.
 * The earlier aggregate path remains explicitly unverified compatibility.
 */

import Decimal from "decimal.js";
import { Form4137SourceFactsSchema, type Form4137Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import type { YearConstants } from "@/models/constants.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, min, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";

type Owner = "primary" | "spouse";
/** Same-owner records from the canonical return, never a user wage-base override. */
export interface Form4137PayrollContext {
  accountHolder: Owner;
  w2s: {
    sourceId: string;
    accountHolder: Owner;
    employerName: string;
    employerEin: string;
    socialSecurityWages: Decimal;
    socialSecurityTips: Decimal;
    /** Unknown original Box8 remains unknown; the actual tip source also retains it. */
    allocatedTips?: Decimal;
  }[];
}

export interface Form4137EmployerResult {
  sourceId: string;
  employerName: string;
  employerEin: string;
  w2SourceIds: string[];
  cashAndChargeTipsReceived: Decimal;
  tipsReportedToEmployer: Decimal;
  unreportedCashTips: Decimal;
  smallMonthlyTips: Decimal;
  medicareTaxableTips: Decimal;
  medicareOnlyGovernmentTips: Decimal;
  allocatedTips: Decimal;
  reportedTipsNotIncludedInBox7: Decimal;
  box7TipsExcludedFromReportedTotal: Decimal;
  reportedTipReconciliationReference?: string;
}

export interface Form4137Result {
  sourceFactsVerified: boolean;
  accountHolder?: Owner;
  sourceTaxYear?: number;
  employers?: Form4137EmployerResult[];
  line2?: Decimal;
  line3?: Decimal;
  line4?: Decimal;
  line5?: Decimal;
  line7?: Decimal;
  noncashTipIncome?: Decimal;
  unreportedTipIncome: Decimal;
  line6: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  lines: CalculatedLine[];
}

function text(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Form4137 requires actual ${name}.`);
  return value.trim();
}
function amount(value: string | undefined, name: string): Decimal {
  if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite()) throw new Error(`Form4137 requires actual nonnegative ${name}; unknown is not zero.`);
  return d(value);
}
function canonical(value: Decimal | undefined, name: string): Decimal {
  if (!Decimal.isDecimal(value) || !value.isFinite() || value.lt(0)) throw new Error(`Form4137 requires actual canonical payroll ${name}.`);
  return value;
}
const normalizedName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
function normalizedEin(value: string | undefined): string {
  const supplied = text(value, "employer EIN or Applied For");
  if (normalizedName(supplied) === "applied for") return "applied for";
  if (!/^\d{2}-?\d{7}$/.test(supplied)) throw new Error("Form4137 requires an actual employer EIN or Applied For.");
  return supplied.replace(/-/g, "");
}

function calculateActualSources(input: Form4137Input, constants: YearConstants, context: Form4137PayrollContext | undefined): Form4137Result {
  const facts = Form4137SourceFactsSchema.parse(input.sourceFacts);
  if (![2025, 2026].includes(constants.taxYear) || facts.sourceTaxYear !== constants.taxYear) throw new Error("Form4137 source year must match the supported return year.");
  text(facts.sourceReference, "source reference");
  if (facts.sourceFactsConfirmed !== true || facts.allEmployersIncluded !== true || facts.reportingYearTreatmentConfirmed !== true) {
    throw new Error("Confirm actual Form4137 employer completeness and reporting-year treatment after the last edit.");
  }
  if (!input.accountHolder) throw new Error("Form4137 requires the actual tip recipient owner.");
  if (!context || !Array.isArray(context.w2s)) throw new Error("Form4137 requires actual canonical payroll context, including an empty W2 list when none.");
  if (context.accountHolder !== input.accountHolder) throw new Error("Form4137 canonical payroll owner does not match the source owner.");
  if (!facts.employers) throw new Error("Form4137 requires actual employer rows, including an empty list when none.");
  const w2s = new Map<string, Form4137PayrollContext["w2s"][number]>();
  for (const w2 of context.w2s) {
    text(w2.sourceId, "canonical W2 source ID"); text(w2.employerName, "canonical W2 employer name"); normalizedEin(w2.employerEin);
    if (w2.accountHolder !== input.accountHolder) throw new Error("Form4137 canonical W2 owner does not match the source owner.");
    if (w2s.has(w2.sourceId)) throw new Error("Duplicate canonical Form4137 payroll source.");
    canonical(w2.socialSecurityWages, "W2 Box3"); canonical(w2.socialSecurityTips, "W2 Box7");
    if (w2.allocatedTips !== undefined) canonical(w2.allocatedTips, "W2 Box8");
    w2s.set(w2.sourceId, w2);
  }
  const sourceIds = new Set<string>(); const employerIds = new Set<string>(); const usedW2s = new Set<string>();
  const employers: Form4137EmployerResult[] = facts.employers.map(row => {
    const sourceId = text(row.sourceId, "employer source ID");
    const employerName = text(row.employerName, "employer name");
    const employerEin = text(row.employerEin, "employer EIN");
    const ein = normalizedEin(employerEin);
    const employerKey = ein === "applied for" ? `${ein}:${normalizedName(employerName)}` : ein;
    if (sourceIds.has(sourceId) || employerIds.has(employerKey)) throw new Error("Duplicate Form4137 employer source.");
    sourceIds.add(sourceId); employerIds.add(employerKey);
    if (row.railroadRetirementCovered === undefined) throw new Error("Form4137 requires actual railroad tip coverage.");
    if (row.railroadRetirementCovered) throw new Error("RRTA-covered railroad tips must be reported to the employer, not on Form4137.");
    if (!row.w2SourceIds) throw new Error("Form4137 requires actual employer W2 source links, including an empty list when none.");
    const linked = row.w2SourceIds.map(id => {
      const w2 = w2s.get(id);
      if (!w2 || usedW2s.has(id)) throw new Error("Form4137 employer W2 source is missing, duplicated or belongs to another owner.");
      if (normalizedName(w2.employerName) !== normalizedName(employerName) || normalizedEin(w2.employerEin) !== ein) throw new Error("Form4137 employer identity does not reconcile with its canonical W2.");
      usedW2s.add(id); return w2;
    });
    for (const w2 of context.w2s) {
      if (normalizedEin(w2.employerEin) === ein && (ein !== "applied for" || normalizedName(w2.employerName) === normalizedName(employerName)) && !row.w2SourceIds.includes(w2.sourceId)) {
        throw new Error("Form4137 must reconcile all actual W2 records for this employer.");
      }
    }
    const received = amount(row.cashAndChargeTipsReceived, "cash and charge tips received");
    const reported = amount(row.tipsReportedToEmployer, "tips reported to employer");
    if (reported.gt(received)) throw new Error("Form4137 tips reported cannot exceed tips received.");
    const additionalReported = amount(row.reportedTipsNotIncludedInBox7, "reported tips not included in Box7");
    const box7Excluded = amount(row.box7TipsExcludedFromReportedTotal, "Box7 tips excluded from reported total");
    const box7 = sum(...linked.map(w2 => w2.socialSecurityTips));
    if (additionalReported.gt(0) || box7Excluded.gt(0)) text(row.reportedTipReconciliationReference, "reported-tip reconciliation reference");
    if (additionalReported.gt(reported) || box7Excluded.gt(box7)) throw new Error("Form4137 reported-tip reconciliation components cannot exceed their actual sources.");
    if (!box7.plus(additionalReported).minus(box7Excluded).eq(reported)) throw new Error("Form4137 annual reported tips must reconcile to actual Box7 and documented reporting adjustments.");
    const unreported = received.minus(reported);
    const allocated = amount(row.allocatedTips, "allocated tips from actual Box8 records");
    const knownAllocated = sum(...linked.flatMap(w2 => w2.allocatedTips === undefined ? [] : [w2.allocatedTips]));
    if (knownAllocated.gt(allocated) || (linked.length > 0 && linked.every(w2 => w2.allocatedTips !== undefined) && !knownAllocated.eq(allocated))) throw new Error("Form4137 allocated tips do not reconcile to actual W2 Box8.");
    if (unreported.lt(allocated) && row.adequateRecordsSupportUnreportedTips !== true) throw new Error("Form4137 allocated tips require adequate actual records supporting lower unreported tips.");
    if (!row.smallTipMonths) throw new Error("Form4137 requires actual small-tip months, including an empty list when none.");
    const months = new Set<number>();
    let monthlyReceived = d(0); let monthlyReported = d(0);
    for (const month of row.smallTipMonths) {
      if (!Number.isInteger(month.month) || month.month! < 1 || month.month! > 12) throw new Error("Form4137 requires an actual calendar month.");
      if (months.has(month.month!)) throw new Error("Duplicate Form4137 employer month.");
      months.add(month.month!);
      const receivedForMonth = amount(month.totalCashAndChargeTips, "total cash tips for the employer month");
      const reportedForMonth = amount(month.tipsReportedToEmployer, "reported tips for the employer month");
      if (receivedForMonth.gte(20)) throw new Error("Form4137 small-tip exception requires total employer-month tips less than 20.");
      if (reportedForMonth.gt(receivedForMonth)) throw new Error("Form4137 monthly reported tips exceed monthly received tips.");
      monthlyReceived = monthlyReceived.plus(receivedForMonth); monthlyReported = monthlyReported.plus(reportedForMonth);
    }
    const small = monthlyReceived.minus(monthlyReported);
    if (monthlyReceived.gt(received) || monthlyReported.gt(reported) || small.gt(unreported)) throw new Error("Form4137 employer-month tips do not conserve the annual received and reported sources.");
    const medicareTaxable = unreported.minus(small);
    const government = amount(row.medicareOnlyGovernmentUnreportedTips, "Medicare-only government tips after monthly exceptions");
    if (government.gt(0) && row.medicareOnlyGovernmentQualificationConfirmed !== true) throw new Error("Form4137 requires actual government Medicare-only qualification.");
    if (government.gt(medicareTaxable)) throw new Error("Form4137 government tips cannot exceed the employer's Medicare-taxable tips.");
    return { sourceId, employerName, employerEin, w2SourceIds: [...row.w2SourceIds], cashAndChargeTipsReceived: received, tipsReportedToEmployer: reported,
      unreportedCashTips: unreported, smallMonthlyTips: small, medicareTaxableTips: medicareTaxable, medicareOnlyGovernmentTips: government,
      allocatedTips: allocated, reportedTipsNotIncludedInBox7: additionalReported, box7TipsExcludedFromReportedTotal: box7Excluded,
      reportedTipReconciliationReference: row.reportedTipReconciliationReference };
  });
  const line2 = sum(...employers.map(row => row.cashAndChargeTipsReceived));
  const line3 = sum(...employers.map(row => row.tipsReportedToEmployer));
  const line4 = line2.minus(line3); const line5 = sum(...employers.map(row => row.smallMonthlyTips));
  const line6 = line4.minus(line5); const line7 = constants.selfEmploymentTax.socialSecurityWageBase;
  const rrta = amount(facts.railroadRetirementCompensation, "railroad retirement compensation subject to 6.2 percent");
  const reportedWages = sum(...context.w2s.map(w2 => w2.socialSecurityWages));
  const reportedTips = sum(...context.w2s.map(w2 => w2.socialSecurityTips));
  const line8 = sum(reportedWages, reportedTips, min(rrta, line7)); const line9 = zeroFloor(line7.minus(line8));
  const governmentTips = sum(...employers.map(row => row.medicareOnlyGovernmentTips));
  const line10 = min(line6.minus(governmentTips), line9);
  const line11 = roundDollar(line10.times(constants.selfEmploymentTax.socialSecurityRate.div(2)));
  const line12 = roundDollar(line6.times(constants.selfEmploymentTax.medicareRate.div(2))); const line13 = line11.plus(line12);
  const noncashTipIncome = amount(facts.noncashTipsNotIncludedInWages, "noncash tip income not included in wages");
  const unreportedTipIncome = line4.plus(noncashTipIncome);
  for (const [value, actual, label] of [
    [input.unreportedTipIncome, unreportedTipIncome, "unreported income"],
    [input.socialSecurityWagesAndTipsAlreadyReported, line8, "reported payroll"],
    [input.medicareOnlyGovernmentEmployeeTips, governmentTips, "government tips"],
  ] as const) {
    if (value !== undefined && (!d(value).isFinite() || !d(value).eq(actual))) throw new Error(`Form4137 legacy summary ${label} does not reconcile to actual sources.`);
  }
  const audit = new AuditTrail();
  for (const [index, row] of employers.entries()) {
    audit.record("Form 4137", `1-${index + 1}-c`, "Actual cash and charge tips received", row.cashAndChargeTipsReceived, "Actual reporting-year employer record", { "Source ID": row.sourceId, "Employer": row.employerName, "Owner": input.accountHolder });
    audit.record("Form 4137", `1-${index + 1}-d`, "Actual cash and charge tips reported", row.tipsReportedToEmployer, "Actual reporting-year employer report reconciled to payroll", { "Source ID": row.sourceId });
  }
  for (const [line, description, value, formula] of [
    ["2", "Total cash and charge tips received", line2, "Sum actual employer column(c)"],
    ["3", "Total cash and charge tips reported", line3, "Sum actual employer column(d)"],
    ["4", "Unreported cash and charge tip income", line4, "Line2 - line3"],
    ["5", "Tips exempt under the employer monthly threshold", line5, "Actual unreported tips in employer-months with total cash tips below20"],
    ["6", "Unreported tips subject to Medicare tax", line6, "Line4 - line5; excludes noncash income"],
    ["7", "Social Security wage base for the selected tax year", line7, `${constants.taxYear} indexed Social Security wage base`],
    ["8", "Actual reported Social Security and RRTA payroll", line8, "Same-owner W2Boxes3+7 + min(actual RRTAcompensation,line7)"],
    ["9", "Remaining Social Security wage-base room", line9, "max(0,line7-line8)"],
    ["10", "Unreported tips subject to Social Security", line10, "min(line6-qualified Medicare-only government tips,line9)"],
    ["11", "Social Security tax on unreported tips", line11, "Round line10 multiplied by .062"],
    ["12", "Medicare tax on unreported tips", line12, "Round line6 multiplied by .0145"],
    ["13", "Additional Social Security and Medicare tax on tips", line13, "Line11 + line12"],
    ["noncash", "Actual noncash tip income outside payroll tax", noncashTipIncome, "Actual noncash income not included in wages"],
    ["1040-1", "Unreported tip income added to Form1040line1c", unreportedTipIncome, "Cash line4 + separate actual noncash income"],
  ] as const) audit.record("Form 4137", line, description, value, formula, { "Owner": input.accountHolder, "Source year": String(facts.sourceTaxYear) });
  return { sourceFactsVerified: true, accountHolder: input.accountHolder, sourceTaxYear: facts.sourceTaxYear, employers, noncashTipIncome,
    line2, line3, line4, line5, line7, unreportedTipIncome, line6, line8, line9, line10, line11, line12, line13, lines: audit.getLines() };
}

export function calculateForm4137(
  input: Form4137Input,
  constants: YearConstants,
  defaults: {
    socialSecurityWagesAndTipsAlreadyReported?: Decimal;
    socialSecurityTipsAlreadyReported?: Decimal;
    sourcePayroll?: Form4137PayrollContext;
  } = {}
): Form4137Result {
  if (input.sourceFacts !== undefined) return calculateActualSources(input, constants, defaults.sourcePayroll);
  const audit = new AuditTrail();
  const unreportedTipIncome = Decimal.max(new Decimal(0), d(input.unreportedTipIncome));
  const line6 = unreportedTipIncome;
  const defaultSocialSecurityWagesAlreadyReported = d(defaults.socialSecurityWagesAndTipsAlreadyReported);
  const defaultSocialSecurityTipsAlreadyReported = d(defaults.socialSecurityTipsAlreadyReported);
  const line8 = Decimal.max(
    new Decimal(0),
    input.socialSecurityWagesAndTipsAlreadyReported !== undefined
      ? d(input.socialSecurityWagesAndTipsAlreadyReported)
      : defaultSocialSecurityWagesAlreadyReported.plus(defaultSocialSecurityTipsAlreadyReported)
  );
  const line9 = zeroFloor(constants.selfEmploymentTax.socialSecurityWageBase.minus(line8));
  const medicareOnlyGovernmentEmployeeTips = Decimal.max(
    new Decimal(0),
    d(input.medicareOnlyGovernmentEmployeeTips)
  );
  const socialSecurityComparableTips = zeroFloor(line6.minus(medicareOnlyGovernmentEmployeeTips));
  const line10 = min(socialSecurityComparableTips, line9);
  const line11 = roundDollar(line10.times(constants.selfEmploymentTax.socialSecurityRate.dividedBy(2)));
  const line12 = roundDollar(line6.times(constants.selfEmploymentTax.medicareRate.dividedBy(2)));
  const line13 = line11.plus(line12);

  audit.record(
    "Form 4137",
    "1040-1",
    "Unreported tip income added to Form 1040 line 1",
    unreportedTipIncome,
    "Validated supported Form 4137 unreported tip income amount"
  );
  audit.record(
    "Form 4137",
    "6",
    "Unreported tips subject to Medicare tax and Additional Medicare Tax",
    line6,
    "Validated supported unreported tip income amount"
  );
  audit.record(
    "Form 4137",
    "8",
    "Social Security wages and tips already subject to tax",
    line8,
    input.socialSecurityWagesAndTipsAlreadyReported !== undefined
      ? "Validated Form 4137 line 8 override"
      : "Defaulted from W-2 Box 3 Social Security wages plus W-2 Box 7 Social Security tips",
    {
      "Validated line 8 override": d(input.socialSecurityWagesAndTipsAlreadyReported),
      "Defaulted W-2 Box 3 Social Security wages": defaultSocialSecurityWagesAlreadyReported,
      "Defaulted W-2 Box 7 Social Security tips": defaultSocialSecurityTipsAlreadyReported,
    }
  );
  audit.record(
    "Form 4137",
    "9",
    "Remaining Social Security wage-base room",
    line9,
    "2025 Social Security wage base - Line 8, floored at $0",
    {
      "2025 Social Security wage base": constants.selfEmploymentTax.socialSecurityWageBase,
      "Line 8": line8,
    }
  );
  audit.record(
    "Form 4137",
    "10",
    "Tips subject to Social Security tax",
    line10,
    "Smaller of Line 9 or Line 6 after subtracting Medicare-only government-employee tips",
    {
      "Line 6": line6,
      "Line 9": line9,
      "Validated Medicare-only government-employee tips": medicareOnlyGovernmentEmployeeTips,
      "Social Security-comparable tips": socialSecurityComparableTips,
    }
  );
  audit.record(
    "Form 4137",
    "11",
    "Social Security tax on unreported tips",
    line11,
    `Line 10 × ${constants.selfEmploymentTax.socialSecurityRate.dividedBy(2)}`,
    {
      "Line 10": line10,
    }
  );
  audit.record(
    "Form 4137",
    "12",
    "Medicare tax on unreported tips",
    line12,
    `Line 6 × ${constants.selfEmploymentTax.medicareRate.dividedBy(2)}`,
    {
      "Line 6": line6,
    }
  );
  audit.record(
    "Form 4137",
    "13",
    "Additional Social Security and Medicare tax on unreported tips",
    line13,
    "Line 11 + Line 12",
    {
      "Line 11": line11,
      "Line 12": line12,
    }
  );

  return {
    sourceFactsVerified: false,
    accountHolder: input.accountHolder,
    unreportedTipIncome,
    line6,
    line8,
    line9,
    line10,
    line11,
    line12,
    line13,
    lines: audit.getLines(),
  };
}
