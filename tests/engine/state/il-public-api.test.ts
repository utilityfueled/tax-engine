import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import {
  calculateFederalTax,
  calculateIllinoisReturn,
  calculateIL1040,
  calculateSchedule1299C,
  calculateILK12EducationExpenseWorksheet,
  calculateScheduleG,
  getIllinoisConstants,
  ILLINOIS_TAX_CONSTANTS,
  IL_1040_CONSTANTS,
  IL_SCHEDULE_E_EIC_CONSTANTS,
  IL_SCHEDULE_ICR_CONSTANTS,
  IL_SCHEDULE_M_CONSTANTS,
  IL_2210_CONSTANTS,
  IL_USE_TAX_CONSTANTS,
} from "@/index.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (value: number | string) => new Decimal(value);

describe("Illinois public API", () => {
  it("re-exports Illinois sectional constants from the package entrypoint", () => {
    const constants = getIllinoisConstants(2025);

    expect(ILLINOIS_TAX_CONSTANTS[2025]).toBe(constants);
    expect(IL_1040_CONSTANTS[2025]).toBe(constants.form1040);
    expect(IL_SCHEDULE_E_EIC_CONSTANTS[2025]).toBe(constants.scheduleEEIC);
    expect(IL_SCHEDULE_ICR_CONSTANTS[2025]).toBe(constants.scheduleICR);
    expect(IL_SCHEDULE_M_CONSTANTS[2025]).toBe(constants.scheduleM);
    expect(IL_2210_CONSTANTS[2025]).toBe(constants.form2210);
    expect(IL_USE_TAX_CONSTANTS[2025]).toBe(constants.useTax);
  });

  it("calculates a resident Illinois return through the package entrypoint", () => {
    const federal = calculateFederalTax(simpleW2Fixture);

    const result = calculateIllinoisReturn(federal, {
      claimedAsDependent: false,
      age65OrOlderCount: 0,
      blindCount: 0,
      dependentCount: 1,
      hasChildUnder12: true,
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          {
            relationship: "child",
            isUnder12: true,
            monthsInHome: 12,
          },
        ],
        federalEIC: d(0),
      },
      ilWithholding: d(2500),
      estimatedPayments: d(200),
      scheduleICR: {
        taxYear: 2025,
        propertyTaxPaid: d(4000),
        propertyTaxProperties: [
          {
            county: "Sangamon",
            propertyNumber: "14-22-100-001",
          },
        ],
        propertyTaxBusinessDeduction: d(0),
        k12EducationExpenses: d(1000),
        volunteerEmergencyWorkerCount: 0,
      },
    });

    expect(result.totalPayments.toNumber()).toBe(2700);
    expect(result.overpayment.toNumber()).toBe(0);
    expect(result.taxDue.toNumber()).toBe(837);
  });

  it("calculates IL-1040 directly through the package entrypoint", () => {
    const result = calculateIL1040({
      taxYear: 2025,
      filingStatus: "single",
      federalAGI: d(50000),
      federalEIC: d(1500),
      taxExemptInterest: d(200),
      otherAdditions: d(300),
      retirementIncomeSubtraction: d(1000),
      ilRefundSubtraction: d(0),
      otherSubtractions: d(500),
      claimedAsDependent: false,
      age65OrOlderCount: 0,
      blindCount: 0,
      dependentCount: 1,
      scheduleEEIC: {
        taxYear: 2025,
        dependents: [
          {
            relationship: "child",
            isUnder12: true,
            monthsInHome: 12,
          },
        ],
        federalEIC: d(1500),
      },
      investmentCreditRecapture: d(0),
      otherStateCredit: d(0),
      schedule1299CCredit: d(0),
      householdEmploymentTax: d(0),
      useTax: d(75),
      compassionateUseSurcharge: d(0),
      ilWithholding: d(0),
      estimatedPayments: d(0),
      passThroughWithholding: d(0),
      passThroughEntityTaxCredit: d(0),
      hasChildUnder12: true,
    });

    expect(result.netIncome.toNumber()).toBe(43300);
    expect(result.ilEITC.toNumber()).toBe(300);
    expect(result.ilChildTaxCredit.toNumber()).toBe(120);
  });

  it("exports Illinois Schedule G through the package entrypoint", () => {
    const result = calculateScheduleG({
      taxYear: 2025,
      wildlifePreservationFund: d(5),
      alzheimersFund: d(0),
      assistanceToHomelessFund: d(0),
      diabetesResearchFund: d(10),
      hungerReliefFund: d(0),
      ronaldMcDonaldHouseCharitiesFund: d(15),
    });

    expect(result.totalDonations.toNumber()).toBe(30);
  });

  it("exports Illinois Schedule 1299-C through the package entrypoint", () => {
    const result = calculateSchedule1299C({
      taxYear: 2025,
      incomeTax: d(600),
      otherStateAndScheduleICRCredits: d(100),
      credits: [
        {
          yearsLeftToCarry: 0,
          carryforwardPeriodYears: 0,
          creditCode: "2200",
          creditYearEnding: "2025-12",
          creditEarnedOrCarried: d(150),
        },
      ],
    });

    expect(result.availableIncomeTax.toNumber()).toBe(500);
    expect(result.credit.toNumber()).toBe(150);
  });

  it("exports the Illinois K-12 education expense worksheet through the package entrypoint", () => {
    const result = calculateILK12EducationExpenseWorksheet({
      taxYear: 2025,
      students: [
        {
          studentName: "Alex Rivera",
          studentSSN: "111-22-3333",
          grade: "4",
          schoolName: "Lincoln Elementary",
          schoolCity: "Springfield",
          schoolType: "public",
          tuitionBookLabFees: d(600),
        },
      ],
    });

    expect(result.totalQualifiedEducationExpenses.toNumber()).toBe(600);
  });
});
