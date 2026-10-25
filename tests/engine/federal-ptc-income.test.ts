// Spec: spec/federal/premium-tax-credit-return.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async originalImport => {
  const actual = await originalImport<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...actual, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : actual.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
it("uses canonical tax-exempt interest and nontaxable benefits instead of a favorable source override", () => {
  for (const year of [2025, 2026]) {
    const months = Array.from({ length: 12 }, (_, index) => ({ month: index + 1, enrolleePremium: "500", slcsp: "700", advancePremiumTaxCredit: "300", coverageEligible: true, incomeBasedSepEnrollment: false }));
    const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
      w2s: [{ ...simpleW2Fixture.w2s[0], wages: "50000" }], formSSA1099: [{ recipient: "primary", netBenefits: "20000", federalWithheld: "0" }],
      socialSecurityFacts: { puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0", sourceFactsConfirmed: true },
      form1099Int: [{ privateActivityBondInterest: "0", payer: "Actual exempt interest source", interestIncome: "0", taxExemptInterest: "1000" }],
      form1095A: [{ taxYear: year, marketplace: "Actual Marketplace", policyNumber: "ACTUAL-1", monthlyPremiums: months }],
      form8962: { taxFamilySize: 1, fplRegion: "contiguous", taxpayerModifiedAGI: "50000", requiredFilingDependentsModifiedAGI: "0",
        householdFactsConfirmed: true, canBeClaimedAsDependent: false, belowPovertyException: "none", coverageFactsConfirmed: true,
        allocationRequired: false, alternativeMarriageCalculationElected: false, selfEmployedHealthInsuranceCoordinationRequired: false,
        lawfulPresenceReconciliationRequired: false, qsehraAffected: false, monthlyReconciliation: months },
      form2210: { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
        calculationMethod: "regular", withholdingMethod: "equal-installments", priorYearTaxStatus: "no-tax-liability", priorYearFullYear: true,
        priorYearResidentAllYear: true, priorYearTaxForForm2210: "0", priorYearTaxComputationConfirmed: true },
    });
    expect(() => calculateFederalTax(input)).toThrow(/modified.*income|MAGI|reconcile/i);
    if (!input.form8962) throw new Error("Synthetic actual coverage facts missing");
    input.form8962.taxpayerModifiedAGI = undefined;
    const result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe("67000");
    expect(result.form8962?.modifiedAGI.toFixed()).toBe("71000");
    expect(result.form8962?.ptcAllowed.toFixed()).toBe(year === 2025 ? "2365" : "0");
    input.form8962.taxpayerModifiedAGI = "71000";
    expect(calculateFederalTax(input).form8962?.modifiedAGI.toFixed()).toBe("71000");
  }
});

it("counts a child election in the actual dependent worksheet without duplicating exempt interest", () => {
  // Final2025 i8962 Worksheet1-2: child500exempt + min(4000line4,2700line5)=3200.
  // Parent receives only child1300line12; its separate1000exempt is its line2a.
  const months = [{ month: 1, enrolleePremium: "500", slcsp: "700", advancePremiumTaxCredit: "0", coverageEligible: true, incomeBasedSepEnrollment: false }];
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, dependents: [{ firstName: "Child", lastName: "Doe", ssn: "321-54-6789", dateOfBirth: "2008-05-10", relationship: "child", monthsLivedWithYou: 12, qualifiesForCTC: false }] },
    w2s: [{ ...simpleW2Fixture.w2s[0], wages: "20000" }],
    form1099Int: [{ privateActivityBondInterest: "0", payer: "Parent source", interestIncome: "0", taxExemptInterest: "1000" }],
    form8814: [{ taxableInterest: "4000", taxExemptInterest: "500", ordinaryDividends: "0", qualifiedDividends: "0", capitalGainDistributions: "0",
      amtSources: { taxYear: 2025, allStatementsConfirmed: true, otherwiseAllowableDeduction: "0", statements: [
        { sourceId: "synthetic-child-bank", form: "1099-INT", taxExemptInterest: "500", specifiedPrivateActivityBondInterest: "0" },
      ] },
    }],
    form1095A: [{ taxYear: 2025, marketplace: "Actual Marketplace", policyNumber: "ACTUAL-CHILD", monthlyPremiums: months }],
    form8962: { taxFamilySize: 2, fplRegion: "contiguous", requiredFilingDependentsModifiedAGI: "3200",
      householdFactsConfirmed: true, canBeClaimedAsDependent: false, belowPovertyException: "none", coverageFactsConfirmed: true,
      allocationRequired: false, alternativeMarriageCalculationElected: false, selfEmployedHealthInsuranceCoordinationRequired: false,
      lawfulPresenceReconciliationRequired: false, qsehraAffected: false, monthlyReconciliation: months },
  });
  const result = calculateFederalTax(input);
  expect(result.agi.toFixed()).toBe("21300");
  expect(result.allLines.find(row => row.form === "1040" && row.line === "2a")?.value.toFixed()).toBe("1000");
  expect(result.form8814?.totalTaxExemptInterest.toFixed()).toBe("500");
  expect(result.form8962?.modifiedAGI.toFixed()).toBe("25500");
  expect(result.form8962?.lines.find(row => row.form === "Form 8962" && row.line === "2a")?.value.toFixed()).toBe("22300");
  expect(result.form8962?.lines.find(row => row.form === "Form 8962" && row.line === "2b")?.value.toFixed()).toBe("3200");
});
