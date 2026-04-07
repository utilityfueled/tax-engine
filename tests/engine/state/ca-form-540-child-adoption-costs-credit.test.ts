/**
 * Tests for California Form 540 Child Adoption Costs credit.
 * Spec: spec/state/ca-form-540-child-adoption-costs-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540ChildAdoptionCostsCredit } from "@/engine/state/ca-form-540-child-adoption-costs-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 Child Adoption Costs credit", () => {
  it("CA Form 540 Child Adoption Costs credit Line 1 - the worksheet starts from the total qualified adoption costs", () => {
    const result = calculateCAForm540ChildAdoptionCostsCredit({
      qualifiedAdoptionCosts: d(4200),
      adoptionDecreeFinalInTaxYear: true,
      childIsUsCitizenOrLegalResident: true,
      childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      taxYear: 2025,
    });

    expect(result.line1QualifiedAdoptionCosts.toNumber()).toBe(4200);
  });

  it("CA Form 540 Child Adoption Costs credit Line 2 - the 2025 worksheet uses a 50% credit rate", () => {
    const result = calculateCAForm540ChildAdoptionCostsCredit({
      qualifiedAdoptionCosts: d(4200),
      adoptionDecreeFinalInTaxYear: true,
      childIsUsCitizenOrLegalResident: true,
      childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      taxYear: 2025,
    });

    expect(result.line2Rate.toString()).toBe("0.5");
  });

  it("CA Form 540 Child Adoption Costs credit Line 3 - qualified costs are multiplied by 50 percent and rounded to whole dollars", () => {
    const result = calculateCAForm540ChildAdoptionCostsCredit({
      qualifiedAdoptionCosts: d(5001),
      adoptionDecreeFinalInTaxYear: true,
      childIsUsCitizenOrLegalResident: true,
      childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(true);
    expect(result.line3CreditBeforeCap.toNumber()).toBe(2501);
  });

  it("CA Form 540 Child Adoption Costs credit Line 4 - the current-year credit is capped at $2,500", () => {
    const result = calculateCAForm540ChildAdoptionCostsCredit({
      qualifiedAdoptionCosts: d(5001),
      adoptionDecreeFinalInTaxYear: true,
      childIsUsCitizenOrLegalResident: true,
      childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      taxYear: 2025,
    });

    expect(result.line4CurrentYearCredit.toNumber()).toBe(2500);
  });

  it("CA Form 540 Child Adoption Costs credit Line 5 - costs above the annual cap generate a carryover", () => {
    const result = calculateCAForm540ChildAdoptionCostsCredit({
      qualifiedAdoptionCosts: d(5001),
      adoptionDecreeFinalInTaxYear: true,
      childIsUsCitizenOrLegalResident: true,
      childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      taxYear: 2025,
    });

    expect(result.line5CarryoverCredit.toNumber()).toBe(1);
  });

  it("CA Form 540 Child Adoption Costs credit - an adoption that was not final during the tax year does not qualify", () => {
    const result = calculateCAForm540ChildAdoptionCostsCredit({
      qualifiedAdoptionCosts: d(4200),
      adoptionDecreeFinalInTaxYear: false,
      childIsUsCitizenOrLegalResident: true,
      childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
      taxYear: 2025,
    });

    expect(result.qualifies).toBe(false);
    expect(result.disqualificationReason).toBe("adoption_not_final_in_tax_year");
    expect(result.line4CurrentYearCredit.toNumber()).toBe(0);
    expect(result.line5CarryoverCredit.toNumber()).toBe(0);
  });

  it("CA Form 540 Child Adoption Costs credit - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540ChildAdoptionCostsCredit({
        qualifiedAdoptionCosts: d(4200),
        adoptionDecreeFinalInTaxYear: true,
        childIsUsCitizenOrLegalResident: true,
        childWasInCustodyOfCaliforniaAgencyOrPoliticalSubdivision: true,
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 Child Adoption Costs credit constants not available for 2024");
  });
});
