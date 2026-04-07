/**
 * Tests for NY IT-217 farmers' school tax credit.
 * Spec: spec/state/ny-it217-farmers-school-tax-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  calculateNYIT217,
  type NYIT217Input,
} from "@/engine/state/ny-it217-farmers-school-tax-credit.js";

function d(value: number | string): Decimal {
  return new Decimal(value);
}

function it217Input(overrides: Partial<NYIT217Input> = {}): NYIT217Input {
  return {
    taxYear: 2025,
    meetsQualifiedPropertyRequirement: true,
    meetsEligibleFarmerIncomeTest: true,
    directQualifiedAgriculturalAcreage: 0,
    passthroughQualifiedAgriculturalAcreage: 0,
    fiduciaryQualifiedAgriculturalAcreage: 0,
    qualifiedConservationAcreage: 0,
    directEligibleSchoolTaxes: 0,
    passthroughEligibleSchoolTaxes: 0,
    fiduciaryEligibleSchoolTaxes: 0,
    nyAdjustedGrossIncome: 0,
    newYorkCcorporationEntireNetIncomeShare: 0,
    passThroughCcorporationEntireNetIncomeShare: 0,
    principalPaidOnFarmIndebtedness: 0,
    ...overrides,
  };
}

describe("NY IT-217 farmers' school tax credit", () => {
  it("Line 1 through line 14 - direct acres, passthrough acres, and eligible taxes produce the preliminary credit", () => {
    const result = calculateNYIT217(it217Input({
      directQualifiedAgriculturalAcreage: 300,
      passthroughQualifiedAgriculturalAcreage: 120,
      fiduciaryQualifiedAgriculturalAcreage: 30,
      qualifiedConservationAcreage: 50,
      directEligibleSchoolTaxes: 9000,
      passthroughEligibleSchoolTaxes: 1500,
      fiduciaryEligibleSchoolTaxes: 500,
      nyAdjustedGrossIncome: 150000,
    }));

    expect(result.line4TotalQualifiedAgriculturalAcreage.equals(d(450))).toBe(true);
    expect(result.line5BaseAcreage.equals(d(400))).toBe(true);
    expect(result.line7HalfOfExcessAcreage.equals(d(25))).toBe(true);
    expect(result.line9AcreagePercentage.equals(d("0.9444"))).toBe(true);
    expect(result.line13TotalEligibleSchoolTaxes.equals(d(11000))).toBe(true);
    expect(result.line14PreliminaryCredit.equals(d("10388.4"))).toBe(true);
  });

  it("Line 5 - related-person allocation overrides the default equal-share base acreage", () => {
    const equalShare = calculateNYIT217(it217Input({
      hasRelatedPersonsOwnership: true,
      relatedPersonsGroupCount: 4,
      qualifiedConservationAcreage: 30,
    }));
    const allocated = calculateNYIT217(it217Input({
      hasRelatedPersonsOwnership: true,
      relatedPersonsGroupCount: 4,
      allocatedBaseAcreage: 140,
      qualifiedConservationAcreage: 30,
    }));

    expect(equalShare.line5BaseAcreage.equals(d(95))).toBe(true);
    expect(allocated.line5BaseAcreage.equals(d(140))).toBe(true);
  });

  it("Line 6 through line 9 - acreage percentage stays at 100% when acres do not exceed the base acreage amount", () => {
    const result = calculateNYIT217(it217Input({
      directQualifiedAgriculturalAcreage: 200,
      qualifiedConservationAcreage: 25,
      directEligibleSchoolTaxes: 6000,
      nyAdjustedGrossIncome: 150000,
    }));

    expect(result.line6ExcessAcreage.equals(d(0))).toBe(true);
    expect(result.line8AdjustedAcreage.equals(d(375))).toBe(true);
    expect(result.line9AcreagePercentage.equals(d(1))).toBe(true);
    expect(result.line14PreliminaryCredit.equals(d(6000))).toBe(true);
  });

  it("Line 19 - modified New York AGI over $200,000 phases down the credit", () => {
    const result = calculateNYIT217(it217Input({
      directQualifiedAgriculturalAcreage: 500,
      directEligibleSchoolTaxes: 10000,
      nyAdjustedGrossIncome: 250000,
    }));

    expect(result.line14PreliminaryCredit.equals(d(8500))).toBe(true);
    expect(result.line15ModifiedNewYorkAdjustedGrossIncome.equals(d(250000))).toBe(true);
    expect(result.line16ModifiedAgiExcess.equals(d(50000))).toBe(true);
    expect(result.line17PhaseoutPercentage.equals(d("0.5"))).toBe(true);
    expect(result.line18CreditReduction.equals(d(4250))).toBe(true);
    expect(result.line19FarmersSchoolTaxCredit.equals(d(4250))).toBe(true);
  });

  it("Line 19 - eligibility failures and the $300,000 ceiling reduce the credit to zero", () => {
    const propertyFailure = calculateNYIT217(it217Input({
      meetsQualifiedPropertyRequirement: false,
      directQualifiedAgriculturalAcreage: 500,
      directEligibleSchoolTaxes: 10000,
      nyAdjustedGrossIncome: 150000,
    }));
    const farmerFailure = calculateNYIT217(it217Input({
      meetsEligibleFarmerIncomeTest: false,
      directQualifiedAgriculturalAcreage: 500,
      directEligibleSchoolTaxes: 10000,
      nyAdjustedGrossIncome: 150000,
    }));
    const agiFailure = calculateNYIT217(it217Input({
      directQualifiedAgriculturalAcreage: 500,
      directEligibleSchoolTaxes: 10000,
      nyAdjustedGrossIncome: 300000,
    }));

    expect(propertyFailure.line19FarmersSchoolTaxCredit.equals(d(0))).toBe(true);
    expect(farmerFailure.line19FarmersSchoolTaxCredit.equals(d(0))).toBe(true);
    expect(agiFailure.line19FarmersSchoolTaxCredit.equals(d(0))).toBe(true);
  });

  it("rejects related-person ownership without either a group count or an allocated base acreage override", () => {
    expect(() =>
      calculateNYIT217(it217Input({
        hasRelatedPersonsOwnership: true,
      }))
    ).toThrow(
      "NY IT-217 related-person ownership requires either relatedPersonsGroupCount or allocatedBaseAcreage"
    );
  });

  it("rejects unsupported tax year", () => {
    expect(() =>
      calculateNYIT217(it217Input({
        taxYear: 2024,
      }))
    ).toThrow("NY IT-217 farmers' school tax credit not available for tax year 2024");
  });
});
