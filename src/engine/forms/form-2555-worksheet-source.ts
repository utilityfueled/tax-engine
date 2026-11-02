/** Spec: form-2555-source-binding.yaml, signed-worksheet-source. */
import Decimal from "decimal.js";
import type { Form2555Result } from "./form-2555.js";

/** A signed worksheet amount needs its complete calculated Form2555 source. */
export function resolveForm2555WorksheetAddback(net: Decimal, housing: Decimal, source?: Form2555Result, taxYear?: number): Decimal {
  const fail = () => { throw new Error("Form2555 signed worksheet requires a consistent actual source"); };
  if (!net.isFinite() || !housing.isFinite() || housing.lt(0)) fail();
  if (net.lt(0) || source?.netExclusion.lt(0)) {
    if (!source?.sourceFactsVerified || (taxYear !== undefined && source.taxYear !== taxYear)) fail();
    if (!source) return fail();
    const amounts = new Map<string, Decimal>();
    for (const row of source.lines) {
      if (row.form !== "2555" || !["43", "44", "45", "50"].includes(row.line)) continue;
      if (amounts.has(row.line) || !Decimal.isDecimal(row.value) || !row.value.isFinite()) fail();
      amounts.set(row.line, row.value);
    }
    const gross = amounts.get("43"), deductions = amounts.get("44"), reported = amounts.get("45"), deduction = amounts.get("50");
    const prior = source.priorYearIncomeExclusion;
    if (!gross || !deductions || !reported || !deduction || !prior || !prior.isFinite() || prior.lt(0)
      || gross.lt(0) || deductions.lt(0) || !gross.eq(source.totalExclusion) || !gross.minus(deductions).plus(prior).eq(net)
      || !reported.eq(net) || !deduction.eq(housing) || !source.netExclusion.eq(net) || !source.totalIncomeReduction.eq(net)
      || !source.housingDeduction.eq(housing) || !source.foreignEarnedIncomeTaxWorksheetAmount.eq(net.plus(housing))) fail();
  }
  return net.plus(housing);
}
