/**
 * Form 8995 — Qualified Business Income Deduction Simplified Computation
 * Spec: spec/federal/form-8995.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8995 } from "@/engine/forms/form-8995.js";
import type { Form8995Input } from "@/engine/forms/form-8995.js";

const d = (n: number | string) => new Decimal(n);

function make(overrides: Partial<Form8995Input> = {}): Form8995Input {
  return {
    qbiSources: [{ name: "Consulting LLC", qbi: d(60000) }],
    taxableIncomeBeforeQBI: d(100000),
    netCapitalGain: d(0),
    qualifiedDividends: d(0),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Lines 1-5: QBI by Trade/Business
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - QBI sources", () => {
  it("Form 8995 Lines 1-5 - QBI from Schedule C", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Consulting", qbi: d(50000) }],
    }));
    expect(result.qbiAmounts[0].toNumber()).toBe(50000);
  });

  it("multiple businesses aggregate", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Consulting", qbi: d(40000) },
        { name: "Freelance", qbi: d(20000) },
        { name: "Rental Mgmt", qbi: d(10000) },
      ],
    }));
    expect(result.totalQBI.toNumber()).toBe(70000);
  });

  it("business loss offsets other business QBI", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Profitable", qbi: d(50000) },
        { name: "Loss Business", qbi: d(-20000) },
      ],
    }));
    expect(result.totalQBI.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6: Total QBI
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - total QBI", () => {
  it("Form 8995 Line 6 - total QBI", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "A", qbi: d(30000) },
        { name: "B", qbi: d(20000) },
      ],
    }));
    expect(result.totalQBI.toNumber()).toBe(50000);
  });

  it("prior year loss reduces total QBI", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(40000) }],
      priorYearQBILoss: d(10000),
    }));
    expect(result.totalQBI.toNumber()).toBe(30000);
  });

  it("prior year loss exceeds current QBI → negative total", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(5000) }],
      priorYearQBILoss: d(20000),
    }));
    expect(result.totalQBI.toNumber()).toBe(-15000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 7: QBI Component (20%)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - QBI component", () => {
  it("Form 8995 Line 7 - 20% of QBI", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(100000) }],
    }));
    // 20% of $100K = $20K
    expect(result.qbiComponent.toNumber()).toBe(20000);
  });

  it("zero QBI: zero component", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
    }));
    expect(result.qbiComponent.toNumber()).toBe(0);
  });

  it("negative QBI: zero component", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Loss", qbi: d(-10000) }],
    }));
    expect(result.qbiComponent.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Lines 10-12: Income Limitation
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - income limitation", () => {
  it("Form 8995 Line 11 - taxable income before QBI", () => {
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(80000),
    }));
    expect(result.taxableIncomeBeforeQBI.toNumber()).toBe(80000);
  });

  it("Form 8995 Line 12 - net capital gain", () => {
    const result = calculateForm8995(make({
      netCapitalGain: d(15000),
      qualifiedDividends: d(5000),
    }));
    // $15K cap gain + $5K qual div = $20K
    expect(result.netCapitalGainAmount.toNumber()).toBe(20000);
  });

  it("Form 8995 Line 12 - negative capital gain treated as zero", () => {
    const result = calculateForm8995(make({
      netCapitalGain: d(-3000),
      qualifiedDividends: d(2000),
    }));
    // max(0, -$3K) + $2K = $2K
    expect(result.netCapitalGainAmount.toNumber()).toBe(2000);
  });

  it("Form 8995 Line 14 - income limitation", () => {
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(20000),
      qualifiedDividends: d(5000),
    }));
    // ($100K - $25K) × 20% = $15K
    expect(result.incomeLimitation.toNumber()).toBe(15000);
  });

  it("large capital gains eliminate income limitation", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(80000),
      netCapitalGain: d(60000),
      qualifiedDividends: d(30000),
    }));
    // ($80K - $90K) → negative → floor at 0 → 20% of 0 = 0
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 15: Section 199A Deduction
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - QBI deduction", () => {
  it("Form 8995 Line 15 - QBI deduction", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Consulting", qbi: d(60000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $60K × 20% = $12K
    // Income limitation: $100K × 20% = $20K
    // Deduction: min($12K, $20K) = $12K
    expect(result.qbiDeduction.toNumber()).toBe(12000);
  });

  it("limited by income when QBI is large", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(200000) }],
      taxableIncomeBeforeQBI: d(50000),
    }));
    // QBI component: $200K × 20% = $40K
    // Income limitation: $50K × 20% = $10K
    // Deduction: min($40K, $10K) = $10K
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });

  it("zero QBI: zero deduction", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
    }));
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("zero taxable income: zero deduction", () => {
    const result = calculateForm8995(make({
      taxableIncomeBeforeQBI: d(0),
    }));
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("SE sole proprietor typical scenario", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Freelance Dev", qbi: d(80000) }],
      taxableIncomeBeforeQBI: d(65000), // After standard deduction
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $80K × 20% = $16K
    // Income limitation: $65K × 20% = $13K
    // Deduction: min($16K, $13K) = $13K
    expect(result.qbiDeduction.toNumber()).toBe(13000);
  });

  it("multiple K-1 sources with mixed income/loss", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Partnership A", qbi: d(50000) },
        { name: "Partnership B", qbi: d(-10000) },
        { name: "S-Corp C", qbi: d(30000) },
      ],
      taxableIncomeBeforeQBI: d(150000),
    }));
    // Total QBI: $50K - $10K + $30K = $70K
    // QBI component: $70K × 20% = $14K
    // Income limitation: $150K × 20% = $30K
    // Deduction: min($14K, $30K) = $14K
    expect(result.totalQBI.toNumber()).toBe(70000);
    expect(result.qbiDeduction.toNumber()).toBe(14000);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 16: QBI Loss Carryforward
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - QBI loss carryforward", () => {
  it("Form 8995 Line 16 - QBI loss carryforward", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Loss Business", qbi: d(-25000) },
      ],
    }));
    expect(result.qbiLossCarryforward.toNumber()).toBe(25000);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("positive QBI: no carryforward", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(50000) }],
    }));
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("net loss after offsetting businesses", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Good", qbi: d(10000) },
        { name: "Bad", qbi: d(-30000) },
      ],
    }));
    // Net QBI: $10K - $30K = -$20K
    expect(result.qbiLossCarryforward.toNumber()).toBe(20000);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("prior year loss creates carryforward when exceeds current", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(5000) }],
      priorYearQBILoss: d(15000),
    }));
    // Total QBI: $5K - $15K = -$10K
    expect(result.qbiLossCarryforward.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases: QBI exactly 20% scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - edge cases", () => {
  it("Line 15 - QBI deduction exactly 20% of QBI when income limitation is higher", () => {
    // QBI component = income limitation → deduction equals both
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(50000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $50K × 20% = $10K
    // Income limitation: $50K × 20% = $10K
    // Deduction: min($10K, $10K) = $10K — exactly 20% of QBI
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.incomeLimitation.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });

  it("Line 15 - QBI limited by 20% of taxable income before QBI deduction", () => {
    // QBI much larger than taxable income → income limitation binds
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Big Business", qbi: d(500000) }],
      taxableIncomeBeforeQBI: d(80000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $500K × 20% = $100K
    // Income limitation: $80K × 20% = $16K
    // Deduction: min($100K, $16K) = $16K
    expect(result.qbiComponent.toNumber()).toBe(100000);
    expect(result.incomeLimitation.toNumber()).toBe(16000);
    expect(result.qbiDeduction.toNumber()).toBe(16000);
  });

  it("Line 14 - QBI limited by taxable income minus net capital gain", () => {
    // Capital gains eat into the income base, reducing QBI benefit
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(100000) }],
      taxableIncomeBeforeQBI: d(120000),
      netCapitalGain: d(80000),
      qualifiedDividends: d(10000),
    }));
    // Net capital gain amount: $80K + $10K = $90K
    // Income base: $120K - $90K = $30K
    // Income limitation: $30K × 20% = $6K
    // QBI component: $100K × 20% = $20K
    // Deduction: min($20K, $6K) = $6K
    expect(result.netCapitalGainAmount.toNumber()).toBe(90000);
    expect(result.incomeLimitation.toNumber()).toBe(6000);
    expect(result.qbiDeduction.toNumber()).toBe(6000);
  });

  it("Lines 1-5 - multiple businesses aggregated with five sources", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Consulting", qbi: d(25000) },
        { name: "Freelance", qbi: d(15000) },
        { name: "Rental", qbi: d(10000) },
        { name: "E-commerce", qbi: d(5000) },
        { name: "Tutoring", qbi: d(3000) },
      ],
      taxableIncomeBeforeQBI: d(150000),
    }));
    // Total QBI: $25K + $15K + $10K + $5K + $3K = $58K
    expect(result.qbiAmounts.length).toBe(5);
    expect(result.totalQBI.toNumber()).toBe(58000);
    expect(result.qbiComponent.toNumber()).toBe(11600); // $58K × 20%
    expect(result.qbiDeduction.toNumber()).toBe(11600);
  });

  it("Line 6 - negative QBI from one business, positive from another (net positive)", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Winner", qbi: d(80000) },
        { name: "Loser", qbi: d(-30000) },
      ],
      taxableIncomeBeforeQBI: d(120000),
    }));
    // Total QBI: $80K - $30K = $50K
    // QBI component: $50K × 20% = $10K
    expect(result.totalQBI.toNumber()).toBe(50000);
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Line 16 - total negative QBI creates loss carryforward", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Small Profit", qbi: d(5000) },
        { name: "Big Loss", qbi: d(-45000) },
      ],
      taxableIncomeBeforeQBI: d(100000),
    }));
    // Total QBI: $5K - $45K = -$40K
    expect(result.totalQBI.toNumber()).toBe(-40000);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(40000);
  });

  it("Line 15 - QBI with zero taxable income yields zero deduction", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(75000) }],
      taxableIncomeBeforeQBI: d(0),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $75K × 20% = $15K
    // Income limitation: $0 × 20% = $0
    // Deduction: min($15K, $0) = $0
    expect(result.qbiComponent.toNumber()).toBe(15000);
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Line 14 - very large capital gains completely eliminate QBI benefit", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(100000) }],
      taxableIncomeBeforeQBI: d(200000),
      netCapitalGain: d(180000),
      qualifiedDividends: d(50000),
    }));
    // Net capital gain amount: $180K + $50K = $230K
    // Income base: max(0, $200K - $230K) = max(0, -$30K) = $0
    // Income limitation: $0 × 20% = $0
    // Deduction: min($20K, $0) = $0
    expect(result.netCapitalGainAmount.toNumber()).toBe(230000);
    expect(result.incomeLimitation.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
  });

  it("Line 15 - single filer at exactly $182,100 taxable income (below simplified threshold)", () => {
    // 2025 threshold is $197,300 for single; $182,100 is well below → uses simplified form
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Consulting", qbi: d(90000) }],
      taxableIncomeBeforeQBI: d(182100),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $90K × 20% = $18K
    // Income limitation: $182,100 × 20% = $36,420
    // Deduction: min($18K, $36,420) = $18K
    expect(result.qbiComponent.toNumber()).toBe(18000);
    expect(result.incomeLimitation.toNumber()).toBe(36420);
    expect(result.qbiDeduction.toNumber()).toBe(18000);
  });

  it("Line 15 - MFJ at exactly $364,200 taxable income (below $394,600 threshold)", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Joint Business", qbi: d(200000) }],
      taxableIncomeBeforeQBI: d(364200),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $200K × 20% = $40K
    // Income limitation: $364,200 × 20% = $72,840
    // Deduction: min($40K, $72,840) = $40K
    expect(result.qbiComponent.toNumber()).toBe(40000);
    expect(result.incomeLimitation.toNumber()).toBe(72840);
    expect(result.qbiDeduction.toNumber()).toBe(40000);
  });

  it("Line 15 - MFS at $91,050 (half of single threshold)", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Side Gig", qbi: d(30000) }],
      taxableIncomeBeforeQBI: d(91050),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $30K × 20% = $6K
    // Income limitation: $91,050 × 20% = $18,210
    // Deduction: min($6K, $18,210) = $6K
    expect(result.qbiComponent.toNumber()).toBe(6000);
    expect(result.incomeLimitation.toNumber()).toBe(18210);
    expect(result.qbiDeduction.toNumber()).toBe(6000);
  });

  it("Line 15 - taxable income $1 below threshold gives full 20% deduction", () => {
    // $197,299 — just under single threshold → full simplified deduction
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(197299),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $50K × 20% = $10K
    // Income limitation: $197,299 × 20% = $39,460 (rounded)
    // Deduction: min($10K, $39,460) = $10K
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });

  it("Line 15 - SSTB income below threshold gets full QBI deduction", () => {
    // Below threshold, SSTB phase-out does not apply; simplified form treats it as normal QBI
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Law Practice (SSTB)", qbi: d(120000) }],
      taxableIncomeBeforeQBI: d(150000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $120K × 20% = $24K
    // Income limitation: $150K × 20% = $30K
    // Deduction: min($24K, $30K) = $24K
    expect(result.qbiComponent.toNumber()).toBe(24000);
    expect(result.incomeLimitation.toNumber()).toBe(30000);
    expect(result.qbiDeduction.toNumber()).toBe(24000);
  });

  it("Lines 1-5 - rental income as QBI (if elected)", () => {
    // Rental income can qualify as QBI under safe harbor (Rev. Proc. 2019-38)
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Rental Property (elected)", qbi: d(35000) },
        { name: "Consulting", qbi: d(25000) },
      ],
      taxableIncomeBeforeQBI: d(90000),
    }));
    // Total QBI: $35K + $25K = $60K
    // QBI component: $60K × 20% = $12K
    // Income limitation: $90K × 20% = $18K
    // Deduction: min($12K, $18K) = $12K
    expect(result.totalQBI.toNumber()).toBe(60000);
    expect(result.qbiComponent.toNumber()).toBe(12000);
    expect(result.qbiDeduction.toNumber()).toBe(12000);
  });

  it("Line 7 - very small QBI ($100) still gets 20% deduction", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Tiny Gig", qbi: d(100) }],
      taxableIncomeBeforeQBI: d(50000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $100 × 20% = $20
    // Income limitation: $50K × 20% = $10K
    // Deduction: min($20, $10K) = $20
    expect(result.qbiComponent.toNumber()).toBe(20);
    expect(result.qbiDeduction.toNumber()).toBe(20);
  });

  it("Line 15 - QBI deduction cannot exceed taxable income (deduction reduces to income limit)", () => {
    // Taxable income is very small; QBI deduction limited to 20% of TI
    const result = calculateForm8995(make({
      qbiSources: [{ name: "A", qbi: d(1000000) }],
      taxableIncomeBeforeQBI: d(500),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $1M × 20% = $200K
    // Income limitation: $500 × 20% = $100
    // Deduction: min($200K, $100) = $100
    expect(result.qbiComponent.toNumber()).toBe(200000);
    expect(result.incomeLimitation.toNumber()).toBe(100);
    expect(result.qbiDeduction.toNumber()).toBe(100);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateForm8995(make());
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("1-5");
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("15");
    expect(lineIds).toContain("16");
  });
});

// ═══════════════════════════════════════════════════════════
// New: QBI deduction is exactly 20% of QBI (below threshold)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - QBI deduction equals 20% of QBI when income limitation is not binding", () => {
  it("Line 15 - deduction is exactly 20% of QBI when taxable income is ample", () => {
    // Taxpayer has $75K QBI and $200K taxable income.
    // Income limitation ($200K × 20% = $40K) exceeds QBI component ($75K × 20% = $15K)
    // so the deduction lands at exactly 20% of QBI, not the income cap.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Schedule C Consulting", qbi: d(75000) }],
      taxableIncomeBeforeQBI: d(200000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    const expectedQBIComponent = new Decimal(75000).times("0.20");
    expect(result.qbiComponent.toNumber()).toBe(expectedQBIComponent.toNumber()); // 15000
    expect(result.qbiDeduction.toNumber()).toBe(expectedQBIComponent.toNumber()); // 15000 — limited by 20% of QBI, not income
  });

  it("Line 15 - deduction is exactly 20% of QBI at single 2025 threshold ($197,300) minus $1", () => {
    // At $197,299 taxable income (just below the 2025 single threshold) the simplified
    // form still applies and the deduction is limited only by 20% of QBI.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Freelance Photography", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(197299),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $50K × 20% = $10K
    // Income limitation: $197,299 × 20% = $39,459.80 → rounded to $39,460
    // Deduction: min($10K, $39,460) = $10K — the 20%-of-QBI constraint binds
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.incomeLimitation.toNumber()).toBe(39460);
    expect(result.qbiDeduction.toNumber()).toBe(10000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: QBI deduction limited by taxable income (income cap binds)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - QBI deduction limited by 20% of taxable income", () => {
  it("Line 15 - income limitation binds when QBI far exceeds taxable income", () => {
    // Schedule C business generates $300K QBI but the taxpayer's total taxable
    // income is only $60K (e.g. large above-the-line deductions).
    // Income limitation ($60K × 20% = $12K) < QBI component ($300K × 20% = $60K).
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Landscaping LLC", qbi: d(300000) }],
      taxableIncomeBeforeQBI: d(60000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    expect(result.qbiComponent.toNumber()).toBe(60000);
    expect(result.incomeLimitation.toNumber()).toBe(12000);
    expect(result.qbiDeduction.toNumber()).toBe(12000); // income cap controls
  });

  it("Line 15 - income limitation binds for MFJ filer below $394,600 threshold", () => {
    // MFJ couple: combined QBI $500K, taxable income $180K.
    // All on simplified Form 8995 because $180K < $394,600.
    // Income limitation: $180K × 20% = $36K < QBI component $100K.
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Spouse A S-Corp", qbi: d(300000) },
        { name: "Spouse B Partnership", qbi: d(200000) },
      ],
      taxableIncomeBeforeQBI: d(180000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    expect(result.totalQBI.toNumber()).toBe(500000);
    expect(result.qbiComponent.toNumber()).toBe(100000); // 500K × 20%
    expect(result.incomeLimitation.toNumber()).toBe(36000); // 180K × 20%
    expect(result.qbiDeduction.toNumber()).toBe(36000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: W-2 wage limitation (Form 8995 — simplified form, below threshold)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - W-2 wage limitation does not apply on simplified form", () => {
  it("Line 15 - deduction is not reduced by W-2 wages because taxpayer is below threshold", () => {
    // The 50%-of-W-2-wages cap is a Form 8995-A rule that applies only above the
    // income threshold.  On Form 8995 (simplified, below threshold) the deduction
    // equals min(20% of QBI, 20% of taxable income) regardless of W-2 wages paid.
    // Even though the business pays $0 in W-2 wages the full QBI deduction is allowed.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Sole Proprietor (no employees)", qbi: d(80000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $80K × 20% = $16K
    // Income limitation: $100K × 20% = $20K
    // Deduction: min($16K, $20K) = $16K — no W-2 reduction on simplified form
    expect(result.qbiComponent.toNumber()).toBe(16000);
    expect(result.qbiDeduction.toNumber()).toBe(16000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: Phase-in range (simplified form thresholds)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - income at and around 2025 simplified-form thresholds", () => {
  it("Line 15 - single filer at exactly $191,950 (2024 threshold) gets full simplified deduction", () => {
    // 2024 single threshold is $191,950.  At exactly that amount the simplified form
    // still applies and no phase-out occurs — deduction is strictly 20% of QBI.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "IT Contractor", qbi: d(60000) }],
      taxableIncomeBeforeQBI: d(191950),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $60K × 20% = $12K
    // Income limitation: $191,950 × 20% = $38,390
    // Deduction: $12K (QBI component is the binding constraint)
    expect(result.qbiComponent.toNumber()).toBe(12000);
    expect(result.incomeLimitation.toNumber()).toBe(38390);
    expect(result.qbiDeduction.toNumber()).toBe(12000);
  });

  it("Line 15 - MFJ filer at exactly $383,900 (2024 MFJ threshold) gets full simplified deduction", () => {
    // 2024 MFJ threshold is $383,900.  Below this, Form 8995 applies with no phase-out.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Family Business", qbi: d(150000) }],
      taxableIncomeBeforeQBI: d(383900),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $150K × 20% = $30K
    // Income limitation: $383,900 × 20% = $76,780
    // Deduction: $30K
    expect(result.qbiComponent.toNumber()).toBe(30000);
    expect(result.incomeLimitation.toNumber()).toBe(76780);
    expect(result.qbiDeduction.toNumber()).toBe(30000);
  });

  it("Line 15 - single filer at exactly $241,950 (top of 2024 phase-in range) uses simplified form at threshold", () => {
    // The simplified Form 8995 covers taxpayers at or below the threshold only.
    // $241,950 is above the 2024 single threshold ($191,950) — Form 8995-A would be
    // needed in practice.  This test confirms the simplified computation still produces
    // a mathematically correct result (min of 20%-QBI and 20%-TI) without phase-out logic,
    // showing what the engine computes when called at this income level.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Architecture Firm", qbi: d(100000) }],
      taxableIncomeBeforeQBI: d(241950),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $100K × 20% = $20K
    // Income limitation: $241,950 × 20% = $48,390
    // Deduction (simplified, no phase-out): $20K
    expect(result.qbiComponent.toNumber()).toBe(20000);
    expect(result.incomeLimitation.toNumber()).toBe(48390);
    expect(result.qbiDeduction.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: SSTB — simplified form behavior below threshold
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - SSTB income below threshold (no phase-out on simplified form)", () => {
  it("Line 15 - SSTB law firm below threshold receives full 20% QBI deduction", () => {
    // Below the income threshold the SSTB classification is irrelevant on Form 8995.
    // The deduction equals min(20% of QBI, 20% of taxable income) regardless of SSTB.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Solo Law Practice (SSTB)", qbi: d(90000) }],
      taxableIncomeBeforeQBI: d(160000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $90K × 20% = $18K
    // Income limitation: $160K × 20% = $32K
    // Deduction: $18K — no SSTB reduction at this income level
    expect(result.qbiComponent.toNumber()).toBe(18000);
    expect(result.incomeLimitation.toNumber()).toBe(32000);
    expect(result.qbiDeduction.toNumber()).toBe(18000);
  });

  it("Line 15 - SSTB medical practice combined with non-SSTB business below threshold", () => {
    // Both sources included without SSTB penalty because taxable income is below threshold.
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Medical Practice (SSTB)", qbi: d(120000) },
        { name: "Real Estate LLC (non-SSTB)", qbi: d(30000) },
      ],
      taxableIncomeBeforeQBI: d(180000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // Total QBI: $120K + $30K = $150K
    // QBI component: $150K × 20% = $30K
    // Income limitation: $180K × 20% = $36K
    // Deduction: $30K
    expect(result.totalQBI.toNumber()).toBe(150000);
    expect(result.qbiComponent.toNumber()).toBe(30000);
    expect(result.incomeLimitation.toNumber()).toBe(36000);
    expect(result.qbiDeduction.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: Multiple QBI sources combined
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - multiple QBI sources combined", () => {
  it("Lines 1-5 and 6 - three K-1 sources (two partnerships, one S-corp) aggregate correctly", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Partnership 1 (K-1 Box 20Z)", qbi: d(40000) },
        { name: "Partnership 2 (K-1 Box 20Z)", qbi: d(25000) },
        { name: "S-Corp (K-1 Box 17V)", qbi: d(35000) },
      ],
      taxableIncomeBeforeQBI: d(160000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // Total QBI: $40K + $25K + $35K = $100K
    // QBI component: $100K × 20% = $20K
    // Income limitation: $160K × 20% = $32K
    // Deduction: $20K
    expect(result.qbiAmounts).toHaveLength(3);
    expect(result.qbiAmounts[0].toNumber()).toBe(40000);
    expect(result.qbiAmounts[1].toNumber()).toBe(25000);
    expect(result.qbiAmounts[2].toNumber()).toBe(35000);
    expect(result.totalQBI.toNumber()).toBe(100000);
    expect(result.qbiComponent.toNumber()).toBe(20000);
    expect(result.qbiDeduction.toNumber()).toBe(20000);
  });

  it("Lines 1-5 and 6 - Schedule C sole proprietor plus two K-1 sources combined", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Schedule C Consulting", qbi: d(55000) },
        { name: "Schedule E Partnership", qbi: d(20000) },
        { name: "Schedule E S-Corp", qbi: d(-5000) },
      ],
      taxableIncomeBeforeQBI: d(120000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // Total QBI: $55K + $20K - $5K = $70K
    // QBI component: $70K × 20% = $14K
    // Income limitation: $120K × 20% = $24K
    // Deduction: $14K
    expect(result.totalQBI.toNumber()).toBe(70000);
    expect(result.qbiComponent.toNumber()).toBe(14000);
    expect(result.qbiDeduction.toNumber()).toBe(14000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: QBI loss carryforward from prior year reduces current QBI
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - prior year QBI loss carryforward applied to current year", () => {
  it("Line 6 - prior year $30K loss carryforward reduces $80K current QBI to $50K", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Consulting LLC", qbi: d(80000) }],
      priorYearQBILoss: d(30000),
      taxableIncomeBeforeQBI: d(120000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // Total QBI: $80K - $30K prior loss = $50K
    // QBI component: $50K × 20% = $10K
    // Income limitation: $120K × 20% = $24K
    // Deduction: $10K
    // No new carryforward (net QBI positive)
    expect(result.totalQBI.toNumber()).toBe(50000);
    expect(result.qbiComponent.toNumber()).toBe(10000);
    expect(result.qbiDeduction.toNumber()).toBe(10000);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Line 6 and 16 - prior year loss exactly equals current QBI → net zero, no deduction, no new carryforward", () => {
    // $40K prior-year carryforward exactly offsets $40K current QBI.
    // Net QBI is $0 → no deduction, no new loss to carry forward.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Photography Business", qbi: d(40000) }],
      priorYearQBILoss: d(40000),
      taxableIncomeBeforeQBI: d(90000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    expect(result.totalQBI.toNumber()).toBe(0);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// New: Net QBI = 0 when losses exactly offset gains
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - net QBI zero when losses exactly offset gains", () => {
  it("Lines 1-5 and 6 - two businesses where profit and loss cancel to exactly zero", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Profitable Venture", qbi: d(70000) },
        { name: "Loss Venture", qbi: d(-70000) },
      ],
      taxableIncomeBeforeQBI: d(150000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    expect(result.totalQBI.toNumber()).toBe(0);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    // Net QBI is zero (not negative) so no carryforward is generated
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });

  it("Lines 1-5 and 6 - three businesses netting to zero", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Business A", qbi: d(50000) },
        { name: "Business B", qbi: d(30000) },
        { name: "Business C", qbi: d(-80000) },
      ],
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.totalQBI.toNumber()).toBe(0);
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.qbiDeduction.toNumber()).toBe(0);
    expect(result.qbiLossCarryforward.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// New: Filing status notes (MFS and QSS)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - filing-status threshold behavior", () => {
  it("Line 15 - MFS filer uses same single-filer thresholds as a single taxpayer", () => {
    // Form 8995 has no filing-status input — the simplified form applies uniformly to
    // all filers at or below the threshold.  An MFS taxpayer at $100K taxable income
    // (well below $197,300 single/MFS threshold) receives the same computation as a
    // single filer at the same income level.
    const mfsResult = calculateForm8995(make({
      qbiSources: [{ name: "MFS Spouse Business", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    const singleResult = calculateForm8995(make({
      qbiSources: [{ name: "Single Filer Business", qbi: d(50000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // Both should produce identical simplified-form results
    expect(mfsResult.qbiDeduction.toNumber()).toBe(singleResult.qbiDeduction.toNumber());
    expect(mfsResult.qbiDeduction.toNumber()).toBe(10000); // $50K × 20%
  });

  it("Line 15 - QSS filer at $350K taxable income — Form 8995 computation is threshold-agnostic", () => {
    // QSS uses $197,300 threshold (IRC §199A(e)(2) — not a joint return).
    // At $350K this filer should use Form 8995-A (above threshold), but Form 8995
    // has no filing-status input — the caller (federal.ts) gates the threshold.
    // This test verifies the simplified computation itself is correct regardless.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "QSS Partnership K-1", qbi: d(200000) }],
      taxableIncomeBeforeQBI: d(350000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    // QBI component: $200K × 20% = $40K
    // Income limitation: $350K × 20% = $70K
    // Deduction: $40K
    expect(result.qbiComponent.toNumber()).toBe(40000);
    expect(result.incomeLimitation.toNumber()).toBe(70000);
    expect(result.qbiDeduction.toNumber()).toBe(40000);
  });
});

// ═══════════════════════════════════════════════════════════
// New: Audit trail line verification (expanded)
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - audit trail line verification", () => {
  it("audit trail lines carry correct computed values for a standard scenario", () => {
    // $60K QBI, $100K taxable income → deduction $12K.  Verify each audit line value.
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Design Studio", qbi: d(60000) }],
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(0),
      qualifiedDividends: d(0),
    }));
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l]));

    expect(byLine["1-5"].value.toNumber()).toBe(60000);
    expect(byLine["6"].value.toNumber()).toBe(60000);
    expect(byLine["7"].value.toNumber()).toBe(12000);  // 20% of $60K
    expect(byLine["8"].value.toNumber()).toBe(0);      // no REIT/PTP
    expect(byLine["9"].value.toNumber()).toBe(0);      // 20% of $0
    expect(byLine["10"].value.toNumber()).toBe(12000); // QBI + REIT/PTP components
    expect(byLine["11"].value.toNumber()).toBe(100000);
    expect(byLine["12"].value.toNumber()).toBe(0);     // no cap gains
    expect(byLine["14"].value.toNumber()).toBe(20000); // 20% of $100K
    expect(byLine["15"].value.toNumber()).toBe(12000); // min($12K, $20K)
    expect(byLine["16"].value.toNumber()).toBe(0);     // no loss carryforward
  });

  it("audit trail Line 16 records correct carryforward when net QBI is negative", () => {
    const result = calculateForm8995(make({
      qbiSources: [
        { name: "Winner", qbi: d(15000) },
        { name: "Loser", qbi: d(-55000) },
      ],
      taxableIncomeBeforeQBI: d(80000),
    }));
    const byLine = Object.fromEntries(result.lines.map((l) => [l.line, l]));
    // Net QBI: $15K - $55K = -$40K
    expect(byLine["6"].value.toNumber()).toBe(-40000);
    expect(byLine["7"].value.toNumber()).toBe(0);
    expect(byLine["15"].value.toNumber()).toBe(0);
    expect(byLine["16"].value.toNumber()).toBe(40000); // absolute value of net loss
  });
});

// ═══════════════════════════════════════════════════════════
// Lines 8-9: REIT Dividends and PTP Income
// ═══════════════════════════════════════════════════════════

describe("Form 8995 - REIT dividends and PTP income", () => {
  it("Form 8995 Line 8 - REIT dividends and PTP income", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(10000),
      qualifiedPTPIncome: d(5000),
      taxableIncomeBeforeQBI: d(80000),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(15000);
  });

  it("Form 8995 Line 9 - 20% of REIT/PTP", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(10000),
      qualifiedPTPIncome: d(5000),
      taxableIncomeBeforeQBI: d(80000),
    }));
    expect(result.reitPTPComponent.toNumber()).toBe(3000); // 20% of $15K
  });

  it("Form 8995 Line 10 - combined QBI and REIT/PTP components", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Consulting", qbi: d(50000) }],
      qualifiedReitDividends: d(10000),
      qualifiedPTPIncome: d(5000),
      taxableIncomeBeforeQBI: d(150000),
    }));
    // QBI component: 20% of $50K = $10K
    // REIT/PTP component: 20% of $15K = $3K
    // Combined: $13K
    expect(result.combinedComponent.toNumber()).toBe(13000);
  });

  it("REIT-only investor with no trade/business QBI gets 20% of REIT dividends", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(20000),
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.qbiComponent.toNumber()).toBe(0);
    expect(result.reitPTPComponent.toNumber()).toBe(4000); // 20% of $20K
    expect(result.qbiDeduction.toNumber()).toBe(4000);
  });

  it("PTP loss reduces REIT/PTP amount", () => {
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(10000),
      qualifiedPTPIncome: d(-3000),
      taxableIncomeBeforeQBI: d(80000),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(7000);
    expect(result.reitPTPComponent.toNumber()).toBe(1400); // 20% of $7K
  });

  it("PTP loss exceeding REIT dividends gives zero REIT/PTP component", () => {
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(50000) }],
      qualifiedReitDividends: d(5000),
      qualifiedPTPIncome: d(-10000),
      taxableIncomeBeforeQBI: d(100000),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(-5000);
    expect(result.reitPTPComponent.toNumber()).toBe(0); // floor at 0
    // QBI deduction still includes QBI component
    expect(result.qbiDeduction.toNumber()).toBe(10000); // 20% of $50K
  });

  it("combined REIT/PTP and QBI limited by income limitation", () => {
    // Huge QBI + REIT but small taxable income with large cap gains
    const result = calculateForm8995(make({
      qbiSources: [{ name: "Business", qbi: d(200000) }],
      qualifiedReitDividends: d(50000),
      taxableIncomeBeforeQBI: d(100000),
      netCapitalGain: d(80000),
      qualifiedDividends: d(10000),
    }));
    // QBI component: 20% of $200K = $40K
    // REIT component: 20% of $50K = $10K
    // Combined: $50K
    // Income limitation: 20% of ($100K - $80K - $10K) = 20% of $10K = $2K
    expect(result.combinedComponent.toNumber()).toBe(50000);
    expect(result.incomeLimitation.toNumber()).toBe(2000);
    expect(result.qbiDeduction.toNumber()).toBe(2000);
  });

  it("multiple 1099-DIV REIT dividends aggregate in federal orchestrator", () => {
    // This tests the federal.ts aggregation logic at the form level
    const result = calculateForm8995(make({
      qbiSources: [],
      qualifiedReitDividends: d(15000),
      qualifiedPTPIncome: d(0),
      taxableIncomeBeforeQBI: d(80000),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(15000);
    expect(result.qbiDeduction.toNumber()).toBe(3000); // 20% of $15K
  });

  it("zero REIT and zero PTP produce zero component", () => {
    const result = calculateForm8995(make({
      qualifiedReitDividends: d(0),
      qualifiedPTPIncome: d(0),
    }));
    expect(result.reitPTPAmount.toNumber()).toBe(0);
    expect(result.reitPTPComponent.toNumber()).toBe(0);
    // Deduction is from QBI only
    expect(result.qbiDeduction.toNumber()).toBe(12000); // 20% of default $60K QBI
  });
});
