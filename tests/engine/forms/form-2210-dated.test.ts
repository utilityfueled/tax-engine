/** Spec: spec/federal/form-2210.yaml — independently dated regular-method examples. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm2210, type Form2210Input } from "@/engine/forms/form-2210.js";
import { Form2210Schema } from "@/models/inputs.js";

const d = (value: Decimal.Value) => new Decimal(value);
const ordinaryFacts = {
  calendarYearTaxpayer: true,
  residentReturn: true,
  farmerOrFisher: false,
  disasterReliefClaimed: false,
  waiverRequested: false,
  calculationMethod: "regular" as const,
  withholdingMethod: "equal-installments" as const,
  priorYearTaxStatus: "no-return" as const,
};
function input(overrides: Partial<Form2210Input> = {}): Form2210Input {
  return {
    taxYear: 2025,
    currentYearTax: d(10000),
    incomeTaxAfterCredits: d(10000),
    withholding: d(0),
    estimatedPayments: d(0),
    refundableCredits: d(0),
    filingStatus: "single",
    payments: [],
    facts: ordinaryFacts,
    ...overrides,
  };
}
function line(result: ReturnType<typeof calculateForm2210>, id: string) {
  const entry = result.lines.find((entry) => entry.form === "Form 2210" && entry.line === id);
  expect(entry, `missing audited line ${id}`).toBeDefined();
  if (!entry) throw new Error(`Missing audited line ${id}`);
  return entry.value.toFixed();
}

// No provider or generated taxpayer evidence: all identities/amounts below are synthetic.
describe("Form 2210 dated regular method", () => {
  it("preserves missing source facts and explicit zero without defaults", () => {
    expect(Form2210Schema.parse({})).toEqual({});
    expect(Form2210Schema.parse({ priorYearTaxForForm2210: "0", priorYearFullYear: false }))
      .toEqual({ priorYearTaxForForm2210: "0", priorYearFullYear: false });
    expect(Form2210Schema.safeParse({ priorYearCreditPayments: [{ amount: "12" }] }).success).toBe(false);
    expect(Form2210Schema.safeParse({ returnPayments: [{ date: "2025-02-30", amount: "12" }] }).success).toBe(false);
  });

  it("audits official Part I lines from actual tax components", () => {
    const result = calculateForm2210(input({
      currentYearTax: d(12000), incomeTaxAfterCredits: d(10000),
      refundableCredits: d(2000), withholding: d(5000),
    }));
    expect(["1", "2", "3", "4", "5", "6", "7", "9"].map((id) => line(result, id)))
      .toEqual(["10000", "2000", "2000", "10000", "9000", "5000", "5000", "9000"]);
    expect(line(result, "19")).toBe(result.penalty.toFixed());
    expect(result.sourceFactsVerified).toBe(true);
  });

  it("a late annual catch-up does not erase earlier installment penalties", () => {
    const result = calculateForm2210(input({
      estimatedPayments: d(9000),
      payments: [{ date: "2026-01-15", amount: "9000", kind: "estimated" }],
    }));
    // Three $2250 shortfalls last 275,214,122 days: 2250*611*.07/365 =263.6506849.
    expect(result.penalty.toFixed()).toBe("264");
    expect(result.safeHarborMet).toBe(false);
    expect(result.underpayment.toFixed()).toBe("0");
    expect(result.installments.map((row) => row.underpayment.toFixed())).toEqual(["2250", "2250", "2250", "0"]);
  });

  it("reproduces IRS line 11 Example 1 using dated credit and estimated payments", () => {
    const result = calculateForm2210(input({
      withholding: d(4000), estimatedPayments: d(2000),
      payments: [
        { date: "2025-04-15", amount: "1000", kind: "prior-year-credit" },
        { date: "2025-09-15", amount: "500", kind: "estimated" },
        { date: "2026-01-15", amount: "500", kind: "estimated" },
      ],
    }));
    expect(["11a", "11b", "11c", "11d"].map((id) => line(result, id))).toEqual(["2000", "1000", "1500", "1500"]);
  });

  it("carries advance payments and applies catch-up payments to the oldest installment", () => {
    const result = calculateForm2210(input({
      estimatedPayments: d(9000),
      payments: [
        { date: "2025-04-15", amount: "1750", kind: "estimated" },
        { date: "2025-06-10", amount: "1200", kind: "estimated" },
        { date: "2025-07-01", amount: "6050", kind: "estimated" },
      ],
    }));
    // IRS Example2: first $500 shortfall paidJune10 after56days, $700 left for next installment.
    expect(line(result, "15b")).toBe("700");
    expect(line(result, "17b")).toBe("1550");
    expect(line(result, "18c")).toBe("2250");
    expect(line(result, "12d")).toBe("2250");
    // $500*.07*56/365 + $1550*.07*16/365 =10.1260274.
    expect(result.penalty.toFixed()).toBe("10");
    expect(result.interestPeriods.some((p) => p.installment === 1 && p.principal.eq(500) && p.days === 56)).toBe(true);
  });

  it("treats the June 2025 weekend payment as timely without moving a late accrual date", () => {
    const base = [
      { date: "2025-04-15", amount: "2250", kind: "estimated" as const },
      { date: "2025-09-15", amount: "2250", kind: "estimated" as const },
      { date: "2026-01-15", amount: "2250", kind: "estimated" as const },
    ];
    const timely = calculateForm2210(input({ estimatedPayments: d(9000), payments: [...base, { date: "2025-06-16", amount: "2250", kind: "estimated" }] }));
    expect(timely.safeHarborMet).toBe(true);
    expect(timely.penalty.toFixed()).toBe("0");
    const late = calculateForm2210(input({ estimatedPayments: d(9000), payments: [...base, { date: "2025-06-17", amount: "2250", kind: "estimated" }] }));
    expect(late.interestPeriods.map((period) => period.days)).toEqual([2]);
    expect(late.penalty.toFixed()).toBe("1");
  });

  it("segments 2026 exposure across the actual six and seven percent rate periods", () => {
    const result = calculateForm2210(input({
      taxYear: 2026, currentYearTax: d(40000), incomeTaxAfterCredits: d(40000),
      estimatedPayments: d(36000), payments: [{ date: "2026-12-31", amount: "36000", kind: "estimated" }],
    }));
    // First two installments:91 days at6% and368 at7%; third:107 days at7%.
    // 9000*(91*.06+475*.07)/365 =954.4931507, fourth prepaid.
    expect(result.penalty.toFixed()).toBe("954");
    expect(result.interestPeriods.filter((p) => p.installment === 1).map((p) => [p.days, p.annualRate.toFixed()]))
      .toEqual([[76, "0.06"], [92, "0.07"], [92, "0.07"]]);
  });

  it("keeps the first-quarter rate through April 15 under section 6621", () => {
    const result = calculateForm2210(input());
    expect(result.penalty.toFixed()).toBe("419"); //9000*.07*971/1460 =418.9931507
    expect(result.interestPeriods.filter((p) => p.endDate === "2026-04-15").every((p) => p.annualRate.eq("0.07"))).toBe(true);
    expect(result.interestPeriods.some((p) => p.annualRate.eq("0.06"))).toBe(false);
  });

  it("rejects unpublished 2027 exposure but proves zero from fully timely payments", () => {
    expect(() => calculateForm2210(input({ taxYear: 2026 }))).toThrow(/2027.*rate.*unpublished|unpublished.*2027/i);
    const result = calculateForm2210(input({
      taxYear: 2026, estimatedPayments: d(9000),
      payments: ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"].map((date) => ({ date, amount: "2250", kind: "estimated" })),
    }));
    expect(result.penalty.toFixed()).toBe("0");
    expect(result.safeHarborMet).toBe(true);
  });

  it("requires actual prior-year eligibility and tax computation", () => {
    const filed = { ...ordinaryFacts, priorYearTaxStatus: "return-filed" as const };
    expect(() => calculateForm2210(input({ facts: filed }))).toThrow(/priorYearFullYear/);
    expect(() => calculateForm2210(input({ facts: { ...filed, priorYearFullYear: true } }))).toThrow(/priorYearTaxComputationConfirmed/);
    const prior = { ...filed, priorYearFullYear: true, priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "8000", priorYearAgiForForm2210: "150000" };
    expect(calculateForm2210(input({ withholding: d(8000), facts: prior })).safeHarborMet).toBe(true);
    expect(calculateForm2210(input({ withholding: d(8000), facts: { ...prior, priorYearAgiForForm2210: "150000.01" } })).requiredAnnualPayment.toFixed()).toBe("8800");
    expect(calculateForm2210(input({ facts: { ...filed, priorYearFullYear: false } })).requiredAnnualPayment.toFixed()).toBe("9000");
    const noTax = { ...ordinaryFacts, priorYearTaxStatus: "no-tax-liability" as const, priorYearFullYear: true, priorYearTaxForForm2210: "0", priorYearTaxComputationConfirmed: true };
    expect(() => calculateForm2210(input({ facts: noTax }))).toThrow(/priorYearResidentAllYear/);
    expect(calculateForm2210(input({ taxYear: 2026, facts: { ...noTax, priorYearResidentAllYear: true } })).penalty.toFixed()).toBe("0");
  });

  it("honors actual withholding dates without treating year-end withholding as timely", () => {
    const result = calculateForm2210(input({
      withholding: d(9000), facts: { ...ordinaryFacts, withholdingMethod: "actual-dates", withholdingPayments: [{ date: "2025-12-31", amount: "9000" }] },
    }));
    // 2250*.07*(260+199+107)/365 =244.2328767.
    expect(result.penalty.toFixed()).toBe("244");
    expect(result.requiresForm2210).toBe(true);
    expect(() => calculateForm2210(input({ withholding: d(9000), facts: { ...ordinaryFacts, withholdingMethod: "actual-dates", withholdingPayments: [] } }))).toThrow(/withholding.*reconcile/i);
  });

  it("retains a late generated prior credit date rather than assuming April 15", () => {
    const result = calculateForm2210(input({ estimatedPayments: d(9000), payments: [{ date: "2025-08-01", amount: "9000", kind: "prior-year-credit" }] }));
    // First two installments unpaid108+47days, then all future installments covered.
    expect(result.penalty.toFixed()).toBe("67");
    expect(line(result, "11a")).toBe("0");
    expect(line(result, "11c")).toBe("9000");
  });

  it("waives only the fourth installment for an actually filed and fully paid early return", () => {
    const result = calculateForm2210(input({
      payments: [{ date: "2026-02-02", amount: "10000", kind: "return" }],
      facts: { ...ordinaryFacts, returnFiledDate: "2026-02-02", returnPaidInFullDate: "2026-02-02" },
    }));
    // Jan31Saturday -> February2Monday; first three2250*(293+232+140)*.07/365.
    expect(result.penalty.toFixed()).toBe("287");
    expect(result.interestPeriods.some((p) => p.installment === 4)).toBe(false);
    expect(() => calculateForm2210(input({ facts: { ...ordinaryFacts, returnFiledDate: "2026-02-02", returnPaidInFullDate: "2026-02-02" } }))).toThrow(/full.*payment|paid.*full/i);
    const later = calculateForm2210(input({
      payments: [{ date: "2026-02-03", amount: "10000", kind: "return" }],
      facts: { ...ordinaryFacts, returnFiledDate: "2026-02-03", returnPaidInFullDate: "2026-02-03" },
    }));
    expect(later.interestPeriods.some((p) => p.installment === 4)).toBe(true);
  });

  it("stops at the statutory end date despite an extension or a later payment", () => {
    const baseline = calculateForm2210(input());
    const later = calculateForm2210(input({ payments: [{ date: "2026-10-15", amount: "10000", kind: "extension" }] }));
    expect(later.penalty.eq(baseline.penalty)).toBe(true);
    const early = calculateForm2210(input({ payments: [{ date: "2026-03-01", amount: "9000", kind: "extension" }] }));
    expect(early.penalty.toFixed()).toBe("341"); // 9000*.07*(971-4*45)/1460
  });

  it("rejects unsupported annualized and special taxpayer methods explicitly", () => {
    for (const facts of [
      { ...ordinaryFacts, calendarYearTaxpayer: false },
      { ...ordinaryFacts, residentReturn: false },
      { ...ordinaryFacts, farmerOrFisher: true },
      { ...ordinaryFacts, disasterReliefClaimed: true },
      { ...ordinaryFacts, waiverRequested: true },
    ]) expect(() => calculateForm2210(input({ facts }))).toThrow(/unsupported|requires.*separate/i);
    expect(() => calculateForm2210(input({ facts: { ...ordinaryFacts, calculationMethod: "annualized" as const } }))).toThrow(/Schedule AI period facts/);
    expect(() => calculateForm2210(input({ taxYear: 2026, facts: undefined }))).toThrow(/facts|calendarYearTaxpayer/);
    expect(() => calculateForm2210(input({ taxYear: 2027 }))).toThrow(/tax year.*2027/i);
  });

  it("rejects mismatched totals invalid dates and nonfinite or negative monetary inputs", () => {
    expect(() => calculateForm2210(input({ estimatedPayments: d(1) }))).toThrow(/reconcile|dated/i);
    expect(() => calculateForm2210(input({ payments: [{ date: "2025-02-30", amount: "1", kind: "estimated" }] }))).toThrow(/date/i);
    expect(() => calculateForm2210(input({ payments: [{ date: "2024-04-15", amount: "1", kind: "estimated" }] }))).toThrow(/date|year/i);
    for (const invalid of ["-1", "NaN", "Infinity"]) {
      expect(() => calculateForm2210(input({ withholding: d(invalid) }))).toThrow(/withholding/);
      expect(() => calculateForm2210(input({ payments: [{ date: "2025-04-15", amount: invalid, kind: "estimated" }] }))).toThrow(/amount/);
    }
    expect(() => calculateForm2210(input({ incomeTaxAfterCredits: d(10001) }))).toThrow(/incomeTaxAfterCredits/);
  });

  it("preserves exact cents in dated allocation and rounds the final penalty once", () => {
    const result = calculateForm2210(input({ estimatedPayments: d("8999.99"), payments: [{ date: "2025-04-15", amount: "8999.99", kind: "estimated" }] }));
    expect(result.underpayment.toFixed()).toBe("0.01");
    expect(result.installments[3]?.underpayment.toFixed()).toBe("0.01");
    expect(result.exactPenalty.toFixed(12)).toBe("0.000172602740");
    expect(result.penalty.toFixed()).toBe("0");
    expect(result.safeHarborMet).toBe(false);
  });
});
