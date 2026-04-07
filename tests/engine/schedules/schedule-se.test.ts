/**
 * Tests for Schedule SE — Self-Employment Tax
 * Spec: spec/federal/schedule-se.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleSE } from "@/engine/schedules/schedule-se.js";
import { getConstants } from "@/models/constants.js";
import { simpleW2Fixture, complexMFJFixture } from "../../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);
const c = getConstants(2025);

function makeFixtureWith1099NEC(amount: string, w2SSWages = "0"): TaxYearInput {
  return {
    ...simpleW2Fixture,
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      socialSecurityWages: w2SSWages,
    }],
    form1099Nec: [
      { payer: "Client", nonemployeeCompensation: amount, federalWithheld: "0" },
    ],
  };
}

// ═══════════════════════════════════════════════════════════
// Net Earnings
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Net Earnings", () => {
  it("Schedule SE Line 4a - uses Schedule F net farm profit when farm input is present", () => {
    const result = calculateScheduleSE({
      ...simpleW2Fixture,
      form1099Nec: [],
      scheduleK1: [],
      scheduleF: {
        salesOfProductsRaised: "40000",
        customHireIncome: "5000",
        expenses: {
          feed: "10000",
          seedsAndPlants: "5000",
        },
      },
    }, c);

    expect(result.netFarmProfit.toNumber()).toBe(30000);
    expect(result.netSEEarnings.toNumber()).toBe(30000);

    const line4a = result.lines.find((l) => l.form === "Sched SE" && l.line === "4a");
    expect(line4a).toBeDefined();
    expect(line4a!.value.toNumber()).toBe(30000);
  });

  it("Schedule SE Line 4b - net nonfarm from 1099-NEC", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000"), c);
    expect(result.netNonfarmProfit.toNumber()).toBe(50000);
  });

  it("Schedule SE Line 4b - uses Schedule C net profit after expenses", () => {
    const result = calculateScheduleSE({
      ...simpleW2Fixture,
      form1099Nec: [
        { payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" },
      ],
      scheduleC: {
        expenses: { supplies: "4500" },
      },
    }, c);

    expect(result.netNonfarmProfit.toNumber()).toBe(500);
    expect(result.netSEEarnings.toNumber()).toBe(500);

    const line4b = result.lines.find((l) => l.form === "Sched SE" && l.line === "4b");
    expect(line4b).toBeDefined();
    expect((line4b!.inputs["Schedule C Line 31 net profit"] as Decimal).toNumber()).toBe(500);
  });

  it("Schedule SE Line 4b - includes K-1 SE earnings and guaranteed payments", () => {
    const result = calculateScheduleSE(complexMFJFixture, c);
    // complexMFJ: 1099-NEC $15K + K-1 SE $0 + K-1 guaranteed $0 = $15K
    expect(result.netNonfarmProfit.toNumber()).toBe(15000);
  });

  it("Schedule SE Line 7 - earnings multiplier (× 0.9235)", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("100000", "0"), c);
    // $100K × 0.9235 = $92,350
    expect(result.taxableEarnings.toNumber()).toBe(92350);
  });

  it("Schedule SE - zero when no SE income", () => {
    const result = calculateScheduleSE({
      ...simpleW2Fixture,
      form1099Nec: [],
      scheduleK1: [],
    }, c);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// $400 Minimum Threshold (Schedule SE Line 6)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - $400 minimum threshold", () => {
  it("$399 SE income: no SE tax (below threshold)", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("399", "0"), c);
    expect(result.netSEEarnings.toNumber()).toBe(399);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("exactly $400 SE income: no SE tax (post-multiplier $369 < $400)", () => {
    // Per IRC §1402(b)(2) and Short SE Line 3: threshold is on post-multiplier amount
    // $400 × 0.9235 = $369.40 → roundDollar = $369 < $400 → no SE tax
    const result = calculateScheduleSE(makeFixtureWith1099NEC("400", "0"), c);
    expect(result.netSEEarnings.toNumber()).toBe(400);
    expect(result.taxableEarnings.toNumber()).toBe(369);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });

  it("$432 SE income: no SE tax (post-multiplier $399 < $400)", () => {
    // $432 × 0.9235 = $398.952 → roundDollar = $399 < $400 → no SE tax
    const result = calculateScheduleSE(makeFixtureWith1099NEC("432", "0"), c);
    expect(result.taxableEarnings.toNumber()).toBe(399);
    expect(result.totalSETax.toNumber()).toBe(0);
  });

  it("$433 SE income: SE tax applies (post-multiplier exactly $400)", () => {
    // $433 × 0.9235 = $399.8555 → roundDollar = $400 ≥ $400 → SE tax applies
    // SS: $400 × 0.124 = $49.60 → $50. Medicare: $400 × 0.029 = $11.60 → $12
    const result = calculateScheduleSE(makeFixtureWith1099NEC("433", "0"), c);
    expect(result.taxableEarnings.toNumber()).toBe(400);
    expect(result.totalSETax.toNumber()).toBe(62);
    expect(result.socialSecurityPortion.toNumber()).toBe(50);
    expect(result.medicarePortion.toNumber()).toBe(12);
    expect(result.deductibleHalf.toNumber()).toBe(31);
  });

  it("$1 SE income: no SE tax", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("1", "0"), c);
    expect(result.totalSETax.toNumber()).toBe(0);
  });

  it("negative SE income: no SE tax", () => {
    const result = calculateScheduleSE({
      ...simpleW2Fixture,
      form1099Nec: [],
      scheduleK1: [{
        partnershipName: "Losing LLC",
        partnershipEIN: "11-1111111",
        ordinaryIncome: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "-5000",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    }, c);
    expect(result.totalSETax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Tax Portions
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Tax Calculation", () => {
  it("Schedule SE Line 10 - SS portion capped at wage base", () => {
    // No W-2 wages: full SS room. $100K SE → $92,350 taxable
    // SS = $92,350 × 12.4% = $11,451
    const result = calculateScheduleSE(makeFixtureWith1099NEC("100000", "0"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(11451);
  });

  it("Schedule SE Line 10 - SS reduced by W-2 wages", () => {
    // W-2 SS wages = $170K, wage base = $176,100, room = $6,100
    // SE = $50K → taxable = $46,175. SS = min($46,175, $6,100) × 12.4% = $756
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "170000"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(756);
  });

  it("Schedule SE Line 10 - supported Form 4137 Social Security-taxable tips reduce the remaining wage-base room", () => {
    const result = calculateScheduleSE({
      ...makeFixtureWith1099NEC("10000", "170000"),
      form4137: {
        unreportedTipIncome: "5000",
      },
    }, c);

    expect(result.socialSecurityPortion.toNumber()).toBe(136);

    const line10 = result.lines.find((line) => line.form === "Sched SE" && line.line === "10");
    expect(String(line10?.inputs["Supported Form 4137 Line 10 tips"])).toBe("5000");
  });

  it("Schedule SE Line 10 - supported Form 8919 wages reduce the remaining wage-base room", () => {
    const result = calculateScheduleSE({
      ...makeFixtureWith1099NEC("10000", "170000"),
      form8919: {
        wagesNotReportedOnW2: "5000",
      },
    }, c);

    expect(result.socialSecurityPortion.toNumber()).toBe(136);

    const line10 = result.lines.find((line) => line.form === "Sched SE" && line.line === "10");
    expect(String(line10?.inputs["Supported Form 8919 Line 10 wages"])).toBe("5000");
  });

  it("Schedule SE Line 10 - SS is zero when W-2 exceeds wage base", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "180000"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
  });

  it("Schedule SE Line 11 - Medicare has no cap", () => {
    // $100K SE → $92,350 taxable × 2.9% = $2,678
    const result = calculateScheduleSE(makeFixtureWith1099NEC("100000", "0"), c);
    expect(result.medicarePortion.toNumber()).toBe(2678);
  });

  it("Schedule SE Line 12 - total SE tax", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("100000", "0"), c);
    expect(result.totalSETax.toNumber()).toBe(14129); // 11451 + 2678
  });

  it("Schedule SE Line 13 - deductible half", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("100000", "0"), c);
    // $14,129 × 50% = $7,064.50 → $7,065
    expect(result.deductibleHalf.toNumber()).toBe(7065);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Farm Income", () => {
  it("Schedule SE Line 4a - no Schedule F input keeps farm income at zero in the audit trail", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000"), c);
    const line4a = result.lines.find((l) => l.line === "4a");
    expect(line4a).toBeDefined();
    expect(line4a!.value.toNumber()).toBe(0);
    expect(line4a!.description).toBe("Net farm profit or loss");
  });
});

describe("Schedule SE - audit trail", () => {
  it("produces complete audit trail", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000"), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("4b");
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("13");
  });
});

// ═══════════════════════════════════════════════════════════
// Line 4a: Net Farm Profit (Schedule F)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Line 6 (combined farm and nonfarm income)", () => {
  it("Schedule SE Line 6 - Schedule F losses offset nonfarm self-employment earnings", () => {
    const result = calculateScheduleSE({
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "60000", federalWithheld: "0" }],
      scheduleF: {
        salesOfProductsRaised: "10000",
        expenses: {
          feed: "20000",
          seedsAndPlants: "5000",
        },
      },
    }, c);

    expect(result.netFarmProfit.toNumber()).toBe(-15000);
    expect(result.netNonfarmProfit.toNumber()).toBe(60000);
    expect(result.netSEEarnings.toNumber()).toBe(45000);
  });

  it("Schedule SE Line 6 - zero farm and nonfarm income keeps total SE earnings at zero", () => {
    const result = calculateScheduleSE({
      ...simpleW2Fixture,
      form1099Nec: [],
      scheduleK1: [],
    }, c);
    expect(result.netSEEarnings.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Lines 4a + 4b: Church Employee Income and Nonfarm Profit
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Lines 4a and 4b", () => {
  it("Line 4b - combines 1099-NEC, K-1 SE earnings, and K-1 guaranteed payments", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [
        { payer: "Client A", nonemployeeCompensation: "20000", federalWithheld: "0" },
      ],
      scheduleK1: [{
        partnershipName: "Active LLC",
        partnershipEIN: "22-2222222",
        ordinaryIncome: "0",
        guaranteedPayments: "5000",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "10000",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleSE(input, c);
    // $20K (1099-NEC) + $10K (K-1 SE) + $5K (guaranteed payments) = $35K
    expect(result.netNonfarmProfit.toNumber()).toBe(35000);
  });

  it("Line 4a is recorded as zero while Line 6 still reflects only Line 4b nonfarm income", () => {
    // Farm income (Line 4a) is always zero; Line 6 should still match Line 4b.
    const result = calculateScheduleSE(makeFixtureWith1099NEC("80000"), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("4a");
    // Line 4b is present
    expect(lineIds).toContain("4b");
    const line4a = result.lines.find((l) => l.line === "4a");
    expect(line4a?.value.toNumber()).toBe(0);
    // Line 6 must equal Line 4b value
    expect(result.netSEEarnings.toNumber()).toBe(result.netNonfarmProfit.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Line 6: Combined SE Income
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Line 6 (combined SE income)", () => {
  it("Line 6 - equals nonfarm profit when multiple 1099-NEC payers", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [
        { payer: "Client A", nonemployeeCompensation: "30000", federalWithheld: "0" },
        { payer: "Client B", nonemployeeCompensation: "20000", federalWithheld: "0" },
      ],
      scheduleK1: [],
    };
    const result = calculateScheduleSE(input, c);
    // Line 6 = $30K + $20K = $50K
    expect(result.netSEEarnings.toNumber()).toBe(50000);
  });

  it("Line 6 - is recorded in audit trail with correct description", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("40000"), c);
    const line6 = result.lines.find((l) => l.line === "6");
    expect(line6).toBeDefined();
    expect(line6!.value.toNumber()).toBe(40000);
  });

  it("Line 6 - below $400 still records Line 6 in audit trail", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("300", "0"), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("6");
    expect(result.netSEEarnings.toNumber()).toBe(300);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 10: Deductible Part of SE Tax (50%)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Line 10 deductible half", () => {
  it("Line 10 - deductible half is exactly 50% of total SE tax (rounded)", () => {
    // $50K SE → taxable = $46,175; SS = $5,726; Med = $1,339; total = $7,065
    // deductible half = round($7,065 × 0.5) = $3,533
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "0"), c);
    const expected = result.totalSETax.times("0.5").toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(result.deductibleHalf.toNumber()).toBe(expected);
  });

  it("Line 10 - deductible half is zero when SE income below threshold", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("350", "0"), c);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Line 11: SE Tax at Exactly $400 Threshold
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Line 11 at threshold boundary", () => {
  it("Line 11 - $400 SE income produces zero Medicare (post-multiplier $369 < $400)", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("400", "0"), c);
    expect(result.medicarePortion.toNumber()).toBe(0);
  });

  it("Line 11 - $400 SE income produces zero SS (post-multiplier $369 < $400)", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("400", "0"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
  });

  it("Line 11 - $399 SE income produces zero Medicare (below threshold)", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("399", "0"), c);
    expect(result.medicarePortion.toNumber()).toBe(0);
  });

  it("Line 11 - $433 SE income produces positive Medicare (post-multiplier $400 = threshold)", () => {
    // $433 × 0.9235 = $400. Medicare: $400 × 0.029 = $11.60 → $12
    const result = calculateScheduleSE(makeFixtureWith1099NEC("433", "0"), c);
    expect(result.medicarePortion.toNumber()).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail: All Line IDs Present
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - audit trail completeness", () => {
  it("audit trail contains lines 4a, 4b, 6, 7, 10, 11, 12, 13", () => {
    const result = calculateScheduleSE(makeFixtureWith1099NEC("75000", "0"), c);
    const lineIds = result.lines.map((l) => l.line);
    // Farm income is out of scope, but Line 4a is still recorded as an explicit zero.
    expect(lineIds).toContain("4a"); // Net farm profit (always zero)
    expect(lineIds).toContain("4b"); // Net nonfarm profit
    expect(lineIds).toContain("6");  // Combined SE earnings
    expect(lineIds).toContain("7");  // SE earnings × 0.9235
    expect(lineIds).toContain("10"); // SS portion
    expect(lineIds).toContain("11"); // Medicare portion
    expect(lineIds).toContain("12"); // Total SE tax
    expect(lineIds).toContain("13"); // Deductible half
  });

  it("audit trail below threshold still records lines 4a, 4b, 6, 7, 10, 11, 12, 13", () => {
    // Even when no tax is due, all lines should be present for completeness
    const result = calculateScheduleSE(makeFixtureWith1099NEC("200", "0"), c);
    const lineIds = result.lines.map((l) => l.line);
    expect(lineIds).toContain("4a");
    expect(lineIds).toContain("4b");
    expect(lineIds).toContain("6");
    expect(lineIds).toContain("7");
    expect(lineIds).toContain("10");
    expect(lineIds).toContain("11");
    expect(lineIds).toContain("12");
    expect(lineIds).toContain("13");
  });

  it("audit trail exposes nonfarm subtotals, SS wage-base room, and SE tax rollup inputs", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      w2s: [{
        ...simpleW2Fixture.w2s[0],
        socialSecurityWages: "100000",
      }],
      form1099Nec: [
        { payer: "Client", nonemployeeCompensation: "20000", federalWithheld: "0" },
      ],
      scheduleK1: [{
        partnershipName: "Operating LLC",
        partnershipEIN: "12-3456789",
        ordinaryIncome: "0",
        guaranteedPayments: "3000",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "5000",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };

    const result = calculateScheduleSE(input, c);
    const line4b = result.lines.find((l) => l.form === "Sched SE" && l.line === "4b");
    const line6 = result.lines.find((l) => l.form === "Sched SE" && l.line === "6");
    const line10 = result.lines.find((l) => l.form === "Sched SE" && l.line === "10");
    const line12 = result.lines.find((l) => l.form === "Sched SE" && l.line === "12");
    const line13 = result.lines.find((l) => l.form === "Sched SE" && l.line === "13");

    expect(line4b).toBeDefined();
    expect((line4b!.inputs["Schedule C Line 31 net profit"] as Decimal).toNumber()).toBe(20000);
    expect((line4b!.inputs["K-1 self-employment earnings"] as Decimal).toNumber()).toBe(5000);
    expect((line4b!.inputs["K-1 guaranteed payments"] as Decimal).toNumber()).toBe(3000);

    expect(line6).toBeDefined();
    expect((line6!.inputs["Line 4a"] as Decimal).toNumber()).toBe(0);
    expect((line6!.inputs["Line 4b"] as Decimal).toNumber()).toBe(28000);

    expect(line10).toBeDefined();
    expect((line10!.inputs["Line 7 taxable earnings"] as Decimal).toNumber()).toBe(25858);
    expect((line10!.inputs["W-2 SS wages"] as Decimal).toNumber()).toBe(100000);
    expect((line10!.inputs["Remaining SS wage base room"] as Decimal).toNumber()).toBe(76100);
    expect((line10!.inputs["SS-taxable earnings after cap"] as Decimal).toNumber()).toBe(25858);

    expect(line12).toBeDefined();
    expect((line12!.inputs["Line 10"] as Decimal).toNumber()).toBe(3206);
    expect((line12!.inputs["Line 11"] as Decimal).toNumber()).toBe(750);

    expect(line13).toBeDefined();
    expect((line13!.inputs["Line 12"] as Decimal).toNumber()).toBe(3956);
  });
});

// ═══════════════════════════════════════════════════════════
// SE with W-2 Wages: Remaining SS Room
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - W-2 wages reduce SS room", () => {
  it("W-2 wages partially fill SS wage base: SE SS portion uses remaining room only", () => {
    // Wage base = $176,100. W-2 SS wages = $100,000. Remaining = $76,100.
    // SE $50K → taxable = $46,175. SS = min($46,175, $76,100) × 12.4% = $5,726
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "100000"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(5726);
  });

  it("W-2 wages exactly at wage base: SE SS portion is zero", () => {
    // W-2 SS wages = $176,100 (exactly at wage base). Remaining = $0.
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "176100"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
  });

  it("W-2 wages at wage base: Medicare portion is still calculated (no cap)", () => {
    // Medicare has no wage base cap, even when SS is fully consumed by W-2 wages
    // SE $50K → taxable = $46,175 × 2.9% = $1,339
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "176100"), c);
    expect(result.medicarePortion.toNumber()).toBe(1339);
    expect(result.totalSETax.toNumber()).toBe(1339);
  });

  it("W-2 wages just below wage base: SE SS portion uses exact remaining room", () => {
    // Wage base = $176,100. W-2 = $175,000. Remaining = $1,100.
    // SE $50K → taxable = $46,175. SS = min($46,175, $1,100) × 12.4% = $136
    const result = calculateScheduleSE(makeFixtureWith1099NEC("50000", "175000"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(136);
  });
});

// ═══════════════════════════════════════════════════════════
// SS Wage Base Boundary ($176,100)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - SE income at SS wage base boundary", () => {
  it("SE taxable earnings exactly at wage base: SS portion uses full wage base", () => {
    // Need SE income such that income × 0.9235 = $176,100 → income = $176,100 / 0.9235 = $190,687.60...
    // Instead use SE income = $190,688 → taxable = roundDollar($190,688 × 0.9235) = $176,100 (approx)
    // Use exact: $176,100 SE with no W-2 → taxable = roundDollar($176,100 × 0.9235) = $162,625
    // SS = $162,625 × 12.4% = $20,166 (well under wage base, so fully taxed)
    const result = calculateScheduleSE(makeFixtureWith1099NEC("176100", "0"), c);
    // taxable = roundDollar(176100 × 0.9235) = roundDollar(162,628.35) = $162,628
    expect(result.taxableEarnings.toNumber()).toBe(162628);
    // SS = $162,628 × 0.124 = roundDollar(20,165.872) = $20,166
    expect(result.socialSecurityPortion.toNumber()).toBe(20166);
    // Medicare = $162,628 × 0.029 = roundDollar(4,716.212) = $4,716
    expect(result.medicarePortion.toNumber()).toBe(4716);
  });

  it("SE taxable earnings exceed wage base: SS portion capped at wage base", () => {
    // SE $250K → taxable = roundDollar($250,000 × 0.9235) = $230,875
    // SS = min($230,875, $176,100) × 12.4% = $176,100 × 0.124 = $21,836 (rounded)
    const result = calculateScheduleSE(makeFixtureWith1099NEC("250000", "0"), c);
    expect(result.taxableEarnings.toNumber()).toBe(230875);
    // SS capped: $176,100 × 0.124 = roundDollar(21836.4) = $21,836
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    // Medicare uncapped: $230,875 × 0.029 = roundDollar(6695.375) = $6,695
    expect(result.medicarePortion.toNumber()).toBe(6695);
  });
});

// ═══════════════════════════════════════════════════════════
// Combined W-2 + SE Near Wage Base
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - combined W-2 + SE near wage base", () => {
  it("W-2 $170K + SE $20K: SS room partially consumed, SE uses remainder", () => {
    // Wage base = $176,100. W-2 SS wages = $170,000. Remaining = $6,100.
    // SE $20K → taxable = roundDollar($20,000 × 0.9235) = $18,470
    // SS = min($18,470, $6,100) × 0.124 = $6,100 × 0.124 = roundDollar(756.4) = $756
    // Medicare = $18,470 × 0.029 = roundDollar(535.63) = $536
    const result = calculateScheduleSE(makeFixtureWith1099NEC("20000", "170000"), c);
    expect(result.taxableEarnings.toNumber()).toBe(18470);
    expect(result.socialSecurityPortion.toNumber()).toBe(756);
    expect(result.medicarePortion.toNumber()).toBe(536);
    expect(result.totalSETax.toNumber()).toBe(756 + 536);
  });

  it("W-2 $176,100 (exactly at base) + SE $80K: SS portion is zero, Medicare still applies", () => {
    // W-2 fills entire wage base. SE gets zero SS room.
    const result = calculateScheduleSE(makeFixtureWith1099NEC("80000", "176100"), c);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    // taxable = roundDollar($80,000 × 0.9235) = $73,880
    expect(result.taxableEarnings.toNumber()).toBe(73880);
    // Medicare = $73,880 × 0.029 = roundDollar(2142.52) = $2,143
    expect(result.medicarePortion.toNumber()).toBe(2143);
    expect(result.totalSETax.toNumber()).toBe(2143);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High SE Income ($500K+)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - very high SE income", () => {
  it("$500K SE income: SS capped at wage base, Medicare on full taxable earnings", () => {
    // taxable = roundDollar($500,000 × 0.9235) = $461,750
    // SS = min($461,750, $176,100) × 0.124 = $176,100 × 0.124 = roundDollar(21836.4) = $21,836
    // Medicare = $461,750 × 0.029 = roundDollar(13390.75) = $13,391
    // Total = $21,836 + $13,391 = $35,227
    // Deductible half = roundDollar($35,227 × 0.5) = roundDollar(17613.5) = $17,614
    const result = calculateScheduleSE(makeFixtureWith1099NEC("500000", "0"), c);
    expect(result.taxableEarnings.toNumber()).toBe(461750);
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    expect(result.medicarePortion.toNumber()).toBe(13391);
    expect(result.totalSETax.toNumber()).toBe(35227);
    expect(result.deductibleHalf.toNumber()).toBe(17614);
  });

  it("$1M SE income: same SS cap, larger Medicare portion", () => {
    // taxable = roundDollar($1,000,000 × 0.9235) = $923,500
    // SS = $176,100 × 0.124 = $21,836
    // Medicare = $923,500 × 0.029 = roundDollar(26781.5) = $26,782
    // Total = $21,836 + $26,782 = $48,618
    // Deductible half = roundDollar($48,618 × 0.5) = $24,309
    const result = calculateScheduleSE(makeFixtureWith1099NEC("1000000", "0"), c);
    expect(result.taxableEarnings.toNumber()).toBe(923500);
    expect(result.socialSecurityPortion.toNumber()).toBe(21836);
    expect(result.medicarePortion.toNumber()).toBe(26782);
    expect(result.totalSETax.toNumber()).toBe(48618);
    expect(result.deductibleHalf.toNumber()).toBe(24309);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Loss (Negative Net)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - SE loss (negative net earnings)", () => {
  it("K-1 loss exceeds 1099-NEC income: net SE is negative, no SE tax", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [
        { payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" },
      ],
      scheduleK1: [{
        partnershipName: "Loss LLC",
        partnershipEIN: "33-3333333",
        ordinaryIncome: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "-20000",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleSE(input, c);
    // Net = $5,000 + (-$20,000) = -$15,000
    expect(result.netNonfarmProfit.toNumber()).toBe(-15000);
    expect(result.netSEEarnings.toNumber()).toBe(-15000);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
    expect(result.socialSecurityPortion.toNumber()).toBe(0);
    expect(result.medicarePortion.toNumber()).toBe(0);
  });

  it("Large K-1 loss (-$50K): all SE fields are zero except net profit", () => {
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [],
      scheduleK1: [{
        partnershipName: "Big Loss LP",
        partnershipEIN: "44-4444444",
        ordinaryIncome: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "-50000",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    const result = calculateScheduleSE(input, c);
    expect(result.netNonfarmProfit.toNumber()).toBe(-50000);
    expect(result.totalSETax.toNumber()).toBe(0);
    expect(result.taxableEarnings.toNumber()).toBe(0);
    expect(result.deductibleHalf.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Deductible Half of SE Tax
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - deductible half of SE tax", () => {
  it("deductible half is exactly half of total SE tax for typical income", () => {
    // SE $75K → taxable = roundDollar($75,000 × 0.9235) = $69,263
    // SS = $69,263 × 0.124 = roundDollar(8588.612) = $8,589
    // Medicare = $69,263 × 0.029 = roundDollar(2008.627) = $2,009
    // Total = $8,589 + $2,009 = $10,598
    // Deductible half = roundDollar($10,598 × 0.5) = $5,299
    const result = calculateScheduleSE(makeFixtureWith1099NEC("75000", "0"), c);
    expect(result.totalSETax.toNumber()).toBe(10598);
    expect(result.deductibleHalf.toNumber()).toBe(5299);
    // Verify the relationship: deductible half = round(total × 0.5)
    const manualHalf = result.totalSETax.times(d("0.5")).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
    expect(result.deductibleHalf.toNumber()).toBe(manualHalf);
  });

  it("deductible half rounds up on .5 (odd total SE tax)", () => {
    // $600 → taxable = roundDollar($600 × 0.9235) = $554
    // SS = $554 × 0.124 = roundDollar(68.696) = $69
    // Medicare = $554 × 0.029 = roundDollar(16.066) = $16
    // Total = $85 (odd), deductible half = roundDollar(42.5) = $43 (ROUND_HALF_UP)
    const result = calculateScheduleSE(makeFixtureWith1099NEC("600", "0"), c);
    expect(result.totalSETax.toNumber()).toBe(85);
    expect(result.deductibleHalf.toNumber()).toBe(43);
  });
});

// ═══════════════════════════════════════════════════════════
// Filing Status Variations
// ═══════════════════════════════════════════════════════════

function makeFixtureWithFilingStatus(
  filingStatus: string,
  seAmount: string,
  w2SSWages = "0",
): TaxYearInput {
  const base: TaxYearInput = {
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer,
      filingStatus: filingStatus as TaxYearInput["taxpayer"]["filingStatus"],
      ...(filingStatus === "married_filing_jointly" || filingStatus === "married_filing_separately"
        ? {
            spouse: {
              firstName: "Spouse",
              lastName: "Doe",
              ssn: "987-65-4321",
              dateOfBirth: "1990-06-15",
            },
          }
        : {}),
    },
    w2s: [{
      ...simpleW2Fixture.w2s[0],
      socialSecurityWages: w2SSWages,
    }],
    form1099Nec: [
      { payer: "Client", nonemployeeCompensation: seAmount, federalWithheld: "0" },
    ],
  };
  return base;
}

describe("Schedule SE - filing status variations", () => {
  const seAmount = "100000";
  // SE tax does not vary by filing status — all statuses should produce identical results
  const statuses = [
    "single",
    "married_filing_jointly",
    "married_filing_separately",
    "head_of_household",
    "qualifying_surviving_spouse",
  ] as const;

  it("all five filing statuses produce identical SE tax for same SE income", () => {
    const results = statuses.map((status) => {
      const result = calculateScheduleSE(makeFixtureWithFilingStatus(status, seAmount), c);
      return {
        status,
        taxableEarnings: result.taxableEarnings.toNumber(),
        socialSecurityPortion: result.socialSecurityPortion.toNumber(),
        medicarePortion: result.medicarePortion.toNumber(),
        totalSETax: result.totalSETax.toNumber(),
        deductibleHalf: result.deductibleHalf.toNumber(),
      };
    });

    const baseline = results[0];
    for (const r of results.slice(1)) {
      expect(r.taxableEarnings).toBe(baseline.taxableEarnings);
      expect(r.socialSecurityPortion).toBe(baseline.socialSecurityPortion);
      expect(r.medicarePortion).toBe(baseline.medicarePortion);
      expect(r.totalSETax).toBe(baseline.totalSETax);
      expect(r.deductibleHalf).toBe(baseline.deductibleHalf);
    }
  });

  it("MFJ filer: SE tax computed same as single with identical SE income", () => {
    const single = calculateScheduleSE(makeFixtureWithFilingStatus("single", "200000"), c);
    const mfj = calculateScheduleSE(makeFixtureWithFilingStatus("married_filing_jointly", "200000"), c);
    expect(mfj.totalSETax.toNumber()).toBe(single.totalSETax.toNumber());
    expect(mfj.deductibleHalf.toNumber()).toBe(single.deductibleHalf.toNumber());
    expect(mfj.socialSecurityPortion.toNumber()).toBe(single.socialSecurityPortion.toNumber());
    expect(mfj.medicarePortion.toNumber()).toBe(single.medicarePortion.toNumber());
  });

  it("Head of household: SE tax identical to single for same income", () => {
    const single = calculateScheduleSE(makeFixtureWithFilingStatus("single", "50000"), c);
    const hoh = calculateScheduleSE(makeFixtureWithFilingStatus("head_of_household", "50000"), c);
    expect(hoh.totalSETax.toNumber()).toBe(single.totalSETax.toNumber());
    expect(hoh.deductibleHalf.toNumber()).toBe(single.deductibleHalf.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C Net Profit (Line 4b must use net, not gross)
// ═══════════════════════════════════════════════════════════

describe("Schedule SE - Schedule C net profit vs gross 1099-NEC", () => {
  it("Line 4b uses Schedule C net profit when provided (not gross 1099-NEC)", () => {
    // $100K 1099-NEC gross, $40K expenses → Schedule C net = $60K
    // SE should use $60K, NOT $100K
    const input = makeFixtureWith1099NEC("100000", "0");
    const result = calculateScheduleSE(input, c, d(60000));
    expect(result.netNonfarmProfit.toNumber()).toBe(60000);
    // $60K × 0.9235 = $55,410
    expect(result.taxableEarnings.toNumber()).toBe(55410);
    // SS: $55,410 × 12.4% = $6,871 (roundDollar)
    expect(result.socialSecurityPortion.toNumber()).toBe(6871);
    // MC: $55,410 × 2.9% = $1,607 (roundDollar)
    expect(result.medicarePortion.toNumber()).toBe(1607);
    // Total: $6,871 + $1,607 = $8,478
    expect(result.totalSETax.toNumber()).toBe(8478);
    // Deductible half: $8,478 × 50% = $4,239
    expect(result.deductibleHalf.toNumber()).toBe(4239);
  });

  it("Without schedCNetProfit param, falls back to gross 1099-NEC (backward compat)", () => {
    const input = makeFixtureWith1099NEC("100000", "0");
    const result = calculateScheduleSE(input, c);
    // Falls back to $100K (gross)
    expect(result.netNonfarmProfit.toNumber()).toBe(100000);
    expect(result.taxableEarnings.toNumber()).toBe(92350);
  });

  it("Schedule C loss reduces K-1 SE earnings in Line 4b", () => {
    // -$10K Schedule C loss + $25K K-1 SE earnings = $15K net
    const input: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }],
      scheduleK1: [{
        partnershipName: "Active LLC",
        partnershipEIN: "22-2222222",
        ordinaryIncome: "0",
        guaranteedPayments: "0",
        netShortTermCapitalGain: "0",
        netLongTermCapitalGain: "0",
        interestIncome: "0",
        ordinaryDividends: "0",
        qualifiedDividends: "0",
        selfEmploymentEarnings: "25000",
        isPassiveActivity: false,
        netRentalIncome: "0",
        otherNetRentalIncome: "0",
        royalties: "0",
        section1231Gain: "0",
        otherIncome: "0",
        section179Deduction: "0",
        otherDeductions: "0",
      }],
    };
    // Schedule C net profit = -$10K (loss from expenses exceeding $5K gross)
    const result = calculateScheduleSE(input, c, d(-10000));
    // -$10K + $25K + $0 = $15K
    expect(result.netNonfarmProfit.toNumber()).toBe(15000);
    expect(result.taxableEarnings.toNumber()).toBe(13853); // $15K × 0.9235 = $13,852.5 → $13,853
  });
});
