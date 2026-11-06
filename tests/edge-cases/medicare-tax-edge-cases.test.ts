/**
 * Edge case tests for Form 8959 — Additional Medicare Tax
 * Tests SE income interaction, W-2 + SE combinations,
 * threshold boundaries, and MFJ spouse wage combining.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8959 } from "@/engine/forms/form-8959.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeW2Input(wages: string, medicareWages?: string, medicareWithheld?: string): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      wages,
      medicareWages: medicareWages ?? wages,
      medicareWithheld: medicareWithheld ?? String(Number(medicareWages ?? wages) * 0.0145),
    }],
  };
}

// ═══════════════════════════════════════════════════════════
// SE Income Interaction
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - SE income interaction", () => {
  it("SE income alone triggers Additional Medicare Tax when over threshold", () => {
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(250000), "single", c);
    // SE $250K - $200K threshold = $50K × 0.9% = $450
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });

  it("SE income alone below threshold produces zero tax", () => {
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(150000), "single", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("W-2 wages + SE income combine against threshold", () => {
    // W-2: $150K + SE: $80K = $230K. Single threshold = $200K.
    // Excess = $30K × 0.9% = $270
    const input = makeW2Input("150000");
    const result = calculateForm8959(input, d(80000), "single", c);
    expect(result.totalEarnings.toNumber()).toBe(230000);
    expect(result.additionalMedicareTax.toNumber()).toBe(270);
  });

  it("W-2 below threshold but SE pushes over", () => {
    // W-2: $180K, SE: $50K = $230K. Excess = $30K × 0.9% = $270
    const input = makeW2Input("180000");
    const result = calculateForm8959(input, d(50000), "single", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(270);
  });
});

// ═══════════════════════════════════════════════════════════
// Threshold Boundary Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - threshold boundaries", () => {
  it("exactly at $200K single threshold produces zero tax", () => {
    const input = makeW2Input("200000");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("$1 over $200K threshold produces $0 (rounds to zero)", () => {
    const input = makeW2Input("200001");
    const result = calculateForm8959(input, d(0), "single", c);
    // $1 × 0.9% = $0.009 → rounds to $0
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("$1000 over threshold produces $9 tax", () => {
    const input = makeW2Input("201000");
    const result = calculateForm8959(input, d(0), "single", c);
    // $1,000 × 0.9% = $9
    expect(result.additionalMedicareTax.toNumber()).toBe(9);
  });

  it("exactly at $125K MFS threshold produces zero", () => {
    const input = makeW2Input("125000");
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("exactly at $250K MFJ threshold produces zero", () => {
    const input = makeW2Input("250000");
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("HoH uses $200K threshold (same as single)", () => {
    const input = makeW2Input("220000");
    const result = calculateForm8959(input, d(0), "head_of_household", c);
    // $20K × 0.9% = $180
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Spouse Combining
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFJ spouse wages", () => {
  it("two spouses with separate W-2s combine against $250K threshold", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "180000",
          medicareWages: "180000",
          medicareWithheld: "2610",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Spouse Corp", ein: "99-1234567" },
          wages: "120000",
          medicareWages: "120000",
          medicareWithheld: "1740",
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    // Combined: $300K. Excess = $300K - $250K = $50K × 0.9% = $450
    expect(result.medicareWages.toNumber()).toBe(300000);
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });

  it("withholding credit reflects employer over-withholding on high wages", () => {
    // Employer withholds Additional Medicare on wages > $200K per W-2
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        medicareWages: "400000",
        // Regular: 400K × 1.45% = $5,800
        // Additional: (400K - 200K) × 0.9% = $1,800
        // Total employer withheld: $7,600
        medicareWithheld: "7600",
      }],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    // Expected regular: $400K × 1.45% = $5,800
    // Withholding credit: $7,600 - $5,800 = $1,800
    expect(result.withholdingCredit.toNumber()).toBe(1800);
    // Actual tax: ($400K - $250K) × 0.9% = $1,350
    expect(result.additionalMedicareTax.toNumber()).toBe(1350);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Half-Threshold Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFS half-threshold edge cases", () => {
  it("MFS $125K exactly at threshold: zero Additional Medicare Tax", () => {
    const input = makeW2Input("125000");
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    expect(result.threshold.toNumber()).toBe(125000);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("MFS $126K: tax on $1K over threshold", () => {
    const input = makeW2Input("126000");
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    // $1K × 0.9% = $9
    expect(result.additionalMedicareTax.toNumber()).toBe(9);
  });

  it("MFS high earner: $250K wages hits threshold at $125K", () => {
    const input = makeW2Input("250000");
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    // $250K - $125K = $125K × 0.9% = $1,125
    expect(result.additionalMedicareTax.toNumber()).toBe(1125);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Threshold Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - QSS threshold", () => {
  it("QSS uses $200K threshold (same as single/HoH — IRC §3101(b)(2)(C))", () => {
    const input = makeW2Input("300000");
    const result = calculateForm8959(input, d(0), "qualifying_surviving_spouse", c);
    expect(result.threshold.toNumber()).toBe(200000);
    // $100K × 0.9% = $900
    expect(result.additionalMedicareTax.toNumber()).toBe(900);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large Earnings
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - very large earnings", () => {
  it("$1M wages single: $7,200 Additional Medicare Tax", () => {
    const input = makeW2Input("1000000");
    const result = calculateForm8959(input, d(0), "single", c);
    // ($1M - $200K) × 0.9% = $800K × 0.9% = $7,200
    expect(result.additionalMedicareTax.toNumber()).toBe(7200);
  });

  it("$500K wages + $500K SE: $7,200 tax", () => {
    const input = makeW2Input("500000");
    const result = calculateForm8959(input, d(500000), "single", c);
    // Total: $1M. Excess: $800K × 0.9% = $7,200
    expect(result.totalEarnings.toNumber()).toBe(1000000);
    expect(result.additionalMedicareTax.toNumber()).toBe(7200);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - additional edge cases", () => {
  it("single filer at exactly $200K W-2 wages: zero Additional Medicare Tax", () => {
    // Boundary: total earnings equal threshold exactly — no excess, no tax
    const input = makeW2Input("200000", "200000", "2900");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("single filer $1 over $200K threshold: $0.009 rounds to zero tax", () => {
    // $200,001 × ... excess = $1 × 0.9% = $0.009 — roundDollar floors to $0
    const input = makeW2Input("200001", "200001", "2900.0145");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("SE income only triggers Additional Medicare Tax when earnings exceed single threshold", () => {
    // No W-2 wages at all — SE earnings of $300K solo
    // Excess: $300K - $200K = $100K × 0.9% = $900
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(300000), "single", c);
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(300000);
    expect(result.totalEarnings.toNumber()).toBe(300000);
    expect(result.additionalMedicareTax.toNumber()).toBe(900);
  });

  it("combined W-2 and SE income both under threshold individually but over when combined", () => {
    // W-2: $120K + SE: $100K = $220K. Single threshold $200K.
    // Excess: $20K × 0.9% = $180
    const input = makeW2Input("120000", "120000", "1740");
    const result = calculateForm8959(input, d(100000), "single", c);
    expect(result.totalEarnings.toNumber()).toBe(220000);
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });

  it("MFJ at exactly $250K combined wages: zero Additional Medicare Tax", () => {
    // Two W-2s totaling exactly $250K — at MFJ threshold, no excess
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "150000",
          medicareWages: "150000",
          medicareWithheld: "2175",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Spouse Employer Inc", ein: "77-8899001" },
          wages: "100000",
          medicareWages: "100000",
          medicareWithheld: "1450",
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.medicareWages.toNumber()).toBe(250000);
    expect(result.threshold.toNumber()).toBe(250000);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("withholding credit: employer withheld Additional Medicare on >$200K W-2, partial offset against AMT", () => {
    // Single filer, $300K wages. Employer withheld Additional Medicare on $100K excess.
    // Regular Medicare: $300K × 1.45% = $4,350
    // Employer also withheld AMT portion: ($300K - $200K) × 0.9% = $900
    // Total withheld: $4,350 + $900 = $5,250
    // Withholding credit: $5,250 - $4,350 = $900
    // Actual AMT owed: ($300K - $200K) × 0.9% = $900
    // Net tax after credit: $900 - $900 = $0 (credit offsets fully)
    const input = makeW2Input("300000", "300000", "5250");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.withholdingCredit.toNumber()).toBe(900);
    expect(result.additionalMedicareTax.toNumber()).toBe(900);
  });

  it("$2M W-2 wages single filer: $16,200 Additional Medicare Tax", () => {
    // ($2M - $200K) × 0.9% = $1,800K × 0.9% = $16,200
    const input = makeW2Input("2000000", "2000000", "29000");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.medicareWages.toNumber()).toBe(2000000);
    expect(result.excessOverThreshold.toNumber()).toBe(1800000);
    expect(result.additionalMedicareTax.toNumber()).toBe(16200);
  });
});

// ═══════════════════════════════════════════════════════════
// Threshold Boundary: $1 Over Each Filing Status
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - $1 above threshold per filing status", () => {
  it("Line 18: MFJ $250,001 wages — $1 excess × 0.9% rounds to $0", () => {
    const input = makeW2Input("250001");
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    // $1 × 0.009 = $0.009 → rounds to $0
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Line 18: MFS $125,001 wages — $1 excess × 0.9% rounds to $0", () => {
    const input = makeW2Input("125001");
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Line 18: HoH $200,001 wages — $1 excess × 0.9% rounds to $0", () => {
    const input = makeW2Input("200001");
    const result = calculateForm8959(input, d(0), "head_of_household", c);
    expect(result.excessOverThreshold.toNumber()).toBe(1);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple W-2s Totaling Above Threshold
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - multiple W-2s totaling above threshold", () => {
  it("Line 1: three W-2s each under $200K but combined $350K triggers tax for single", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "120000",
          medicareWages: "120000",
          medicareWithheld: "1740",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Job Two", ein: "22-3344556" },
          wages: "130000",
          medicareWages: "130000",
          medicareWithheld: "1885",
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Job Three", ein: "33-4455667" },
          wages: "100000",
          medicareWages: "100000",
          medicareWithheld: "1450",
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.medicareWages.toNumber()).toBe(350000);
    // ($350K - $200K) × 0.9% = $1,350
    expect(result.additionalMedicareTax.toNumber()).toBe(1350);
  });

  it("Line 19: three W-2s each under $200K — no employer withholds Additional Medicare, zero withholding credit", () => {
    // Each W-2 under $200K so employer only withholds regular 1.45%
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "120000",
          medicareWages: "120000",
          medicareWithheld: "1740", // 120K × 1.45%
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Job Two", ein: "22-3344556" },
          wages: "130000",
          medicareWages: "130000",
          medicareWithheld: "1885", // 130K × 1.45%
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "single", c);
    // Total withheld: $1,740 + $1,885 = $3,625
    // Expected regular: $250K × 1.45% = $3,625
    // Withholding credit: $3,625 - $3,625 = $0
    expect(result.withholdingCredit.toNumber()).toBe(0);
    // But tax is owed: ($250K - $200K) × 0.9% = $450
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Income Only (No W-2 Wages)
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - SE income only", () => {
  it("Line 5/18: SE income $200K exactly at single threshold — zero tax", () => {
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(200000), "single", c);
    expect(result.medicareWages.toNumber()).toBe(0);
    expect(result.selfEmploymentEarnings.toNumber()).toBe(200000);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Line 5/18: SE income $400K MFS — excess over $125K threshold", () => {
    // $400K - $125K = $275K × 0.9% = $2,475
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(400000), "married_filing_separately", c);
    expect(result.excessOverThreshold.toNumber()).toBe(275000);
    expect(result.additionalMedicareTax.toNumber()).toBe(2475);
  });

  it("Line 5/18: SE income $250K MFJ at threshold — zero tax", () => {
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(250000), "married_filing_jointly", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Underwithholding — Each Spouse Below $200K
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - MFJ underwithholding scenario", () => {
  it("Line 19: each spouse earns $190K (both < $200K), combined $380K > $250K threshold — no employer withholds Additional Medicare", () => {
    // Neither employer withholds Additional Medicare (each < $200K)
    // but combined wages exceed MFJ $250K threshold
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "190000",
          medicareWages: "190000",
          medicareWithheld: "2755", // $190K × 1.45%
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Spouse Corp", ein: "99-1234567" },
          wages: "190000",
          medicareWages: "190000",
          medicareWithheld: "2755", // $190K × 1.45%
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    // Combined: $380K. Threshold: $250K. Excess: $130K × 0.9% = $1,170
    expect(result.additionalMedicareTax.toNumber()).toBe(1170);
    // Withholding credit: total withheld $5,510 - expected regular ($380K × 1.45% = $5,510) = $0
    expect(result.withholdingCredit.toNumber()).toBe(0);
    // Full $1,170 owed with no credit offset — underwithholding
  });

  it("Line 19: one spouse $140K, other $160K — combined $300K MFJ, zero withholding credit", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "140000",
          medicareWages: "140000",
          medicareWithheld: "2030", // $140K × 1.45%
        },
        {
          ...simpleW2Fixture.w2s[0],
          employer: { name: "Spouse Inc", ein: "88-9900112" },
          wages: "160000",
          medicareWages: "160000",
          medicareWithheld: "2320", // $160K × 1.45%
        },
      ],
    };
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    // Excess: ($300K - $250K) × 0.9% = $450
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Withholding Exceeding Actual Tax (Credit on Return)
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - withholding credit exceeds tax", () => {
  it("Line 19: MFJ filer with $400K single W-2 — employer withholds on $200K excess but MFJ threshold is $250K", () => {
    // Employer withholds Additional Medicare on wages > $200K regardless of filing status
    // Regular: $400K × 1.45% = $5,800
    // Employer additional withholding: ($400K - $200K) × 0.9% = $1,800
    // Total withheld: $7,600
    // Withholding credit: $7,600 - $5,800 = $1,800
    // Actual tax: ($400K - $250K) × 0.9% = $1,350
    // Credit exceeds tax by $450 — taxpayer gets net credit on return
    const input = makeW2Input("400000", "400000", "7600");
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.withholdingCredit.toNumber()).toBe(1800);
    expect(result.additionalMedicareTax.toNumber()).toBe(1350);
    // Net: credit $1,800 - tax $1,350 = $450 overpayment
    expect(result.withholdingCredit.minus(result.additionalMedicareTax).toNumber()).toBe(450);
  });

  it("Line 19: MFS $200K wages — employer withholds nothing extra (at $200K) but MFS threshold is $125K", () => {
    // Employer: $200K × 1.45% = $2,900, no additional (exactly at $200K)
    // MFS threshold: $125K. Tax: ($200K - $125K) × 0.9% = $675
    // Withholding credit: $2,900 - $2,900 = $0
    // Taxpayer owes full $675 with no withholding credit
    const input = makeW2Input("200000", "200000", "2900");
    const result = calculateForm8959(input, d(0), "married_filing_separately", c);
    expect(result.additionalMedicareTax.toNumber()).toBe(675);
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Detailed Tests
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - QSS detailed threshold", () => {
  it("Line 7: QSS at exactly $200K threshold — zero tax (IRC §3101(b)(2)(C))", () => {
    const input = makeW2Input("200000");
    const result = calculateForm8959(input, d(0), "qualifying_surviving_spouse", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Line 18: QSS $201K wages — $1K excess × 0.9% = $9", () => {
    const input = makeW2Input("201000");
    const result = calculateForm8959(input, d(0), "qualifying_surviving_spouse", c);
    expect(result.excessOverThreshold.toNumber()).toBe(1000);
    expect(result.additionalMedicareTax.toNumber()).toBe(9);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Income Scenarios
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - very high income", () => {
  it("Line 18: $5M wages single filer — $43,200 Additional Medicare Tax", () => {
    // ($5M - $200K) × 0.9% = $4,800K × 0.9% = $43,200
    const input = makeW2Input("5000000", "5000000", "72500");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(4800000);
    expect(result.additionalMedicareTax.toNumber()).toBe(43200);
  });

  it("Line 18: $1M wages + $500K SE income MFJ — $11,250 Additional Medicare Tax", () => {
    // Total: $1.5M. Excess: $1.5M - $250K = $1.25M × 0.9% = $11,250
    const input = makeW2Input("1000000", "1000000", "14500");
    const result = calculateForm8959(input, d(500000), "married_filing_jointly", c);
    expect(result.totalEarnings.toNumber()).toBe(1500000);
    expect(result.additionalMedicareTax.toNumber()).toBe(11250);
  });
});

// ═══════════════════════════════════════════════════════════
// Exact $200K Single with $0 SE — No Tax
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - exact threshold with zero SE", () => {
  it("Line 18: single $200K wages, $0 SE — exactly at threshold, zero Additional Medicare Tax", () => {
    const input = makeW2Input("200000", "200000", "2900");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.totalEarnings.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(0);
    expect(result.additionalMedicareTax.toNumber()).toBe(0);
    expect(result.withholdingCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail — Form 8959 Lines
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - audit trail lines", () => {
  it("audit trail contains Line 1 (Medicare wages) with correct value", () => {
    const input = makeW2Input("300000", "300000", "4350");
    const result = calculateForm8959(input, d(0), "single", c);
    const line1 = result.lines.find((l) => l.form === "Form 8959" && l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(300000);
    expect(line1!.description).toMatch(/Medicare wages/i);
  });

  it("audit trail contains Line 8 (SE earnings) recording self-employment income", () => {
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(220000), "single", c);
    const line5 = result.lines.find((l) => l.form === "Form 8959" && l.line === "8");
    expect(line5).toBeDefined();
    expect(line5!.value.toNumber()).toBe(220000);
  });

  it("audit trail contains Line 5 (threshold) matching the filing-status threshold", () => {
    const input = makeW2Input("0", "0", "0");
    const resultSingle = calculateForm8959(input, d(0), "single", c);
    const resultMFJ = calculateForm8959(input, d(0), "married_filing_jointly", c);
    const resultMFS = calculateForm8959(input, d(0), "married_filing_separately", c);

    const line7Single = resultSingle.lines.find((l) => l.form === "Form 8959" && l.line === "5");
    const line7MFJ = resultMFJ.lines.find((l) => l.form === "Form 8959" && l.line === "5");
    const line7MFS = resultMFS.lines.find((l) => l.form === "Form 8959" && l.line === "5");

    expect(line7Single!.value.toNumber()).toBe(200000);
    expect(line7MFJ!.value.toNumber()).toBe(250000);
    expect(line7MFS!.value.toNumber()).toBe(125000);
  });

  it("audit trail contains Line 18 (Additional Medicare Tax) with computed tax value", () => {
    // $260K single: ($260K - $200K) × 0.9% = $540
    const input = makeW2Input("260000", "260000", "3770");
    const result = calculateForm8959(input, d(0), "single", c);
    const line18 = result.lines.find((l) => l.form === "Form 8959" && l.line === "18");
    expect(line18).toBeDefined();
    expect(line18!.value.toNumber()).toBe(540);
  });

  it("audit trail contains Line 24 (withholding credit) when employer over-withholds", () => {
    // $350K wages single: regular = $350K × 1.45% = $5,075
    // Employer withholds additional on $150K excess: $150K × 0.9% = $1,350
    // Total withheld: $5,075 + $1,350 = $6,425
    // Credit: $6,425 - $5,075 = $1,350
    const input = makeW2Input("350000", "350000", "6425");
    const result = calculateForm8959(input, d(0), "single", c);
    const line19 = result.lines.find((l) => l.form === "Form 8959" && l.line === "24");
    expect(line19).toBeDefined();
    expect(line19!.value.toNumber()).toBe(1350);
  });

  it("audit trail has the supported Form 8959 line set including supported lines 2 and 3", () => {
    // Parts I/II and V are supported; RRTA lines 14–17 and 23 remain absent.
    const input = makeW2Input("250000", "250000", "3625");
    const result = calculateForm8959(input, d(0), "single", c);
    const form8959Lines = result.lines.filter((l) => l.form === "Form 8959");
    const lineNumbers = form8959Lines.map((l) => l.line).sort();
    expect(lineNumbers).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "18", "19", "20", "21", "22", "24"].sort());
  });

  it("audit trail records the part sum, statutory threshold and rate", () => {
    // Verify the formula field documents how the tax is computed
    const input = makeW2Input("210000", "210000", "3045");
    const result = calculateForm8959(input, d(0), "single", c);
    const line18 = result.lines.find((l) => l.form === "Form 8959" && l.line === "18");
    expect(line18!.formula).toContain("Lines 7 + 13");
    expect(result.lines.find(l => l.line === "5")?.value.toString()).toBe("200000");
    expect(line18!.formula).toContain("0.009");  // rate embedded in formula
  });
});

// ═══════════════════════════════════════════════════════════
// 0.9% Rate Verification — Explicit Rate Checks
// ═══════════════════════════════════════════════════════════

describe("Form 8959 - 0.9% rate explicit verification", () => {
  it("0.9% rate: $10K over single threshold produces exactly $90 tax", () => {
    // $210K wages: $10K excess × 0.9% = $90 exactly
    const input = makeW2Input("210000");
    const result = calculateForm8959(input, d(0), "single", c);
    expect(result.excessOverThreshold.toNumber()).toBe(10000);
    expect(result.additionalMedicareTax.toNumber()).toBe(90);
  });

  it("0.9% rate: $100K over MFJ threshold produces exactly $900 tax", () => {
    // $350K wages MFJ: $100K excess × 0.9% = $900
    const input = makeW2Input("350000");
    const result = calculateForm8959(input, d(0), "married_filing_jointly", c);
    expect(result.excessOverThreshold.toNumber()).toBe(100000);
    expect(result.additionalMedicareTax.toNumber()).toBe(900);
  });

  it("0.9% rate: SE-only income $50K over MFS threshold produces exactly $450 tax", () => {
    // SE $175K MFS: ($175K - $125K) = $50K × 0.9% = $450
    const input = makeW2Input("0", "0", "0");
    const result = calculateForm8959(input, d(175000), "married_filing_separately", c);
    expect(result.excessOverThreshold.toNumber()).toBe(50000);
    expect(result.additionalMedicareTax.toNumber()).toBe(450);
  });

  it("0.9% rate: HoH $220K wages — $20K over $200K threshold produces exactly $180 tax", () => {
    // $220K HoH: ($220K - $200K) = $20K × 0.9% = $180
    const input = makeW2Input("220000");
    const result = calculateForm8959(input, d(0), "head_of_household", c);
    expect(result.threshold.toNumber()).toBe(200000);
    expect(result.excessOverThreshold.toNumber()).toBe(20000);
    expect(result.additionalMedicareTax.toNumber()).toBe(180);
  });
});
