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
      expect(pack.sources.every(source => /^\d{4}-\d{2}-\d{2}$/.test(source.retrievedAt) && source.retrievedAt >= "2026-10-24" && source.section && source.revision)).toBe(true);
      expect(Object.isFrozen(pack.sources)).toBe(true);
      expect(pack.sources.some(source => source.url === "https://www.irs.gov/instructions/i8863" && source.retrievedAt === "2026-10-25")).toBe(true);
    }
  });

  it("pins historic Form 4137 evidence and records the annual review template separately", () => {
    const archived2025 = "https://www.irs.gov/pub/irs-prior/f4137--2025.pdf";
    const archived2026 = "https://www.irs.gov/pub/irs-prior/f4137--2026.pdf";
    const current = "https://www.irs.gov/pub/irs-pdf/f4137.pdf";
    const historical = getRulePack(2025);
    const annual = getRulePack(2026);
    expect(historical.sources.map(source => source.url)).toContain(archived2025);
    expect(historical.sources.map(source => source.url)).not.toContain(archived2026);
    expect(annual.sources.map(source => source.url)).toContain(archived2025);
    expect(annual.sources).toContainEqual(expect.objectContaining({
      url: archived2026,
      section: expect.stringContaining("Schedule 2 line 16a"),
      retrievedAt: "2026-11-24",
    }));
    for (const pack of [historical, annual]) {
      expect(pack.sources.map(source => source.url)).not.toContain(current);
      expect(pack.filingQualified).toBe(false);
    }
    expect(annual.calculationStatus).toBe("incomplete");
  });

  it("records the new Form 2210 rate for 2026 without qualifying the annual return", () => {
    const source = "https://www.irs.gov/pub/irs-drop/rr-26-25.pdf";
    const annual = getRulePack(2026);
    expect(annual.sources).toContainEqual(expect.objectContaining({
      url: source,
      section: expect.stringContaining("January 1 through April 15, 2027"),
      retrievedAt: "2026-11-26",
    }));
    expect(getRulePack(2025).sources.map(item => item.url)).not.toContain(source);
    expect(annual.calculationStatus).toBe("incomplete");
    expect(annual.filingQualified).toBe(false);
  });

  it("records the draft 2026 Tax and EIC tables without qualifying the annual return", () => {
    const publication = "https://www.irs.gov/pub/irs-dft/p1040--dft.pdf";
    const instructions = "https://www.irs.gov/pub/irs-dft/i1040gi--dft.pdf#page=54";
    const annual = getRulePack(2026);
    expect(annual.sources).toContainEqual(expect.objectContaining({
      url: publication,
      revision: "2026 draft dated August 28, 2026",
    }));
    expect(annual.sources).toContainEqual(expect.objectContaining({
      url: instructions,
      revision: "2026 draft dated November 24, 2026",
    }));
    expect(getRulePack(2025).sources.map(source => source.url)).not.toContain(publication);
    expect(annual.calculationStatus).toBe("incomplete");
    expect(annual.filingQualified).toBe(false);
  });
});
