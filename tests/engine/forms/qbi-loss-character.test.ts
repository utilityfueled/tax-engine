// Spec: spec/federal/qbi-loss-character.yaml.
import { expect, it } from "vitest";
import { d } from "@/utils/decimal.js";
import { calculateQbiLossCharacter, type QbiLossCharacterInput } from "@/engine/forms/qbi-loss-character.js";

const input = (): QbiLossCharacterInput => ({
  taxYear: 2025, activitySourceId: "scheduleK1:0", limitation: "465",
  currentLoss: d("100000"), currentQualifiedLoss: d("80000"), priorLoss: d("0"),
  calculatedAllowedLoss: d("60000"),
  history: { sourceTaxYear: 2024, sourceReference: "Filed at-risk/QBI history", sourceFactsConfirmed: true, vintages: [] },
});

it("matches the published48000 current loss and32000 suspended QBI example", () => {
  // Literal T.D.9899 Example1: the original example is tax year2018.
  const result = calculateQbiLossCharacter({ ...input(), taxYear: 2018,
    history: { ...input().history, sourceTaxYear: 2017 } });
  expect(result.currentAllowedLoss.toFixed()).toBe("60000");
  expect(result.currentQualifiedLossAllowed.toFixed()).toBe("48000");
  expect(result.priorQualifiedLossAllowed.toFixed()).toBe("0");
  expect(result.remainingVintages.map(row => [row.taxYear, row.originalLoss.toFixed(),
    row.qualifiedOriginalLoss.toFixed(), row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()]))
    .toEqual([[2018, "40000", "32000", "40000", "32000"]]);
});

it("preserves prior FIFO character separately from a partially allowed current loss", () => {
  const source = input();
  source.currentLoss = d("10000"); source.currentQualifiedLoss = d("8000");
  source.priorLoss = d("6000"); source.calculatedAllowedLoss = d("8000");
  source.history.vintages = [
    { taxYear: 2024, originalLoss: "10000", qualifiedOriginalLoss: "6000", remainingLoss: "4000", qualifiedRemainingLoss: "2400", materiallyParticipatedInCurrentYear: false },
    { taxYear: 2017, originalLoss: "2000", qualifiedOriginalLoss: "0", remainingLoss: "2000", qualifiedRemainingLoss: "0" },
  ];
  const result = calculateQbiLossCharacter(source);
  expect(result.priorLossAllowed.toFixed()).toBe("6000");
  expect(result.priorQualifiedLossAllowed.toFixed()).toBe("2400");
  expect(result.currentAllowedLoss.toFixed()).toBe("2000");
  expect(result.currentQualifiedLossAllowed.toFixed()).toBe("1600");
  expect(result.priorActiveQualifiedLossAllowed?.toFixed()).toBe("0");
  expect(result.allowedPriorVintages.map(row => [row.taxYear, row.lossAllowed.toFixed(), row.qualifiedLossAllowed.toFixed()]))
    .toEqual([[2017, "2000", "0"], [2024, "4000", "2400"]]);
  expect(result.remainingVintages.map(row => [row.taxYear, row.remainingLoss.toFixed(), row.qualifiedRemainingLoss.toFixed()]))
    .toEqual([[2025, "8000", "6400"]]);
});

it("uses original qualification and exhausts filed rounding remainders", () => {
  const source = input(); source.currentLoss = d("0"); source.currentQualifiedLoss = d("0");
  source.priorLoss = d("2"); source.calculatedAllowedLoss = d("1");
  source.history.vintages = [{ taxYear: 2022, originalLoss: "3", qualifiedOriginalLoss: "1", remainingLoss: "2", qualifiedRemainingLoss: "1" }];
  const partial = calculateQbiLossCharacter(source);
  expect(partial.priorQualifiedLossAllowed.toFixed()).toBe("0");
  expect(partial.remainingVintages[0].qualifiedRemainingLoss.toFixed()).toBe("1");
  source.priorLoss = d("1"); source.history.vintages[0].remainingLoss = "1";
  const full = calculateQbiLossCharacter(source);
  expect(full.priorQualifiedLossAllowed.toFixed()).toBe("1");
  expect(full.priorActiveQualifiedLossAllowed).toBeUndefined();
  expect(full.remainingVintages).toEqual([]);
});

it("retains exact current source fractions and only newly suspended amounts", () => {
  const source = input(); source.currentLoss = d("100.49"); source.currentQualifiedLoss = d("80.01");
  source.calculatedAllowedLoss = d("60");
  const result = calculateQbiLossCharacter(source);
  expect(result.sourceCurrentLoss.toFixed()).toBe("100.49");
  expect(result.sourceCurrentQualifiedLoss.toFixed()).toBe("80.01");
  expect(result.currentQualifiedLossAllowed.toFixed()).toBe("48");
  expect(result.remainingVintages[0].originalLoss.toFixed()).toBe("40");
  expect(result.remainingVintages[0].qualifiedOriginalLoss.toFixed()).toBe("32");
  expect(result.remainingVintages[0].remainingLoss.toFixed()).toBe("40");
  const none = calculateQbiLossCharacter({ ...input(), calculatedAllowedLoss: d("0") });
  expect(none.currentQualifiedLossAllowed.toFixed()).toBe("0");
  expect(none.remainingVintages[0].qualifiedRemainingLoss.toFixed()).toBe("80000");
  // The displayed loss is1, but the actual qualified source is only.49.
  // Applying the fraction to the rounded loss would invent a qualified dollar.
  const subDollar = calculateQbiLossCharacter({ ...input(), currentLoss: d("0.51"),
    currentQualifiedLoss: d("0.49"), calculatedAllowedLoss: d("0") });
  expect(subDollar.remainingVintages[0].remainingLoss.toFixed()).toBe("1");
  expect(subDollar.remainingVintages[0].qualifiedRemainingLoss.toFixed()).toBe("0");
});

it("rejects unknown or contradictory histories and impossible calculated allowances", () => {
  const source = input(); source.priorLoss = d("1000");
  source.history.vintages = [{ taxYear: 2024, originalLoss: "1000", qualifiedOriginalLoss: "800", remainingLoss: "1000", qualifiedRemainingLoss: "800" }];
  expect(() => calculateQbiLossCharacter({ ...source, history: { ...source.history, sourceFactsConfirmed: false } })).toThrow(/confirmed/i);
  expect(() => calculateQbiLossCharacter({ ...source, history: { ...source.history, sourceReference: " " } })).toThrow(/source/i);
  expect(() => calculateQbiLossCharacter({ ...source, history: { ...source.history, sourceTaxYear: 2023 } })).toThrow(/year/i);
  expect(() => calculateQbiLossCharacter({ ...source, priorLoss: d("1001") })).toThrow(/reconcile/i);
  expect(() => calculateQbiLossCharacter({ ...source, currentQualifiedLoss: d("100001") })).toThrow(/qualified/i);
  expect(() => calculateQbiLossCharacter({ ...source, calculatedAllowedLoss: d("101001") })).toThrow(/allowance/i);
  expect(() => calculateQbiLossCharacter({ ...source, currentLoss: d("NaN") })).toThrow(/finite/i);
  expect(() => calculateQbiLossCharacter({ ...source, priorLoss: d("-1") })).toThrow(/nonnegative/i);
  source.history.vintages[0].taxYear = 2017;
  expect(() => calculateQbiLossCharacter(source)).toThrow(/2018/i);
  source.history.vintages[0].taxYear = 2024;
  source.history.vintages.push({ ...source.history.vintages[0] });
  expect(() => calculateQbiLossCharacter(source)).toThrow(/unique/i);
  source.history.vintages.pop(); source.history.vintages[0].remainingLoss = "999.9";
  expect(() => calculateQbiLossCharacter(source)).toThrow(/whole/i);
  source.history.vintages[0].remainingLoss = "100";
  expect(() => calculateQbiLossCharacter(source)).toThrow(/conserv|reconcile/i);
});

it("keeps code histories distinct and preserves exact source records", () => {
  const source = input(); const before = JSON.stringify(source);
  const result = calculateQbiLossCharacter(source);
  expect(JSON.stringify(source)).toBe(before);
  expect(result.limitation).toBe("465"); expect(result.activitySourceId).toBe("scheduleK1:0");
  expect(result.lines.every(line => line.form === "QBI Loss Character")).toBe(true);
  const passive = calculateQbiLossCharacter({ ...source, limitation: "469" });
  expect(passive.limitation).toBe("469");
  expect(passive.lines[0].inputs).toMatchObject({ "Code provision": "469", "Activity source": "scheduleK1:0" });
});
