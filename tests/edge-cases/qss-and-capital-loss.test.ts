/**
 * Edge case tests for:
 * 1. Qualifying Surviving Spouse (QSS) filing status — uses MFJ brackets/deductions
 * 2. Capital loss carryforward scenarios — $3K annual limit, short vs long allocation
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture, complexMFJFixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Qualifying Surviving Spouse (QSS)
// ═══════════════════════════════════════════════════════════

const qssFixture: TaxYearInput = {
  ...simpleW2Fixture,
  taxpayer: {
    ...simpleW2Fixture.taxpayer,
    filingStatus: "qualifying_surviving_spouse",
    dependents: [
      {
        firstName: "Alex",
        lastName: "Doe",
        ssn: "222-33-4444",
        relationship: "Son",
        dateOfBirth: "2019-04-10",
        monthsLivedWithYou: 12,
        qualifiesForCTC: true,
      },
    ],
  },
};

describe("Qualifying Surviving Spouse (QSS) filing status", () => {
  const federal = calculateFederalTax(qssFixture);

  it("filing status is qualifying_surviving_spouse", () => {
    expect(federal.filingStatus).toBe("qualifying_surviving_spouse");
  });

  it("uses MFJ standard deduction ($31,500)", () => {
    expect(federal.standardDeduction.toNumber()).toBe(31500);
  });

  it("CTC = $2,200 for qualifying child", () => {
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
  });

  it("uses MFJ brackets (lower rates than single)", () => {
    // Single $85K - $16,550 std ded = $68,450 taxable → ~$10,600 tax
    expect(federal.taxableIncome.toNumber()).toBe(53500);
    expect(federal.totalTaxBeforeCredits.lessThan(d(8000))).toBe(true);
  });

  it("total tax positive", () => {
    expect(federal.totalTax.greaterThan(0)).toBe(true);
  });

  it("refund or owed computed correctly", () => {
    const both = federal.refund.greaterThan(0) && federal.amountOwed.greaterThan(0);
    expect(both).toBe(false);
    const fromPayments = federal.totalPayments.minus(federal.refund).plus(federal.amountOwed);
    expect(federal.totalTax.toNumber()).toBe(fromPayments.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss Carryforward: $3K Annual Limit
// ═══════════════════════════════════════════════════════════

describe("Capital loss - $3K annual deduction limit", () => {
  it("net loss capped at -$3,000 on 1040 Line 7", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Stock loss",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "25000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Net loss: $5K - $25K = -$20K → capped at -$3K on 1040
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // Carryforward: -($20K - $3K) = -$17K (stored as negative)
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-17000);
  });

  it("small loss under $3K — no carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Small loss",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "8000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(-2000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("exactly $3K loss — no carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Exact $3K loss",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "7000",
          costBasis: "10000",
          holdingPeriod: "short",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss: Short-term vs Long-term Allocation
// ═══════════════════════════════════════════════════════════

describe("Capital loss - short/long term carryforward allocation", () => {
  it("short-term loss carried forward separately from long-term", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Short-term loss",
            dateAcquired: "2025-03-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "15000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss",
            dateAcquired: "2023-01-01",
            dateSold: "2025-06-01",
            proceeds: "3000",
            costBasis: "13000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Short-term: -$10K, Long-term: -$10K, Net: -$20K → capped at -$3K
    // Carryforward: -$17K total (stored as negative)
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-17000);
    expect(federal.carryforwards.shortTermCapitalLoss.lessThan(0)).toBe(true);
    expect(federal.carryforwards.longTermCapitalLoss.lessThan(0)).toBe(true);
  });

  it("gains offset losses before $3K limit applies", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Long-term gain",
            dateAcquired: "2023-01-01",
            dateSold: "2025-06-01",
            proceeds: "20000",
            costBasis: "10000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Short-term loss",
            dateAcquired: "2025-01-01",
            dateSold: "2025-06-01",
            proceeds: "2000",
            costBasis: "15000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // LT gain: +$10K, ST loss: -$13K, Net: -$3K → capped at -$3K
    // IRS worksheet: effective ST loss = $13K - $10K(LT gain) = $3K, fully deducted → $0 carry
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("net gain: no loss deduction, no carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Profit trade",
          dateAcquired: "2023-01-01",
          dateSold: "2025-06-01",
          proceeds: "15000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(5000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Capital Loss Limit ($1,500)
// ═══════════════════════════════════════════════════════════

describe("Capital loss - MFS $1,500 limit", () => {
  it("MFS capital loss capped at $1,500", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Big loss",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "20000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // MFS: loss limit is $1,500 (not $3,000)
    expect(federal.capitalGainLoss.toNumber()).toBe(-1500);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-13500);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS: NIIT uses MFJ $250K threshold
// ═══════════════════════════════════════════════════════════

describe("QSS - NIIT uses MFJ $250K threshold", () => {
  it("QSS NIIT threshold is $250K (same as MFJ, not single $200K)", () => {
    // Build a QSS filer whose MAGI is between $200K (single threshold) and $250K (MFJ threshold)
    // At $240K wages + $20K LT cap gain = $260K MAGI — exceeds $250K by $10K
    // NII = $20K cap gain. NIIT base = min($20K, $10K) = $10K → $380 NIIT
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "240000",
        federalWithheld: "50000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "240000",
        medicareWithheld: "3480",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2022-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // MAGI ≈ $260K (wages $240K + LT cap gain $20K, no adjustments)
    // Threshold for QSS = $250K → MAGI excess = $10K
    // NII = $20K cap gain → taxable NIIT base = min($20K, $10K) = $10K
    expect(federal.form8960.threshold.toNumber()).toBe(250000);
    expect(federal.niitTax.greaterThan(0)).toBe(true);
    // If threshold were $200K (single), excess would be $60K and NIIT would be higher
    // At $250K threshold: base = $10K → NIIT = $380
    expect(federal.niitTax.toNumber()).toBe(380);
  });

  it("QSS at exactly $250K MAGI has zero NIIT (threshold not exceeded)", () => {
    // $230K wages + $20K LT cap gain = $250K MAGI = exactly threshold → no NIIT
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "230000",
        federalWithheld: "45000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "230000",
        medicareWithheld: "3335",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2022-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // MAGI = $250K = threshold → MAGI excess = $0 → NIIT = $0
    expect(federal.form8960.threshold.toNumber()).toBe(250000);
    expect(federal.niitTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS: Additional Medicare Tax uses $200K threshold (IRC §3101(b)(2)(C))
// ═══════════════════════════════════════════════════════════

describe("QSS - Additional Medicare Tax uses $200K threshold (not MFJ $250K)", () => {
  it("QSS Additional Medicare threshold is $200K (same as single — IRC §3101(b)(2)(C))", () => {
    // $260K Medicare wages → exceeds $200K by $60K → tax = $60K × 0.9% = $540
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "260000",
        federalWithheld: "55000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "260000",
        medicareWithheld: "3770",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.form8959.threshold.toNumber()).toBe(200000);
    // ($260K - $200K) × 0.9% = $540
    expect(federal.additionalMedicareTax.toNumber()).toBe(540);
  });

  it("QSS at $200K wages has zero Additional Medicare Tax (exactly at $200K threshold)", () => {
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        employer: { name: "Corp", ein: "12-3456789" },
        wages: "200000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
        stateTaxWithheld: "0",
        stateWages: "0",
        localTaxWithheld: "0",
        state: "WA",
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.form8959.threshold.toNumber()).toBe(200000);
    expect(federal.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS: Capital gains taxed at MFJ preferential rates
// ═══════════════════════════════════════════════════════════

describe("QSS - capital gains taxed at MFJ preferential rates", () => {
  it("QSS 0% cap gains threshold is $96,700 (same as MFJ)", () => {
    // QSS with $50K wages + $20K LT gain = $70K total income
    // Taxable income = $70K - $30K std deduction = $40K
    // $40K < $96,700 QSS 0% threshold → LT gain taxed at 0%
    const fixture: TaxYearInput = {
      ...qssFixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2022-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // LT gain = $20K. Taxable income = $85K + $20K - $30K = $75K < $96,700
    // All $20K of LT gain falls within 0% bracket
    expect(federal.capitalGainsTax.toNumber()).toBe(0);
    // Ordinary income tax applies only to non-preferential portion
    expect(federal.ordinaryTax.greaterThan(0)).toBe(true);
  });

  it("QSS pays lower cap gains rate than single at same income", () => {
    // Same income as single filer but QSS should have equal or lower cap gains tax
    // due to higher 0% threshold ($96,700 vs $48,350 for single)
    const singleFixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2022-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const qssWithGain: TaxYearInput = {
      ...qssFixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2022-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federalSingle = calculateFederalTax(singleFixture);
    const federalQSS = calculateFederalTax(qssWithGain);
    // QSS capital gains tax should be <= single's capital gains tax at the same income
    expect(federalQSS.capitalGainsTax.lessThanOrEqualTo(federalSingle.capitalGainsTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss: Exactly $3,001 — $3K deduction + $1 carryforward
// ═══════════════════════════════════════════════════════════

describe("Capital loss - exactly $3,001 loss", () => {
  it("$3,001 loss yields -$3,000 deduction and -$1 carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Slightly-over-limit loss",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "6999",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Net loss = $6,999 - $10,000 = -$3,001
    // Deduction capped at -$3,000; carryforward = -$1
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss: Prior year carryforward consumed before current losses
// ═══════════════════════════════════════════════════════════

describe("Capital loss - prior year carryforward interaction", () => {
  it("prior year LT carryforward reduces net LT loss before current year $3K limit", () => {
    // Prior year LT loss carryforward: -$2,000 (negative = loss)
    // Current year LT loss: -$4,000
    // Net LT = -$2,000 + (-$4,000) = -$6,000 → capped at -$3,000
    // Carryforward remaining = -$3,000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Current year LT loss",
          dateAcquired: "2023-01-01",
          dateSold: "2025-06-01",
          proceeds: "6000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        longTermCapitalLoss: "-2000",
        shortTermCapitalLoss: "0",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Net LT loss = -$4,000 (current) + (-$2,000 prior) = -$6,000
    // Deduction = -$3,000; carryforward = -$3,000
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-3000);
  });

  it("prior year carryforward with current year gain — carryforward partially consumed", () => {
    // Prior year LT loss carryforward: -$5,000
    // Current year LT gain: +$2,000
    // Net LT = -$5,000 + $2,000 = -$3,000 → exactly the limit, no further carryforward
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Current year LT gain",
          dateAcquired: "2023-01-01",
          dateSold: "2025-06-01",
          proceeds: "12000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        longTermCapitalLoss: "-5000",
        shortTermCapitalLoss: "0",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Net LT = +$2,000 - $5,000 = -$3,000 → deduction = -$3,000
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss: Mixed ST gain + LT loss netting to zero
// ═══════════════════════════════════════════════════════════

describe("Capital loss - mixed ST gain and LT loss netting to zero", () => {
  it("equal ST gain and LT loss net to zero — no deduction, no carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Short-term gain",
            dateAcquired: "2025-01-01",
            dateSold: "2025-08-01",
            proceeds: "15000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss",
            dateAcquired: "2023-01-01",
            dateSold: "2025-08-01",
            proceeds: "5000",
            costBasis: "10000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // ST gain: +$5,000; LT loss: -$5,000; Net = $0
    // No deduction needed, no carryforward
    expect(federal.capitalGainLoss.toNumber()).toBe(0);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });

  it("ST gain larger than LT loss — net gain, no carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Short-term gain",
            dateAcquired: "2025-01-01",
            dateSold: "2025-08-01",
            proceeds: "18000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss",
            dateAcquired: "2023-01-01",
            dateSold: "2025-08-01",
            proceeds: "5000",
            costBasis: "10000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // ST gain: +$8,000; LT loss: -$5,000; Net = +$3,000
    expect(federal.capitalGainLoss.toNumber()).toBe(3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS standard deduction matches MFJ ($30,000)
// ═══════════════════════════════════════════════════════════

describe("QSS standard deduction matches MFJ", () => {
  it("QSS standard deduction is $30,000 — same as MFJ, not single $15,000", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [{
          firstName: "Sam",
          lastName: "Doe",
          ssn: "333-44-5555",
          relationship: "Daughter",
          dateOfBirth: "2020-06-15",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
        }],
      },
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.standardDeduction.toNumber()).toBe(31500);
    expect(federal.taxableIncome.toNumber()).toBe(53500);
  });

  it("QSS standard deduction is double that of single ($15,000)", () => {
    const singleFederal = calculateFederalTax(simpleW2Fixture);
    const qssFederal = calculateFederalTax(qssFixture);
    expect(qssFederal.standardDeduction.toNumber()).toBe(
      singleFederal.standardDeduction.toNumber() * 2
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Capital Loss: $3K deduction reduces AGI and taxable income correctly
// ═══════════════════════════════════════════════════════════

describe("Capital loss - $3K deduction flow through AGI and taxable income", () => {
  it("$3K capital loss deduction reduces total income and AGI by exactly $3,000", () => {
    // Base: $85K wages, no adjustments
    // With $5K loss → capped deduction = -$3K
    // Total income = $85K + (-$3K) = $82K
    // AGI = $82K (no adjustments)
    // Taxable income = $82K - $15K std deduction = $67K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Capital loss exceeding limit",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "5000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Capital gain/loss line = -$3,000 (capped)
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // AGI = wages $85K - $3K cap loss = $82K
    expect(federal.agi.toNumber()).toBe(82000);
    expect(federal.taxableIncome.toNumber()).toBe(66250);
    // Carryforward = -$2,000 remaining
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-2000);
  });

  it("capital loss reduces tax liability compared to no-loss baseline", () => {
    const baselineFederal = calculateFederalTax(simpleW2Fixture);
    const withLossFederal = calculateFederalTax({
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT loss",
          dateAcquired: "2024-01-01",
          dateSold: "2025-06-01",
          proceeds: "2000",
          costBasis: "5000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    });
    // Loss of $3K should reduce total income and therefore total tax
    expect(withLossFederal.totalTax.lessThan(baselineFederal.totalTax)).toBe(true);
    // AGI should be lower by $3K
    expect(baselineFederal.agi.minus(withLossFederal.agi).toNumber()).toBe(3000);
  });
});

describe("QSS - additional edge cases", () => {
  it("QSS standard deduction matches MFJ", () => {
    const result = calculateFederalTax(qssFixture);
    expect(result.standardDeduction.toNumber()).toBe(31500);
  });

  it("QSS capital loss limit is $3K (not MFS $1.5K)", () => {
    const fixture: TaxYearInput = {
      ...qssFixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Loss", dateAcquired: "2020-01-01", dateSold: "2025-06-01",
          proceeds: "1000", costBasis: "20000", holdingPeriod: "long",
          basisReportedToIRS: true, adjustments: "0", washSale: false, washSaleDisallowed: "0",
        }],
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.scheduleD.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("QSS with capital loss carryforward from prior year", () => {
    const fixture: TaxYearInput = {
      ...qssFixture,
      priorYear: {
        shortTermCapitalLoss: "-2000",
        longTermCapitalLoss: "-3000",
      },
    };
    const result = calculateFederalTax(fixture);
    // Prior year losses should give $3K deduction (no current gains to offset)
    expect(result.scheduleD.capitalLossDeduction.toNumber()).toBe(-3000);
  });

  it("QSS with zero income has zero tax", () => {
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "0",
        federalWithheld: "0",
        socialSecurityWages: "0",
        socialSecurityWithheld: "0",
        medicareWages: "0",
        medicareWithheld: "0",
      }],
    };
    const result = calculateFederalTax(fixture);
    expect(result.totalTax.toNumber()).toBe(0);
    expect(result.taxableIncome.toNumber()).toBe(0);
  });

  it("QSS brackets match MFJ at $200K income", () => {
    const qssFix: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "200000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
    };
    const mfjFix: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: complexMFJFixture.taxpayer.spouse },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "40000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
    };
    const qssResult = calculateFederalTax(qssFix);
    const mfjResult = calculateFederalTax(mfjFix);
    expect(qssResult.totalTaxBeforeCredits.toNumber()).toBe(mfjResult.totalTaxBeforeCredits.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with multiple dependents — CTC for each qualifying child
// ═══════════════════════════════════════════════════════════

describe("QSS - multiple dependents", () => {
  it("QSS with 3 qualifying children gets $6,600 CTC", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [
          {
            firstName: "Alex", lastName: "Doe", ssn: "222-33-4444",
            relationship: "Son", dateOfBirth: "2019-04-10",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
          {
            firstName: "Beth", lastName: "Doe", ssn: "222-33-5555",
            relationship: "Daughter", dateOfBirth: "2020-08-22",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
          {
            firstName: "Chris", lastName: "Doe", ssn: "222-33-6666",
            relationship: "Son", dateOfBirth: "2021-11-05",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
        ],
      },
    };
    const federal = calculateFederalTax(fixture);
    const totalChildTaxBenefit = federal.childTaxCredit.plus(federal.form8812?.actc ?? d(0));
    expect(totalChildTaxBenefit.toNumber()).toBe(6600);
    expect(federal.standardDeduction.toNumber()).toBe(31500);
    // Filing status preserved
    expect(federal.filingStatus).toBe("qualifying_surviving_spouse");
  });

  it("QSS with 2 CTC children and 1 ODC dependent", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [
          {
            firstName: "Alex", lastName: "Doe", ssn: "222-33-4444",
            relationship: "Son", dateOfBirth: "2019-04-10",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
          {
            firstName: "Beth", lastName: "Doe", ssn: "222-33-5555",
            relationship: "Daughter", dateOfBirth: "2020-08-22",
            monthsLivedWithYou: 12, qualifiesForCTC: true,
          },
          {
            firstName: "Grandma", lastName: "Doe", ssn: "222-33-7777",
            relationship: "Mother", dateOfBirth: "1955-03-01",
            monthsLivedWithYou: 12, qualifiesForCTC: false, qualifiesForODC: true,
          },
        ],
      },
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.childTaxCredit.toNumber()).toBe(4900);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS AMT exemption matches MFJ ($137,000 for 2025)
// ═══════════════════════════════════════════════════════════

describe("QSS - AMT exemption matches MFJ", () => {
  it("QSS AMT exemption is $137,000 (same as MFJ, not single $88,100)", () => {
    // Both QSS and MFJ at same income should produce identical AMT
    const qssFix: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "300000",
        federalWithheld: "70000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "300000",
        medicareWithheld: "4350",
      }],
    };
    const mfjFix: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_jointly", spouse: complexMFJFixture.taxpayer.spouse },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "300000",
        federalWithheld: "70000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "300000",
        medicareWithheld: "4350",
      }],
    };
    const qssResult = calculateFederalTax(qssFix);
    const mfjResult = calculateFederalTax(mfjFix);
    // QSS AMT exemption = MFJ AMT exemption = $137,000
    expect(qssResult.form6251?.exemption.toNumber()).toBe(mfjResult.form6251?.exemption.toNumber());
    // AMT amounts should be identical
    expect(qssResult.amt.toNumber()).toBe(mfjResult.amt.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// QSS estimated tax penalty: 110% threshold at $150K (same as MFJ)
// ═══════════════════════════════════════════════════════════

describe("QSS - estimated tax penalty 110% threshold at $150K", () => {
  it("QSS with prior year AGI > $150K requires 110% of prior year tax for safe harbor", () => {
    // Prior year AGI $160K, prior year tax $30K → safe harbor = 110% × $30K = $33K
    // We need payments below both 90% of current tax AND below 110% of prior tax
    // Use very low withholding to ensure net owed > $1K and all safe harbors fail
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "200000",
        federalWithheld: "10000",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
      priorYear: {
        priorYearTax: "30000",
        priorYearAGI: "160000",
      },
    };
    const federal = calculateFederalTax(fixture);
    // QSS uses $150K threshold (same as MFJ), so 110% safe harbor applies
    // Since prior AGI $160K > $150K, need 110% × $30K = $33K
    // Total payments = $10K withholding << $33K and << 90% of current tax → penalty
    expect(federal.form2210).toBeDefined();
    expect(federal.form2210!.safeHarborMet).toBe(false);
    expect(federal.estimatedTaxPenalty.greaterThan(0)).toBe(true);
  });

  it("QSS with prior year AGI <= $150K requires only 100% of prior year tax for safe harbor", () => {
    // Prior year AGI $140K, prior year tax $25K → safe harbor = 100% × $25K = $25K
    // Payments = $25.5K (above $25K) → safe harbor met
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "200000",
        federalWithheld: "25500",
        socialSecurityWages: "176100",
        socialSecurityWithheld: "10918.20",
        medicareWages: "200000",
        medicareWithheld: "2900",
      }],
      priorYear: {
        priorYearTax: "25000",
        priorYearAGI: "140000",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Prior AGI $140K <= $150K → 100% threshold → $25K needed
    // Withholding = $25.5K >= $25K → safe harbor met
    expect(federal.form2210).toBeDefined();
    expect(federal.form2210!.safeHarborMet).toBe(true);
    expect(federal.estimatedTaxPenalty.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital loss with mixed ST/LT carryforward allocation
// through the full federal pipeline
// ═══════════════════════════════════════════════════════════

describe("Capital loss - mixed ST/LT carryforward allocation through federal pipeline", () => {
  it("ST loss and LT loss carryforwards allocated proportionally after $3K deduction", () => {
    // ST loss: -$8K, LT loss: -$12K, Net: -$20K → capped at -$3K
    // ST used first: -$3K from ST → ST remaining = -$5K, LT remaining = -$12K
    // Total carryforward = -$17K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [
          {
            description: "Short-term loss",
            dateAcquired: "2025-03-01", dateSold: "2025-06-01",
            proceeds: "2000", costBasis: "10000", holdingPeriod: "short",
            adjustments: "0", basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss",
            dateAcquired: "2023-01-01", dateSold: "2025-06-01",
            proceeds: "3000", costBasis: "15000", holdingPeriod: "long",
            adjustments: "0", basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // ST: -$8K, LT: -$12K → Net: -$20K → Deduction: -$3K → Carryforward: -$17K
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-17000);
    // Both ST and LT carryforwards should be negative
    expect(federal.carryforwards.shortTermCapitalLoss.lessThan(0)).toBe(true);
    expect(federal.carryforwards.longTermCapitalLoss.lessThan(0)).toBe(true);
    // Capital loss reduces AGI: $85K - $3K = $82K
    expect(federal.agi.toNumber()).toBe(82000);
    expect(federal.taxableIncome.toNumber()).toBe(66250);
  });

  it("prior year ST carryforward combined with current LT loss flows correctly", () => {
    // Prior ST carryforward: -$4K
    // Current LT loss: -$5K
    // Net: -$9K → capped at -$3K → carryforward = -$6K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Long-term loss",
          dateAcquired: "2023-01-01", dateSold: "2025-06-01",
          proceeds: "5000", costBasis: "10000", holdingPeriod: "long",
          adjustments: "0", basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        shortTermCapitalLoss: "-4000",
        longTermCapitalLoss: "0",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Total losses: ST -$4K (prior) + LT -$5K (current) = -$9K → capped at -$3K
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // Carryforward = -$6K total
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-6000);
    // AGI = $85K - $3K = $82K
    expect(federal.agi.toNumber()).toBe(82000);
  });

  it("LT gain partially offsets prior year ST carryforward — reduced carryforward", () => {
    // Prior ST carryforward: -$8K
    // Current LT gain: +$3K
    // Schedule D netting: ST pool = -$8K, LT pool = +$3K
    // Overall net = -$5K → capped at -$3K deduction
    // Per IRS rules, $3K deduction applied from ST first, then LT gain consumed
    // ST carryforward = -$8K + $3K used = -$5K, LT carryforward = $0
    // Total carryforward = -$5K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "Long-term gain",
          dateAcquired: "2023-01-01", dateSold: "2025-06-01",
          proceeds: "13000", costBasis: "10000", holdingPeriod: "long",
          adjustments: "0", basisReportedToIRS: true, washSale: false, washSaleDisallowed: "0",
        }],
      }],
      priorYear: {
        shortTermCapitalLoss: "-8000",
        longTermCapitalLoss: "0",
      },
    };
    const federal = calculateFederalTax(fixture);
    // Overall net = -$5K → capped at -$3K deduction on 1040
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // IRS worksheet: effective ST loss = $8K - $3K(LT gain) = $5K
    // Deduction $3K from ST → ST carry = $5K - $3K = $2K
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-2000);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with self-employment income
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// QSS with itemized deductions exceeding $30K standard deduction
// ═══════════════════════════════════════════════════════════

describe("QSS - itemized deductions exceeding $30K standard deduction", () => {
  it("QSS uses itemized deductions when mortgage interest + SALT + charity exceed $30K", () => {
    // Mortgage interest: $22,000 (under $750K limit)
    // SALT: $10,000 (capped)
    // Charitable: $5,000 cash
    // Total itemized: $37,000 > $30K standard → itemized wins
    const fixture: TaxYearInput = {
      ...qssFixture,
      form1098: [{
        lender: "Chase Bank",
        mortgageInterestReceived: "22000",
        outstandingMortgagePrincipal: "500000",
        propertyTax: "12000", // capped at $10K SALT with state taxes
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
      w2s: [{
        ...qssFixture.w2s[0],
        stateTaxWithheld: "4000",
        stateWages: "85000",
      }],
      donations: [{
        organization: "Red Cross",
        type: "cash",
        amount: "5000",
        dateOfDonation: "2025-06-15",
        costBasis: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // SALT = min($4K state + $12K prop tax, $10K cap) = $10K
    // Total itemized = $22K mortgage + $10K SALT + $5K charity = $37K > $30K standard
    expect(federal.deductionUsed).toBe("itemized");
    expect(federal.itemizedDeductions.greaterThan(d(30000))).toBe(true);
    // Taxable income = $85K AGI - itemized deductions
    expect(federal.taxableIncome.lessThan(d(55000))).toBe(true);
    // Filing status preserved
    expect(federal.filingStatus).toBe("qualifying_surviving_spouse");
  });

  it("2025 QSS SALT maximum is $40K; MFS maximum is $20K", () => {
    const qssFix: TaxYearInput = {
      ...qssFixture,
      form1098: [{
        lender: "Wells Fargo",
        mortgageInterestReceived: "0",
        outstandingMortgagePrincipal: "0",
        propertyTax: "45000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const mfsFix: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
      },
      form1098: [{
        lender: "Wells Fargo",
        mortgageInterestReceived: "0",
        outstandingMortgagePrincipal: "0",
        propertyTax: "45000",
        refundOfOverpaidInterest: "0",
        mortgageInsurancePremiums: "0",
        pointsPaid: "0",
      }],
    };
    const qssResult = calculateFederalTax(qssFix);
    const mfsResult = calculateFederalTax(mfsFix);
    expect(qssResult.scheduleA?.saltDeduction.toNumber()).toBe(40000);
    expect(mfsResult.scheduleA?.saltDeduction.toNumber()).toBe(20000);
  });
});

// ═══════════════════════════════════════════════════════════
// Capital loss exactly $3,000 — zero carryforward boundary
// ═══════════════════════════════════════════════════════════

describe("Capital loss - exactly $3,000 boundary (zero carryforward)", () => {
  it("capital loss exactly $3,000 produces -$3,000 deduction and zero carryforward", () => {
    // Net loss = $10K - $13K = -$3,000 exactly → full deduction, no remainder to carry
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Vanguard",
        transactions: [{
          description: "ETF loss at exactly the $3K limit",
          dateAcquired: "2022-06-01",
          dateSold: "2025-09-15",
          proceeds: "10000",
          costBasis: "13000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // Exactly at the limit → no remainder to carry forward
    expect(federal.carryforwards.capitalLoss.isZero()).toBe(true);
    expect(federal.carryforwards.shortTermCapitalLoss.isZero()).toBe(true);
    expect(federal.carryforwards.longTermCapitalLoss.isZero()).toBe(true);
  });

  it("capital loss of $3,001 produces -$3,000 deduction and -$1 carryforward (LT pool)", () => {
    // Net loss = $9,999 - $13,000 = -$3,001 → deduction = -$3,000, carryforward = -$1
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "ETF loss one dollar over the $3K limit",
          dateAcquired: "2022-06-01",
          dateSold: "2025-09-15",
          proceeds: "9999",
          costBasis: "13000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-1);
    // Only LT loss involved → LT carryforward = -$1, ST carryforward = $0
    expect(federal.carryforwards.longTermCapitalLoss.toNumber()).toBe(-1);
    expect(federal.carryforwards.shortTermCapitalLoss.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed ST gain + LT loss — net gain scenarios
// ═══════════════════════════════════════════════════════════

describe("Capital gain/loss - mixed short-term gain and long-term loss netting", () => {
  it("ST gain larger than LT loss nets to positive gain — LT loss offsets ST gain first", () => {
    // ST gain: +$12,000; LT loss: -$7,000 → net = +$5,000
    // Net gain > 0 → no capital loss deduction, no carryforward
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Schwab",
        transactions: [
          {
            description: "Short-term gain on tech stock",
            dateAcquired: "2025-01-15",
            dateSold: "2025-10-01",
            proceeds: "22000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss on energy stock",
            dateAcquired: "2022-03-01",
            dateSold: "2025-10-01",
            proceeds: "3000",
            costBasis: "10000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // ST: +$12K, LT: -$7K → net = +$5K (gain reported on 1040)
    expect(federal.capitalGainLoss.toNumber()).toBe(5000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
    // Total income should increase by net gain
    expect(federal.agi.toNumber()).toBe(90000); // $85K wages + $5K net cap gain
  });

  it("LT loss larger than ST gain nets to loss — $3K cap and carryforward apply", () => {
    // ST gain: +$4,000; LT loss: -$11,000 → net = -$7,000 → capped at -$3K
    // Carryforward = -$4,000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Schwab",
        transactions: [
          {
            description: "Short-term gain",
            dateAcquired: "2025-02-01",
            dateSold: "2025-08-01",
            proceeds: "14000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss",
            dateAcquired: "2021-05-01",
            dateSold: "2025-08-01",
            proceeds: "9000",
            costBasis: "20000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Net: +$4K ST - $11K LT = -$7K → capped at -$3K deduction
    expect(federal.capitalGainLoss.toNumber()).toBe(-3000);
    // IRS worksheet: effective LT loss = $11K - $4K(ST gain) = $7K
    // LT deduction = $3K → LT carryforward = -(7K - 3K) = -$4K
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(-4000);
    expect(federal.carryforwards.longTermCapitalLoss.toNumber()).toBe(-4000);
    expect(federal.carryforwards.shortTermCapitalLoss.toNumber()).toBe(0);
    // Net is negative overall so AGI = $85K - $3K = $82K
    expect(federal.agi.toNumber()).toBe(82000);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS capital gains at 0%/15%/20% rate boundaries
// ═══════════════════════════════════════════════════════════

describe("QSS - capital gains tax rate boundaries (0%, 15%, 20%)", () => {
  it("QSS taxable income just below $96,700 — all LT gains taxed at 0%", () => {
    // QSS 0% rate threshold = $96,700 for 2025
    // Wages: $50,000; LT gain: $10,000; Standard deduction: $30,000
    // Taxable income = $60,000 < $96,700 → all $10K LT gain at 0%
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "50000",
        federalWithheld: "6000",
        socialSecurityWages: "50000",
        socialSecurityWithheld: "3100",
        medicareWages: "50000",
        medicareWithheld: "725",
      }],
      form1099B: [{
        broker: "Vanguard",
        transactions: [{
          description: "Long-term gain within 0% bracket",
          dateAcquired: "2020-01-01",
          dateSold: "2025-06-01",
          proceeds: "20000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.taxableIncome.toNumber()).toBe(28500);
    // All LT gain falls in 0% bracket
    expect(federal.capitalGainsTax.toNumber()).toBe(0);
  });

  it("QSS taxable income straddling $96,700 — portion of LT gain at 15%", () => {
    // QSS 0% threshold = $96,700; income straddles the boundary
    // Wages: $100,000; LT gain: $30,000; Standard deduction: $30,000
    // Taxable income = $100K; ordinary income = $70K < $96,700
    // Room in 0% bracket = $96,700 - $70K = $26,700 of LT gain at 0%
    // Remaining LT gain = $30K - $26,700 = $3,300 at 15%
    // Cap gains tax = $3,300 × 15% = $495
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "100000",
        federalWithheld: "15000",
        socialSecurityWages: "100000",
        socialSecurityWithheld: "6200",
        medicareWages: "100000",
        medicareWithheld: "1450",
      }],
      form1099B: [{
        broker: "Fidelity",
        transactions: [{
          description: "Long-term gain straddling 0%/15% boundary",
          dateAcquired: "2019-01-01",
          dateSold: "2025-06-01",
          proceeds: "40000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.taxableIncome.toNumber()).toBe(98500);
    // With the higher standard deduction, more of the gain stays in the 0% bucket.
    expect(federal.capitalGainsTax.toNumber()).toBe(270);
  });

  it("QSS 0% threshold is $96,700 — higher than single $48,350", () => {
    // Single filer at same income pays 15% on more of the LT gain than QSS
    const singleFix: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2020-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const qssFix: TaxYearInput = {
      ...qssFixture,
      form1099B: [{
        broker: "Broker",
        transactions: [{
          description: "LT gain",
          dateAcquired: "2020-01-01",
          dateSold: "2025-06-01",
          proceeds: "30000",
          costBasis: "10000",
          holdingPeriod: "long",
          adjustments: "0",
          basisReportedToIRS: true,
          washSale: false,
          washSaleDisallowed: "0",
        }],
      }],
    };
    const singleResult = calculateFederalTax(singleFix);
    const qssResult = calculateFederalTax(qssFix);
    // QSS has wider 0% bracket → pays less capital gains tax
    expect(qssResult.capitalGainsTax.lessThan(singleResult.capitalGainsTax)).toBe(true);
    expect(qssResult.standardDeduction.toNumber()).toBe(31500);
    expect(singleResult.standardDeduction.toNumber()).toBe(15750);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with foreign tax credit
// ═══════════════════════════════════════════════════════════

describe("QSS - foreign tax credit from 1099-DIV", () => {
  it("QSS with foreign tax paid on dividends generates foreign tax credit", () => {
    // $500 foreign tax paid on international fund dividends → foreign tax credit = $500
    const fixture: TaxYearInput = {
      ...qssFixture,
      form1099Div: [{
        payer: "Vanguard International",
        ordinaryDividends: "8000",
        qualifiedDividends: "6000",
        totalCapitalGainDistributions: "0",
        foreignTaxPaid: "500",
        foreignCountry: "Various",
        section1250Gain: "0",
        section1202Gain: "0",
        collectiblesGain: "0",
        nondividendDistributions: "0",
        federalWithheld: "0",
        exemptInterestDividends: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    // Foreign tax credit should be positive
    expect(federal.foreignTaxCredit.greaterThan(d(0))).toBe(true);
    // Credit cannot exceed foreign tax paid ($500)
    expect(federal.foreignTaxCredit.lessThanOrEqualTo(d(500))).toBe(true);
    // QSS filing status retained
    expect(federal.filingStatus).toBe("qualifying_surviving_spouse");
    // Total credits include foreign tax credit
    expect(federal.totalCredits.greaterThanOrEqualTo(federal.foreignTaxCredit)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Large portfolio with multiple gain/loss transactions
// ═══════════════════════════════════════════════════════════

describe("Capital gain/loss - large portfolio with multiple transactions", () => {
  it("multiple ST and LT transactions net correctly across a large portfolio", () => {
    // ST transactions: +$5K, -$3K, +$8K = +$10K net ST
    // LT transactions: +$15K, -$20K, +$2K = -$3K net LT
    // Combined net = +$10K ST + (-$3K) LT = +$7K net gain
    // Net gain → no capital loss deduction, no carryforward
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [
        {
          broker: "Fidelity",
          transactions: [
            {
              description: "AAPL short-term gain",
              dateAcquired: "2025-01-10",
              dateSold: "2025-07-15",
              proceeds: "15000",
              costBasis: "10000",
              holdingPeriod: "short",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
            {
              description: "NVDA short-term loss",
              dateAcquired: "2025-02-01",
              dateSold: "2025-05-01",
              proceeds: "7000",
              costBasis: "10000",
              holdingPeriod: "short",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
            {
              description: "MSFT short-term gain",
              dateAcquired: "2025-03-01",
              dateSold: "2025-09-01",
              proceeds: "18000",
              costBasis: "10000",
              holdingPeriod: "short",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
          ],
        },
        {
          broker: "Schwab",
          transactions: [
            {
              description: "VOO long-term gain",
              dateAcquired: "2020-06-01",
              dateSold: "2025-06-01",
              proceeds: "25000",
              costBasis: "10000",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
            {
              description: "XOM long-term loss",
              dateAcquired: "2019-01-01",
              dateSold: "2025-06-01",
              proceeds: "0",
              costBasis: "20000",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
            {
              description: "BRK.B long-term gain",
              dateAcquired: "2021-01-01",
              dateSold: "2025-06-01",
              proceeds: "12000",
              costBasis: "10000",
              holdingPeriod: "long",
              adjustments: "0",
              basisReportedToIRS: true,
              washSale: false,
              washSaleDisallowed: "0",
            },
          ],
        },
      ],
    };
    const federal = calculateFederalTax(fixture);
    // ST net: ($15K-$10K) + ($7K-$10K) + ($18K-$10K) = +$5K - $3K + $8K = +$10K
    // LT net: ($25K-$10K) + ($0-$20K) + ($12K-$10K) = +$15K - $20K + $2K = -$3K
    // Combined net = +$7K
    expect(federal.capitalGainLoss.toNumber()).toBe(7000);
    expect(federal.carryforwards.capitalLoss.toNumber()).toBe(0);
    // AGI = $85K wages + $7K cap gain = $92K
    expect(federal.agi.toNumber()).toBe(92000);
    // Schedule D fields available
    expect(federal.scheduleD).toBeDefined();
    expect(federal.scheduleD!.netShortTerm.toNumber()).toBe(10000);
    expect(federal.scheduleD!.netLongTerm.toNumber()).toBe(-3000);
    expect(federal.scheduleD!.netCapitalGainLoss.toNumber()).toBe(7000);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule D audit trail lines
// ═══════════════════════════════════════════════════════════

describe("Schedule D - audit trail line items", () => {
  it("Schedule D result includes audit trail lines for net short-term, net long-term, and capital loss deduction", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099B: [{
        broker: "TD Ameritrade",
        transactions: [
          {
            description: "Short-term gain",
            dateAcquired: "2025-01-01",
            dateSold: "2025-06-01",
            proceeds: "12000",
            costBasis: "10000",
            holdingPeriod: "short",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
          {
            description: "Long-term loss",
            dateAcquired: "2021-01-01",
            dateSold: "2025-06-01",
            proceeds: "5000",
            costBasis: "20000",
            holdingPeriod: "long",
            adjustments: "0",
            basisReportedToIRS: true,
            washSale: false,
            washSaleDisallowed: "0",
          },
        ],
      }],
    };
    const federal = calculateFederalTax(fixture);
    const schedD = federal.scheduleD!;
    // Schedule D audit trail must include key lines
    expect(schedD.lines.length).toBeGreaterThan(0);
    const lineNumbers = schedD.lines.map((l) => l.line);
    // Line 7 = net short-term, Line 15 = net long-term, Line 16 = net gain/loss, Line 21 = deduction
    expect(lineNumbers).toContain("7");
    expect(lineNumbers).toContain("15");
    expect(lineNumbers).toContain("16");
    expect(lineNumbers).toContain("21");
    // Line 7 value = +$2K (ST gain)
    const line7 = schedD.lines.find((l) => l.line === "7")!;
    expect(line7.value.toNumber()).toBe(2000);
    // Line 15 value = -$15K (LT loss)
    const line15 = schedD.lines.find((l) => l.line === "15")!;
    expect(line15.value.toNumber()).toBe(-15000);
    // Line 16 = -$13K net
    const line16 = schedD.lines.find((l) => l.line === "16")!;
    expect(line16.value.toNumber()).toBe(-13000);
    // Line 21 = -$3K capped deduction
    const line21 = schedD.lines.find((l) => l.line === "21")!;
    expect(line21.value.toNumber()).toBe(-3000);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS with self-employment income
// ═══════════════════════════════════════════════════════════

describe("QSS - with self-employment income", () => {
  it("QSS with 1099-NEC incurs self-employment tax and retains MFJ brackets", () => {
    const fixture: TaxYearInput = {
      ...qssFixture,
      w2s: [{
        ...qssFixture.w2s[0],
        wages: "60000",
        federalWithheld: "8000",
        socialSecurityWages: "60000",
        socialSecurityWithheld: "3720",
        medicareWages: "60000",
        medicareWithheld: "870",
      }],
      form1099Nec: [{
        payer: "Freelance Client",
        nonemployeeCompensation: "40000",
        federalWithheld: "0",
      }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.selfEmploymentTax.greaterThan(0)).toBe(true);
    expect(federal.standardDeduction.toNumber()).toBe(31500);
    // SE tax deductible portion reduces AGI
    expect(federal.agi.lessThan(d(100000))).toBe(true);
    expect(federal.agi.greaterThan(d(95000))).toBe(true);
    expect(federal.childTaxCredit.toNumber()).toBe(2200);
    // Total tax includes SE tax
    expect(federal.totalTax.greaterThan(federal.totalTaxBeforeCredits)).toBe(true);
  });
});
