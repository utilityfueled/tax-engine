/** Spec: spec/federal/form-8995.yaml, 2026-draft-1-14. */

import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateForm8995, type Form8995Input } from "@/engine/forms/form-8995.js";

const d = (value: number | string) => new Decimal(value);

function makeInput(overrides: Partial<Form8995Input> = {}): Form8995Input {
  return {
    taxYear: 2026,
    qbiSources: [
      { name: "Consulting", qbi: d("1000.12"), materiallyParticipated: false },
      { name: "Rental", qbi: d("-250.12"), materiallyParticipated: false },
    ],
    priorYearQBILoss: d(2000),
    priorYearActiveQBILoss: d(0),
    qualifiedReitDividends: d(350),
    qualifiedPTPIncome: d(-150),
    priorYearReitPtpLoss: d(600),
    taxableIncomeBeforeQBI: d(100),
    netCapitalGain: d(150),
    qualifiedDividends: d(50),
    ...overrides,
  };
}

function formLines(result: ReturnType<typeof calculateForm8995>) {
  return result.lines.filter(({ form }) => form === "Form 8995");
}

describe("Form 8995 2026 draft upper lines", () => {
  it("shows signed draft inputs and floors negative balances", () => {
    const input = makeInput();
    const result = calculateForm8995(input);
    expect(formLines(result).slice(0, 15).map(({ line, value }) => [line, value.toString()])).toEqual([
      ["1i", "1000"], ["1ii", "-250"], ["2", "750"], ["3", "-2000"], ["4", "0"],
      ["5", "0"], ["6", "200"], ["7", "-600"], ["8", "0"], ["9", "0"], ["10", "0"],
      ["11", "100"], ["12", "200"], ["13", "0"], ["14", "0"],
    ]);
    expect(formLines(result)[0]?.inputs).toEqual({ sourceQBI: d("1000.12") });
    expect(formLines(result)[1]?.inputs).toEqual({ sourceQBI: d("-250.12") });
    expect(result.totalQBI).toEqual(d(-1250));
    expect(result.netReitPtpAmount).toEqual(d(-400));
    expect(result.qbiLossCarryforward).toEqual(d(1250));
    expect(result.reitPtpLossCarryforward).toEqual(d(400));
  });

  it("shows positive draft balances and includes additional source detail in line 2", () => {
    const input = makeInput({
      priorYearQBILoss: d(100),
      qualifiedReitDividends: d(650),
      priorYearReitPtpLoss: d(100),
      taxableIncomeBeforeQBI: d(10000),
    });
    input.qbiSources.push(
      { name: "Farm", qbi: d(100), materiallyParticipated: false },
      { name: "Repair", qbi: d(200), materiallyParticipated: false },
      { name: "Design", qbi: d(300), materiallyParticipated: false },
      { name: "Store", qbi: d(-50), materiallyParticipated: false },
    );
    const result = calculateForm8995(input);
    const lines = formLines(result);
    expect(lines.slice(0, 18).map(({ line, value }) => [line, value.toString()])).toEqual([
      ["1i", "1000"], ["1ii", "-250"], ["1iii", "100"], ["1iv", "200"], ["1v", "300"],
      ["2", "1300"], ["3", "-100"], ["4", "1200"], ["5", "240"], ["6", "500"], ["7", "-100"],
      ["8", "400"], ["9", "80"], ["10", "320"], ["11", "10000"], ["12", "200"],
      ["13", "9800"], ["14", "1960"],
    ]);
    expect(result.lines.filter(({ form }) => form === "Form 8995 attachment")).toMatchObject([
      { line: "6", description: "Trade or business 6", value: d(-50), inputs: { sourceQBI: d(-50) } },
    ]);
    const incomeFormula = lines.find(({ line }) => line === "11")?.formula;
    expect(incomeFormula).toContain("line 13a (Schedule 1-A)");
    expect(incomeFormula).toContain("before section 68 if itemizing");
    expect(incomeFormula).toContain("lines 12e and 12f otherwise");
    expect(result.qbiDeduction).toEqual(d(320));
  });

  it("uses numbered draft source labels without exposing source names", () => {
    const marker = "FICTIONAL SOURCE NAME TEST MARKER";
    const input = makeInput({
      qbiSources: Array.from({ length: 6 }, (_, index) => ({
        name: `${marker} ${index + 1}`,
        qbi: d(100),
        materiallyParticipated: false,
      })),
    });
    const result = calculateForm8995(input);
    const draftLines = result.lines.filter(({ form }) => form.startsWith("Form 8995"));
    expect(JSON.stringify(draftLines)).not.toContain(marker);
    expect(draftLines.slice(0, 6).map(({ description }) => description)).toEqual([
      "Trade or business 1", "Trade or business 2", "Trade or business 3",
      "Trade or business 4", "Trade or business 5", "Trade or business 6",
    ]);
    expect(input.qbiSources[0]?.name).toBe(`${marker} 1`);
  });

  it("preserves historical 2025 audit IDs and named signed and carry amounts", () => {
    const result = calculateForm8995(makeInput({ taxYear: 2025 }));
    expect(formLines(result).map(({ line, value }) => [line, value.toString()])).toEqual([
      ["1-5", "750"], ["6", "-1250"], ["7", "0"], ["8", "200"], ["reit-ptp-prior-loss", "600"],
      ["9", "0"], ["reit-ptp-loss-carryforward", "400"], ["10", "0"], ["11", "100"],
      ["12", "200"], ["14", "0"], ["15", "0"], ["16", "1250"],
    ]);
    expect(result.totalQBI).toEqual(d(-1250));
    expect(result.netReitPtpAmount).toEqual(d(-400));
    expect(result.qbiLossCarryforward).toEqual(d(1250));
    expect(result.reitPtpLossCarryforward).toEqual(d(400));
  });
});
