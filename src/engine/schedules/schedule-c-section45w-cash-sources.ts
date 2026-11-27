import type Decimal from "decimal.js";
import type { z } from "zod";
import type { TaxYearInput } from "@/models/inputs.js";
import {
  type Section45WScheduleCOwnerSchema,
  type Section45WScheduleCLedgerSchema,
  SECTION45W_OPERATING_EXPENSES,
} from "@/models/schedule-c-section45w-first-year.js";
import { d } from "@/utils/decimal.js";
import type { ScheduleCInput } from "./schedule-c.js";

const allowedExpenses = new Set<string>(SECTION45W_OPERATING_EXPENSES);
const tinPattern = /^(?:\d{9}|\d{3}-\d{2}-\d{4})$/u;

export function requireSection45WScheduleCCashActivity(
  input: TaxYearInput,
  selectedBusiness: ScheduleCInput | undefined,
  careBenefitAdjustment?: Decimal,
) {
  const business = input.scheduleC;
  const proof = business?.sourceFacts;
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
  return { business, proof };
}

export function assertSection45WScheduleCOwnerLedger(
  input: TaxYearInput,
  business: NonNullable<TaxYearInput["scheduleC"]>,
  proof: NonNullable<NonNullable<TaxYearInput["scheduleC"]>["sourceFacts"]>,
  owner: z.output<typeof Section45WScheduleCOwnerSchema>,
  ledger: z.output<typeof Section45WScheduleCLedgerSchema>,
  activity: {
    taxpayerReference: string;
    activityReference: string;
    originalRecordReference: string;
    principalBusinessActivity: string;
    businessCode: string;
  },
): void {
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
}
