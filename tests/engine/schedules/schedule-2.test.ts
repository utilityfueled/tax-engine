/**
 * Tests for Schedule 2 — Additional Taxes
 * Spec: spec/federal/schedule-2.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateSchedule2, type Schedule2Input } from "@/engine/schedules/schedule-2.js";

const d = (n: number | string) => new Decimal(n);

function makeInput(overrides?: Partial<Schedule2Input>): Schedule2Input {
  return {
    selfEmploymentTax: d(0),
    additionalMedicareTax: d(0),
    niitTax: d(0),
    ...overrides,
  };
}

describe("Schedule 2 Part I - AMT and PTC", () => {
  it("Schedule 2 Line 2 - AMT from Form 6251", () => {
    const result = calculateSchedule2(makeInput({ amt: d(5000) }));
    expect(result.amt.toNumber()).toBe(5000);
    expect(result.partITotal.toNumber()).toBe(5000);
  });

  it("Schedule 2 Line 1a - excess APTC", () => {
    const result = calculateSchedule2(makeInput({ excessAPTCRepayment: d(1200) }));
    expect(result.excessAPTCRepayment.toNumber()).toBe(1200);
    expect(result.partITotal.toNumber()).toBe(1200);
  });

  it("Schedule 2 Line 3 - Part I total", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(5000),
      excessAPTCRepayment: d(1200),
    }));
    expect(result.partITotal.toNumber()).toBe(6200);

    const line3 = result.lines.find((line) => line.line === "3");
    expect(line3?.value.toNumber()).toBe(6200);
  });
});

describe("Schedule 2 Part II - Other Taxes", () => {
  it("Schedule 2 Line 4 - SE tax", () => {
    const result = calculateSchedule2(makeInput({ selfEmploymentTax: d(14130) }));
    expect(result.selfEmploymentTax.toNumber()).toBe(14130);
  });

  it("Schedule 2 Line 11 - additional Medicare", () => {
    const result = calculateSchedule2(makeInput({ additionalMedicareTax: d(900) }));
    expect(result.additionalMedicareTax.toNumber()).toBe(900);
  });

  it("Schedule 2 Line 12 - NIIT", () => {
    const result = calculateSchedule2(makeInput({ niitTax: d(3800) }));
    expect(result.niitTax.toNumber()).toBe(3800);
  });

  it("Schedule 2 Line 17c - HSA additional tax flows from Form 8889 Line 17b", () => {
    const result = calculateSchedule2(makeInput({ hsaAdditionalTax: d(160) }));
    expect(result.hsaAdditionalTax.toNumber()).toBe(160);

    const line17c = result.lines.find((line) => line.line === "17c");
    expect(line17c?.value.toNumber()).toBe(160);
  });

  it("Schedule 2 Line 17d - HSA testing-period failure tax flows from Form 8889 Line 21", () => {
    const result = calculateSchedule2(makeInput({ hsaRecaptureTax: d(270) }));
    expect(result.hsaRecaptureTax.toNumber()).toBe(270);

    const line17d = result.lines.find((line) => line.line === "17d");
    expect(line17d?.value.toNumber()).toBe(270);
  });

  it("Schedule 2 Line 18 - subtotal of additional taxes", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(900),
      niitTax: d(3800),
      hsaAdditionalTax: d(160),
      hsaRecaptureTax: d(270),
    }));
    expect(result.partIITotal.toNumber()).toBe(19260);
    expect(result.lines.find(line => line.line === "18")?.value.toString()).toBe("430");
  });
});

describe("Schedule 2 - Total", () => {
  it("Schedule 2 Line 21 - total to 1040", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(2000),
      selfEmploymentTax: d(10000),
      additionalMedicareTax: d(500),
      niitTax: d(1500),
    }));
    expect(result.totalAdditionalTaxes.toNumber()).toBe(12000); // Part II: 10000 + 500 + 1500
  });

  it("Schedule 2 - zero when no additional taxes", () => {
    const result = calculateSchedule2(makeInput());
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("Schedule 2 - excludes estimated tax penalty", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(5000),
      estimatedTaxPenalty: d(200),
    }));
    expect(result.totalAdditionalTaxes.toNumber()).toBe(5000);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: Optional Fields and Combinations
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - optional Part II taxes", () => {
  it("Schedule 2 Line 5 - additional Social Security and Medicare tax on tips or wages", () => {
    const result = calculateSchedule2(makeInput({
      unreportedSSTax: d(3000),
    }));
    expect(result.partIITotal.toNumber()).toBe(3000);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(3000);

    const line5 = result.lines.find((line) => line.line === "5");
    expect(line5?.value.toNumber()).toBe(3000);
  });

  it("Schedule 2 Line 6 - Form 8919 employee-wage tax flows separately from Form 4137 tax", () => {
    const result = calculateSchedule2(makeInput({
      form8919Tax: d(1800),
    }));
    expect(result.partIITotal.toNumber()).toBe(1800);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(1800);

    const line6 = result.lines.find((line) => line.line === "6");
    expect(line6?.value.toNumber()).toBe(1800);
  });

  it("Schedule 2 Line 7 - combines Form 4137 and Form 8919 tax before later Part II lines", () => {
    const result = calculateSchedule2(makeInput({
      unreportedSSTax: d(3000),
      form8919Tax: d(1800),
    }));

    const line7 = result.lines.find((line) => line.line === "7");
    expect(line7?.value.toNumber()).toBe(4800);
    expect(result.partIITotal.toNumber()).toBe(4800);
  });

  it("Schedule 2 Line 13 - uncollected Social Security tax", () => {
    const result = calculateSchedule2(makeInput({
      uncollectedSSTax: d(1500),
    }));
    expect(result.partIITotal.toNumber()).toBe(1500);

    const line13 = result.lines.find((line) => line.line === "13");
    expect(line13?.value.toNumber()).toBe(1500);
  });

  it("Schedule 2 Line 8 - early distribution penalty tax", () => {
    const result = calculateSchedule2(makeInput({
      penaltyTax: d(2500),
    }));
    expect(result.partIITotal.toNumber()).toBe(2500);

    const line8 = result.lines.find((line) => line.line === "8");
    expect(line8?.value.toNumber()).toBe(2500);
  });

  it("all optional Part II taxes combined", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(10000),
      additionalMedicareTax: d(500),
      niitTax: d(1200),
      unreportedSSTax: d(800),
      uncollectedSSTax: d(300),
      penaltyTax: d(1000),
    }));
    // 10000 + 500 + 1200 + 800 + 300 + 1000 = 13800
    expect(result.partIITotal.toNumber()).toBe(13800);
  });
});

describe("Schedule 2 - Part I + Part II + penalty combinations", () => {
  it("AMT + excess APTC in Part I", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(8000),
      excessAPTCRepayment: d(2500),
    }));
    expect(result.partITotal.toNumber()).toBe(10500);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("all fields populated gives correct grand total", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(5000),
      excessAPTCRepayment: d(1000),
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(900),
      niitTax: d(3800),
      unreportedSSTax: d(500),
      uncollectedSSTax: d(200),
      penaltyTax: d(1000),
      estimatedTaxPenalty: d(350),
    }));
    // Part I: 5000 + 1000 = 6000
    expect(result.partITotal.toNumber()).toBe(6000);
    // Part II: 14130 + 900 + 3800 + 500 + 200 + 1000 = 20530
    expect(result.partIITotal.toNumber()).toBe(20530);
    // Line 21 sums Part II only: $20,530.
    expect(result.totalAdditionalTaxes.toNumber()).toBe(20530);
  });

  it("Schedule 2 Line 19 - excludes estimated tax penalty", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(1000),
      selfEmploymentTax: d(2000),
      estimatedTaxPenalty: d(500),
    }));
    expect(result.partITotal.toNumber()).toBe(1000);
    expect(result.partIITotal.toNumber()).toBe(2000);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(2000);

    const line19 = result.lines.find((line) => line.line === "19");
    expect(line19?.value.toNumber()).toBe(0);
  });

  it("only estimated tax penalty produces a zero Schedule 2 total", () => {
    const result = calculateSchedule2(makeInput({
      estimatedTaxPenalty: d(750),
    }));
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

describe("Schedule 2 - decimal precision", () => {
  it("handles fractional cent amounts correctly", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d("14130.76"),
      additionalMedicareTax: d("900.33"),
      niitTax: d("3800.91"),
    }));
    expect(result.partIITotal.toNumber()).toBe(18832);
  });

  it("large amounts do not lose precision", () => {
    const result = calculateSchedule2(makeInput({
      amt: d("500000"),
      selfEmploymentTax: d("21068.10"),
      additionalMedicareTax: d("9000"),
      niitTax: d("38000"),
    }));
    expect(result.partITotal.toNumber()).toBe(500000);
    expect(result.partIITotal.toNumber()).toBeCloseTo(68068.10, 2);
    expect(result.totalAdditionalTaxes.toNumber()).toBeCloseTo(68068.10, 2);
  });
});

describe("Schedule 2 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(10000),
      additionalMedicareTax: d(500),
      niitTax: d(1000),
    }));
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1a");
    expect(lineIds).toContain("2");
    expect(lineIds).toContain("3");
    expect(lineIds).toContain("4");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("8");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("13");
    expect(lineIds).toContain("17c");
    expect(lineIds).toContain("17d");
    expect(lineIds).toContain("18");
    expect(lineIds).toContain("19");
    expect(lineIds).toContain("21");
  });
});

// ═══════════════════════════════════════════════════════════
// New Tests: Targeted Scenarios
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - AMT only", () => {
  it("AMT only (no SE tax, no Medicare, no NIIT) produces correct total additional taxes", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(12500),
    }));
    expect(result.amt.toNumber()).toBe(12500);
    expect(result.partITotal.toNumber()).toBe(12500);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

describe("Schedule 2 - SE tax only", () => {
  it("SE tax only flows to Schedule 2 Part II and total", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(18371),
    }));
    expect(result.selfEmploymentTax.toNumber()).toBe(18371);
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(18371);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(18371);
  });
});

describe("Schedule 2 - all four additional taxes simultaneously", () => {
  it("AMT, SE tax, additional Medicare, and NIIT all present produce correct totals", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(4000),
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(900),
      niitTax: d(3800),
    }));
    // Part I: 4000
    expect(result.partITotal.toNumber()).toBe(4000);
    // Part II: 14130 + 900 + 3800 = 18830
    expect(result.partIITotal.toNumber()).toBe(18830);
    // Line 21 = Part II only: $18,830.
    expect(result.totalAdditionalTaxes.toNumber()).toBe(18830);
  });
});

describe("Schedule 2 - zero additional taxes", () => {
  it("all inputs zero produces total of zero", () => {
    const result = calculateSchedule2(makeInput());
    expect(result.amt.toNumber()).toBe(0);
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

describe("Schedule 2 - audit trail line IDs", () => {
  it("audit trail contains all expected Schedule 2 line IDs", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(3000),
      excessAPTCRepayment: d(500),
      selfEmploymentTax: d(9000),
      additionalMedicareTax: d(400),
      niitTax: d(2000),
    }));
    const lineIds = result.lines.map((l) => l.line);
    // Part I lines
    expect(lineIds).toContain("1a");
    expect(lineIds).toContain("2");
    expect(lineIds).toContain("3");
    // Part II lines
    expect(lineIds).toContain("4");
    expect(lineIds).toContain("5");
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("8");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("13");
    expect(lineIds).toContain("17c");
    expect(lineIds).toContain("17d");
    // Totals
    expect(lineIds).toContain("18");
    expect(lineIds).toContain("19");
    expect(lineIds).toContain("21");
    expect(new Set(lineIds).size).toBeGreaterThanOrEqual(11);
  });
});

describe("Schedule 2 - very large combined additional taxes", () => {
  it("combined taxes exceeding $100K compute correctly without precision loss", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(45000),
      selfEmploymentTax: d(21068),
      additionalMedicareTax: d(18000),
      niitTax: d(119000),
      estimatedTaxPenalty: d(1500),
    }));
    // Part I: 45000
    expect(result.partITotal.toNumber()).toBe(45000);
    // Part II: 21068 + 18000 + 119000 = 158068
    expect(result.partIITotal.toNumber()).toBe(158068);
    // Part II total excludes AMT and the separately reported penalty.
    expect(result.totalAdditionalTaxes.toNumber()).toBe(158068);
    expect(result.totalAdditionalTaxes.toNumber()).toBeGreaterThan(100000);
  });
});

describe("Schedule 2 - NIIT without AMT", () => {
  it("NIIT calculates independently when AMT is absent", () => {
    const result = calculateSchedule2(makeInput({
      niitTax: d(7600),
    }));
    expect(result.niitTax.toNumber()).toBe(7600);
    expect(result.amt.toNumber()).toBe(0);
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(7600);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(7600);
  });
});

describe("Schedule 2 - estimated tax penalty", () => {
  it("estimated tax penalty stays outside every Schedule 2 total", () => {
    const result = calculateSchedule2(makeInput({
      estimatedTaxPenalty: d(425),
    }));
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });

  it("estimated tax penalty does not add to either Part I or Part II totals", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(3000),
      selfEmploymentTax: d(7000),
      estimatedTaxPenalty: d(300),
    }));
    expect(result.partITotal.toNumber()).toBe(3000);
    expect(result.partIITotal.toNumber()).toBe(7000);
    // 3000 + 7000 + 300 = 10300
    expect(result.totalAdditionalTaxes.toNumber()).toBe(7000);
  });
});

// ═══════════════════════════════════════════════════════════
// AMT Interaction, SE Aggregation, Additional Medicare,
// NIIT, and Total Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - AMT interaction with Part II taxes", () => {
  it("AMT combined with all Part II taxes keeps Part I and Part II independent", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(25000),
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(1800),
      niitTax: d(5700),
      unreportedSSTax: d(400),
      uncollectedSSTax: d(250),
      penaltyTax: d(600),
    }));
    expect(result.partITotal.toNumber()).toBe(25000);
    // Part II: 14130 + 1800 + 5700 + 400 + 250 + 600 = 22880
    expect(result.partIITotal.toNumber()).toBe(22880);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(22880);
    // AMT does not inflate Part II
    expect(result.partIITotal.toNumber()).toBe(
      result.selfEmploymentTax.plus(result.additionalMedicareTax).plus(result.niitTax).plus(d(400)).plus(d(250)).plus(d(600)).toNumber()
    );
  });

  it("AMT with excess APTC does not affect Part II self-employment aggregation", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(10000),
      excessAPTCRepayment: d(3000),
      selfEmploymentTax: d(8000),
      additionalMedicareTax: d(0),
      niitTax: d(0),
    }));
    expect(result.partITotal.toNumber()).toBe(13000);
    expect(result.partIITotal.toNumber()).toBe(8000);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(8000);
  });
});

describe("Schedule 2 - self-employment tax aggregation", () => {
  it("SE tax aggregates with unreported and uncollected SS taxes in Part II", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(14130),
      unreportedSSTax: d(2200),
      uncollectedSSTax: d(1100),
    }));
    // 14130 + 2200 + 1100 = 17430
    expect(result.partIITotal.toNumber()).toBe(17430);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(17430);
  });

  it("SE tax at maximum cap with penalty tax sums correctly", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d("21068.10"),
      penaltyTax: d("4500.50"),
      additionalMedicareTax: d(0),
      niitTax: d(0),
    }));
    // 21068.10 + 4500.50 = 25568.60
    expect(result.partIITotal.toNumber()).toBeCloseTo(25568.60, 2);
    expect(result.totalAdditionalTaxes.toNumber()).toBeCloseTo(25568.60, 2);
  });
});

describe("Schedule 2 - additional Medicare tax edge cases", () => {
  it("additional Medicare tax alone flows correctly without SE or NIIT", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(2700),
      niitTax: d(0),
    }));
    expect(result.additionalMedicareTax.toNumber()).toBe(2700);
    expect(result.partIITotal.toNumber()).toBe(2700);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(2700);
  });

  it("additional Medicare tax with fractional cents rounds via Decimal precision", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: d("1234.567"),
      niitTax: d("8765.433"),
    }));
    // 1234.567 + 8765.433 = 10000.000
    expect(result.partIITotal.toNumber()).toBe(10000);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(10000.000);
  });
});

describe("Schedule 2 - NIIT edge cases", () => {
  it("NIIT combined with additional Medicare tax without SE tax", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(4500),
      niitTax: d(11400),
    }));
    expect(result.partIITotal.toNumber()).toBe(15900);
    expect(result.selfEmploymentTax.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(15900);
  });

  it("NIIT with AMT and estimated tax penalty spans all three sections", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(7500),
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(0),
      niitTax: d(9500),
      estimatedTaxPenalty: d(650),
    }));
    expect(result.partITotal.toNumber()).toBe(7500);
    expect(result.partIITotal.toNumber()).toBe(9500);
    // 7500 + 9500 + 650 = 17650
    expect(result.totalAdditionalTaxes.toNumber()).toBe(9500);
  });
});

describe("Schedule 2 - total additional taxes calculation edge cases", () => {
  it("sub-dollar amounts across all inputs sum precisely", () => {
    const result = calculateSchedule2(makeInput({
      amt: d("0.01"),
      excessAPTCRepayment: d("0.02"),
      selfEmploymentTax: d("0.03"),
      additionalMedicareTax: d("0.04"),
      niitTax: d("0.05"),
      unreportedSSTax: d("0.06"),
      uncollectedSSTax: d("0.07"),
      penaltyTax: d("0.08"),
      estimatedTaxPenalty: d("0.09"),
    }));
    // Part I: 0.01 + 0.02 = 0.03
    expect(result.partITotal.toNumber()).toBe(0.03);
    // Part II: 0.03 + 0.04 + 0.05 + 0.06 + 0.07 + 0.08 = 0.33
    expect(result.partIITotal.toNumber()).toBe(0.33);
    // Line 21 = Part II only: $0.33.
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0.33);
  });

  it("high-income scenario with all taxes produces seven-figure total", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(750000),
      excessAPTCRepayment: d(0),
      selfEmploymentTax: d("21068.10"),
      additionalMedicareTax: d(45000),
      niitTax: d(95000),
      unreportedSSTax: d(5000),
      uncollectedSSTax: d(3000),
      penaltyTax: d(10000),
      estimatedTaxPenalty: d(2500),
    }));
    // Part I: 750000
    expect(result.partITotal.toNumber()).toBe(750000);
    // Part II: 21068.10 + 45000 + 95000 + 5000 + 3000 + 10000 = 179068.10
    expect(result.partIITotal.toNumber()).toBeCloseTo(179068.10, 2);
    // Line 21 = Part II only: $179,068.10.
    expect(result.totalAdditionalTaxes.toNumber()).toBeCloseTo(179068.10, 2);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: AMT, SE, Medicare, NIIT, Penalty, MFS, Audit
// ═══════════════════════════════════════════════════════════

describe("Schedule 2 - AMT flows from Form 6251 to Part I", () => {
  it("AMT from Form 6251 recorded on Line 2 and drives Part I total independently of Part II", () => {
    // Simulates AMT computed by Form 6251 flowing into Schedule 2 Line 2.
    // Part II taxes must remain unaffected.
    const result = calculateSchedule2(makeInput({
      amt: d(18750),
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(0),
      niitTax: d(0),
    }));
    expect(result.amt.toNumber()).toBe(18750);
    expect(result.partITotal.toNumber()).toBe(18750);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
    // Audit trail must record Line 2 with the AMT amount
    const line1 = result.lines.find((l) => l.line === "2");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(18750);
  });

  it("AMT on Line 2 combines with excess APTC on Line 1a to produce Part I total on Line 3", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(6200),
      excessAPTCRepayment: d(3800),
    }));
    // Line 3 = Line 1z + Line 2
    expect(result.partITotal.toNumber()).toBe(10000);
    expect(result.amt.plus(result.excessAPTCRepayment).toNumber()).toBe(
      result.partITotal.toNumber()
    );
  });
});

describe("Schedule 2 - self-employment tax from Schedule SE", () => {
  it("SE tax from Schedule SE Line 12 recorded on Schedule 2 Line 4 and included in Part II", () => {
    // Schedule SE computes SE tax; it flows to Line 4 of Schedule 2 Part II.
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(0),
      niitTax: d(0),
    }));
    expect(result.selfEmploymentTax.toNumber()).toBe(14130);
    expect(result.partIITotal.toNumber()).toBe(14130);
    const line4 = result.lines.find((l) => l.line === "4");
    expect(line4).toBeDefined();
    expect(line4!.value.toNumber()).toBe(14130);
  });

  it("SE tax at the 2024 maximum base ($160,200 × 15.3% / 2) accumulates in Part II total", () => {
    // At the 2024 Social Security wage base cap the SE tax is $21,068.10.
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d("21068.10"),
      additionalMedicareTax: d(0),
      niitTax: d(0),
    }));
    expect(result.partIITotal.toNumber()).toBeCloseTo(21068.10, 2);
    expect(result.totalAdditionalTaxes.toNumber()).toBeCloseTo(21068.10, 2);
  });
});

describe("Schedule 2 - additional Medicare tax from Form 8959", () => {
  it("additional Medicare tax from Form 8959 Line 18 recorded on Schedule 2 Line 11", () => {
    // Form 8959 Line 18 feeds directly to Schedule 2 Line 11.
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(3600),
      niitTax: d(0),
    }));
    expect(result.additionalMedicareTax.toNumber()).toBe(3600);
    const line11 = result.lines.find((l) => l.line === "11");
    expect(line11).toBeDefined();
    expect(line11!.value.toNumber()).toBe(3600);
    expect(result.partIITotal.toNumber()).toBe(3600);
  });

  it("MFS filer additional Medicare tax reflects lower $125K threshold impact on Schedule 2", () => {
    // Under MFS the Form 8959 threshold is $125K (vs $200K single / $250K MFJ).
    // A taxpayer with $175K Medicare wages triggers $450 additional tax under MFS
    // but $0 under single status. Schedule 2 accepts the pre-computed amount from Form 8959.
    const mfsAdditionalMedicare = d(450); // ($175K - $125K) × 0.9%
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: mfsAdditionalMedicare,
      niitTax: d(0),
    }));
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
    expect(result.partIITotal.toNumber()).toBe(450);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(450);
  });
});

describe("Schedule 2 - NIIT from Form 8960", () => {
  it("NIIT from Form 8960 Line 17 recorded on Schedule 2 Line 12", () => {
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(0),
      niitTax: d(5700),
    }));
    expect(result.niitTax.toNumber()).toBe(5700);
    const line12 = result.lines.find((l) => l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.value.toNumber()).toBe(5700);
  });

  it("MFS filer NIIT reflects lower $125K threshold: higher NIIT flows to Schedule 2 Line 12", () => {
    // MFS threshold is $125K; a $200K-MAGI MFS filer owes 3.8% × min(NII, $75K excess).
    // With $50K NII and $75K MAGI excess, taxable base is $50K → NIIT = $1,900.
    const mfsNiit = d(1900); // $50K × 3.8%
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(0),
      niitTax: mfsNiit,
    }));
    expect(result.niitTax.toNumber()).toBe(1900);
    expect(result.partIITotal.toNumber()).toBe(1900);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(1900);
  });
});

describe("Schedule 2 - estimated tax penalty from Form 2210", () => {
  it("estimated tax penalty from Form 2210 is excluded from Schedule 2 line 21", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(2000),
      selfEmploymentTax: d(5000),
      additionalMedicareTax: d(500),
      niitTax: d(1000),
      estimatedTaxPenalty: d(375),
    }));
    // penalty sits outside Part I and Part II
    expect(result.partITotal.toNumber()).toBe(2000);
    expect(result.partIITotal.toNumber()).toBe(6500);
    // Line 21 = Part II; Part I and the penalty are separate.
    expect(result.totalAdditionalTaxes.toNumber()).toBe(6500);
  });

  it("estimated tax penalty alone leaves line 21 at zero", () => {
    const result = calculateSchedule2(makeInput({
      estimatedTaxPenalty: d(612),
    }));
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

describe("Schedule 2 - all additional taxes combined in one return", () => {
  it("all Schedule 2 inputs populated simultaneously produce correct Part I, Part II, and Line 21", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(8000),
      excessAPTCRepayment: d(1500),
      selfEmploymentTax: d(14130),
      additionalMedicareTax: d(900),
      niitTax: d(3800),
      unreportedSSTax: d(600),
      uncollectedSSTax: d(300),
      penaltyTax: d(1200),
      estimatedTaxPenalty: d(450),
    }));
    // Part I: 8000 + 1500 = 9500
    expect(result.partITotal.toNumber()).toBe(9500);
    // Part II: 14130 + 900 + 3800 + 600 + 300 + 1200 = 20930
    expect(result.partIITotal.toNumber()).toBe(20930);
    // Line 21 sums Part II only: $20,930.
    expect(result.totalAdditionalTaxes.toNumber()).toBe(20930);
  });
});

describe("Schedule 2 - zero additional taxes scenario", () => {
  it("return with no additional taxes of any kind produces all-zero Schedule 2 output", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(0),
      excessAPTCRepayment: d(0),
      selfEmploymentTax: d(0),
      additionalMedicareTax: d(0),
      niitTax: d(0),
      unreportedSSTax: d(0),
      uncollectedSSTax: d(0),
      penaltyTax: d(0),
      estimatedTaxPenalty: d(0),
    }));
    expect(result.amt.toNumber()).toBe(0);
    expect(result.excessAPTCRepayment.toNumber()).toBe(0);
    expect(result.selfEmploymentTax.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
    expect(result.niitTax.toNumber()).toBe(0);
    expect(result.partITotal.toNumber()).toBe(0);
    expect(result.partIITotal.toNumber()).toBe(0);
    expect(result.totalAdditionalTaxes.toNumber()).toBe(0);
  });
});

describe("Schedule 2 - Part I vs Part II independence", () => {
  it("Part I total equals sum of AMT and excess APTC regardless of Part II amounts", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(12000),
      excessAPTCRepayment: d(3000),
      selfEmploymentTax: d(20000),
      additionalMedicareTax: d(5000),
      niitTax: d(8000),
    }));
    // Part I is strictly amt + excessAPTCRepayment
    expect(result.partITotal.toNumber()).toBe(
      result.amt.plus(result.excessAPTCRepayment).toNumber()
    );
    // Part II is strictly selfEmploymentTax + additionalMedicareTax + niitTax
    expect(result.partIITotal.toNumber()).toBe(
      result.selfEmploymentTax.plus(result.additionalMedicareTax).plus(result.niitTax).toNumber()
    );
  });

  it("Part II total on Line 21 equals the sum of all Part II component fields", () => {
    const unreportedSS = d(800);
    const form8919Tax = d(350);
    const uncollectedSS = d(400);
    const penalty = d(1100);
    const result = calculateSchedule2(makeInput({
      selfEmploymentTax: d(10000),
      additionalMedicareTax: d(1000),
      niitTax: d(2000),
      unreportedSSTax: unreportedSS,
      form8919Tax,
      uncollectedSSTax: uncollectedSS,
      penaltyTax: penalty,
    }));
    const expectedPartII = result.selfEmploymentTax
      .plus(result.additionalMedicareTax)
      .plus(result.niitTax)
      .plus(unreportedSS)
      .plus(form8919Tax)
      .plus(uncollectedSS)
      .plus(penalty);
    expect(result.partIITotal.toNumber()).toBe(expectedPartII.toNumber());
  });
});

describe("Schedule 2 - audit trail line sources", () => {
  it("audit trail records correct source references for AMT, SE, Medicare, and NIIT lines", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(5000),
      selfEmploymentTax: d(10000),
      additionalMedicareTax: d(800),
      niitTax: d(2000),
    }));
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l]));
    // Line 2: AMT from Form 6251
    expect(byLine["2"].value.toNumber()).toBe(5000);
    // Line 4: SE tax from Schedule SE
    expect(byLine["4"].value.toNumber()).toBe(10000);
    // Line 11: Additional Medicare Tax from Form 8959
    expect(byLine["11"].value.toNumber()).toBe(800);
    // Line 12: NIIT from Form 8960
    expect(byLine["12"].value.toNumber()).toBe(2000);
    // Line 18: line 17 subtotal only
    expect(byLine["18"].value.toNumber()).toBe(0);
    // Line 21: Part II total
    expect(byLine["21"].value.toNumber()).toBe(12800);
  });

  it("audit trail contains exactly one entry per Schedule 2 line (no duplicate lines)", () => {
    const result = calculateSchedule2(makeInput({
      amt: d(1000),
      selfEmploymentTax: d(2000),
      additionalMedicareTax: d(300),
      niitTax: d(400),
    }));
    const lineIds = result.lines.map((l) => l.line);
    const uniqueLineIds = new Set(lineIds);
    expect(lineIds.length).toBe(uniqueLineIds.size);
  });
});
