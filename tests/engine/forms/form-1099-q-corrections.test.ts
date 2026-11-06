/** Spec: spec/federal/form-1099-q-corrections.yaml. Synthetic actual custodian worksheets. */
import { expect, it } from "vitest";
import { Form1099QSchema } from "@/models/inputs.js";
import { calculateForm1099Q } from "@/engine/forms/form-1099-q.js";

import { returnedEducationSource as correction, educationCorrectionSummary as summary } from "../../fixtures/education-correction-source.js";

it("preserves unknown returned contribution source facts", () => {
  const source = correction({ returnedContributionNetIncome: undefined, returnedContributionNetIncomeConfirmed: undefined });
  expect(source.sourceFactsComplete).toBe(false);
  expect(Form1099QSchema.parse(source).sourceFactsComplete).toBe(false);
  expect(source.returnedContributionNetIncome).toBeUndefined();
  expect(source.returnedContributionNetIncomeConfirmed).toBeUndefined();
  expect(correction()).toHaveProperty("returnedContributionPrincipal", "1000");
  expect(() => calculateForm1099Q([source], summary(), { taxYear: 2026 })).toThrow(/actual|net income|reconcil/i);
});
it("taxes actual returned contribution earnings in their contribution year", () => {
  const result = calculateForm1099Q([correction()], summary(), { taxYear: 2026 });
  expect(result.taxableEarnings.toFixed()).toBe("100"); expect(result.penaltyExceptionAmount.toFixed()).toBe("100"); expect(result.netPenalty.toFixed()).toBe("0");
  expect(result.coverdellAccounts).toHaveLength(0);
  expect(result.returnedContributions[0]?.incomeTaxYear).toBe(2026);
  expect(result.returnedContributions[0]?.incomeAdjustment.toFixed()).toBe("100");
  expect(result.perDistribution[0]?.treatment).toBe("returned_contribution");
  for (const [netIncome, gross, expected] of [["0.49", "1000.49", "0"], ["0.50", "1000.50", "1"]]) {
    const cents = calculateForm1099Q([correction({ grossDistribution: gross, earnings: netIncome, returnedContributionNetIncome: netIncome })], summary(), { taxYear: 2026 });
    expect(cents.taxableEarnings.toFixed()).toBe(expected); expect(cents.netPenalty.toFixed()).toBe("0");
  }
});
it("separates current and following statement years from taxable income year", () => {
  const actual = correction({ taxYear: 2026, distributionCode: "3", distributionDate: "2026-05-31", returnedContributionTaxYear: 2025, returnedContributionDate: "2026-04-15", returnedContributionIncomePreviouslyReported: "40" });
  const current = calculateForm1099Q([actual], summary(), { taxYear: 2026 });
  expect(current.taxableEarnings.toFixed()).toBe("0"); expect(current.netPenalty.toFixed()).toBe("0");
  expect(current.returnedContributions[0]?.incomeAdjustment.toFixed()).toBe("60");
  const prior = calculateForm1099Q([actual], summary(2025), { taxYear: 2025 });
  expect(prior.taxableEarnings.toFixed()).toBe("100"); expect(prior.netPenalty.toFixed()).toBe("0");
  expect(prior.perDistribution[0]?.sourceTaxYear).toBe(2026);
  const nextStatement = correction({ taxYear: 2027, distributionCode: "3", distributionDate: "2027-05-31", returnedContributionIncomePreviouslyReported: "200" });
  const amended = calculateForm1099Q([nextStatement], summary(), { taxYear: 2026 });
  expect(amended.taxableEarnings.toFixed()).toBe("100"); expect(amended.returnedContributions[0]?.incomeAdjustment.toFixed()).toBe("-100");
});
it("preserves actual correction losses without inventing a deduction", () => {
  const source = correction({ grossDistribution: "980", earnings: "0", basis: "980", returnedContributionNetIncome: "-20" });
  const result = calculateForm1099Q([source], summary(), { taxYear: 2026 });
  expect(result.taxableEarnings.toFixed()).toBe("0"); expect(result.netPenalty.toFixed()).toBe("0");
  expect(result.returnedContributions[0]?.netIncome.toFixed()).toBe("-20");
  const notReported = calculateForm1099Q([correction({ earnings: undefined, basis: undefined })], summary(), { taxYear: 2026 });
  expect(notReported.taxableEarnings.toFixed()).toBe("100");
});
it("keeps returned contributions out of ordinary account and expense ratios", () => {
  const ordinary = Form1099QSchema.parse({ ...correction(), sourceId: "ordinary", distributionCode: "1", grossDistribution: "600", earnings: undefined, basis: undefined });
  const result = calculateForm1099Q([correction(), ordinary], summary(2026, { coverdellAccounts: [{ accountId: "esa1", priorYearBasis: "0", currentYearContributions: "1000", yearEndValue: "600", outstandingRollovers: "0", rolloverBasisReceived: "0" }] }), { taxYear: 2026 });
  expect(result.coverdellAccounts[0]?.earnings.toFixed()).toBe("100"); expect(result.coverdellAccounts[0]?.endingBasis.toFixed()).toBe("500");
  expect(result.taxableEarnings.toFixed()).toBe("200"); expect(result.netPenalty.toFixed()).toBe("10");
  expect(result.lines.find(line => line.form === "Pub970 WS6-3" && line.line === "esa1:G")?.value.toFixed()).toBe("600");
});
it("rejects missing inconsistent late and duplicated correction sources", () => {
  for (const changes of [{ returnedContributionNetIncomeConfirmed: undefined }, { returnedContributionBasisReconciled: false }, { returnedContributionPrincipal: undefined }, { returnedContributionIncomePreviouslyReported: undefined }, { returnedContributionOriginalAmount: "999" }, { returnedContributionDate: "2027-01-01" }, { grossDistribution: "1101" }, { earnings: "101", basis: "999" }, { earnings: "100", basis: undefined }, { accountType: "529" }, { recipientNotBeneficiary: true }, { isTrusteeToTrustee: true }]) {
    expect(() => calculateForm1099Q([correction(changes)], summary(), { taxYear: 2026 })).toThrow(/source|return|contribution|actual|Box|reconcil|beneficiary/i);
  }
  expect(() => calculateForm1099Q([correction({ taxYear: 2027, distributionCode: "3", distributionDate: "2027-05-31", returnedContributionDate: "2027-04-16" })], summary(), { taxYear: 2026 })).toThrow(/contribution date/);
  const late = correction({ taxYear: 2027, distributionCode: "3", distributionDate: "2027-06-01" });
  expect(() => calculateForm1099Q([late], summary(), { taxYear: 2026 })).toThrow(/June|timely|deadline/i);
  expect(() => calculateForm1099Q([correction(), correction({ sourceId: "return2" })], summary(), { taxYear: 2026 })).toThrow(/returned|exceed|contribution/i);
  const expense = { id: "e", beneficiaryId: "student1", category: "postsecondary_tuition", paidDate: "2026-01-15", amount: "100", refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true };
  expect(() => calculateForm1099Q([correction()], summary(2026, { expenses: [expense], allocations: [{ expenseId: "e", sourceId: "return1", amount: "100", creditAmount: "0" }] }), { taxYear: 2026 })).toThrow(/correction|returned/i);
});
