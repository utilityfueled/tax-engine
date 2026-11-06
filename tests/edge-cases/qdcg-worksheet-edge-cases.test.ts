/**
 * Edge case tests for the QDCG (Qualified Dividends and Capital Gain Tax)
 * Worksheet — boundary precision at the 0%/15%/20% capital gains rate
 * thresholds, preferential income capping, and filing-status divergence.
 *
 * Spec: spec/federal/qdcg-worksheet.yaml
 * Constants (2025): Rev. Proc. 2024-40
 *
 * 2025 Capital Gains Thresholds:
 *   0%  → Single $48,350 / MFJ $96,700 / MFS $48,350 / HoH $64,750 / QSS $96,700
 *   15% → Single $533,400 / MFJ $600,050 / MFS $300,025 / HoH $566,700 / QSS $600,050
 *   20% → remainder above 15% threshold
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateCapitalGainsTax } from "@/utils/tax-math.js";
import { getConstants } from "@/models/constants.js";

const constants = getConstants(2025);
const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// 0% Threshold Boundary — Single ($48,350)
// ═══════════════════════════════════════════════════════════

describe("QDCG - 0% threshold boundary (single)", () => {
  it("QDCG Line 10 - all LTCG exactly at 0% threshold ($48,350) → $0 tax", () => {
    // $48,350 total, all from LTCG → ordinary portion = $0
    // Stack: $48,350 fills 0% bracket exactly → preferential tax = $0
    const result = calculateCapitalGainsTax(d(48350), d(0), d(48350), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("QDCG Line 10 - all LTCG $1 below 0% threshold ($48,349) → $0 tax", () => {
    const result = calculateCapitalGainsTax(d(48349), d(0), d(48349), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("QDCG Line 10 - all LTCG $1 above 0% threshold ($48,351) → $0.15 rounds to $0", () => {
    // $48,350 at 0%, $1 at 15% = $0.15 → rounds to $0
    const result = calculateCapitalGainsTax(d(48351), d(0), d(48351), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG Line 10 - all LTCG $100 above 0% threshold ($48,450) → $15 preferential tax", () => {
    // $48,350 at 0%, $100 at 15% = $15
    const result = calculateCapitalGainsTax(d(48450), d(0), d(48450), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(15);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════
// 0% Threshold Boundary — MFJ ($96,700)
// ═══════════════════════════════════════════════════════════

describe("QDCG - 0% threshold boundary (MFJ)", () => {
  it("QDCG Line 10 - MFJ all LTCG exactly at 0% threshold ($96,700) → $0 tax", () => {
    const result = calculateCapitalGainsTax(d(96700), d(0), d(96700), "married_filing_jointly", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("QDCG Line 10 - MFJ all LTCG $1,000 above 0% threshold ($97,700) → $150", () => {
    // $96,700 at 0%, $1,000 at 15% = $150
    const result = calculateCapitalGainsTax(d(97700), d(0), d(97700), "married_filing_jointly", constants);
    expect(result.preferentialTax.toNumber()).toBe(150);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(150);
  });
});

// ═══════════════════════════════════════════════════════════
// Ordinary Income Pushes LTCG Out of 0% Bracket
// ═══════════════════════════════════════════════════════════

describe("QDCG - ordinary income at 0% threshold pushes LTCG into 15%", () => {
  it("QDCG stacking - ordinary exactly at 0% threshold ($48,350), $10K LTCG → all at 15%", () => {
    // ordinaryPortion = $58,350 - $10,000 = $48,350 (= 0% threshold)
    // Stack: $48,350 base → zero room at 0% → all $10K LTCG at 15% = $1,500
    // Published48350–48400 single Tax Table:5567.
    const result = calculateCapitalGainsTax(d(58350), d(0), d(10000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(1500);
    expect(result.ordinaryTax.toNumber()).toBe(5567);
    expect(result.tax.toNumber()).toBe(7067);
  });
});

// ═══════════════════════════════════════════════════════════
// LTCG Spanning 0%/15% Boundary
// ═══════════════════════════════════════════════════════════

describe("QDCG - LTCG spanning 0% and 15% brackets", () => {
  it("QDCG stacking - $18,350 LTCG splits across 0% ($8,350) and 15% ($10,000)", () => {
    // Single, $58,350 total taxable, $18,350 LTCG
    // ordinaryPortion = $40,000, effectivePreferential = $18,350
    // Stack: $40K base → room at 0% = $48,350 - $40,000 = $8,350
    // $8,350 at 0%, $10,000 at 15% = $1,500
    // Published40000–40050 single Tax Table:4565.
    const result = calculateCapitalGainsTax(d(58350), d(0), d(18350), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(1500);
    expect(result.ordinaryTax.toNumber()).toBe(4565);
    expect(result.tax.toNumber()).toBe(6065);
  });
});

// ═══════════════════════════════════════════════════════════
// 15%/20% Threshold Boundary — Single ($533,400)
// ═══════════════════════════════════════════════════════════

describe("QDCG - 15%/20% threshold boundary (single)", () => {
  it("QDCG stacking - all LTCG exactly at 15% threshold ($533,400) → no 20% tax", () => {
    // All LTCG, ordinary portion = $0
    // $48,350 at 0%, $485,050 at 15% = $72,757.50 → $72,758
    // No 20% portion
    const result = calculateCapitalGainsTax(d(533400), d(0), d(533400), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(72758);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(72758);
  });

  it("QDCG stacking - $1,000 above 15% threshold ($534,400) → 20% kicks in", () => {
    // $48,350 at 0%, $485,050 at 15% = $72,757.50, $1,000 at 20% = $200
    // Total = $72,957.50 → $72,958
    const result = calculateCapitalGainsTax(d(534400), d(0), d(534400), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(72958);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(72958);
  });
});

// ═══════════════════════════════════════════════════════════
// LTCG Spanning All Three Brackets (0%, 15%, 20%)
// ═══════════════════════════════════════════════════════════

describe("QDCG - LTCG spanning all three rate brackets", () => {
  it("QDCG stacking - $600K all-LTCG single: $48,350 at 0%, $485,050 at 15%, $66,600 at 20%", () => {
    // preferentialTax = $0 + $72,757.50 + $13,320 = $86,077.50 → $86,078
    const result = calculateCapitalGainsTax(d(600000), d(0), d(600000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(86078);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(86078);
  });
});

// ═══════════════════════════════════════════════════════════
// Preferential Income Exceeds Taxable Income (Line 10 Cap)
// ═══════════════════════════════════════════════════════════

describe("QDCG Line 10 - preferential income capped at taxable income", () => {
  it("QDCG Line 10 - QD $40K but taxable income only $30K → effective preferential = $30K at 0%", () => {
    // Retiree with $40K qualified dividends, standard deduction consumed $10K
    // ordinaryPortion = zeroFloor($30K - $40K) = $0
    // effectivePreferential = $30K - $0 = $30K (capped at taxable)
    // All $30K in 0% bracket
    const result = calculateCapitalGainsTax(d(30000), d(40000), d(0), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("QDCG Line 10 - QD $60K, taxable $44,650 → only $44,650 enters rate brackets", () => {
    // Retiree scenario: $60K QD, $15,350 standard deduction → $44,650 taxable
    // ordinaryPortion = $0, effectivePreferential = $44,650
    // All $44,650 in 0% bracket (< $48,350)
    const result = calculateCapitalGainsTax(d(44650), d(60000), d(0), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Filing Status Comparison: HoH vs Single at Same Income
// ═══════════════════════════════════════════════════════════

describe("QDCG - filing status divergence at same income", () => {
  it("QDCG stacking - HoH $60K total with $10K LTCG → all at 0% (HoH threshold $64,750)", () => {
    // ordinaryPortion = $50K, effectivePreferential = $10K
    // Stack: $50K base, room at 0% = $64,750 - $50K = $14,750 → all $10K at 0%
    // Published50000–50050 HoH Tax Table:5663.
    const result = calculateCapitalGainsTax(d(60000), d(0), d(10000), "head_of_household", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(5663);
    expect(result.tax.toNumber()).toBe(5663);
  });

  it("QDCG stacking - Single $60K total with $10K LTCG → all at 15% (single threshold $48,350)", () => {
    // ordinaryPortion = $50K, effectivePreferential = $10K
    // Stack: $50K base > $48,350 → zero room at 0% → all $10K at 15% = $1,500
    // Published50000–50050 single Tax Table:5920.
    const result = calculateCapitalGainsTax(d(60000), d(0), d(10000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(1500);
    expect(result.ordinaryTax.toNumber()).toBe(5920);
    expect(result.tax.toNumber()).toBe(7420);
  });

  it("QDCG stacking - HoH saves $1,500 vs single on identical $60K income with $10K LTCG", () => {
    const hoh = calculateCapitalGainsTax(d(60000), d(0), d(10000), "head_of_household", constants);
    const single = calculateCapitalGainsTax(d(60000), d(0), d(10000), "single", constants);
    // HoH: $0 preferential tax vs Single: $1,500 preferential tax
    // Plus different ordinary brackets → HoH total lower
    expect(single.tax.minus(hoh.tax).toNumber()).toBe(1757);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Matches MFJ Thresholds
// ═══════════════════════════════════════════════════════════

describe("QDCG - QSS uses MFJ thresholds", () => {
  it("QDCG stacking - QSS and MFJ produce identical results at 0% threshold boundary", () => {
    const qss = calculateCapitalGainsTax(d(96700), d(0), d(96700), "qualifying_surviving_spouse", constants);
    const mfj = calculateCapitalGainsTax(d(96700), d(0), d(96700), "married_filing_jointly", constants);
    expect(qss.tax.toNumber()).toBe(mfj.tax.toNumber());
    expect(qss.preferentialTax.toNumber()).toBe(0);
    expect(mfj.preferentialTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS 15% Threshold ($300,025)
// ═══════════════════════════════════════════════════════════

describe("QDCG - MFS 15% threshold boundary ($300,025)", () => {
  it("QDCG stacking - MFS all LTCG at exact 15% threshold ($300,025) → no 20% portion", () => {
    // $48,350 at 0%, $251,675 at 15% = $37,751.25 → $37,751
    const result = calculateCapitalGainsTax(d(300025), d(0), d(300025), "married_filing_separately", constants);
    expect(result.preferentialTax.toNumber()).toBe(37751);
    expect(result.ordinaryTax.toNumber()).toBe(0);
  });

  it("QDCG stacking - MFS $10K above 15% threshold ($310,025) → 20% on excess", () => {
    // $48,350 at 0%, $251,675 at 15% = $37,751.25, $10,000 at 20% = $2,000
    // Total = $39,751.25 → $39,751
    const result = calculateCapitalGainsTax(d(310025), d(0), d(310025), "married_filing_separately", constants);
    expect(result.preferentialTax.toNumber()).toBe(39751);
  });
});

// ═══════════════════════════════════════════════════════════
// Qualified Dividends + LTCG Combined at Boundary
// ═══════════════════════════════════════════════════════════

describe("QDCG - combined QD and LTCG at bracket boundary", () => {
  it("QDCG stacking - $5K QD + $5K LTCG combined push exactly to 0% threshold", () => {
    // Single, ordinary = $38,350, preferential = $10,000, total = $48,350
    // ordinaryPortion = $38,350, effectivePreferential = $10,000
    // Stack: $38,350 base, room at 0% = $48,350 - $38,350 = $10,000
    // All $10K (QD + LTCG) at 0%
    const result = calculateCapitalGainsTax(d(48350), d(5000), d(5000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });

  it("QDCG stacking - $5K QD + $5K LTCG $1 past 0% threshold → 15% on $1", () => {
    // Total = $48,351, preferential = $10,000
    // ordinaryPortion = $38,351, effectivePreferential = $10,000
    // Stack: room at 0% = $48,350 - $38,351 = $9,999
    // $9,999 at 0%, $1 at 15% = $0.15 → rounds to $0
    const result = calculateCapitalGainsTax(d(48351), d(5000), d(5000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// HoH 0% Threshold Boundary ($64,750)
// ═══════════════════════════════════════════════════════════

describe("QDCG - HoH 0% threshold boundary ($64,750)", () => {
  it("QDCG stacking - HoH all LTCG exactly at 0% threshold ($64,750) → $0 tax", () => {
    const result = calculateCapitalGainsTax(d(64750), d(0), d(64750), "head_of_household", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(0);
  });

  it("QDCG stacking - HoH all LTCG $1,000 above 0% threshold ($65,750) → $150 at 15%", () => {
    // $64,750 at 0%, $1,000 at 15% = $150
    const result = calculateCapitalGainsTax(d(65750), d(0), d(65750), "head_of_household", constants);
    expect(result.preferentialTax.toNumber()).toBe(150);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(150);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ 15%/20% Threshold Boundary ($600,050)
// ═══════════════════════════════════════════════════════════

describe("QDCG - MFJ 15%/20% threshold boundary ($600,050)", () => {
  it("QDCG stacking - MFJ all LTCG exactly at 15% threshold ($600,050) → no 20% portion", () => {
    // $96,700 at 0%, $503,350 at 15% = $75,502.50 → $75,503
    const result = calculateCapitalGainsTax(d(600050), d(0), d(600050), "married_filing_jointly", constants);
    expect(result.preferentialTax.toNumber()).toBe(75503);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(75503);
  });

  it("QDCG stacking - MFJ $1,000 above 15% threshold ($601,050) → 20% kicks in on $1,000", () => {
    // $96,700 at 0%, $503,350 at 15% = $75,502.50, $1,000 at 20% = $200
    // Total = $75,702.50 → $75,703
    const result = calculateCapitalGainsTax(d(601050), d(0), d(601050), "married_filing_jointly", constants);
    expect(result.preferentialTax.toNumber()).toBe(75703);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(75703);
  });
});

// ═══════════════════════════════════════════════════════════
// HoH 15%/20% Threshold Boundary ($566,700)
// ═══════════════════════════════════════════════════════════

describe("QDCG - HoH 15%/20% threshold boundary ($566,700)", () => {
  it("QDCG stacking - HoH all LTCG exactly at 15% threshold ($566,700) → no 20% portion", () => {
    // $64,750 at 0%, $501,950 at 15% = $75,292.50 → $75,293
    const result = calculateCapitalGainsTax(d(566700), d(0), d(566700), "head_of_household", constants);
    expect(result.preferentialTax.toNumber()).toBe(75293);
    expect(result.ordinaryTax.toNumber()).toBe(0);
    expect(result.tax.toNumber()).toBe(75293);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Matches MFJ at 15%/20% Boundary
// ═══════════════════════════════════════════════════════════

describe("QDCG - QSS uses MFJ 15%/20% threshold ($600,050)", () => {
  it("QDCG stacking - QSS and MFJ produce identical results at 15%/20% boundary", () => {
    const qss = calculateCapitalGainsTax(d(600050), d(0), d(600050), "qualifying_surviving_spouse", constants);
    const mfj = calculateCapitalGainsTax(d(600050), d(0), d(600050), "married_filing_jointly", constants);
    expect(qss.tax.toNumber()).toBe(mfj.tax.toNumber());
    expect(qss.preferentialTax.toNumber()).toBe(75503);
    expect(mfj.preferentialTax.toNumber()).toBe(75503);
  });
});

// ═══════════════════════════════════════════════════════════
// High Ordinary Income Pushes All Preferential into 20%
// ═══════════════════════════════════════════════════════════

describe("QDCG - high ordinary income forces all preferential into 20%", () => {
  it("QDCG stacking - single $550K ordinary + $10K LTCG: ordinary base exceeds 15% threshold → all at 20%", () => {
    // ordinaryPortion = $550,000 (above $533,400 15% threshold)
    // No room at 0% or 15% → all $10K LTCG at 20% = $2,000
    const result = calculateCapitalGainsTax(d(560000), d(0), d(10000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(2000);
    expect(result.ordinaryTax.toNumber()).toBe(162047);
    expect(result.tax.toNumber()).toBe(164047);
  });
});

// ═══════════════════════════════════════════════════════════
// §1250 Unrecaptured Gain — Special 25% Maximum Rate
// ═══════════════════════════════════════════════════════════

describe("QDCG - §1250 gain at various bracket positions", () => {
  it("ScheduleD1250 - low-income special gain uses ordinary tax", () => {
    // Official line21=10000; published10000–10050 tax1003. Remaining20000 gains at0%.
    const result = calculateCapitalGainsTax(d(30000), d(0), d(30000), "single", constants, {
      section1250Gain: d(10000),
    });
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(1003);
    expect(result.tax.toNumber()).toBe(1003);
  });

  it("ScheduleD1250 - ordinary-rate special gain and regular gains cross fifteen-percent ceiling", () => {
    // Single, $540K all LTCG, §1250 = $20K
    // Official line21=20000 -> published table2165. Zero-rate gain28350;
    // regular gain485050*15%=72758 and6600*20%=1320. Line39=0;
    // the20000 special gain is already included in ordinary line21.
    const result = calculateCapitalGainsTax(d(540000), d(0), d(540000), "single", constants, {
      section1250Gain: d(20000),
    });
    expect(result.preferentialTax.toNumber()).toBe(74078);
    expect(result.ordinaryTax.toNumber()).toBe(2165);
    expect(result.tax.toNumber()).toBe(76243);
  });

  it("QDCG §1250 - gain entirely above 15% threshold → full 25% rate", () => {
    // Single, $560K total, $550K ordinary + $10K LTCG (all §1250)
    // Ordinary base $550K exceeds 15% threshold ($533,400) → all preferential above 15%
    // §1250 portion = min($10K, $10K) = $10K at 25% = $2,500
    const result = calculateCapitalGainsTax(d(560000), d(0), d(10000), "single", constants, {
      section1250Gain: d(10000),
    });
    expect(result.preferentialTax.toNumber()).toBe(2500);
    expect(result.ordinaryTax.toNumber()).toBe(162047);
    expect(result.tax.toNumber()).toBe(164547);
  });
});

// ═══════════════════════════════════════════════════════════
// Collectibles Gain — Special 28% Maximum Rate
// ═══════════════════════════════════════════════════════════

describe("QDCG - collectibles gain at various bracket positions", () => {
  it("ScheduleD collectibles - ordinary-rate special gain preserves regular gain thresholds", () => {
    // Single, $100K all LTCG, collectibles = $10K
    // Official line21=10000 -> table1003. Regular gains38350 at0%
    // and51650*15%=7748. Line42=0, because special gain is in line21.
    const result = calculateCapitalGainsTax(d(100000), d(0), d(100000), "single", constants, {
      collectiblesGain: d(10000),
    });
    expect(result.preferentialTax.toNumber()).toBe(7748);
    expect(result.ordinaryTax.toNumber()).toBe(1003);
    expect(result.tax.toNumber()).toBe(8751);
  });

  it("QDCG collectibles - gain entirely above 15% threshold → full 28% rate", () => {
    // Single, $560K total, $550K ordinary + $10K LTCG (all collectibles)
    // Ordinary base $550K exceeds 15% threshold → all preferential above 15%
    // Collectibles = min($10K, $10K) = $10K at 28% = $2,800
    const result = calculateCapitalGainsTax(d(560000), d(0), d(10000), "single", constants, {
      collectiblesGain: d(10000),
    });
    expect(result.preferentialTax.toNumber()).toBe(2800);
    expect(result.ordinaryTax.toNumber()).toBe(162047);
    expect(result.tax.toNumber()).toBe(164847);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed §1250 + Collectibles + Regular LTCG Above 15%
// ═══════════════════════════════════════════════════════════

describe("QDCG - mixed special rates above 15% threshold", () => {
  it("QDCG stacking - collectibles at 28%, §1250 at 25%, remainder at 20% in correct order", () => {
    // Single, $560K total, $530K ordinary + $30K LTCG
    // §1250 = $10K, collectibles = $10K, regular LTCG = $10K
    // ordinaryPortion = $530,000 → just below 15% threshold ($533,400)
    // Room at 15% = $533,400 - $530,000 = $3,400; taxed at 15% = $510
    // Remaining $26,600 above 15% threshold:
    //   Collectibles: min($10K, $26,600) = $10K at 28% = $2,800
    //   §1250: min($10K, $16,600) = $10K at 25% = $2,500
    //   Remainder: $6,600 at 20% = $1,320
    // preferentialTax = $510 + $2,800 + $2,500 + $1,320 = $7,130
    const result = calculateCapitalGainsTax(d(560000), d(0), d(30000), "single", constants, {
      section1250Gain: d(10000),
      collectiblesGain: d(10000),
    });
    expect(result.preferentialTax.toNumber()).toBe(7130);
    expect(result.ordinaryTax.toNumber()).toBe(155047);
    expect(result.tax.toNumber()).toBe(162177);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and Negative Preferential Income
// ═══════════════════════════════════════════════════════════

describe("QDCG - zero and negative preferential income", () => {
  it("QDCG - zero preferential income falls back to pure ordinary rates", () => {
    // Single, $100K all ordinary, no QD or LTCG
    const result = calculateCapitalGainsTax(d(100000), d(0), d(0), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(0);
    expect(result.ordinaryTax.toNumber()).toBe(16914);
    expect(result.tax.toNumber()).toBe(16914);
  });

  it("QDCG - net capital loss does not erase actual qualified dividends", () => {
    // Official QDCG3=0 for net loss; line2 retains5000 actual QD.
    // Line5=45000 -> published table5165. QD3350 at0%,1650*15%=248.
    const result = calculateCapitalGainsTax(d(50000), d(5000), d(-6000), "single", constants);
    expect(result.preferentialTax.toNumber()).toBe(248);
    expect(result.ordinaryTax.toNumber()).toBe(5165);
    expect(result.tax.toNumber()).toBe(5413);
  });
});
