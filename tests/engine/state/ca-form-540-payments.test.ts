/**
 * Tests for California Form 540 resident payments and refund/balance-due assembly.
 * Spec: spec/state/ca-form-540-payments.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540ResidentPayments } from "@/engine/state/ca-form-540-payments.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 resident payments", () => {
  it("CA Form 540 resident payments Line 78 - lines 71 through 77 add into total payments", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(0),
      line71Withholding: d(100),
      line72EstimatedPayments: d(200),
      line73RealEstateWithholding: d(30),
      line74RefundableCredits: d(40),
      line75CaliforniaEarnedIncomeTaxCredit: d(50),
      line76YoungChildTaxCredit: d(60),
      line77FosterYouthTaxCredit: d(70),
    });

    expect(result.line78TotalPayments.toNumber()).toBe(550);
  });

  it("CA Form 540 resident payments Line 92 - full-year health coverage forces the penalty to zero", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(100),
      line71Withholding: d(125),
      hasFullYearHealthCoverage: true,
      line92IndividualSharedResponsibilityPenalty: d(999),
    });

    expect(result.line92IndividualSharedResponsibilityPenalty.toNumber()).toBe(0);
    expect(result.line95PaymentsAfterIsrPenalty.toNumber()).toBe(125);
  });

  it("CA Form 540 resident payments Lines 93 and 94 - use tax determines whether payments remain or tax is due", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(0),
      line71Withholding: d(90),
      line72EstimatedPayments: d(10),
      line91UseTax: d(120),
    });

    expect(result.line78TotalPayments.toNumber()).toBe(100);
    expect(result.line93PaymentsAfterUseTax.toNumber()).toBe(0);
    expect(result.line94UseTaxBalanceDue.toNumber()).toBe(20);
  });

  it("CA Form 540 resident payments Lines 97 through 99 - overpayment can be split between next-year estimates and a refund", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(900),
      line71Withholding: d(800),
      line72EstimatedPayments: d(200),
      line91UseTax: d(30),
      line98AppliedToEstimatedTax: d(20),
    });

    expect(result.line93PaymentsAfterUseTax.toNumber()).toBe(970);
    expect(result.line95PaymentsAfterIsrPenalty.toNumber()).toBe(970);
    expect(result.line97OverpaidTax.toNumber()).toBe(70);
    expect(result.line98AppliedToEstimatedTax.toNumber()).toBe(20);
    expect(result.line99Refund.toNumber()).toBe(50);
    expect(result.line114AmountDue.toNumber()).toBe(0);
    expect(result.line115RefundAfterContributionsAndPenalties.toNumber()).toBe(50);
  });

  it("CA Form 540 resident payments Line 115 - refund is reduced when contributions and penalties stay below the available overpayment", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(900),
      line71Withholding: d(1000),
      line110VoluntaryContributions: d(20),
      line112InterestAndPenalties: d(3),
      line113UnderpaymentPenalty: d(2),
    });

    expect(result.line97OverpaidTax.toNumber()).toBe(100);
    expect(result.line99Refund.toNumber()).toBe(100);
    expect(result.line111AmountDueBeforePenalties.toNumber()).toBe(0);
    expect(result.line114AmountDue.toNumber()).toBe(0);
    expect(result.line115RefundAfterContributionsAndPenalties.toNumber()).toBe(75);
  });

  it("CA Form 540 resident payments Line 114 - amount due adds the excess contributions and penalties when they outrun the refund", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(900),
      line71Withholding: d(1000),
      line110VoluntaryContributions: d(50),
      line112InterestAndPenalties: d(30),
      line113UnderpaymentPenalty: d(40),
    });

    expect(result.line99Refund.toNumber()).toBe(100);
    expect(result.line111AmountDueBeforePenalties.toNumber()).toBe(0);
    expect(result.line114AmountDue.toNumber()).toBe(20);
    expect(result.line115RefundAfterContributionsAndPenalties.toNumber()).toBe(0);
  });

  it("CA Form 540 resident payments - applied estimated tax cannot exceed overpaid tax", () => {
    expect(() =>
      calculateCAForm540ResidentPayments({
        line64TotalTax: d(900),
        line71Withholding: d(950),
        line98AppliedToEstimatedTax: d(60),
      })
    ).toThrow("CA Form 540 line 98 applied estimated tax cannot exceed line 97 overpaid tax");
  });

  it("CA Form 540 resident payments - audit trail records refund and balance-due resolution inputs", () => {
    const result = calculateCAForm540ResidentPayments({
      line64TotalTax: d(900),
      line71Withholding: d(1000),
      line110VoluntaryContributions: d(20),
      line112InterestAndPenalties: d(3),
      line113UnderpaymentPenalty: d(2),
    });

    const line99 = result.lines.find((line) => line.form === "CA-540" && line.line === "99");
    const line115 = result.lines.find((line) => line.form === "CA-540" && line.line === "115");

    expect(line99?.inputs).toMatchObject({
      "Line 97": d(100),
      "Line 98": d(0),
    });
    expect(line115?.inputs).toMatchObject({
      "Line 99": d(100),
      "Line 110": d(20),
      "Line 112": d(3),
      "Line 113": d(2),
    });
  });
});
