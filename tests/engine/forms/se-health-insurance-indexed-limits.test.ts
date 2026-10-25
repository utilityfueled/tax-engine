// Spec: spec/federal/se-health-insurance-worksheet.yaml, 2-year-specific-source-limits
import { expect, it } from "vitest";
import { calculateSEHealthInsuranceWorksheet } from "@/engine/forms/se-health-insurance-worksheet.js";
import { getConstants } from "@/models/constants.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";

// Independently transcribed from RP2024-40 §2.28 and RP2025-32 §4.27.
it.each([
  [40, "480", "500"], [41, "900", "930"], [50, "900", "930"],
  [51, "1800", "1860"], [60, "1800", "1860"], [61, "4810", "4960"],
  [70, "4810", "4960"], [71, "6020", "6200"],
] as const)("uses published year-specific LTC caps at age %s", (age, expected2025, expected2026) => {
  const input = { medicalDentalPremiums: "0", longTermCareCoverages: [{ attainedAge: age, premiumsPaid: "10000" }], eligibleMonths: 12, netProfit: "100000" };
  expect(calculateSEHealthInsuranceWorksheet(input, getConstants(2025)).longTermCarePremiumsAllowed.toString()).toBe(expected2025);
  expect(calculateSEHealthInsuranceWorksheet(input, FEDERAL_2026_CONSTANTS).longTermCarePremiumsAllowed.toString()).toBe(expected2026);
});
