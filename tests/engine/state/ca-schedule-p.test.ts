/**
 * Tests for California Schedule P (540) supported Part III credit ordering.
 * Spec: spec/state/ca-schedule-p.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCASchedulePSupportedCredits } from "@/engine/state/ca-schedule-p.js";

const d = (value: string | number) => new Decimal(value);

describe("California Schedule P (540) supported Part III credit ordering", () => {
  it("CA Schedule P Part III Line 1 - the supported ordering starts from Form 540 line 35 tax before credits", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(5583),
      taxYear: 2025,
    });

    expect(result.line1RegularTaxBeforeCredits.toNumber()).toBe(5583);
  });

  it("CA Schedule P Part III Line 5b - Section A1 credits are limited by excess tax", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(1000),
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

  it("CA Schedule P Part III Line 11c - Section B starts from tentative minimum tax plus the final Section A balance when line 3 is positive", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(1000),
      tentativeMinimumTax: d(900),
      line5ChildAndDependentCareCreditAmount: d(200),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(150),
      line16ChildAdoptionCostsCreditAmount: d(80),
      line16ChildAdoptionCostsWorksheetCarryover: d(20),
      taxYear: 2025,
    });

    expect(result.line11cSectionBStartingTaxBalance.toNumber()).toBe(900);
    expect(result.line12bJointCustodyHeadOfHouseholdCreditUsed.toNumber()).toBe(150);
    expect(result.line12cRemainingNetTax.toNumber()).toBe(750);
    expect(result.line16bChildAdoptionCostsCreditUsed.toNumber()).toBe(80);
    expect(result.line16dChildAdoptionCostsCarryover.toNumber()).toBe(20);
  });

  it("CA Schedule P Part III Line 12 through Line 16 - B1 credits reduce net tax before code 197", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(5583),
      line5ChildAndDependentCareCreditAmount: d(5000),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(610),
      line15RentersCreditAmount: d(60),
      line16ChildAdoptionCostsCreditAmount: d(2500),
      line16ChildAdoptionCostsWorksheetCarryover: d(2500),
      taxYear: 2025,
    });

    expect(result.line5bChildAndDependentCareCreditUsed.toNumber()).toBe(5000);
    expect(result.line11cSectionBStartingTaxBalance.toNumber()).toBe(583);
    expect(result.line12bJointCustodyHeadOfHouseholdCreditUsed.toNumber()).toBe(583);
    expect(result.line12cRemainingNetTax.toNumber()).toBe(0);
    expect(result.line15bRentersCreditUsed.toNumber()).toBe(0);
    expect(result.line16bChildAdoptionCostsCreditUsed.toNumber()).toBe(0);
    expect(result.line16dChildAdoptionCostsCarryover.toNumber()).toBe(5000);
  });

  it("CA Schedule P Part III Line 17 through Line 19 - additional B2 carryover credits consume net tax in order and preserve remaining carryovers", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(1000),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(100),
      line16ChildAdoptionCostsCreditAmount: d(50),
      line17Through19CarryoverCredits: [
        {
          code: "233",
          name: "California Competes Tax Credit",
          amount: d(700),
        },
        {
          code: "235",
          name: "College Access Tax Credit",
          amount: d(200),
          electedRefundableAmount: d(20),
        },
      ],
      taxYear: 2025,
    });

    const schedulePLine17d = result.lines.find((line) => line.form === "CA-P" && line.line === "17d");
    const schedulePLine18d = result.lines.find((line) => line.form === "CA-P" && line.line === "18d");

    expect(result.line17Through19CarryoverCredits).toHaveLength(2);
    expect(result.line17Through19CarryoverCredits[0]).toMatchObject({
      line: 17,
      code: "233",
      name: "California Competes Tax Credit",
    });
    expect(result.line17Through19CarryoverCredits[0].creditUsedThisYear.toNumber()).toBe(700);
    expect(result.line17Through19CarryoverCredits[0].remainingNetTax.toNumber()).toBe(150);
    expect(result.line17Through19CarryoverCredits[0].carryover.toNumber()).toBe(0);
    expect(result.line17Through19CarryoverCredits[1]).toMatchObject({
      line: 18,
      code: "235",
      name: "College Access Tax Credit",
    });
    expect(result.line17Through19CarryoverCredits[1].creditUsedThisYear.toNumber()).toBe(150);
    expect(result.line17Through19CarryoverCredits[1].remainingNetTax.toNumber()).toBe(0);
    expect(result.line17Through19CarryoverCredits[1].carryover.toNumber()).toBe(30);
    expect(schedulePLine17d?.value.toNumber()).toBe(0);
    expect(schedulePLine18d?.value.toNumber()).toBe(30);
  });

  it("CA Schedule P Part III Line 17 through Line 21 - additional B2 carryover credits can limit later code 187 and code 242 usage", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(1000),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(100),
      line16ChildAdoptionCostsCreditAmount: d(50),
      line17Through19CarryoverCredits: [
        {
          code: "233",
          name: "California Competes Tax Credit",
          amount: d(700),
        },
        {
          code: "235",
          name: "College Access Tax Credit",
          amount: d(200),
          electedRefundableAmount: d(20),
        },
      ],
      line20OtherStateTaxCreditAmount: d(300),
      line21PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    expect(result.line20bStartingNetTax.toNumber()).toBe(0);
    expect(result.line20bOtherStateTaxCreditUsed.toNumber()).toBe(0);
    expect(result.line20cRemainingNetTax.toNumber()).toBe(0);
    expect(result.line21bPassThroughEntityElectiveTaxCreditUsed.toNumber()).toBe(0);
    expect(result.line21dPassThroughEntityElectiveTaxCreditCarryover.toNumber()).toBe(400);
  });

  it("CA Schedule P Part III Line 20 and Line 21 - B3 and B4 credits follow the official order after supported B1 and B2 credits", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(1000),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(100),
      line16ChildAdoptionCostsCreditAmount: d(50),
      line20OtherStateTaxCreditAmount: d(300),
      line21PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    expect(result.line16cRemainingNetTax.toNumber()).toBe(850);
    expect(result.line20bOtherStateTaxCreditUsed.toNumber()).toBe(300);
    expect(result.line20cRemainingNetTax.toNumber()).toBe(550);
    expect(result.line21bPassThroughEntityElectiveTaxCreditUsed.toNumber()).toBe(400);
    expect(result.line21cRemainingNetTax.toNumber()).toBe(150);
    expect(result.line21dPassThroughEntityElectiveTaxCreditCarryover.toNumber()).toBe(0);
  });

  it("CA Schedule P Part III Line 20 and Line 21 - an upstream line 19 balance can limit B3 and push unused B4 credit into carryover", () => {
    const result = calculateCASchedulePSupportedCredits({
      regularTaxBeforeCredits: d(1000),
      line12JointCustodyHeadOfHouseholdCreditAmount: d(100),
      line16ChildAdoptionCostsCreditAmount: d(50),
      line19RemainingNetTaxBeforeOtherStateTaxCredit: d(200),
      line20OtherStateTaxCreditAmount: d(300),
      line21PassThroughEntityElectiveTaxCreditAmount: d(400),
      taxYear: 2025,
    });

    expect(result.line16cRemainingNetTax.toNumber()).toBe(850);
    expect(result.line20bOtherStateTaxCreditUsed.toNumber()).toBe(200);
    expect(result.line20cRemainingNetTax.toNumber()).toBe(0);
    expect(result.line21bPassThroughEntityElectiveTaxCreditUsed.toNumber()).toBe(0);
    expect(result.line21cRemainingNetTax.toNumber()).toBe(0);
    expect(result.line21dPassThroughEntityElectiveTaxCreditCarryover.toNumber()).toBe(400);
  });
});
