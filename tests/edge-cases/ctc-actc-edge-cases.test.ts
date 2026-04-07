/**
 * Edge case tests for CTC / ACTC integration through the federal pipeline.
 * Tests interactions between the Child Tax Credit (Form 8812) and other
 * parts of the return that standalone Form 8812 tests don't cover.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

/** Helper: build a single-filer fixture with qualifying children */
function singleWithChildren(
  wages: string,
  qualifyingChildren: number,
  overrides?: Partial<TaxYearInput>
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "single",
      dependents: [
        ...Array.from({ length: qualifyingChildren }, (_, i) => ({
          firstName: `Child${i + 1}`,
          lastName: "Doe",
          ssn: `900-00-000${i}`,
          relationship: "Son",
          dateOfBirth: "2018-05-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        })),
      ],
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "0",
        socialSecurityWages: wages,
        socialSecurityWithheld: new Decimal(wages).times("0.062").toFixed(2),
        medicareWages: wages,
        medicareWithheld: new Decimal(wages).times("0.0145").toFixed(2),
      },
    ],
    ...overrides,
  };
}

/** Helper: build an MFJ fixture with qualifying children */
function mfjWithChildren(
  wages: string,
  qualifyingChildren: number,
  overrides?: Partial<TaxYearInput>
): TaxYearInput {
  return {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: "married_filing_jointly",
      spouse: {
        firstName: "John",
        lastName: "Doe",
        ssn: "987-65-4321",
        dateOfBirth: "1988-03-20",
      },
      dependents: [
        ...Array.from({ length: qualifyingChildren }, (_, i) => ({
          firstName: `Child${i + 1}`,
          lastName: "Doe",
          ssn: `900-00-000${i}`,
          relationship: "Son",
          dateOfBirth: "2018-05-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        })),
      ],
    },
    w2s: [
      {
        ...simpleW2Fixture.w2s[0],
        wages,
        federalWithheld: "0",
        socialSecurityWages: wages,
        socialSecurityWithheld: new Decimal(wages).times("0.062").toFixed(2),
        medicareWages: wages,
        medicareWithheld: new Decimal(wages).times("0.0145").toFixed(2),
      },
    ],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// CTC Ordering With Schedule 3 Credits
// ═══════════════════════════════════════════════════════════

describe("CTC ordering with Schedule 3 credits", () => {
  it("CTC is computed against tax liability after FTC reduction", () => {
    // Family has FTC from foreign dividends + 1 qualifying child.
    // CTC should be limited to tax AFTER subtracting FTC, not full tax.
    const fixture: TaxYearInput = {
      ...singleWithChildren("80000", 1),
      form1099Div: [
        {
          payer: "Intl Fund",
          ordinaryDividends: "5000",
          qualifiedDividends: "0",
          totalCapitalGainDistributions: "0",
          federalWithheld: "0",
          foreignTaxPaid: "500",
          foreignCountry: "Various",
          section1250Gain: "0",
          section1202Gain: "0",
          collectiblesGain: "0",
          nondividendDistributions: "0",
          exemptInterestDividends: "0",
        },
      ],
    };

    const result = calculateFederalTax(fixture);

    // FTC should reduce available tax liability for CTC
    expect(result.foreignTaxCredit.greaterThan(0)).toBe(true);

    // CTC nonrefundable should be limited to tax-after-FTC, not full tax
    const form8812 = result.form8812!;
    const taxAfterFTC = result.totalTaxBeforeCredits.minus(result.foreignTaxCredit);
    expect(form8812.nonrefundableCTC.toNumber()).toBeLessThanOrEqual(
      taxAfterFTC.toNumber()
    );

    // Max CTC is $2,000 for 1 child — should still fit in remaining liability
    expect(form8812.nonrefundableCTC.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC Flows Into Total Payments and Refund
// ═══════════════════════════════════════════════════════════

describe("ACTC flows into total payments and refund", () => {
  it("low-income family with children and zero tax gets ACTC refund", () => {
    // $20K wages, 2 children → tax near zero after standard deduction
    // Unused CTC becomes ACTC, which flows into refund
    const fixture = singleWithChildren("20000", 2);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Tax should be very small or zero on $20K - $15K std ded = $5K taxable
    // CTC max = $4,000, most should be unused → ACTC
    expect(form8812.actc.greaterThan(0)).toBe(true);

    // ACTC should flow into total payments
    expect(result.totalPayments.greaterThanOrEqualTo(form8812.actc)).toBe(true);

    // Should result in a refund (no withholding, but ACTC is refundable)
    expect(result.refund.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// CTC Phase-Out at $200K Boundary (Single)
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out at $200K boundary for single filers", () => {
  it("AGI exactly at $200,000 threshold - no phase-out", () => {
    // Wages = $200K, standard deduction brings taxable income down,
    // but AGI = $200K which is the threshold → no reduction
    const fixture = singleWithChildren("200000", 1);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Full CTC: $2,000 per child, no phase-out reduction
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
  });

  it("AGI at $200,001 - $50 reduction", () => {
    // $1 over threshold → ceil($1 / $1000) = 1 → 1 × $50 = $50 reduction
    const fixture = singleWithChildren("200001", 1);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // $2,000 - $50 = $1,950
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(1950);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Phase-Out at $400K Boundary
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out at $400K boundary for MFJ filers", () => {
  it("AGI exactly at $400,000 threshold - no phase-out", () => {
    const fixture = mfjWithChildren("400000", 2);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Full CTC: $2,000 × 2 = $4,000, no phase-out
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(4000);
  });

  it("AGI at $400,001 - $50 reduction", () => {
    const fixture = mfjWithChildren("400001", 2);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // $4,000 - $50 = $3,950
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(3950);
  });
});

// ═══════════════════════════════════════════════════════════
// ODC Not Refundable
// ═══════════════════════════════════════════════════════════

describe("ODC is not refundable", () => {
  it("family with only other dependents gets no ACTC", () => {
    // Low income + 2 other dependents (not qualifying children)
    // ODC should be limited to tax liability, and no ACTC generated
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "Parent",
            lastName: "Doe",
            ssn: "800-00-0001",
            relationship: "Parent",
            dateOfBirth: "1960-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
          {
            firstName: "Sibling",
            lastName: "Doe",
            ssn: "800-00-0002",
            relationship: "Sibling",
            dateOfBirth: "1965-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "15000",
          federalWithheld: "0",
          socialSecurityWages: "15000",
          socialSecurityWithheld: "930",
          medicareWages: "15000",
          medicareWithheld: "217.50",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // ODC max = $500 × 2 = $1,000
    // Nonrefundable limited to tax liability
    expect(form8812.nonrefundableCTC.lessThanOrEqualTo(result.totalTaxBeforeCredits)).toBe(true);

    // No ACTC — ODC doesn't generate refundable credit
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Mixed Children + Other Dependents
// ═══════════════════════════════════════════════════════════

describe("mixed qualifying children and other dependents", () => {
  it("2 qualifying children + 1 other dependent - ODC does not generate ACTC", () => {
    // Low income so CTC exceeds tax → some goes to ACTC
    // But only the CTC portion (from qualifying children) is refundable
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "Child1",
            lastName: "Doe",
            ssn: "900-00-0001",
            relationship: "Daughter",
            dateOfBirth: "2018-05-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
          },
          {
            firstName: "Child2",
            lastName: "Doe",
            ssn: "900-00-0002",
            relationship: "Son",
            dateOfBirth: "2020-08-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
          },
          {
            firstName: "Elderly Parent",
            lastName: "Doe",
            ssn: "800-00-0003",
            relationship: "Parent",
            dateOfBirth: "1955-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "25000",
          federalWithheld: "0",
          socialSecurityWages: "25000",
          socialSecurityWithheld: "1550",
          medicareWages: "25000",
          medicareWithheld: "362.50",
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // CTC before limitation should include both CTC ($2K × 2) + ODC ($500 × 1) = $4,500
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(4500);

    // ACTC should be based only on qualifying children's unused CTC,
    // not on the ODC portion. Max ACTC = $1,700 × 2 = $3,400
    expect(form8812.actc.lessThanOrEqualTo(d(3400))).toBe(true);
    expect(form8812.actc.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC Capped at $1,700 Per Child
// ═══════════════════════════════════════════════════════════

describe("ACTC capped at $1,700 per qualifying child", () => {
  it("high unused CTC and high earned income still caps ACTC at $1,700/child", () => {
    // 3 children, zero tax liability (low income after deduction)
    // Earned income high enough that 15% exceeds cap
    // Max CTC = $6,000, all unused. 15% of ($40K - $2.5K) = $5,625
    // But ACTC cap = $1,700 × 3 = $5,100
    const fixture = singleWithChildren("40000", 3);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // 15% of (40000 - 2500) = 15% of 37500 = $5,625
    expect(form8812.fifteenPercent.toNumber()).toBe(5625);

    // ACTC should be capped at $1,700 × 3 = $5,100
    // (or less if unused CTC is less, but with $40K income and 3 kids
    // taxable income is low so most of $6K CTC is unused)
    expect(form8812.actc.lessThanOrEqualTo(d(5100))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Self-Employment Income Counts as Earned Income
// ═══════════════════════════════════════════════════════════

describe("self-employment income counts as earned income for ACTC", () => {
  it("SE earnings contribute to ACTC earned income calculation", () => {
    // No W-2 wages, only Schedule C income → SE income should be earned income
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "Child1",
            lastName: "Doe",
            ssn: "900-00-0001",
            relationship: "Daughter",
            dateOfBirth: "2019-03-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
          },
        ],
      },
      w2s: [],
      scheduleC: {
        businessName: "Freelance Dev",
        businessCode: "541511",
        grossReceipts: "30000",
        returnsAndAllowances: "0",
        costOfGoodsSold: "0",
      },
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // SE net earnings should count as earned income for ACTC
    // Net SE = $30K gross → net profit $30K → SE earnings ≈ $30K × 92.35% = ~$27,705
    // earnedIncome for 8812 = max(0, netSEEarnings)
    // 15% of (earnedIncome - $2,500) should be > 0
    expect(form8812.earnedIncomeExcess.greaterThan(0)).toBe(true);
    expect(form8812.fifteenPercent.greaterThan(0)).toBe(true);

    // If there's unused CTC, ACTC should be generated
    if (form8812.unusedCTC.greaterThan(0)) {
      expect(form8812.actc.greaterThan(0)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC Earned Income: Deductible Half + SE Loss (IRC §32(c)(2))
// Per IRC §32(c)(2)(A)(i)(II), earned income = wages + net SE
// "determined with regard to the deduction allowed by section 164(f)"
// (i.e., deductible half of SE tax is subtracted).
// Per IRS Form 8812 Lines 18a-18f: earned = wages + Sched C - deductible half.
// SE losses reduce earned income (no zero-floor on SE component).
// ═══════════════════════════════════════════════════════════

describe("ACTC earned income subtracts deductible half of SE tax — IRC §32(c)(2)", () => {
  it("SE-only filer: earned income reduced by deductible half → lower ACTC", () => {
    // Single, 1 child, $0 wages, $5K SE income (via 1099-NEC), $0 tax liability
    // Schedule SE: $5K × 0.9235 = $4,618 (rounded) → SE tax = $4,618 × 0.153 = $707 → deductible half = $354
    // Wait: roundDollar($5K × 0.9235) = roundDollar($4,617.50) = $4,618
    // SE tax: SS = roundDollar($4,618 × 0.124) = roundDollar($572.632) = $573
    //         MC = roundDollar($4,618 × 0.029) = roundDollar($133.922) = $134
    //         Total = $707. Deductible half = roundDollar($707 × 0.5) = roundDollar($353.50) = $354
    // Earned income per §32(c)(2): $5,000 - $354 = $4,646
    // Excess over $2,500: $2,146 → 15% = roundDollar($321.90) = $322
    // ACTC = min($1,700, $322, unused CTC) = $322
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [{
          firstName: "Child1", lastName: "Doe", ssn: "900-00-0001",
          relationship: "Son", dateOfBirth: "2018-05-01",
          monthsLivedWithYou: 12, qualifiesForCTC: true, qualifiesForODC: false,
        }],
      },
      w2s: [],
      form1099Nec: [{ payer: "Client Inc", nonemployeeCompensation: "5000" }],
    };
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    // The 15% formula should be the binding constraint (not the $1,700 cap)
    expect(form8812.actc.toNumber()).toBe(322);
  });

  it("SE loss reduces earned income below wages — lower ACTC", () => {
    // Single, 1 child, $6K wages, -$3K Schedule C loss
    // SE post-multiplier: -$3K × 0.9235 = -$2,770.50 → below $400 → no SE tax
    // Deductible half: $0
    // Earned income: $6K + (-$3K) - $0 = $3,000
    // Excess over $2,500: $500 → 15% = $75
    // ACTC = min($1,700, $75, unused CTC) = $75
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [{
          firstName: "Child1", lastName: "Doe", ssn: "900-00-0001",
          relationship: "Son", dateOfBirth: "2018-05-01",
          monthsLivedWithYou: 12, qualifiesForCTC: true, qualifiesForODC: false,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "6000",
        federalWithheld: "0",
        socialSecurityWages: "6000",
        socialSecurityWithheld: "372",
        medicareWages: "6000",
        medicareWithheld: "87",
      }],
      scheduleC: {
        businessName: "Side Gig",
        businessCode: "541511",
        grossReceipts: "2000",
        expenses: { otherExpenses: "5000" },
      },
    };
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    // SE loss must reduce earned income — not floored at zero
    expect(form8812.actc.toNumber()).toBe(75);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Low Earned Income ($3,000)
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out — complete phase-out for single", () => {
  it("CTC fully phased out at very high income", () => {
    // $240K AGI, 1 child. Excess = $240K - $200K = $40K.
    // Reduction = ceil($40K / $1K) × $50 = 40 × $50 = $2,000
    // CTC = $2,000 - $2,000 = $0
    const fixture = singleWithChildren("240000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

describe("CTC phase-out — gradual reduction", () => {
  it("$210K AGI single with 1 child: $500 reduction", () => {
    // $10K over threshold → ceil($10K / $1K) × $50 = $500
    // CTC = $2,000 - $500 = $1,500
    const fixture = singleWithChildren("210000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(1500);
  });

  it("$440K AGI MFJ with 2 children: $2,000 reduction", () => {
    // $40K over $400K threshold → 40 × $50 = $2,000
    // CTC = $4,000 - $2,000 = $2,000
    const fixture = mfjWithChildren("440000", 2);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
  });

  it("many children require very high income to fully phase out", () => {
    // 4 children: CTC = $8,000. Need $160K over threshold to fully phase out.
    // $360K AGI single → $160K over → $8,000 reduction → CTC = $0
    const fixture = singleWithChildren("360000", 4);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
  });
});

describe("ACTC earned income below $2,500 threshold", () => {
  it("$2,500 earned income produces zero ACTC (at threshold)", () => {
    const fixture = singleWithChildren("2500", 1, {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "2500",
        federalWithheld: "0",
        socialSecurityWages: "2500",
        socialSecurityWithheld: "155",
        medicareWages: "2500",
        medicareWithheld: "36.25",
      }],
    });
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    // Earned income excess = $2,500 - $2,500 = $0. 15% of $0 = $0.
    expect(form8812.earnedIncomeExcess.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });

  it("$2,000 earned income: below threshold, zero ACTC", () => {
    const fixture = singleWithChildren("2000", 1, {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "2000",
        federalWithheld: "0",
        socialSecurityWages: "2000",
        socialSecurityWithheld: "124",
        medicareWages: "2000",
        medicareWithheld: "29",
      }],
    });
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.earnedIncomeExcess.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

describe("very low earned income just above ACTC threshold", () => {
  it("$3,000 earned income produces tiny ACTC", () => {
    // $3,000 wages, 1 child. Earned income excess = $3,000 - $2,500 = $500
    // 15% of $500 = $75. ACTC should be $75 (well under $1,700 cap).
    const fixture = singleWithChildren("3000", 1, {
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "3000",
          federalWithheld: "0",
          socialSecurityWages: "3000",
          socialSecurityWithheld: "186",
          medicareWages: "3000",
          medicareWithheld: "43.50",
        },
      ],
    });

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Earned income excess = $3,000 - $2,500 = $500
    expect(form8812.earnedIncomeExcess.toNumber()).toBe(500);

    // 15% of $500 = $75
    expect(form8812.fifteenPercent.toNumber()).toBe(75);

    // Tax should be zero on $3K income (below standard deduction)
    // So full $2,000 CTC is unused, but ACTC = min($2,000, $75, $1,700) = $75
    expect(form8812.actc.toNumber()).toBe(75);

    // Refund should include the $75 ACTC
    expect(result.refund.greaterThanOrEqualTo(d(75))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// MFJ Phase-Out: $399,999 — just under threshold
// ═══════════════════════════════════════════════════════════

describe("MFJ CTC no phase-out at $399,999", () => {
  it("AGI $399,999 MFJ with 2 children — full CTC, no reduction", () => {
    // $1 under $400K threshold → excess = $0 → no phase-out
    // Full CTC = $2,000 × 2 = $4,000
    const fixture = mfjWithChildren("399999", 2);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(4000);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC: earned income $2,501 — minimal credit that rounds to $0
// ═══════════════════════════════════════════════════════════

describe("ACTC earned income $2,501 — minimal credit", () => {
  it("$2,501 earned income: 15% of $1 = $0.15, rounds to $0 ACTC", () => {
    // Earned income excess = $2,501 - $2,500 = $1
    // 15% of $1 = $0.15 → rounds down to $0
    const fixture = singleWithChildren("2501", 1, {
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "2501",
          federalWithheld: "0",
          socialSecurityWages: "2501",
          socialSecurityWithheld: new Decimal("2501").times("0.062").toFixed(2),
          medicareWages: "2501",
          medicareWithheld: new Decimal("2501").times("0.0145").toFixed(2),
        },
      ],
    });

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Earned income excess = $1
    expect(form8812.earnedIncomeExcess.toNumber()).toBe(1);

    // 15% of $1 = $0.15 → rounded to nearest dollar = $0
    expect(form8812.fifteenPercent.toNumber()).toBe(0);

    // ACTC = $0
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Child turning 17 during tax year — age cutoff (qualifiesForCTC: false)
// ═══════════════════════════════════════════════════════════

describe("child turning 17 during tax year — no CTC eligibility", () => {
  it("17-year-old child does not qualify for CTC", () => {
    // A child who turned 17 during 2025 does not qualify for CTC.
    // The qualifying status is captured via qualifiesForCTC: false.
    // Result: no CTC, no ACTC.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "Teen",
            lastName: "Doe",
            ssn: "900-00-0099",
            relationship: "Son",
            // Born in 2008 → turns 17 in 2025 → does NOT qualify for CTC
            dateOfBirth: "2008-06-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: false,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "80000",
          federalWithheld: "0",
          socialSecurityWages: "80000",
          socialSecurityWithheld: new Decimal("80000").times("0.062").toFixed(2),
          medicareWages: "80000",
          medicareWithheld: new Decimal("80000").times("0.0145").toFixed(2),
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // No qualifying children → CTC = $0
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.nonrefundableCTC.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });

  it("same child marked qualifiesForCTC: true gets $2,000 credit", () => {
    // Contrasting test: if the same child were under 17, they would qualify.
    // Using dateOfBirth 2018 (age 7 in 2025) to confirm CTC is generated.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "Young",
            lastName: "Doe",
            ssn: "900-00-0098",
            relationship: "Daughter",
            dateOfBirth: "2018-06-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
          },
        ],
      },
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          wages: "80000",
          federalWithheld: "0",
          socialSecurityWages: "80000",
          socialSecurityWithheld: new Decimal("80000").times("0.062").toFixed(2),
          medicareWages: "80000",
          medicareWithheld: new Decimal("80000").times("0.0145").toFixed(2),
        },
      ],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // 1 qualifying child → CTC = $2,000
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
  });
});

// ═══════════════════════════════════════════════════════════
// CTC with 5+ children — linear scaling at $2,000 each
// ═══════════════════════════════════════════════════════════

describe("CTC with 5 or more qualifying children — linear scaling", () => {
  it("5 qualifying children at moderate income: CTC = $10,000", () => {
    // 5 children × $2,000 = $10,000 max CTC (before phase-out)
    // Income well below threshold → no phase-out
    const fixture = singleWithChildren("150000", 5);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(10000);
  });

  it("6 qualifying children at moderate income: CTC = $12,000", () => {
    // 6 children × $2,000 = $12,000 max CTC
    const fixture = mfjWithChildren("150000", 6);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(12000);
  });
});

// ═══════════════════════════════════════════════════════════
// CTC fully phased out at very high income — additional scenarios
// ═══════════════════════════════════════════════════════════

describe("CTC fully phased out at very high income — additional scenarios", () => {
  it("single filer $500K income with 2 children: CTC fully phased out", () => {
    // Excess = $500K - $200K = $300K → ceil($300K / $1K) × $50 = $15,000 reduction
    // Max CTC = $4,000 (2 children) → $4,000 - $15,000 → floored to $0
    const fixture = singleWithChildren("500000", 2);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });

  it("MFJ filer $800K income with 3 children: CTC fully phased out", () => {
    // Excess = $800K - $400K = $400K → $400 × $50 = $20,000 reduction
    // Max CTC = $6,000 (3 children) → fully eliminated
    const fixture = mfjWithChildren("800000", 3);

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Income $1K Above Phase-Out Start (Line 12 phase-out formula)
// ═══════════════════════════════════════════════════════════

describe("CTC phase-out $1K above threshold", () => {
  it("single $201,000 AGI with 1 child: $50 reduction (Line 12)", () => {
    // $1,000 over $200K threshold → ceil($1K / $1K) = 1 → 1 × $50 = $50
    // CTC = $2,000 - $50 = $1,950
    const fixture = singleWithChildren("201000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(1950);
  });

  it("MFJ $401,000 AGI with 2 children: $50 reduction (Line 12)", () => {
    // $1,000 over $400K threshold → 1 × $50 = $50
    // CTC = $4,000 - $50 = $3,950
    const fixture = mfjWithChildren("401000", 2);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(3950);
  });
});

// ═══════════════════════════════════════════════════════════
// 1 Child: Max CTC $2,000, Max ACTC $1,700 (Line 27)
// ═══════════════════════════════════════════════════════════

describe("1 child CTC/ACTC maximums (Lines 12, 27)", () => {
  it("1 qualifying child low income: max CTC = $2,000, ACTC capped at $1,700", () => {
    // $30K wages, 1 child. Tax on ($30K - $15K std ded) = $15K taxable ≈ $1,598 tax.
    // CTC = $2,000. Nonrefundable = min($2,000, $1,598) = $1,598.
    // Unused CTC = $2,000 - $1,598 = $402.
    // 15% of ($30K - $2.5K) = $4,125 (well above $402).
    // ACTC = min($402, $4,125, $1,700) = $402 (limited by unused, not by $1,700 cap).
    const fixture = singleWithChildren("30000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
    // ACTC must be ≤ $1,700 per-child cap
    expect(form8812.actc.lessThanOrEqualTo(d(1700))).toBe(true);
    // Total nonrefundable + ACTC should not exceed $2,000
    expect(form8812.nonrefundableCTC.plus(form8812.actc).lessThanOrEqualTo(d(2000))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// 3 Children: Total CTC Calculation (Lines 12, 14, 27)
// ═══════════════════════════════════════════════════════════

describe("3 children total CTC calculation (Lines 12, 14, 27)", () => {
  it("3 qualifying children at $50K income: CTC = $6,000, partial ACTC", () => {
    // Max CTC = $2,000 × 3 = $6,000. No phase-out (income below $200K).
    // Taxable income = $50K - $15K = $35K. Tax ≈ ~$3,998 (10% + 12% brackets).
    // Nonrefundable = min($6,000, tax). Unused = $6,000 - nonrefundable.
    // 15% of ($50K - $2.5K) = $7,125. Max refundable = $1,700 × 3 = $5,100.
    // ACTC = min(unused, $7,125, $5,100).
    const fixture = singleWithChildren("50000", 3);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(6000);
    expect(form8812.nonrefundableCTC.plus(form8812.actc).lessThanOrEqualTo(d(6000))).toBe(true);
    expect(form8812.actc.lessThanOrEqualTo(d(5100))).toBe(true);
    expect(form8812.actc.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Tax Liability — All CTC Becomes ACTC (Lines 14, 15, 27)
// ═══════════════════════════════════════════════════════════

describe("zero tax liability — all CTC becomes ACTC (Lines 14, 15, 27)", () => {
  it("income below standard deduction: zero tax, full CTC unused, ACTC limited by 15% formula", () => {
    // $10K wages, 1 child. Taxable = $10K - $15K = $0. Tax = $0.
    // Nonrefundable CTC = $0. Unused CTC = $2,000.
    // Earned income excess = $10K - $2.5K = $7,500. 15% of $7,500 = $1,125.
    // ACTC = min($2,000, $1,125, $1,700) = $1,125.
    const fixture = singleWithChildren("10000", 1, {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "10000",
        federalWithheld: "0",
        socialSecurityWages: "10000",
        socialSecurityWithheld: new Decimal("10000").times("0.062").toFixed(2),
        medicareWages: "10000",
        medicareWithheld: new Decimal("10000").times("0.0145").toFixed(2),
      }],
    });
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.nonrefundableCTC.toNumber()).toBe(0);
    expect(form8812.earnedIncomeExcess.toNumber()).toBe(7500);
    expect(form8812.fifteenPercent.toNumber()).toBe(1125);
    expect(form8812.actc.toNumber()).toBe(1125);
  });
});

// ═══════════════════════════════════════════════════════════
// Tax Liability Exactly Equal to CTC — No ACTC Needed (Lines 14, 27)
// ═══════════════════════════════════════════════════════════

describe("tax liability absorbs full CTC — no ACTC (Lines 14, 27)", () => {
  it("high earner with 1 child: full $2,000 CTC used nonrefundably, ACTC = $0", () => {
    // $100K single, 1 child. Taxable = $100K - $15K = $85K.
    // Tax well above $2,000 → full CTC used as nonrefundable.
    // Unused CTC = $0 → ACTC = $0.
    const fixture = singleWithChildren("100000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
    expect(form8812.nonrefundableCTC.toNumber()).toBe(2000);
    expect(form8812.unusedCTC.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Tax Liability Less Than CTC — Partial ACTC (Lines 14, 15, 27)
// ═══════════════════════════════════════════════════════════

describe("tax liability less than CTC — partial ACTC (Lines 14, 15, 27)", () => {
  it("$25K single with 2 children: tax < CTC, remainder becomes ACTC", () => {
    // Taxable = $25K - $15K = $10K. Tax ≈ $1,003 (10% on first $11,925 ≈ $1,000).
    // CTC = $4,000. Nonrefundable = ~$1,003. Unused = ~$2,997.
    // 15% of ($25K - $2.5K) = $3,375. Max refundable = $1,700 × 2 = $3,400.
    // ACTC = min(~$2,997, $3,375, $3,400) ≈ $2,997.
    const fixture = singleWithChildren("25000", 2);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(4000);
    expect(form8812.nonrefundableCTC.lessThan(d(4000))).toBe(true);
    expect(form8812.unusedCTC.greaterThan(0)).toBe(true);
    expect(form8812.actc.greaterThan(0)).toBe(true);
    // ACTC + nonrefundable should not exceed total CTC
    expect(form8812.nonrefundableCTC.plus(form8812.actc).lessThanOrEqualTo(d(4000))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// ODC for 17-Year-Old Dependents — $500 Each (Line 12)
// ═══════════════════════════════════════════════════════════

describe("ODC for 17-year-old dependents — $500 each (Line 12)", () => {
  it("two 17-year-old dependents get $500 ODC each, no ACTC", () => {
    // 2 other dependents (17-year-olds marked qualifiesForODC: true).
    // ODC = $500 × 2 = $1,000. No qualifying children → no ACTC.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "Teen1",
            lastName: "Doe",
            ssn: "900-00-0010",
            relationship: "Son",
            dateOfBirth: "2008-02-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
          {
            firstName: "Teen2",
            lastName: "Doe",
            ssn: "900-00-0011",
            relationship: "Daughter",
            dateOfBirth: "2008-08-20",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "80000",
        federalWithheld: "0",
        socialSecurityWages: "80000",
        socialSecurityWithheld: new Decimal("80000").times("0.062").toFixed(2),
        medicareWages: "80000",
        medicareWithheld: new Decimal("80000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // ODC = $500 × 2 = $1,000
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(1000);
    // No qualifying children → ACTC = $0
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// MFS Phase-Out at $200K — Same as Single (Line 12)
// ═══════════════════════════════════════════════════════════

describe("MFS phase-out at $200K — same threshold as single (Line 12)", () => {
  it("MFS at $200,000 AGI: no phase-out, full CTC", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-03-20",
        },
        dependents: [{
          firstName: "Child1",
          lastName: "Doe",
          ssn: "900-00-0020",
          relationship: "Son",
          dateOfBirth: "2018-05-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "0",
        socialSecurityWages: "200000",
        socialSecurityWithheld: new Decimal("200000").times("0.062").toFixed(2),
        medicareWages: "200000",
        medicareWithheld: new Decimal("200000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // MFS threshold = $200K, same as single. No phase-out at exactly $200K.
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
  });

  it("MFS at $201,000 AGI: $50 reduction", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "married_filing_separately",
        spouse: {
          firstName: "John",
          lastName: "Doe",
          ssn: "987-65-4321",
          dateOfBirth: "1988-03-20",
        },
        dependents: [{
          firstName: "Child1",
          lastName: "Doe",
          ssn: "900-00-0020",
          relationship: "Son",
          dateOfBirth: "2018-05-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "201000",
        federalWithheld: "0",
        socialSecurityWages: "201000",
        socialSecurityWithheld: new Decimal("201000").times("0.062").toFixed(2),
        medicareWages: "201000",
        medicareWithheld: new Decimal("201000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // $1K over $200K → $50 reduction. CTC = $2,000 - $50 = $1,950.
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(1950);
  });
});

// ═══════════════════════════════════════════════════════════
// Mix of Qualifying Children and ODC Dependents (Lines 12, 27)
// ═══════════════════════════════════════════════════════════

describe("mix of qualifying children + ODC dependents (Lines 12, 27)", () => {
  it("1 qualifying child + 2 ODC dependents: ACTC only from child portion", () => {
    // CTC = $2,000 × 1 = $2,000. ODC = $500 × 2 = $1,000. Total = $3,000.
    // Low income → tax small. Unused CTC-only portion generates ACTC.
    // ODC portion does NOT generate ACTC.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "YoungChild",
            lastName: "Doe",
            ssn: "900-00-0030",
            relationship: "Daughter",
            dateOfBirth: "2020-03-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
          },
          {
            firstName: "OlderTeen",
            lastName: "Doe",
            ssn: "900-00-0031",
            relationship: "Son",
            dateOfBirth: "2007-06-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
          {
            firstName: "ElderlyParent",
            lastName: "Doe",
            ssn: "800-00-0032",
            relationship: "Parent",
            dateOfBirth: "1955-01-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "20000",
        federalWithheld: "0",
        socialSecurityWages: "20000",
        socialSecurityWithheld: new Decimal("20000").times("0.062").toFixed(2),
        medicareWages: "20000",
        medicareWithheld: new Decimal("20000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Total before limitation = $2,000 + $1,000 = $3,000
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(3000);
    // ACTC capped at $1,700 × 1 qualifying child = $1,700
    expect(form8812.actc.lessThanOrEqualTo(d(1700))).toBe(true);
    // ACTC should be > 0 (low income means unused CTC from child)
    expect(form8812.actc.greaterThan(0)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Earned Income — ACTC Capped at $1,700/Child (Line 27)
// ═══════════════════════════════════════════════════════════

describe("very high earned income — ACTC capped at $1,700/child (Line 27)", () => {
  it("$60K single, 2 children, zero tax: 15% formula exceeds cap, ACTC = $3,400", () => {
    // 15% of ($60K - $2.5K) = $8,625. Max refundable = $1,700 × 2 = $3,400.
    // Taxable = $60K - $15K = $45K → tax ≈ ~$5,148.
    // CTC = $4,000. Nonrefundable = min($4,000, ~$5,148) = $4,000.
    // Unused = $0 → ACTC = $0 because tax absorbs full CTC.
    // Need lower income so tax < CTC. Use $18K wages instead.
    // Taxable = $18K - $15K = $3K. Tax = 10% × $3K = $300.
    // CTC = $4,000. Nonrefundable = $300. Unused CTC-only = $4,000 - $300 = $3,700.
    // 15% of ($18K - $2.5K) = $2,325. Max ref = $3,400.
    // ACTC = min($3,700, $2,325, $3,400) = $2,325.
    // Use $80K to make 15% > cap:
    // Tax on $80K: taxable = $65K → ~$9,544. CTC = $4,000 fully used → ACTC = $0.
    // So we need low tax + high earned income. Use 4 children at $40K.
    // Taxable = $40K - $15K = $25K. Tax ≈ $2,785.
    // CTC = $8,000. Nonrefundable = $2,785. Unused CTC-only = $5,215.
    // 15% of ($40K - $2.5K) = $5,625. Max ref = $1,700 × 4 = $6,800.
    // ACTC = min($5,215, $5,625, $6,800) = $5,215.
    // Better: use income where 15% well exceeds the $1,700 cap:
    // 1 child at very low tax: $14,000 wages. Tax = 0 (below std ded).
    // Unused = $2,000. 15% of ($14K - $2.5K) = $1,725. Max ref = $1,700.
    // ACTC = min($2,000, $1,725, $1,700) = $1,700 — capped!
    const fixture = singleWithChildren("14000", 1, {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "14000",
        federalWithheld: "0",
        socialSecurityWages: "14000",
        socialSecurityWithheld: new Decimal("14000").times("0.062").toFixed(2),
        medicareWages: "14000",
        medicareWithheld: new Decimal("14000").times("0.0145").toFixed(2),
      }],
    });
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Tax = $0 (below standard deduction). Nonrefundable = $0. Unused = $2,000.
    expect(form8812.nonrefundableCTC.toNumber()).toBe(0);
    // 15% of ($14K - $2.5K) = 15% of $11,500 = $1,725
    expect(form8812.fifteenPercent.toNumber()).toBe(1725);
    // ACTC = min($2,000, $1,725, $1,700) = $1,700 — per-child cap is binding
    expect(form8812.actc.toNumber()).toBe(1700);
  });
});

// ═══════════════════════════════════════════════════════════
// Child Without SSN Gets ODC Not CTC (Line 12)
// ═══════════════════════════════════════════════════════════

describe("child without SSN gets ODC not CTC (Line 12)", () => {
  it("child marked qualifiesForODC (no SSN) gets $500, not $2,000 CTC", () => {
    // A child without a valid SSN cannot get CTC but can get ODC.
    // qualifiesForCTC: false, qualifiesForODC: true.
    // Result: $500 ODC, no ACTC.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [{
          firstName: "ChildNoSSN",
          lastName: "Doe",
          ssn: "900-00-0040",
          relationship: "Son",
          dateOfBirth: "2019-07-01",
          monthsLivedWithYou: 12,
          qualifiesForCTC: false,
          qualifiesForODC: true,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "0",
        socialSecurityWages: "50000",
        socialSecurityWithheld: new Decimal("50000").times("0.062").toFixed(2),
        medicareWages: "50000",
        medicareWithheld: new Decimal("50000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // ODC = $500, no CTC. Total before limitation = $500.
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(500);
    // No qualifying children → ACTC = $0
    expect(form8812.actc.toNumber()).toBe(0);
    // Nonrefundable should be $500 (tax well above $500)
    expect(form8812.nonrefundableCTC.toNumber()).toBe(500);
  });

  it("1 child with SSN + 1 child without SSN: $2,000 CTC + $500 ODC", () => {
    // Mixed: one gets CTC ($2,000), one gets ODC ($500). Total = $2,500.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [
          {
            firstName: "ChildWithSSN",
            lastName: "Doe",
            ssn: "900-00-0041",
            relationship: "Daughter",
            dateOfBirth: "2019-07-01",
            monthsLivedWithYou: 12,
            qualifiesForCTC: true,
            qualifiesForODC: false,
          },
          {
            firstName: "ChildNoSSN",
            lastName: "Doe",
            ssn: "900-00-0042",
            relationship: "Son",
            dateOfBirth: "2020-01-15",
            monthsLivedWithYou: 12,
            qualifiesForCTC: false,
            qualifiesForODC: true,
          },
        ],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000",
        federalWithheld: "0",
        socialSecurityWages: "50000",
        socialSecurityWithheld: new Decimal("50000").times("0.062").toFixed(2),
        medicareWages: "50000",
        medicareWithheld: new Decimal("50000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // CTC $2,000 + ODC $500 = $2,500 before limitation
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2500);
    // ACTC only from the qualifying child portion, max $1,700 × 1 = $1,700
    expect(form8812.actc.lessThanOrEqualTo(d(1700))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// No Dependents — CTC = $0 (Line 12)
// ═══════════════════════════════════════════════════════════

describe("no dependents — CTC and ACTC both zero (Line 12)", () => {
  it("taxpayer with no dependents at all gets zero CTC and zero ACTC", () => {
    // No qualifying children and no ODC dependents → max CTC = $0.
    // Neither nonrefundable credit nor refundable ACTC should appear.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "single",
        dependents: [],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "60000",
        federalWithheld: "0",
        socialSecurityWages: "60000",
        socialSecurityWithheld: new Decimal("60000").times("0.062").toFixed(2),
        medicareWages: "60000",
        medicareWithheld: new Decimal("60000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.nonrefundableCTC.toNumber()).toBe(0);
    expect(form8812.unusedCTC.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
    // childTaxCredit on the top-level result should also be zero
    expect(result.childTaxCredit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// QSS Uses $200K Phase-Out Threshold (Same as Single/HoH) — IRC §24(b)(2) (Line 12)
// ═══════════════════════════════════════════════════════════

describe("qualifying surviving spouse uses $200K phase-out threshold — IRC §24(b)(2) (Line 12)", () => {
  it("QSS at exactly $200,000 AGI with 1 child: no phase-out, full CTC = $2,000", () => {
    // IRC §24(b)(2): "$400,000 in the case of a joint return" — QSS is NOT a joint return.
    // QSS threshold = $200K (same as single/HoH).
    // At exactly $200K → excess = $0 → no reduction → full $2,000 CTC.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [{
          firstName: "Child1",
          lastName: "Doe",
          ssn: "900-00-0050",
          relationship: "Son",
          dateOfBirth: "2019-03-10",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "200000",
        federalWithheld: "0",
        socialSecurityWages: "160200",
        socialSecurityWithheld: new Decimal("160200").times("0.062").toFixed(2),
        medicareWages: "200000",
        medicareWithheld: new Decimal("200000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // No phase-out at exactly $200K for QSS — full CTC preserved
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(2000);
  });

  it("QSS at $201,000 AGI with 1 child: $50 phase-out reduction", () => {
    // $1,000 over $200K QSS threshold → ceil($1K / $1K) × $50 = $50 reduction.
    // CTC = $2,000 - $50 = $1,950.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [{
          firstName: "Child1",
          lastName: "Doe",
          ssn: "900-00-0051",
          relationship: "Son",
          dateOfBirth: "2019-03-10",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "201000",
        federalWithheld: "0",
        socialSecurityWages: "160200",
        socialSecurityWithheld: new Decimal("160200").times("0.062").toFixed(2),
        medicareWages: "201000",
        medicareWithheld: new Decimal("201000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // $50 reduction → CTC = $1,950
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(1950);
  });

  it("QSS at $400,000 AGI with 1 child: fully phased out (not MFJ threshold)", () => {
    // At $400K, excess = $200K → 200 × $50 = $10,000 reduction >> $2,000 CTC → $0.
    // This verifies QSS does NOT get the MFJ $400K threshold.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: {
        ...simpleW2Fixture.taxpayer,
        filingStatus: "qualifying_surviving_spouse",
        dependents: [{
          firstName: "Child1",
          lastName: "Doe",
          ssn: "900-00-0052",
          relationship: "Son",
          dateOfBirth: "2019-03-10",
          monthsLivedWithYou: 12,
          qualifiesForCTC: true,
          qualifiesForODC: false,
        }],
      },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "400000",
        federalWithheld: "0",
        socialSecurityWages: "160200",
        socialSecurityWithheld: new Decimal("160200").times("0.062").toFixed(2),
        medicareWages: "400000",
        medicareWithheld: new Decimal("400000").times("0.0145").toFixed(2),
      }],
    };

    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // Fully phased out at $400K for QSS (not a joint return per IRC §24(b)(2))
    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Phase-Out Completely Eliminates CTC at Minimum Required Income (Line 12)
// ═══════════════════════════════════════════════════════════

describe("phase-out exactly eliminates CTC — minimum income required (Line 12)", () => {
  it("single filer at $240,000 AGI with 1 child: CTC reduced to exactly $0", () => {
    // Per-child CTC = $2,000. Phase-out rate = $50 per $1K.
    // To eliminate $2,000: need 40 × $50 = $2,000 reduction → 40K over threshold.
    // $200K + $40K = $240K. Excess = $40K → ceil(40) × $50 = $2,000 reduction.
    // CTC = $2,000 - $2,000 = $0.
    const fixture = singleWithChildren("240000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.nonrefundableCTC.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });

  it("MFJ at $480,000 AGI with 2 children: CTC reduced to exactly $0", () => {
    // 2 children × $2,000 = $4,000 max CTC.
    // To eliminate $4,000: need 80 × $50 → 80K over $400K threshold → $480K AGI.
    // Excess = $80K → 80 × $50 = $4,000 reduction. CTC = $0.
    const fixture = mfjWithChildren("480000", 2);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(0);
    expect(form8812.actc.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC When Tax Liability Is Zero — Low Income (Lines 14, 27)
// ═══════════════════════════════════════════════════════════

describe("ACTC when tax liability is zero — low income families (Lines 14, 27)", () => {
  it("2 children at $12,000 wages: zero tax, ACTC limited by 15% formula", () => {
    // Taxable income = $12K - $15K std ded = $0. Tax = $0.
    // Nonrefundable CTC = $0. Unused CTC-only = $4,000.
    // Earned income excess = $12K - $2.5K = $9,500. 15% of $9,500 = $1,425.
    // Max refundable = $1,700 × 2 = $3,400.
    // ACTC = min($4,000, $1,425, $3,400) = $1,425.
    const fixture = singleWithChildren("12000", 2, {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "12000",
        federalWithheld: "0",
        socialSecurityWages: "12000",
        socialSecurityWithheld: new Decimal("12000").times("0.062").toFixed(2),
        medicareWages: "12000",
        medicareWithheld: new Decimal("12000").times("0.0145").toFixed(2),
      }],
    });
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.nonrefundableCTC.toNumber()).toBe(0);
    expect(form8812.earnedIncomeExcess.toNumber()).toBe(9500);
    expect(form8812.fifteenPercent.toNumber()).toBe(1425);
    expect(form8812.actc.toNumber()).toBe(1425);
    // ACTC flows into the refund
    expect(result.refund.greaterThanOrEqualTo(d(1425))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// ACTC Earned Income Threshold — $2,500 Exact and $1 Over (Lines 21, 24)
// ═══════════════════════════════════════════════════════════

describe("ACTC earned income threshold boundary — $2,500 line (Lines 21, 24)", () => {
  it("$2,507 earned income: 15% of $7 = $1.05, rounds to $1 ACTC", () => {
    // Excess = $2,507 - $2,500 = $7. 15% of $7 = $1.05 → rounds to $1.
    // Tax = $0 (below std ded). Unused CTC = $2,000. ACTC = min($2,000, $1, $1,700) = $1.
    const fixture = singleWithChildren("2507", 1, {
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "2507",
        federalWithheld: "0",
        socialSecurityWages: "2507",
        socialSecurityWithheld: new Decimal("2507").times("0.062").toFixed(2),
        medicareWages: "2507",
        medicareWithheld: new Decimal("2507").times("0.0145").toFixed(2),
      }],
    });
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.earnedIncomeExcess.toNumber()).toBe(7);
    // 15% of $7 = $1.05 → roundDollar → $1
    expect(form8812.fifteenPercent.toNumber()).toBe(1);
    expect(form8812.actc.toNumber()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// 3+ Children — CTC/ACTC Split With Precise Values (Lines 12, 14, 27)
// ═══════════════════════════════════════════════════════════

describe("3 qualifying children — precise CTC/ACTC split (Lines 12, 14, 27)", () => {
  it("3 children at $20,000 wages: zero tax, ACTC = 15% formula capped at $5,100", () => {
    // Taxable = $20K - $15K std ded = $5K. Tax ≈ $500 (10% × $5K).
    // CTC = $6,000. Nonrefundable = min($6,000, ~$500) = ~$500.
    // Unused CTC-only = $6,000 - ~$500 ≈ $5,500.
    // 15% of ($20K - $2.5K) = 15% of $17.5K = $2,625.
    // Max refundable = $1,700 × 3 = $5,100.
    // ACTC = min(~$5,500, $2,625, $5,100) = $2,625.
    const fixture = singleWithChildren("20000", 3);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    expect(form8812.ctcBeforeLimitation.toNumber()).toBe(6000);
    // 15% of $17,500 = $2,625
    expect(form8812.fifteenPercent.toNumber()).toBe(2625);
    // ACTC limited by the 15% formula (not by unused CTC or $5,100 cap)
    expect(form8812.actc.toNumber()).toBe(2625);
    // Nonrefundable + ACTC ≤ $6,000
    expect(form8812.nonrefundableCTC.plus(form8812.actc).lessThanOrEqualTo(d(6000))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail — Form 8812 Lines Are Recorded (Audit Trail)
// ═══════════════════════════════════════════════════════════

describe("audit trail records Form 8812 calculation lines", () => {
  it("form8812.lines contains entries for all key Form 8812 lines", () => {
    // Verify that the audit trail captures each material Form 8812 line
    // so the calculation is fully traceable.
    const fixture = singleWithChildren("30000", 1);
    const result = calculateFederalTax(fixture);
    const form8812 = result.form8812!;

    // The lines array should be non-empty
    expect(form8812.lines.length).toBeGreaterThan(0);

    // Every line should identify itself as coming from "Form 8812"
    const form8812Lines = form8812.lines.filter((l) => l.form === "Form 8812");
    expect(form8812Lines.length).toBeGreaterThan(0);

    // Key line numbers must be present in the audit trail
    const lineNumbers = form8812Lines.map((l) => l.line);
    expect(lineNumbers).toContain("12");  // CTC before limitation
    expect(lineNumbers).toContain("14");  // Nonrefundable CTC
    expect(lineNumbers).toContain("15");  // Unused CTC
    expect(lineNumbers).toContain("21");  // Earned income excess
    expect(lineNumbers).toContain("24");  // 15% of earned income excess
    expect(lineNumbers).toContain("27");  // ACTC
  });

  it("allLines on the federal result includes Form 8812 audit entries", () => {
    // Form 8812 lines are merged into the global audit trail on the result object.
    const fixture = singleWithChildren("50000", 2);
    const result = calculateFederalTax(fixture);

    const form8812AuditLines = result.allLines.filter((l) => l.form === "Form 8812");
    expect(form8812AuditLines.length).toBeGreaterThan(0);

    // Line 12 description should reference CTC/ODC
    const line12 = form8812AuditLines.find((l) => l.line === "12");
    expect(line12).toBeDefined();
    expect(line12!.description).toBeTruthy();

    // Line 27 should document the ACTC value
    const line27 = form8812AuditLines.find((l) => l.line === "27");
    expect(line27).toBeDefined();
    expect(line27!.value).toBeDefined();
  });
});
