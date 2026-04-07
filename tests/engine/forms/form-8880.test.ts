/**
 * Tests for Form 8880 retirement savings contributions credit.
 * Spec: spec/federal/form-8880.yaml
 */

import { describe, expect, it } from "vitest";
import {
  calculateForm8880,
  mergeW2RetirementContributionsIntoForm8880Input,
} from "@/engine/forms/form-8880.js";

describe("Form 8880 retirement savings contributions credit", () => {
  const jointEligibleResult = calculateForm8880({
    filingStatus: "married_filing_jointly",
    agi: "50000",
    taxYear: 2025,
    primaryDateOfBirth: "1988-04-12",
    spouseDateOfBirth: "1989-09-30",
    primaryElectiveDeferrals: "1500",
    primaryIraContributions: "300",
    primaryAbleContributions: "200",
    primaryRecentDistributions: "250",
    spouseElectiveDeferrals: "2200",
    spouseIraContributions: "400",
    spouseAbleContributions: "100",
    spouseRecentDistributions: "300",
    taxLiabilityBeforeCredit: "2400",
    priorNonrefundableCredits: "0",
  });

  const primaryIneligibleResult = calculateForm8880({
    filingStatus: "single",
    agi: "20000",
    taxYear: 2025,
    primaryDateOfBirth: "2008-06-15",
    primaryElectiveDeferrals: "1200",
    primaryIraContributions: "900",
    primaryRecentDistributions: "400",
    primaryIsFullTimeStudent: true,
    taxLiabilityBeforeCredit: "700",
    priorNonrefundableCredits: "0",
  });

  const limitedByRemainingTax = calculateForm8880({
    filingStatus: "single",
    agi: "20000",
    taxYear: 2025,
    primaryDateOfBirth: "1990-01-15",
    primaryElectiveDeferrals: "3000",
    taxLiabilityBeforeCredit: "600",
    priorNonrefundableCredits: "250",
  });

  it("Form 8880 Line 1a - primary IRA and ABLE contributions flow into the column total", () => {
    expect(jointEligibleResult.line1a.toNumber()).toBe(500);
  });

  it("Form 8880 Line 1b - spouse IRA and ABLE contributions flow into the joint-return column total", () => {
    expect(jointEligibleResult.line1b.toNumber()).toBe(500);
  });

  it("Form 8880 Line 2a - primary qualified plan contributions flow into the column total", () => {
    expect(jointEligibleResult.line2a.toNumber()).toBe(1500);
  });

  it("Form 8880 Line 2b - spouse qualified plan contributions flow into the joint-return column total", () => {
    expect(jointEligibleResult.line2b.toNumber()).toBe(2200);
  });

  it("Form 8880 Line 3a - primary contribution sources combine before the distribution reduction", () => {
    expect(jointEligibleResult.line3a.toNumber()).toBe(2000);
  });

  it("Form 8880 Line 3b - spouse contribution sources combine before the distribution reduction", () => {
    expect(jointEligibleResult.line3b.toNumber()).toBe(2700);
  });

  it("Form 8880 Line 4a - recent distributions reduce the primary taxpayer contribution base", () => {
    expect(jointEligibleResult.line4a.toNumber()).toBe(250);
  });

  it("Form 8880 Line 4b - recent distributions reduce the spouse contribution base", () => {
    expect(jointEligibleResult.line4b.toNumber()).toBe(300);
  });

  it("Form 8880 Line 5a - recent distributions cannot reduce the primary taxpayer below zero before the eligibility cap", () => {
    expect(primaryIneligibleResult.line5a.toNumber()).toBe(1700);
  });

  it("Form 8880 Line 5b - the spouse reduction column floors at zero on joint returns and stays blank otherwise", () => {
    expect(jointEligibleResult.line5b.toNumber()).toBe(2400);
    expect(limitedByRemainingTax.line5b.toNumber()).toBe(0);
  });

  it("Form 8880 Line 6a - ineligible taxpayers and the $2,000 cap limit the primary taxpayer column", () => {
    expect(primaryIneligibleResult.line6a.toNumber()).toBe(0);
    expect(limitedByRemainingTax.line6a.toNumber()).toBe(2000);
  });

  it("Form 8880 Line 6b - joint-return spouse contributions are capped at $2,000 only when the spouse is eligible", () => {
    const spouseDependent = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "45000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-05-20",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      spouseCanBeClaimedAsDependent: true,
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
    });

    expect(jointEligibleResult.line6b.toNumber()).toBe(2000);
    expect(spouseDependent.line5b.toNumber()).toBe(2000);
    expect(spouseDependent.line6b.toNumber()).toBe(0);
    expect(spouseDependent.line7.toNumber()).toBe(2000);
  });

  it("Form 8880 Line 2a - W-2 Box 12 retirement contributions default into the primary column when Line 2a is omitted", () => {
    const mergedInput = mergeW2RetirementContributionsIntoForm8880Input(
      {
        primaryRecentDistributions: "0",
      },
      [
        {
          employer: { name: "Main Street Co", ein: "12-3456789" },
          wages: "30000",
          federalWithheld: "2500",
          box12CodeD: "1200",
          box12CodeAA: "800",
          box12CodeS: "400",
        },
      ],
      "single"
    );
    const result = calculateForm8880({
      filingStatus: "single",
      agi: "30000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      taxLiabilityBeforeCredit: "1200",
      priorNonrefundableCredits: "0",
      ...mergedInput,
    });

    expect(mergedInput?.supportedW2PrimaryElectiveDeferrals).toBe("2400");
    expect(result.line2a.toNumber()).toBe(2400);
    const line2a = result.lines.find((line) => line.line === "2a");
    expect(String(line2a?.inputs["Supported W-2 Box 12 retirement contributions"])).toBe("2400");
  });

  it("Form 8880 Line 2b - owner-tagged W-2 Box 12 retirement contributions default into the spouse column when Line 2b is omitted", () => {
    const mergedInput = mergeW2RetirementContributionsIntoForm8880Input(
      {
        primaryRecentDistributions: "0",
        spouseRecentDistributions: "0",
      },
      [
        {
          employer: { name: "Primary Co", ein: "12-3456789" },
          accountHolder: "primary",
          wages: "32000",
          federalWithheld: "2600",
          box12CodeD: "1500",
        },
        {
          employer: { name: "Spouse Co", ein: "98-7654321" },
          accountHolder: "spouse",
          wages: "28000",
          federalWithheld: "2200",
          box12CodeE: "900",
          box12CodeBB: "600",
        },
      ],
      "married_filing_jointly"
    );
    const result = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "60000",
      taxYear: 2025,
      primaryDateOfBirth: "1988-04-12",
      spouseDateOfBirth: "1989-09-30",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
      ...mergedInput,
    });

    expect(mergedInput?.supportedW2PrimaryElectiveDeferrals).toBe("1500");
    expect(mergedInput?.supportedW2SpouseElectiveDeferrals).toBe("1500");
    expect(result.line2a.toNumber()).toBe(1500);
    expect(result.line2b.toNumber()).toBe(1500);
    const line2b = result.lines.find((line) => line.line === "2b");
    expect(String(line2b?.inputs["Supported W-2 Box 12 retirement contributions"])).toBe("1500");
  });

  it("Form 8880 Line 2b - untagged joint-return W-2 retirement contributions stay manual instead of being guessed into either spouse column", () => {
    const mergedInput = mergeW2RetirementContributionsIntoForm8880Input(
      {
        primaryRecentDistributions: "0",
        spouseRecentDistributions: "0",
      },
      [
        {
          employer: { name: "Joint Co", ein: "12-3456789" },
          wages: "52000",
          federalWithheld: "4200",
          box12CodeD: "2000",
          box12CodeEE: "500",
        },
      ],
      "married_filing_jointly"
    );
    const result = calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "52000",
      taxYear: 2025,
      primaryDateOfBirth: "1988-04-12",
      spouseDateOfBirth: "1989-09-30",
      taxLiabilityBeforeCredit: "2000",
      priorNonrefundableCredits: "0",
      ...mergedInput,
    });

    expect(mergedInput?.supportedW2PrimaryElectiveDeferrals).toBe("0");
    expect(mergedInput?.supportedW2SpouseElectiveDeferrals).toBe("0");
    expect(result.line2a.toNumber()).toBe(0);
    expect(result.line2b.toNumber()).toBe(0);
  });

  it("Form 8880 Line 7 - both spouse columns combine into the total eligible contribution base", () => {
    expect(jointEligibleResult.line7.toNumber()).toBe(3750);
  });

  it("Form 8880 Line 8 - the supported engine uses Form 1040 line 11a for the 2025 rate table input", () => {
    expect(jointEligibleResult.line8.toNumber()).toBe(50000);
  });

  it("Form 8880 Line 9 - 2025 line 8 thresholds switch the saver's credit rate at the exact boundary amounts", () => {
    expect(calculateForm8880({
      filingStatus: "single",
      agi: "23750",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    }).line9.toNumber()).toBe(0.5);
    expect(calculateForm8880({
      filingStatus: "single",
      agi: "25500",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    }).line9.toNumber()).toBe(0.2);
    expect(calculateForm8880({
      filingStatus: "head_of_household",
      agi: "59250",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    }).line9.toNumber()).toBe(0.1);
    expect(calculateForm8880({
      filingStatus: "married_filing_jointly",
      agi: "79001",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      spouseDateOfBirth: "1991-05-20",
      primaryElectiveDeferrals: "2000",
      spouseElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "1000",
      priorNonrefundableCredits: "0",
    }).line9.toNumber()).toBe(0);
  });

  it("Form 8880 Line 10 - the tentative saver's credit multiplies the eligible base by the applicable decimal", () => {
    expect(jointEligibleResult.line10.toNumber()).toBe(750);

    const roundsHalfDollarUp = calculateForm8880({
      filingStatus: "single",
      agi: "23750",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "1",
      taxLiabilityBeforeCredit: "10",
      priorNonrefundableCredits: "0",
    });

    expect(roundsHalfDollarUp.line7.toNumber()).toBe(1);
    expect(roundsHalfDollarUp.line9.toNumber()).toBe(0.5);
    expect(roundsHalfDollarUp.line10.toNumber()).toBe(1);
  });

  it("Form 8880 Line 11 - the remaining tax floor cannot go below zero", () => {
    const exhaustedTax = calculateForm8880({
      filingStatus: "single",
      agi: "20000",
      taxYear: 2025,
      primaryDateOfBirth: "1990-01-15",
      primaryElectiveDeferrals: "2000",
      taxLiabilityBeforeCredit: "200",
      priorNonrefundableCredits: "500",
    });

    expect(exhaustedTax.line11.toNumber()).toBe(0);
  });

  it("Form 8880 Line 12 - the final credit is limited by the remaining tax after earlier nonrefundable credits", () => {
    expect(limitedByRemainingTax.line10.toNumber()).toBe(1000);
    expect(limitedByRemainingTax.line11.toNumber()).toBe(350);
    expect(limitedByRemainingTax.line12.toNumber()).toBe(350);
  });
});
