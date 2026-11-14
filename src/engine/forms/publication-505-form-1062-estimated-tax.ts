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

interface IncomeRecognitionSource {
  taxYear: number;
  saleSourceId: string;
  sourceFactsConfirmed: boolean;
}

type InclusionByPeriod = Readonly<Record<Period["periodEnd"], boolean>>;

interface IncomeRecognition extends IncomeRecognitionSource {
  cumulativeIncomeIncludesGain: InclusionByPeriod;
}

interface ExactIncomeRecognition extends IncomeRecognitionSource {
  cumulativeRecognizedGain: Readonly<Record<Period["periodEnd"], string>>;
}

type EstimatedTaxAdjustmentInput = { calendarYearConfirmed: boolean } & ({
  saleSourceId: string;
  form1062: Extract<Form1062Input, { sale: unknown }>;
  incomeRecognition: IncomeRecognition;
  incomeRecognitionBySale?: never;
} | {
  saleSourceId?: never;
  form1062: Extract<Form1062Input, { sales: unknown }>;
  incomeRecognition?: never;
  incomeRecognitionBySale: readonly ExactIncomeRecognition[];
});

interface EstimatedTaxAdjustment {
  worksheet21Line11bAddition: Decimal;
  worksheet29Line20Additions: (Period & { amount: Decimal })[];
  lines: CalculatedLine[];
}

function verifyIncomeSource(incomeRecognition: IncomeRecognitionSource | undefined, saleSourceId: string) {
  if (typeof saleSourceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(saleSourceId)
    || incomeRecognition?.saleSourceId !== saleSourceId || incomeRecognition.taxYear !== 2026
    || incomeRecognition.sourceFactsConfirmed !== true) {
    throw new Error("Publication 505 adjustment requires confirmed same-year income facts for the same original sale.");
  }
}

function verifyInclusionPeriods(periods: InclusionByPeriod, saleDate: string) {
  const periodError = "Publication 505 requires actual income inclusion for all four cumulative periods, ending with full-year inclusion.";
  if (!periods || typeof periods !== "object" || Object.keys(periods).length !== PERIODS.length) throw new Error(periodError);
  let incomeIncluded = false;
  for (const { periodEnd } of PERIODS) {
    const included = periods[periodEnd];
    if (!Object.hasOwn(periods, periodEnd) || typeof included !== "boolean" || (incomeIncluded && !included)
      || (included && periodEnd < saleDate)) {
      throw new Error(periodError);
    }
    incomeIncluded = included;
  }
  if (!incomeIncluded) throw new Error(periodError);
  return periods;
}

function verifyExactIncomeRecognition(record: ExactIncomeRecognition | undefined, saleSourceId: string,
  saleDate: string, fullGain: string): InclusionByPeriod {
  verifyIncomeSource(record, saleSourceId);
  const gains = record?.cumulativeRecognizedGain;
  const amountError = "Publication 505 requires zero or full recognized gain for all four cumulative periods of each elected sale.";
  if (!gains || typeof gains !== "object" || Object.keys(gains).length !== PERIODS.length) throw new Error(amountError);

  const expectedGain = d(fullGain);
  const isFullyIncluded = (period: Period["periodEnd"]) => {
    const raw = gains[period];
    if (!Object.hasOwn(gains, period) || typeof raw !== "string" || !/^\d{1,12}(?:\.\d{1,2})?$/u.test(raw)) {
      throw new Error(amountError);
    }
    const amount = d(raw);
    if (amount.isZero()) return false;
    if (amount.eq(expectedGain)) return true;
    throw new Error(amountError);
  };
  return verifyInclusionPeriods({
    "2026-03-31": isFullyIncluded("2026-03-31"),
    "2026-05-31": isFullyIncluded("2026-05-31"),
    "2026-08-31": isFullyIncluded("2026-08-31"),
    "2026-12-31": isFullyIncluded("2026-12-31"),
  }, saleDate);
}

export function calculatePublication505Form1062Adjustment(input: EstimatedTaxAdjustmentInput): EstimatedTaxAdjustment {
  const { form1062, incomeRecognition, saleSourceId, incomeRecognitionBySale } = input;
  if (input.calendarYearConfirmed !== true || form1062?.taxYear !== 2026) {
    throw new Error("Publication 505 adjustment requires an elected Form 1062 sale for calendar year 2026.");
  }
  const { applicableNetTaxLiability, deferredTax } = calculateForm1062(form1062);

  let periods: InclusionByPeriod;
  if (form1062.sale) {
    if (incomeRecognitionBySale !== undefined || saleSourceId === undefined) {
      throw new Error("Publication 505 adjustment requires either one original or records for all elected sales.");
    }
    verifyIncomeSource(incomeRecognition, saleSourceId);
    periods = verifyInclusionPeriods(incomeRecognition.cumulativeIncomeIncludesGain, form1062.sale.saleDate);
  } else {
    if (incomeRecognition !== undefined || saleSourceId !== undefined) {
      throw new Error("Publication 505 adjustment requires either one original or records for all elected sales.");
    }
    const [firstSale, ...remainingSales] = form1062.sales;
    if (!Array.isArray(incomeRecognitionBySale) || incomeRecognitionBySale.length !== form1062.sales.length) {
      throw new Error("Publication 505 adjustment requires one income record for each elected sale.");
    }
    const bySale = new Map<string, ExactIncomeRecognition>();
    for (const record of incomeRecognitionBySale) {
      if (!record || typeof record.saleSourceId !== "string" || bySale.has(record.saleSourceId)) {
        throw new Error("Publication 505 adjustment requires one income record for each elected sale.");
      }
      bySale.set(record.saleSourceId, record);
    }
    // Form 1062 above has already matched each independently reported gain to its Schedule A line 13.
    periods = verifyExactIncomeRecognition(bySale.get(firstSale.sourceId), firstSale.sourceId,
      firstSale.scheduleA.saleDate, firstSale.scheduleA.independentlyReportedGain);
    for (const sale of remainingSales) {
      const salePeriods = verifyExactIncomeRecognition(bySale.get(sale.sourceId), sale.sourceId,
        sale.scheduleA.saleDate, sale.scheduleA.independentlyReportedGain);
      if (PERIODS.some(({ periodEnd }) => salePeriods[periodEnd] !== periods[periodEnd])) {
        throw new Error("Publication 505 adjustment requires every elected sale to enter the same cumulative income columns.");
      }
    }
  }

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
