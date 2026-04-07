/**
 * Tests for NY MCTMT — Metropolitan Commuter Transportation Mobility Tax.
 * Spec: spec/state/ny-mctmt.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import {
  calculateNYMCTMT,
  computeZoneMCTMT,
  MCTMT_RATES,
  type NYMCTMTInput,
} from "@/engine/state/ny-mctmt.js";

function d(v: number | string): Decimal {
  return new Decimal(v);
}

function baseInput(overrides: Partial<NYMCTMTInput> = {}): NYMCTMTInput {
  return {
    taxYear: 2025,
    ...overrides,
  };
}

/* ---------- computeZoneMCTMT helper ---------- */

describe("computeZoneMCTMT", () => {
  const rate = d("0.0060");
  const threshold = d(50000);

  it("returns zero when earnings are zero", () => {
    expect(computeZoneMCTMT(d(0), rate, threshold).equals(d(0))).toBe(true);
  });

  it("returns zero when earnings exactly equal threshold", () => {
    expect(computeZoneMCTMT(d(50000), rate, threshold).equals(d(0))).toBe(true);
  });

  it("returns zero when earnings below threshold", () => {
    expect(computeZoneMCTMT(d(49999), rate, threshold).equals(d(0))).toBe(true);
  });

  it("applies rate to full amount when earnings exceed threshold by $1", () => {
    // $50,001 × 0.60% = $300.006 → rounds to $300
    const result = computeZoneMCTMT(d(50001), rate, threshold);
    expect(result.equals(d(300))).toBe(true);
  });

  it("applies rate to full amount for large earnings", () => {
    // $200,000 × 0.60% = $1,200
    const result = computeZoneMCTMT(d(200000), rate, threshold);
    expect(result.equals(d(1200))).toBe(true);
  });

  it("rounds to nearest dollar", () => {
    // $75,500 × 0.60% = $453 (exact)
    const result = computeZoneMCTMT(d(75500), rate, threshold);
    expect(result.equals(d(453))).toBe(true);
  });

  it("rounds half-up", () => {
    // $83,333 × 0.60% = $499.998 → rounds to $500
    const result = computeZoneMCTMT(d(83333), rate, threshold);
    expect(result.equals(d(500))).toBe(true);
  });
});

/* ---------- Zone 1 (NYC) ---------- */

describe("NY MCTMT — Zone 1 (NYC)", () => {
  it("Zone 1 earnings $0: no tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 0 }));
    expect(result.zone1.tax.equals(d(0))).toBe(true);
    expect(result.zone1.exceedsThreshold).toBe(false);
  });

  it("Zone 1 earnings exactly $50,000: no tax (cliff threshold)", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 50000 }));
    expect(result.zone1.tax.equals(d(0))).toBe(true);
    expect(result.zone1.exceedsThreshold).toBe(false);
  });

  it("Zone 1 earnings $50,001: tax on full amount", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 50001 }));
    // $50,001 × 0.0060 = $300.006 → $300
    expect(result.zone1.tax.equals(d(300))).toBe(true);
    expect(result.zone1.exceedsThreshold).toBe(true);
  });

  it("Zone 1 earnings $100,000: $600 tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 100000 }));
    // $100,000 × 0.0060 = $600
    expect(result.zone1.tax.equals(d(600))).toBe(true);
  });

  it("Zone 1 earnings $250,000: $1,500 tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 250000 }));
    // $250,000 × 0.0060 = $1,500
    expect(result.zone1.tax.equals(d(1500))).toBe(true);
  });

  it("Zone 1 earnings $500,000: $3,000 tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 500000 }));
    expect(result.zone1.tax.equals(d(3000))).toBe(true);
  });

  it("Zone 1 earnings $1,000,000: $6,000 tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 1000000 }));
    expect(result.zone1.tax.equals(d(6000))).toBe(true);
  });

  it("Zone 1 rate is 0.60% for 2025", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 75000 }));
    expect(result.zone1.rate.equals(d("0.0060"))).toBe(true);
  });
});

/* ---------- Zone 2 (Suburban) ---------- */

describe("NY MCTMT — Zone 2 (Suburban)", () => {
  it("Zone 2 earnings $0: no tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone2Earnings: 0 }));
    expect(result.zone2.tax.equals(d(0))).toBe(true);
    expect(result.zone2.exceedsThreshold).toBe(false);
  });

  it("Zone 2 earnings exactly $50,000: no tax (cliff threshold)", () => {
    const result = calculateNYMCTMT(baseInput({ zone2Earnings: 50000 }));
    expect(result.zone2.tax.equals(d(0))).toBe(true);
    expect(result.zone2.exceedsThreshold).toBe(false);
  });

  it("Zone 2 earnings $50,001: tax on full amount", () => {
    const result = calculateNYMCTMT(baseInput({ zone2Earnings: 50001 }));
    // $50,001 × 0.0034 = $170.0034 → $170
    expect(result.zone2.tax.equals(d(170))).toBe(true);
    expect(result.zone2.exceedsThreshold).toBe(true);
  });

  it("Zone 2 earnings $100,000: $340 tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone2Earnings: 100000 }));
    // $100,000 × 0.0034 = $340
    expect(result.zone2.tax.equals(d(340))).toBe(true);
  });

  it("Zone 2 earnings $250,000: $850 tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone2Earnings: 250000 }));
    // $250,000 × 0.0034 = $850
    expect(result.zone2.tax.equals(d(850))).toBe(true);
  });

  it("Zone 2 rate is 0.34% for 2025", () => {
    const result = calculateNYMCTMT(baseInput({ zone2Earnings: 75000 }));
    expect(result.zone2.rate.equals(d("0.0034"))).toBe(true);
  });
});

/* ---------- Both zones ---------- */

describe("NY MCTMT — Both zones", () => {
  it("earnings in both zones: taxes sum independently", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 100000,
      zone2Earnings: 80000,
    }));
    // Zone 1: $100,000 × 0.0060 = $600
    // Zone 2: $80,000 × 0.0034 = $272
    // Total: $872
    expect(result.zone1.tax.equals(d(600))).toBe(true);
    expect(result.zone2.tax.equals(d(272))).toBe(true);
    expect(result.totalMCTMT.equals(d(872))).toBe(true);
  });

  it("Zone 1 above threshold but Zone 2 below: only Zone 1 taxed", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 75000,
      zone2Earnings: 30000,
    }));
    // Zone 1: $75,000 × 0.0060 = $450
    // Zone 2: $0 (below threshold)
    expect(result.zone1.tax.equals(d(450))).toBe(true);
    expect(result.zone2.tax.equals(d(0))).toBe(true);
    expect(result.totalMCTMT.equals(d(450))).toBe(true);
  });

  it("both zones below threshold: zero total tax", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 40000,
      zone2Earnings: 45000,
    }));
    expect(result.totalMCTMT.equals(d(0))).toBe(true);
  });

  it("no earnings at all: zero total", () => {
    const result = calculateNYMCTMT(baseInput());
    expect(result.totalMCTMT.equals(d(0))).toBe(true);
    expect(result.spouseZone1).toBeNull();
    expect(result.spouseZone2).toBeNull();
  });
});

/* ---------- MFJ spouse separate threshold ---------- */

describe("NY MCTMT — MFJ spouse separate evaluation", () => {
  it("each spouse evaluated independently against threshold", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 60000,   // Primary: above threshold → taxed
      spouseZone1Earnings: 40000, // Spouse: below threshold → not taxed
    }));

    // Primary: $60,000 × 0.0060 = $360
    expect(result.zone1.tax.equals(d(360))).toBe(true);
    // Spouse: $0 (below $50K)
    expect(result.spouseZone1!.tax.equals(d(0))).toBe(true);
    expect(result.spouseZone1!.exceedsThreshold).toBe(false);
    expect(result.totalMCTMT.equals(d(360))).toBe(true);
  });

  it("both spouses above threshold: both taxed", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 80000,
      spouseZone1Earnings: 70000,
    }));

    // Primary: $80,000 × 0.0060 = $480
    // Spouse: $70,000 × 0.0060 = $420
    expect(result.zone1.tax.equals(d(480))).toBe(true);
    expect(result.spouseZone1!.tax.equals(d(420))).toBe(true);
    expect(result.totalMCTMT.equals(d(900))).toBe(true);
  });

  it("spouse in Zone 2, primary in Zone 1", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 100000,
      spouseZone2Earnings: 75000,
    }));

    // Primary Zone 1: $100,000 × 0.0060 = $600
    // Spouse Zone 2: $75,000 × 0.0034 = $255
    expect(result.zone1.tax.equals(d(600))).toBe(true);
    expect(result.spouseZone2!.tax.equals(d(255))).toBe(true);
    expect(result.totalMCTMT.equals(d(855))).toBe(true);
  });

  it("spouse has zero earnings: no spouse result populated", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 80000,
      spouseZone1Earnings: 0,
      spouseZone2Earnings: 0,
    }));

    // Both spouse earnings are zero → hasSpouse is false
    expect(result.spouseZone1).toBeNull();
    expect(result.spouseZone2).toBeNull();
  });

  it("MFJ with all four zone/spouse combinations", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 100000,
      zone2Earnings: 60000,
      spouseZone1Earnings: 80000,
      spouseZone2Earnings: 55000,
    }));

    // Primary Z1: $100K × 0.0060 = $600
    // Primary Z2: $60K × 0.0034 = $204
    // Spouse Z1: $80K × 0.0060 = $480
    // Spouse Z2: $55K × 0.0034 = $187
    // Total: $600 + $204 + $480 + $187 = $1,471
    expect(result.zone1.tax.equals(d(600))).toBe(true);
    expect(result.zone2.tax.equals(d(204))).toBe(true);
    expect(result.spouseZone1!.tax.equals(d(480))).toBe(true);
    expect(result.spouseZone2!.tax.equals(d(187))).toBe(true);
    expect(result.totalMCTMT.equals(d(1471))).toBe(true);
  });
});

/* ---------- Cliff threshold edge cases ---------- */

describe("NY MCTMT — Cliff threshold edge cases", () => {
  it("$49,999 earnings: no tax", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: 49999 }));
    expect(result.zone1.tax.equals(d(0))).toBe(true);
  });

  it("$50,000.00 earnings: no tax (exactly at threshold)", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: "50000.00" }));
    expect(result.zone1.tax.equals(d(0))).toBe(true);
  });

  it("$50,000.01 earnings: taxed on full amount", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: "50000.01" }));
    // $50,000.01 × 0.0060 = $300.00006 → $300
    expect(result.zone1.tax.equals(d(300))).toBe(true);
    expect(result.zone1.exceedsThreshold).toBe(true);
  });

  it("negative earnings treated as zero (no tax)", () => {
    const result = calculateNYMCTMT(baseInput({ zone1Earnings: -10000 }));
    expect(result.zone1.tax.equals(d(0))).toBe(true);
    expect(result.zone1.exceedsThreshold).toBe(false);
  });
});

/* ---------- Multi-year rate validation ---------- */

describe("NY MCTMT — Rate validation by year", () => {
  it("2025: Zone 1 = 0.60%, Zone 2 = 0.34%", () => {
    expect(MCTMT_RATES[2025].zone1Rate.equals(d("0.0060"))).toBe(true);
    expect(MCTMT_RATES[2025].zone2Rate.equals(d("0.0034"))).toBe(true);
    expect(MCTMT_RATES[2025].threshold.equals(d(50000))).toBe(true);
  });

  it("2024: Zone 1 = 0.60%, Zone 2 = 0.34%", () => {
    expect(MCTMT_RATES[2024].zone1Rate.equals(d("0.0060"))).toBe(true);
    expect(MCTMT_RATES[2024].zone2Rate.equals(d("0.0034"))).toBe(true);
  });

  it("2023: Zone 1 = 0.47%, Zone 2 = 0.34%", () => {
    expect(MCTMT_RATES[2023].zone1Rate.equals(d("0.0047"))).toBe(true);
    expect(MCTMT_RATES[2023].zone2Rate.equals(d("0.0034"))).toBe(true);
  });

  it("TY 2023 computation uses 0.47% Zone 1 rate", () => {
    const result = calculateNYMCTMT({
      taxYear: 2023,
      zone1Earnings: 100000,
    });
    // $100,000 × 0.0047 = $470
    expect(result.zone1.tax.equals(d(470))).toBe(true);
  });

  it("throws for unsupported tax year", () => {
    expect(() => calculateNYMCTMT({ taxYear: 2020 })).toThrow(
      "MCTMT rates not available for tax year 2020"
    );
  });
});

/* ---------- Audit trail ---------- */

describe("NY MCTMT — Audit trail", () => {
  it("produces audit lines for all zones", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 80000,
      zone2Earnings: 60000,
    }));

    const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));
    expect(lineMap.has("NY-MCTMT:54a")).toBe(true);
    expect(lineMap.has("NY-MCTMT:54b")).toBe(true);
    expect(lineMap.has("NY-MCTMT:54c")).toBe(true);
    expect(lineMap.has("NY-MCTMT:54d")).toBe(true);
    expect(lineMap.has("NY-MCTMT:54e")).toBe(true);
  });

  it("includes spouse audit lines when spouse has earnings", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 80000,
      spouseZone1Earnings: 60000,
    }));

    const lineMap = new Map(result.lines.map(l => [`${l.form}:${l.line}`, l]));
    expect(lineMap.has("NY-MCTMT:54a-sp")).toBe(true);
    expect(lineMap.has("NY-MCTMT:54b-sp")).toBe(true);
  });

  it("total line (54e) value matches totalMCTMT", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 100000,
      zone2Earnings: 75000,
    }));

    const line54e = result.lines.find(l => l.line === "54e");
    expect(line54e).toBeDefined();
    expect(line54e!.value.equals(result.totalMCTMT)).toBe(true);
  });
});

/* ---------- Realistic scenarios ---------- */

describe("NY MCTMT — Realistic scenarios", () => {
  it("NYC freelancer with $120K net SE earnings", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 120000,
    }));
    // $120,000 × 0.0060 = $720
    expect(result.totalMCTMT.equals(d(720))).toBe(true);
  });

  it("Westchester consultant with $200K net SE earnings", () => {
    const result = calculateNYMCTMT(baseInput({
      zone2Earnings: 200000,
    }));
    // $200,000 × 0.0034 = $680
    expect(result.totalMCTMT.equals(d(680))).toBe(true);
  });

  it("MFJ: NYC lawyer + Nassau County therapist", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 300000,    // Lawyer in NYC
      spouseZone2Earnings: 90000, // Therapist in Nassau
    }));
    // Lawyer: $300,000 × 0.0060 = $1,800
    // Therapist: $90,000 × 0.0034 = $306
    // Total: $2,106
    expect(result.zone1.tax.equals(d(1800))).toBe(true);
    expect(result.spouseZone2!.tax.equals(d(306))).toBe(true);
    expect(result.totalMCTMT.equals(d(2106))).toBe(true);
  });

  it("small side gig below threshold: no MCTMT", () => {
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 25000,
    }));
    expect(result.totalMCTMT.equals(d(0))).toBe(true);
  });

  it("multi-location business split across zones", () => {
    // Business allocated 60% to NYC, 40% to Westchester
    // Total net SE = $150,000
    const result = calculateNYMCTMT(baseInput({
      zone1Earnings: 90000,  // 60% of $150K
      zone2Earnings: 60000,  // 40% of $150K
    }));
    // Zone 1: $90,000 × 0.0060 = $540
    // Zone 2: $60,000 × 0.0034 = $204
    // Total: $744
    expect(result.zone1.tax.equals(d(540))).toBe(true);
    expect(result.zone2.tax.equals(d(204))).toBe(true);
    expect(result.totalMCTMT.equals(d(744))).toBe(true);
  });
});
