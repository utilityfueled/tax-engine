// Spec: spec/federal/rule-packs.yaml
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { getConstants, getRulePack, TAX_CONSTANTS } from "@/models/constants.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

describe("explicit federal rule packs", () => {
  it("rejects incomplete 2026 and unknown years before calculating", () => {
    for (const year of [2026, 2027, 0, NaN]) {
      expect(() => getConstants(year)).toThrow();
      expect(() => calculateFederalTax({ ...simpleW2Fixture,
        taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year } })).toThrow();
    }
    expect(getRulePack(2026).calculationStatus).toBe("incomplete");
    expect(() => getRulePack(2027)).toThrow(/Unknown tax year/);
    expect(TAX_CONSTANTS[2026]).toBeUndefined();
  });

  it("protects historical constants against nested mutations", () => {
    const constants = getConstants(2025);
    expect(() => { constants.standardDeduction.single = new Decimal("1"); }).toThrow();
    expect(() => { constants.taxBrackets.single[0].rate = new Decimal("1"); }).toThrow();
    expect(() => { constants.standardDeduction.single.d![0] = 1; }).toThrow();
    expect(constants.standardDeduction.single.toString()).toBe("15750");
    expect(constants.standardDeduction.single.plus("0.25").toString()).toBe("15750.25");
    expect(calculateFederalTax(simpleW2Fixture).taxYear).toBe(2025);
  });

  it("records sources and unfinished review without claiming filing readiness", () => {
    for (const year of [2025, 2026]) {
      const pack = getRulePack(year);
      expect(pack.taxYear).toBe(year);
      expect(pack.ruleVersion).toMatch(new RegExp(`^${year}\\.`));
      expect(pack.reviewStatus).toBe("independent-review-pending");
      expect(pack.filingQualified).toBe(false);
      expect(pack.sources.length).toBeGreaterThan(0);
      expect(pack.sources.every(source => source.retrievedAt === "2026-10-24" && source.section && source.revision)).toBe(true);
      expect(Object.isFrozen(pack.sources)).toBe(true);
    }
  });
});
