/** 2026 Publication 505 correction. Spec: spec/federal/publication-505-form-1062-estimated-tax.yaml. */
import type Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";
import { calculateForm1062, type Form1062Input } from "./form-1062.js";

const PERIODS = [
  { periodEnd: "2026-03-31", column: "a" },
  { periodEnd: "2026-05-31", column: "b" },
  { periodEnd: "2026-08-31", column: "c" },
  { periodEnd: "2026-12-31", column: "d" },
] as const;
type Period = (typeof PERIODS)[number];

interface EstimatedTaxAdjustmentInput {
  calendarYearConfirmed: boolean;
  saleSourceId: string;
  form1062: Extract<Form1062Input, { sale: unknown }>;
  incomeRecognition: {
    taxYear: number;
    saleSourceId: string;
    sourceFactsConfirmed: boolean;
    cumulativeIncomeIncludesGain: Readonly<Record<Period["periodEnd"], boolean>>;
  };
}

interface EstimatedTaxAdjustment {
  worksheet21Line11bAddition: Decimal;
  worksheet29Line20Additions: (Period & { amount: Decimal })[];
  lines: CalculatedLine[];
}

export function calculatePublication505Form1062Adjustment(input: EstimatedTaxAdjustmentInput): EstimatedTaxAdjustment {
  const { form1062, incomeRecognition, saleSourceId } = input;
  if (input.calendarYearConfirmed !== true || form1062?.taxYear !== 2026
    || !form1062.sale || form1062.sales !== undefined || form1062.independentlyReportedElectedGain !== undefined) {
    throw new Error("Publication 505 adjustment requires one elected Form 1062 sale for calendar year 2026.");
  }
  if (typeof saleSourceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(saleSourceId)
    || incomeRecognition?.saleSourceId !== saleSourceId || incomeRecognition.taxYear !== form1062.taxYear
    || incomeRecognition.sourceFactsConfirmed !== true) {
    throw new Error("Publication 505 adjustment requires confirmed same-year income facts for the same original sale.");
  }

  const { applicableNetTaxLiability, deferredTax } = calculateForm1062(form1062);
  const periods = incomeRecognition.cumulativeIncomeIncludesGain;
  const periodError = "Publication 505 requires actual income inclusion for all four cumulative periods, ending with full-year inclusion.";
  if (!periods || Object.keys(periods).length !== PERIODS.length) throw new Error(periodError);
  let incomeIncluded = false;
  for (const { periodEnd } of PERIODS) {
    const included = periods[periodEnd];
    if (!Object.hasOwn(periods, periodEnd) || typeof included !== "boolean" || (incomeIncluded && !included)
      || (included && periodEnd < form1062.sale.saleDate)) {
      throw new Error(periodError);
    }
    incomeIncluded = included;
  }
  if (!incomeIncluded) throw new Error(periodError);

  const audit = new AuditTrail();
  const worksheet21Line11bAddition = audit.record("Pub. 505 Worksheet 2-1", "11b", "Section 1062 adjustment", deferredTax,
    "75% of full-year Form 1062 line 14", { "Full-year Form 1062 line 14": applicableNetTaxLiability });
  const worksheet29Line20Additions = PERIODS.map(period => {
    const includesGain = periods[period.periodEnd];
    const amount = audit.record("Pub. 505 Worksheet 2-9", `20${period.column}`, "Section 1062 adjustment",
      includesGain ? deferredTax : d(0), "Full-year deferred share if this period includes elected gain", {
        "Period end": period.periodEnd,
        "Elected gain included": includesGain ? "yes" : "no",
      });
    return { ...period, amount };
  });
  return { worksheet21Line11bAddition, worksheet29Line20Additions, lines: audit.getLines() };
}
