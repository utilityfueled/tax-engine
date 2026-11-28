import Decimal from "decimal.js";
import type { ScheduleK1 } from "@/models/inputs.js";
import { Form6198PartII2026Schema } from "@/models/form-6198-part-ii-2026.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";
import type { K1CharitableReturnInput } from "./k1-charitable-return-sources.js";

const otherActivityAmounts = [
  "netRentalIncome", "otherNetRentalIncome", "guaranteedPayments", "interestIncome", "ordinaryDividends",
  "qualifiedDividends", "royalties", "netShortTermCapitalGain", "netLongTermCapitalGain", "unrecapturedSection1250Gain",
  "collectiblesGain", "section1231Gain", "otherIncome", "section179Deduction", "otherDeductions", "charitableCash",
  "charitableCapitalGain30", "charitableCapitalGain20", "investmentInterestExpense", "excessBusinessInterest",
  "foreignTaxPaid", "foreignSourceIncome", "amtDepreciationAdjustment", "amtAdjustedGainOrLoss", "amtDepletion",
  "amtOtherItems", "taxExemptInterest", "otherTaxExemptIncome", "nondeductibleExpenses", "distributions",
  "investmentIncome", "investmentExpenses", "excessTaxableIncome", "excessBusinessInterestIncome", "section199AW2Wages",
  "section199AUBIA", "section199AQualifiedReitDividends", "section199AQualifiedPTPIncome", "section199APTPW2Wages",
  "section199APTPUBIA", "ptpDispositionGainOrLoss",
] as const satisfies readonly (keyof ScheduleK1)[];

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/** Spec: spec/federal/2026/form-6198-part-ii.yaml. */
export function calculateForm6198PartII2026(
  k1: ScheduleK1,
  basisAdjustedLoss: Decimal,
  taxpayer: K1CharitableReturnInput["taxpayer"] | undefined,
) {
  if (taxpayer?.taxYear !== 2026) throw new Error("Form 6198 Part II original sources require a 2026 return.");
  const form = k1.form6198;
  const parsed = Form6198PartII2026Schema.safeParse(form?.partII2026);
  if (!form || !parsed.success) throw new Error("Form 6198 Part II requires complete original activity and workpaper facts.");
  const source = parsed.data;

  const owner = taxpayer[source.accountHolder];
  const ownerId = owner?.ssn.replaceAll("-", "") ?? "";
  const box1Loss = d(source.box1Loss);
  const line6 = d(source.openingAdjustedBasis);
  if (k1.taxYear !== source.taxYear || k1.accountHolder !== source.accountHolder
    || (source.accountHolder === "spouse" && taxpayer.filingStatus !== "married_filing_jointly")
    || !owner || !/^\d{9}$/.test(ownerId) || ownerId.slice(-4) !== source.recipientTaxpayerIdLast4
    || normalizedName(`${owner.firstName} ${owner.lastName}`) !== normalizedName(source.recipientName)
    || !/^\d{2}-?\d{7}$/.test(k1.partnershipEIN.trim())
    || k1.partnershipEIN.trim().replaceAll("-", "") !== source.entityEin.replaceAll("-", "")
    || normalizedName(k1.partnershipName) !== normalizedName(source.activityName)
    || k1.beginningBasis === undefined || !d(k1.beginningBasis).eq(line6)
    || !box1Loss.lt(0) || !d(k1.ordinaryIncome).eq(box1Loss)) {
    throw new Error("Form 6198 Part II must match the original Schedule K-1, return owner, and opening adjusted basis.");
  }
  const { partII2026: _currentSource, activityName, ...legacyAmounts } = form;
  if (Object.values(legacyAmounts).some(value => value !== undefined)
    || (activityName?.trim() && normalizedName(activityName) !== normalizedName(source.activityName))) {
    throw new Error("Form 6198 Part II cannot be combined with legacy worksheet amounts or a conflicting activity name.");
  }
  if (k1.atRiskAmount !== undefined) throw new Error("Form 6198 Part II cannot be combined with a manual at-risk amount.");

  if (k1.entityType !== "partnership" || k1.isPassiveActivity || k1.isPubliclyTradedPartnership || k1.isForeignPartnership
    || k1.ptpFullyDisposedInTaxableTransaction || k1.section199APTPLossSource !== undefined
    || otherActivityAmounts.some(field => !d(k1[field]).isZero())
    || Object.values(k1.priorSuspendedLosses ?? {}).some(value => !d(value).isZero())
    || !d(k1.section199AQBI).isZero() || k1.selfEmploymentFactsConfirmed !== true
    || k1.selfEmploymentEarnings === undefined || !d(k1.selfEmploymentEarnings).isZero()
    || k1.selfEmploymentNetEarningsAfterAdjustments === undefined || !d(k1.selfEmploymentNetEarningsAfterAdjustments).isZero()
    || !basisAdjustedLoss.eq(box1Loss)) {
    throw new Error("Form 6198 Part II requires the full basis-allowed ordinary nonpassive loss and no other activity amounts.");
  }

  const line7 = d(source.increases);
  const line8 = line6.plus(line7);
  const line9 = d(source.decreases);
  const line10a = line8.minus(line9);
  const line10b = Decimal.max(0, line10a);
  if (line10b.isZero()) throw new Error("Form 6198 Part II at zero or below requires separate Part III and recapture review.");

  const deductibleLoss = Decimal.min(basisAdjustedLoss.abs(), line10b);
  const audit = new AuditTrail();
  audit.record("Form 6198", "6", "Opening adjusted basis", line6, "Verified adjusted basis on the first day of the tax year");
  audit.record("Form 6198", "7", "Increases", line7, "Verified Part II increases for the tax year");
  audit.record("Form 6198", "8", "Adjusted basis plus increases", line8, "Line 6 plus line 7");
  audit.record("Form 6198", "9", "Decreases", line9, "Verified decreases and amounts included on line 6 that are not at risk");
  audit.record("Form 6198", "10a", "Part II net amount", line10a, "Line 8 minus line 9");
  audit.record("Form 6198", "10b", "Part II amount at risk", line10b, "Greater of line 10a or zero");
  audit.record("Form 6198", "20", "Amount at risk", line10b, "Positive Part II amount from line 10b");
  audit.record("Form 6198", "21", "Deductible loss", deductibleLoss, "Lesser of the basis-allowed Box 1 loss or line 20");
  return {
    netAmount: deductibleLoss.negated(),
    atRiskAmount: line10b,
    suspendedAtRiskLoss: basisAdjustedLoss.plus(deductibleLoss),
    lines: audit.getLines(),
  };
}
