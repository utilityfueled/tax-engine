import { describe, expect, it } from "vitest";
import { calculateOrdinaryShortAccountingYearWageTax } from "@/engine/forms/short-accounting-year-wage-tax.js";
import { d } from "@/utils/decimal.js";

function originalPayroll(taxYear = 2026) {
  const ownerReference = "synthetic-primary";
  return {
    period: {
      taxYear, ownerReference, sourceReference: "approved-calendar-year-change", filingStatus: "single",
      startsOn: `${taxYear}-01-01`, endsOn: `${taxYear}-06-30`, dateOfBirth: "1982-06-01",
      regularChangeConfirmed: true, livingTaxpayerConfirmed: true,
    },
    w2: {
      taxYear, ownerReference, accountHolder: "primary", employerEin: "00-0000001", sourceReference: "original-w2",
      wages: "70000.00", federalWithheld: "7000.00",
    },
    payroll: {
      taxYear, ownerReference, employerEin: "000000001", w2SourceReference: "original-w2",
      cashBasisActualAndConstructiveDatesConfirmed: true, soleOriginalW2Confirmed: true, calendarPayrollCompleteConfirmed: true,
      ordinaryWagesOnlyConfirmed: true, noDeductionsCreditsOrAmtAdjustmentsConfirmed: true,
      payments: [
        { sourceId: "p1", receivedOn: `${taxYear}-01-01`, wages: "10000.11", federalWithheld: "1000.01" },
        { sourceId: "p2", receivedOn: `${taxYear}-06-30`, wages: "19999.89", federalWithheld: "1999.99" },
        { sourceId: "p3", receivedOn: `${taxYear}-07-01`, wages: "35000.55", federalWithheld: "3500.55" },
        { sourceId: "p4", receivedOn: `${taxYear}-12-31`, wages: "4999.45", federalWithheld: "499.45" },
      ].map(payment => ({ ...payment, unconditionallyAvailableOn: payment.receivedOn })),
    },
  };
}

describe("actual short accounting-year wage sources", () => {
  it("derives both tax bases from inclusive actual receipts with no withholding output", () => {
    const result = calculateOrdinaryShortAccountingYearWageTax(originalPayroll());
    expect(result).toEqual({ shortPeriodWages: d("30000"), tax: expect.objectContaining({
      annualizedModifiedTaxableIncome: d("60000"), annualizedAmti: d("60000"),
      regularTax: d("3956"), additionalMinimumTax: d("0"),
    }) });
    expect(calculateOrdinaryShortAccountingYearWageTax(originalPayroll(2025))?.tax.regularTax).toEqual(d("4057"));

    const constructive = originalPayroll();
    constructive.payroll.payments[2].unconditionallyAvailableOn = "2026-06-30";
    expect(calculateOrdinaryShortAccountingYearWageTax(constructive)?.shortPeriodWages).toEqual(d("65000.55"));
  });

  it("requires an eligible actual period and matching confirmed originals", () => {
    const input = originalPayroll();
    for (const period of [
      { startsOn: "2026-02-01" }, { endsOn: "2026-06-29" }, { endsOn: "2026-02-30" }, { endsOn: "2026-12-31" },
      { endsOn: "2027-06-30" }, { regularChangeConfirmed: false }, { livingTaxpayerConfirmed: false },
      { filingStatus: "mfj" }, { ownerReference: "different-owner" }, { dateOfBirth: "2002-07-01" },
      { dateOfBirth: "1849-12-31" }, { dateOfBirth: undefined },
    ]) {
      expect(calculateOrdinaryShortAccountingYearWageTax({ ...input, period: { ...input.period, ...period } })).toBeNull();
    }
    expect(calculateOrdinaryShortAccountingYearWageTax({ ...input, period: { ...input.period, dateOfBirth: "2002-06-30" } }))
      .not.toBeNull();
    for (const w2 of [
      { taxYear: undefined }, { taxYear: 2025 }, { accountHolder: "spouse" }, { employerEin: "00-0000002" },
      { ownerReference: "different-owner" }, { sourceReference: "different-original" },
    ]) {
      expect(calculateOrdinaryShortAccountingYearWageTax({ ...input, w2: { ...input.w2, ...w2 } })).toBeNull();
    }
    expect(calculateOrdinaryShortAccountingYearWageTax(originalPayroll(2024))).toBeNull();
  });

  it("holds incomplete duplicate out-of-year or unreconciled payroll", () => {
    const input = originalPayroll();
    const [first, second, third, fourth] = input.payroll.payments;
    for (const payroll of [
      { calendarPayrollCompleteConfirmed: false }, { cashBasisActualAndConstructiveDatesConfirmed: false },
      { soleOriginalW2Confirmed: false }, { ordinaryWagesOnlyConfirmed: false },
      { noDeductionsCreditsOrAmtAdjustmentsConfirmed: false }, { taxYear: 2025 }, { ownerReference: "another-owner" },
      { payments: [first, second, third] }, { payments: [first, second, third, { ...fourth, sourceId: first.sourceId }] },
      { payments: [first, second, third, { ...fourth, receivedOn: "2027-01-01", unconditionallyAvailableOn: "2027-01-01" }] },
      { payments: [first, second, third, { ...fourth, receivedOn: "2026-12-30" }] },
      { payments: [first, second, third, { ...fourth, unconditionallyAvailableOn: undefined }] },
      { payments: [first, second, third, { ...fourth, wages: "4999.44" }] },
      { payments: [first, second, third, { ...fourth, federalWithheld: "499.44" }] },
      { payments: [first, second, third, { ...fourth, federalWithheld: undefined }] },
      { payments: [first, second, third, { ...fourth, wages: "NaN" }] },
    ]) {
      expect(calculateOrdinaryShortAccountingYearWageTax({ ...input, payroll: { ...input.payroll, ...payroll } })).toBeNull();
    }
  });
});
