// Spec: spec/federal/marketplace-health-negative-limit.yaml.
import { expect, it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { marketplaceHealthNegativeLimitInput, partnershipHealthNegativeLimitInput } from "../fixtures/marketplace-health-negative-limit.js";

it("uses the signed worksheet claim once with actual same-owner QBI sources", () => {
  const input = marketplaceHealthNegativeLimitInput(), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  const w = (line: string) => result.allLines.find(row => row.form === "Pub974 Worksheet W" && row.line === line)?.value.toFixed();
  expect([w("13"), w("14"), w("15"), w("16"), w("17")]).toEqual(["4646.6", "6000", "-1353.4", "-1353.4", "4646.6"]);
  expect(result.marketplaceHealthInsurance?.specifiedDeduction.toFixed()).toBe("-1353.4");
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("4647");
  expect(result.agi.toFixed()).toBe("43586");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3577");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("23");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("3717");
  expect(result.form7206?.businesses.map(row => [row.businessSourceId, row.deduction?.toFixed()])).toEqual([["scheduleC", "0"], ["scheduleF", "6000"]]);
  const shares = result.form7206?.lines.filter(row => row.form === "Pub974 QBI Allocation").map(row => [row.line, row.value.toFixed()]);
  expect(shares).toEqual([["scheduleC", "929.32"], ["scheduleF", "3717.28"]]);
  expect(JSON.stringify(input)).toBe(before);
});
it("preserves source order and the zero-advance variant", () => {
  const input = marketplaceHealthNegativeLimitInput(true), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect(result.schedule1?.seHealthInsurance.toFixed()).toBe("4647");
  expect(result.agi.toFixed()).toBe("43586");
  expect(result.form8962?.ptcAllowed.toFixed()).toBe("3577");
  expect(result.form8962?.excessAPTCRepayment.toFixed()).toBe("0");
  expect(result.allLines.some(row => row.form === "Pub974 Worksheet X")).toBe(false);
  const reverse = structuredClone(input); reverse.form7206?.plans?.reverse();
  const repeated = calculateFederalTax(reverse);
  expect(repeated.agi.eq(result.agi)).toBe(true);
  expect(repeated.form7206?.lines.filter(row => row.form === "Pub974 QBI Allocation")).toEqual(result.form7206?.lines.filter(row => row.form === "Pub974 QBI Allocation"));
  expect(JSON.stringify(input)).toBe(before);
});

it("uses original partnership gross statements for the signed combined deduction", () => {
  const input = partnershipHealthNegativeLimitInput(), before = JSON.stringify(input);
  const result = calculateFederalTax(input);
  expect([result.schedule1?.seHealthInsurance.toFixed(), result.agi.toFixed(), result.form8962?.ptcAllowed.toFixed()]).toEqual(["4647", "43586", "3577"]);
  expect(result.form7206?.lines.filter(row => row.form === "Pub974 QBI Allocation").map(row => [row.line, row.value.toFixed()])).toEqual([["scheduleK1:0", "929.32"], ["scheduleK1:1", "3717.28"]]);
  expect(JSON.stringify(input)).toBe(before);
});
