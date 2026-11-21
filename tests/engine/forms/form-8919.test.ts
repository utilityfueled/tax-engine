/**
 * Tests for Form 8919 summary support.
 * Spec: spec/federal/form-8919.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (value: number | string) => new Decimal(value);
const c = getConstants(2025);

describe("Form 8919 summary support", () => {
  it("records the final 2026 Form 8919 destinations at the annual wage-base boundary", () => {
    const input = TaxYearInputSchema.parse({
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
      w2s: [{
        ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary",
        wages: "198000", medicareWages: "198000", medicareWithheld: "2871",
        socialSecurityWages: "183000", socialSecurityTips: "500", socialSecurityWithheld: "11377",
      }],
      form8919: { accountHolder: "primary", wagesNotReportedOnW2: "4000" },
    });
    const actualW2 = input.w2s[0];
    const { form8919 } = input;
    if (!form8919 || actualW2.socialSecurityWages === undefined || actualW2.socialSecurityTips === undefined) {
      throw new Error("The Form 8919 summary and both W-2 boxes are required in this fixture");
    }
    const payroll = {
      socialSecurityWagesAndTipsAlreadyReported: d(actualW2.socialSecurityWages),
      w2SocialSecurityTipsAlreadyReported: d(actualW2.socialSecurityTips),
    };
    const result = calculateForm8919(form8919, FEDERAL_2026_CONSTANTS, payroll);

    // $184,500 - ($183,000 + $500) leaves $1,000 at 6.2%. All $4,000 is subject to 1.45%.
    expect([result.line6, result.line8, result.line9, result.line10, result.line11, result.line12, result.line13]
      .map(value => value.toFixed())).toEqual(["4000", "183500", "1000", "1000", "62", "58", "120"]);
    expect(calculateForm8919(form8919, FEDERAL_2026_CONSTANTS, {
      ...payroll, socialSecurityWagesAndTipsAlreadyReported: d("184000"),
    }).line13.toFixed()).toBe("58");
    const form8959 = calculateForm8959(input, d("0"), "single", FEDERAL_2026_CONSTANTS);
    expect(form8959.lines.find(line => line.line === "3")?.value.toFixed()).toBe("4000");
    expect(form8959.additionalMedicareTax.toFixed()).toBe("18"); // ($198,000 + $4,000 - $200,000) × 0.009.
    expect(() => calculateFederalTax(input)).toThrow(/Tax year 2026 rule pack .* is incomplete/);

    const annualAudit = (line: string) => result.lines.find(entry => entry.line === line);
    expect(annualAudit("1040-1g")?.value.toFixed()).toBe("4000");
    expect(annualAudit("6")?.formula).toContain("Form 8959 line 3");
    expect(annualAudit("13")?.formula).toContain("Schedule 2 line 16b");

    const historical = calculateForm8919(form8919, c, payroll);
    expect(historical.lines.find(line => line.line === "1040-1")?.value.toFixed()).toBe("4000");
    expect(historical.lines.find(line => line.line === "13")?.formula).toBe("Line 11 + Line 12");
  });

  it("Form 8919 Line 9 - records the actual tax-year wage base and subtracts the confirmed amounts", () => {
    // Forms 8919 lines 7–13 from the IRS 2025 and final 2026 copies.
    // 175,000 + 2,500 + 1,000 + 5,000 = 183,500 already subject to tax.
    // The 2026 wage base leaves $1,000; 6.2% = $62 and 1.45% of $10,000 = $145.
    // The 2025 wage base is already exhausted, leaving only the $145 Medicare tax.
    for (const [year, wageBase, remaining, tax] of [
      [2025, "176100", "0", "145"],
      [2026, "184500", "1000", "207"],
    ] as const) {
      const result = calculateForm8919({
        wagesNotReportedOnW2: d("10000"),
        rrtaCompensationSubjectToSocialSecurityTax: d("5000"),
      }, year === 2026 ? FEDERAL_2026_CONSTANTS : c, {
        socialSecurityWagesAndTipsAlreadyReported: d("175000"),
        w2SocialSecurityTipsAlreadyReported: d("2500"),
        form4137SocialSecurityTipsAlreadyReported: d("1000"),
      });

      expect(result.line8.toFixed()).toBe("183500");
      expect(result.line9.toFixed()).toBe(remaining);
      expect(result.line13.toFixed()).toBe(tax);
      const calculation = result.lines.find(line => line.line === "9");
      const sourceName = `${year} Social Security wage base`;
      expect(calculation?.formula).toContain(sourceName);
      expect(String(calculation?.inputs[sourceName])).toBe(wageBase);
    }
  });

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
