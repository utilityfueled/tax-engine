// Specs: spec/federal/form-8995.yaml and spec/federal/form-8995-a.yaml.
// Only this fixture uses the unqualified 2026 rules through the full engine.
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const ptp = {
  partnershipName: "Synthetic Public Partnership",
  partnershipEIN: "12-3456789",
  ordinaryIncome: "0",
  selfEmploymentEarnings: "0",
  selfEmploymentNetEarningsAfterAdjustments: "0",
  selfEmploymentFactsConfirmed: true,
  selfEmploymentIncomeType: "nonfarm",
  section199APTPIsSST: false,
};

const carrySource = {
  sourceTaxYear: 2025,
  sourceForm: "form_8995",
  sourceReference: "Synthetic filed Form 8995 line 17",
  sourceFactsConfirmed: true,
  owner: "primary",
  amount: "4500",
} as const;

const detailedWagesAndEstimates = {
  w2s: [{ ...simpleW2Fixture.w2s[0], wages: "300000", socialSecurityWages: "184500" }],
  form2210: {
    calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false,
    waiverRequested: false, calculationMethod: "regular", withholdingMethod: "equal-installments",
    priorYearTaxStatus: "no-tax-liability", priorYearFullYear: true, priorYearResidentAllYear: true,
    priorYearTaxForForm2210: "0", priorYearTaxComputationConfirmed: true,
  },
};

function calculate2026(overrides: Record<string, unknown>) {
  return calculateFederalTax(TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    ...overrides,
  }));
}

describe("Federal separate REIT and PTP loss carryforward", () => {
  it("keeps a fully suspended PTP loss out of the section 199A carry and deduction", () => {
    const original = { ...ptp, isPassiveActivity: true, isPubliclyTradedPartnership: true,
      ordinaryIncome: "-300", section199AQualifiedPTPIncome: "-300" };
    const calculate = (section199APTPLossSource?: Record<string, unknown>) => calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "1000", section199ADividends: "1000" }],
      scheduleK1: [{ ...original, section199APTPLossSource }],
    }));
    expect(() => calculate()).toThrow(/confirmed.*PTP.*source/i);
    const source = { sourceTaxYear: 2025, sourceReference: "Synthetic PTP worksheet", sourceFactsConfirmed: true,
      currentStatementAmount: "-300", currentAllowedAmount: "0", priorAllowedLoss: "0", releasedPriorQualifiedLoss: "0" };
    expect(() => calculate({ ...source, currentAllowedAmount: "-300" })).toThrow(/reconcile/i);
    expect(() => calculate({ ...source, currentAllowedAmount: "0.01" })).toThrow(/reconcile/i);
    const result = calculate(source);
    expect(result.form8995?.reitPTPComponent.toFixed()).toBe("200");
    expect(result.carryforwards.reitPtpLossCarryforward.toFixed()).toBe("0");
    expect(result.carryforwards.suspendedPTPLosses.map(row => [row.partnershipName, row.amount.toFixed()]))
      .toEqual([[ptp.partnershipName, "300"]]);
  });

  it("uses the original qualifying part of a newly released passive loss once", () => {
    const original = { ...ptp, isPassiveActivity: true, isPubliclyTradedPartnership: true,
      ordinaryIncome: "1000", section199AQualifiedPTPIncome: "1000" };
    const calculate = (releasedPriorQualifiedLoss: string) => calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      scheduleK1: [{ ...original, section199APTPLossSource: {
        sourceTaxYear: 2025, sourceReference: "Synthetic prior and current PTP worksheets", sourceFactsConfirmed: true,
        currentStatementAmount: "1000", currentAllowedAmount: "1000", priorAllowedLoss: "500", releasedPriorQualifiedLoss,
      } }],
      priorYear: {
        suspendedPTPLosses: [{ partnershipName: ptp.partnershipName, amount: "500" }],
        reitPtpLossSource: { ...carrySource, sourceTaxYear: 2024, amount: "300" },
      },
    }));
    expect(() => calculate("500.01")).toThrow(/reconcile/i);
    const result = calculate("200");
    // $1,000 current minus $300 filed §199A carry and $200 originally qualifying passive release.
    expect(result.form8995?.priorYearReitPtpLoss.toFixed()).toBe("500");
    expect(result.form8995?.reitPTPComponent.toFixed()).toBe("100");
    expect(result.carryforwards.suspendedPTPLosses).toEqual([]);
  });

  it("holds a released loss with no current statement until its original qualification is confirmed", () => {
    const calculate = (section199APTPLossSource?: Record<string, unknown>) => calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "1000", section199ADividends: "1000" }],
      scheduleK1: [{ ...ptp, isPassiveActivity: true, isPubliclyTradedPartnership: true, ordinaryIncome: "1000", section199APTPLossSource }],
      priorYear: { suspendedPTPLosses: [{ partnershipName: ptp.partnershipName, amount: "500" }] },
    }));
    expect(() => calculate()).toThrow(/confirmed.*PTP.*source/i);
    const allowed = calculate({ sourceTaxYear: 2025, sourceReference: "Synthetic PTP release worksheets", sourceFactsConfirmed: true,
      currentStatementAmount: "0", currentAllowedAmount: "0", priorAllowedLoss: "500", releasedPriorQualifiedLoss: "500" });
    expect(allowed.form8995?.reitPTPComponent.toFixed()).toBe("100");
  });

  it("requires post-limitation proof for current PTP basis and at-risk suspensions", () => {
    for (const limit of [{ beginningBasis: "0" }, { atRiskAmount: "0" }]) {
      const calculate = (section199APTPLossSource?: Record<string, unknown>) => calculateFederalTax(TaxYearInputSchema.parse({
        ...simpleW2Fixture,
        form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "1000", section199ADividends: "1000" }],
        scheduleK1: [{ ...ptp, isPassiveActivity: true, isPubliclyTradedPartnership: true, ordinaryIncome: "-300",
          section199AQualifiedPTPIncome: "-300", ...limit, section199APTPLossSource }],
      }));
      expect(() => calculate()).toThrow(/confirmed.*PTP.*source/i);
      const source = { sourceTaxYear: 2025, sourceReference: "Synthetic PTP loss-limit worksheets", sourceFactsConfirmed: true,
        currentStatementAmount: "-300", currentAllowedAmount: "0", priorAllowedLoss: "0", releasedPriorQualifiedLoss: "0" };
      expect(() => calculate({ ...source, currentAllowedAmount: "0.01" })).toThrow(/reconcile/i);
      expect(calculate(source).form8995?.reitPTPComponent.toFixed()).toBe("200");
    }
  });

  it("holds a prior PTP basis loss even when no passive loss or current suspension triggers reconciliation", () => {
    expect(() => calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "1000", section199ADividends: "1000" }],
      scheduleK1: [{ ...ptp, isPassiveActivity: false, isPubliclyTradedPartnership: true,
        ordinaryIncome: "-100", section199AQualifiedPTPIncome: "-100", beginningBasis: "1000",
        priorSuspendedLosses: { ordinary: "300" } }],
    }))).toThrow(/separate qualification review/i);
  });

  it("reconciles a gross allowed nonpassive loss alongside unrelated guaranteed payments", () => {
    const calculate = (currentAllowedAmount: string) => calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "1000", section199ADividends: "1000" }],
      scheduleK1: [{ ...ptp, isPassiveActivity: false, isPubliclyTradedPartnership: true,
        ordinaryIncome: "-300", section199AQualifiedPTPIncome: "-300", guaranteedPayments: "500",
        distributions: "500", beginningBasis: "200", section199APTPLossSource: {
          sourceTaxYear: 2025, sourceReference: "Synthetic gross basis worksheet", sourceFactsConfirmed: true,
          currentStatementAmount: "-300", currentAllowedAmount, priorAllowedLoss: "0", releasedPriorQualifiedLoss: "0",
        } }],
    }));
    expect(() => calculate("-200.01")).toThrow(/reconcile/i);
    expect(() => calculate("-199.99")).toThrow(/reconcile/i);
    expect(calculate("-200").form8995?.reitPTPComponent.toFixed()).toBe("160");
  });

  it("holds a basis-limited qualified statement with mixed loss categories", () => {
    const calculate = (currentAllowedAmount: string) => calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "1000", section199ADividends: "1000" }],
      scheduleK1: [{ ...ptp, isPassiveActivity: false, isPubliclyTradedPartnership: true,
        ordinaryIncome: "-300", netLongTermCapitalGain: "-300", section199AQualifiedPTPIncome: "-300",
        beginningBasis: "200", section199APTPLossSource: {
          sourceTaxYear: 2025, sourceReference: "Synthetic mixed basis worksheet", sourceFactsConfirmed: true,
          currentStatementAmount: "-300", currentAllowedAmount, priorAllowedLoss: "0", releasedPriorQualifiedLoss: "0",
        } }],
    }));
    expect(() => calculate("-200")).toThrow(/mixed.*basis.*loss/i);
    expect(() => calculate("-100")).toThrow(/mixed.*basis.*loss/i);
  });

  it("preserves a 2025 simplified loss on a 2026 return with no current REIT or PTP income", () => {
    const prior = calculateFederalTax(TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      scheduleK1: [{ ...ptp, section199AQualifiedPTPIncome: "-4500" }],
    }));
    expect(prior.form8995?.reitPtpLossCarryforward.toFixed()).toBe("4500");
    expect(prior.carryforwards.qbiLossCarryforward.toFixed()).toBe("0");

    const current = calculate2026({ priorYear: { reitPtpLossSource: carrySource, qbiLossCarryforward: "1000" } });
    expect(current.form8995?.netReitPtpAmount.toFixed()).toBe("-4500");
    expect(current.form8995?.reitPTPComponent.toFixed()).toBe("0");
    expect(current.carryforwards.reitPtpLossCarryforward.toFixed()).toBe("4500");
    expect(current.carryforwards.qbiLossCarryforward.toFixed()).toBe("1000");
    expect(current.carryforwards.suspendedPTPLosses).toEqual([]);
    expect(current.agi.toFixed()).toBe(calculate2026({}).agi.toFixed());
  });

  it("applies a 2025 detailed loss to the combined 2026 detailed component", () => {
    const result = calculate2026({
      ...detailedWagesAndEstimates,
      form1099Div: [{ payer: "Synthetic Fund", ordinaryDividends: "6000", section199ADividends: "6000" }],
      scheduleK1: [{ ...ptp, section199AQualifiedPTPIncome: "4000", section199APTPW2Wages: "0", section199APTPUBIA: "0" }],
      priorYear: {
        reitPtpLossSource: { ...carrySource, sourceForm: "form_8995_a", sourceReference: "Synthetic filed Form 8995-A line 40", amount: "7500" },
      },
    });
    // Section 199A(b)(1)(B): ($6,000 + $4,000 − $7,500) × 20% = $500.
    expect(result.form8995A?.netReitPtpAmount.toFixed()).toBe("2500");
    expect(result.form8995A?.reitPTPComponent.toFixed()).toBe("500");
    expect(result.form8995A?.qbiDeduction.toFixed()).toBe("500");
    expect(result.carryforwards.reitPtpLossCarryforward.toFixed()).toBe("0");
  });

  it("holds a detailed 2026 PTP amount when its SSTB designation is missing", () => {
    expect(() => calculate2026({
      ...detailedWagesAndEstimates,
      scheduleK1: [{ ...ptp, section199AQualifiedPTPIncome: "4000", section199APTPIsSST: undefined }],
    })).toThrow(/actual SSTB designation/);
  });

  it("validates the actual source year and continuing ownership", () => {
    const calculate = (source: Record<string, unknown>) => calculate2026({ priorYear: { reitPtpLossSource: { ...carrySource, ...source } } });
    expect(() => calculate({ sourceTaxYear: 2024 })).toThrow(/preceding return year/i);
    expect(() => calculate({ sourceFactsConfirmed: false })).toThrow(/confirmed/i);
    expect(() => calculate({ owner: "joint", sameJointFilersConfirmed: true })).toThrow(/ownership/i);
    expect(() => calculate({ amount: "-0.01" })).toThrow(/nonnegative/i);
    const zero = calculate({ amount: "0" });
    expect(zero.carryforwards.reitPtpLossCarryforward.toFixed()).toBe("0");
    expect(zero.form8995).toBeUndefined();
  });
});
