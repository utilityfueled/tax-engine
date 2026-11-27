/** Spec: spec/federal/schedule-c-section45w-first-year-2026.yaml. */
import type Decimal from "decimal.js";
import { calculateSection45WFirstYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-first-year-2026.js";
import { CommercialCleanVehicle2026SourceSchema, type TaxYearInput } from "@/models/inputs.js";
import { ScheduleCSection45WFirstYearSchema, SECTION45W_OPERATING_EXPENSES } from "@/models/schedule-c-section45w-first-year.js";
import { d } from "@/utils/decimal.js";
import type { ScheduleCInput } from "./schedule-c.js";

const allowedExpenses = new Set<string>(SECTION45W_OPERATING_EXPENSES);
const tinPattern = /^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u;

export function calculateScheduleCSection45WFirstYear(
  input: TaxYearInput,
  selectedBusiness: ScheduleCInput | undefined,
  careBenefitAdjustment?: Decimal,
): ReturnType<typeof calculateSection45WFirstYearDepreciation2026> | undefined {
  const business = input.scheduleC;
  const original = business?.sourceFacts?.section45WFirstYear;
  if (original === undefined && selectedBusiness?.sourceFacts?.section45WFirstYear === undefined) return undefined;

  const proof = business?.sourceFacts;
  const claims = input.form8936;
  if (!business || !proof || selectedBusiness !== business || input.taxpayer.taxYear !== 2026
    || input.taxpayer.filingStatus !== "single" || input.taxpayer.spouse
    || business.accountHolder !== "primary" || business.accountingMethod !== "cash" || business.allInvestmentAtRisk !== true) {
    throw new Error("Section 45W depreciation requires its actual primary Schedule C activity for a 2026 Single cash return.");
  }
  if (input.form4562 || business.standardMileage || business.professionalWagering || business.homeOffice
    || proof.passengerFirstYear || proof.depreciation || proof.amortization || proof.interest || proof.ordinaryExpenses
    || careBenefitAdjustment?.isZero() === false || !d(business.returnsAndAllowances).isZero()
    || !d(business.costOfGoodsSold).isZero() || !d(business.otherIncome).isZero() || !d(business.w2WagesPaid).isZero()
    || input.form1099Nec.length || input.form1099K.length || input.form1099Misc.length || input.scheduleF
    || input.rentalProperties.length || input.cryptoIncome
    || Object.entries(business.expenses ?? {}).some(([name, amount]) => !allowedExpenses.has(name) && !d(amount).isZero())) {
    throw new Error("Section 45W depreciation requires a complete independent receipts and expense ledger without competing deductions or activities.");
  }
  if (!claims || claims.commercialCleanVehicles?.length !== 1 || claims.newCleanVehicles.length || claims.previouslyOwnedCleanVehicles.length) {
    throw new Error("Section 45W depreciation requires one matching original commercial vehicle claim.");
  }

  const parsed = ScheduleCSection45WFirstYearSchema.safeParse(original);
  if (!parsed.success) throw new Error("Original Section 45W Schedule C owner, ledger or first-year workpapers are incomplete.");
  const { owner, ledger, workpaper } = parsed.data;
  const result = calculateSection45WFirstYearDepreciation2026(workpaper);
  const { activity, claim, vehicle } = workpaper.basis;
  const canonicalVehicle = CommercialCleanVehicle2026SourceSchema.safeParse(claims.commercialCleanVehicles[0]);
  if (claim.position !== "direct_claim" || !canonicalVehicle.success
    || Object.entries(canonicalVehicle.data).some(([key, value]) => value !== vehicle[key as keyof typeof vehicle])) {
    throw new Error("The original Section 45W depreciation records must match the single prepared commercial vehicle claim.");
  }

  const primary = input.taxpayer.primary;
  if (primary.firstName !== owner.firstName || primary.lastName !== owner.lastName || !tinPattern.test(primary.ssn)
    || primary.ssn.replaceAll("-", "") !== owner.tin.replaceAll("-", "") || owner.taxpayerReference !== activity.taxpayerReference
    || ledger.activityReference !== activity.activityReference || proof.sourceReference !== activity.originalRecordReference
    || (business.businessName?.trim() || null) !== ledger.businessName || (business.ein?.trim() || null) !== ledger.businessEin
    || business.principalBusinessActivity !== activity.principalBusinessActivity || business.businessCode !== activity.businessCode) {
    throw new Error("The original Section 45W records must match the actual taxpayer and Schedule C trade or business.");
  }
  if (business.grossReceipts === undefined || !d(business.grossReceipts).eq(ledger.grossReceipts)
    || SECTION45W_OPERATING_EXPENSES.some(name => !d(business.expenses?.[name]).eq(ledger.expenses[name]))) {
    throw new Error("The original Section 45W ledger must match the actual Schedule C receipts and operating expenses.");
  }
  return result;
}
