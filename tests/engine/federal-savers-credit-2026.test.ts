// Spec: spec/federal/form-8880-2026.yaml
import { describe, expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8880, type Form8880CalculationInput } from "@/engine/forms/form-8880.js";
import type { FilingStatus } from "@/models/constants.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Isolate the 2026 rule data for the normal federal calculation entry point.
vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {
    ...original,
    getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year),
  };
});

type RateCeilings = Readonly<Record<FilingStatus, readonly [string, string, string]>>;

const ceilings2026: RateCeilings = {
  married_filing_jointly: ["48500", "52500", "80500"],
  head_of_household: ["36375", "39375", "60375"],
  single: ["24250", "26250", "40250"],
  married_filing_separately: ["24250", "26250", "40250"],
  qualifying_surviving_spouse: ["24250", "26250", "40250"],
};
const ceilings2025: RateCeilings = {
  married_filing_jointly: ["47500", "51000", "79000"],
  head_of_household: ["35625", "38250", "59250"],
  single: ["23750", "25500", "39500"],
  married_filing_separately: ["23750", "25500", "39500"],
  qualifying_surviving_spouse: ["23750", "25500", "39500"],
};
const statuses = [
  "married_filing_jointly", "head_of_household", "single",
  "married_filing_separately", "qualifying_surviving_spouse",
] as const;
const rateAtCeiling = ["0.5", "0.2", "0.1"] as const;
const rateAboveCeiling = ["0.2", "0.1", "0"] as const;

const base: Form8880CalculationInput = {
  taxYear: 2026,
  filingStatus: "single",
  agi: "10000",
  primaryDateOfBirth: "1990-01-15",
  primaryElectiveDeferrals: "2000",
  taxLiabilityBeforeCredit: "5000",
  priorNonrefundableCredits: "0",
};

function checkAnnualTable(filingStatus: FilingStatus, taxYear: number, ceilings: RateCeilings) {
  ceilings[filingStatus].forEach((ceiling, index) => {
    const exact = calculateForm8880({ ...base, taxYear, filingStatus, agi: ceiling });
    const above = calculateForm8880({ ...base, taxYear, filingStatus, agi: `${ceiling}.01` });
    expect(exact.line9.toFixed(), `${filingStatus} at ${ceiling}`).toBe(rateAtCeiling[index]);
    expect(above.line9.toFixed(), `${filingStatus} one cent above ${ceiling}`).toBe(rateAboveCeiling[index]);
    expect(exact.lines.find(line => line.line === "9")?.formula).toContain(`${taxYear} Form 8880 rate table`);
  });
}

describe("2026 Form 8880 thresholds and federal integration", () => {
  it.each(statuses)("applies the 2026 Form 8880 bands at and one cent above every ceiling for %s", (status) => {
    checkAnnualTable(status, 2026, ceilings2026);
  });

  it.each(statuses)("retains the 2025 Form 8880 bands and audit for %s", (status) => {
    checkAnnualTable(status, 2025, ceilings2025);
  });

  it("uses the January 1, 2009 cutoff in both Form 8880 contributor columns", () => {
    const joint = {
      ...base,
      filingStatus: "married_filing_jointly" as const,
      spouseElectiveDeferrals: "2000",
    };
    for (const dateOfBirth of ["2008-12-31", "2009-01-01"]) {
      const result = calculateForm8880({ ...joint, primaryDateOfBirth: dateOfBirth, spouseDateOfBirth: dateOfBirth });
      expect(result.line6a.toFixed()).toBe("2000");
      expect(result.line6b.toFixed()).toBe("2000");
      expect(result.line12.toFixed()).toBe("2000");
    }
    const youngerPrimary = calculateForm8880({
      ...joint, primaryDateOfBirth: "2009-01-02", spouseDateOfBirth: "2009-01-01",
    });
    expect(youngerPrimary.line6a.toFixed()).toBe("0");
    expect(youngerPrimary.line6b.toFixed()).toBe("2000");
    const youngerSpouse = calculateForm8880({
      ...joint, primaryDateOfBirth: "2009-01-01", spouseDateOfBirth: "2009-01-02",
    });
    expect(youngerSpouse.line6a.toFixed()).toBe("2000");
    expect(youngerSpouse.line6b.toFixed()).toBe("0");
  });

  it("uses the return year for Form 8880 and carries the credit into Form 1040", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        taxYear: 2026,
        wages: "40250",
        federalWithheld: "3500",
        socialSecurityWages: "40250",
        socialSecurityWithheld: "2495.50",
        medicareWages: "40250",
        medicareWithheld: "583.63",
      }],
      form8880: {
        primaryElectiveDeferrals: "2000",
        sourceFacts2026: {
          taxYear: 2026,
          testingPeriodComplete: true,
          primary: {
            qualifyingStudentMonths: 0,
            dependentDeductionAllowedToAnotherTaxpayer: false,
            testingPeriodDistributionReduction: "0",
          },
          americanSamoaAgiRestoration: "0",
          puertoRicoAgiRestoration: "0",
        },
      },
    });
    const result = calculateFederalTax(input);
    expect(result.agi.toFixed()).toBe("40250");
    expect(result.form8880?.line9.toFixed()).toBe("0.1");
    expect(result.form8880?.line12.toFixed()).toBe("200");
    expect(result.allLines.find(line => line.form === "Sched 3" && line.line === "4")?.value.toFixed()).toBe("200");
    expect(result.allLines.find(line => line.form === "1040" && line.line === "20")?.value.toFixed()).toBe("200");
  });
});
