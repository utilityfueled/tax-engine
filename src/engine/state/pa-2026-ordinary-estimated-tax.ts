import type Decimal from "decimal.js";
import { z } from "zod";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

interface OrdinaryEstimateInput {
  taxYear: number;
  originalIndividualCalendarYearNonFarmerConfirmed: boolean;
  allPositivePATaxableIncomeClassesConfirmed: boolean;
  noPAWithholdingOrEstimatedCreditsConfirmed: boolean;
  noPriorOverpaymentCarryoverOrEstimatedPaymentsConfirmed: boolean;
  prior2025ReturnStatus: "not_filed" | "part_year_pa_resident";
  determinedOn: string;
  estimatedPATaxableIncome: string;
}

const completeSources = z.strictObject({
  taxYear: z.literal(2026),
  originalIndividualCalendarYearNonFarmerConfirmed: z.literal(true),
  allPositivePATaxableIncomeClassesConfirmed: z.literal(true),
  noPAWithholdingOrEstimatedCreditsConfirmed: z.literal(true),
  noPriorOverpaymentCarryoverOrEstimatedPaymentsConfirmed: z.literal(true),
  prior2025ReturnStatus: z.enum(["not_filed", "part_year_pa_resident"]),
  determinedOn: z.string(),
  estimatedPATaxableIncome: z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/u),
});
const firstBandDate = z.iso.date().refine(date => date >= "2026-01-01" && date < "2026-04-01");
const installmentDates = ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"] as const;

interface OrdinaryEstimate {
  kind: "pa-2026-ordinary-estimated-tax-planning-only";
  estimatedTax: Decimal;
  firstDeclarationDueBy: typeof installmentDates[0];
  fullPaymentWithFirstDeclaration: Decimal;
  installments: { dueBy: typeof installmentDates[number]; amount: Decimal }[];
  lines: CalculatedLine[];
}

/** Prepare exact planning amounts for a confirmed original 2026 estimate determined before April 1. */
export function estimatePennsylvania2026OrdinaryTax(input: OrdinaryEstimateInput): OrdinaryEstimate {
  const source = completeSources.parse(input);
  if (!firstBandDate.safeParse(source.determinedOn).success) {
    throw new RangeError("Enter the original 2026 estimate determination date before April 1.");
  }

  const income = d(source.estimatedPATaxableIncome);
  const grossTax = income.times("0.0307");
  const estimatedTax = grossTax.times("0.90");
  if (!income.gt("14000") || estimatedTax.lt("430.50")) {
    throw new RangeError("The estimate is outside the supported positive threshold range.");
  }

  const audit = new AuditTrail();
  const form = "PA REV-414(I)";
  const zero = d(0);
  audit.record(form, "1", "Estimated Pennsylvania taxable income", income, "Sum of confirmed positive PA-taxable income classes",
    { "Determination date": source.determinedOn });
  audit.record(form, "2", "Estimated tax", grossTax, "Line 1 × 0.0307", { "Line 1": income });
  audit.record(form, "3", "Resident credit", zero, "Confirmed none");
  audit.record(form, "4", "Schedule OC credits", zero, "Confirmed none");
  audit.record(form, "5", "Special Tax Forgiveness credit", zero, "Confirmed none");
  audit.record(form, "6", "Schedule DC credit", zero, "Confirmed none");
  audit.record(form, "7", "Total estimated credits", zero, "Sum of lines 3–6");
  audit.record(form, "8", "Estimated tax net of credits", grossTax, "Line 2 − line 7",
    { "Line 2": grossTax, "Line 7": zero });
  audit.record(form, "9", "Current-year method", estimatedTax, "Line 8 × 0.90", { "Line 8": grossTax });
  audit.record(form, "15", "Total estimated tax", estimatedTax, "Line 9 when the prior-year safe harbor is unavailable",
    { "Line 9": estimatedTax, "2025 PA return status": source.prior2025ReturnStatus });
  audit.record(form, "16", "Nonresident withholding adjustment", zero, "Confirmed none");
  audit.record(form, "17", "Required estimated tax worksheet amount", estimatedTax, "Line 15 − line 16",
    { "Line 15": estimatedTax, "Line 16": zero });

  const installment = estimatedTax.div(4);
  return {
    kind: "pa-2026-ordinary-estimated-tax-planning-only",
    estimatedTax,
    firstDeclarationDueBy: installmentDates[0],
    fullPaymentWithFirstDeclaration: estimatedTax,
    installments: installmentDates.map(dueBy => ({ dueBy, amount: installment })),
    lines: audit.getLines(),
  };
}
