// Spec: spec/federal/vehicle-refinancing.yaml
import { expect, it } from "vitest";
import { Schedule1ASchema, TaxpayerSchema, TaxYearInputSchema } from "@/models/inputs.js";
import { calculateSchedule1A } from "@/engine/schedules/schedule-1-a.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { d } from "@/utils/decimal.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
import { vehicleRefinancingFixture } from "../../fixtures/vehicle-refinancing.js";
const facts = (loan = vehicleRefinancingFixture()) => Schedule1ASchema.parse({ primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", employeeTips: [], businessTips: [], overtime: [], seniorOwners: [], vehicleLoans: [loan] });
const calc = (loan = vehicleRefinancingFixture(), magi = "50000") => calculateSchedule1A({ taxpayer: TaxpayerSchema.parse({ ...simpleW2Fixture.taxpayer, taxYear: loan.sourceTaxYear }), agi: d(magi), foreignExcludedIncome: d("0"), facts: facts(loan) });

it("conserves actual interest through cash-out and repeated refinancings", () => {
  for (const year of [2025, 2026]) {
    const loan = vehicleRefinancingFixture(year), before = JSON.stringify(loan);
    expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("1000"); //200 +1000*(20000/25000)
    expect(JSON.stringify(loan)).toBe(before);
  }
  const loan = vehicleRefinancingFixture();
  const first = loan.refinancingSources.refinancings[0]; if (!first) throw new Error("Missing synthetic source");
  loan.refinancingSources.refinancings.push({ ...first, sourceId: "refinance-2", previousLoanSourceId: "refinance-1", originationDate: "2025-09-01", principal: "16000", previousOutstandingPrincipal: "12500", interestPaid: "160", loanAccountReference: "third-account" });
  loan.loanAccountReference = "third-account"; loan.interestPaid = "1360";
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("1100"); //200+800+160*(10000/16000)
  first.interestDeductedElsewhere = "100"; first.otherExcludedInterest = "50";
  loan.businessInterestDeducted = "100"; loan.nonqualifyingInterest = "50";
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("950");
});

it("uses the published original financing allocations before refinancing", () => {
  const loan = vehicleRefinancingFixture(); const original = loan.refinancingSources.originalLoan;
  original.qualifiedPurchaseCosts = "36000"; original.otherPurchaseCosts = "4000"; original.interestPaid = "1000";
  const current = loan.refinancingSources.refinancings[0]; if (!current) throw new Error("Missing synthetic source");
  current.principal = "22500"; current.interestPaid = "500"; loan.interestPaid = "1500";
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("1300"); //IRS90%original portion;18000/22500new
  original.qualifiedPurchaseCosts = "40000"; original.otherPurchaseCosts = "6000"; original.downPayment = "4000"; original.principal = "42000"; original.interestPaid = "420";
  current.previousOutstandingPrincipal = "21000"; current.principal = "25000"; current.interestPaid = "1000"; loan.interestPaid = "1420";
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("1200"); //IRS40000/42000original;20000/25000new
  current.principal = "10000";
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("1400"); //newbalancebelowoutstandingSPVL
});

it("rejects incomplete or contradictory original loan sources", () => {
  const base = vehicleRefinancingFixture();
  for (const mutate of [
    (x: typeof base) => { x.refinancingSources.sourceFactsConfirmed = false; },
    (x: typeof base) => { x.refinancingSources.sourceTaxYear = 2024; },
    (x: typeof base) => { x.refinancingSources.originalLoan.downPayment = ""; },
    (x: typeof base) => { x.refinancingSources.originalLoan.principal = "40000.01"; },
    (x: typeof base) => { x.refinancingSources.originalLoan.interestPaid = "-1"; },
    (x: typeof base) => { x.refinancingSources.ordinaryPrincipalMethodConfirmed = false; },
    (x: typeof base) => { x.refinancingSources.sameOriginalBorrowerConfirmed = false; },
    (x: typeof base) => { x.interestPaid = "1200.01"; },
    (x: typeof base) => { x.loanAccountReference = "unmatched"; },
    (x: typeof base) => { const row = x.refinancingSources.refinancings[0]; if (row) row.previousLoanSourceId = "other"; },
    (x: typeof base) => { const row = x.refinancingSources.refinancings[0]; if (row) row.previousOutstandingPrincipal = "40001"; },
    (x: typeof base) => { const row = x.refinancingSources.refinancings[0]; if (row) row.originationDate = "2026-02-30"; },
    (x: typeof base) => { const row = x.refinancingSources.refinancings[0]; if (row) row.sourceId = "purchase"; },
  ]) { const copy = structuredClone(base); mutate(copy); expect(() => calc(copy)).toThrow(); }
  const old = vehicleRefinancingFixture(2026); const row = old.refinancingSources.refinancings[0]; if (row) row.originationDate = "2025-06-01";
  expect(() => calc(old)).toThrow(/paid.off|year|interest/i);
});

it("retains earlier eligible interest and applies the return limit once", () => {
  const loan = vehicleRefinancingFixture(); const row = loan.refinancingSources.refinancings[0]; if (!row) throw new Error("Missing synthetic source");
  loan.firstLien = false; row.firstLien = false;
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("200");
  loan.firstLien = true; row.firstLien = true; loan.refinancingSources.originalLoan.firstLien = false;
  expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe("0");
  const qualified = vehicleRefinancingFixture();
  expect(calc(qualified, "100000.01").vehicleInterestDeduction.toFixed()).toBe("800");
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, schedule1A: facts(qualified) });
  const baseline = calculateFederalTax(TaxYearInputSchema.parse(simpleW2Fixture)); const result = calculateFederalTax(input);
  expect(result.agi.eq(baseline.agi)).toBe(true); expect(result.totalWithholding.eq(baseline.totalWithholding)).toBe(true);
  expect(result.taxableIncome.toFixed()).toBe(baseline.taxableIncome.minus("1000").toFixed());
});

it("retains cents zero and exact cap and filing-status boundaries", () => {
  const loan = vehicleRefinancingFixture();
  const current = loan.refinancingSources.refinancings[0]; if (!current) throw new Error("Missing synthetic source");
  current.principal = "20000"; loan.refinancingSources.originalLoan.interestPaid = "0";
  for (const [interest, expected] of [["0", "0"], ["0.49", "0"], ["0.50", "1"], ["10000.01", "10000"], ["9007199254740993.01", "10000"]]) {
    if (interest === undefined || expected === undefined) throw new Error("Missing control");
    current.interestPaid = interest; loan.interestPaid = interest;
    expect(calc(loan).vehicleInterestDeduction.toFixed()).toBe(expected);
  }
  current.interestPaid = "1000"; loan.interestPaid = "1000";
  expect(calc(loan, "100000").vehicleInterestDeduction.toFixed()).toBe("1000");
  expect(calc(loan, "101000").vehicleInterestDeduction.toFixed()).toBe("800");
  expect(calc(loan, "101000.01").vehicleInterestDeduction.toFixed()).toBe("600");
  for (const [status, magi, expected] of [["married_filing_separately", "100000", "1000"], ["married_filing_jointly", "200000", "1000"], ["married_filing_jointly", "200000.01", "800"]] as const) {
    const result = calculateSchedule1A({ taxpayer: TaxpayerSchema.parse({ ...simpleW2Fixture.taxpayer, filingStatus: status }), agi: d(magi), foreignExcludedIncome: d("0"), facts: facts(loan) });
    expect(result.vehicleInterestDeduction.toFixed()).toBe(expected);
  }
  current.interestDeductedElsewhere = "1000.01"; loan.businessInterestDeducted = "1000.01";
  expect(() => calc(loan)).toThrow(/excluded interest|exclusions/i);
});
