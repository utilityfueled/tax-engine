// Specs: spec/federal/form-1040.yaml and spec/federal/schedule-e.yaml.
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateScheduleE } from "@/engine/schedules/schedule-e.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return {
    ...original,
    getConstants: (year: number) => year === 2026
      ? FEDERAL_2026_CONSTANTS
      : original.getConstants(year),
  };
});

function parsedReturn(
  year: number,
  passThroughYear?: number,
  beneficiaryYear?: number,
  entityType: "partnership" | "s_corporation" = "partnership",
) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year },
    scheduleK1: [{
      partnershipName: "Fictional Manufacturing",
      partnershipEIN: "12-3456789",
      ordinaryIncome: "125.75",
      isPassiveActivity: false,
      entityType,
      taxYear: passThroughYear,
    }],
    scheduleK1Form1041: [{
      estateTrustName: "Fictional Estate",
      estateTrustEIN: "12-3456780",
      interestIncome: "115.25",
      taxYear: beneficiaryYear,
    }],
  });
}

it.each(["partnership", "S corporation", "estate or trust"] as const)(
  "holds a future %s Schedule K-1 before federal reporting",
  entity => {
    for (const returnYear of [2025, 2026]) {
      const sourceYear = returnYear + 1;
      const isBeneficiary = entity === "estate or trust";
      const input = parsedReturn(
        returnYear,
        isBeneficiary ? returnYear : sourceYear,
        isBeneficiary ? sourceYear : returnYear,
        entity === "S corporation" ? "s_corporation" : "partnership",
      );
      const source = isBeneficiary ? input.scheduleK1Form1041?.[0] : input.scheduleK1[0];
      expect(source?.taxYear).toBe(sourceYear);
      expect(() => calculateFederalTax(input))
        .toThrow(new RegExp(`Schedule K-1.*source year ${sourceYear}.*${returnYear} return`));
    }
  },
);

it("retains older, matching and unknown K-1 headers", () => {
  for (const headerYear of [2024, 2025, undefined]) {
    const input = parsedReturn(2025, headerYear, headerYear);
    expect(calculateFederalTax(input).agi.toString()).toBe("85241");
  }
});

it("holds future Part II income with a known Schedule E taxpayer year", () => {
  expect(() => calculateScheduleE(parsedReturn(2025, 2026)))
    .toThrow(/Schedule K-1.*source year 2026.*2025 return/);
});

it("preserves standalone Schedule E without a taxpayer year", () => {
  const { scheduleK1, rentalProperties, form1099Misc } = parsedReturn(2025, 2026);
  const result = calculateScheduleE({ scheduleK1, rentalProperties, form1099Misc });
  expect(result.totalNonpassiveIncome.toString()).toBe("125.75");
});
