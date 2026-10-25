// Spec: spec/federal/home-mortgage-interest.yaml
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateHomeMortgageInterest } from "@/engine/forms/home-mortgage-interest.js";
import { calculateDeductibleMortgageInterest } from "@/utils/tax-math.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleA } from "@/engine/schedules/schedule-a.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

import { mortgageInput, mortgageLoan } from "../../fixtures/mortgage-source.js";
const value = (result: ReturnType<typeof calculateHomeMortgageInterest>, line: string) => result.lines.find(item => item.form === "Pub936 Table1" && item.line === line)?.value.toString();

describe("Pub936 actual mortgage sources", () => {
  it("binds actual loan sources and rejects unknown or contradictory source amounts", () => {
    const input = mortgageInput();
    expect(calculateHomeMortgageInterest(input).sourceFactsVerified).toBe(true);
    expect(calculateHomeMortgageInterest(input).mortgageInterest.toString()).toBe("30000");
    input.form1098[0].mortgageInterestReceived = "40001";
    expect(() => calculateHomeMortgageInterest(input)).toThrow(/reconcile.*Box1/i);
    const unknown = mortgageInput();
    unknown.form1098[0].sourceFactsComplete = false;
    expect(() => calculateHomeMortgageInterest(unknown)).toThrow(/source/i);
    const noFacts = mortgageInput();
    noFacts.taxpayer.taxYear = 2026;
    noFacts.mortgageInterestWorksheet = undefined;
    expect(() => calculateHomeMortgageInterest(noFacts)).toThrow(/mortgage.*source/i);
  });
  it("uses published average balance methods instead of Form1098 Box2", () => {
    const firstLast = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ balance: { method: "first_last", firstBalance: "900000", lastBalance: "600000", noAdditionalBorrowing: true, noPrepaymentOverOneMonth: true, levelPaymentsAtLeastSemiannually: true } })]));
    expect(value(firstLast, "12")).toBe("750000");
    expect(firstLast.mortgageInterest.toString()).toBe("40000");
    const monthly = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ balance: { method: "monthly", qualifiedHomeMonths: [1, 2, 3, 4], balances: [{ month: 1, amount: "900000" }, { month: 2, amount: "800000" }, { month: 3, amount: "700000" }, { month: 4, amount: "600000" }] } })]));
    expect(value(monthly, "12")).toBe("750000");
    const rate = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ interestPaid: "2500", balance: { method: "interest_rate", currentYearInterest: "2500", currentYearInterestPaidInPriorYears: "0", currentYearInterestPaidInPriorYearsByOthers: "0", interestRefundedToOthers: "0", lowestAnnualRate: "0.09", securedAllYear: true, interestPaidAtLeastMonthly: true } })]));
    expect(value(rate, "12")).toBe("27778");
    const invalid = mortgageInput([mortgageLoan({ balance: { method: "first_last", firstBalance: "900000", lastBalance: "600000", noAdditionalBorrowing: true, noPrepaymentOverOneMonth: false, levelPaymentsAtLeastSemiannually: true } })]);
    expect(() => calculateHomeMortgageInterest(invalid)).toThrow(/first.*last/i);
  });
  it("reconciles the interest-rate numerator to actual payer and prepayment sources", () => {
    const rateSource = {
      method: "interest_rate", currentYearInterest: "100", lowestAnnualRate: "0.04",
      currentYearInterestPaidInPriorYears: "0", currentYearInterestPaidInPriorYearsByOthers: "0",
      interestRefundedToOthers: "0", securedAllYear: true, interestPaidAtLeastMonthly: true,
    };
    expect(() => calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ balance: rateSource })])))
      .toThrow(/interest.rate.*reconcile/i);
    // Current-year paid shares 36,000 + 8,000, less refunds 1,000 + 2,000,
    // plus prior-paid current-year shares 3,000 + 1,000 = 45,000 / 4% = 1,125,000.
    // The return's own interest is 36,000 - 1,000 + 3,000 = 38,000;
    // 750,000 / 1,125,000 rounds to .667, yielding 25,346.
    const input = mortgageInput([mortgageLoan({
      interestPaid: "36000", interestPaidByOthers: "8000", sameYearInterestRefund: "1000",
      balance: { ...rateSource, currentYearInterest: "45000", currentYearInterestPaidInPriorYears: "3000",
        currentYearInterestPaidInPriorYearsByOthers: "1000", interestRefundedToOthers: "2000" },
    })]);
    const result = calculateHomeMortgageInterest(input);
    expect(value(result, "12")).toBe("1125000");
    expect(value(result, "13")).toBe("38000");
    expect(result.mortgageInterest.toString()).toBe("25346");
    const overRefund = mortgageInput([mortgageLoan({ balance: { ...rateSource, interestRefundedToOthers: "1" } })]);
    expect(() => calculateHomeMortgageInterest(overRefund)).toThrow(/other.person.*refund/i);
  });
  it("uses the actual December15 boundary and uncapped grandfathered debt", () => {
    expect(calculateDeductibleMortgageInterest(new Decimal(40000), new Decimal(1000000), getConstants(2025), "2017-12-15").toString()).toBe("40000");
    expect(calculateDeductibleMortgageInterest(new Decimal(45000), new Decimal(900000), getConstants(2025), "2020-01-01").toString()).toBe("37485");
    expect(calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ originationDate: "2017-12-15" })])).mortgageInterest.toString()).toBe("40000");
    expect(calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ originationDate: "2017-12-16" })])).mortgageInterest.toString()).toBe("30000");
    const old = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ originationDate: "1987-10-13", acquisitionUse: false, balance: { method: "lender_average", amount: "1400000", sourceReference: "Actual lender average" } })]));
    expect(value(old, "1")).toBe("1400000");
    expect(value(old, "11")).toBe("1400000");
    expect(old.mortgageInterest.toString()).toBe("40000");
    const transition = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ originationDate: "2018-03-01", bindingContract: { signedDate: "2017-12-14", requiredClosingDate: "2017-12-31", purchaseDate: "2018-03-01" } })]));
    expect(value(transition, "2")).toBe("1000000");
  });
  it("applies the combined loan limit and three decimal ratio to interest and points", () => {
    const input = mortgageInput([mortgageLoan({ interestPaid: "45000", balance: { method: "lender_average", amount: "900000", sourceReference: "Lender average" }, pointsPaid: "3000", points: { method: "current_year", cashMethod: true, establishedPractice: true, withinUsualAmount: true, notServiceFees: true, ownFundsSufficient: true, buyBuildOrImproveMainHome: "purchase", percentageOfPrincipal: true, onSettlementStatement: true, fullDeductionElected: true, paidDate: "2025-01-01" } })]);
    const result = calculateHomeMortgageInterest(input);
    expect(value(result, "14")).toBe("0.833");
    expect(result.mortgageInterest.toString()).toBe("37485");
    expect(result.deductiblePoints.toString()).toBe("2499");
    expect(result.line8a.toString()).toBe("39984");
    expect(value(result, "16")).toBe("7515");
    const cents = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ interestPaid: "1000.51", balance: { method: "lender_average", amount: "1500000", sourceReference: "Actual average" } })]));
    expect(value(cents, "13")).toBe("1001");
    expect(cents.mortgageInterest.toString()).toBe("501");
    const mfs = mortgageInput();
    mfs.taxpayer.filingStatus = "married_filing_separately";
    expect(calculateHomeMortgageInterest(mfs).mortgageInterest.toString()).toBe("15000");
  });
  it("implements the published ratable points example and actual current purchase qualification", () => {
    const result = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ interestPaid: "2500", pointsPaid: "4800", balance: { method: "highest_balance", amount: "100000", sourceReference: "Source" }, points: { method: "ratable", originalPoints: "4800", originalPrincipal: "100000", loanTermMonths: 240, paymentsInYear: 3, paymentIntervalMonths: 1, unamortizedPointsAtStartOfYear: "0", cashMethod: true, comparableLoanTerms: true, pointsAreInterest: true, paidDate: "2025-10-01" } })]));
    expect(result.deductiblePoints.toString()).toBe("60");
    expect(result.line8a.toString()).toBe("2560");
    const invalid = mortgageInput([mortgageLoan({ pointsPaid: "3000", points: { method: "current_year", cashMethod: true, establishedPractice: true, withinUsualAmount: true, notServiceFees: true, ownFundsSufficient: false, buyBuildOrImproveMainHome: "purchase", percentageOfPrincipal: true, onSettlementStatement: true, fullDeductionElected: true, paidDate: "2025-01-01" } })]);
    expect(() => calculateHomeMortgageInterest(invalid)).toThrow(/points.*qualification/i);
  });
  it("separates current-year refunds from actual prior-year taxable recoveries", () => {
    const input = mortgageInput([mortgageLoan({ interestPaid: "12000", sameYearInterestRefund: "1000", balance: { method: "highest_balance", amount: "100000", sourceReference: "Source" } })]);
    input.form1098[0].refundOfOverpaidInterest = "2000";
    const facts = input.mortgageInterestWorksheet;
    if (!facts) throw new Error("Missing synthetic mortgage worksheet");
    facts.priorYearInterestRecoveries = [{ sourceId: "refund-one", form1098SourceId: "1098-one", originTaxYear: 2024, refundReceived: "2000", taxableRecovery: "600", alreadyIncludedInOtherIncome: "0", taxBenefitWorksheetReference: "Actual2024 tax benefit worksheet", taxBenefitWorksheetConfirmed: true }];
    const result = calculateHomeMortgageInterest(input);
    expect(result.mortgageInterest.toString()).toBe("11000");
    expect(result.taxableInterestRecovery.toString()).toBe("600");
    const federal = calculateFederalTax(input);
    expect(federal.agi.toString()).toBe("85600");
    expect(federal.schedule1?.lines.find(line => line.form === "Sched 1" && line.line === "8z")?.value.toString()).toBe("600");
    expect(federal.scheduleA?.mortgageInterest.toString()).toBe("11000");
    facts.priorYearInterestRecoveries[0].alreadyIncludedInOtherIncome = "600";
    expect(() => calculateHomeMortgageInterest(input)).toThrow(/other-income source/i);
    input.form1099Misc = TaxYearInputSchema.parse({ ...input, form1099Misc: [{ payer: "Actual recovery reporting payer", otherIncome: "600" }] }).form1099Misc;
    facts.priorYearInterestRecoveries[0].otherIncomeSource = { form1099MiscIndex: 0 };
    expect(calculateFederalTax(input).agi.toString()).toBe("85600");
    expect(calculateHomeMortgageInterest(input).additionalTaxableInterestRecovery.toString()).toBe("0");
    facts.priorYearInterestRecoveries = [];
    expect(() => calculateHomeMortgageInterest(input)).toThrow(/Box4.*reconcil/i);
  });
  it("routes actual reported and unreported amounts into canonical ScheduleA lines", () => {
    const input = mortgageInput([mortgageLoan({ interestPaid: "10000", balance: { method: "highest_balance", amount: "100000", sourceReference: "Source" } }), mortgageLoan({ sourceId: "loan-two", form1098SourceId: undefined, lenderName: "Actual seller", lenderAddress: "1 Sample Street", lenderTaxId: "999-00-0001", homeId: "home-two", homeUse: "second", interestPaid: "2000", balance: { method: "highest_balance", amount: "50000", sourceReference: "Source" }, points: { method: "completed_amortization", deductibleAmountBeforeLimit: "200", unamortizedPointsAvailable: "600", sourceTaxYear: 2025, worksheetReference: "Actual remaining points worksheet", serviceFeesExcludedConfirmed: true, reportedOnCurrentForm1098: false } })]);
    const result = calculateScheduleA(input, new Decimal(100000), "single", getConstants(2025));
    expect(result.lines.find(line => line.form === "Sched A" && line.line === "8a")?.value.toString()).toBe("10000");
    expect(result.lines.find(line => line.form === "Sched A" && line.line === "8b")?.value.toString()).toBe("2000");
    expect(result.lines.find(line => line.form === "Sched A" && line.line === "8c")?.value.toString()).toBe("200");
    expect(result.mortgageInterest.toString()).toBe("12000");
    expect(result.mortgageWorksheet?.deductiblePoints.toString()).toBe("200");
  });
  it("retains actual mixed-category allocations without treating excluded debt as acquisition", () => {
    const result = calculateHomeMortgageInterest(mortgageInput([mortgageLoan({ loanType: "refinanced_mixed", interestPaid: "10000", nonqualifiedInterest: "1000", balance: { method: "category_worksheet", grandfatheredDebt: "0", acquisitionDebtBefore2017: "600000", acquisitionDebtAfter2017: "300000", excludedDebt: "100000", worksheetReference: "Completed actual debt/tracing worksheet", classificationConfirmed: true, paymentsAppliedInRequiredOrderConfirmed: true } })]));
    expect(value(result, "12")).toBe("900000");
    expect(value(result, "13")).toBe("9000");
    expect(result.mortgageInterest.toString()).toBe("7497");
    expect(result.excludedSourceInterest.toString()).toBe("1000");
  });
  it("preserves known ineligibility and refuses omitted original qualification facts", () => {
    const input = mortgageInput([mortgageLoan({ ownershipInterest: false })]);
    expect(calculateHomeMortgageInterest(input).mortgageInterest.toString()).toBe("0");
    const raw = { ...mortgageInput() };
    expect(TaxYearInputSchema.safeParse({ ...raw, mortgageInterestWorksheet: { ...raw.mortgageInterestWorksheet, loans: [{ ...mortgageLoan(), securedDebt: undefined }] } }).success).toBe(false);
    const current = mortgageInput([], { taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 }, mortgageInterestWorksheet: undefined });
    expect(calculateScheduleA(current, new Decimal(100000), "single", FEDERAL_2026_CONSTANTS).mortgageInterest.toString()).toBe("0");
  });
});
