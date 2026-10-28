// Spec: spec/federal/marketplace-health-separate-owners.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { separateOwnerMarketplaceHealthInput } from "../fixtures/marketplace-health-separate-owners.js";

it("derives the historical joint deduction from three original shareholder sources", () => {
  const input = separateOwnerMarketplaceHealthInput();
  const before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  const limit = result.marketplaceHealthInsurance?.historicalLimit;
  expect(["13", "14", "15", "16", "17"].map(line => limit?.lines.find(row => row.form === "Pub974 Worksheet W" && row.line === line)?.value.toFixed())).toEqual(["80000", "2400", "77600", "9000", "11400"]);
  expect(result.marketplaceHealthInsurance?.step2Credit.toFixed()).toBe("4350");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7050");
  expect(result.agi.toFixed()).toBe("94350");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3980");
  expect(result.form7206?.businesses.map(row => [row.businessSourceId, row.accountHolder, row.deduction?.toFixed()])).toEqual([["formW2:0", "primary", "0"], ["formW2:1", "spouse", "0"], ["formW2:2", "primary", "2400"]]);
  expect(result.allLines.filter(row => row.form === "Pub974 Owner Allocation" && row.line.endsWith(":deduction")).map(row => [row.line, row.value.toDecimalPlaces(2).toFixed()])).toEqual([["primary:deduction", "3100"], ["spouse:deduction", "1550"]]);
  expect(JSON.stringify(input)).toBe(before);
});

it("preserves opposite-owner originals and rejects missing or contradictory facts", () => {
  const opposite = separateOwnerMarketplaceHealthInput("spouse");
  opposite.form7206?.plans?.reverse();
  const result = calculateFederalTax(opposite);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("7050");
  expect(result.agi.toFixed()).toBe("94350");
  expect(result.form7206?.businesses.find(row => row.businessSourceId === "formW2:2")?.accountHolder).toBe("spouse");
  const missing = separateOwnerMarketplaceHealthInput();
  const payment = missing.form7206?.plans?.[0]?.payments?.[0];
  if (!payment) throw new Error("Missing fictional original payment");
  payment.advancePremiumTaxCredit = undefined;
  expect(() => calculateFederalTax(missing)).toThrow(/actual|source|advance/i);
  const wrong = separateOwnerMarketplaceHealthInput();
  wrong.w2s[2].accountHolder = "spouse";
  expect(() => calculateFederalTax(wrong)).toThrow(/owner/i);
  const method = separateOwnerMarketplaceHealthInput();
  if (!method.form7206?.marketplaceCreditAllocation) throw new Error("Missing original method choice");
  method.form7206.marketplaceCreditAllocation.sourceFactsConfirmed = false;
  expect(() => calculateFederalTax(method)).toThrow(/method|source|confirm/i);
  const next = separateOwnerMarketplaceHealthInput();
  next.taxpayer.taxYear = 2026;
  expect(() => calculateFederalTax(next)).toThrow(/2026.*incomplete|2026.*not.*ready|2026.*unavailable|2026.*not.*qualified/i);
});
