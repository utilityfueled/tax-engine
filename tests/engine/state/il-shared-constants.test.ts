import { describe, expect, it } from "vitest";
import {
  ILLINOIS_TAX_CONSTANTS,
  IL_1040_CONSTANTS,
  IL_2210_CONSTANTS,
  IL_SCHEDULE_E_EIC_CONSTANTS,
  IL_SCHEDULE_ICR_CONSTANTS,
  IL_SCHEDULE_M_CONSTANTS,
  IL_USE_TAX_CONSTANTS,
  getIllinoisConstants,
} from "@/models/constants.js";

describe("Illinois shared constants", () => {
  it("2025 shared constants expose the expected resident-return values", () => {
    const constants = getIllinoisConstants(2025);

    expect(constants.form1040.taxRate.toNumber()).toBe(0.0495);
    expect(constants.form1040.personalExemption.toNumber()).toBe(2850);
    expect(constants.scheduleEEIC.childTaxCreditRate.toNumber()).toBe(0.4);
    expect(constants.scheduleEEIC.expandedChildlessMinimumAge).toBe(18);
    expect(constants.scheduleEEIC.expandedIncomeLimit.other[0].toNumber()).toBe(19104);
    expect(constants.scheduleICR.educationCreditMax.toNumber()).toBe(750);
    expect(constants.scheduleM.max529Subtraction.mfj.toNumber()).toBe(20000);
    expect(constants.form2210.penaltyDays).toEqual([365, 304, 212, 90]);
    expect(constants.useTax.formulaThreshold.toNumber()).toBe(100000);
  });

  it("section exports stay aligned with the Illinois source of truth", () => {
    expect(IL_1040_CONSTANTS[2025]).toBe(ILLINOIS_TAX_CONSTANTS[2025].form1040);
    expect(IL_SCHEDULE_E_EIC_CONSTANTS[2025]).toBe(ILLINOIS_TAX_CONSTANTS[2025].scheduleEEIC);
    expect(IL_SCHEDULE_ICR_CONSTANTS[2025]).toBe(ILLINOIS_TAX_CONSTANTS[2025].scheduleICR);
    expect(IL_SCHEDULE_M_CONSTANTS[2025]).toBe(ILLINOIS_TAX_CONSTANTS[2025].scheduleM);
    expect(IL_2210_CONSTANTS[2025]).toBe(ILLINOIS_TAX_CONSTANTS[2025].form2210);
    expect(IL_USE_TAX_CONSTANTS[2025]).toBe(ILLINOIS_TAX_CONSTANTS[2025].useTax);
  });

  it("throws for an unsupported Illinois tax year", () => {
    expect(() => getIllinoisConstants(2024)).toThrow(
      "Illinois tax constants not available for year 2024. Available years: 2025",
    );
  });
});
