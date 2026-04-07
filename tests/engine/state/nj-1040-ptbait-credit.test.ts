/**
 * Tests for New Jersey NJ-1040 Pass-Through Business Alternative Income Tax credit.
 * Spec: spec/state/nj-1040-ptbait-credit.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateNJ1040PTBAITCredit } from "@/engine/state/nj-1040-ptbait-credit.js";

const d = (value: string | number) => new Decimal(value);

describe("NJ-1040 PTBAIT credit", () => {
  it("NJ-1040 PTBAIT credit - partnership amount flows to line 63", () => {
    const result = calculateNJ1040PTBAITCredit({
      partnershipShare: 850,
      taxYear: 2025,
    });

    expect(result.partnershipShare).toEqual(d(850));
    expect(result.line63Credit).toEqual(d(850));
  });

  it("NJ-1040 PTBAIT credit - partnership and S corporation amounts add together", () => {
    const result = calculateNJ1040PTBAITCredit({
      partnershipShare: 850,
      sCorporationShare: 1200,
      taxYear: 2025,
    });

    expect(result.line63Credit).toEqual(d(2050));
  });

  it("NJ-1040 PTBAIT credit - estate or trust credit is included", () => {
    const result = calculateNJ1040PTBAITCredit({
      estateOrTrustShare: 425,
      taxYear: 2025,
    });

    expect(result.estateOrTrustShare).toEqual(d(425));
    expect(result.line63Credit).toEqual(d(425));
  });

  it("NJ-1040 PTBAIT credit - no supported PTBAIT amounts yields zero", () => {
    const result = calculateNJ1040PTBAITCredit({
      taxYear: 2025,
    });

    expect(result.line63Credit).toEqual(d(0));
  });
});
