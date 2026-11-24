import { z } from "zod";
import { calculateOrdinaryShortAccountingYearTax } from "@/engine/forms/short-accounting-year-tax.js";
import { d } from "@/utils/decimal.js";
import { sumSourceMoney } from "@/utils/sum-source-money.js";

const reference = z.string().trim().min(1);
const year = z.literal([2025, 2026]);
const employerEin = z.string().regex(/^\d{2}-?\d{7}$/).transform(ein => ein.replace("-", ""));
const money = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/).transform(value => d(value));
const date = z.iso.date();
const earliestSupportedBirthDate = "1850-01-01";

const originals = z.strictObject({
  period: z.strictObject({
    taxYear: year,
    ownerReference: reference,
    sourceReference: reference,
    filingStatus: z.literal("single"),
    startsOn: date,
    endsOn: date,
    dateOfBirth: date,
    regularChangeConfirmed: z.literal(true),
    livingTaxpayerConfirmed: z.literal(true),
  }),
  w2: z.strictObject({
    taxYear: year,
    ownerReference: reference,
    sourceReference: reference,
    accountHolder: z.literal("primary"),
    employerEin,
    wages: money,
    federalWithheld: money,
  }),
  payroll: z.strictObject({
    taxYear: year,
    ownerReference: reference,
    w2SourceReference: reference,
    employerEin,
    cashBasisActualAndConstructiveDatesConfirmed: z.literal(true),
    soleOriginalW2Confirmed: z.literal(true),
    calendarPayrollCompleteConfirmed: z.literal(true),
    ordinaryWagesOnlyConfirmed: z.literal(true),
    noDeductionsCreditsOrAmtAdjustmentsConfirmed: z.literal(true),
    payments: z.array(z.strictObject({
      sourceId: reference,
      receivedOn: date,
      unconditionallyAvailableOn: date,
      wages: money,
      federalWithheld: money,
    })).min(1),
  }),
});

/** Private retrospective result for a complete, matched original payroll history. */
export function calculateOrdinaryShortAccountingYearWageTax(input: unknown) {
  const parsed = originals.safeParse(input);
  if (!parsed.success) return null;
  const { period, w2, payroll } = parsed.data;
  const { taxYear, startsOn, endsOn, ownerReference, filingStatus } = period;
  const calendarStart = `${taxYear}-01-01`;
  const calendarEnd = `${taxYear}-12-31`;

  if (startsOn !== calendarStart || endsOn < calendarStart || endsOn >= calendarEnd) return null;
  const periodEnd = new Date(`${endsOn}T00:00:00Z`);
  const latestBirthDate = new Date(periodEnd);
  latestBirthDate.setUTCFullYear(taxYear - 24);
  if (period.dateOfBirth < earliestSupportedBirthDate || period.dateOfBirth > latestBirthDate.toISOString().slice(0, 10)) return null;

  const nextPeriodStart = new Date(periodEnd);
  nextPeriodStart.setUTCDate(nextPeriodStart.getUTCDate() + 1);
  if (nextPeriodStart.getUTCDate() !== 1) return null;
  const shortPeriodMonths = nextPeriodStart.getUTCMonth();

  if (w2.taxYear !== taxYear || payroll.taxYear !== taxYear ||
      w2.ownerReference !== ownerReference || payroll.ownerReference !== ownerReference ||
      w2.employerEin !== payroll.employerEin || w2.sourceReference !== payroll.w2SourceReference) return null;

  const { payments } = payroll;
  if (new Set(payments.map(payment => payment.sourceId)).size !== payments.length ||
      payments.some(({ unconditionallyAvailableOn, receivedOn }) =>
        unconditionallyAvailableOn < calendarStart || unconditionallyAvailableOn > calendarEnd ||
        unconditionallyAvailableOn > receivedOn)) return null;
  if (!sumSourceMoney(...payments.map(payment => payment.wages)).eq(w2.wages) ||
      !sumSourceMoney(...payments.map(payment => payment.federalWithheld)).eq(w2.federalWithheld)) return null;

  const shortPeriodPayments = payments.filter(payment => payment.unconditionallyAvailableOn <= endsOn);
  const shortPeriodWages = sumSourceMoney(...shortPeriodPayments.map(payment => payment.wages));
  return {
    shortPeriodWages,
    tax: calculateOrdinaryShortAccountingYearTax({
      taxYear,
      filingStatus,
      shortPeriodMonths,
      modifiedTaxableIncome: shortPeriodWages,
      shortPeriodAmti: shortPeriodWages,
    }),
  };
}
