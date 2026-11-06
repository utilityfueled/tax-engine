/** Investment interest; printed2025/2026Form4952. Spec:spec/federal/form-4952.yaml. */
import Decimal from "decimal.js";
import type { Form4952Input } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, roundDollar, zeroFloor } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

export interface Form4952Result {
  taxYear: number;
  sourceFactsVerified: boolean;
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4a: Decimal;
  line4b: Decimal;
  line4c: Decimal;
  line4d: Decimal;
  line4e: Decimal;
  line4f: Decimal;
  line4g: Decimal;
  line4h: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  /** Printed line8; generally ScheduleA9, subject to source allocation/at-risk rules. */
  deductibleAmount: Decimal;
  /** Printed line7 for the following tax year. */
  disallowedCarryforward: Decimal;
  electedNetCapitalGain: Decimal;
  electedQualifiedDividends: Decimal;
  hasExplicitCapitalGainElection: boolean;
  lines: CalculatedLine[];
}

export function calculateForm4952(input: Form4952Input, taxYear = 2025): Form4952Result {
  if (taxYear !== 2025 && taxYear !== 2026) throw new Error("Unsupported Form4952 tax year");
  const sourceRequired = taxYear === 2026 || input.sourceFactsConfirmed !== undefined || input.sourceTaxYear !== undefined;
  const sourceAmounts = ["investmentInterestExpense", "priorYearDisallowed", "grossInvestmentIncome", "qualifiedDividendsIncluded", "netGainFromInvestmentProperty", "netCapitalGainFromInvestmentProperty", "electedPreferentialIncome", "investmentExpenses"] as const;
  if (sourceRequired) {
    if (input.sourceFactsConfirmed !== true || !input.sourceReference?.trim()) throw new Error("Form4952 requires confirmed actual source facts and a source reference");
    if (input.sourceTaxYear !== taxYear) throw new Error("Form4952 source year must match the return year");
    if (input.sourceFactsComplete === false || sourceAmounts.some(key => input[key] === undefined || input[key]?.trim() === "")) throw new Error("Form4952 requires all actual source amounts, including confirmed zeros");
    if (d(input.priorYearDisallowed).gt(0) && input.priorYearSourceTaxYear !== taxYear - 1) throw new Error("Form4952 requires the actual immediately prior year carryforward source year");
    if (d(input.investmentExpenses).gt(0) && input.investmentExpensesDeductibleConfirmed !== true) throw new Error("Form4952 investment expenses must be confirmed deductible on the return");
  }
  const nonnegative = new Set<string>(["investmentInterestExpense", "priorYearDisallowed", "qualifiedDividendsIncluded", "electedPreferentialIncome", "investmentExpenses", "electedNetCapitalGain"]);
  for (const key of [...sourceAmounts, "electedNetCapitalGain"] as const) {
    const amount = d(input[key]);
    if (!amount.isFinite()) throw new Error(`Form4952 ${key} must be finite`);
    if (nonnegative.has(key) && amount.isNegative()) throw new Error(`Form4952 ${key} must be nonnegative; invalid expense or election`);
  }
  const audit = new AuditTrail();
  const line1 = roundDollar(d(input.investmentInterestExpense));
  const line2 = roundDollar(d(input.priorYearDisallowed));
  const line3 = line1.plus(line2);
  const line4a = roundDollar(d(input.grossInvestmentIncome));
  const line4b = roundDollar(d(input.qualifiedDividendsIncluded));
  const line4c = line4a.minus(line4b);
  const line4d = roundDollar(zeroFloor(d(input.netGainFromInvestmentProperty)));
  const line4e = Decimal.min(line4d, roundDollar(zeroFloor(d(input.netCapitalGainFromInvestmentProperty))));
  const line4f = line4d.minus(line4e);
  const line4g = roundDollar(d(input.electedPreferentialIncome));
  if (line4g.gt(line4b.plus(line4e))) throw new Error("Form4952 election cannot exceed available qualified dividends and net capital gain");
  const hasExplicitCapitalGainElection = input.electedNetCapitalGain !== undefined;
  const electedNetCapitalGain = hasExplicitCapitalGainElection
    ? roundDollar(d(input.electedNetCapitalGain)) : Decimal.min(line4g, line4e);
  if (electedNetCapitalGain.lt(zeroFloor(line4g.minus(line4b))) || electedNetCapitalGain.gt(Decimal.min(line4g, line4e))) {
    throw new Error("Form4952 actual Elec allocation is outside the available election range");
  }
  const electedQualifiedDividends = line4g.minus(electedNetCapitalGain);
  const line4h = line4c.plus(line4f).plus(line4g);
  const line5 = roundDollar(d(input.investmentExpenses));
  const line6 = zeroFloor(line4h.minus(line5));
  const line7 = zeroFloor(line3.minus(line6));
  const line8 = Decimal.min(line3, line6);
  const descriptions: [string, string, Decimal, string][] = [
    ["1", "Current investment interest expense", line1, "Aggregate eligible source interest, rounded once"],
    ["2", "Prior-year disallowed interest", line2, sourceRequired ? `${taxYear - 1} Form4952 line7` : "Historical unverified prior-year input"],
    ["3", "Total investment interest", line3, "Line1 + line2"],
    ["4a", "Gross investment income", line4a, "Actual income excluding disposition gains; includes qualified dividends"],
    ["4b", "Included qualified dividends", line4b, "Qualified dividends included on line4a"],
    ["4c", "Income excluding qualified dividends", line4c, "Line4a - line4b; signed result retained"],
    ["4d", "Net gain from investment property", line4d, "Aggregate gains minus losses and carryovers, floored at zero"],
    ["4e", "Preferential net capital gain", line4e, "Smaller of line4d and actual net long-term gain less net short-term loss"],
    ["4f", "Nonpreferential investment gain", line4f, "Line4d - line4e"],
    ["4g", "Elected preferential investment income", line4g, "Actual election; use ScheduleD Tax Worksheet without reducing Form1040 line3a"],
    ["4h", "Investment income", line4h, "Line4c + line4f + line4g"],
    ["5", "Deductible investment expenses", line5, "Only expenses allowed on the return; no interest, passive deductions or miscellaneous itemized fees"],
    ["6", "Net investment income", line6, "max(0, line4h - line5)"],
    ["7", "Disallowed interest carryforward", line7, "max(0, line3 - line6)"],
    ["8", "Investment interest deduction", line8, "min(line3, line6); source allocation and at-risk rules apply"],
  ];
  for (const [line, description, value, formula] of descriptions) audit.record("Form 4952", line, description, value, formula);
  audit.record("Form 4952 Source", "verified", "Actual source facts verified", new Decimal(sourceRequired ? 1 : 0),
    sourceRequired ? `Confirmed source ${input.sourceReference}; tax year ${taxYear}` : "Unverified historical preview; absent net-capital-gain source preserves legacy nonpreferential gain interpretation");
  audit.record("Form 4952 Election", "capital_gain", "Elected net capital gain", electedNetCapitalGain,
    hasExplicitCapitalGainElection ? "Actual Elec allocation" : "IRS default allocation to capital gain first");
  audit.record("Form 4952 Election", "qualified_dividends", "Elected qualified dividends", electedQualifiedDividends, "Line4g less elected net capital gain; reported1040 qualified dividends unchanged");
  return { taxYear, sourceFactsVerified: sourceRequired, line1, line2, line3, line4a, line4b, line4c, line4d, line4e, line4f, line4g, line4h, line5, line6, line7, line8,
    deductibleAmount: line8, disallowedCarryforward: line7, electedNetCapitalGain, electedQualifiedDividends, hasExplicitCapitalGainElection, lines: audit.getLines() };
}
