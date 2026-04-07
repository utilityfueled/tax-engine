/**
 * Tests for California Form 540 exemption credits.
 * Spec: spec/state/ca-form-540-exemption-credits.yaml
 */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateCAForm540ExemptionCredits } from "@/engine/state/ca-form-540-exemption-credits.js";

const d = (value: string | number) => new Decimal(value);

describe("California Form 540 exemption credits", () => {
  it("CA Form 540 exemption credits Line 7 - personal exemption count multiplies by $153", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(200000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.personalExemptionAmount.toNumber()).toBe(153);
  });

  it("CA Form 540 exemption credits Line 8 - blind exemption count multiplies by $153", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(200000),
      personalExemptionCount: 1,
      blindExemptionCount: 1,
      seniorExemptionCount: 0,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.blindExemptionAmount.toNumber()).toBe(153);
  });

  it("CA Form 540 exemption credits Line 9 - senior exemption count multiplies by $153", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "head_of_household",
      federalAgi: d(200000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 1,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.seniorExemptionAmount.toNumber()).toBe(153);
  });

  it("CA Form 540 exemption credits Line 10 - dependent exemption count multiplies by $475", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(200000),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 2,
      taxYear: 2025,
    });

    expect(result.dependentExemptionAmount.toNumber()).toBe(950);
  });

  it("CA Form 540 exemption credits Line 11 - the total exemption amount adds lines 7 through 10", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(200000),
      personalExemptionCount: 1,
      blindExemptionCount: 1,
      seniorExemptionCount: 1,
      dependentExemptionCount: 2,
      taxYear: 2025,
    });

    expect(result.exemptionAmount.toNumber()).toBe(1409);
    expect(result.line32ExemptionCredits.toNumber()).toBe(1409);
  });

  it("CA Form 540 exemption credits Line 32a - the AGI limitation worksheet starts from federal AGI", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(252204),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });

    expect(result.federalAgi.toNumber()).toBe(252204);
  });

  it("CA Form 540 exemption credits Line 32b - qualifying surviving spouse uses the joint threshold", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "qualifying_surviving_spouse",
      federalAgi: d(504411),
      personalExemptionCount: 2,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });

    expect(result.agiLimitThreshold.toNumber()).toBe(504411);
    expect(result.agiReductionUnits.toNumber()).toBe(0);
    expect(result.line32ExemptionCredits.toNumber()).toBe(781);
  });

  it("CA Form 540 exemption credits Line 32c - AGI below the threshold floors the excess at zero", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "head_of_household",
      federalAgi: d(378309),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 1,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });

    expect(result.agiExcess.toNumber()).toBe(0);
    expect(result.line32ExemptionCredits.toNumber()).toBe(781);
  });

  it("CA Form 540 exemption credits Line 32d - $1 above the single threshold rounds up to one reduction unit", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(252204),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });

    expect(result.agiExcess.toNumber()).toBe(1);
    expect(result.agiReductionUnits.toNumber()).toBe(1);
  });

  it("CA Form 540 exemption credits Line 32e - each reduction unit is worth $6 per exemption", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "married_filing_separately",
      federalAgi: d(253454),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 2,
      taxYear: 2025,
    });

    expect(result.agiReductionUnits.toNumber()).toBe(2);
    expect(result.perExemptionReduction.toNumber()).toBe(12);
  });

  it("CA Form 540 exemption credits Line 32i - AGI limitation reduces the personal blind senior pool", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(252204),
      personalExemptionCount: 1,
      blindExemptionCount: 1,
      seniorExemptionCount: 1,
      dependentExemptionCount: 0,
      taxYear: 2025,
    });

    expect(result.personalBlindSeniorAllowedAmount.toNumber()).toBe(441);
  });

  it("CA Form 540 exemption credits Line 32m - AGI limitation reduces the dependent pool", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "married_filing_separately",
      federalAgi: d(253454),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 0,
      dependentExemptionCount: 2,
      taxYear: 2025,
    });

    expect(result.dependentAllowedAmount.toNumber()).toBe(926);
    expect(result.line32ExemptionCredits.toNumber()).toBe(1067);
  });

  it("CA Form 540 exemption credits Line 32 - very high AGI can fully eliminate the exemption credits", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "single",
      federalAgi: d(452203),
      personalExemptionCount: 1,
      blindExemptionCount: 1,
      seniorExemptionCount: 1,
      dependentExemptionCount: 2,
      taxYear: 2025,
    });

    expect(result.perExemptionReduction.toNumber()).toBe(480);
    expect(result.personalBlindSeniorAllowedAmount.toNumber()).toBe(0);
    expect(result.dependentAllowedAmount.toNumber()).toBe(0);
    expect(result.line32ExemptionCredits.toNumber()).toBe(0);
  });

  it("CA Form 540 exemption credits - audit trail records the line 32 worksheet path and filing-status threshold", () => {
    const result = calculateCAForm540ExemptionCredits({
      filingStatus: "head_of_household",
      federalAgi: d(378311),
      personalExemptionCount: 1,
      blindExemptionCount: 0,
      seniorExemptionCount: 1,
      dependentExemptionCount: 1,
      taxYear: 2025,
    });

    expect(result.lines.map((line) => line.line)).toEqual([
      "7",
      "8",
      "9",
      "10",
      "11",
      "32a",
      "32b",
      "32c",
      "32d",
      "32e",
      "32f",
      "32g",
      "32h",
      "32i",
      "32j",
      "32k",
      "32l",
      "32m",
      "32",
    ]);
    expect(result.lines[6]?.inputs).toMatchObject({
      "Filing status": "head_of_household",
      "Reduction divisor": "2500",
    });
  });

  it("CA Form 540 exemption credits - fractional or negative exemption counts throw a clear error", () => {
    expect(() =>
      calculateCAForm540ExemptionCredits({
        filingStatus: "single",
        federalAgi: d(200000),
        personalExemptionCount: -1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 exemption counts must be non-negative whole numbers");

    expect(() =>
      calculateCAForm540ExemptionCredits({
        filingStatus: "single",
        federalAgi: d(200000),
        personalExemptionCount: 1,
        blindExemptionCount: 0.5,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        taxYear: 2025,
      })
    ).toThrow("CA Form 540 exemption counts must be non-negative whole numbers");
  });

  it("CA Form 540 exemption credits - unsupported tax years throw a clear error", () => {
    expect(() =>
      calculateCAForm540ExemptionCredits({
        filingStatus: "single",
        federalAgi: d(200000),
        personalExemptionCount: 1,
        blindExemptionCount: 0,
        seniorExemptionCount: 0,
        dependentExemptionCount: 0,
        taxYear: 2024,
      })
    ).toThrow("CA Form 540 exemption credit constants not available for 2024");
  });
});
