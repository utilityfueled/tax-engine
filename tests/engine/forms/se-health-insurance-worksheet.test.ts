/**
 * Tests for Self-Employed Health Insurance Deduction Worksheet (Pub 535)
 * Spec: spec/federal/se-health-insurance-worksheet.yaml
 *
 * IRC §162(l) — Above-the-line deduction for health insurance premiums
 * paid by self-employed individuals.
 */

import { describe, expect, it } from "vitest";
import { calculateSEHealthInsuranceWorksheet } from "@/engine/forms/se-health-insurance-worksheet.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import Decimal from "decimal.js";

const d = (n: number | string) => new Decimal(n);
const constants = getConstants(2025);

// ── Line-by-line coverage ────────────────────────────────────────

describe("SE Health Insurance Worksheet line-by-line", () => {
  it("Line 1 - total medical/dental/vision premiums", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "9600",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.medicalDentalPremiums.toNumber()).toBe(9600);
  });

  it("Line 2 - LTC premiums capped by age (age 40 or under)", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "1000", attainedAge: 35 },
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 2025 limit for age 40 or under: $480
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(480);
  });

  it("Line 2 - LTC premiums capped by age (age 41-50)", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "2000", attainedAge: 45 },
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 2025 limit for age 41-50: $900
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(900);
  });

  it("Line 2 - LTC premiums capped by age (age 51-60)", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "3000", attainedAge: 55 },
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 2025 limit for age 51-60: $1,800
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(1800);
  });

  it("Line 2 - LTC premiums capped by age (age 61-70)", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "6000", attainedAge: 65 },
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 2025 limit for age 61-70: $4,810
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(4810);
  });

  it("Line 2 - LTC premiums capped by age (age 71+)", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "8000", attainedAge: 75 },
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 2025 limit for age 71+: $6,020
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(6020);
  });

  it("Line 2 - LTC premiums under age limit pass through fully", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "300", attainedAge: 35 },
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // $300 < $480 limit, so full amount allowed
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(300);
  });

  it("Line 2 - multiple covered persons each have independent age limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "1000", attainedAge: 35 },  // capped at 480
        { premiumsPaid: "2000", attainedAge: 55 },  // capped at 1800
      ],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 480 + 1800 = 2280
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(2280);
  });

  it("Line 3 - Medicare premiums (Part B + Part D + Medigap)", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [],
      medicarePartBPremiums: "2100",
      medicarePartDPremiums: "600",
      medigapPremiums: "3000",
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.medicarePremiums.toNumber()).toBe(5700);
  });

  it("Line 4 - total premiums sums all premium types", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "9600",
      longTermCareCoverages: [
        { premiumsPaid: "300", attainedAge: 50 },
      ],
      medicarePartBPremiums: "2100",
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // 9600 + 300 + 2100 = 12000
    expect(result.totalPremiums.toNumber()).toBe(12000);
  });

  it("Line 5 - eligible months tracked", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "9600",
      longTermCareCoverages: [],
      eligibleMonths: 8,
      netProfit: "100000",
    }, constants);

    expect(result.eligibleMonths).toBe(8);
  });

  it("Line 6 - full year eligible produces no proration", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.proratedPremiums.toNumber()).toBe(12000);
  });

  it("Line 6 - partial year prorates premiums", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [],
      eligibleMonths: 6,
      netProfit: "100000",
    }, constants);

    // 12000 × (6/12) = 6000
    expect(result.proratedPremiums.toNumber()).toBe(6000);
  });

  it("Line 6 - odd month count prorates and rounds", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "10000",
      longTermCareCoverages: [],
      eligibleMonths: 7,
      netProfit: "100000",
    }, constants);

    // 10000 × (7/12) = 5833.333... → rounds to 5833
    expect(result.proratedPremiums.toNumber()).toBe(5833);
  });

  it("Line 7 - net profit from business", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "75000",
    }, constants);

    expect(result.netProfit.toNumber()).toBe(75000);
  });

  it("Line 8 - deductible SE tax", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "75000",
      deductibleSETax: "5300",
    }, constants);

    expect(result.deductibleSETax.toNumber()).toBe(5300);
  });

  it("Line 9 - SE retirement contributions", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "75000",
      seRetirementContributions: "10000",
    }, constants);

    expect(result.seRetirementContributions.toNumber()).toBe(10000);
  });

  it("Line 10 - earned income limit equals net profit minus SE tax minus retirement", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "20000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "75000",
      deductibleSETax: "5300",
      seRetirementContributions: "10000",
    }, constants);

    // 75000 - 5300 - 10000 = 59700
    expect(result.earnedIncomeLimit.toNumber()).toBe(59700);
  });

  it("Line 10 - earned income limit floors at zero when business has loss", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "-5000",
    }, constants);

    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
  });

  it("Line 11 - deduction limited to prorated premiums when under earned income limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "8000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // Prorated premiums = 8000, earned income limit = 100000
    // Deduction = min(8000, 100000) = 8000
    expect(result.deductibleAmount.toNumber()).toBe(8000);
  });

  it("Line 11 - deduction limited to earned income limit when premiums exceed it", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "20000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "15000",
      deductibleSETax: "1060",
    }, constants);

    // Earned income limit = 15000 - 1060 = 13940
    // Deduction = min(20000, 13940) = 13940
    expect(result.deductibleAmount.toNumber()).toBe(13940);
  });

  it("Line 11 - no deduction when business has loss", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "-2000",
    }, constants);

    expect(result.deductibleAmount.toNumber()).toBe(0);
  });

  it("Excess premiums for Schedule A computed correctly", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "20000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "15000",
      deductibleSETax: "1060",
    }, constants);

    // Deduction = 13940, prorated premiums = 20000
    // Excess = 20000 - 13940 = 6060
    expect(result.excessForScheduleA.toNumber()).toBe(6060);
  });

  it("No excess when fully deductible", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "8000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });
});

// ── Edge cases ────────────────────────────────────────────────────

describe("SE Health Insurance Worksheet edge cases", () => {
  it("Zero eligible months produces zero deduction", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [],
      eligibleMonths: 0,
      netProfit: "100000",
    }, constants);

    expect(result.proratedPremiums.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
  });

  it("Single eligible month prorates to 1/12", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [],
      eligibleMonths: 1,
      netProfit: "100000",
    }, constants);

    // 12000 × (1/12) = 1000
    expect(result.proratedPremiums.toNumber()).toBe(1000);
    expect(result.deductibleAmount.toNumber()).toBe(1000);
  });

  it("Earned income limit exactly equals prorated premiums", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "10000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "10000",
    }, constants);

    expect(result.deductibleAmount.toNumber()).toBe(10000);
    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });

  it("Net profit exactly equals SE tax plus retirement — zero earned income limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "15000",
      deductibleSETax: "5000",
      seRetirementContributions: "10000",
    }, constants);

    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
    expect(result.excessForScheduleA.toNumber()).toBe(5000);
  });

  it("LTC age boundary: age 40 uses age40OrUnder limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "1000", attainedAge: 40 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(480);
  });

  it("LTC age boundary: age 41 uses age41to50 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "1000", attainedAge: 41 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(900);
  });

  it("LTC age boundary: age 50 uses age41to50 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "1000", attainedAge: 50 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(900);
  });

  it("LTC age boundary: age 51 uses age51to60 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "2000", attainedAge: 51 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(1800);
  });

  it("LTC age boundary: age 60 uses age51to60 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "2000", attainedAge: 60 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(1800);
  });

  it("LTC age boundary: age 61 uses age61to70 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "5000", attainedAge: 61 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(4810);
  });

  it("LTC age boundary: age 70 uses age61to70 limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "5000", attainedAge: 70 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(4810);
  });

  it("LTC age boundary: age 71 uses age71OrOlder limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [{ premiumsPaid: "6000", attainedAge: 71 }],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    // The unchanged 6,000 actual cost is below the published 6,020 cap.
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(6000);
  });

  it("Zero premiums produces zero deduction", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    expect(result.totalPremiums.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
  });

  it("No LTC coverages defaults to empty array and zero LTC", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      eligibleMonths: 12,
      netProfit: "50000",
    }, constants);

    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(5000);
  });
});

// ── Realistic scenarios ──────────────────────────────────────────

describe("SE Health Insurance Worksheet realistic scenarios", () => {
  it("Typical freelancer: family health plan, full year, high income", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "18000", // $1500/mo family plan
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "120000",
      deductibleSETax: "8478",
      seRetirementContributions: "15000",
    }, constants);

    // Earned income limit = 120000 - 8478 - 15000 = 96522
    // Deduction = min(18000, 96522) = 18000
    expect(result.earnedIncomeLimit.toNumber()).toBe(96522);
    expect(result.deductibleAmount.toNumber()).toBe(18000);
    expect(result.excessForScheduleA.toNumber()).toBe(0);
  });

  it("New freelancer: employer coverage first 6 months, self-employed last 6", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "6000", // $1000/mo for 6 months
      longTermCareCoverages: [],
      eligibleMonths: 6,
      netProfit: "45000", // half-year income
      deductibleSETax: "3180",
    }, constants);

    // Prorated = 6000 × (6/12) = 3000
    // Earned income limit = 45000 - 3180 = 41820
    // Deduction = min(3000, 41820) = 3000
    expect(result.proratedPremiums.toNumber()).toBe(3000);
    expect(result.deductibleAmount.toNumber()).toBe(3000);
  });

  it("Low-income freelancer: premiums exceed earned income limit", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "9600",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "8000",
      deductibleSETax: "565",
    }, constants);

    // Earned income limit = 8000 - 565 = 7435
    // Deduction = min(9600, 7435) = 7435
    // Excess = 9600 - 7435 = 2165
    expect(result.earnedIncomeLimit.toNumber()).toBe(7435);
    expect(result.deductibleAmount.toNumber()).toBe(7435);
    expect(result.excessForScheduleA.toNumber()).toBe(2165);
  });

  it("Retiree self-employed: Medicare premiums with LTC", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "0",
      longTermCareCoverages: [
        { premiumsPaid: "5500", attainedAge: 68 }, // capped at 4810
        { premiumsPaid: "5500", attainedAge: 66 }, // capped at 4810
      ],
      medicarePartBPremiums: "4176", // $174.70/mo × 2 spouses × 12
      medicarePartDPremiums: "720",  // $30/mo × 2 × 12
      medigapPremiums: "6000",       // $250/mo × 2 × 12
      eligibleMonths: 12,
      netProfit: "50000",
      deductibleSETax: "3533",
    }, constants);

    // LTC: 4810 + 4810 = 9620
    // Medicare: 4176 + 720 + 6000 = 10896
    // Total = 0 + 9620 + 10896 = 20516
    // Earned income limit = 50000 - 3533 = 46467
    // Deduction = min(20516, 46467) = 20516
    expect(result.longTermCarePremiumsAllowed.toNumber()).toBe(9620);
    expect(result.medicarePremiums.toNumber()).toBe(10896);
    expect(result.totalPremiums.toNumber()).toBe(20516);
    expect(result.deductibleAmount.toNumber()).toBe(20516);
  });

  it("Business loss: all premiums become excess for Schedule A", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "-5000",
    }, constants);

    expect(result.earnedIncomeLimit.toNumber()).toBe(0);
    expect(result.deductibleAmount.toNumber()).toBe(0);
    expect(result.excessForScheduleA.toNumber()).toBe(12000);
  });

  it("Spouse switches jobs mid-year: 4 months of employer coverage", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "14400", // full-year premiums paid
      longTermCareCoverages: [],
      eligibleMonths: 8, // 4 months ineligible due to spouse employer plan
      netProfit: "80000",
      deductibleSETax: "5654",
    }, constants);

    // Prorated = 14400 × (8/12) = 9600
    // Earned income limit = 80000 - 5654 = 74346
    // Deduction = min(9600, 74346) = 9600
    expect(result.proratedPremiums.toNumber()).toBe(9600);
    expect(result.deductibleAmount.toNumber()).toBe(9600);
  });

  it("All premium types combined with partial year", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "7200",
      longTermCareCoverages: [
        { premiumsPaid: "2000", attainedAge: 52 }, // capped at 1800
      ],
      medicarePartBPremiums: "0",
      medicarePartDPremiums: "0",
      medigapPremiums: "1800",
      eligibleMonths: 9,
      netProfit: "60000",
      deductibleSETax: "4240",
      seRetirementContributions: "5000",
    }, constants);

    // Total premiums = 7200 + 1800 + 1800 = 10800
    // Prorated = 10800 × (9/12) = 8100 (rounded)
    // Earned income limit = 60000 - 4240 - 5000 = 50760
    // Deduction = min(8100, 50760) = 8100
    expect(result.totalPremiums.toNumber()).toBe(10800);
    expect(result.proratedPremiums.toNumber()).toBe(8100);
    expect(result.deductibleAmount.toNumber()).toBe(8100);
  });
});

// ── Audit trail ──────────────────────────────────────────────────

describe("SE Health Insurance Worksheet audit trail", () => {
  it("Produces audit lines for all worksheet lines", () => {
    const result = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "12000",
      longTermCareCoverages: [
        { premiumsPaid: "1000", attainedAge: 55 },
      ],
      medicarePartBPremiums: "2088",
      eligibleMonths: 10,
      netProfit: "80000",
      deductibleSETax: "5654",
      seRetirementContributions: "8000",
    }, constants);

    expect(result.lines.length).toBeGreaterThanOrEqual(10);

    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("2");
    expect(lineNumbers).toContain("3");
    expect(lineNumbers).toContain("4");
    expect(lineNumbers).toContain("5");
    expect(lineNumbers).toContain("6");
    expect(lineNumbers).toContain("7");
    expect(lineNumbers).toContain("8");
    expect(lineNumbers).toContain("9");
    expect(lineNumbers).toContain("10");
    expect(lineNumbers).toContain("11");
  });

  it("Excess line only appears when excess exists", () => {
    const noExcess = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "5000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "100000",
    }, constants);

    const withExcess = calculateSEHealthInsuranceWorksheet({
      medicalDentalPremiums: "20000",
      longTermCareCoverages: [],
      eligibleMonths: 12,
      netProfit: "10000",
    }, constants);

    expect(noExcess.lines.some((l) => l.line === "excess")).toBe(false);
    expect(withExcess.lines.some((l) => l.line === "excess")).toBe(true);
  });
});

// ── Federal orchestrator integration ──────────────────────────────

describe("SE Health Insurance Worksheet federal integration", () => {
  it("Worksheet deduction flows through Schedule 1 Line 17 and reduces AGI", () => {

    // Freelancer with Schedule C income and the new worksheet
    const result = calculateFederalTax({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Alex",
          lastName: "Freelance",
          ssn: "111-22-3333",
          dateOfBirth: "1985-03-10",
          occupation: "Consultant",
        },
        address: { street: "1 Main St", city: "Portland", state: "OR", zip: "97201" },
        dependents: [],
      },
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [{ payer: "Client A", nonemployeeCompensation: "100000", federalWithheld: "0" }],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      seHealthInsuranceWorksheet: {
        medicalDentalPremiums: "12000",
        longTermCareCoverages: [
          { premiumsPaid: "800", attainedAge: 39 },
        ],
        eligibleMonths: 12,
        // netProfit, deductibleSETax omitted — engine fills from Schedule C/SE
      },
    });

    // The worksheet should produce a deduction that appears in the audit trail
    const sched1Line17 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "17"
    );
    expect(sched1Line17).toBeDefined();
    // 12000 medical + 480 LTC (800 capped at 480 for age ≤40) = 12480
    // This should be less than the earned income limit (Schedule C profit - SE tax deduction)
    // so the full prorated premiums should be deductible
    expect(sched1Line17!.value.toNumber()).toBe(12480);

    // AGI should include the deduction
    expect(result.agi.greaterThan(d(0))).toBe(true);

    // The worksheet audit lines should be in the result
    const worksheetLines = result.allLines.filter((l) => l.form === "SE Health Ins WS");
    expect(worksheetLines.length).toBeGreaterThanOrEqual(10);
  });

  it("Worksheet with 0 eligible months produces 0 deduction in federal return", () => {

    const result = calculateFederalTax({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Alex",
          lastName: "Freelance",
          ssn: "111-22-3333",
          dateOfBirth: "1985-03-10",
          occupation: "Consultant",
        },
        address: { street: "1 Main St", city: "Portland", state: "OR", zip: "97201" },
        dependents: [],
      },
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [{ payer: "Client A", nonemployeeCompensation: "80000", federalWithheld: "0" }],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      seHealthInsuranceWorksheet: {
        medicalDentalPremiums: "12000",
        eligibleMonths: 0, // employer coverage all year
      },
    });

    const sched1Line17 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "17"
    );
    expect(sched1Line17).toBeDefined();
    expect(sched1Line17!.value.toNumber()).toBe(0);
  });

  it("Manual selfEmployedHealthInsurance still works when worksheet not provided", () => {

    const result = calculateFederalTax({
      taxpayer: {
        taxYear: 2025,
        filingStatus: "single",
        primary: {
          firstName: "Alex",
          lastName: "Freelance",
          ssn: "111-22-3333",
          dateOfBirth: "1985-03-10",
          occupation: "Consultant",
        },
        address: { street: "1 Main St", city: "Portland", state: "OR", zip: "97201" },
        dependents: [],
      },
      w2s: [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [{ payer: "Client A", nonemployeeCompensation: "80000", federalWithheld: "0" }],
      form1099Misc: [],
      scheduleK1: [],
      form1098: [],
      form1095A: [],
      donations: [],
      adjustments: {
        selfEmployedHealthInsurance: "9600",
      },
    });

    const sched1Line17 = result.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "17"
    );
    expect(sched1Line17).toBeDefined();
    // Manual amount should be capped at net profit - SE tax deduction
    expect(sched1Line17!.value.toNumber()).toBeGreaterThan(0);
    expect(sched1Line17!.value.toNumber()).toBeLessThanOrEqual(9600);
  });
});
