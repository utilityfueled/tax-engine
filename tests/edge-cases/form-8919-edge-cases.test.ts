/**
 * Edge case tests for Form 8919 wage-base coordination.
 * Spec: spec/federal/form-8919.yaml
 *
 * Key constants (2025):
 *   Social Security wage base: $176,100
 *   Employee SS rate: 6.2% (half of 12.4%)
 *   Employee Medicare rate: 1.45% (half of 2.9%)
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { getConstants } from "@/models/constants.js";

const d = (value: string | number) => new Decimal(value);
const c = getConstants(2025);

describe("Form 8919 wage-base edge cases", () => {
  it("uses a validated Line 8 override above the wage base even when lower W-2 and Form 4137 defaults exist", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(12000),
      socialSecurityWagesAndTipsAlreadyReported: d(176500),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
      w2SocialSecurityTipsAlreadyReported: d(800),
      form4137SocialSecurityTipsAlreadyReported: d(1200),
    });

    expect(result.line8.toNumber()).toBe(176500);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(174);
    expect(result.line13.toNumber()).toBe(174);

    const line8 = result.lines.find((line) => line.form === "Form 8919" && line.line === "8");
    expect(String(line8?.inputs["Validated line 8 override"])).toBe("176500");
    expect(String(line8?.inputs["Defaulted W-2 Box 3 Social Security wages"])).toBe("170000");
    expect(String(line8?.inputs["Defaulted W-2 Box 7 Social Security tips"])).toBe("800");
    expect(String(line8?.inputs["Supported Form 4137 Line 10 tips"])).toBe("1200");
  });

  it("rounds the Line 11 Social Security tax up to $1 when nine dollars of wage-base room remain", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(176091),
    }, c);

    expect(result.line9.toNumber()).toBe(9);
    expect(result.line10.toNumber()).toBe(9);
    expect(result.line11.toNumber()).toBe(1);
    expect(result.line12.toNumber()).toBe(73);
    expect(result.line13.toNumber()).toBe(74);
  });

  it("caps supported RRTA compensation at the annual Social Security wage base before adding it to the default Line 8 total", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      rrtaCompensationSubjectToSocialSecurityTax: d(176101),
    }, c);

    expect(result.line8.toNumber()).toBe(176100);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);

    const line8 = result.lines.find((line) => line.form === "Form 8919" && line.line === "8");
    expect(String(line8?.inputs["Validated RRTA compensation subject to the 6.2% Social Security rate"])).toBe("176101");
    expect(String(line8?.inputs["Supported RRTA compensation included on Line 8"])).toBe("176100");
  });
});

describe("Form 8919 zero and boundary wages", () => {
  it("Form 8919 Line 6 - zero wages produce zero tax on all lines", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(0),
    }, c);

    expect(result.line6.toNumber()).toBe(0);
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(176100);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("Form 8919 Line 9 - Line 8 exactly at the wage base ($176,100) leaves zero SS room", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(10000),
      socialSecurityWagesAndTipsAlreadyReported: d(176100),
    }, c);

    expect(result.line8.toNumber()).toBe(176100);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare still applies on all wages
    expect(result.line12.toNumber()).toBe(145);
    expect(result.line13.toNumber()).toBe(145);
  });

  it("Form 8919 Line 9 - Line 8 at $176,099 leaves exactly $1 of SS room, Line 11 rounds to $0", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(176099),
    }, c);

    // Room = 176100 - 176099 = 1
    expect(result.line9.toNumber()).toBe(1);
    // Line 10 = min(5000, 1) = 1
    expect(result.line10.toNumber()).toBe(1);
    // Line 11 = round(1 × 0.062) = round(0.062) = 0
    expect(result.line11.toNumber()).toBe(0);
    // Medicare = round(5000 × 0.0145) = round(72.5) = 73
    expect(result.line12.toNumber()).toBe(73);
    expect(result.line13.toNumber()).toBe(73);
  });

  it("Form 8919 Line 10 - wages less than remaining room are fully subject to SS tax", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(500),
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
    }, c);

    // Room = 176100 - 100000 = 76100, wages = 500
    expect(result.line9.toNumber()).toBe(76100);
    // Line 10 = min(500, 76100) = 500
    expect(result.line10.toNumber()).toBe(500);
    // Line 11 = round(500 × 0.062) = round(31) = 31
    expect(result.line11.toNumber()).toBe(31);
    // Line 12 = round(500 × 0.0145) = round(7.25) = 7
    expect(result.line12.toNumber()).toBe(7);
    expect(result.line13.toNumber()).toBe(38);
  });

  it("Form 8919 Line 10 - remaining room less than wages caps SS-taxable amount", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(10000),
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
    }, c);

    // Room = 176100 - 170000 = 6100
    expect(result.line9.toNumber()).toBe(6100);
    // Line 10 = min(10000, 6100) = 6100
    expect(result.line10.toNumber()).toBe(6100);
    // Line 11 = round(6100 × 0.062) = round(378.2) = 378
    expect(result.line11.toNumber()).toBe(378);
    // Line 12 = round(10000 × 0.0145) = round(145) = 145
    expect(result.line12.toNumber()).toBe(145);
    expect(result.line13.toNumber()).toBe(523);
  });
});

describe("Form 8919 default Line 8 from W-2 and Form 4137 components", () => {
  it("Form 8919 Line 8 - defaults to W-2 Box 3 wages when no override, tips, or RRTA provided", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(8000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(50000),
    });

    expect(result.line8.toNumber()).toBe(50000);
    // Room = 176100 - 50000 = 126100
    expect(result.line9.toNumber()).toBe(126100);
    // Line 10 = min(8000, 126100) = 8000
    expect(result.line10.toNumber()).toBe(8000);
    // Line 11 = round(8000 × 0.062) = round(496) = 496
    expect(result.line11.toNumber()).toBe(496);

    const line8 = result.lines.find((line) => line.form === "Form 8919" && line.line === "8");
    expect(line8?.description).toContain("Social Security wages and tips already subject to tax");
  });

  it("Form 8919 Line 8 - sums W-2 Box 3 wages, W-2 Box 7 tips, and Form 4137 tips in the default", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
      w2SocialSecurityTipsAlreadyReported: d(2000),
      form4137SocialSecurityTipsAlreadyReported: d(3000),
    });

    // Default Line 8 = 100000 + 2000 + 3000 = 105000
    expect(result.line8.toNumber()).toBe(105000);
    expect(result.line9.toNumber()).toBe(71100);
    expect(result.line10.toNumber()).toBe(5000);
  });

  it("Form 8919 Line 8 - validated override takes precedence over all default components", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(160000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(100000),
      w2SocialSecurityTipsAlreadyReported: d(2000),
      form4137SocialSecurityTipsAlreadyReported: d(3000),
    });

    // Override = 160000 wins over default sum of 105000
    expect(result.line8.toNumber()).toBe(160000);
    expect(result.line9.toNumber()).toBe(16100);
    expect(result.line10.toNumber()).toBe(5000);
  });

  it("Form 8919 Line 8 - RRTA compensation adds to the default alongside W-2 components", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      rrtaCompensationSubjectToSocialSecurityTax: d(20000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(80000),
      w2SocialSecurityTipsAlreadyReported: d(1000),
    });

    // Default Line 8 = 80000 + 1000 + 0 (no 4137) + min(176100, 20000) = 101000
    expect(result.line8.toNumber()).toBe(101000);
    expect(result.line9.toNumber()).toBe(75100);
    expect(result.line10.toNumber()).toBe(5000);
  });
});

describe("Form 8919 full wage-base room and Medicare-only scenarios", () => {
  it("Form 8919 Line 9 - full wage-base room when no prior SS wages exist", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(50000),
    }, c);

    // Line 8 defaults to 0 (no W-2 info, no RRTA)
    expect(result.line8.toNumber()).toBe(0);
    expect(result.line9.toNumber()).toBe(176100);
    expect(result.line10.toNumber()).toBe(50000);
    // Line 11 = round(50000 × 0.062) = 3100
    expect(result.line11.toNumber()).toBe(3100);
    // Line 12 = round(50000 × 0.0145) = round(725) = 725
    expect(result.line12.toNumber()).toBe(725);
    expect(result.line13.toNumber()).toBe(3825);
  });

  it("Form 8919 Lines 11-12 - Medicare tax still applies when SS wage-base room is exhausted", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(25000),
      socialSecurityWagesAndTipsAlreadyReported: d(176100),
    }, c);

    // No SS room
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare = round(25000 × 0.0145) = round(362.5) = 363
    expect(result.line12.toNumber()).toBe(363);
    expect(result.line13.toNumber()).toBe(363);
  });

  it("Form 8919 Line 10 - wages exactly equal remaining room are fully SS-taxable", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(6100),
      socialSecurityWagesAndTipsAlreadyReported: d(170000),
    }, c);

    // Room = 176100 - 170000 = 6100, wages = 6100
    expect(result.line9.toNumber()).toBe(6100);
    expect(result.line10.toNumber()).toBe(6100);
    // Line 11 = round(6100 × 0.062) = round(378.2) = 378
    expect(result.line11.toNumber()).toBe(378);
    // Line 12 = round(6100 × 0.0145) = round(88.45) = 88
    expect(result.line12.toNumber()).toBe(88);
    expect(result.line13.toNumber()).toBe(466);
  });

  it("Form 8919 Line 12 - very large wages ($500,000) only Medicare applies when SS room exhausted", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(500000),
      socialSecurityWagesAndTipsAlreadyReported: d(200000),
    }, c);

    // SS room exhausted (200000 > 176100)
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare = round(500000 × 0.0145) = round(7250) = 7250
    expect(result.line12.toNumber()).toBe(7250);
    expect(result.line13.toNumber()).toBe(7250);
  });

  it("Form 8919 Line 12 - $34 wages produce $0 Medicare tax (rounds down from 0.493)", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(34),
    }, c);

    // Medicare = round(34 × 0.0145) = round(0.493) = 0
    expect(result.line12.toNumber()).toBe(0);
    // SS = round(34 × 0.062) = round(2.108) = 2
    expect(result.line11.toNumber()).toBe(2);
    expect(result.line13.toNumber()).toBe(2);
  });

  it("Form 8919 Line 12 - $35 wages produce $1 Medicare tax (rounds up from 0.5075)", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(35),
    }, c);

    // Medicare = round(35 × 0.0145) = round(0.5075) = 1
    expect(result.line12.toNumber()).toBe(1);
    // SS = round(35 × 0.062) = round(2.17) = 2
    expect(result.line11.toNumber()).toBe(2);
    expect(result.line13.toNumber()).toBe(3);
  });

  it("Form 8919 Line 6 - negative wage input floors at zero", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(-5000),
    }, c);

    expect(result.line6.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    expect(result.line12.toNumber()).toBe(0);
    expect(result.line13.toNumber()).toBe(0);
  });

  it("Form 8919 Line 8 - RRTA at exactly the wage base ($176,100) uses full amount", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(10000),
      rrtaCompensationSubjectToSocialSecurityTax: d(176100),
    }, c);

    // RRTA capped at min(176100, 176100) = 176100
    expect(result.line8.toNumber()).toBe(176100);
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare still applies
    expect(result.line12.toNumber()).toBe(145);
    expect(result.line13.toNumber()).toBe(145);
  });

  it("Form 8919 Line 8 - default sum exceeds wage base but is not capped (unlike RRTA)", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
    }, c, {
      socialSecurityWagesAndTipsAlreadyReported: d(150000),
      w2SocialSecurityTipsAlreadyReported: d(20000),
      form4137SocialSecurityTipsAlreadyReported: d(15000),
    });

    // Default Line 8 = 150000 + 20000 + 15000 = 185000 (exceeds wage base, but default is not capped)
    expect(result.line8.toNumber()).toBe(185000);
    // Room = max(0, 176100 - 185000) = 0
    expect(result.line9.toNumber()).toBe(0);
    expect(result.line10.toNumber()).toBe(0);
    expect(result.line11.toNumber()).toBe(0);
    // Medicare = round(5000 × 0.0145) = 73
    expect(result.line12.toNumber()).toBe(73);
  });

  it("Form 8919 Line 11 - SS tax rounds down from $0.496 to $0 at 8 dollars of room", () => {
    const result = calculateForm8919({
      wagesNotReportedOnW2: d(5000),
      socialSecurityWagesAndTipsAlreadyReported: d(176092),
    }, c);

    // Room = 176100 - 176092 = 8
    expect(result.line9.toNumber()).toBe(8);
    expect(result.line10.toNumber()).toBe(8);
    // Line 11 = round(8 × 0.062) = round(0.496) = 0
    expect(result.line11.toNumber()).toBe(0);
  });
});
