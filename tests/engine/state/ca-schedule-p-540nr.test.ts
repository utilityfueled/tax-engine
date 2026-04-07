/**
 * Tests for California Schedule P (540NR) supported Part III credit ordering.
 * Spec: spec/state/ca-schedule-p-540nr.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAScheduleP540NRSupportedCredits } from "@/engine/state/ca-schedule-p-540nr.js";

const d = (value: string | number) => new Decimal(value);

describe("California Schedule P (540NR) supported Part III credit ordering", () => {
  it("CA Schedule P (540NR) Part I Line 1 through Line 24 - the supported AMT worksheet computes California tentative minimum tax from direct Part I and Part II inputs", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(2113),
      line5ChildAndDependentCareCreditAmount: d(200),
      amtWorksheet: {
        filingStatus: "single",
        itemizedDeductions: false,
        standardDeduction: d(5540),
        taxableIncome: d(144460),
        californiaAdjustedGrossIncome: d(150000),
        regularTax: d(900),
      },
      taxYear: 2025,
    });

    expect(result.line14TotalAdjustmentsAndPreferences.toNumber()).toBe(5540);
    expect(result.line21AlternativeMinimumTaxableIncome.toNumber()).toBe(150000);
    expect(result.line22ExemptionAmount.toNumber()).toBe(92749);
    expect(result.line24TotalTentativeMinimumTax.toNumber()).toBe(4008);
    expect(result.line43CaliforniaTentativeMinimumTax.toNumber()).toBe(4005);
    expect(result.line45AlternativeMinimumTax.toNumber()).toBe(3105);
    expect(result.line2TentativeMinimumTax.toNumber()).toBe(4005);
    expect(result.line3ExcessTax.toNumber()).toBe(0);
    expect(result.line5bChildAndDependentCareCreditUsed.toNumber()).toBe(0);
    expect(result.line11cSectionBStartingTaxBalance.toNumber()).toBe(2113);
    expect(result.line22AlternativeMinimumTax.toNumber()).toBe(3105);
  });

  it("CA Schedule P (540NR) Part II Line 22 - married filing separately reaches a zero exemption at the 2025 full phaseout threshold", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(0),
      amtWorksheet: {
        filingStatus: "married_filing_separately",
        itemizedDeductions: false,
        taxableIncome: d(479188),
        californiaAdjustedGrossIncome: d(479188),
        regularTax: d(0),
      },
      taxYear: 2025,
    });

    expect(result.line21AlternativeMinimumTaxableIncome.toNumber()).toBe(479188);
    expect(result.line22ExemptionAmount.toNumber()).toBe(0);
    expect(result.line23TentativeMinimumTaxBase.toNumber()).toBe(479188);
    expect(result.line24TotalTentativeMinimumTax.toNumber()).toBe(33543);
    expect(result.line45AlternativeMinimumTax.toNumber()).toBe(result.line43CaliforniaTentativeMinimumTax.toNumber());
  });

  it("CA Schedule P (540NR) Part III Line 1 - the supported ordering starts from Form 540NR line 42 subtotal tax before credits", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(2059),
      taxYear: 2025,
    });

    expect(result.line1SubtotalTaxBeforeCredits.toNumber()).toBe(2059);
  });

  it("CA Schedule P (540NR) Part III Line 5b - Section A1 credits are limited by excess tax", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      tentativeMinimumTax: d(900),
      line5ChildAndDependentCareCreditAmount: d(200),
      taxYear: 2025,
    });

    expect(result.line2TentativeMinimumTax.toNumber()).toBe(900);
    expect(result.line3ExcessTax.toNumber()).toBe(100);
    expect(result.line5aChildAndDependentCareCreditAmount.toNumber()).toBe(200);
    expect(result.line5bChildAndDependentCareCreditUsed.toNumber()).toBe(100);
    expect(result.line5cRemainingExcessTax.toNumber()).toBe(0);
  });

  it("CA Schedule P (540NR) Part III Line 12 through Line 14 - line 54 prorates each supported special credit before the Schedule P limitation", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      tentativeMinimumTax: d(900),
      line5ChildAndDependentCareCreditAmount: d(50),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(610),
      line13DependentParentCreditAmount: d(610),
      line14SeniorHeadOfHouseholdCreditAmount: d(1860),
      creditPercentage: d("0.3333"),
      taxYear: 2025,
    });

    expect(result.line11cSectionBStartingTaxBalance.toNumber()).toBe(950);
    expect(result.line12aJointCustodyHeadOfHouseholdCreditAmount.toNumber()).toBe(203);
    expect(result.line13aDependentParentCreditAmount.toNumber()).toBe(203);
    expect(result.line14aSeniorHeadOfHouseholdCreditAmount.toNumber()).toBe(620);
    expect(result.line12bJointCustodyHeadOfHouseholdCreditUsed.toNumber()).toBe(203);
    expect(result.line13bDependentParentCreditUsed.toNumber()).toBe(203);
    expect(result.line14bSeniorHeadOfHouseholdCreditUsed.toNumber()).toBe(544);
    expect(result.line55TotalProratedCredits.toNumber()).toBe(950);
  });

  it("CA Schedule P (540NR) Part III Line 11c - Section B starts from tentative minimum tax plus the final Section A balance when line 3 is positive", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      tentativeMinimumTax: d(900),
      line5ChildAndDependentCareCreditAmount: d(200),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(150),
      creditPercentage: d(1),
      taxYear: 2025,
    });

    expect(result.line3ExcessTax.toNumber()).toBe(100);
    expect(result.line5bChildAndDependentCareCreditUsed.toNumber()).toBe(100);
    expect(result.line5cRemainingExcessTax.toNumber()).toBe(0);
    expect(result.line11cSectionBStartingTaxBalance.toNumber()).toBe(900);
    expect(result.line12bJointCustodyHeadOfHouseholdCreditUsed.toNumber()).toBe(150);
  });

  it("CA Schedule P (540NR) Part III Line 15 through Line 21 - additional special credits start after the renter's credit limitation", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      line15RentersCreditAmount: d(60),
      line16Through19CarryoverCredits: [
        {
          code: "197",
          name: "Child Adoption Costs",
          amount: d(500),
        },
      ],
      taxYear: 2025,
    });

    expect(result.line15bRentersCreditUsed.toNumber()).toBe(60);
    expect(result.line15cRemainingNetTax.toNumber()).toBe(940);
    expect(result.line16Through19CarryoverCredits[0].creditUsedThisYear.toNumber()).toBe(500);
    expect(result.line16Through19CarryoverCredits[0].remainingNetTax.toNumber()).toBe(440);
  });

  it("CA Schedule P (540NR) Part III Line 16 through Line 21 - additional B2 carryover credits consume net tax in order and preserve remaining carryovers", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      line15RentersCreditAmount: d(60),
      line16Through19CarryoverCredits: [
        {
          code: "197",
          name: "Child Adoption Costs",
          amount: d(500),
        },
        {
          code: "233",
          name: "California Competes Tax Credit",
          amount: d(200),
        },
        {
          code: "235",
          name: "College Access Tax Credit",
          amount: d(100),
        },
      ],
      line20OtherStateTaxCreditAmount: d(300),
      line21PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    const schedulePLine18d = result.lines.find((line) => line.form === "CA-P-540NR" && line.line === "18d");

    expect(result.line15bRentersCreditUsed.toNumber()).toBe(60);
    expect(result.line16Through19CarryoverCredits).toHaveLength(3);
    expect(result.line16Through19CarryoverCredits[0].line).toBe(16);
    expect(result.line16Through19CarryoverCredits[0].creditUsedThisYear.toNumber()).toBe(500);
    expect(result.line16Through19CarryoverCredits[1].line).toBe(17);
    expect(result.line16Through19CarryoverCredits[1].creditUsedThisYear.toNumber()).toBe(200);
    expect(result.line16Through19CarryoverCredits[2].line).toBe(18);
    expect(result.line16Through19CarryoverCredits[2].creditUsedThisYear.toNumber()).toBe(100);
    expect(result.line16Through19CarryoverCredits[2].carryover.toNumber()).toBe(0);
    expect(result.line20bOtherStateTaxCreditUsed.toNumber()).toBe(140);
    expect(result.line21bPassThroughEntityElectiveTaxCreditUsed.toNumber()).toBe(0);
    expect(result.line21dPassThroughEntityElectiveTaxCreditCarryover.toNumber()).toBe(400);
    expect(result.line60AdditionalSpecialCreditsUsed.toNumber()).toBe(940);
    expect(schedulePLine18d?.value.toNumber()).toBe(0);
  });

  it("CA Schedule P (540NR) Part III Line 16 through Line 21 - additional B2 carryover credits can limit code 187 and code 242 usage", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      line15RentersCreditAmount: d(60),
      line16Through19CarryoverCredits: [
        {
          code: "197",
          name: "Child Adoption Costs",
          amount: d(500),
        },
        {
          code: "233",
          name: "California Competes Tax Credit",
          amount: d(200),
        },
      ],
      line20OtherStateTaxCreditAmount: d(300),
      line21PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    expect(result.line20bStartingNetTax.toNumber()).toBe(240);
    expect(result.line20bOtherStateTaxCreditUsed.toNumber()).toBe(240);
    expect(result.line20cRemainingNetTax.toNumber()).toBe(0);
    expect(result.line21bPassThroughEntityElectiveTaxCreditUsed.toNumber()).toBe(0);
    expect(result.line21dPassThroughEntityElectiveTaxCreditCarryover.toNumber()).toBe(400);
  });

  it("CA Schedule P (540NR) Part III Line 16 through Line 19 - a source worksheet carryover is added to the unused current-year B2 credit", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      line15RentersCreditAmount: d(60),
      line16Through19CarryoverCredits: [
        {
          code: "197",
          name: "Child Adoption Costs",
          amount: d(2500),
          sourceWorksheetCarryoverAmount: d(2501),
        },
      ],
      taxYear: 2025,
    });

    expect(result.line16Through19CarryoverCredits).toHaveLength(1);
    expect(result.line16Through19CarryoverCredits[0].line).toBe(16);
    expect(result.line16Through19CarryoverCredits[0].creditUsedThisYear.toNumber()).toBe(940);
    expect(result.line16Through19CarryoverCredits[0].remainingNetTax.toNumber()).toBe(0);
    expect(result.line16Through19CarryoverCredits[0].carryover.toNumber()).toBe(4061);
    expect(result.line20bStartingNetTax.toNumber()).toBe(0);
  });

  it("CA Schedule P (540NR) Part III Line 25 - adjusted AMT remains after supported solar credit carryovers", () => {
    const result = calculateCAScheduleP540NRSupportedCredits({
      subtotalTaxBeforeCredits: d(1000),
      alternativeMinimumTax: d(300),
      line23SolarEnergyCreditCarryoverAmount: d(100),
      line24CommercialSolarEnergyCreditCarryoverAmount: d(250),
      taxYear: 2025,
    });

    expect(result.line22AlternativeMinimumTax.toNumber()).toBe(300);
    expect(result.line23bSolarEnergyCreditUsed.toNumber()).toBe(100);
    expect(result.line24bCommercialSolarEnergyCreditUsed.toNumber()).toBe(200);
    expect(result.line24dCommercialSolarEnergyCreditCarryover.toNumber()).toBe(50);
    expect(result.line25AdjustedAlternativeMinimumTax.toNumber()).toBe(0);
  });
});
