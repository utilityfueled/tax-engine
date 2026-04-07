/**
 * Tests for Pennsylvania Schedule F — Farm Income and Expenses
 * Spec: spec/state/pa-schedule-f.yaml
 */

import { describe, expect, it } from "vitest";
import { calculatePAScheduleF } from "@/engine/state/pa-schedule-f.js";

describe("Pennsylvania Schedule F — Farm Income and Expenses", () => {
  it("PA Schedule F Lines 1 through 12 compute gross farm income and exclude prior-year deferred crop insurance from current-year PA income", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      salesOfPurchasedLivestock: "6000.49",
      costOfPurchasedLivestock: "2500.50",
      salesOfProductsRaised: "40000.49",
      cooperativeDistributions: "3000.49",
      agriculturalProgramPayments: "2000.49",
      cccLoansElected: "1000.49",
      cropInsuranceProceeds: "5000.49",
      priorYearDeferredCropInsurance: "2500.49",
      customHireIncome: "1500.49",
      otherFarmIncome: "750.49",
    });

    expect(result.line1.toNumber()).toBe(6000);
    expect(result.line2.toNumber()).toBe(2501);
    expect(result.line3.toNumber()).toBe(3499);
    expect(result.line6.toNumber()).toBe(3000);
    expect(result.line8.toNumber()).toBe(1000);
    expect(result.line9.toNumber()).toBe(5000);
    expect(result.excludedPriorYearDeferredCropInsurance.toNumber()).toBe(2500);
    expect(result.line12.toNumber()).toBe(56749);
  });

  it("PA Schedule F Line 15 limits conservation deductions to 25 percent of gross farm income and carries the excess forward", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      salesOfProductsRaised: "40000",
      expenses: {
        conservation: "15000",
      },
      conservationCarryforward: "3000",
    });

    expect(result.line12.toNumber()).toBe(40000);
    expect(result.line15.toNumber()).toBe(10000);
    expect(result.conservationCarryforward.toNumber()).toBe(8000);
  });

  it("PA Schedule F Line 37 aggregates residual normalized expenses without dedicated Pennsylvania lines", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      expenses: {
        otherExpenses: "1200.49",
        carAndTruck: "300.49",
        rentLeaseVehicles: "400.49",
      },
    });

    expect(result.line37.toNumber()).toBe(1900);
  });

  it("PA Schedule F direct-entry breeding fees, jobs credit, and land clearing flow through the printed expense lines", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      salesOfProductsRaised: "30000",
      expenses: {
        breedingFees: "2500.50",
        laborHired: "5000.49",
        jobsCredit: "1200.50",
        landClearing: "800.50",
      },
    });

    expect(result.line13.toNumber()).toBe(2501);
    expect(result.line23a.toNumber()).toBe(5000);
    expect(result.line23b.toNumber()).toBe(1201);
    expect(result.line23c.toNumber()).toBe(3799);
    expect(result.line24.toNumber()).toBe(801);
    expect(result.line38.toNumber()).toBe(7101);
    expect(result.line39.toNumber()).toBe(22899);
  });

  it("PA Schedule F Line 38 totals supported farm deductions and Line 39 carries a loss when expenses exceed income", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      salesOfProductsRaised: "10000",
      expenses: {
        chemicals: "500",
        depreciation: "1500",
        employeeBenefits: "200",
        feed: "1500",
        fertilizersAndLime: "700",
        freightAndTrucking: "250",
        gasolineFuelOil: "400",
        insurance: "600",
        laborHired: "1200",
        customHire: "450",
        mortgageInterest: "300",
        otherInterest: "150",
        pensionAndProfitSharing: "175",
        rentLeaseOther: "800",
        repairsAndMaintenance: "900",
        seedsAndPlants: "650",
        storageAndWarehousing: "225",
        supplies: "300",
        taxes: "500",
        utilities: "400",
        veterinaryBreedingMedicine: "350",
        otherExpenses: "250",
      },
    });

    expect(result.line38.toNumber()).toBe(12300);
    expect(result.line39.toNumber()).toBe(-2300);
  });

  it("PA Schedule F direct-entry cooperative non-income items, materials and services, and Section 179 expense flow through the printed lines", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      cooperativeDistributions: "3000.49",
      cooperativeNonIncomeItems: "400.50",
      agriculturalProgramPayments: "2000.49",
      agriculturalProgramMaterialsServices: "750.50",
      salesOfProductsRaised: "10000",
      expenses: {
        section179Expense: "1500.50",
      },
    });

    expect(result.line5a.toNumber()).toBe(3000);
    expect(result.line5b.toNumber()).toBe(401);
    expect(result.line6.toNumber()).toBe(2599);
    expect(result.line7a.toNumber()).toBe(2000);
    expect(result.line7b.toNumber()).toBe(751);
    expect(result.line12.toNumber()).toBe(15350);
    expect(result.line16b.toNumber()).toBe(1501);
    expect(result.line38.toNumber()).toBe(1501);
    expect(result.line39.toNumber()).toBe(13849);
  });

  it("PA Schedule F accrual method computes Section III gross income and carries Line 51 to Section I Line 12", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      accountingMethod: "accrual",
      accrualSalesDuringYear: "70000.49",
      agriculturalProgramPayments: "2000.49",
      agriculturalProgramMaterialsServices: "500.50",
      cccLoansElected: "1000.49",
      cccLoansForfeited: "400.50",
      customHireIncome: "300.50",
      otherFarmIncome: "2500.49",
      accrualBeginningInventory: "15000.49",
      accrualPurchasesDuringYear: "18000.50",
      accrualEndingInventory: "12000.49",
      expenses: {
        feed: "5000",
      },
    });

    expect(result.line40.toNumber()).toBe(70000);
    expect(result.line41a.toNumber()).toBe(2000);
    expect(result.line41b.toNumber()).toBe(501);
    expect(result.line42.toNumber()).toBe(1401);
    expect(result.line43.toNumber()).toBe(301);
    expect(result.line44.toNumber()).toBe(2500);
    expect(result.line45.toNumber()).toBe(76703);
    expect(result.line46.toNumber()).toBe(15000);
    expect(result.line47.toNumber()).toBe(18001);
    expect(result.line48.toNumber()).toBe(33001);
    expect(result.line49.toNumber()).toBe(12000);
    expect(result.line50.toNumber()).toBe(21001);
    expect(result.line51.toNumber()).toBe(55702);
    expect(result.line12.toNumber()).toBe(55702);
    expect(result.line38.toNumber()).toBe(5000);
    expect(result.line39.toNumber()).toBe(50702);
    expect(result.line1.toNumber()).toBe(0);
    expect(result.line4.toNumber()).toBe(0);
  });

  it("PA Schedule F optional direct-entry lines default to zero when omitted", () => {
    const result = calculatePAScheduleF({
      taxYear: 2025,
      salesOfProductsRaised: "1000",
    });

    expect(result.line5b.toNumber()).toBe(0);
    expect(result.line7b.toNumber()).toBe(0);
    expect(result.line16b.toNumber()).toBe(0);
    expect(result.line39.toNumber()).toBe(1000);
  });
});
