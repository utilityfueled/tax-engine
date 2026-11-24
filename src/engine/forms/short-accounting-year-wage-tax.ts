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

const period = z.strictObject({
  taxYear: year,
  ownerReference: reference,
  sourceReference: reference,
  filingStatus: z.literal("single"),
  startsOn: date,
  endsOn: date,
  dateOfBirth: date,
  regularChangeConfirmed: z.literal(true),
  livingTaxpayerConfirmed: z.literal(true),
});
const sourceIdentity = { taxYear: year, ownerReference: reference, employerEin };
const payrollPayment = z.strictObject({
  sourceId: reference,
  receivedOn: date,
  unconditionallyAvailableOn: date,
  wages: money, // Federal taxable wages on the Box 1 basis
  federalWithheld: money,
});
const payrollFacts = {
  cashBasisActualAndConstructiveDatesConfirmed: z.literal(true),
  ordinaryWagesOnlyConfirmed: z.literal(true),
  noDeductionsCreditsOrAmtAdjustmentsConfirmed: z.literal(true),
};

const calendarOriginals = z.strictObject({
  period,
  w2: z.strictObject({
    ...sourceIdentity,
    sourceReference: reference,
    accountHolder: z.literal("primary"),
    wages: money,
    federalWithheld: money,
  }),
  payroll: z.strictObject({
    ...sourceIdentity,
    ...payrollFacts,
    w2SourceReference: reference,
    soleOriginalW2Confirmed: z.literal(true),
    calendarPayrollCompleteConfirmed: z.literal(true),
    payments: z.array(payrollPayment).min(1),
  }),
});

const cutoffIdentity = { ...sourceIdentity, sourceReference: reference, startsOn: date, endsOn: date };
const cutoffOriginals = z.strictObject({
  period,
  cutoffSummary: z.strictObject({
    ...cutoffIdentity,
    accountHolder: z.literal("primary"),
    originalIssuerSummaryConfirmed: z.literal(true),
    federalTaxableWages: money,
    federalWithheld: money,
  }),
  payroll: z.strictObject({
    ...cutoffIdentity,
    ...payrollFacts,
    cutoffSummarySourceReference: reference,
    originalPayrollLedgerConfirmed: z.literal(true),
    soleEmployerConfirmed: z.literal(true),
    cutoffPayrollCompleteConfirmed: z.literal(true),
    payments: z.array(payrollPayment),
  }),
});
const originals = z.union([calendarOriginals, cutoffOriginals]);

/** Private tax-base candidate for complete, matched original payroll sources. */
export function calculateOrdinaryShortAccountingYearWageTax(input: unknown) {
  const parsed = originals.safeParse(input);
  if (!parsed.success) return null;
  const packet = parsed.data;
  const { period, payroll } = packet;
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

  const calendarHistory = "w2" in packet;
  const summary = calendarHistory ? packet.w2 : packet.cutoffSummary;
  if (summary.taxYear !== taxYear || payroll.taxYear !== taxYear ||
      summary.ownerReference !== ownerReference || payroll.ownerReference !== ownerReference ||
      summary.employerEin !== payroll.employerEin) return null;

  if (calendarHistory) {
    if (packet.w2.sourceReference !== packet.payroll.w2SourceReference) return null;
  } else if (packet.cutoffSummary.startsOn !== startsOn || packet.cutoffSummary.endsOn !== endsOn ||
      packet.payroll.startsOn !== startsOn || packet.payroll.endsOn !== endsOn ||
      packet.payroll.sourceReference === packet.cutoffSummary.sourceReference ||
      packet.payroll.cutoffSummarySourceReference !== packet.cutoffSummary.sourceReference) return null;

  const coverageEnd = calendarHistory ? calendarEnd : endsOn;
  const { payments } = payroll;
  if (new Set(payments.map(payment => payment.sourceId)).size !== payments.length ||
      payments.some(({ unconditionallyAvailableOn, receivedOn }) =>
        unconditionallyAvailableOn < startsOn || unconditionallyAvailableOn > coverageEnd ||
        unconditionallyAvailableOn > receivedOn)) return null;
  const summaryWages = calendarHistory ? packet.w2.wages : packet.cutoffSummary.federalTaxableWages;
  const payrollWages = sumSourceMoney(...payments.map(payment => payment.wages));
  if (!payrollWages.eq(summaryWages) ||
      !sumSourceMoney(...payments.map(payment => payment.federalWithheld)).eq(summary.federalWithheld)) return null;

  const shortPeriodWages = calendarHistory
    ? sumSourceMoney(...payments.filter(payment => payment.unconditionallyAvailableOn <= endsOn).map(payment => payment.wages))
    : payrollWages;
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
