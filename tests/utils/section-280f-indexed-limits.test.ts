/** Spec: spec/federal/section-280f-indexed-limits.yaml. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { SECTION_280F_LIMITS } from "@/models/constants.js";
import { DepreciableAssetSchema } from "@/models/inputs.js";
import { computeListedPropertyDepreciation } from "@/utils/macrs.js";

// Independent literal transcription: Rev. Proc. 2025-16 Tables1/2 and
// Rev. Proc. 2026-15 Tables1/2, printed page7. No production-derived oracle.
const published = [
  { year: 2025, bonus: true, values: ["20200", "19600", "11800", "7060"] },
  { year: 2025, bonus: false, values: ["12200", "19600", "11800", "7060"] },
  { year: 2026, bonus: true, values: ["20300", "19800", "11900", "7160"] },
  { year: 2026, bonus: false, values: ["12300", "19800", "11900", "7160"] },
] as const;

describe("Section280F indexed passenger automobile tables", () => {
  it("matches every published indexed cell as Decimal", () => {
    for (const row of published) {
      const actual = SECTION_280F_LIMITS[row.year]?.[row.bonus ? "withBonus" : "withoutBonus"];
      expect(actual, `placement ${row.year}, bonus ${row.bonus}`).toHaveLength(4);
      for (const [index, expected] of row.values.entries()) {
        expect(Decimal.isDecimal(actual?.[index])).toBe(true);
        expect(actual?.[index].toFixed()).toBe(expected);
      }
    }
  });

  it("uses the original placement year through the actual listed-property calculator", () => {
    for (const row of published) {
      const asset = DepreciableAssetSchema.parse({
        description: "Synthetic passenger automobile",
        costBasis: "1000000", placedInServiceDate: `${row.year}-06-15`,
        recoveryPeriod: "5", method: "200DB", convention: "halfYear",
        isListedProperty: true, isPassengerAutomobile: true,
        businessUsePercentage: 100, firstYearBonusEligible: row.bonus,
      });
      const before = JSON.stringify(asset);
      for (let index = 0; index < 5; index += 1) {
        const expected = row.values[Math.min(index, 3)];
        const actual = computeListedPropertyDepreciation(asset, row.year + index);
        expect(actual?.section280FCap?.toFixed(), `${row.year}, recovery ${index + 1}`).toBe(expected);
        expect(actual?.depreciation.toFixed()).toBe(expected);
        expect(actual?.basisSourceStatus).toBe("legacy_unqualified");
      }
      expect(JSON.stringify(asset)).toBe(before);
    }
  });
});
