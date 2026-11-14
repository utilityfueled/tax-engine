import type Decimal from 'decimal.js';
import { z } from 'zod';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d } from '@/utils/decimal.js';

const sourceAmount = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/u);
const reportedWholeDollars = sourceAmount.regex(/^\d+(?:\.0{1,2})?$/u, 'Expected a whole-dollar amount from the filed PA-40.');
const reportedTax = z.strictObject({
  taxYear: z.literal(2025),
  filedOn: z.iso.date(),
  completeFullYearResidentCalendarOriginalConfirmed: z.literal(true),
  estimatedPaymentsRequiredConfirmed: z.literal(true),
  taxableIncome: reportedWholeDollars,
  taxForgiveness: reportedWholeDollars,
});
const installment = z.strictObject({
  receiptId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u),
  taxYear: z.literal(2026),
  installment: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  amount: sourceAmount,
  paymentDate: z.iso.date(),
  accountCreditDate: z.iso.date(),
});
const sources = z.strictObject({
  taxYear: z.literal(2026),
  ordinaryOriginalCalendarYearFullYearResidentConfirmed: z.literal(true),
  noFarmerOrOtherSpecialInstallmentRuleConfirmed: z.literal(true),
  sameTaxpayerAndAccountForAllOriginalsConfirmed: z.literal(true),
  currentYearLifeAndNoPaymentReliefConfirmed: z.literal(true),
  completeCurrentIncomeCreditAndPaymentOriginalsConfirmed: z.literal(true),
  noWithholdingCreditsCarryforwardOffsetsOrReversalsConfirmed: z.literal(true),
  actualAsOfDate: z.iso.date(),
  firstDeterminedEstimatesRequiredOn: z.iso.date().refine(date => date >= '2026-01-01' && date <= '2026-03-31'),
  declaration: z.strictObject({
    taxYear: z.literal(2026),
    filedOn: z.iso.date(),
    originalUnamendedConfirmed: z.literal(true),
    estimatedTax: sourceAmount,
  }),
  actualAnnualIncomeTax: sourceAmount,
  actualPATaxableIncomeThroughMarch: sourceAmount,
  priorReturn: reportedTax,
  estimatedPaymentOriginals: z.tuple([installment, installment, installment, installment]),
});

const dueDates = ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'] as const;

interface SingleLateInterestEstimate {
  kind: 'pa-2026-single-late-installment-interest-estimate';
  dueDate: typeof dueDates[0];
  clearedOn: string;
  daysUnpaid: number;
  underpayment: Decimal;
  dailyInterestRate: Decimal;
  exactInterest: Decimal;
  lines: CalculatedLine[];
}

/** Statutory draft estimate for a single missed first installment that cleared entirely before the second deadline. */
export function estimatePennsylvania2026SingleLateInstallmentInterest(input: z.input<typeof sources>): SingleLateInterestEstimate {
  const source = sources.parse(input);
  const dueDate = dueDates[0];
  const annualTax = d(source.actualAnnualIncomeTax);
  const estimatedTax = annualTax.times('0.9');
  const underpayment = estimatedTax.div(4);
  if (annualTax.lt('1000') || !underpayment.isInteger() || !d(source.declaration.estimatedTax).eq(estimatedTax)) {
    throw new RangeError('Confirmed current annual tax and declaration must agree on an exact positive whole-dollar installment.');
  }
  const priorIncome = d(source.priorReturn.taxableIncome);
  if (source.priorReturn.filedOn < '2026-01-01' || source.priorReturn.filedOn > source.actualAsOfDate
    || !priorIncome.gt('11000') || !d(source.priorReturn.taxForgiveness).isZero()
    || !d(source.actualPATaxableIncomeThroughMarch).gt('14000')) {
    throw new RangeError('Confirmed prior-year and current-period tax facts must independently rule out the first installment exceptions.');
  }
  // The REV-414 declaration uses a separate annual comparison from the statutory installment exceptions.
  if (priorIncome.times('0.0307').lt(estimatedTax)) {
    throw new RangeError('The declaration must agree with the smaller annual amount in the 2026 estimated tax worksheet.');
  }

  const receipts: typeof source.estimatedPaymentOriginals = [...source.estimatedPaymentOriginals];
  receipts.sort((left, right) => left.installment - right.installment);
  const uniqueIds = new Set(receipts.map(receipt => receipt.receiptId));
  if (uniqueIds.size !== dueDates.length || receipts.some((receipt, index) => receipt.installment !== index + 1
    || receipt.paymentDate !== receipt.accountCreditDate || receipt.accountCreditDate > source.actualAsOfDate
    || !d(receipt.amount).eq(underpayment))) {
    throw new RangeError('Four distinct and exact original receipts with known installment, dates and credits are required.');
  }
  const [first, ...remaining] = receipts;
  const clearedOn = first.accountCreditDate;
  if (source.declaration.filedOn !== clearedOn || clearedOn <= dueDate || clearedOn >= dueDates[1]
    || remaining.some((receipt, index) => receipt.accountCreditDate !== dueDates[index + 1])) {
    throw new RangeError('The original declaration and exact Q1 clearing must coincide between the first two due dates; other receipts must be timely.');
  }

  const daysUnpaid = (Date.parse(clearedOn) - Date.parse(dueDate)) / 86_400_000;
  const dailyInterestRate = d('0.000192');
  const exactInterest = underpayment.times(daysUnpaid.toString()).times(dailyInterestRate);
  const audit = new AuditTrail();
  const statute = 'PA Tax Reform Code §352(d)';
  audit.record(statute, 'first-installment-underpayment', 'First installment underpayment', underpayment,
    'Confirmed annual income tax × 0.90 ÷ 4; no timely payments or credits', { 'Annual tax': annualTax });
  audit.record(statute, 'first-installment-interest', 'Exact interest through clearing', exactInterest,
    'Underpayment × elapsed calendar days × REV-1611 daily rate', {
      'Due date': dueDate, 'Clearing date': clearedOn, 'Days unpaid': String(daysUnpaid), 'Daily rate': dailyInterestRate,
    });
  return { kind: 'pa-2026-single-late-installment-interest-estimate', dueDate, clearedOn,
    daysUnpaid, underpayment, dailyInterestRate, exactInterest, lines: audit.getLines() };
}
