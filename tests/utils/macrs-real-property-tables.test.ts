/** Spec: spec/federal/macrs-real-property-tables.yaml. */
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { MACRS_RESIDENTIAL_RENTAL_MID_MONTH } from "@/models/constants.js";
import { computeAssetDepreciation } from "@/utils/macrs.js";

// Independently transcribed from Publication 946 (2025), printed page 73,
// Table A-6. Each row is January through December; null is a published blank.
const firstYear = ["3.485", "3.182", "2.879", "2.576", "2.273", "1.970", "1.667", "1.364", "1.061", "0.758", "0.455", "0.152"];
const allRegular = ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"];
const publishedRows: Record<number, readonly (string | null)[]> = {
  1: firstYear,
  2: allRegular, 3: allRegular, 4: allRegular, 5: allRegular,
  6: allRegular, 7: allRegular, 8: allRegular, 9: allRegular,
  10: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  11: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  12: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  13: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  14: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  15: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  16: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  17: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  18: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  19: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  20: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  21: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  22: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  23: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  24: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  25: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  26: ["3.637", "3.637", "3.637", "3.637", "3.637", "3.637", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  27: ["3.636", "3.636", "3.636", "3.636", "3.636", "3.636", "3.637", "3.637", "3.637", "3.637", "3.637", "3.637"],
  28: ["1.970", "2.273", "2.576", "2.879", "3.182", "3.485", "3.636", "3.636", "3.636", "3.636", "3.636", "3.636"],
  29: [null, null, null, null, null, null, "0.152", "0.455", "0.758", "1.061", "1.364", "1.667"],
};

describe("MACRS residential real-property published table", () => {
  it("matches every published Table A-6 cell through the actual asset calculator", () => {
    for (const [yearText, row] of Object.entries(publishedRows)) {
      const recoveryYear = Number(yearText);
      for (let month = 1; month <= 12; month += 1) {
        const rate = row[month - 1];
        if (rate === null) continue;
        const result = computeAssetDepreciation({
          costBasis: "1000000",
          placedInServiceDate: `${2025 - recoveryYear + 1}-${String(month).padStart(2, "0")}-01`,
          recoveryPeriod: "27.5",
        }, 2025);
        expect(result, `month ${month}, year ${recoveryYear}`).not.toBeNull();
        expect(result?.percentage.toFixed(3), `month ${month}, year ${recoveryYear}`).toBe(rate);
        const expectedAmount = new Decimal("1000000").times(rate).dividedBy(100);
        expect(result?.depreciation.toFixed(), `month ${month}, year ${recoveryYear}`).toBe(expectedAmount.toFixed());
        expect(result?.fullyDepreciated).toBe(false);
      }
    }
  });

  it("uses the published terminal year and returns zero beyond each month schedule", () => {
    const terminalRates = ["1.970", "2.273", "2.576", "2.879", "3.182", "3.485", "0.152", "0.455", "0.758", "1.061", "1.364", "1.667"];
    for (let month = 1; month <= 12; month += 1) {
      const terminalYear = month <= 6 ? 28 : 29;
      const asset = {
        costBasis: "1000000",
        placedInServiceDate: `${2025 - terminalYear + 1}-${String(month).padStart(2, "0")}-01`,
        recoveryPeriod: "27.5" as const,
      };
      expect(MACRS_RESIDENTIAL_RENTAL_MID_MONTH[month]).toHaveLength(terminalYear);
      const terminal = computeAssetDepreciation(asset, 2025);
      expect(terminal?.percentage.toFixed(3)).toBe(terminalRates[month - 1]);
      const beyond = computeAssetDepreciation(asset, 2026);
      expect(beyond?.fullyDepreciated).toBe(true);
      expect(beyond?.percentage.toFixed()).toBe("0");
      expect(beyond?.depreciation.toFixed()).toBe("0");
    }
  });

  it("accounts for exactly one hundred percent without normalizing any published cell", () => {
    for (let month = 1; month <= 12; month += 1) {
      const table = MACRS_RESIDENTIAL_RENTAL_MID_MONTH[month];
      const percentageTotal = table.reduce((sum, rate) => sum.plus(rate), new Decimal(0));
      expect(percentageTotal.toFixed(3), `month ${month}`).toBe("100.000");
      const amounts = table.map((_, index) => computeAssetDepreciation({
        costBasis: "1000000",
        placedInServiceDate: `2000-${String(month).padStart(2, "0")}-01`,
        recoveryPeriod: "27.5",
      }, 2000 + index)?.depreciation ?? new Decimal(0));
      expect(Decimal.sum(...amounts).toFixed(), `month ${month}`).toBe("1000000");
    }
  });
});
