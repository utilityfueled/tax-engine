/**
 * Tests for the Social Security Benefits Worksheet.
 * Spec: spec/federal/social-security-benefits-worksheet.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateSocialSecurityBenefitsWorksheet } from "@/engine/forms/social-security-benefits-worksheet.js";

const d = (value: number | string) => new Decimal(value);

const line6Fixture = calculateSocialSecurityBenefitsWorksheet({
  filingStatus: "single",
  benefitsReceived: d(24000),
  otherIncome: d(10000),
  taxExemptInterest: d(1000),
  adjustments: {
    businessExpenseAdjustments: d(450),
    hsaDeduction: d(1000),
    armedForcesMovingExpenses: d(700),
    seDeduction: d(500),
    archerMSADeduction: d(900),
    otherAdjustmentsTotal: d(600),
    studentLoanInterest: d(2500),
    iraDeduction: d(700),
    educatorExpenses: d(300),
  },
});

const phaseInFixture = calculateSocialSecurityBenefitsWorksheet({
  filingStatus: "single",
  benefitsReceived: d(24000),
  otherIncome: d(18000),
  taxExemptInterest: d(0),
  adjustments: {},
});

const upperTierFixture = calculateSocialSecurityBenefitsWorksheet({
  filingStatus: "single",
  benefitsReceived: d(30000),
  otherIncome: d(25000),
  taxExemptInterest: d(0),
  adjustments: {},
});

const mfjFixture = calculateSocialSecurityBenefitsWorksheet({
  filingStatus: "married_filing_jointly",
  benefitsReceived: d(40000),
  otherIncome: d(15000),
  taxExemptInterest: d(0),
  adjustments: {},
});

const mfsLivedWithSpouseFixture = calculateSocialSecurityBenefitsWorksheet({
  filingStatus: "married_filing_separately",
  livedWithSpouseAtAnyTimeDuringYear: true,
  benefitsReceived: d(20000),
  otherIncome: d(10000),
  taxExemptInterest: d(0),
  adjustments: {},
});

describe("Social Security Benefits Worksheet", () => {
  it("Social Security Benefits Worksheet Line 1 - aggregates SSA-1099 and RRB-1099 equivalent Box 5 benefits", () => {
    expect(line6Fixture.line1.toNumber()).toBe(24000);
  });

  it("Social Security Benefits Worksheet Line 2 - uses half of total benefits", () => {
    expect(line6Fixture.line2.toNumber()).toBe(12000);
  });

  it("Social Security Benefits Worksheet Line 3 - includes other taxable income before Social Security", () => {
    expect(phaseInFixture.line3.toNumber()).toBe(18000);
  });

  it("Social Security Benefits Worksheet Line 4 - includes tax-exempt interest in provisional income", () => {
    expect(line6Fixture.line4.toNumber()).toBe(1000);
  });

  it("Social Security Benefits Worksheet Line 5 - sums half benefits, other income, and tax-exempt interest", () => {
    expect(line6Fixture.line5.toNumber()).toBe(23000);
  });

  it("Social Security Benefits Worksheet Line 6 - adds back the supported 2025 Schedule 1 adjustments including lines 12 and 14 plus line 25 total other adjustments", () => {
    expect(line6Fixture.line6.toNumber()).toBe(5150);
  });

  it("Social Security Benefits Worksheet Line 6 - audit trail names the supported 2025 add-back categories, includes lines 12 and 14 plus line 25 total other adjustments, and excludes student loan interest", () => {
    const auditLine6 = line6Fixture.lines.find((line) => line.form === "SS Worksheet" && line.line === "6");

    expect(auditLine6?.formula).toContain("Supported 2025 Schedule 1 adjustment categories");
    expect((auditLine6?.inputs["Supported Schedule 1 business expense adjustments"] as Decimal).toNumber()).toBe(450);
    expect((auditLine6?.inputs["Supported Schedule 1 Archer MSA deduction"] as Decimal).toNumber()).toBe(900);
    expect((auditLine6?.inputs["Supported Schedule 1 Armed Forces moving expenses"] as Decimal).toNumber()).toBe(700);
    expect((auditLine6?.inputs["Supported Schedule 1 educator expenses"] as Decimal).toNumber()).toBe(300);
    expect((auditLine6?.inputs["Supported Schedule 1 Line 25 total other adjustments"] as Decimal).toNumber()).toBe(600);
    expect(
      (auditLine6?.inputs["Excluded Schedule 1 student loan interest"] as Decimal).toNumber()
    ).toBe(2500);
  });

  it("Social Security Benefits Worksheet Line 7 - computes provisional income after adjustment add-backs", () => {
    expect(line6Fixture.line7.toNumber()).toBe(17850);
  });

  it("Social Security Benefits Worksheet Line 8 - uses the correct filing-status base amount", () => {
    expect(mfjFixture.line8.toNumber()).toBe(32000);
    expect(mfsLivedWithSpouseFixture.line8.toNumber()).toBe(0);
  });

  it("Social Security Benefits Worksheet Line 9 - zeroes out when provisional income does not exceed the base amount", () => {
    expect(line6Fixture.line9.toNumber()).toBe(0);
  });

  it("Social Security Benefits Worksheet Line 10 - uses the correct second-tier width", () => {
    expect(phaseInFixture.line10.toNumber()).toBe(9000);
    expect(mfjFixture.line10.toNumber()).toBe(12000);
  });

  it("Social Security Benefits Worksheet Line 11 - starts the 85 percent tier only above the second-tier width", () => {
    expect(phaseInFixture.line11.toNumber()).toBe(0);
    expect(upperTierFixture.line11.toNumber()).toBe(6000);
  });

  it("Social Security Benefits Worksheet Line 12 - caps the lower-tier band before halving it", () => {
    expect(phaseInFixture.line12.toNumber()).toBe(5000);
    expect(upperTierFixture.line12.toNumber()).toBe(9000);
  });

  it("Social Security Benefits Worksheet Line 13 - halves the lower-tier amount", () => {
    expect(phaseInFixture.line13.toNumber()).toBe(2500);
  });

  it("Social Security Benefits Worksheet Line 14 - limits the lower-tier inclusion to one-half of benefits", () => {
    expect(phaseInFixture.line14.toNumber()).toBe(2500);
  });

  it("Social Security Benefits Worksheet Line 15 - applies the 85 percent rate to the upper-tier excess", () => {
    expect(upperTierFixture.line15.toNumber()).toBe(5100);
  });

  it("Social Security Benefits Worksheet Line 16 - uses the standard branch or the MFS lived-with-spouse branch", () => {
    expect(upperTierFixture.line16.toNumber()).toBe(9600);
    expect(mfsLivedWithSpouseFixture.line16.toNumber()).toBe(17000);
  });

  it("Social Security Benefits Worksheet Line 16 - MFS lived-with-spouse branch floors negative provisional income at zero", () => {
    const negativeProvisionalIncomeFixture = calculateSocialSecurityBenefitsWorksheet({
      filingStatus: "married_filing_separately",
      livedWithSpouseAtAnyTimeDuringYear: true,
      benefitsReceived: d(10000),
      otherIncome: d(0),
      taxExemptInterest: d(0),
      adjustments: {
        hsaDeduction: d(6000),
      },
    });

    expect(negativeProvisionalIncomeFixture.line7.toNumber()).toBe(-1000);
    expect(negativeProvisionalIncomeFixture.line16.toNumber()).toBe(0);
    expect(negativeProvisionalIncomeFixture.line18.toNumber()).toBe(0);
  });

  it("Social Security Benefits Worksheet Line 17 - limits taxable benefits to 85 percent of total benefits", () => {
    expect(upperTierFixture.line17.toNumber()).toBe(25500);
  });

  it("Social Security Benefits Worksheet Line 18 - computes taxable benefits across the 0 percent, 50 percent, and 85 percent ranges", () => {
    expect(line6Fixture.line18.toNumber()).toBe(0);
    expect(phaseInFixture.line18.toNumber()).toBe(2500);
    expect(upperTierFixture.line18.toNumber()).toBe(9600);
    expect(mfsLivedWithSpouseFixture.line18.toNumber()).toBe(17000);
  });

  it("Social Security Benefits Worksheet W2-21 - computes the additional taxable benefits for a prior-year lump-sum payment", () => {
    const result = calculateSocialSecurityBenefitsWorksheet({
      filingStatus: "single",
      benefitsReceived: d(2000),
      otherIncome: d(0),
      taxExemptInterest: d(0),
      adjustments: {},
      lumpSumElection: {
        currentYearExclusionsAdjustments: d(0),
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: d(10000),
            delayedBenefitsReceivedInCurrentYear: d(2000),
            adjustedGrossIncome: d(29000),
            taxExemptInterest: d(0),
            exclusionsAdjustments: d(0),
            taxableBenefitsPreviouslyReported: d(3000),
          },
        ],
      },
    });

    expect(result.lumpSumElectionAdditionalBenefitsByYear).toHaveLength(1);
    expect(result.lumpSumElectionAdditionalBenefitsByYear[0]?.taxYear).toBe(2024);
    expect(result.lumpSumElectionAdditionalBenefitsByYear[0]?.additionalTaxableBenefits.toNumber()).toBe(500);
    expect(result.standardTaxableBenefits.toNumber()).toBe(0);
    expect(result.usedLumpSumElection).toBe(false);
    expect(result.taxableBenefits.toNumber()).toBe(0);
  });

  it("Social Security Benefits Worksheet W2-21 - audit trail preserves the earlier-year lump-sum election inputs", () => {
    const result = calculateSocialSecurityBenefitsWorksheet({
      filingStatus: "single",
      benefitsReceived: d(2000),
      otherIncome: d(0),
      taxExemptInterest: d(0),
      adjustments: {},
      lumpSumElection: {
        currentYearExclusionsAdjustments: d(0),
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "married_filing_separately",
            livedWithSpouseAtAnyTimeDuringYear: true,
            benefitsReceivedInEarlierYear: d(10000),
            delayedBenefitsReceivedInCurrentYear: d(2000),
            adjustedGrossIncome: d(29000),
            taxExemptInterest: d(150),
            exclusionsAdjustments: d(300),
            taxableBenefitsPreviouslyReported: d(3000),
          },
        ],
      },
    });

    const auditLine = result.lines.find((line) => line.form === "SS Worksheet" && line.line === "W2-21 (2024)");

    expect(auditLine?.inputs["Earlier-year filing status"]).toBe("married_filing_separately");
    expect(auditLine?.inputs["Earlier-year lived with spouse during the year"]).toBe("yes");
    expect((auditLine?.inputs["Earlier-year benefits received"] as Decimal).toNumber()).toBe(10000);
    expect((auditLine?.inputs["Delayed benefits received in current year"] as Decimal).toNumber()).toBe(2000);
    expect((auditLine?.inputs["Earlier-year adjusted gross income"] as Decimal).toNumber()).toBe(29000);
    expect((auditLine?.inputs["Earlier-year tax-exempt interest"] as Decimal).toNumber()).toBe(150);
    expect((auditLine?.inputs["Earlier-year exclusions and adjustments"] as Decimal).toNumber()).toBe(300);
    expect((auditLine?.inputs["Taxable benefits previously reported"] as Decimal).toNumber()).toBe(3000);
    expect((auditLine?.inputs["Refigured taxable benefits"] as Decimal).toNumber()).toBeGreaterThanOrEqual(3000);
  });

  it("Social Security Benefits Worksheet W4-21 - uses the Pub. 915 lump-sum election when it lowers current-year taxable benefits", () => {
    const result = calculateSocialSecurityBenefitsWorksheet({
      filingStatus: "single",
      benefitsReceived: d(11000),
      otherIncome: d(25500),
      taxExemptInterest: d(0),
      adjustments: {},
      lumpSumElection: {
        currentYearExclusionsAdjustments: d(0),
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: d(0),
            delayedBenefitsReceivedInCurrentYear: d(2000),
            adjustedGrossIncome: d(23000),
            taxExemptInterest: d(0),
            exclusionsAdjustments: d(0),
            taxableBenefitsPreviouslyReported: d(0),
          },
        ],
      },
    });

    expect(result.standardTaxableBenefits.toNumber()).toBe(3000);
    expect(result.lumpSumElectionTaxableBenefits?.toNumber()).toBe(2500);
    expect(result.usedLumpSumElection).toBe(true);
    expect(result.taxableBenefits.toNumber()).toBe(2500);
  });

  it("Social Security Benefits Worksheet W4-21 - audit trail preserves the current-year election comparison inputs", () => {
    const result = calculateSocialSecurityBenefitsWorksheet({
      filingStatus: "single",
      benefitsReceived: d(11000),
      otherIncome: d(25500),
      taxExemptInterest: d(250),
      adjustments: {
        hsaDeduction: d(500),
      },
      lumpSumElection: {
        currentYearExclusionsAdjustments: d(300),
        earlierYears: [
          {
            taxYear: 2024,
            filingStatus: "single",
            benefitsReceivedInEarlierYear: d(0),
            delayedBenefitsReceivedInCurrentYear: d(2000),
            adjustedGrossIncome: d(23000),
            taxExemptInterest: d(0),
            exclusionsAdjustments: d(0),
            taxableBenefitsPreviouslyReported: d(0),
          },
        ],
      },
    });

    const auditLine = result.lines.find((line) => line.form === "SS Worksheet" && line.line === "W4-21");

    expect((auditLine?.inputs["Current-year benefits excluding prior-year delayed payments"] as Decimal).toNumber()).toBe(9000);
    expect((auditLine?.inputs["Current-year exclusions and adjustments"] as Decimal).toNumber()).toBe(300);
    expect((auditLine?.inputs["Current-year Pub. 915 provisional income"] as Decimal).toNumber()).toBe(30050);
    expect((auditLine?.inputs["Current-year taxable benefits under Pub. 915 Worksheet 4"] as Decimal).toNumber()).toBe(2525);
    expect((auditLine?.inputs["Total additional taxable benefits from earlier years"] as Decimal).toNumber()).toBe(0);
    expect((auditLine?.inputs["Standard taxable benefits"] as Decimal).toNumber()).toBeGreaterThan(2500);
    expect(auditLine?.inputs["Election used"]).toBe("yes");
  });
});
