/**
 * Tests for Pennsylvania Working Pennsylvanians Tax Credit
 * Spec: spec/state/pa-working-pennsylvanians-tax-credit.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculatePAWorkingPennsylvaniansTaxCredit,
  type PAWorkingPennsylvaniansTaxCreditInput,
} from "@/engine/state/pa-working-pennsylvanians-tax-credit.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(
  overrides: Partial<PAWorkingPennsylvaniansTaxCreditInput> = {},
): PAWorkingPennsylvaniansTaxCreditInput {
  return {
    taxYear: 2025,
    paEarnedIncome: d(12000),
    federalEarnedIncomeCredit: d(0),
    isClaimedAsDependentOnAnotherFederalReturn: false,
    ...overrides,
  };
}

describe("Pennsylvania Working Pennsylvanians Tax Credit", () => {
  it("PA WPTC eligibility follows the federal EITC amount", () => {
    const zeroCredit = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(0),
    }));
    expect(zeroCredit.isEligible).toBe(false);
    expect(zeroCredit.credit.toNumber()).toBe(0);

    const positiveCredit = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(649),
    }));
    expect(positiveCredit.isEligible).toBe(true);
    expect(positiveCredit.credit.toNumber()).toBe(65);

    const dependentClaimant = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(649),
      isClaimedAsDependentOnAnotherFederalReturn: true,
    }));
    expect(dependentClaimant.isEligible).toBe(false);
    expect(dependentClaimant.credit.toNumber()).toBe(0);

    const noPAEarnedIncome = calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      paEarnedIncome: d(0),
      federalEarnedIncomeCredit: d(649),
    }));
    expect(noPAEarnedIncome.isEligible).toBe(false);
    expect(noPAEarnedIncome.credit.toNumber()).toBe(0);
  });

  it("PA WPTC credit equals 10 percent of federal EITC rounded to the nearest dollar", () => {
    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(649),
    })).credit.toNumber()).toBe(65);

    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(4328),
    })).credit.toNumber()).toBe(433);

    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(8046),
    })).credit.toNumber()).toBe(805);

    expect(calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      federalEarnedIncomeCredit: d(9000),
    })).credit.toNumber()).toBe(805);
  });

  it("PA WPTC throws for unsupported tax years", () => {
    expect(() => calculatePAWorkingPennsylvaniansTaxCredit(makeInput({
      taxYear: 2024,
      federalEarnedIncomeCredit: d(100),
    }))).toThrow("PA Working Pennsylvanians Tax Credit constants not available for tax year 2024");
  });
});
