// Spec: spec/federal/passive-loss-qbi.yaml.
import { expect, it } from "vitest";
import { d } from "@/utils/decimal.js";
import { calculatePassiveLossQBI } from "@/engine/forms/passive-loss-qbi.js";
const tracking = (vintages = [{ taxYear: 2024, remainingLoss: "3000", qualifiedRemainingLoss: "3000" }]) => ({
  sourceTaxYear: 2024, sourceReference: "Actual prior filed loss tracking worksheet", sourceFactsConfirmed: true,
  vintages: vintages.map(row => ({ originalLoss: row.remainingLoss, qualifiedOriginalLoss: row.qualifiedRemainingLoss, ...row })),
});
const input = () => ({ taxYear: 2025, activityName: "Actual rental", currentIncome: d("10000"), currentLoss: d("0"),
  priorLoss: d("3000"), totalAllowedLoss: d("3000"), currentQualifiesForQbi: true, tracking: tracking() });
it("requires actual reconciled prior vintage and qualified-loss sources", () => {
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: undefined })).toThrow(/tracking/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: { ...tracking(), sourceFactsConfirmed: false } })).toThrow(/source/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: { ...tracking(), sourceTaxYear: 2023 } })).toThrow(/year/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: tracking([{ taxYear: 2024, remainingLoss: "2999", qualifiedRemainingLoss: "2000" }]) })).toThrow(/reconcile/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: tracking([{ taxYear: 2017, remainingLoss: "3000", qualifiedRemainingLoss: "1" }]) })).toThrow(/2018/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: tracking([{ taxYear: 2024, remainingLoss: "3000", qualifiedRemainingLoss: "3001" }]) })).toThrow(/qualified/i);
  expect(() => calculatePassiveLossQBI({ ...input(), totalAllowedLoss: d("3001") })).toThrow(/allowed/i);
  expect(() => calculatePassiveLossQBI({ ...input(), currentIncome: d("NaN") })).toThrow(/finite/i);
  expect(() => calculatePassiveLossQBI({ ...input(), currentLoss: d("1") })).toThrow(/net current/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: tracking([{ taxYear: 2025, remainingLoss: "3000", qualifiedRemainingLoss: "3000" }]) })).toThrow(/earlier/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: tracking([{ taxYear: 2024, remainingLoss: "1000", qualifiedRemainingLoss: "0" },
    { taxYear: 2024, remainingLoss: "2000", qualifiedRemainingLoss: "0" }]) })).toThrow(/unique/i);
  expect(() => calculatePassiveLossQBI({ ...input(), tracking: tracking([{ taxYear: 2024, remainingLoss: "3000.1", qualifiedRemainingLoss: "3000" }]) })).toThrow(/whole-dollar/i);
});
it("uses oldest non-QBI loss first and preserves remaining qualified character", () => {
  const result = calculatePassiveLossQBI({ ...input(), priorLoss: d("4000"), totalAllowedLoss: d("2000"), tracking: tracking([
    { taxYear: 2024, remainingLoss: "3000", qualifiedRemainingLoss: "2400" },
    { taxYear: 2017, remainingLoss: "1000", qualifiedRemainingLoss: "0" },
  ]) });
  expect(result.priorQualifiedLoss.toFixed()).toBe("800");
  expect(result.currentYearQbi.toFixed()).toBe("10000");
  expect(result.remainingVintages.map(row => [row.taxYear, row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()]))
    .toEqual([[2024, "2000", "1600"]]);
});
it("keeps allowed prior losses separate from current-year rental QBI", () => {
  const result = calculatePassiveLossQBI(input());
  expect(result.currentYearQbi.toFixed()).toBe("10000");
  expect(result.priorQualifiedLoss.toFixed()).toBe("3000");
  expect(result.remainingVintages).toEqual([]);
  const loss = calculatePassiveLossQBI({ ...input(), currentIncome: d("0"), currentLoss: d("10000"), totalAllowedLoss: d("5000") });
  expect(loss.currentYearQbi.toFixed()).toBe("-2000");
  expect(loss.priorQualifiedLoss.toFixed()).toBe("3000");
  expect(loss.remainingVintages.map(row => [row.taxYear, row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()]))
    .toEqual([[2025, "8000", "8000"]]);
});
it("retains the fixed qualified percentage and exact source character", () => {
  const result = calculatePassiveLossQBI({ ...input(), priorLoss: d("40000"), totalAllowedLoss: d("20000"),
    tracking: tracking([{ taxYear: 2024, remainingLoss: "40000", qualifiedRemainingLoss: "32000" }]) });
  expect(result.priorQualifiedLoss.toFixed()).toBe("16000");
  expect(result.remainingVintages[0].qualifiedRemainingLoss.toFixed()).toBe("16000");
  // Fixed original1/3, not the rounded remaining1/2: using one of two
  // remaining dollars allows zero qualified dollars after form rounding.
  const roundedHistory = calculatePassiveLossQBI({ ...input(), priorLoss: d("2"), totalAllowedLoss: d("1"),
    tracking: { ...tracking(), vintages: [{ taxYear: 2024, originalLoss: "3", qualifiedOriginalLoss: "1",
      remainingLoss: "2", qualifiedRemainingLoss: "1" }] } });
  expect(roundedHistory.priorQualifiedLoss.toFixed()).toBe("0");
  expect(roundedHistory.remainingVintages[0].qualifiedRemainingLoss.toFixed()).toBe("1");
  const exhausted = calculatePassiveLossQBI({ ...input(), priorLoss: d("1"), totalAllowedLoss: d("1"), tracking: {
    ...tracking(), vintages: [{ taxYear: 2024, originalLoss: "3", qualifiedOriginalLoss: "1", remainingLoss: "1", qualifiedRemainingLoss: "1" }],
  } });
  expect(exhausted.priorQualifiedLoss.toFixed()).toBe("1");
  expect(exhausted.remainingVintages).toEqual([]);
  const notQualifiedCurrent = calculatePassiveLossQBI({ ...input(), currentQualifiesForQbi: false });
  expect(notQualifiedCurrent.currentYearQbi.toFixed()).toBe("0");
  expect(notQualifiedCurrent.priorQualifiedLoss.toFixed()).toBe("3000");
});
