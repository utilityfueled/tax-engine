/**
 * Tests for Pennsylvania Schedule C — Profit or Loss from Business or Profession
 * Spec: spec/state/pa-schedule-c.yaml
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculatePAScheduleC } from "@/engine/state/pa-schedule-c.js";

const d = (value: number | string) => new Decimal(value);

describe("Pennsylvania Schedule C — Profit or Loss from Business or Profession", () => {
  it("PA Schedule C Lines 1a through 5 compute business income before deductions", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: d("100000.40"),
      returnsAndAllowances: d("250.50"),
      costOfGoodsSold: d("14999.50"),
    });

    expect(result.line1a.toNumber()).toBe(100000);
    expect(result.line1b.toNumber()).toBe(251);
    expect(result.line1c.toNumber()).toBe(99749);
    expect(result.line2.toNumber()).toBe(15000);
    expect(result.line3.toNumber()).toBe(84749);
    expect(result.line4.toNumber()).toBe(0);
    expect(result.line5.toNumber()).toBe(84749);
  });

  it("PA Schedule C Line 4 carries supported other business income into total income", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: d("4000.40"),
      costOfGoodsSold: d("999.50"),
      otherIncome: d("1250.50"),
    });

    expect(result.line3.toNumber()).toBe(3000);
    expect(result.line4.toNumber()).toBe(1251);
    expect(result.line5.toNumber()).toBe(4251);
  });

  it("PA Schedule C Line 31 includes meals at 100 percent for Pennsylvania", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      expenses: {
        travel: d("150.49"),
        meals: d("99.50"),
      },
    });

    expect(result.line31.toNumber()).toBe(250);
  });

  it("PA Schedule C Line 38 totals the supported deduction lines including Pennsylvania Section 179 expense", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      expenses: {
        advertising: d("100.49"),
        carAndTruck: d("200.49"),
        depreciation: d("300.49"),
        section179Expense: d("450.50"),
        insurance: d("400.49"),
        legalAndProfessional: d("500.49"),
        officeExpense: d("600.49"),
        contractLabor: d("700.49"),
        supplies: d("800.49"),
        travel: d("900.49"),
        meals: d("100.49"),
        utilities: d("1100.49"),
        otherExpenses: d("1200.49"),
      },
    });

    expect(result.line6.toNumber()).toBe(100);
    expect(result.line10.toNumber()).toBe(200);
    expect(result.line13a.toNumber()).toBe(300);
    expect(result.line13b.toNumber()).toBe(451);
    expect(result.line17.toNumber()).toBe(400);
    expect(result.line20.toNumber()).toBe(500);
    expect(result.line22.toNumber()).toBe(600);
    expect(result.line27.toNumber()).toBe(700);
    expect(result.line28.toNumber()).toBe(800);
    expect(result.line31.toNumber()).toBe(1000);
    expect(result.line32.toNumber()).toBe(1100);
    expect(result.line37.toNumber()).toBe(1200);
    expect(result.line38.toNumber()).toBe(7351);
  });

  it("PA Schedule C Lines 7, 8, 9, 14, 16, 19, 21, and 24 carry additional printed deduction lines into total expenses", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      expenses: {
        amortization: d("70.49"),
        badDebts: d("80.50"),
        bankCharges: d("90.49"),
        duesAndPublications: d("140.50"),
        freight: d("160.49"),
        laundryAndCleaning: d("190.50"),
        managementFees: d("210.49"),
        postage: d("240.50"),
      } as unknown as Parameters<typeof calculatePAScheduleC>[0]["expenses"],
    });

    expect(result.line7.toNumber()).toBe(70);
    expect(result.line8.toNumber()).toBe(81);
    expect(result.line9.toNumber()).toBe(90);
    expect(result.line14.toNumber()).toBe(141);
    expect(result.line16.toNumber()).toBe(160);
    expect(result.line19.toNumber()).toBe(191);
    expect(result.line21.toNumber()).toBe(210);
    expect(result.line24.toNumber()).toBe(241);
    expect(result.line38.toNumber()).toBe(1184);
  });

  it("PA Schedule C Lines 34, 35, and 36 carry Pennsylvania IDC and start-up-cost deductions into total expenses", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      expenses: {
        idcsCurrentExpensing: d("340.50"),
        idcsAmortization: d("350.49"),
        startupCostsDirectExpense: d("360.50"),
      } as unknown as Parameters<typeof calculatePAScheduleC>[0]["expenses"],
    });

    expect(result.line34.toNumber()).toBe(341);
    expect(result.line35.toNumber()).toBe(350);
    expect(result.line36.toNumber()).toBe(361);
    expect(result.line38.toNumber()).toBe(1052);
  });

  it("PA Schedule C Line 37 includes actual home-office costs in other expenses", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: d("10000"),
      expenses: {
        otherExpenses: d("300.49"),
      },
      homeOffice: {
        method: "actual",
        actualAmount: d("2499.50"),
      },
    });

    expect(result.line37.toNumber()).toBe(2800);
    expect(result.line38.toNumber()).toBe(2800);
    expect(result.line39.toNumber()).toBe(7200);
  });

  it("PA Schedule C Line 37 ignores the federal simplified home-office method", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: d("10000"),
      expenses: {
        otherExpenses: d("300.49"),
      },
      homeOffice: {
        method: "simplified",
        squareFeet: 200,
      },
    });

    expect(result.line37.toNumber()).toBe(300);
    expect(result.line38.toNumber()).toBe(300);
    expect(result.line39.toNumber()).toBe(9700);
  });

  it("PA Schedule C Line 37 can derive the actual home-office amount from Form 8829 facts", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: d("60000"),
      homeOffice: {
        method: "actual",
        form8829: {
          areaUsedForBusiness: 300,
          totalAreaOfHome: 1500,
          directExpenses: {
            repairsAndMaintenance: "400",
          },
          indirectExpenses: {
            deductibleMortgageInterest: "6000",
            realEstateTaxes: "3000",
            insurance: "1200",
            utilities: "2400",
            repairsAndMaintenance: "1000",
            otherExpenses: "600",
          },
          adjustedBasisOrFairMarketValue: "240000",
          landValue: "60000",
          depreciationPercentage: "0.02564",
        },
      },
    });

    expect(result.line37.toNumber()).toBe(4163);
    expect(result.line38.toNumber()).toBe(4163);
    expect(result.line39.toNumber()).toBe(55837);
  });

  it("PA Schedule C Lines 18, 23, 29, 30, and 33 carry additional printed deduction lines into total expenses", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      expenses: {
        businessInterest: d("180.50"),
        pensionAndProfitSharing: d("230.49"),
        taxes: d("290.50"),
        telephone: d("300.49"),
        wages: d("330.50"),
      },
    });

    expect(result.line18.toNumber()).toBe(181);
    expect(result.line23.toNumber()).toBe(230);
    expect(result.line29.toNumber()).toBe(291);
    expect(result.line30.toNumber()).toBe(300);
    expect(result.line33.toNumber()).toBe(331);
    expect(result.line38.toNumber()).toBe(1333);
  });

  it("PA Schedule C Lines 11, 12, 15, 25, and 26 carry additional printed deduction lines into total expenses", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      expenses: {
        commissionsAndFees: d("110.50"),
        depletion: d("120.49"),
        employeeBenefitPrograms: d("150.50"),
        rentOnBusinessProperty: d("250.50"),
        repairsAndMaintenance: d("260.49"),
      },
    });

    expect(result.line11.toNumber()).toBe(111);
    expect(result.line12.toNumber()).toBe(120);
    expect(result.line15.toNumber()).toBe(151);
    expect(result.line25.toNumber()).toBe(251);
    expect(result.line26.toNumber()).toBe(260);
    expect(result.line38.toNumber()).toBe(893);
  });

  it("PA Schedule C Line 39 carries a net loss when expenses exceed income", () => {
    const result = calculatePAScheduleC({
      taxYear: 2025,
      grossReceipts: d(5000),
      expenses: {
        otherExpenses: d(7000),
      },
    });

    expect(result.line5.toNumber()).toBe(5000);
    expect(result.line38.toNumber()).toBe(7000);
    expect(result.line39.toNumber()).toBe(-2000);
  });
});
