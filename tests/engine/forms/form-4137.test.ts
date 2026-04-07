/**
 * Tests for Form 4137 summary support.
 * Spec: spec/federal/form-4137.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm4137 } from "@/engine/forms/form-4137.js";
import { getConstants } from "@/models/constants.js";

const d = (value: number | string) => new Decimal(value);
const c = getConstants(2025);

describe("Form 4137 summary support", () => {
  it("Form 4137 Line 13 - computes Social Security and Medicare tax from supported summary inputs", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(10000),
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
    }, c);

    expect(result.line6.toNumber()).toBe(10000);
    expect(result.line8.toNumber()).toBe(170000);
    expect(result.line9.toNumber()).toBe(6100);
    expect(result.line10.toNumber()).toBe(6100);
    expect(result.line11.toNumber()).toBe(378);
    expect(result.line12.toNumber()).toBe(145);
    expect(result.line13.toNumber()).toBe(523);
  });

  it("Form 4137 Line 10 - Social Security taxable tips are capped by the remaining wage base", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(9000),
      socialSecurityWagesAndTipsAlreadyReported: d(175500),
      medicareOnlyGovernmentEmployeeTips: d(2000),
    }, c);

    expect(result.line9.toNumber()).toBe(600);
    expect(result.line10.toNumber()).toBe(600);

    const line10 = result.lines.find((line) => line.form === "Form 4137" && line.line === "10");
    expect(String(line10?.inputs["Validated Medicare-only government-employee tips"])).toBe("2000");
  });

  it("Form 4137 Line 8 - W-2 Box 7 Social Security tips default into the wage-base room calculation", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(9000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
      socialSecurityTipsAlreadyReported: d(900),
    });

    expect(result.line8.toNumber()).toBe(170900);
    expect(result.line9.toNumber()).toBe(5200);
    expect(result.line10.toNumber()).toBe(5200);
    expect(result.line11.toNumber()).toBe(322);
    expect(result.line12.toNumber()).toBe(131);
    expect(result.line13.toNumber()).toBe(453);

    const line8 = result.lines.find((line) => line.form === "Form 4137" && line.line === "8");
    expect(String(line8?.inputs["Defaulted W-2 Box 3 Social Security wages"])).toBe("170000");
    expect(String(line8?.inputs["Defaulted W-2 Box 7 Social Security tips"])).toBe("900");
  });

  it("Form 4137 Line 11 - one dollar of remaining wage-base room rounds the Social Security tax down to zero", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(176099),
    }, c);

    expect(result.line9.toNumber()).toBe(1);
    expect(result.line10.toNumber()).toBe(1);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(73);
    expect(result.line13.toNumber()).toBe(73);

    const line11 = result.lines.find((line) => line.form === "Form 4137" && line.line === "11");
    expect(String(line11?.inputs["Line 10"])).toBe("1");
  });

  it("Form 4137 Line 11 - nine dollars of remaining wage-base room rounds the Social Security tax up to one dollar", () => {
    const result = calculateForm4137({
      unreportedTipIncome: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(176091),
    }, c);

    expect(result.line9.toNumber()).toBe(9);
    expect(result.line10.toNumber()).toBe(9);
    expect(result.line11.toNumber()).toBe(1);
    expect(result.line12.toNumber()).toBe(73);
    expect(result.line13.toNumber()).toBe(74);

    const line11 = result.lines.find((line) => line.form === "Form 4137" && line.line === "11");
    expect(String(line11?.inputs["Line 10"])).toBe("9");
  });
});
