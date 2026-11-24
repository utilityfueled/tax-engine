import { describe, expect, it } from "vitest";
import { calculateOrdinaryShortAccountingYearTax } from "@/engine/forms/short-accounting-year-tax.js";
import { d, roundDollar } from "@/utils/decimal.js";

const wageOnly = {
  taxYear: 2026,
  filingStatus: "single" as const,
  shortPeriodMonths: 6,
  modifiedTaxableIncome: d("30000"),
  shortPeriodAmti: d("30000"),
};

describe("ordinary short accounting-year tax", () => {
  it("uses the statutory rate schedule and prorates tax before report rounding", () => {
    // Rev. Proc. 2025-32 Table 3: $5,800 + 22% above $50,400.
    const current = calculateOrdinaryShortAccountingYearTax(wageOnly);
    expect(current.annualizedModifiedTaxableIncome).toEqual(d("60000"));
    expect(current.annualRegularTax).toEqual(d("7912"));
    expect(current.regularTax).toEqual(d("3956"));

    // Rev. Proc. 2024-40 Table 3: $5,578.50 + 22% above $48,475.
    const prior = calculateOrdinaryShortAccountingYearTax({ ...wageOnly, taxYear: 2025 });
    expect(prior.annualRegularTax).toEqual(d("8114"));
    expect(prior.regularTax).toEqual(d("4057"));

    const fractional = calculateOrdinaryShortAccountingYearTax({
      ...wageOnly,
      modifiedTaxableIncome: d("30002.26"),
      shortPeriodAmti: d("30002.26"),
    });
    expect(fractional.annualRegularTax).toEqual(d("7912.9944"));
    expect(fractional.regularTax).toEqual(d("3956.4972"));
    expect(roundDollar(fractional.regularTax)).toEqual(d("3956"));

    // The IRS processing manual's worked proration is $600 × 9/12 = $450.
    const nineMonths = calculateOrdinaryShortAccountingYearTax({
      ...wageOnly,
      shortPeriodMonths: 9,
      modifiedTaxableIncome: d("4500"),
      shortPeriodAmti: d("4500"),
    });
    expect(nineMonths.annualRegularTax).toEqual(d("600"));
    expect(nineMonths.regularTax).toEqual(d("450"));
  });

  it("applies the AMT rate and exemption boundaries before proration", () => {
    // Separately derived from the §55 rates and Rev. Proc. 2025-32 §4.10.
    const cases = [
      { amti: "167299.99", exemption: "90100", tax: "31784.9974" },
      { amti: "167300.01", exemption: "90100", tax: "31785.0028" },
      { amti: "249999.99", exemption: "90100", tax: "54940.9972" },
      { amti: "250000.01", exemption: "90099.99", tax: "54941.0042" },
      { amti: "340099.99", exemption: "0.01", tax: "92782.9958" },
      { amti: "340100.01", exemption: "0", tax: "92783.0028" },
    ];
    for (const fixture of cases) {
      const result = calculateOrdinaryShortAccountingYearTax({
        ...wageOnly,
        modifiedTaxableIncome: d("100000"),
        shortPeriodAmti: d(fixture.amti),
      });
      expect(result.regularTax).toEqual(d("20299"));
      expect(result.amtExemption).toEqual(d(fixture.exemption));
      expect(result.tentativeMinimumTax).toEqual(d(fixture.tax));
    }

    const prior = calculateOrdinaryShortAccountingYearTax({
      ...wageOnly,
      taxYear: 2025,
      shortPeriodAmti: d("100000"),
    });
    expect(prior.annualizedAmti).toEqual(d("200000"));
    expect(prior.amtExemption).toEqual(d("88100"));
    expect(prior.tentativeMinimumTax).toEqual(d("14547"));
  });

  it("preserves exact reporting ties when the annualized inputs recur", () => {
    const result = calculateOrdinaryShortAccountingYearTax({
      ...wageOnly,
      shortPeriodMonths: 7,
      modifiedTaxableIncome: d("65"),
      shortPeriodAmti: d("420025"),
    });
    expect(result.regularTax).toEqual(d("6.50"));
    expect(roundDollar(result.regularTax)).toEqual(d("7"));
    expect(result.amtExemption).toEqual(d("0"));
    // 28% of the short-period AMTI, less 2% of the prorated $244,500 breakpoint.
    expect(result.tentativeMinimumTax).toEqual(d("114754.50"));
    expect(roundDollar(result.tentativeMinimumTax)).toEqual(d("114755"));
    expect(result.additionalMinimumTax).toEqual(d("114748"));
  });

  it("compares prorated regular and tentative minimum tax", () => {
    // At $100,000 of ordinary wages, a few cents of bond interest can cross
    // the comparison boundary. The preference affects only AMTI.
    const ordinaryWages = { ...wageOnly, modifiedTaxableIncome: d("100000") };
    for (const [amti, tentative, additional] of [
      ["100000", "14287", "0"],
      ["123123.07", "20298.9982", "0"],
      ["123123.08", "20299.0008", "0.0008"],
      ["130000", "22087", "1788"],
    ]) {
      const result = calculateOrdinaryShortAccountingYearTax({ ...ordinaryWages, shortPeriodAmti: d(amti) });
      expect(result.annualizedAmti).toEqual(d(amti).times("2"));
      expect(result.annualTentativeMinimumTax).toEqual(d(tentative).times("2"));
      expect(result.tentativeMinimumTax).toEqual(d(tentative));
      expect(result.additionalMinimumTax).toEqual(d(additional));
    }
  });

  it("keeps the signed bases in the audit and floors the tax at zero", () => {
    const result = calculateOrdinaryShortAccountingYearTax({
      ...wageOnly,
      modifiedTaxableIncome: d("-420.51"),
      shortPeriodAmti: d("-315.29"),
    });
    expect(result.annualizedModifiedTaxableIncome).toEqual(d("-841.02"));
    expect(result.annualizedAmti).toEqual(d("-630.58"));
    expect(result.regularTax).toEqual(d("0"));
    expect(result.additionalMinimumTax).toEqual(d("0"));
    expect(result.lines.find(line => line.line === "annual-regular-income")?.inputs.modifiedTaxableIncome)
      .toEqual(d("-420.51"));
    expect(result.lines.find(line => line.line === "annual-amti")?.inputs.shortPeriodAmti)
      .toEqual(d("-315.29"));
  });

  it("rejects unsupported periods, years, filing statuses and tax bases", () => {
    for (const shortPeriodMonths of [0, 12, 6.5]) {
      expect(() => calculateOrdinaryShortAccountingYearTax({ ...wageOnly, shortPeriodMonths })).toThrow(/whole months/i);
    }
    expect(() => calculateOrdinaryShortAccountingYearTax({ ...wageOnly, taxYear: 2024 })).toThrow(/year 2024/i);
    expect(() => calculateOrdinaryShortAccountingYearTax({ ...wageOnly, filingStatus: "head_of_household" })).toThrow(/single/i);
    expect(() => calculateOrdinaryShortAccountingYearTax({ ...wageOnly, modifiedTaxableIncome: d("Infinity") })).toThrow(/base/i);
    expect(() => calculateOrdinaryShortAccountingYearTax({ ...wageOnly, shortPeriodAmti: d("NaN") })).toThrow(/base/i);
  });
});
