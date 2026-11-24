/** Original Ohio shape and commitments are checked by the calling baseline tests. */
import { expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";

const paidCases = {
  estimates: { before: "3600", after: "3900", estimated: "300", applied: "0" },
  prior: { before: "4100", after: "4200", estimated: "0", applied: "100" },
  "zero-withholding": { before: "3000", after: "3750", estimated: "750", applied: "0" },
  "independent-IT-estimates": { before: "3900", after: "4200", estimated: "300", applied: "0" },
};

function adjustedLine(line: CalculatedLine): boolean {
  return (line.form === "SALT Income Tax WS" && (line.line === "OH-SD-100" || line.line === "total"))
    || (line.form === "Sched A" && ["5a", "5d", "5e", "7", "17"].includes(line.line));
}

export function assertOhioSchoolFederalDelta(input: TaxYearInput, actual: TaxReturnResult, name: string): TaxReturnResult {
  const expected = paidCases[name as keyof typeof paidCases];
  if (!expected) return actual;
  const baseline = calculateFederalTax({ ...input, ohioSchoolDistrict: undefined });
  const { allLines: baselineLines, itemizedDeductions: baselineItemized, scheduleA: beforeScheduleA, ...unchanged } = baseline;
  const { allLines, itemizedDeductions, scheduleA: afterScheduleA, ...actualUnchanged } = actual;
  expect(actualUnchanged).toEqual(unchanged);
  expect(baselineItemized.toFixed()).toBe(expected.before);
  expect(itemizedDeductions.toFixed()).toBe(expected.after);
  if (!beforeScheduleA || !afterScheduleA) throw Error("Expected Schedule A for the independent Ohio fixture");
  const { lines: beforeLines, saltDeduction: beforeSalt, totalItemized: beforeTotal, ...before } = beforeScheduleA;
  const { lines: afterLines, saltDeduction: afterSalt, totalItemized: afterTotal, ...after } = afterScheduleA;
  expect(after).toEqual(before);
  expect([beforeSalt, beforeTotal].map(amount => amount.toFixed())).toEqual([expected.before, expected.before]);
  expect([afterSalt, afterTotal].map(amount => amount.toFixed())).toEqual([expected.after, expected.after]);
  expect(afterLines.filter(line => !adjustedLine(line))).toEqual(beforeLines.filter(line => !adjustedLine(line)));
  expect(allLines.filter(line => !adjustedLine(line))).toEqual(baselineLines.filter(line => !adjustedLine(line)));
  expect(allLines.filter(line => adjustedLine(line) && line.form === "Sched A").map(line => line.value.toFixed()))
    .toEqual(baselineLines.filter(line => adjustedLine(line) && line.form === "Sched A").map(() => expected.after));
  const audit = allLines.filter(line => line.form === "SALT Income Tax WS" && line.line === "OH-SD-100");
  expect(audit).toHaveLength(1);
  expect(audit[0]?.value.eq(itemizedDeductions.minus(baselineItemized))).toBe(true);
  expect(audit[0]?.inputs).toEqual({
    "Estimated principal paid during 2025": new Decimal(expected.estimated),
    "Prior district refund applied to 2025": new Decimal(expected.applied),
  });
  return baseline;
}
