// Spec: spec/federal/tax-table.yaml; fixtures are independently extracted published IRS rows.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getConstants, getBaseYearConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { calculateRegularIncomeTax, regularIncomeTaxSource } from "@/utils/tax-math.js";
import { d } from "@/utils/decimal.js";

const statuses = ["single", "married_filing_jointly", "married_filing_separately", "head_of_household"] as const;
describe("Federal tax tables", () => {
  it("matches every published IRS row for all four final years", () => {
    for (const year of [2022, 2023, 2024, 2025]) {
      const constants = year === 2025 ? getConstants(year) : getBaseYearConstants(year);
      const rows = JSON.parse(readFileSync(new URL(`../fixtures/tax-tables/${year}.json`, import.meta.url), "utf8")) as number[][];
      expect(rows).toHaveLength(2062);
      for (const row of rows) {
        for (const [column, status] of statuses.entries()) {
          // Compare both ends of each integer-dollar interval with the source cell.
          expect(calculateRegularIncomeTax(d(row[0]), status, constants).toString(), `${year} ${status} ${row[0]}`).toBe(String(row[column + 2]));
          expect(calculateRegularIncomeTax(d(row[1]).minus(1), status, constants).toString()).toBe(String(row[column + 2]));
        }
        expect(calculateRegularIncomeTax(d(row[0]), "qualifying_surviving_spouse", constants).toString()).toBe(String(row[3]));
      }
    }
  });
  it("uses printed intervals and changes to the computation worksheet at one hundred thousand", () => {
    const c = getConstants(2025);
    expect(calculateRegularIncomeTax(d("25300"), "married_filing_jointly", c).toString()).toBe("2562");
    expect(calculateRegularIncomeTax(d("99999"), "single", c).toString()).toBe("16909");
    expect(calculateRegularIncomeTax(d("100000"), "single", c).toString()).toBe("16914");
    expect(calculateRegularIncomeTax(d("14.49"), "single", c).toString()).toBe("1");
    expect(calculateRegularIncomeTax(d("14.50"), "single", c).toString()).toBe("2");
    expect(calculateRegularIncomeTax(d("-1"), "single", c).toString()).toBe("0");
    expect(() => calculateRegularIncomeTax(d("Infinity"), "single", c)).toThrow(/finite/);
    expect(() => calculateRegularIncomeTax(d("100"), "single", {...c, taxYear: 2027})).toThrow(/year/);
  });
  it("labels the unpublished 2026 calculation as a statutory preview", () => {
    expect(regularIncomeTaxSource(getConstants(2025))).toBe("final-year-tax-table");
    expect(regularIncomeTaxSource(FEDERAL_2026_CONSTANTS)).toBe("statutory-rate-preview");
    expect(calculateRegularIncomeTax(d("25300"), "married_filing_jointly", FEDERAL_2026_CONSTANTS).toString()).toBe("2540");
    expect(() => getConstants(2026)).toThrow();
  });
});
