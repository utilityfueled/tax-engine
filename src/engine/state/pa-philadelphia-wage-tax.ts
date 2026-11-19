/**
 * Philadelphia Wage Tax / Earnings Tax
 * Spec: spec/state/pa-philadelphia-wage-tax.yaml
 */

import Decimal from "decimal.js";
import { z } from "zod";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { CalculatedLine } from "@/models/outputs.js";

export type PhiladelphiaWageTaxResidencyStatus = "resident" | "nonresident";

interface PhiladelphiaWageTaxRates {
  resident: {
    preJuly: Decimal;
    postJuly: Decimal;
  };
  nonresident: {
    preJuly: Decimal;
    postJuly: Decimal;
  };
  reducedRate: Decimal;
}

const PHILADELPHIA_WAGE_TAX_CONSTANTS: Record<number, PhiladelphiaWageTaxRates> = {
  2025: {
    resident: {
      preJuly: new Decimal("0.0375"),
      postJuly: new Decimal("0.0374"),
    },
    nonresident: {
      preJuly: new Decimal("0.0344"),
      postJuly: new Decimal("0.0343"),
    },
    reducedRate: new Decimal("0.015"),
  },
  2026: {
    resident: {
      preJuly: new Decimal("0.0374"),
      postJuly: new Decimal("0.03735"),
    },
    nonresident: {
      preJuly: new Decimal("0.0343"),
      postJuly: new Decimal("0.03425"),
    },
    reducedRate: new Decimal("0.015"),
  },
};

function cents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface PhiladelphiaWageTaxInput {
  taxYear: number;
  residencyStatus: PhiladelphiaWageTaxResidencyStatus;
  taxableCompensationPreJuly: Decimal;
  taxableCompensationPostJuly: Decimal;
  scheduleSPApproved?: boolean;
  withholding: Decimal;
}

const sourceReference = z.string().trim().min(1);
const date2026 = z.iso.date().refine(date => date.startsWith("2026-"));
const sourceMoney = z.custom<Decimal>(value =>
  Decimal.isDecimal(value) && value.isFinite() && value.gte(0) && value.decimalPlaces() <= 2,
);
const original = {
  taxYear: z.literal(2026),
  taxpayerRef: sourceReference,
  sourceRef: sourceReference,
};

const salaryWageTaxInput = z.strictObject({
  taxYear: z.literal(2026),
  residencyStatus: z.literal("nonresident"),
  salarySource: z.strictObject({
    residence: z.strictObject({ ...original, fullYearOutsidePhiladelphia: z.literal(true) }),
    w2: z.strictObject({
      ...original,
      employerRef: sourceReference,
      singleOriginalLocalRow: z.literal(true),
      localityName: z.string().trim().refine(name => name.toLowerCase() === "philadelphia"),
      localWages: sourceMoney.refine(amount => amount.gt(0)),
      localWithholding: sourceMoney.refine(amount => amount.gt(0)),
    }),
    certification: z.strictObject({
      ...original,
      employerRef: sourceReference,
      signed: z.literal(true),
      completeWorkdaysAndPayroll: z.literal(true),
      straightSalaryOnly: z.literal(true),
      wholeWorkdaysOnly: z.literal(true),
      philadelphiaBaseOfOperations: z.literal(true),
      regularPhiladelphiaWorksite: z.literal(true),
      noExpenseDeduction: z.literal(true),
      noIncomeBasedRelief: z.literal(true),
      actualWorkdaysPreJuly: z.number().int().min(0).max(181),
      actualWorkdaysPostJuly: z.number().int().min(0).max(184),
      requiredOutsideWorkdays: z.array(z.strictObject({ workedOn: date2026, locationRef: sourceReference })),
    }),
    payroll: z.array(z.strictObject({
      sourceRef: sourceReference,
      paidOn: date2026,
      grossSalary: sourceMoney.refine(amount => amount.gt(0)),
      philadelphiaWithholding: sourceMoney,
    })).min(1),
    workdays: z.array(z.strictObject({
      workedOn: date2026,
      paymentRef: sourceReference,
      locationRef: sourceReference,
      kind: z.enum(["philadelphia", "convenience_remote", "employer_required_outside"]),
    })).min(1),
  }),
});

export type Philadelphia2026SalaryWageTaxInput = z.input<typeof salaryWageTaxInput>;

export interface PhiladelphiaWageTaxResult {
  residencyStatus: PhiladelphiaWageTaxResidencyStatus;
  taxableCompensationPreJuly: Decimal;
  taxableCompensationPostJuly: Decimal;
  totalTaxableCompensation: Decimal;
  preJulyRate: Decimal;
  postJulyRate: Decimal;
  standardTax: Decimal;
  scheduleSPApproved: boolean;
  reducedRate: Decimal;
  reducedRateTax: Decimal;
  finalTax: Decimal;
  withholding: Decimal;
  overpayment: Decimal;
  balanceDue: Decimal;
  lines: CalculatedLine[];
}

function isPreJuly(date: string): boolean {
  return date < "2026-07-01";
}

function readSalaryWageTaxInput(
  request: Philadelphia2026SalaryWageTaxInput,
  audit: AuditTrail,
): PhiladelphiaWageTaxInput {
  const parsed = salaryWageTaxInput.safeParse(request);
  if (!parsed.success) throw new Error("Philadelphia 2026 salary source requires complete original records");

  const { residence, w2, certification, payroll, workdays } = parsed.data.salarySource;
  if (residence.taxpayerRef !== w2.taxpayerRef || certification.taxpayerRef !== w2.taxpayerRef
    || certification.employerRef !== w2.employerRef) {
    throw new Error("Philadelphia 2026 salary source owner and employer must match");
  }

  const payments = new Map(payroll.map(payment => [payment.sourceRef, payment]));
  const actualWorkdays = new Set<string>();
  const usedPayments = new Set<string>();
  const locationIsOutsidePhiladelphia = new Map<string, boolean>();
  const certifiedOutside = new Map(certification.requiredOutsideWorkdays.map(day => [day.workedOn, day.locationRef]));
  if (payments.size !== payroll.length || certifiedOutside.size !== certification.requiredOutsideWorkdays.length) {
    throw new Error("Philadelphia 2026 salary source contains duplicate payment or certification records");
  }

  const Exact = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
  const preJuly = { gross: new Exact(0), worked: 0, requiredOutside: 0 };
  const postJuly = { gross: new Exact(0), worked: 0, requiredOutside: 0 };
  let withholding = new Exact(0);
  for (const payment of payroll) {
    const half = isPreJuly(payment.paidOn) ? preJuly : postJuly;
    half.gross = half.gross.plus(payment.grossSalary);
    withholding = withholding.plus(payment.philadelphiaWithholding);
  }
  if (!preJuly.gross.plus(postJuly.gross).eq(w2.localWages) || !withholding.eq(w2.localWithholding)) {
    throw new Error("Philadelphia 2026 salary source payroll must reconcile to the original W-2 local row");
  }

  for (const workday of workdays) {
    const { workedOn, paymentRef, locationRef, kind } = workday;
    const payment = payments.get(paymentRef);
    if (!payment || workedOn > payment.paidOn || isPreJuly(workedOn) !== isPreJuly(payment.paidOn)
      || actualWorkdays.has(workedOn)) {
      throw new Error("Philadelphia 2026 salary source requires unique workdays linked to payments in the same half");
    }
    const outsidePhiladelphia = kind !== "philadelphia";
    const priorGeography = locationIsOutsidePhiladelphia.get(locationRef);
    if (priorGeography !== undefined && priorGeography !== outsidePhiladelphia) {
      throw new Error("Philadelphia 2026 salary source classifies the same location both inside and outside the city");
    }
    locationIsOutsidePhiladelphia.set(locationRef, outsidePhiladelphia);
    const requiredOutside = kind === "employer_required_outside";
    const certifiedLocation = certifiedOutside.get(workedOn);
    if (requiredOutside ? certifiedLocation !== locationRef : certifiedLocation !== undefined) {
      throw new Error("Philadelphia 2026 salary source workdays must match the signed employer certification");
    }
    actualWorkdays.add(workedOn);
    usedPayments.add(paymentRef);
    const half = isPreJuly(payment.paidOn) ? preJuly : postJuly;
    half.worked += 1;
    if (requiredOutside) half.requiredOutside += 1;
  }
  if (usedPayments.size !== payroll.length || preJuly.worked !== certification.actualWorkdaysPreJuly
    || postJuly.worked !== certification.actualWorkdaysPostJuly
    || preJuly.requiredOutside + postJuly.requiredOutside !== certifiedOutside.size) {
    throw new Error("Philadelphia 2026 salary source workdays must reconcile to payments and certified totals");
  }

  const allocatedSalary = ({ gross, worked, requiredOutside }: typeof preJuly) =>
    worked === 0 ? gross : cents(gross.times(worked - requiredOutside).div(worked));
  const taxableCompensationPreJuly = allocatedSalary(preJuly);
  const taxableCompensationPostJuly = allocatedSalary(postJuly);
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "2026-nonresident-salary-draft",
    "Philadelphia straight-salary allocation, 2026 review draft",
    taxableCompensationPreJuly.plus(taxableCompensationPostJuly),
    "Each payment half uses its gross salary × (worked days − required outside days) ÷ worked days, rounded to cents.",
    {
      preJulyGross: preJuly.gross,
      preJulyWorkdays: new Decimal(preJuly.worked),
      preJulyRequiredOutsideDays: new Decimal(preJuly.requiredOutside),
      postJulyGross: postJuly.gross,
      postJulyWorkdays: new Decimal(postJuly.worked),
      postJulyRequiredOutsideDays: new Decimal(postJuly.requiredOutside),
    },
  );
  return {
    taxYear: 2026,
    residencyStatus: "nonresident",
    taxableCompensationPreJuly,
    taxableCompensationPostJuly,
    scheduleSPApproved: false,
    withholding,
  };
}

export function calculatePhiladelphiaWageTax(
  request: PhiladelphiaWageTaxInput | Philadelphia2026SalaryWageTaxInput,
): PhiladelphiaWageTaxResult {
  const audit = new AuditTrail();
  const input = "salarySource" in request ? readSalaryWageTaxInput(request, audit) : request;
  const constants = PHILADELPHIA_WAGE_TAX_CONSTANTS[input.taxYear];
  if (!constants) {
    throw new Error(`Philadelphia Wage Tax constants not available for tax year ${input.taxYear}`);
  }

  const periodRates = constants[input.residencyStatus];
  const taxableCompensationPreJuly = cents(zeroFloor(d(input.taxableCompensationPreJuly)));
  const taxableCompensationPostJuly = cents(zeroFloor(d(input.taxableCompensationPostJuly)));
  const totalTaxableCompensation = cents(
    taxableCompensationPreJuly.plus(taxableCompensationPostJuly),
  );
  const scheduleSPApproved = input.scheduleSPApproved === true;
  const withholding = cents(zeroFloor(d(input.withholding)));

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "1",
    `Taxable compensation paid January 1 through June 30, ${input.taxYear}`,
    taxableCompensationPreJuly,
    "Input pre-July taxable compensation, floored at 0 and rounded to cents",
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "2",
    `Taxable compensation paid on or after July 1, ${input.taxYear}`,
    taxableCompensationPostJuly,
    "Input post-July taxable compensation, floored at 0 and rounded to cents",
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "3-pre",
    `Applicable pre-July ${input.taxYear} rate`,
    periodRates.preJuly,
    input.residencyStatus === "resident"
      ? `${input.taxYear} Philadelphia resident rate through June 30, ${input.taxYear}`
      : `${input.taxYear} Philadelphia nonresident rate through June 30, ${input.taxYear}`,
  );
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "3-post",
    `Applicable post-July ${input.taxYear} rate`,
    periodRates.postJuly,
    input.residencyStatus === "resident"
      ? `${input.taxYear} Philadelphia resident rate on and after July 1, ${input.taxYear}`
      : `${input.taxYear} Philadelphia nonresident rate on and after July 1, ${input.taxYear}`,
  );

  const preJulyTax = cents(taxableCompensationPreJuly.times(periodRates.preJuly));
  const postJulyTax = cents(taxableCompensationPostJuly.times(periodRates.postJuly));
  const standardTax = cents(preJulyTax.plus(postJulyTax));

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "4",
    "Standard Philadelphia Wage/Earnings Tax",
    standardTax,
    "(Line 1 × pre-July rate) + (Line 2 × post-July rate), rounded to cents",
    {
      taxableCompensationPreJuly,
      taxableCompensationPostJuly,
      preJulyRate: periodRates.preJuly,
      postJulyRate: periodRates.postJuly,
    },
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "5",
    "Income-based reduced-rate eligibility",
    scheduleSPApproved ? new Decimal(1) : new Decimal(0),
    scheduleSPApproved
      ? "PA Schedule SP approval present, so the 1.5% reduced rate applies"
      : "No PA Schedule SP approval, so the standard resident or nonresident rate applies",
  );

  const reducedRateTax = cents(totalTaxableCompensation.times(constants.reducedRate));
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "6",
    "Income-based reduced-rate tax",
    reducedRateTax,
    "(Line 1 + Line 2) × 1.5%, rounded to cents",
    {
      totalTaxableCompensation,
      reducedRate: constants.reducedRate,
    },
  );

  const finalTax = scheduleSPApproved ? reducedRateTax : standardTax;
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "7",
    "Final Philadelphia Wage/Earnings Tax liability",
    finalTax,
    scheduleSPApproved ? "Reduced-rate tax because PA Schedule SP is approved" : "Standard tax because PA Schedule SP is not approved",
  );

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "8",
    "Philadelphia Wage Tax withheld or paid",
    withholding,
    "Input Philadelphia Wage Tax withholding/payments, floored at 0 and rounded to cents",
  );

  const settlement = cents(withholding.minus(finalTax));
  const overpayment = settlement.isPositive() ? settlement : new Decimal(0);
  const balanceDue = settlement.isNegative() ? settlement.abs() : new Decimal(0);

  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "9",
    "Overpayment",
    overpayment,
    "If Line 8 > Line 7, Line 8 - Line 7; otherwise 0",
  );
  audit.record(
    "PA-Philadelphia-Wage-Tax",
    "10",
    "Balance due",
    balanceDue,
    "If Line 7 > Line 8, Line 7 - Line 8; otherwise 0",
  );

  return {
    residencyStatus: input.residencyStatus,
    taxableCompensationPreJuly,
    taxableCompensationPostJuly,
    totalTaxableCompensation,
    preJulyRate: periodRates.preJuly,
    postJulyRate: periodRates.postJuly,
    standardTax,
    scheduleSPApproved,
    reducedRate: constants.reducedRate,
    reducedRateTax,
    finalTax,
    withholding,
    overpayment,
    balanceDue,
    lines: audit.getLines(),
  };
}
