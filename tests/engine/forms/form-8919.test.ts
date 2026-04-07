/**
 * Tests for Form 8919 summary support.
 * Spec: spec/federal/form-8919.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { getConstants } from "@/models/constants.js";

const d = (value: number | string) => new Decimal(value);
const c = getConstants(2025);

describe("Form 8919 summary support", () => {
  it("Form 8919 Line 13 - computes Social Security and Medicare tax from supported summary inputs", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(10000),
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

  it("Form 8919 Line 8 - W-2 Box 7 tips and supported Form 4137 Social Security-taxable tips default into the wage-base room calculation", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(9000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
      w2SocialSecurityTipsAlreadyReported: d(900),
      form4137SocialSecurityTipsAlreadyReported: d(5000),
    });

    expect(result.line8.toNumber()).toBe(175900);
    expect(result.line9.toNumber()).toBe(200);
    expect(result.line10.toNumber()).toBe(200);

    const line8 = result.lines.find((line) => line.form === "Form 8919" && line.line === "8");
    expect(String(line8?.inputs["Defaulted W-2 Box 7 Social Security tips"])).toBe("900");
    expect(String(line8?.inputs["Supported Form 4137 Line 10 tips"])).toBe("5000");
  });

  it("Form 8919 Line 8 - validated RRTA compensation defaults into the wage-base room calculation and is capped at the annual Social Security wage base", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(10000),
      rrtaCompensationSubjectToSocialSecurityTax: d(200000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(1000),
      w2SocialSecurityTipsAlreadyReported: d(900),
      form4137SocialSecurityTipsAlreadyReported: d(500),
    });

    expect(result.line8.toNumber()).toBe(178500);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);

    const line8 = result.lines.find((line) => line.form === "Form 8919" && line.line === "8");
    expect(String(line8?.inputs["Validated RRTA compensation subject to the 6.2% Social Security rate"])).toBe("200000");
    expect(String(line8?.inputs["Supported RRTA compensation included on Line 8"])).toBe("176100");
    expect(line8?.formula).toContain("validated RRTA compensation subject to the 6.2% Social Security rate");
  });

  it("Form 8919 Line 10 - Social Security-taxable wages are capped by the remaining wage base", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(9000),
      socialSecurityWagesAndTipsAlreadyReported: d(175500),
    }, c);

    expect(result.line9.toNumber()).toBe(600);
    expect(result.line10.toNumber()).toBe(600);
  });

  it("Form 8919 Line 11 - one dollar of remaining wage-base room rounds the Social Security tax down to zero", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(176099),
    }, c);

    expect(result.line9.toNumber()).toBe(1);
    expect(result.line10.toNumber()).toBe(1);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(73);
    expect(result.line13.toNumber()).toBe(73);

    const line11 = result.lines.find((line) => line.form === "Form 8919" && line.line === "11");
    expect(String(line11?.inputs["Line 10"])).toBe("1");
  });
});
