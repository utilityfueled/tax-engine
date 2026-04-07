/**
 * Form 4952 — Investment Interest Expense Deduction
 * Spec: spec/federal/form-4952.yaml
 *
 * Limits the deduction for investment interest expense to the taxpayer's
 * net investment income. Excess is carried forward.
 * The deductible amount flows to Schedule A Line 9.
 */

import Decimal from "decimal.js";
import type { Form4952Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);

export interface Form4952Result {
  // Part I
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;

  // Part II
  line4a: Decimal;
  line4b: Decimal;
  line4c: Decimal;
  line4d: Decimal;
  line4e: Decimal;
  line4f: Decimal;
  line4g: Decimal;

  // Part III
  deductibleAmount: Decimal; // Line 5
  disallowedCarryforward: Decimal; // Line 7

  lines: CalculatedLine[];
}

export function calculateForm4952(input: Form4952Input): Form4952Result {
  const audit = new AuditTrail();

  // ── Part I: Total Investment Interest Expense ────────────────
  const line1 = d(input.investmentInterestExpense);
  audit.record("Form 4952", "1", "Investment interest expense paid or accrued",
    line1, "Current year margin interest and other investment interest");

  const line2 = d(input.priorYearDisallowed);
  audit.record("Form 4952", "2", "Disallowed from prior year",
    line2, "Prior year Form 4952 Line 7 carryforward");

  const line3 = line1.plus(line2);
  audit.record("Form 4952", "3", "Total investment interest expense",
    line3, `Line 1 (${line1}) + Line 2 (${line2})`);

  // ── Part II: Net Investment Income ───────────────────────────
  const line4a = d(input.grossInvestmentIncome);
  audit.record("Form 4952", "4a", "Gross income from property held for investment",
    line4a, "Interest, ordinary dividends, annuities, royalties");

  const line4b = d(input.qualifiedDividendsIncluded);
  audit.record("Form 4952", "4b", "Qualified dividends included on Line 4a",
    line4b, "Removed from investment income (preferential rate)");

  const line4c = zeroFloor(line4a.minus(line4b));
  audit.record("Form 4952", "4c", "Non-preferential gross investment income",
    line4c, `Line 4a (${line4a}) - Line 4b (${line4b})`);

  const line4d = zeroFloor(d(input.netGainFromInvestmentProperty));
  audit.record("Form 4952", "4d", "Net gain from disposition of investment property",
    line4d, "Non-preferential gain (short-term, recapture); floored at 0");

  const line4e = d(input.electedPreferentialIncome);
  audit.record("Form 4952", "4e", "Elected preferential income",
    line4e, "Qualified dividends and/or net capital gain elected as investment income (IRC §163(d)(4)(B))");

  const line4f = d(input.investmentExpenses);
  audit.record("Form 4952", "4f", "Investment expenses",
    line4f, "Deductible expenses connected with investment income");

  const line4g = Decimal.max(ZERO, line4c.plus(line4d).plus(line4e).minus(line4f));
  audit.record("Form 4952", "4g", "Net investment income",
    line4g, `max(0, ${line4c} + ${line4d} + ${line4e} - ${line4f})`, {
      "Line 4c": line4c,
      "Line 4d": line4d,
      "Line 4e": line4e,
      "Line 4f": line4f,
    });

  // ── Part III: Deduction ──────────────────────────────────────
  const deductibleAmount = Decimal.min(line3, line4g);
  audit.record("Form 4952", "5", "Deductible investment interest expense",
    deductibleAmount, `min(Line 3 ${line3}, Line 4g ${line4g}) → Schedule A Line 9`);

  const disallowedCarryforward = line3.minus(deductibleAmount);
  audit.record("Form 4952", "7", "Disallowed carryforward to next year",
    disallowedCarryforward, `Line 3 (${line3}) - Line 5 (${deductibleAmount})`);

  return {
    line1,
    line2,
    line3,
    line4a,
    line4b,
    line4c,
    line4d,
    line4e,
    line4f,
    line4g,
    deductibleAmount,
    disallowedCarryforward,
    lines: audit.getLines(),
  };
}
