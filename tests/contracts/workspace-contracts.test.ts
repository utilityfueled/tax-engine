import { describe, expect, it } from "vitest";
import {
  isSupportedEngineTaxYear,
  latestEngineTargetYear,
  officialSampleDocumentFixtures,
  type PartnerReviewConsentRecord,
  seededFactDefinitions,
  supportedEngineTaxYears
} from "@tax-engine/contracts";

describe("workspace contracts", () => {
  it("publishes a stable seeded fact catalog for the interview loop", () => {
    expect(seededFactDefinitions.map((definition) => definition.id)).toEqual([
      "wages",
      "withholding",
      "taxable-interest",
      "ordinary-dividends",
      "qualified-dividends",
      "capital-gain-distributions",
      "government-payments-review",
      "retirement-distribution-review",
      "social-security-benefits-review",
      "hsa-distribution-review",
      "student-loan-interest-review",
      "premium-tax-credit-review",
      "nonemployee-compensation",
      "schedule-c-expense-review",
      "broker-proceeds",
      "cost-basis-review"
    ]);

    expect(new Set(seededFactDefinitions.map((definition) => definition.id)).size).toBe(
      seededFactDefinitions.length
    );

    for (const definition of seededFactDefinitions) {
      expect(definition.label.trim().length).toBeGreaterThan(0);
      expect(definition.prompt.trim().length).toBeGreaterThan(0);
    }
  });

  it("publishes the deterministic engine tax-year support window", () => {
    expect(supportedEngineTaxYears).toEqual([2025]);
    expect(latestEngineTargetYear).toBe(2025);
    expect(isSupportedEngineTaxYear(2025)).toBe(true);
    expect(isSupportedEngineTaxYear(2026)).toBe(false);
  });

  it("publishes explicit tax-year hints for seeded sample fixtures", () => {
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1099-int-2024")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1099-g-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1099-oid-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1099-div-2024")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1095-a-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1098-e-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1099-r-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-ssa-1099-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-1099-sa-2025")?.taxYearHint).toBe(2025);
    expect(officialSampleDocumentFixtures.find((fixture) => fixture.id === "irs-w2-2026")?.taxYearHint).toBe(2026);
  });

  it("publishes an explicit partner-review consent contract", () => {
    const consent: PartnerReviewConsentRecord = {
      shareRedactedDataWithPartner: true,
      acknowledgeSoftwareOnlyService: true,
      acknowledgeSeparateProfessionalEngagement: true,
      capturedAt: "2026-03-12T00:00:00.000Z"
    };

    expect(Object.keys(consent)).toEqual([
      "shareRedactedDataWithPartner",
      "acknowledgeSoftwareOnlyService",
      "acknowledgeSeparateProfessionalEngagement",
      "capturedAt"
    ]);
    expect(consent.acknowledgeSoftwareOnlyService).toBe(true);
    expect(consent.acknowledgeSeparateProfessionalEngagement).toBe(true);
  });
});
