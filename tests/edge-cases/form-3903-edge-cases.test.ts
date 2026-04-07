/**
 * Edge case tests for Form 3903 — Moving Expenses (Armed Forces only, 2018-2025).
 * Spec: spec/federal/form-3903.yaml
 *
 * Key rules:
 *   Only active-duty military moves are deductible during TCJA suspension
 *   Deduction = max(0, expenses - reimbursements)
 *   Multiple moves are aggregated
 *   Meals are NOT deductible post-2017
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm3903 } from "@/engine/forms/form-3903.js";
import type { Form3903Input } from "@/models/inputs.js";

const d = (v: string | number) => new Decimal(v);

function makeInput(moves: Array<{
  transportationAndStorage?: string;
  travelAndLodging?: string;
  reimbursementsExcludedFromIncome?: string;
}>): Form3903Input {
  return {
    military: true as const,
    moves: moves.map((m) => ({
      transportationAndStorage: m.transportationAndStorage ?? "0",
      travelAndLodging: m.travelAndLodging ?? "0",
      reimbursementsExcludedFromIncome: m.reimbursementsExcludedFromIncome ?? "0",
    })),
  };
}

describe("Form 3903 single move edge cases", () => {
  it("Form 3903 Line 5 - zero expenses yields zero deduction", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "0", travelAndLodging: "0" },
    ]));
    expect(result.totalDeductible.toNumber()).toBe(0);
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
  });

  it("Form 3903 Line 5 - expenses with no reimbursement are fully deductible", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "5000", travelAndLodging: "2000" },
    ]));
    expect(result.moveResults[0].line3.toNumber()).toBe(7000);
    expect(result.moveResults[0].line5.toNumber()).toBe(7000);
    expect(result.totalDeductible.toNumber()).toBe(7000);
  });

  it("Form 3903 Line 5 - reimbursements exceeding expenses floor deduction at zero", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "3000",
        travelAndLodging: "1000",
        reimbursementsExcludedFromIncome: "6000",
      },
    ]));
    // Line 3: 4000, Line 4: 6000, Line 5: max(0, 4000-6000) = 0
    expect(result.moveResults[0].line3.toNumber()).toBe(4000);
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.totalDeductible.toNumber()).toBe(0);
  });

  it("Form 3903 Line 5 - reimbursements exactly equal expenses yields zero deduction", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "5000",
        travelAndLodging: "2500",
        reimbursementsExcludedFromIncome: "7500",
      },
    ]));
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
  });

  it("Form 3903 Line 5 - partial reimbursement leaves net deduction", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "8000",
        travelAndLodging: "3000",
        reimbursementsExcludedFromIncome: "4000",
      },
    ]));
    // Line 3: 11000, Line 4: 4000, Line 5: 7000
    expect(result.moveResults[0].line5.toNumber()).toBe(7000);
  });

  it("Form 3903 Line 1 - transportation only with no lodging", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "12000" },
    ]));
    expect(result.moveResults[0].line1.toNumber()).toBe(12000);
    expect(result.moveResults[0].line2.toNumber()).toBe(0);
    expect(result.moveResults[0].line3.toNumber()).toBe(12000);
  });

  it("Form 3903 Line 2 - lodging only with no transportation", () => {
    const result = calculateForm3903(makeInput([
      { travelAndLodging: "3500" },
    ]));
    expect(result.moveResults[0].line1.toNumber()).toBe(0);
    expect(result.moveResults[0].line2.toNumber()).toBe(3500);
    expect(result.moveResults[0].line3.toNumber()).toBe(3500);
  });
});

describe("Form 3903 multiple moves in same tax year", () => {
  it("Form 3903 total - two moves aggregate deductible amounts", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "5000", travelAndLodging: "1000" },
      { transportationAndStorage: "8000", travelAndLodging: "2000" },
    ]));
    // Move 1: 6000, Move 2: 10000, Total: 16000
    expect(result.moveResults).toHaveLength(2);
    expect(result.moveResults[0].line5.toNumber()).toBe(6000);
    expect(result.moveResults[1].line5.toNumber()).toBe(10000);
    expect(result.totalDeductible.toNumber()).toBe(16000);
  });

  it("Form 3903 total - one move fully reimbursed, one not, only unreimbursed flows through", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "5000",
        reimbursementsExcludedFromIncome: "5000",
      },
      { transportationAndStorage: "3000" },
    ]));
    // Move 1: 0, Move 2: 3000
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.moveResults[1].line5.toNumber()).toBe(3000);
    expect(result.totalDeductible.toNumber()).toBe(3000);
  });

  it("Form 3903 total - three moves with mixed reimbursements", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "4000", reimbursementsExcludedFromIncome: "2000" },
      { transportationAndStorage: "6000", reimbursementsExcludedFromIncome: "8000" },
      { transportationAndStorage: "3000", travelAndLodging: "1500" },
    ]));
    // Move 1: 2000, Move 2: 0, Move 3: 4500
    expect(result.totalDeductible.toNumber()).toBe(6500);
  });
});

describe("Form 3903 large value edge cases", () => {
  it("Form 3903 Line 5 - very large OCONUS military move", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "45000",
        travelAndLodging: "8000",
        reimbursementsExcludedFromIncome: "20000",
      },
    ]));
    // Line 3: 53000, Line 4: 20000, Line 5: 33000
    expect(result.moveResults[0].line5.toNumber()).toBe(33000);
    expect(result.totalDeductible.toNumber()).toBe(33000);
  });

  it("Form 3903 Line 5 - $1 of expense with no reimbursement", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "1" },
    ]));
    expect(result.totalDeductible.toNumber()).toBe(1);
  });
});

describe("Form 3903 decimal precision edge cases", () => {
  it("Form 3903 Line 5 - sub-dollar amounts preserve decimal precision", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "0.50",
        travelAndLodging: "0.75",
        reimbursementsExcludedFromIncome: "0.25",
      },
    ]));
    // Line 3: 1.25, Line 4: 0.25, Line 5: 1.00
    expect(result.moveResults[0].line3.toString()).toBe("1.25");
    expect(result.moveResults[0].line5.toString()).toBe("1");
    expect(result.totalDeductible.toString()).toBe("1");
  });

  it("Form 3903 Line 5 - large values with cents maintain precision", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "99999.99",
        travelAndLodging: "50000.01",
        reimbursementsExcludedFromIncome: "75000.50",
      },
    ]));
    // Line 3: 150000.00, Line 4: 75000.50, Line 5: 74999.50
    expect(result.moveResults[0].line3.toString()).toBe("150000");
    expect(result.moveResults[0].line5.toString()).toBe("74999.5");
  });

  it("Form 3903 Line 5 - reimbursement exceeds expenses by exactly $0.01", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "5000",
        reimbursementsExcludedFromIncome: "5000.01",
      },
    ]));
    // Line 3: 5000, Line 4: 5000.01, Line 5: max(0, -0.01) = 0
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.totalDeductible.toNumber()).toBe(0);
  });
});

describe("Form 3903 boundary and stress edge cases", () => {
  it("Form 3903 - all three components at exactly equal amounts", () => {
    const result = calculateForm3903(makeInput([
      {
        transportationAndStorage: "5000",
        travelAndLodging: "5000",
        reimbursementsExcludedFromIncome: "5000",
      },
    ]));
    // Line 3: 10000, Line 4: 5000, Line 5: 5000
    expect(result.moveResults[0].line1.toNumber()).toBe(5000);
    expect(result.moveResults[0].line2.toNumber()).toBe(5000);
    expect(result.moveResults[0].line3.toNumber()).toBe(10000);
    expect(result.moveResults[0].line5.toNumber()).toBe(5000);
  });

  it("Form 3903 - five PCS moves in a single tax year aggregate correctly", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "2000", travelAndLodging: "500" },
      { transportationAndStorage: "3000", travelAndLodging: "800", reimbursementsExcludedFromIncome: "1000" },
      { transportationAndStorage: "1500" },
      { transportationAndStorage: "4000", reimbursementsExcludedFromIncome: "4000" },
      { transportationAndStorage: "6000", travelAndLodging: "1200", reimbursementsExcludedFromIncome: "2000" },
    ]));
    // Move 1: 2500, Move 2: 2800, Move 3: 1500, Move 4: 0, Move 5: 5200
    expect(result.moveResults).toHaveLength(5);
    expect(result.moveResults[0].line5.toNumber()).toBe(2500);
    expect(result.moveResults[1].line5.toNumber()).toBe(2800);
    expect(result.moveResults[2].line5.toNumber()).toBe(1500);
    expect(result.moveResults[3].line5.toNumber()).toBe(0);
    expect(result.moveResults[4].line5.toNumber()).toBe(5200);
    expect(result.totalDeductible.toNumber()).toBe(12000);
  });

  it("Form 3903 - all moves fully reimbursed produces zero total deduction", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "5000", reimbursementsExcludedFromIncome: "5000" },
      { transportationAndStorage: "8000", reimbursementsExcludedFromIncome: "10000" },
    ]));
    expect(result.moveResults[0].line5.toNumber()).toBe(0);
    expect(result.moveResults[1].line5.toNumber()).toBe(0);
    expect(result.totalDeductible.toNumber()).toBe(0);
  });

  it("Form 3903 - audit trail labels moves correctly for multiple moves", () => {
    const result = calculateForm3903(makeInput([
      { transportationAndStorage: "1000" },
      { transportationAndStorage: "2000" },
      { transportationAndStorage: "3000" },
    ]));
    // Multiple moves should have "Move N" labels in audit trail
    const move1Line1 = result.lines.find((l) => l.line === "1 (Move 1)");
    const move2Line1 = result.lines.find((l) => l.line === "1 (Move 2)");
    const move3Line1 = result.lines.find((l) => l.line === "1 (Move 3)");
    const totalLine = result.lines.find((l) => l.line === "total");
    expect(move1Line1).toBeDefined();
    expect(move2Line1).toBeDefined();
    expect(move3Line1).toBeDefined();
    expect(totalLine).toBeDefined();
    expect(totalLine!.value.toNumber()).toBe(6000);
  });
});
