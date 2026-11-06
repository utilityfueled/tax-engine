/** Spec: state/oh-payment-dated-source.yaml; all literals predate candidate output. */
import Decimal from "decimal.js";
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { buildOhioResidentReturnInput, type OhioOverlayInput } from "@/engine/state/oh-input-adapter.js";
import { calculateOhioResidentReturn } from "@/engine/state/oh-return.js";
import { buildOhioPaymentSource } from "@/engine/state/oh-payment-source.js";
import { calculateOhioDatedPaymentInterest } from "@/engine/state/oh-payment-dated-source.js";
import { ohioActualW2WithholdingFixture } from "../../fixtures/oh-w2-state-withholding-consumer.js";
import { ohioActualDatedPaymentFixture, ohioActualBalance, ohioActualEstimate, rebindOhioDatedOriginals, ohioDatedW2, rebindOhioDatedW2, type OhioActualDatedInput } from "../../fixtures/oh-payment-dated-source.js";
function calculate(input = ohioActualDatedPaymentFixture(), overlay: OhioOverlayInput = {}) {
  return calculateOhioResidentReturn(buildOhioResidentReturnInput(input, calculateFederalTax(input), overlay));
}

it("dated integration retains independently pinned whole-dollar periods", () => {
  const input = ohioActualDatedPaymentFixture(), before = structuredClone(input), result = calculate(input);
  expect(result.it1040.line10_taxAfterCredits.toString()).toBe("2323");
  expect(result.itsd2210?.line9_requiredAnnualPayment.toString()).toBe("2091");
  expect(result.itsd2210Dated?.quarters.map(q => q.line16.toString())).toEqual(["2", "7", "16", "3"]);
  expect(result.itsd2210Dated?.quarters.map(q => q.line14.toString())).toEqual(["273", "346", "618", "891"]);
  expect(result.itsd2210?.line17_totalPenalty.toString()).toBe("28");
  expect(result.it1040.line22_totalAmountDue.toString()).toBe("1151");
  expect(input).toEqual(before);
});
it("dated integration derives fresh tax and actual Ohio withholding without scalar overrides", () => {
  const input = ohioActualDatedPaymentFixture();
  const result = calculate(input);
  expect(result.it1040.line14_ohioWithholding.toString()).toBe("1000");
  expect(result.itsd2210?.line2_currentYearLiability.toString()).toBe("2323");
  for (const overlay of [{underpaymentPenalty:"0"}, {priorYearTaxLiability:"0"}, {priorYearTimelyFiled:true}, {estimatedPayments:"0"}, {estimatedPaymentSchedule:[]}, {ohioWithholdingOverride:"0"}, {refundableCredits:"500"}]) {
    expect(() => calculate(input, overlay)).toThrow(/override|payment/i);
  }
});
it("dated integration separates remaining principal from estimated payments and filing date", () => {
  const input = ohioActualDatedPaymentFixture(), result = calculate(input);
  expect(result.it1040.line15_estimatedPayments.toString()).toBe("200");
  expect(result.itsd2210?.line1_totalTaxesPaid.toString()).toBe("1200");
  expect(result.itsd2210Dated?.quarters[3]?.line16.toString()).toBe("3");
  input.ohioPayments.currentTiming = {kind:"filed",filedDate:"2026-01-10",asOfDate:"2026-02-01"};
  expect(calculate(input).itsd2210?.line17_totalPenalty.toString()).toBe("28");
  ohioActualBalance(input).amountAppliedToTax = "1122";
  expect(() => calculate(input)).toThrow(/remaining.tax|principal/i);
});
it("dated source requires current actual originals and distinct receipt confirmations", () => {
  const mutations: Array<(input: OhioActualDatedInput) => void> = [
    i => { ohioActualEstimate(i).original.accountSsn = "900-70-0999"; },
    i => { ohioActualEstimate(i).taxYear = ohioActualEstimate(i).original.taxYear = 2024; },
    i => { ohioActualEstimate(i).date = ohioActualEstimate(i).original.date = "2025-02-30"; },
    i => { ohioActualEstimate(i).date = ohioActualEstimate(i).original.date = "2026-03-01"; },
    i => { ohioActualEstimate(i).amount = "199"; },
    i => { ohioActualBalance(i).original.accountSsn = "900-70-0999"; },
    i => { ohioActualBalance(i).original.taxYear = 2024; },
    i => { ohioActualBalance(i).original.amount = "1122.99"; },
    i => { ohioActualBalance(i).original.confirmationNumber = ohioActualEstimate(i).original.confirmationNumber; },
    i => { i.ohioPayments.allPaymentsIncludedConfirmed = false as true; },
    i => { i.ohioPayments.withholdingTreatment = "actual_dates" as "equal_quarters"; },
    i => { const w2=ohioDatedW2(i); w2.employer.name="Changed current original"; },
  ];
  for (const mutate of mutations) {
    const input=ohioActualDatedPaymentFixture(); mutate(input);
    expect(() => calculate(input)).toThrow();
  }
});
it("dated integration rejects expected payoff and future unpaid accrual independently of filing", () => {
  const input=ohioActualDatedPaymentFixture();
  input.ohioPayments.remainingTaxPayment = {status:"expected_payment",sourceReference:"Actual future intention only",sourceFactsConfirmed:true,date:"2026-04-15",amountAppliedToTax:"1123"};
  expect(() => calculate(input)).toThrow(/actual|dated|as.of/i);
  input.ohioPayments.remainingTaxPayment = {status:"no_remaining_tax",sourceReference:"Contradictory actual account",sourceFactsConfirmed:true};
  expect(() => calculate(input)).toThrow(/remaining.tax|principal|as.of|future/i);
});
it("dated integration rejects receipt cents rather than individually rounding actual source amounts", () => {
  const input=ohioActualDatedPaymentFixture();
  ohioActualEstimate(input).amount=ohioActualEstimate(input).original.amount="200.01";
  ohioActualBalance(input).amountAppliedToTax="1122.99";
  expect(() => calculate(input)).toThrow(/whole|cents/i);
});
it("dated integration does not infer missing actual W2 withholding or owner year", () => {
  for (const field of ["stateTaxWithheld","taxYear","accountHolder"] as const) {
    const input=ohioActualDatedPaymentFixture(),w2=ohioDatedW2(input);
    delete w2[field];
    // The raw originals are rebound, so this probes actual missing facts, not a stale snapshot.
    rebindOhioDatedW2(input); rebindOhioDatedOriginals(input);
    expect(() => calculate(input)).toThrow();
  }
});
it("dated integration retains endpoint version and keeps actual originals private", () => {
  const endpoint=ohioActualW2WithholdingFixture();
  const original=calculateOhioResidentReturn(buildOhioResidentReturnInput(endpoint,calculateFederalTax(endpoint)));
  expect(original.itsd2210?.line17_totalPenalty.toString()).toBe("56");
  expect(buildOhioPaymentSource(endpoint,endpoint.ohioPayments).methodVersion).toBe("ohio-it1040-calendar-endpoint-payment-sources-v1");
  const input=ohioActualDatedPaymentFixture(),before=buildOhioPaymentSource(input,input.ohioPayments);
  expect(before.methodVersion).toBe("ohio-it1040-actual-dated-payment-sources-v1");
  ohioActualBalance(input).original.confirmationNumber="PRIVATE-NEW-ACTUAL-BALANCE-CONFIRMATION";
  const after=buildOhioPaymentSource(input,input.ohioPayments);
  expect(after.sourceDigest).not.toBe(before.sourceDigest);
  const json=JSON.stringify(calculate(input).lines);
  for(const value of [input.taxpayer.primary.ssn,ohioActualBalance(input).sourceReference,ohioActualBalance(input).original.confirmationNumber,ohioActualEstimate(input).sourceReference])expect(json).not.toContain(value);
  expect(json).toContain(after.sourceDigest);
});
it("dated integration passes fresh PartI to the guarded calculator without a precision selector", () => {
  const input=ohioActualDatedPaymentFixture(),source=buildOhioPaymentSource(input,input.ohioPayments);
  const result=calculateOhioDatedPaymentInterest(source,new Decimal("2323"),new Decimal("1000"));
  expect(result.worksheet.line9_requiredAnnualPayment.toString()).toBe("2091");
  expect(result.partII?.line17.toString()).toBe("28");
  expect(result.worksheet.quarters).toBeNull();
});
