/** Official printed2025/2026Form4952; spec/federal/form-4952.yaml. */
import { describe, expect, it } from "vitest";
import { Form4952InputSchema, type Form4952Input } from "@/models/inputs.js";
import { calculateForm4952 } from "@/engine/forms/form-4952.js";

function source(overrides: Record<string, unknown> = {}): Form4952Input {
  return Form4952InputSchema.parse({
    sourceTaxYear: 2026, sourceReference: "synthetic investment statement and prior4952",
    sourceFactsConfirmed: true, investmentInterestExpense: "16000", priorYearDisallowed: "2000",
    priorYearSourceTaxYear: 2025, grossInvestmentIncome: "12000", qualifiedDividendsIncluded: "4000",
    netGainFromInvestmentProperty: "9000", netCapitalGainFromInvestmentProperty: "6000",
    electedPreferentialIncome: "2500", investmentExpenses: "500", investmentExpensesDeductibleConfirmed: true,
    ...overrides,
  });
}
const calculate = (input: Form4952Input, year = 2026) => calculateForm4952(input, year);

describe("Form4952 actual source and printed audit", () => {
  it("records every printed line from independently derived source amounts", () => {
    const result = calculate(source());
    // Independent paper worksheet: 12000-4000 + (9000-6000) +2500 =13500;
    // less500allowedexpenses=13000;18000interest-13000deduction=5000carry.
    const expected = { "1":"16000", "2":"2000", "3":"18000", "4a":"12000", "4b":"4000", "4c":"8000", "4d":"9000", "4e":"6000", "4f":"3000", "4g":"2500", "4h":"13500", "5":"500", "6":"13000", "7":"5000", "8":"13000" };
    for (const [line, value] of Object.entries(expected)) {
      const entries = result.lines.filter(entry => entry.form === "Form 4952" && entry.line === line);
      expect(entries, line).toHaveLength(1);
      expect(entries[0].value.toFixed(), line).toBe(value);
    }
    expect(result.line4e.toFixed()).toBe("6000");
    expect(result.line6.toFixed()).toBe("13000");
    expect(result.deductibleAmount.toFixed()).toBe("13000");
    expect(result.disallowedCarryforward.toFixed()).toBe("5000");
    expect(result.sourceFactsVerified).toBe(true);
    expect(result.taxYear).toBe(2026);
  });

  it("requires actual current and prior year facts without filling unknown zeros", () => {
    expect(() => calculate(source({ sourceFactsConfirmed: false }))).toThrow(/confirmed.*source|source.*confirm/i);
    expect(() => calculate(source({ sourceReference: undefined }))).toThrow(/source/i);
    expect(() => calculate(source({ sourceTaxYear: 2025 }))).toThrow(/year/i);
    expect(() => calculate(source({ priorYearSourceTaxYear: undefined }))).toThrow(/prior.*year/i);
    expect(() => calculate(source({ priorYearSourceTaxYear: 2024 }))).toThrow(/prior.*year/i);
    expect(() => calculate(source({ netCapitalGainFromInvestmentProperty: undefined }))).toThrow(/actual|source/i);
    expect(() => calculate(source({ priorYearDisallowed: undefined }))).toThrow(/actual|source/i);
    expect(() => calculate(source({ priorYearDisallowed: "0", priorYearSourceTaxYear: undefined }))).not.toThrow();
    expect(() => calculate(source(), 2027)).toThrow(/year/i);
  });

  it("caps preferential net capital gain at total net gain", () => {
    // Netshort-termloss limits overallgain to5000 despite9000netlong-termgain.
    const result = calculate(source({ netGainFromInvestmentProperty: "5000", netCapitalGainFromInvestmentProperty: "9000" }));
    expect(result.line4e.toFixed()).toBe("5000");
    expect(result.line4f.toFixed()).toBe("0");
  });

  it("uses capital gains first unless an actual valid Elec allocation is provided", () => {
    const capitalFirst = calculate(source({ electedPreferentialIncome: "8000" }));
    expect(capitalFirst.electedNetCapitalGain.toFixed()).toBe("6000");
    expect(capitalFirst.electedQualifiedDividends.toFixed()).toBe("2000");
    const election = calculate(source({ electedPreferentialIncome: "8000", electedNetCapitalGain: "4000" }));
    expect(election.electedNetCapitalGain.toFixed()).toBe("4000");
    expect(election.electedQualifiedDividends.toFixed()).toBe("4000");
    expect(election.hasExplicitCapitalGainElection).toBe(true);
    for (const invalid of ["3999.49", "6001", "-1"]) {
      expect(() => calculate(source({ electedPreferentialIncome: "8000", electedNetCapitalGain: invalid }))).toThrow(/allocat|election/i);
    }
  });

  it("rejects an election exceeding available preferential income", () => {
    expect(() => calculate(source({ electedPreferentialIncome: "10001" }))).toThrow(/election/i);
    expect(() => calculate(source({ electedPreferentialIncome: "-1" }))).toThrow(/election|nonnegative/i);
    expect(calculate(source({ electedPreferentialIncome: "10000" })).line4g.toFixed()).toBe("10000");
  });

  it("does not accept unconfirmed deductible investment expenses", () => {
    expect(() => calculate(source({ investmentExpensesDeductibleConfirmed: undefined }))).toThrow(/deductible.*expense|expense.*deductible/i);
    expect(() => calculate(source({ investmentExpensesDeductibleConfirmed: false }))).toThrow(/deductible.*expense|expense.*deductible/i);
    expect(() => calculate(source({ investmentExpenses: "0", investmentExpensesDeductibleConfirmed: undefined }))).not.toThrow();
  });

  it("preserves signed income and floors only where the printed form requires", () => {
    const result = calculate(source({ grossInvestmentIncome: "1000", qualifiedDividendsIncluded: "2000", netGainFromInvestmentProperty: "-500", netCapitalGainFromInvestmentProperty: "-200", electedPreferentialIncome: "0" }));
    expect(result.line4c.toFixed()).toBe("-1000");
    expect(result.line4d.toFixed()).toBe("0");
    expect(result.line4e.toFixed()).toBe("0");
    expect(result.line4h.toFixed()).toBe("-1000");
    expect(result.line6.toFixed()).toBe("0");
    expect(result.disallowedCarryforward.toFixed()).toBe("18000");
  });

  it("rounds aggregate source cents once before printed line arithmetic", () => {
    const result = calculate(source({ investmentInterestExpense: "100.50", priorYearDisallowed: "0.49", grossInvestmentIncome: "101.49", qualifiedDividendsIncluded: "0.49", netGainFromInvestmentProperty: "0.49", netCapitalGainFromInvestmentProperty: "0", electedPreferentialIncome: "0", investmentExpenses: "0.49" }));
    expect(result.line1.toFixed()).toBe("101");
    expect(result.line2.toFixed()).toBe("0");
    expect(result.line4a.toFixed()).toBe("101");
    expect(result.deductibleAmount.toFixed()).toBe("101");
    expect(result.disallowedCarryforward.toFixed()).toBe("0");
  });

  it("rejects nonfinite and negative interest or expense sources", () => {
    for (const key of ["investmentInterestExpense", "priorYearDisallowed", "qualifiedDividendsIncluded", "investmentExpenses"]) {
      expect(() => calculate(source({ [key]: "-1" }))).toThrow(/nonnegative/i);
    }
    const valid = source();
    expect(() => calculate({ ...valid, grossInvestmentIncome: "NaN" })).toThrow(/finite/i);
  });

  it("retains unverified historical nonpreferential gain without inventing current sources", () => {
    const legacy = Form4952InputSchema.parse({ investmentInterestExpense: "5000", grossInvestmentIncome: "1000", netGainFromInvestmentProperty: "2000" });
    const result = calculate(legacy, 2025);
    expect(result.deductibleAmount.toFixed()).toBe("3000");
    expect(result.line4e.toFixed()).toBe("0");
    expect(result.sourceFactsVerified).toBe(false);
    expect(() => calculate(legacy, 2026)).toThrow(/actual|source/i);
    expect(() => calculate({ ...legacy, sourceFactsConfirmed: true }, 2025)).toThrow(/actual|source/i);
  });
});
