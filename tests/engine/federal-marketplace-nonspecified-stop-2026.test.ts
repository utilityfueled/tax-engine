// Spec: spec/federal/marketplace-nonspecified-stop.yaml.
import { expect, it, vi } from "vitest";
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});
import { calculateFederalTax } from "@/engine/federal.js";
import { marketplaceNonspecifiedStopInput } from "../fixtures/marketplace-nonspecified-stop.js";

it("uses the actual uncapped final credit after the isolated2026 stop", () => {
  const input = marketplaceNonspecifiedStopInput(true);
  if (!input.form7206) throw new Error("Missing actual source");
  input.taxpayer.taxYear = 2026;
  input.form7206.sourceTaxYear = 2026;
  for (const person of input.form7206.persons ?? []) person.attainedAgeAtYearEnd = 36;
  for (const policy of input.form1095A) policy.taxYear = 2026;
  for (const plan of input.form7206.plans ?? []) for (const payment of plan.payments ?? []) {
    payment.coverageTaxYear = 2026;
    payment.datePaid = payment.datePaid?.replace("2025-", "2026-");
  }
  const before = JSON.stringify(input), result = calculateFederalTax(input);
  expect(result.marketplaceHealthInsurance?.method).toBe("pub974-nonspecified-stop-2026");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7646");
  expect(result.agi.toFixed()).toBe("40587");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3496");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("104");
  expect(result.form8962?.repaymentCap).toBeNull();
  expect(result.allLines.some(row => /^Pub974 Worksheet [WXYZ]|^Pub974 Ordered Deductions/.test(row.form))).toBe(false);
  expect(JSON.stringify(input)).toBe(before);
});
