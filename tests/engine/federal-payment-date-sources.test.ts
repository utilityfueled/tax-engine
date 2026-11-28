// Specs: spec/federal/form-1040.yaml, line 26; spec/federal/form-2210.yaml, lines 11a-11d.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

import { calculateFederalTax, TaxYearInputSchema, type TaxYearInput } from "../../src/index.js";
import { parseInput } from "../../src/ingest/loader.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

const estimate = { date: "2026-01-15", amount: "125.37", type: "federal" } as const;
const extension = { date: "2026-04-15", amount: "53.24", type: "federal" } as const;
const adjustments = (estimatedTaxPayments: unknown[] = [], extensionPayments: unknown[] = []) => ({ estimatedTaxPayments, extensionPayments });
const raw = (taxYear: 2025 | 2026, adjustmentFacts: object) => ({
  ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear },
  w2s: simpleW2Fixture.w2s.map(w2 => ({ ...w2, taxYear })), adjustments: adjustmentFacts,
});
const run = (year: 2025 | 2026, facts = adjustments(), asOfDate?: string) => calculateFederalTax(parseInput(raw(year, facts)), { asOfDate });

function datedPenaltyReturn(year: 2025 | 2026, adjustmentFacts: object, returnPayments: readonly object[], options: {
  asOfDate?: string;
  filingDates?: { returnFiledDate?: string; returnPaidInFullDate?: string };
} = {}) {
  const base = raw(year, adjustmentFacts);
  return calculateFederalTax(parseInput(JSON.parse(JSON.stringify({
    ...base, w2s: base.w2s.map(w2 => ({ ...w2, federalWithheld: "0" })),
    form2210: {
      calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
      waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
      priorYearTaxStatus: "return-filed", priorYearFullYear: true, priorYearJointReturn: false,
      priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "8000", priorYearAgiForForm2210: "85000", returnPayments,
      ...options.filingDates,
    },
  }))), { asOfDate: options.asOfDate });
}

describe("Actual federal payment dates and selected return application", () => {
  it("carries exact federal line 26 source totals through the 2026 worksheet", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 27, 12));
    try {
      const base = raw(2026, {
        estimatedTaxPayments: [{ date: "2026-09-15", amount: "123.02", type: "federal" }],
        priorYearAppliedCredits: [{ sourceTaxYear: 2025, amount: "1000000000000000000.01", type: "federal" }, { sourceTaxYear: 2025, amount: "0", type: "federal" }],
      });
      const input = TaxYearInputSchema.parse({
        ...base, w2s: base.w2s.map(w2 => ({ ...w2, federalWithheld: "0" })),
        form2210: {
          calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
          waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
          priorYearTaxStatus: "return-filed", priorYearFullYear: true, priorYearJointReturn: false,
          priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: "8000", priorYearAgiForForm2210: "85000",
          priorYearCreditPayments: [
            { date: "2026-04-15", amount: "1000000000000000000" }, { date: "2026-06-15", amount: "0.01" }, { date: "2026-09-15", amount: "0" },
          ],
        },
      });
      const result = calculateFederalTax(input);
      expect.soft(result.allLines.find(row => row.form === "1040" && row.line === "26")?.value.toFixed()).toBe("1000000000000000123.03");
      expect.soft(result.form2210?.totalPayments.toFixed()).toBe("1000000000000000123.03");
      expect(result.form2210?.installments.map(row => row.payments.toFixed())).toEqual(["1000000000000000000", "0.01", "123.02", "0"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds a reused actual federal payment receipt before crediting payments", () => {
    for (const taxYear of [2025, 2026] as const) {
      const actual = { ...estimate, date: `${taxYear}-04-15`, receiptReference: "fictional-confirmation-070" };
      const repeated = { ...actual, receiptReference: "  FICTIONAL-confirmation- 070  " };
      const conflicting = { ...repeated, date: `${taxYear}-06-15`, amount: "126.38" };
      for (const payments of [
        adjustments([actual, repeated]),
        adjustments([], [actual, repeated]),
        adjustments([actual], [conflicting]),
      ]) {
        expect(() => run(taxYear, payments)).toThrow(/same actual.*receipt reference/i);
      }
    }
  });

  it("holds 2026 balance-due duplicates before they reduce the installment penalty", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 3, 10, 12));
    try {
      const paid = { date: "2027-04-09", amount: "2000.01" };
      const extensionPayment = { ...paid, type: "federal", receiptReference: "Fictional-extension-20001" };
      const actual = datedPenaltyReturn(2026, adjustments([], [extensionPayment]), []);
      expect(actual.form2210?.requiredAnnualPayment.toFixed()).toBe("8000");
      expect(actual.form2210?.totalPayments.toFixed()).toBe("2000.01");
      expect(actual.form2210?.underpayment.toFixed()).toBe("5999.99");
      const identical = { ...paid, amount: "2000.010" };
      expect(() => datedPenaltyReturn(2026, adjustments([], [extensionPayment]), [identical])).toThrow(/distinct actual receipt references/u);
      expect(() => datedPenaltyReturn(2026, adjustments([extensionPayment]), [identical])).toThrow(/distinct actual receipt references/u);
      expect(() => datedPenaltyReturn(2026, adjustments(), [paid, identical])).toThrow(/distinct actual receipt references/u);
      expect(() => datedPenaltyReturn(2026, adjustments([], [extensionPayment]), [
        { ...identical, date: "2027-04-08", receiptReference: " Fictional-extension -20001 " },
      ])).toThrow(/same actual.*receipt reference/u);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps independently documented 2026 installment payments and legacy 2025 entries", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 3, 10, 12));
    try {
      const paid = { date: "2027-04-09", amount: "2000.01" };
      const extensionPayment = { ...paid, type: "federal", receiptReference: "Fictional-extension-original" };
      const separate = { ...paid, amount: "2000.010", receiptReference: "Fictional-balance-due-original" };
      const zero = { ...paid, amount: "0.00", receiptReference: extensionPayment.receiptReference };
      const result = datedPenaltyReturn(2026, adjustments([], [extensionPayment]), [separate, zero]);
      const once = datedPenaltyReturn(2026, adjustments([], [extensionPayment]), []);
      expect(result.form2210?.totalPayments.toFixed()).toBe("4000.02");
      expect(result.form2210?.underpayment.toFixed()).toBe("3999.98");
      // April 9 versus April 15, six days at 8% on the separately verified $2,000.01.
      expect(once.form2210?.exactPenalty.minus(result.form2210?.exactPenalty ?? 0).toFixed(6)).toBe("2.630150");
      expect(JSON.stringify(result.allLines)).not.toMatch(/fictional-.*-original/iu);
      const legacy = { date: "2026-04-09", amount: paid.amount };
      expect(datedPenaltyReturn(2025, adjustments([], [{ ...legacy, type: "federal" }]), [legacy]).form2210?.totalPayments.toFixed()).toBe("4000.02");
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates elected 2026 withholding dates before the under-1000 exception", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 27, 12));
    try {
      const runOn = (year: 2025 | 2026, date: string, asOfDate: string, withholdingMethod = "actual-dates") => {
        const base = raw(year, adjustments());
        const amount = base.w2s[0].federalWithheld;
        return calculateFederalTax(TaxYearInputSchema.parse({
          ...base,
          form2210: {
            calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
            waiverRequested: false, calculationMethod: "regular", withholdingMethod, withholdingPayments: [{ date, amount }],
          },
        }), { asOfDate });
      };
      const observed = runOn(2026, "2026-11-27", "2026-11-27");
      expect(observed.form2210?.safeHarborReason).toMatch(/< \$1,000/u);
      expect(observed.form2210?.penalty.toFixed()).toBe("0");
      expect.soft(() => runOn(2026, "2026-12-31", "2026-11-27")).toThrow(/withholding.*as-of date/i);
      expect.soft(() => runOn(2026, "2026-11-27", "2026-11-26")).toThrow(/withholding.*as-of date/i);
      expect(runOn(2026, "2026-12-31", "2026-11-27", "equal-installments").form2210?.penalty.toFixed()).toBe("0");
      expect(runOn(2025, "2025-12-31", "2025-11-27").form2210?.penalty.toFixed()).toBe("0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires an observed following-year payment date for 2026 balance due", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 3, 10, 12));
    try {
      const runOn = (date: string, asOfDate?: string) => datedPenaltyReturn(
        2026, adjustments(), [{ date, amount: "2000.01" }], { asOfDate },
      );
      for (const date of ["2026-04-15", "2026-12-31"]) {
        expect(() => runOn(date)).toThrow(/following calendar year/u);
      }
      expect(() => runOn("2027-04-12")).toThrow(/on or before the calculation as-of date/u);
      expect(() => runOn("2027-04-10", "2027-04-09")).toThrow(/on or before the calculation as-of date/u);
      expect(() => runOn("2027-04-10", "2027-04-11")).toThrow(/as-of date.*on or before today/u);
      expect(() => runOn("2027-01-01", "2027-02-29")).toThrow(/as-of date.*valid calendar date/u);
      expect(() => runOn("2027-02-29")).toThrow(/actual calendar date/iu);
      for (const date of ["2027-01-01", "2027-01-15", "2027-04-10"]) {
        expect(runOn(date, date).form2210?.totalPayments.toFixed()).toBe("2000.01");
      }
      expect(runOn("2027-04-10").form2210?.totalPayments.toFixed()).toBe("2000.01");
      const noActualReturnDates = datedPenaltyReturn(2026, adjustments(), [], { asOfDate: "2027-04-11" });
      expect(noActualReturnDates.form2210?.totalPayments.toFixed()).toBe("0");
      expect(noActualReturnDates.form2210?.underpayment.toFixed()).toBe("8000");
      const installments = ["2026-06-15", "2026-09-15", "2027-01-15"]
        .map(date => ({ date, amount: "2000.01", type: "federal" }));
      expect(datedPenaltyReturn(2026, adjustments(installments), []).form2210?.totalPayments.toFixed()).toBe("6000.03");
      vi.setSystemTime(new Date(2028, 0, 1, 12));
      expect(runOn("2027-12-31").form2210?.totalPayments.toFixed()).toBe("0");
      expect(() => runOn("2028-01-01")).toThrow(/following calendar year/u);
    } finally {
      vi.useRealTimers();
    }
  });

  it("requires actual filing and full-payment dates before granting the 2026 early-return exception", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 0, 20, 12));
    try {
      const returnPayments = [{ date: "2027-01-20", amount: "16000.05" }];
      const runWith = (filingDates?: { returnFiledDate: string; returnPaidInFullDate: string }, asOfDate?: string) =>
        datedPenaltyReturn(2026, adjustments(), returnPayments, { filingDates, asOfDate }).form2210;
      const observed = { returnFiledDate: "2027-01-20", returnPaidInFullDate: "2027-01-20" };
      const actual = runWith(observed);
      const withoutProof = runWith();
      expect(actual?.installments[3].payments.toFixed()).toBe("16000.05");
      expect(withoutProof?.installments[3].payments.toFixed()).toBe("0");
      expect(withoutProof?.exactPenalty.minus(actual?.exactPenalty ?? 0).toFixed(6)).toBe("2.191781");
      expect(() => runWith({ ...observed, returnFiledDate: "2027-01-21" })).toThrow(/on or before the calculation as-of date/u);
      expect(() => runWith({ ...observed, returnPaidInFullDate: "2027-02-01" })).toThrow(/on or before the calculation as-of date/u);
      expect(() => runWith({ ...observed, returnFiledDate: "2026-12-31" })).toThrow(/following calendar year/u);
      vi.setSystemTime(new Date(2027, 0, 22, 12));
      expect(() => runWith({ ...observed, returnFiledDate: "2027-01-21" }, "2027-01-20")).toThrow(/on or before the calculation as-of date/u);
      expect(runWith(observed, "2027-01-20")?.exactPenalty.toFixed()).toBe(actual?.exactPenalty.toFixed());
    } finally {
      vi.useRealTimers();
    }
  });

  it("credits distinct receipts with matching dates and amounts and preserves unbound payments", () => {
    for (const taxYear of [2025, 2026] as const) {
      const unbound = { ...estimate, date: `${taxYear}-04-15` };
      const first = { ...unbound, receiptReference: "fictional-confirmation-070" };
      const second = { ...unbound, receiptReference: "fictional-confirmation-071" };
      const zero = { ...first, amount: "0.00" };
      const state = { ...first, type: "state", state: "WA" };
      const baseline = run(taxYear).totalPayments;
      for (const payments of [
        adjustments([first], [second]),
        ...(taxYear === 2025 ? [adjustments([unbound], [unbound])] : []),
        adjustments([first, zero, state], [second]),
      ]) {
        const result = run(taxYear, payments);
        expect(result.estimatedTaxPayments.toFixed()).toBe("125.37");
        expect(result.allLines.find(line => line.form === "Sched 3" && line.line === "10")?.value.toFixed()).toBe("125.37");
        expect(result.totalPayments.minus(baseline).toFixed()).toBe("250.74");
        expect(JSON.stringify(result.allLines)).not.toContain(first.receiptReference);
      }
      expect(run(taxYear, adjustments([unbound])).totalPayments.minus(baseline).toFixed()).toBe("125.37");
    }
  });

  it("holds indistinguishable positive 2026 payments without distinct actual receipts", () => {
    const unbound = { ...estimate, date: "2026-04-15" };
    const formatted = { ...unbound, amount: "125.370" };
    const referenced = { ...unbound, receiptReference: "fictional-confirmation-070" };
    for (const payments of [
      adjustments([unbound, formatted]),
      adjustments([], [unbound, formatted]),
      adjustments([unbound], [formatted]),
      adjustments([referenced], [unbound]),
      adjustments([unbound], [referenced]),
    ]) {
      expect(() => run(2026, payments)).toThrow(/distinct actual receipt references/i);
    }
    const baseline = run(2026).totalPayments;
    const distinct = adjustments([unbound], [{ ...unbound, amount: "125.38" }]);
    expect(run(2026, distinct).totalPayments.minus(baseline).toFixed()).toBe("250.75");
  });

  it("credits only nonnegative amounts actually carried over from the preceding return", () => {
    for (const taxYear of [2025, 2026] as const) {
      const facts = (amount: string, sourceTaxYear = taxYear - 1) => ({
        ...adjustments([{ ...estimate, date: `${taxYear}-04-15` }]),
        priorYearAppliedCredits: [{ sourceTaxYear, amount, type: "federal" }],
      });
      expect(run(taxYear, facts("0.00")).estimatedTaxPayments.toFixed()).toBe("125.37");
      expect(run(taxYear, facts("7.09")).estimatedTaxPayments.toFixed()).toBe("132.46");
      expect(() => run(taxYear, facts("-0.01"))).toThrow(/prior-return applied credit.*nonnegative amount/i);
      expect(() => run(taxYear, facts("7.09", taxYear))).toThrow(/prior-return applied credit.*source year/i);
    }
  });

  it("holds indistinguishable positive 2026 federal applied credits before line 26", () => {
    const actual = { sourceTaxYear: 2025, amount: "1000.01", type: "federal" } as const;
    const zero = { ...actual, amount: "0.00" };
    const facts = (priorYearAppliedCredits: readonly object[]) => ({ ...adjustments(), priorYearAppliedCredits });
    const baseline = run(2026);
    const one = run(2026, facts([actual, zero, zero]));
    expect(one.estimatedTaxPayments.toFixed()).toBe("1000.01");
    expect(one.totalPayments.minus(baseline.totalPayments).toFixed()).toBe("1000.01");
    expect(one.refund.minus(baseline.refund).toFixed()).toBe("1000.01");

    expect(() => run(2026, facts([
      { ...actual, rowId: "local-credit-1" }, { ...actual, amount: "1000.010", rowId: "local-credit-2" },
    ]))).toThrow(/same prior-year federal applied credit/i);
    expect(run(2026, facts([actual, { ...actual, amount: "1000.02" }])).estimatedTaxPayments.toFixed()).toBe("2000.03");
    expect(run(2026, facts([actual, { ...actual, type: "state", state: "WA" }])).estimatedTaxPayments.toFixed()).toBe("1000.01");
    const legacy = { ...actual, sourceTaxYear: 2024 };
    expect(run(2025, facts([legacy, legacy])).estimatedTaxPayments.toFixed()).toBe("2000.02");
  });

  it("holds a positive prior-return credit that conflicts with a sole taxpayer's no-return history", () => {
    for (const year of [2025, 2026] as const) {
      const facts = (amount: string) => raw(year, {
        ...adjustments(),
        priorYearAppliedCredits: [{ sourceTaxYear: year - 1, amount, type: "federal" }],
      });
      const noReturn = { priorYearTaxStatus: "no-return" };
      expect(() => calculateFederalTax(TaxYearInputSchema.parse({ ...facts("872.09"), form2210: noReturn })))
        .toThrow(/prior.return.*credit|prior.return.*refund/i);
      expect(calculateFederalTax(TaxYearInputSchema.parse({ ...facts("0.00"), form2210: noReturn }))
        .estimatedTaxPayments.toFixed()).toBe("0");
      expect(calculateFederalTax(TaxYearInputSchema.parse(facts("872.09"))).estimatedTaxPayments.toFixed()).toBe("872.09");

      const joint = facts("872.09");
      const spouse = { ...joint.taxpayer.primary, firstName: "Spouse", ssn: "111-22-3333" };
      expect(calculateFederalTax(TaxYearInputSchema.parse({
        ...joint, taxpayer: { ...joint.taxpayer, filingStatus: "married_filing_jointly", spouse }, form2210: noReturn,
        w2s: joint.w2s.map(w2 => ({ ...w2, accountHolder: "primary" })),
      })).estimatedTaxPayments.toFixed()).toBe("872.09");
    }
  });

  it("holds undocumented estimates and extension payments even with no installment penalty", () => {
    expect(run(2025).estimatedTaxPenalty.isZero()).toBe(true);
    expect(run(2026).estimatedTaxPenalty.isZero()).toBe(true);
    for (const taxYear of [2025, 2026] as const) {
      for (const date of [undefined, "", "2026-02-30", "2026-13-01", "2026-01-15\n", "2010-01-01"]) {
        const row = { ...estimate, date };
        expect(() => run(taxYear, adjustments([row]))).toThrow(/date|application/i);
        expect(() => run(taxYear, adjustments([], [row]))).toThrow(/date|application/i);
      }
    }
    const parsed = TaxYearInputSchema.parse(raw(2025, adjustments([estimate])));
    const typed = parsed.adjustments?.estimatedTaxPayments[0];
    if (!typed) throw new Error("Missing synthetic payment");
    // Direct TypeScript callers can bypass parsing, as can data decoding paths.
    Object.assign(typed, { date: undefined });
    expect(() => calculateFederalTax(parsed)).toThrow(/date/i);
    expect(() => run(2025, adjustments([{ ...estimate, amount: undefined }]))).toThrow();
    expect(() => run(2025, adjustments([{ ...estimate, amount: "-0.01" }]))).toThrow(/amount/i);
    expect(() => run(2025, adjustments([], [{ ...extension, amount: "-0.01" }]))).toThrow(/amount/i);
  });

  it("holds 2026 future estimates and extensions until their recorded payment date", () => {
    const application = { taxYear: 2026, confirmed: true } as const;
    const currentEstimate = { ...estimate, date: "2026-09-15", application };
    const followingYearEstimate = { ...estimate, date: "2027-01-15", application };
    const followingYearExtension = { ...extension, date: "2027-04-15", application };
    vi.setSystemTime(new Date(2027, 3, 14, 12));
    try {
      expect(run(2026).estimatedTaxPenalty.isZero()).toBe(true);
      expect(() => run(2026, adjustments([currentEstimate]), "2026-09-14")).toThrow(/payment date.*on or before.*as-of/i);
      expect(() => run(2026, adjustments([followingYearEstimate]), "2027-01-14")).toThrow(/payment date.*on or before.*as-of/i);
      expect(() => run(2026, adjustments([], [followingYearExtension]))).toThrow(/payment date.*on or before.*as-of/i);
      expect(() => run(2026, adjustments([], [{ ...followingYearExtension, amount: "0.00" }]))).toThrow(/payment date.*on or before.*as-of/i);
      expect(() => run(2026, adjustments([], [followingYearExtension]), "2027-04-15")).toThrow(/as-of date.*on or before today/i);
      expect(() => run(2026, adjustments([currentEstimate]), "2026-02-30")).toThrow(/as-of date.*on or before today/i);
      for (const payment of [currentEstimate, followingYearEstimate]) {
        expect(run(2026, adjustments([payment]), payment.date).estimatedTaxPayments.toFixed()).toBe("125.37");
      }
      expect(run(2026, adjustments([{ ...currentEstimate, amount: "0.00" }]), currentEstimate.date).estimatedTaxPayments.isZero()).toBe(true);
      vi.setSystemTime(new Date(2027, 3, 15, 12));
      const paid = run(2026, adjustments([followingYearEstimate], [followingYearExtension]));
      expect(paid.estimatedTaxPayments.toFixed()).toBe("125.37");
      expect(paid.allLines.find(line => line.form === "Sched 3" && line.line === "10")?.value.toFixed()).toBe("53.24");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the actual paid date distinct from the historical tax year application", () => {
    const legacyLate = { ...estimate, date: "2026-11-18" };
    expect(run(2025, adjustments([legacyLate])).estimatedTaxPayments.toFixed()).toBe("125.37");
    const affirmativeApplication = { taxYear: 2025, confirmed: true } as const;
    const historicalPayment = { ...estimate, date: "2028-02-29", application: affirmativeApplication };
    expect(() => run(2025, adjustments([{ ...historicalPayment, date: "0000-01-01" }]))).toThrow(/date/i);
    const parsed = TaxYearInputSchema.parse(raw(2025, adjustments([historicalPayment])));
    expect(parsed.adjustments?.estimatedTaxPayments[0]).toEqual(historicalPayment);
    expect(calculateFederalTax(parsed).estimatedTaxPayments.toFixed()).toBe("125.37");
    expect(() => run(2025, adjustments([{ ...historicalPayment, application: undefined }]))).toThrow(/application/i);
    for (const row of [
      { ...estimate, application: { ...affirmativeApplication, taxYear: 2026 } },
      { ...estimate, application: { ...affirmativeApplication, confirmed: false } },
      { ...estimate, application: { taxYear: 2025 } },
    ]) expect(() => run(2025, adjustments([row]))).toThrow(/application|confirmed/i);

    const mismatched = TaxYearInputSchema.parse(raw(2025, adjustments([estimate])));
    const row = mismatched.adjustments?.estimatedTaxPayments[0];
    if (!row) throw new Error("Missing synthetic payment");
    const invalidApplication = { taxYear: 2025.5, confirmed: true };
    Object.assign(row, { application: invalidApplication });
    expect(() => calculateFederalTax(mismatched as TaxYearInput)).toThrow(/application/i);
  });

  it("preserves following-year estimates and extensions and a confirmed zero", () => {
    vi.setSystemTime(new Date(2027, 3, 15, 12));
    try {
      for (const taxYear of [2025, 2026] as const) {
        const current = run(taxYear, adjustments(
          [{ ...estimate, date: `${taxYear + 1}-01-15` }], [{ ...extension, date: `${taxYear + 1}-04-15` }],
        ));
        expect(current.estimatedTaxPayments.toFixed()).toBe("125.37");
        expect(current.allLines.find(line => line.form === "Sched 3" && line.line === "10")?.value.toFixed()).toBe("53.24");
        expect(current.estimatedTaxPenalty.isZero()).toBe(true);
      }
    } finally {
      vi.useRealTimers();
    }
    expect(run(2025, adjustments([{ ...estimate, amount: "0.00" }])).estimatedTaxPayments.isZero()).toBe(true);
    expect(() => run(2025, adjustments([{ ...estimate, amount: "0.00", date: "" }]))).toThrow(/date/i);
  });
});
