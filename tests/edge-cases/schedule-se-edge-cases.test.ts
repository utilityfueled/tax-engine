/**
 * Edge case tests for Schedule SE — Self-Employment Tax
 * Tests SS wage base boundaries, multiple SE sources, K-1 interactions,
 * and high-earner scenarios where SS cap is fully exhausted by W-2.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";
const c = getConstants(2025);

function makeK1(overrides: Record<string, string | boolean>): TaxYearInput["scheduleK1"][0] {
  return {
    partnershipName: "Test LLC",
    partnershipEIN: "11-1111111",
    ordinaryIncome: "0",
    guaranteedPayments: "0",
    netShortTermCapitalGain: "0",
    netLongTermCapitalGain: "0",
    interestIncome: "0",
    ordinaryDividends: "0",
    qualifiedDividends: "0",
    selfEmploymentEarnings: "0",
    isPassiveActivity: false,
    netRentalIncome: "0",
    otherNetRentalIncome: "0",
    royalties: "0",
    section1231Gain: "0",
    otherIncome: "0",
    section179Deduction: "0",
    otherDeductions: "0",
    ...overrides,
  };
}

function makeSEFixture(overrides: Partial<TaxYearInput>): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      socialSecurityWages: "0",
      wages: "0",
      federalWithheld: "0",
    }],
    form1099Nec: [],
    scheduleK1: [],
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// SS Wage Base Boundary ($176,100 for 2025)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - SS wage base boundary", () => {
  it("SE earnings exactly at wage base: full SS tax", () => {
    // $176,100 / 0.9235 ≈ $190,721. Set SE income so taxable = wage base
    // $176,100 × 0.9235 is wrong direction. Need taxable = $176,100
    // taxable = SE × 0.9235. If SE = 190721, taxable = 190721 × 0.9235 ≈ $176,131
    // But we just need to test the cap logic. Set high SE, no W-2 wages.
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "200000", federalWithheld: "0" }],
    }), c);
    // taxable = $200K × 0.9235 = $184,700
    // SS = min($184,700, $176,100) × 12.4% = $176,100 × 12.4% = $21,836
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    // Medicare = $184,700 × 2.9% = $5,356
    expect(result.medicarePortion.toNumber()).toBe(5356);
  });

  it("W-2 wages leave exactly $1 of SS room", () => {
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "176099",
        wages: "176099",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
    }), c);
    // SS room = $176,100 - $176,099 = $1
    // SS = $1 × 12.4% = $0 (rounds to 0)
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // Medicare still applies: $50K × 0.9235 × 2.9%
    expect(result.medicarePortion.greaterThan(0)).toBe(true);
  });

  it("W-2 wages exactly at wage base: zero SS, full Medicare", () => {
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "176100",
        wages: "176100",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
    }), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // $50K × 0.9235 = $46,175 × 2.9% = $1,339
    expect(result.medicarePortion.toNumber()).toBe(1339);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple SE Income Sources
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - multiple SE sources", () => {
  it("multiple 1099-NECs aggregate for SE", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [
        { payer: "Client A", nonemployeeCompensation: "30000", federalWithheld: "0" },
        { payer: "Client B", nonemployeeCompensation: "20000", federalWithheld: "0" },
        { payer: "Client C", nonemployeeCompensation: "10000", federalWithheld: "0" },
      ],
    }), c);
    expect(result.netNonfarmProfit.toNumber()).toBe(60000);
  });

  it("1099-NEC + K-1 SE earnings combine", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "40000", federalWithheld: "0" }],
      scheduleK1: [makeK1({ selfEmploymentEarnings: "20000" })],
    }), c);
    expect(result.netNonfarmProfit.toNumber()).toBe(60000);
  });

  it("K-1 guaranteed payments are SE income", () => {
    const result = calculateScheduleSE(makeSEFixture({
      scheduleK1: [makeK1({
        guaranteedPayments: "75000",
        selfEmploymentEarnings: "75000", // Actual Box14A includes service guaranteed payments.
      })],
    }), c);
    expect(result.netNonfarmProfit.toNumber()).toBe(75000);
    expect(result.totalSETax.greaterThan(0)).toBe(true);
  });

  it("K-1 Box14A includes ordinary earnings and guaranteed payments once", () => {
    const result = calculateScheduleSE(makeSEFixture({
      scheduleK1: [makeK1({
        guaranteedPayments: "50000",
        selfEmploymentEarnings: "75000", // Actual total: ordinary25K plus service payments50K.
      })],
    }), c);
    expect(result.netNonfarmProfit.toNumber()).toBe(75000);
  });

  it("multiple K-1s with mixed SE sources", () => {
    const result = calculateScheduleSE(makeSEFixture({
      scheduleK1: [
        makeK1({ partnershipName: "LLC A", selfEmploymentEarnings: "40000", guaranteedPayments: "10000" }),
        makeK1({ partnershipName: "LLC B", selfEmploymentEarnings: "15000", guaranteedPayments: "20000" }),
      ],
    }), c);
    // Actual Box14A totals40K and15K already include the service payments.
    expect(result.netNonfarmProfit.toNumber()).toBe(55000);
  });
});

describe("Schedule SE - cross-source netting before $400 threshold", () => {
  it("Schedule SE Line 2 - Schedule C net loss offsets K-1 SE earnings below threshold", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "500", federalWithheld: "0" }],
      scheduleC: {
        expenses: { supplies: "700" },
      },
      scheduleK1: [makeK1({ selfEmploymentEarnings: "550" })],
    }), c);

    expect(result.netNonfarmProfit.toNumber()).toBe(350);
    expect(result.netSEEarnings.toNumber()).toBe(350);
    expect(result.totalSETax.toNumber()).toBe(0);

    const line2 = result.lines.find((line) => line.form === "Sched SE" && line.line === "2");
    expect(line2).toBeDefined();
    expect((line2!.inputs["Schedule C Line 31 net profit"] as Decimal).toNumber()).toBe(-200);
    expect((line2!.inputs["K-1 self-employment earnings"] as Decimal).toNumber()).toBe(550);
  });

  it("Schedule SE Line 6 - Schedule C loss can net K-1 income to exactly $400", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "500", federalWithheld: "0" }],
      scheduleC: {
        expenses: { supplies: "700" },
      },
      scheduleK1: [makeK1({ selfEmploymentEarnings: "600" })],
    }), c);

    expect(result.netNonfarmProfit.toNumber()).toBe(400);
    expect(result.netSEEarnings.toNumber()).toBe(400);
    // Post-multiplier: $400 × 0.9235 = $369, which is below the $400 threshold
    // Per IRC §1402(b)(2), SE tax only applies when post-multiplier ≥ $400
    expect(result.taxableEarnings.toNumber()).toBe(369);
    expect(result.totalSETax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// High Earner: Only Medicare Applies
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - high earner (SS exhausted by W-2)", () => {
  it("$300K W-2 + $100K SE: only Medicare on SE income", () => {
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "176100",
        wages: "300000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" }],
    }), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // $100K × 0.9235 = $92,350 × 2.9% = $2,678
    expect(result.medicarePortion.toNumber()).toBe(2678);
    expect(result.totalSETax.toNumber()).toBe(2678);
    expect(result.deductibleHalf.toNumber()).toBe(1339);
  });

  it("supported Form 4137 tips plus supported Form 8919 wages can exhaust the last Social Security wage-base room before SE tax is computed", () => {
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "170000",
        wages: "170000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "10000", federalWithheld: "0" }],
      form4137: {
        unreportedTipIncome: "5000",
      },
      form8919: {
        wagesNotReportedOnW2: "1100",
      },
    }), c);

    expect(result.taxableEarnings.toNumber()).toBe(9235);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    expect(result.medicarePortion.toNumber()).toBe(268);
    expect(result.totalSETax.toNumber()).toBe(268);

    const line10 = result.lines.find((line) => line.form === "Sched SE" && line.line === "10");
    expect(String(line10?.inputs["Supported Form 4137 Line 10 tips"])).toBe("5000");
    expect(String(line10?.inputs["Supported Form 8919 Line 10 wages"])).toBe("1100");
    expect(String(line10?.inputs["Remaining SS wage base room"])).toBe("0");
    expect(String(line10?.inputs["SS-taxable earnings after cap"])).toBe("0");
  });
});

// ═══════════════════════════════════════════════════════════
// Deductible Half Precision
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - deductible half rounding", () => {
  it("odd SE tax rounds deductible half correctly", () => {
    // $500 SE → $462 taxable (500 × 0.9235 = 461.75, rounds to 462)
    // SS: $462 × 12.4% = $57.288 → $57
    // Med: $462 × 2.9% = $13.398 → $13
    // Total: $70. Half = $35
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "500", federalWithheld: "0" }],
    }), c);
    expect(result.totalSETax.toNumber()).toBe(70);
    expect(result.deductibleHalf.toNumber()).toBe(35);
  });

  it("$400 pre-multiplier: no SE tax (post-multiplier $369 < $400)", () => {
    // Per IRC §1402(b)(2): $400 threshold applies to post-multiplier amount
    // $400 × 0.9235 = $369.40 → roundDollar = $369 < $400 → no SE tax
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "400", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(369);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Below $400 Threshold — No SE Tax
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - below $400 threshold", () => {
  it("$399 SE income produces no SE tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "399", federalWithheld: "0" }],
    }), c);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("zero SE income produces zero tax", () => {
    const result = calculateScheduleSE(makeSEFixture({}), c);
    expect(result.totalSETax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C Net Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Schedule C in federal pipeline", () => {
  it("SE income with no expenses produces full SE tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
    };
    const result = calculateFederalTax(fixture);
    // $50K × 0.9235 = $46,175. SS: $46,175 × 12.4% = $5,726. Med: $46,175 × 2.9% = $1,339
    // Total: $7,065
    expect(result.selfEmploymentTax.toNumber()).toBe(7065);
    expect(result.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  it("SE income with expenses reduces AGI through deduction", () => {
    const noExpenses = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
    });
    const withExpenses = calculateFederalTax({
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }],
      scheduleC: {
        businessName: "Freelance",
        businessCode: "541511",
        accountingMethod: "cash",
        expenses: {
          advertising: "0", autoTravel: "0", cleaning: "0", commissions: "0",
          insurance: "0", legalProfessional: "0", officeExpense: "0",
          rentOther: "0", repairs: "0", supplies: "20000",
          taxes: "0", utilities: "0", otherExpenses: "0",
        },
      },
    });
    // Schedule C expenses reduce total income → lower AGI and total tax
    expect(withExpenses.agi.lessThan(noExpenses.agi)).toBe(true);
    expect(withExpenses.totalTax.lessThan(noExpenses.totalTax)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large SE Income
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - very large SE income", () => {
  it("$1M SE income: SS capped, Medicare on full amount", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "BigClient", nonemployeeCompensation: "1000000", federalWithheld: "0" }],
    }), c);
    // Taxable: $1M × 0.9235 = $923,500
    // SS: $176,100 × 12.4% = $21,836 (capped)
    // Medicare: $923,500 × 2.9% = $26,782
    // Total: $48,618
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    expect(result.medicarePortion.toNumber()).toBe(26782);
    expect(result.totalSETax.toNumber()).toBe(48618);
    expect(result.deductibleHalf.toNumber()).toBe(24309);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Income Exactly at $400 Threshold — SE Tax Applies
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - post-multiplier $400 threshold boundary", () => {
  it("SE income $400: post-multiplier $369 < $400, no SE tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "400", federalWithheld: "0" }],
    }), c);
    // $400 × 0.9235 = $369.40 → roundDollar = $369 < $400 → no SE tax
    expect(result.taxableEarnings.toNumber()).toBe(369);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("SE income $432: post-multiplier $399 < $400, no SE tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "432", federalWithheld: "0" }],
    }), c);
    // $432 × 0.9235 = $398.952 → roundDollar = $399 < $400 → no SE tax
    expect(result.taxableEarnings.toNumber()).toBe(399);
    expect(result.totalSETax.toNumber()).toBe(0);
  });

  it("SE income $433: post-multiplier exactly $400, SE tax applies", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "433", federalWithheld: "0" }],
    }), c);
    // $433 × 0.9235 = $399.8555 → roundDollar = $400 ≥ $400 → SE tax applies
    expect(result.taxableEarnings.toNumber()).toBe(400);
    expect(result.totalSETax.toNumber()).toBe(62);
    expect(result.socialSecurityPortion.toNumber()).toBe(50);
    expect(result.medicarePortion.toNumber()).toBe(12);
    expect(result.deductibleHalf.toNumber()).toBe(31);
  });

  it("SE income $399: post-multiplier $368 < $400, no SE tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "399", federalWithheld: "0" }],
    }), c);
    // $399 × 0.9235 = $368.4765 → roundDollar = $368 < $400
    expect(result.netNonfarmProfit.toNumber()).toBe(399);
    expect(result.taxableEarnings.toNumber()).toBe(368);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple 1099-NECs: Aggregation and Taxable Earnings
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - multiple 1099-NECs aggregate for SE", () => {
  it("three 1099-NECs: net profit equals sum, taxable = sum × 0.9235", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [
        { payer: "Alpha Corp", nonemployeeCompensation: "15000", federalWithheld: "0" },
        { payer: "Beta LLC",   nonemployeeCompensation: "25000", federalWithheld: "0" },
        { payer: "Gamma Inc",  nonemployeeCompensation: "10000", federalWithheld: "0" },
      ],
    }), c);
    // Total: $50,000
    expect(result.netNonfarmProfit.toNumber()).toBe(50000);
    // taxable = $50,000 × 0.9235 = $46,175
    expect(result.taxableEarnings.toNumber()).toBe(46175);
    // SS: $46,175 × 12.4% = $5,726 (rounded)
    expect(result.socialSecurityPortion.toNumber()).toBe(5726);
    // Medicare: $46,175 × 2.9% = $1,339 (rounded)
    expect(result.medicarePortion.toNumber()).toBe(1339);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Income Exactly at SS Wage Base ($176,100)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - SE income at SS wage base", () => {
  it("SE taxable earnings exactly $176,100: all SS applies, no cap reduction", () => {
    // $190,688 × 0.9235 = $176,100.0080 → rounds to $176,100 (verified with Decimal.js)
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "190688", federalWithheld: "0" }],
    }), c);
    // taxable = $190,688 × 0.9235 → $176,100
    expect(result.taxableEarnings.toNumber()).toBe(176100);
    // SS: min($176,100, $176,100) × 12.4% = $21,836 (no excess)
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    // Medicare: $176,100 × 2.9% = $5,107 (rounded)
    expect(result.medicarePortion.toNumber()).toBe(5107);
    // Total: $21,836 + $5,107 = $26,943
    expect(result.totalSETax.toNumber()).toBe(26943);
  });

  it("SE income above SS wage base: only Medicare applies on excess", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "250000", federalWithheld: "0" }],
    }), c);
    // taxable = $250,000 × 0.9235 = $230,875
    expect(result.taxableEarnings.toNumber()).toBe(230875);
    // SS capped at $176,100 → $176,100 × 12.4% = $21,836
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    // Medicare: $230,875 × 2.9% = $6,695 (rounded)
    expect(result.medicarePortion.toNumber()).toBe(6695);
    // Excess over wage base ($54,775) taxed only by Medicare — verify SS is capped
    expect(result.socialSecurityPortion.toNumber()).toBe(
      Math.round(176100 * 0.124)
    );
  });
});

// ═══════════════════════════════════════════════════════════
// Small SE Income ($500) — 92.35% Factor and Both Tax Halves
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - small SE income ($500) factor verification", () => {
  it("$500 SE: taxable earnings reflect 92.35% multiplier exactly", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "500", federalWithheld: "0" }],
    }), c);
    // Verify the 92.35% factor is applied: $500 × 0.9235 = $461.75 → rounds to $462
    expect(result.netNonfarmProfit.toNumber()).toBe(500);
    expect(result.taxableEarnings.toNumber()).toBe(462);
    // Both SS and Medicare must be positive
    expect(result.socialSecurityPortion.greaterThan(0)).toBe(true);
    expect(result.medicarePortion.greaterThan(0)).toBe(true);
    // SS: $462 × 12.4% = $57.288 → $57
    expect(result.socialSecurityPortion.toNumber()).toBe(57);
    // Medicare: $462 × 2.9% = $13.398 → $13
    expect(result.medicarePortion.toNumber()).toBe(13);
    // Total SE tax = $70; deductible half = $35
    expect(result.totalSETax.toNumber()).toBe(70);
    expect(result.deductibleHalf.toNumber()).toBe(35);
  });
});

// ═══════════════════════════════════════════════════════════
// SE with W-2 Wages: Combined SS Wage Base
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - SE with W-2 wages: combined SS wage base", () => {
  it("W-2 SS wages partially consume wage base, SE covers remainder", () => {
    // W-2 SS wages: $100,000 → remaining SS room: $176,100 - $100,000 = $76,100
    // SE income: $90,000 → taxable = $90,000 × 0.9235 = $83,115
    // SS = min($83,115, $76,100) × 12.4% = $76,100 × 12.4% = $9,436
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "100000",
        wages: "100000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "90000", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(83115);
    // SS is limited by remaining room ($76,100), not full taxable earnings ($83,115)
    expect(result.socialSecurityPortion.toNumber()).toBe(9436);
    // Medicare applies to full taxable: $83,115 × 2.9% = $2,410 (rounded)
    expect(result.medicarePortion.toNumber()).toBe(2410);
  });

  it("W-2 SS wages exceed wage base: SE contributes only Medicare", () => {
    // W-2 SS wages: $200,000 (above $176,100 cap) → zero SS room for SE
    // SE income: $80,000 → taxable = $80,000 × 0.9235 = $73,880
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "200000",
        wages: "200000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(73880);
    // No SS room remaining
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // Medicare still applies: $73,880 × 2.9% = $2,143 (rounded)
    expect(result.medicarePortion.toNumber()).toBe(2143);
    expect(result.totalSETax.toNumber()).toBe(2143);
    // Deductible half: $2,143 × 0.5 = $1,072 (rounded)
    expect(result.deductibleHalf.toNumber()).toBe(1072);
  });

  it("multiple W-2s: combined SS wages reduce wage base for SE", () => {
    // Two W-2 jobs each with $60,000 SS wages = $120,000 combined
    // Remaining SS room: $176,100 - $120,000 = $56,100
    // SE income: $70,000 → taxable = $70,000 × 0.9235 = $64,645
    // SS = min($64,645, $56,100) × 12.4% = $56,100 × 12.4% = $6,956
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [
        {
          ...simpleW2Fixture.w2s[0],
          socialSecurityWages: "60000",
          wages: "60000",
        },
        {
          ...simpleW2Fixture.w2s[0],
          socialSecurityWages: "60000",
          wages: "60000",
        },
      ],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "70000", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(64645);
    expect(result.socialSecurityPortion.toNumber()).toBe(6956);
    // Medicare: $64,645 × 2.9% = $1,875 (rounded)
    expect(result.medicarePortion.toNumber()).toBe(1875);
  });
});

// ═══════════════════════════════════════════════════════════
// Exact $400 Threshold Boundary (Line 6 < $400 check)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - post-multiplier $400 threshold precision", () => {
  it("$399.99 net SE: post-multiplier $369 < $400, no SE tax", () => {
    // $399.99 × 0.9235 = $369.390765 → roundDollar = $369 < $400 → no SE tax
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "399.99", federalWithheld: "0" }],
    }), c);
    expect(result.netSEEarnings.toNumber()).toBeCloseTo(399.99);
    expect(result.taxableEarnings.toNumber()).toBe(369);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    expect(result.medicarePortion.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("$400.01 net SE: post-multiplier $369 < $400, no SE tax", () => {
    // $400.01 × 0.9235 = $369.409235 → roundDollar = $369 < $400 → no SE tax
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "400.01", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(369);
    expect(result.totalSETax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero and Negative SE Earnings
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - zero and negative SE earnings", () => {
  it("Sched SE Line 6 - exactly $0 net SE earnings produces zero tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [],
      scheduleK1: [],
    }), c);
    expect(result.netSEEarnings.toNumber()).toBe(0);
    expect(result.taxableEarnings.toNumber()).toBe(0);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("Sched SE Line 6 - negative net SE earnings (K-1 loss) produces zero tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      scheduleK1: [makeK1({ selfEmploymentEarnings: "-10000" })],
    }), c);
    // -$10,000 < $400 → below threshold, no SE tax
    expect(result.netSEEarnings.toNumber()).toBe(-10000);
    expect(result.taxableEarnings.toNumber()).toBe(0);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("Sched SE Line 6 - large negative SE earnings from K-1 loss, zero tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      scheduleK1: [makeK1({ selfEmploymentEarnings: "-500000" })],
    }), c);
    expect(result.netSEEarnings.toNumber()).toBe(-500000);
    expect(result.taxableEarnings.toNumber()).toBe(0);
    expect(result.totalSETax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very Large SE Earnings ($1M+)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - very large SE earnings ($5M)", () => {
  it("Sched SE Line 7/10/11 - $5M SE income: SS capped at wage base, Medicare on full taxable", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "MegaCorp", nonemployeeCompensation: "5000000", federalWithheld: "0" }],
    }), c);
    // taxable = $5,000,000 × 0.9235 = $4,617,500
    expect(result.taxableEarnings.toNumber()).toBe(4617500);
    // SS: min($4,617,500, $176,100) × 12.4% = $176,100 × 12.4% = $21,836 (capped)
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    // Medicare: $4,617,500 × 2.9% = $133,907.50 → $133,908
    expect(result.medicarePortion.toNumber()).toBe(133908);
    // Total: $21,836 + $133,908 = $155,744
    expect(result.totalSETax.toNumber()).toBe(155744);
    // Deductible half: $155,744 × 0.5 = $77,872
    expect(result.deductibleHalf.toNumber()).toBe(77872);
  });
});

// ═══════════════════════════════════════════════════════════
// W-2 Wages at and Exceeding SS Wage Base with SE Income
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - W-2 at SS wage base ($176,100) with SE income", () => {
  it("Sched SE Line 10 - W-2 SS wages exactly $176,100: zero SS room, only Medicare on SE", () => {
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "176100",
        wages: "176100",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" }],
    }), c);
    // SS room = $176,100 - $176,100 = $0
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // taxable = $80,000 × 0.9235 = $73,880
    expect(result.taxableEarnings.toNumber()).toBe(73880);
    // Medicare = $73,880 × 2.9% = $2,142.52 → $2,143
    expect(result.medicarePortion.toNumber()).toBe(2143);
    expect(result.totalSETax.toNumber()).toBe(2143);
  });

  it("Sched SE Line 10 - W-2 SS wages $250K (exceeding wage base): zero SS on SE income", () => {
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "250000",
        wages: "250000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "60000", federalWithheld: "0" }],
    }), c);
    // SS room = max($176,100 - $250,000, 0) = $0 via zeroFloor
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // taxable = $60,000 × 0.9235 = $55,410
    expect(result.taxableEarnings.toNumber()).toBe(55410);
    // Medicare: $55,410 × 2.9% = $1,606.89 → $1,607
    expect(result.medicarePortion.toNumber()).toBe(1607);
  });
});

// ═══════════════════════════════════════════════════════════
// Partial SS Wage Base Fill by W-2
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - W-2 partially fills SS wage base", () => {
  it("Sched SE Line 10 - W-2 fills half of SS wage base, SE taxable exactly fills remainder", () => {
    // W-2 SS = $88,050 (half of $176,100), remaining = $88,050
    // SE = $100,000 → taxable = $100,000 × 0.9235 = $92,350
    // SS = min($92,350, $88,050) × 12.4% = $88,050 × 12.4% = $10,918 (rounded)
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "88050",
        wages: "88050",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(92350);
    // SS capped at remaining $88,050: $88,050 × 12.4% = $10,918.20 → $10,918
    expect(result.socialSecurityPortion.toNumber()).toBe(10918);
    // Medicare: $92,350 × 2.9% = $2,678.15 → $2,678
    expect(result.medicarePortion.toNumber()).toBe(2678);
  });

  it("Sched SE Line 10 - W-2 fills most of SS wage base, SE taxable fits within remaining room", () => {
    // W-2 SS = $170,000, remaining = $6,100
    // SE = $5,000 → taxable = $5,000 × 0.9235 = $4,618 (rounds)
    // $4,618 < $6,100 so SS applies on full taxable
    const result = calculateScheduleSE(makeSEFixture({
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "170000",
        wages: "170000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }],
    }), c);
    // taxable = roundDollar($5,000 × 0.9235) = roundDollar($4,617.50) = $4,618
    expect(result.taxableEarnings.toNumber()).toBe(4618);
    // SS: min($4,618, $6,100) × 12.4% = $4,618 × 12.4% = $572.632 → $573
    expect(result.socialSecurityPortion.toNumber()).toBe(573);
    // Medicare: $4,618 × 2.9% = $133.922 → $134
    expect(result.medicarePortion.toNumber()).toBe(134);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Schedule C Businesses (1099-NECs) Aggregated
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - multiple Schedule C businesses aggregated", () => {
  it("Sched SE Line 2 - five 1099-NECs aggregate correctly for net nonfarm profit", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [
        { payer: "Biz A", nonemployeeCompensation: "12000", federalWithheld: "0" },
        { payer: "Biz B", nonemployeeCompensation: "8500", federalWithheld: "0" },
        { payer: "Biz C", nonemployeeCompensation: "3200", federalWithheld: "0" },
        { payer: "Biz D", nonemployeeCompensation: "45000", federalWithheld: "0" },
        { payer: "Biz E", nonemployeeCompensation: "1300", federalWithheld: "0" },
      ],
    }), c);
    // $12,000 + $8,500 + $3,200 + $45,000 + $1,300 = $70,000
    expect(result.netNonfarmProfit.toNumber()).toBe(70000);
    // taxable = $70,000 × 0.9235 = $64,645
    expect(result.taxableEarnings.toNumber()).toBe(64645);
    expect(result.totalSETax.greaterThan(0)).toBe(true);
  });

  it("Sched SE Line 2 - 1099-NECs + multiple K-1s with guaranteed payments all aggregate", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [
        { payer: "Freelance", nonemployeeCompensation: "25000", federalWithheld: "0" },
      ],
      scheduleK1: [
        makeK1({ partnershipName: "Fund A", selfEmploymentEarnings: "20000", guaranteedPayments: "5000" }),
        makeK1({ partnershipName: "Fund B", selfEmploymentEarnings: "10000", guaranteedPayments: "10000" }),
      ],
    }), c);
    // NEC: $25,000. Actual K1 Box14A totals: $20,000 and $10,000.
    // Service guaranteed payments are included in each Box14A, so total is $55,000 once.
    expect(result.netNonfarmProfit.toNumber()).toBe(55000);
    expect(result.taxableEarnings.toNumber()).toBe(50793); // $55,000 × 0.9235 = $50,792.50 → $50,793
  });
});

// ═══════════════════════════════════════════════════════════
// SE Tax Deduction (50% of SE Tax) — Line 13
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - deductible half (50% of SE tax) as adjustment to income", () => {
  it("Sched SE Line 13 - deductible half equals exactly 50% of total SE tax", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" }],
    }), c);
    // taxable = $80,000 × 0.9235 = $73,880
    // SS: min($73,880, $176,100) × 12.4% = $73,880 × 12.4% = $9,161.12 → $9,161
    // Medicare: $73,880 × 2.9% = $2,142.52 → $2,143
    // Total: $11,304
    expect(result.totalSETax.toNumber()).toBe(11304);
    // Deductible half: roundDollar($11,304 × 0.5) = $5,652
    expect(result.deductibleHalf.toNumber()).toBe(5652);
  });

  it("Sched SE Line 13 - deductible half flows to AGI adjustment in federal pipeline", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" }],
    };
    const fedResult = calculateFederalTax(fixture);
    // The SE deductible half ($5,652) reduces AGI
    // AGI = totalIncome - adjustments. Adjustments include SE deductible half.
    // Total income = $80,000, adjustments >= $5,652
    expect(fedResult.adjustmentsToIncome.greaterThanOrEqualTo(5652)).toBe(true);
    // AGI should be less than total income
    expect(fedResult.agi.lessThan(fedResult.totalIncome)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Taxable Earnings Calculation Precision (0.9235 Factor)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - 0.9235 factor rounding precision", () => {
  it("Sched SE Line 7 - $401 SE: post-multiplier $370 < $400, no SE tax", () => {
    // $401 × 0.9235 = $370.3235 → roundDollar = $370 < $400 → no SE tax
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "401", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(370);
    expect(result.totalSETax.toNumber()).toBe(0);
  });

  it("Sched SE Line 7 - $10,001 SE: tests 0.9235 rounding at .9235 boundary", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "10001", federalWithheld: "0" }],
    }), c);
    // $10,001 × 0.9235 = $9,235.9235 → rounds to $9,236
    expect(result.taxableEarnings.toNumber()).toBe(9236);
  });

  it("Sched SE Line 7 - $100,000 SE: clean multiplication, no rounding artifact", () => {
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" }],
    }), c);
    // $100,000 × 0.9235 = $92,350.00 exactly
    expect(result.taxableEarnings.toNumber()).toBe(92350);
  });
});

// ═══════════════════════════════════════════════════════════
// Additional Medicare Tax via Federal Pipeline (Form 8959)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Additional Medicare Tax on high SE income (Form 8959)", () => {
  it("Form 8959 - $300K SE income (single): exact Additional Medicare Tax using post-multiplier SE", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "BigClient", nonemployeeCompensation: "300000", federalWithheld: "0" }],
    };
    const fedResult = calculateFederalTax(fixture);
    // SE taxable = roundDollar($300,000 × 0.9235) = $277,050 (post-multiplier)
    // Form 8959: $0 wages + $277,050 SE = $277,050 total
    // Excess = $277,050 - $200,000 = $77,050
    // Tax = roundDollar($77,050 × 0.009) = roundDollar($693.45) = $693
    expect(fedResult.additionalMedicareTax.toNumber()).toBe(693);
  });

  it("Form 8959 - combined $150K W-2 + $100K SE (single): exact Additional Medicare Tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "150000",
        socialSecurityWages: "150000",
        socialSecurityWithheld: "9300",
        medicareWages: "150000",
        medicareWithheld: "2175",
        federalWithheld: "25000",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" }],
    };
    const fedResult = calculateFederalTax(fixture);
    // SE taxable = roundDollar($100K × 0.9235) = $92,350 (post-multiplier)
    // Form 8959: $150K wages + $92,350 SE = $242,350 total
    // Excess = $242,350 - $200K = $42,350
    // Tax = roundDollar($42,350 × 0.009) = roundDollar($381.15) = $381
    expect(fedResult.additionalMedicareTax.toNumber()).toBe(381);
    expect(fedResult.selfEmploymentTax.greaterThan(0)).toBe(true);
  });

  it("Form 8959 - $210K SE income (single): pre-multiplier above $200K but post-multiplier below → zero tax", () => {
    // REGRESSION: This was the core pre-multiplier vs post-multiplier bug.
    // Old code used $210K (pre-multiplier) → $10K excess → $90 tax (WRONG).
    // Correct: $210K × 0.9235 = $193,935 (post-multiplier) < $200K → $0 tax.
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "210000", federalWithheld: "0" }],
    };
    const fedResult = calculateFederalTax(fixture);
    // SE taxable = roundDollar($210,000 × 0.9235) = $193,935 < $200K threshold
    expect(fedResult.additionalMedicareTax.toNumber()).toBe(0);
  });

  it("Form 8959 - $180K SE income (single): below $200K threshold, no Additional Medicare Tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0", federalWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "180000", federalWithheld: "0" }],
    };
    const fedResult = calculateFederalTax(fixture);
    // SE taxable = $180,000 × 0.9235 = $166,230 < $200K threshold
    // No Additional Medicare Tax
    expect(fedResult.additionalMedicareTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Minimal SE Income Just Above Threshold ($401)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - minimal SE income at post-multiplier threshold ($433)", () => {
  it("Sched SE - $433 is first pre-multiplier amount that triggers SE tax", () => {
    // $433 × 0.9235 = $399.8555 → roundDollar = $400 ≥ $400 → SE tax applies
    const result = calculateScheduleSE(makeSEFixture({
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "433", federalWithheld: "0" }],
    }), c);
    expect(result.taxableEarnings.toNumber()).toBe(400);
    expect(result.totalSETax.toNumber()).toBe(62);
    // Verify deductible half is exactly half
    const expectedHalf = new Decimal(result.totalSETax.toNumber()).times(0.5);
    expect(result.deductibleHalf.toNumber()).toBe(expectedHalf.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C Net Profit Pipeline: SE Tax Must Use Net, Not Gross
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - pipeline uses Schedule C net profit (not gross 1099-NEC)", () => {
  it("SE tax computed on net profit when Schedule C has expenses ($100K gross, $40K expenses)", () => {
    // Pipeline: $100K 1099-NEC, $40K business expenses → Schedule C net = $60K
    // SE should use $60K (net), not $100K (gross)
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "single" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "0", federalWithheld: "0",
        socialSecurityWages: "0", socialSecurityWithheld: "0",
        medicareWages: "0", medicareWithheld: "0",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" }],
      scheduleC: {
        expenses: {
          contractLabor: "20000",
          officeExpense: "10000",
          supplies: "10000",
        },
      },
    };
    const fedResult = calculateFederalTax(fixture);
    // Schedule C: $100K - $40K = $60K net
    // SE: $60K × 0.9235 = $55,410
    // SS: $55,410 × 12.4% = $6,871
    // MC: $55,410 × 2.9% = $1,607
    // Total SE: $8,478
    // Deductible half: $4,239
    expect(fedResult.selfEmploymentTax.toNumber()).toBe(8478);
    expect(fedResult.scheduleSE!.deductibleHalf.toNumber()).toBe(4239);
  });

  it("SE tax $0 when Schedule C expenses exceed gross (net loss)", () => {
    // Pipeline: $5K 1099-NEC, $15K expenses → Schedule C net = -$10K
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "single" },
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        wages: "50000", federalWithheld: "7500",
        socialSecurityWages: "50000", socialSecurityWithheld: "3100",
        medicareWages: "50000", medicareWithheld: "725",
      }],
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }],
      scheduleC: {
        expenses: {
          contractLabor: "10000",
          supplies: "5000",
        },
      },
    };
    const fedResult = calculateFederalTax(fixture);
    // Schedule C: $5K - $15K = -$10K net loss
    // SE earnings: -$10K → no SE tax
    expect(fedResult.selfEmploymentTax.toNumber()).toBe(0);
    expect(fedResult.scheduleSE!.deductibleHalf.toNumber()).toBe(0);
  });
});
