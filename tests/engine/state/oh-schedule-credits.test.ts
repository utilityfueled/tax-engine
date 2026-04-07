/**
 * Tests for Ohio Schedule of Credits — Nonrefundable credits.
 * Spec: spec/state/oh-schedule-credits.yaml
 */

import { describe, expect, it } from "vitest";
import {
  calculateOhioScheduleOfCredits,
  type OhioScheduleOfCreditsInput,
} from "@/engine/state/oh-schedule-credits.js";

/** Helper to create a minimal input, overriding specific fields. */
function makeInput(
  overrides: Partial<OhioScheduleOfCreditsInput> = {}
): OhioScheduleOfCreditsInput {
  return {
    taxYear: 2025,
    filingStatus: "single",
    federalAgi: 50000,
    taxBeforeCredits: 2000,
    magi: 50000,
    magiLessExemptions: 47850,
    exemptions: 1,
    ...overrides,
  };
}

describe("Ohio Schedule of Credits", () => {
  // -------------------------------------------------------------------------
  // Line 1 — Tax liability before credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 1 - tax liability flows from IT 1040", () => {
    const result = calculateOhioScheduleOfCredits(makeInput({ taxBeforeCredits: 3500 }));
    expect(result.line1_taxBeforeCredits.toNumber()).toBe(3500);
  });

  // -------------------------------------------------------------------------
  // Line 2 — Retirement income credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 2 - retirement income credit", () => {
    // Canonical test: $8,001+ retirement income at MAGI less exemptions < $100,000 → $200
    const result = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 10000, magiLessExemptions: 50000 })
    );
    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(200);
  });

  it("OH Schedule of Credits Line 2 - retirement income credit zero when no retirement income", () => {
    const result = calculateOhioScheduleOfCredits(makeInput());
    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 2 - retirement income credit tiers", () => {
    // $501 → $25
    const r1 = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 501, magiLessExemptions: 50000 })
    );
    expect(r1.line2_retirementIncomeCredit.toNumber()).toBe(25);

    // $1,501 → $50
    const r2 = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 1501, magiLessExemptions: 50000 })
    );
    expect(r2.line2_retirementIncomeCredit.toNumber()).toBe(50);

    // $3,001 → $80
    const r3 = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 3001, magiLessExemptions: 50000 })
    );
    expect(r3.line2_retirementIncomeCredit.toNumber()).toBe(80);

    // $5,001 → $130
    const r4 = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 5001, magiLessExemptions: 50000 })
    );
    expect(r4.line2_retirementIncomeCredit.toNumber()).toBe(130);

    // $8,001 → $200
    const r5 = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 8001, magiLessExemptions: 50000 })
    );
    expect(r5.line2_retirementIncomeCredit.toNumber()).toBe(200);
  });

  it("OH Schedule of Credits Line 2 - retirement income $500 exactly gets $0", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 500, magiLessExemptions: 50000 })
    );
    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 2 - retirement income credit disqualified at MAGI less exemptions $100,000", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 10000, magiLessExemptions: 100000 })
    );
    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 2 - retirement income credit qualifies at MAGI less exemptions $99,999", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ retirementIncome: 10000, magiLessExemptions: 99999 })
    );
    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(200);
  });

  it("OH Schedule of Credits Line 3 - lump sum retirement credit suppresses line 2", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        retirementIncome: 10000,
        lumpSumRetirementCredit: 350,
        magiLessExemptions: 50000,
      })
    );

    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(0);
    expect(result.line3_lumpSumRetirementCredit.toNumber()).toBe(350);
  });

  it("OH Schedule of Credits Line 3 - worksheet calculation suppresses line 2", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        retirementIncome: 10000,
        lumpSumRetirementRecipients: [{ age: 65, retirementIncome: 40000 }],
        magiLessExemptions: 50000,
      })
    );

    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(0);
    expect(result.line3_lumpSumRetirementCredit.toNumber()).toBe(1000);
  });

  it("OH Schedule of Credits Line 3 - worksheet result surfaces the future-year carryforward when line 3 exceeds current-year tax", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 620,
        retirementIncome: 10000,
        lumpSumRetirementRecipients: [{ age: 65, retirementIncome: 40000 }],
        magiLessExemptions: 50000,
      })
    );

    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(0);
    expect(result.line3_lumpSumRetirementCredit.toNumber()).toBe(1000);
    expect(
      result.lumpSumRetirementWorksheet?.line10_futureYearCredit.toNumber(),
    ).toBe(20);
  });

  // -------------------------------------------------------------------------
  // Line 4 — Senior citizen credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 4 - senior citizen credit", () => {
    // Canonical test: age 65+ with MAGI less exemptions below $100,000 → $50
    const result = calculateOhioScheduleOfCredits(
      makeInput({ isSenior: true, magiLessExemptions: 60000 })
    );
    expect(result.line4_seniorCitizenCredit.toNumber()).toBe(50);
  });

  it("OH Schedule of Credits Line 4 - senior citizen credit $50 when 65+", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ isSenior: true, magiLessExemptions: 50000 })
    );
    expect(result.line4_seniorCitizenCredit.toNumber()).toBe(50);
  });

  it("OH Schedule of Credits Line 4 - senior citizen credit $0 when under 65", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ isSenior: false, magiLessExemptions: 50000 })
    );
    expect(result.line4_seniorCitizenCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 4 - senior citizen credit $0 when MAGI less exemptions >= $100,000", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ isSenior: true, magiLessExemptions: 100000 })
    );
    expect(result.line4_seniorCitizenCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 5 - worksheet calculation suppresses line 4", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        isSenior: true,
        lumpSumDistributionRecipientAges: [70],
        magiLessExemptions: 50000,
      })
    );

    expect(result.line4_seniorCitizenCredit.toNumber()).toBe(0);
    expect(result.line5_lumpSumDistributionCredit.toNumber()).toBe(800);
  });

  // -------------------------------------------------------------------------
  // Line 6 — Child and dependent care credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 6 - child and dependent care credit", () => {
    // Canonical test: MAGI < $20,000 → full qualifying expenses
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        magi: 15000,
        magiLessExemptions: 12600,
        federal2441Line9c: 2000,
        federal2441Line11: 400,
      })
    );
    expect(result.line6_childDependentCareCredit.toNumber()).toBe(2000);
  });

  it("OH Schedule of Credits Line 6 - child and dependent care credit at low MAGI", () => {
    // MAGI < $20,000: credit = federal 2441 line 9c
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        magi: 18000,
        magiLessExemptions: 15600,
        federal2441Line9c: 3000,
        federal2441Line11: 600,
      })
    );
    expect(result.line6_childDependentCareCredit.toNumber()).toBe(3000);
  });

  it("OH Schedule of Credits Line 6 - child and dependent care credit at mid MAGI", () => {
    // MAGI $20,000–$39,999: credit = 25% of federal 2441 line 11
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        magi: 30000,
        magiLessExemptions: 27850,
        federal2441Line9c: 3000,
        federal2441Line11: 600,
      })
    );
    expect(result.line6_childDependentCareCredit.toNumber()).toBe(150); // 25% × $600
  });

  it("OH Schedule of Credits Line 6 - child and dependent care credit $0 at MAGI $40,000", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        magi: 40000,
        federal2441Line9c: 3000,
        federal2441Line11: 600,
      })
    );
    expect(result.line6_childDependentCareCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 6 - MAGI exactly $20,000 gets 25% rate", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        magi: 20000,
        magiLessExemptions: 17600,
        federal2441Line9c: 3000,
        federal2441Line11: 800,
      })
    );
    expect(result.line6_childDependentCareCredit.toNumber()).toBe(200); // 25% × $800
  });

  // -------------------------------------------------------------------------
  // Line 7 — Displaced worker training credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 7 - displaced worker training credit", () => {
    // Canonical test: $1,200 expenses → min($500, 50% × $1,200) = min($500, $600) = $500
    const result = calculateOhioScheduleOfCredits(
      makeInput({ displacedWorkerExpenses: 1200 })
    );
    expect(result.line7_displacedWorkerCredit.toNumber()).toBe(500);
  });

  it("OH Schedule of Credits Line 7 - displaced worker training credit basic", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ displacedWorkerExpenses: 800 })
    );
    // 50% × $800 = $400, min($500, $400) = $400
    expect(result.line7_displacedWorkerCredit.toNumber()).toBe(400);
  });

  it("OH Schedule of Credits Line 7 - displaced worker training credit capped at $500", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ displacedWorkerExpenses: 2000 })
    );
    // 50% × $2,000 = $1,000, min($500, $1,000) = $500
    expect(result.line7_displacedWorkerCredit.toNumber()).toBe(500);
  });

  it("OH Schedule of Credits Line 7 - displaced worker credit reduced by prior year claim", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ displacedWorkerExpenses: 2000, priorYearDisplacedWorkerCredit: 300 })
    );
    // 50% × $2,000 = $1,000 → capped at $500 → minus $300 = $200
    expect(result.line7_displacedWorkerCredit.toNumber()).toBe(200);
  });

  it("OH Schedule of Credits Line 7 - displaced worker worksheet allows separate taxpayer and spouse credits", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        displacedWorkerRecipients: [
          { expenses: 1200, priorYearCredit: 0 },
          { expenses: 800, priorYearCredit: 0 },
        ],
      })
    );
    // Taxpayer: min($500, 50% × $1,200) = $500
    // Spouse: min($500, 50% × $800) = $400
    expect(result.line7_displacedWorkerCredit.toNumber()).toBe(900);
  });

  it("OH Schedule of Credits Line 7 - displaced worker worksheet applies prior year credit per recipient", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        displacedWorkerRecipients: [
          { expenses: 2000, priorYearCredit: 300 },
          { expenses: 600, priorYearCredit: 50 },
        ],
      })
    );
    // Taxpayer: min($500, $1,000) - $300 = $200
    // Spouse: min($500, $300) - $50 = $250
    expect(result.line7_displacedWorkerCredit.toNumber()).toBe(450);
  });

  // -------------------------------------------------------------------------
  // Line 8 — Campaign contribution credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 8 - campaign contribution credit", () => {
    // Canonical test: MFJ with $80 contribution → min($100, $80) = $80
    const result = calculateOhioScheduleOfCredits(
      makeInput({ filingStatus: "married_filing_jointly", campaignContributions: 80 })
    );
    expect(result.line8_campaignContributionCredit.toNumber()).toBe(80);
  });

  it("OH Schedule of Credits Line 8 - campaign contribution credit single filer", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ filingStatus: "single", campaignContributions: 75 })
    );
    // Capped at $50 for single
    expect(result.line8_campaignContributionCredit.toNumber()).toBe(50);
  });

  it("OH Schedule of Credits Line 8 - campaign contribution credit MFJ", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ filingStatus: "married_filing_jointly", campaignContributions: 75 })
    );
    // Capped at $100 for MFJ
    expect(result.line8_campaignContributionCredit.toNumber()).toBe(75);
  });

  it("OH Schedule of Credits Line 8 - campaign contribution credit MFJ capped at $100", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ filingStatus: "married_filing_jointly", campaignContributions: 200 })
    );
    expect(result.line8_campaignContributionCredit.toNumber()).toBe(100);
  });

  it("OH Schedule of Credits Line 8 - campaign contribution credit defaults to $0", () => {
    const result = calculateOhioScheduleOfCredits(makeInput());
    expect(result.line8_campaignContributionCredit.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 9 — Exemption credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 9 - exemption credit", () => {
    // Canonical test: MAGI less exemptions < $30,000, 2 exemptions → $20 × 2 = $40
    const result = calculateOhioScheduleOfCredits(
      makeInput({ magiLessExemptions: 20000, exemptions: 2 })
    );
    expect(result.line9_exemptionCredit.toNumber()).toBe(40);
  });

  it("OH Schedule of Credits Line 9 - exemption credit at low MAGI", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ magiLessExemptions: 25000, exemptions: 3 })
    );
    // $20 × 3 = $60
    expect(result.line9_exemptionCredit.toNumber()).toBe(60);
  });

  it("OH Schedule of Credits Line 9 - exemption credit $0 at MAGI less exemptions $30,000", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ magiLessExemptions: 30000, exemptions: 3 })
    );
    expect(result.line9_exemptionCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 9 - exemption credit qualifies at $29,999", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ magiLessExemptions: 29999, exemptions: 2 })
    );
    expect(result.line9_exemptionCredit.toNumber()).toBe(40); // $20 × 2
  });

  // -------------------------------------------------------------------------
  // Line 10 — Total first-batch credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 10 - total first-batch credits", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        retirementIncome: 10000,
        isSenior: true,
        magiLessExemptions: 25000,
        exemptions: 2,
        taxBeforeCredits: 5000,
      })
    );
    // Retirement = $200, Senior = $50, Exemption = $40
    // Total = $290
    expect(result.line10_totalFirstBatch.toNumber()).toBe(290);
  });

  // -------------------------------------------------------------------------
  // Line 11 — Tax less first-batch credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 11 - tax less first-batch credits", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 1000,
        retirementIncome: 10000,
        isSenior: true,
        magiLessExemptions: 25000,
        exemptions: 2,
      })
    );
    // First batch = $290 (retirement $200 + senior $50 + exemption $40)
    // Line 11 = max(0, $1,000 - $290) = $710
    expect(result.line11_taxLessFirstBatch.toNumber()).toBe(710);
  });

  it("OH Schedule of Credits Line 11 - floors at zero when credits exceed tax", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 100,
        retirementIncome: 10000,
        magiLessExemptions: 25000,
        exemptions: 2,
      })
    );
    // First batch = $240 (retirement $200 + exemption $40), tax = $100
    // Line 11 = max(0, $100 - $240) = $0
    expect(result.line11_taxLessFirstBatch.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 12 — Joint filing credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 12 - joint filing credit", () => {
    // Canonical test: MFJ, MAGI less exemptions $40,000 (15% tier), line 11 = $4,000
    // 15% × $4,000 = $600, min($650, $600) = $600
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 40000,
        taxBeforeCredits: 4000,
        exemptions: 0, // no exemption credit to keep math clean
        bothSpousesHaveQualifyingIncome: true,
      })
    );
    expect(result.line12_jointFilingCredit.toNumber()).toBe(600);
  });

  it("OH Schedule of Credits Line 12 - joint filing credit for MFJ at low MAGI", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 20000,
        taxBeforeCredits: 500,
        exemptions: 2, // taxpayer + spouse
        bothSpousesHaveQualifyingIncome: true,
      })
    );
    // First batch credits: exemption $40 (MAGI less exemptions < $30,000, 2 exemptions × $20)
    // Line 11 = max(0, $500 - $40) = $460
    // 20% × $460 = $92, min($650, $92) = $92
    expect(result.line12_jointFilingCredit.toNumber()).toBe(92);
  });

  it("OH Schedule of Credits Line 12 - joint filing credit capped at $650", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 20000,
        taxBeforeCredits: 20000,
        bothSpousesHaveQualifyingIncome: true,
      })
    );
    // First batch: exemption = $20 (1 exemption, MAGI less exemptions < $30,000)
    // Line 11 = max(0, $20,000 - $20) = $19,980
    // 20% × $19,980 = $3,996 → capped at $650
    expect(result.line12_jointFilingCredit.toNumber()).toBe(650);
  });

  it("OH Schedule of Credits Line 12 - joint filing credit $0 for single filer", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "single",
        taxBeforeCredits: 5000,
        bothSpousesHaveQualifyingIncome: false,
      })
    );
    expect(result.line12_jointFilingCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 12 - joint filing credit $0 when MAGI less exemptions >= $750,000", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 750000,
        taxBeforeCredits: 20000,
        bothSpousesHaveQualifyingIncome: true,
      })
    );
    expect(result.line12_jointFilingCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 12 - joint filing credit tiers", () => {
    const base = {
      filingStatus: "married_filing_jointly" as const,
      taxBeforeCredits: 10000,
      bothSpousesHaveQualifyingIncome: true,
      exemptions: 0,
    };

    // $25,000 → 20%
    const r1 = calculateOhioScheduleOfCredits(makeInput({ ...base, magiLessExemptions: 25000 }));
    expect(r1.line12_jointFilingCredit.toNumber()).toBe(650); // 20% × $10,000 = $2,000 → capped $650

    // $25,001 → 15%
    const r2 = calculateOhioScheduleOfCredits(makeInput({ ...base, magiLessExemptions: 25001 }));
    expect(r2.line12_jointFilingCredit.toNumber()).toBe(650); // 15% × $10,000 = $1,500 → capped $650

    // $50,001 → 10%
    const r3 = calculateOhioScheduleOfCredits(makeInput({ ...base, magiLessExemptions: 50001 }));
    expect(r3.line12_jointFilingCredit.toNumber()).toBe(650); // 10% × $10,000 = $1,000 → capped $650

    // $75,001 → 5%
    const r4 = calculateOhioScheduleOfCredits(makeInput({ ...base, magiLessExemptions: 75001 }));
    expect(r4.line12_jointFilingCredit.toNumber()).toBe(500); // 5% × $10,000 = $500
  });

  it("OH Schedule of Credits Line 12 - joint filing credit $0 without qualifying income", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 40000,
        taxBeforeCredits: 5000,
        bothSpousesHaveQualifyingIncome: false,
      })
    );
    expect(result.line12_jointFilingCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 12 - explicit spouse qualifying income overrides boolean proxy", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 40000,
        taxBeforeCredits: 4000,
        exemptions: 0,
        bothSpousesHaveQualifyingIncome: true,
        primaryQualifyingIncome: 800,
        spouseQualifyingIncome: 499,
      })
    );
    expect(result.line12_jointFilingCredit.toNumber()).toBe(0);
  });

  it("OH Schedule of Credits Line 12 - explicit spouse qualifying income of $500 each qualifies", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        magiLessExemptions: 40000,
        taxBeforeCredits: 4000,
        exemptions: 0,
        bothSpousesHaveQualifyingIncome: false,
        primaryQualifyingIncome: 500,
        spouseQualifyingIncome: 500,
      })
    );
    expect(result.line12_jointFilingCredit.toNumber()).toBe(600);
  });

  // -------------------------------------------------------------------------
  // Line 13 — Earned income credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 13 - earned income credit", () => {
    // Canonical test: 30% of $3,500 federal EIC = $1,050
    const result = calculateOhioScheduleOfCredits(
      makeInput({ federalEarnedIncomeCredit: 3500 })
    );
    expect(result.line13_earnedIncomeCredit.toNumber()).toBe(1050);
  });

  it("OH Schedule of Credits Line 13 - earned income credit is 30% of federal EIC", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ federalEarnedIncomeCredit: 2000 })
    );
    expect(result.line13_earnedIncomeCredit.toNumber()).toBe(600); // 30% × $2,000
  });

  it("OH Schedule of Credits Line 13 - earned income credit rounds to nearest dollar", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ federalEarnedIncomeCredit: 1001 })
    );
    // 30% × $1,001 = $300.30 → rounds to $300
    expect(result.line13_earnedIncomeCredit.toNumber()).toBe(300);
  });

  it("OH Schedule of Credits Line 13 - earned income credit $0 when no federal EIC", () => {
    const result = calculateOhioScheduleOfCredits(makeInput());
    expect(result.line13_earnedIncomeCredit.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Line 14 — Home school expenses credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 14 - home school expenses credit", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ homeSchoolExpenses: 400, homeSchoolQualifyingStudents: 1 })
    );
    expect(result.line14_homeSchoolExpensesCredit.toNumber()).toBe(250);
  });

  it("OH Schedule of Credits Line 14 - home school expenses credit capped per student", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ homeSchoolExpenses: 800, homeSchoolQualifyingStudents: 2 })
    );
    expect(result.line14_homeSchoolExpensesCredit.toNumber()).toBe(500);
  });

  it("OH Schedule of Credits Line 14 - home school expenses credit limited to expenses paid", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ homeSchoolExpenses: 180, homeSchoolQualifyingStudents: 2 })
    );
    expect(result.line14_homeSchoolExpensesCredit.toNumber()).toBe(180);
  });

  // -------------------------------------------------------------------------
  // Line 15 — Scholarship donation credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 15 - scholarship donation credit", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({ scholarshipDonations: 900 })
    );
    expect(result.line15_scholarshipDonationCredit.toNumber()).toBe(750);
  });

  it("OH Schedule of Credits Line 15 - scholarship donation credit MFJ cap is $1,500", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        scholarshipDonations: 1800,
      })
    );
    expect(result.line15_scholarshipDonationCredit.toNumber()).toBe(1500);
  });

  // -------------------------------------------------------------------------
  // Line 16 — Nonchartered, nonpublic school tuition credit
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 16 - nonchartered school tuition credit", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        federalAgi: 49000,
        noncharteredSchoolTuition: 1800,
      })
    );
    expect(result.line16_noncharteredSchoolTuitionCredit.toNumber()).toBe(1000);
  });

  it("OH Schedule of Credits Line 16 - federal AGI exactly $50,000 gets the $1,500 cap", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        federalAgi: 50000,
        noncharteredSchoolTuition: 1800,
      })
    );
    expect(result.line16_noncharteredSchoolTuitionCredit.toNumber()).toBe(1500);
  });

  it("OH Schedule of Credits Lines 17-35 - explicit pass-through credits flow to line 36", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 3000,
        workBasedLearningExperienceCredit: 10,
        ohioAdoptionCreditCarryforward: 20,
        nonrefundableJobRetentionCredit: 30,
        newEmployeesEnterpriseZoneCredit: 40,
        beginningFarmersFinancialManagementCredit: 50,
        commercialVehicleOperatorTrainingCredit: 60,
        welcomeHomeOhioCredit: 70,
        transformationalMixedUseDevelopmentCredit: 80,
        saleRentalAgriculturalAssetsBeginningFarmersCredit: 90,
        grapeProductionCredit: 100,
        investOhioCredit: 110,
        leadAbatementCredit: 120,
        opportunityZoneInvestmentCredit: 130,
        technologyInvestmentCreditCarryforward: 140,
        enterpriseZoneDayCareAndTrainingCredit: 150,
        researchAndDevelopmentCredit: 160,
        nonrefundableHistoricPreservationCredit: 170,
        ohioLowIncomeHousingCredit: 180,
        affordableSingleFamilyHousingCredit: 190,
      })
    );

    expect(result.line17_workBasedLearningExperienceCredit.toNumber()).toBe(10);
    expect(result.line18_ohioAdoptionCreditCarryforward.toNumber()).toBe(20);
    expect(result.line19_nonrefundableJobRetentionCredit.toNumber()).toBe(30);
    expect(result.line20_newEmployeesEnterpriseZoneCredit.toNumber()).toBe(40);
    expect(result.line21_beginningFarmersFinancialManagementCredit.toNumber()).toBe(50);
    expect(result.line22_commercialVehicleOperatorTrainingCredit.toNumber()).toBe(60);
    expect(result.line23_welcomeHomeOhioCredit.toNumber()).toBe(70);
    expect(result.line24_transformationalMixedUseDevelopmentCredit.toNumber()).toBe(80);
    expect(result.line25_saleRentalAgriculturalAssetsBeginningFarmersCredit.toNumber()).toBe(90);
    expect(result.line26_grapeProductionCredit.toNumber()).toBe(100);
    expect(result.line27_investOhioCredit.toNumber()).toBe(110);
    expect(result.line28_leadAbatementCredit.toNumber()).toBe(120);
    expect(result.line29_opportunityZoneInvestmentCredit.toNumber()).toBe(130);
    expect(result.line30_technologyInvestmentCreditCarryforward.toNumber()).toBe(140);
    expect(result.line31_enterpriseZoneDayCareAndTrainingCredit.toNumber()).toBe(150);
    expect(result.line32_researchAndDevelopmentCredit.toNumber()).toBe(160);
    expect(result.line33_nonrefundableHistoricPreservationCredit.toNumber()).toBe(170);
    expect(result.line34_ohioLowIncomeHousingCredit.toNumber()).toBe(180);
    expect(result.line35_affordableSingleFamilyHousingCredit.toNumber()).toBe(190);
    expect(result.line36_totalSecondBatch.toNumber()).toBe(1900);
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(1900);
  });

  it("OH Schedule of Credits Line 26 - grape production credit supports direct cost-based computation", () => {
    const computed = calculateOhioScheduleOfCredits(
      makeInput({
        grapeProductionQualifyingPropertyCost: 12345,
      })
    );

    expect(computed.line26_grapeProductionCredit.toNumber()).toBe(1235);

    const overridden = calculateOhioScheduleOfCredits(
      makeInput({
        grapeProductionCredit: 700,
        grapeProductionQualifyingPropertyCost: 12345,
      })
    );

    expect(overridden.line26_grapeProductionCredit.toNumber()).toBe(700);
  });

  // -------------------------------------------------------------------------
  // Line 36 — Total second-batch credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 36 - total second-batch credits", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        federalAgi: 50000,
        magiLessExemptions: 40000,
        taxBeforeCredits: 5000,
        federalEarnedIncomeCredit: 1000,
        homeSchoolExpenses: 400,
        homeSchoolQualifyingStudents: 1,
        scholarshipDonations: 2000,
        noncharteredSchoolTuition: 3000,
        bothSpousesHaveQualifyingIncome: true,
      })
    );
    // Joint filing: 15% × line11 (capped at $650)
    // EIC: 30% × $1,000 = $300
    // Home school: min($400, $250 × 1) = $250
    // Scholarship donation: min($2,000, $1,500 MFJ cap) = $1,500
    // Tuition: federal AGI $50,000 → min($3,000, $1,500) = $1,500
    // Line 11 = max(0, $5,000 - 0) = $5,000 (no first-batch credits for this input)
    // Joint filing: 15% × $5,000 = $750 → capped at $650
    // Line 36 = $650 + $300 + $250 + $1,500 + $1,500 = $4,200
    expect(result.line36_totalSecondBatch.toNumber()).toBe(4200);
  });

  // -------------------------------------------------------------------------
  // Line 37 — Tax less all nonrefundable credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 37 - tax less all credits", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 5000,
        magiLessExemptions: 60000,
      })
    );
    // No credits → line 37 = line 11 = $5,000
    expect(result.line37_taxLessAllCredits.toNumber()).toBe(5000);
  });

  // -------------------------------------------------------------------------
  // Lines 38-39 — Residency credits ordering
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 38 - nonresident credit capped at remaining tax", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 500,
        retirementIncome: 10000,
        magiLessExemptions: 50000,
        nonresidentCredit: 400,
      })
    );

    // Line 10 = $200 retirement credit, line 11 = $300, no second batch credits
    expect(result.line37_taxLessAllCredits.toNumber()).toBe(300);
    expect(result.line38_nonresidentCredit.toNumber()).toBe(300);
  });

  it("OH Schedule of Credits Line 39 - resident credit capped by remaining tax after line 38", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 500,
        retirementIncome: 10000,
        magiLessExemptions: 50000,
        nonresidentCredit: 100,
        residentCredit: 400,
      })
    );

    // Line 10 = $200, line 37 = $300, line 38 = $100, so only $200 remains for line 39
    expect(result.line37_taxLessAllCredits.toNumber()).toBe(300);
    expect(result.line38_nonresidentCredit.toNumber()).toBe(100);
    expect(result.line39_residentCredit.toNumber()).toBe(200);
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Line 40 — Total nonrefundable credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 40 - total nonrefundable credits capped at tax", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 100,
        retirementIncome: 10000,
        isSenior: true,
        magiLessExemptions: 25000,
        exemptions: 2,
        federalEarnedIncomeCredit: 5000,
      })
    );
    // Credits far exceed $100 tax → total capped at $100
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(100);
  });

  it("OH Schedule of Credits Line 40 - total nonrefundable credits with resident credit", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 5000,
        magiLessExemptions: 60000,
        residentCredit: 500,
      })
    );
    // No computed credits, just resident credit of $500
    // Line 40 = 0 + 0 + 0 + 500 = 500
    expect(result.line39_residentCredit.toNumber()).toBe(500);
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(500);
  });

  // -------------------------------------------------------------------------
  // Lines 41-47 — Refundable credits
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits Line 43 - pass-through entity credit passes through", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        passThroughEntityCredit: 875,
      })
    );
    expect(result.line43_passThroughEntityCredit.toNumber()).toBe(875);
  });

  it("OH Schedule of Credits Line 47 - refundable credits sum lines 41 through 46", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        refundableHistoricPreservationCredit: 100,
        refundableJobCreationCredit: 200,
        passThroughEntityCredit: 300,
        refundableMotionPictureCredit: 400,
        filmTheaterCapitalImprovementCredit: 500,
        ventureCapitalCredit: 600,
      })
    );
    expect(result.line41_refundableHistoricPreservationCredit.toNumber()).toBe(100);
    expect(result.line42_refundableJobCreationCredit.toNumber()).toBe(200);
    expect(result.line43_passThroughEntityCredit.toNumber()).toBe(300);
    expect(result.line44_refundableMotionPictureCredit.toNumber()).toBe(400);
    expect(result.line45_filmTheaterCapitalImprovementCredit.toNumber()).toBe(500);
    expect(result.line46_ventureCapitalCredit.toNumber()).toBe(600);
    expect(result.line47_totalRefundableCredits.toNumber()).toBe(2100);
  });

  // -------------------------------------------------------------------------
  // End-to-end scenarios
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits - MFJ family with earned income credit", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "married_filing_jointly",
        taxBeforeCredits: 1500,
        magi: 35000,
        magiLessExemptions: 25400,
        exemptions: 4,
        federalEarnedIncomeCredit: 3000,
        bothSpousesHaveQualifyingIncome: true,
      })
    );
    // First batch: exemption credit = $20 × 4 = $80 (MAGI less exemptions < $30,000)
    // Line 11 = max(0, $1,500 - $80) = $1,420
    // Joint filing: 20% × $1,420 = $284 (MAGI less exemptions $25,400, ≤ $25,000? No, > $25,000)
    // Actually $25,400 > $25,000 → 15% tier: 15% × $1,420 = $213
    // EIC: 30% × $3,000 = $900
    // Line 36 = $213 + $900 = $1,113
    // Line 37 = max(0, $1,420 - $1,113) = $307
    // Line 40 = min($1,500, $80 + $1,113) = min($1,500, $1,193) = $1,193
    expect(result.line9_exemptionCredit.toNumber()).toBe(80);
    expect(result.line11_taxLessFirstBatch.toNumber()).toBe(1420);
    expect(result.line12_jointFilingCredit.toNumber()).toBe(213);
    expect(result.line13_earnedIncomeCredit.toNumber()).toBe(900);
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(1193);
  });

  it("OH Schedule of Credits - senior retiree with low income", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        filingStatus: "single",
        taxBeforeCredits: 300,
        magi: 28000,
        magiLessExemptions: 25600,
        exemptions: 1,
        retirementIncome: 15000,
        isSenior: true,
      })
    );
    // Retirement income credit: $200 (MAGI less exemptions < $100,000, income $15,000 > $8,000)
    // Senior citizen credit: $50
    // Exemption credit: $20 × 1 = $20 (MAGI less exemptions < $30,000)
    // First batch = $270
    // Line 11 = max(0, $300 - $270) = $30
    // No second-batch credits
    // Line 40 = min($300, $270) = $270
    expect(result.line2_retirementIncomeCredit.toNumber()).toBe(200);
    expect(result.line4_seniorCitizenCredit.toNumber()).toBe(50);
    expect(result.line9_exemptionCredit.toNumber()).toBe(20);
    expect(result.line10_totalFirstBatch.toNumber()).toBe(270);
    expect(result.line11_taxLessFirstBatch.toNumber()).toBe(30);
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(270);
  });

  it("OH Schedule of Credits - credits wiped out at zero tax", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxBeforeCredits: 0,
        retirementIncome: 10000,
        isSenior: true,
        magiLessExemptions: 25000,
        exemptions: 2,
        federalEarnedIncomeCredit: 5000,
      })
    );
    // All nonrefundable credits capped at $0 tax
    expect(result.line40_totalNonrefundableCredits.toNumber()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Audit trail
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits - audit trail records key lines", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        workBasedLearningExperienceCredit: 15,
        affordableSingleFamilyHousingCredit: 25,
      })
    );
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("10");
    expect(lineNumbers).toContain("11");
    expect(lineNumbers).toContain("17");
    expect(lineNumbers).toContain("35");
    expect(lineNumbers).toContain("36");
    expect(lineNumbers).toContain("37");
    expect(lineNumbers).toContain("40");
    expect(lineNumbers).toContain("47");
    expect(result.lines.every((l) => l.form === "OH-SCHEDULE-CREDITS")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Error cases
  // -------------------------------------------------------------------------

  it("OH Schedule of Credits - unsupported tax year throws", () => {
    expect(() => calculateOhioScheduleOfCredits(makeInput({ taxYear: 2023 }))).toThrow(
      "Ohio Schedule of Credits constants not available for tax year 2023"
    );
  });

  it("OH Schedule of Credits - 2024 tax year is supported", () => {
    const result = calculateOhioScheduleOfCredits(makeInput({ taxYear: 2024 }));
    expect(result.line1_taxBeforeCredits).toBeDefined();
  });

  it("OH Schedule of Credits Line 14 - 2024 home school credit stays capped at $250 per return", () => {
    const result = calculateOhioScheduleOfCredits(
      makeInput({
        taxYear: 2024,
        homeSchoolExpenses: 600,
        homeSchoolQualifyingStudents: 3,
      })
    );
    expect(result.line14_homeSchoolExpensesCredit.toNumber()).toBe(250);
  });
});
