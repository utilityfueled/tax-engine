// Spec: spec/federal/home-mortgage-interest.yaml review-pdf
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import path from "node:path";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillScheduleA, SCHEDULE_A_FIELDS } from "@/pdf/mappings/2025/fill-schedule-a.js";
import { mortgageInput, mortgageLoan } from "../fixtures/mortgage-source.js";
const blank = path.resolve("forms/blank/2025/f1040sa.pdf");

describe("ScheduleA actual mortgage review", () => {
  it("copies source-qualified mortgage audits and rejects tampered interest lines", async () => {
    const input = mortgageInput([
      mortgageLoan({ interestPaid: "40000", pointsPaid: "3000", points: { method: "current_year", cashMethod: true, establishedPractice: true, withinUsualAmount: true, notServiceFees: true, ownFundsSufficient: true, buyBuildOrImproveMainHome: "purchase", percentageOfPrincipal: true, onSettlementStatement: true, fullDeductionElected: true, paidDate: "2025-01-01" } }),
      mortgageLoan({ sourceId: "other-loan", form1098SourceId: undefined, homeId: "second-home", homeUse: "second", interestPaid: "2000", lenderName: "Seller", lenderAddress: "1 Source Lane", lenderTaxId: "999-00-0001", balance: { method: "lender_average", amount: "100000", sourceReference: "Actual source" }, points: { method: "completed_amortization", deductibleAmountBeforeLimit: "400", unamortizedPointsAvailable: "1000", sourceTaxYear: 2025, worksheetReference: "Actual prior points", serviceFeesExcludedConfirmed: true, reportedOnCurrentForm1098: false } }),
    ]);
    const result = calculateFederalTax(input);
    const document = await fillScheduleA(input, result, blank);
    // 750000/1100000 ->.682; interest42000*.682=28644; points3400*.682=2319.
    // Printed unreported interest1364 and points273 leave reported29326.
    const form = document.getForm();
    expect(form.getTextField(SCHEDULE_A_FIELDS.line8a).getText()).toBe("29326");
    expect(form.getTextField(SCHEDULE_A_FIELDS.line8b).getText()).toBe("1364");
    expect(form.getTextField(SCHEDULE_A_FIELDS.line8c).getText()).toBe("273");
    expect(form.getTextField(SCHEDULE_A_FIELDS.line8e).getText()).toBe("30963");
    const scheduleA = result.scheduleA;
    if (!scheduleA) throw new Error("Missing synthetic Schedule A result");
    const tampered = { ...result, scheduleA: { ...scheduleA, lines: scheduleA.lines.map(line => line.form === "Sched A" && line.line === "8a" ? { ...line, value: line.value.plus(1) } : line) } };
    await expect(fillScheduleA(input, tampered, blank)).rejects.toThrow(/mortgage.*audit/i);
    const sourceMismatch = { ...input, form1098: input.form1098.map(source => ({ ...source, mortgageInterestReceived: new Decimal(source.mortgageInterestReceived).plus(1).toString() })) };
    await expect(fillScheduleA(sourceMismatch, result, blank)).rejects.toThrow(/reconcile.*Box1/i);
  });
});
