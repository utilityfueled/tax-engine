import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  lookupOhioSchoolDistrictMetadataFromLocalityLabel,
  lookupOhioSchoolDistrictMetadata,
  normalizeOhioSchoolDistrictNumber,
} from "@/engine/state/oh-school-district-lookup.js";

interface OfficialLookupFixture {
  taxYears: Record<
    string,
    Record<
      string,
      {
        taxType: "traditional" | "earned_income";
        rate: string;
      }
    >
  >;
}

const officialFixture = JSON.parse(
  readFileSync(
    new URL("../../fixtures/oh-school-district-rates-2024-2025.json", import.meta.url),
    "utf8",
  ),
) as OfficialLookupFixture;

describe("Ohio school district lookup", () => {
  it("Ohio school district lookup pads district numbers and resolves earned-income districts", () => {
    expect(normalizeOhioSchoolDistrictNumber("404")).toBe("0404");

    const result = lookupOhioSchoolDistrictMetadata(2025, "404");
    expect(result).not.toBeNull();
    expect(result!.districtNumber).toBe("0404");
    expect(result!.taxType).toBe("earned_income");
    expect(result!.rate.toNumber()).toBe(0.0125);
  });

  it("Ohio school district lookup uses year-specific effective rates", () => {
    const rate2024 = lookupOhioSchoolDistrictMetadata(2024, "4202");
    const rate2025 = lookupOhioSchoolDistrictMetadata(2025, "4202");

    expect(rate2024).not.toBeNull();
    expect(rate2025).not.toBeNull();
    expect(rate2024!.taxType).toBe("traditional");
    expect(rate2025!.taxType).toBe("traditional");
    expect(rate2024!.rate.toNumber()).toBe(0.015);
    expect(rate2025!.rate.toNumber()).toBe(0.0175);
  });

  it("Ohio school district lookup returns null for non-taxing districts", () => {
    expect(lookupOhioSchoolDistrictMetadata(2025, "0101")).toBeNull();
  });

  it("Ohio school district lookup resolves SD-prefixed abbreviated district names and rejects ambiguous aliases", () => {
    const abbreviated = lookupOhioSchoolDistrictMetadataFromLocalityLabel(
      2025,
      "SD Geneva Area",
    );
    const ambiguous = lookupOhioSchoolDistrictMetadataFromLocalityLabel(
      2025,
      "SD Northeastern",
    );

    expect(abbreviated).not.toBeNull();
    expect(abbreviated!.districtNumber).toBe("0404");
    expect(abbreviated!.taxType).toBe("earned_income");
    expect(abbreviated!.rate.toFixed(4)).toBe("0.0125");
    expect(ambiguous).toBeNull();
  });

  it("Ohio school district lookup matches the official Finder taxable-rate snapshot for 2024 and 2025", () => {
    for (const [taxYear, districts] of Object.entries(officialFixture.taxYears)) {
      const districtEntries = Object.entries(districts);
      expect(districtEntries.length).toBeGreaterThan(0);

      for (const [districtNumber, expected] of districtEntries) {
        const actual = lookupOhioSchoolDistrictMetadata(Number(taxYear), districtNumber);

        if (!actual) {
          throw new Error(
            `Expected Ohio school district ${districtNumber} to resolve for tax year ${taxYear}`,
          );
        }

        expect(actual.districtNumber).toBe(districtNumber);
        expect(actual.taxType).toBe(expected.taxType);
        expect(actual.rate.toFixed(4)).toBe(expected.rate);
      }
    }
  });
});
