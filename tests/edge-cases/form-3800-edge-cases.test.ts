/**
 * Edge case tests for Form 3800 — General Business Credit
 * Spec: spec/federal/form-3800.yaml
 *
 * Covers: $25,000/$12,500 threshold boundaries, TMT floor interactions,
 * credit limitation precision, personal credit absorption, AMT interaction,
 * carryforward mechanics, filing status variations, and zero/extreme values.
 */

import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { calculateForm3800 } from "@/engine/forms/form-3800.js";
import type { Form3800Input } from "@/engine/forms/form-3800.js";
import type { ScheduleK1 } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

function makeK1(overrides: Partial<ScheduleK1> = {}): ScheduleK1 {
  return {
    partnershipName: "Test Partnership",
    partnershipEIN: "12-3456789",
    ordinaryIncome: "0",
    netRentalIncome: "0",
    otherNetRentalIncome: "0",
    guaranteedPayments: "0",
    interestIncome: "0",
    ordinaryDividends: "0",
    qualifiedDividends: "0",
    royalties: "0",
    netShortTermCapitalGain: "0",
    netLongTermCapitalGain: "0",
    unrecapturedSection1250Gain: "0",
    collectiblesGain: "0",
    section1231Gain: "0",
    otherIncome: "0",
    section179Deduction: "0",
    otherDeductions: "0",
    charitableCash: "0",
    charitableCapitalGain30: "0",
    charitableCapitalGain20: "0",
    excessBusinessInterest: "0",
    selfEmploymentEarnings: "0",
    foreignTaxPaid: "0",
    amtDepreciationAdjustment: "0",
    amtAdjustedGainOrLoss: "0",
    amtDepletion: "0",
    amtOtherItems: "0",
    taxExemptInterest: "0",
    otherTaxExemptIncome: "0",
    nondeductibleExpenses: "0",
    distributions: "0",
    section199AQBI: "0",
    section199AW2Wages: "0",
    section199AUBIA: "0",
    section199AIsSST: false,
    section199AQualifiedReitDividends: "0",
    section199AQualifiedPTPIncome: "0",
    section199APTPW2Wages: "0",
    section199APTPUBIA: "0",
    section199APTPIsSST: false,
    lowIncomeHousingCredit42j5: "0",
    lowIncomeHousingCreditOther: "0",
    qualifiedRehabilitationExpenditures: "0",
    otherRentalRealEstateCredits: "0",
    otherRentalCredits: "0",
    otherCredits: "0",
    isPassiveActivity: false,
    isForeignPartnership: false,
    ...overrides,
  } as ScheduleK1;
}

function makeInput(overrides: Partial<Form3800Input> = {}): Form3800Input {
  return {
    filingStatus: "single",
    scheduleK1s: [],
    regularTax: d(80000),
    amt: d(0),
    tentativeMinimumTax: d(0),
    childTaxCredit: d(0),
    otherNonrefundableCredits: d(0),
    ...overrides,
  };
}

// ── $25,000 Threshold Boundary (IRC §38(c)(3)(B)) ────────────────────

describe("Form 3800 - $25,000 net regular tax threshold boundary", () => {
  it("Form 3800 Line 16 - net regular tax exactly $25,000: 25% excess is $0", () => {
    // Net regular tax = regular tax - personal credits = $25,000
    // 25% of max(0, $25,000 - $25,000) = $0
    const result = calculateForm3800(makeInput({
      regularTax: d(25000),
      currentYearCredits: d(5000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(25000);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0);
  });

  it("Form 3800 Line 16 - net regular tax $25,001: 25% excess is $0.25", () => {
    // 25% of max(0, $25,001 - $25,000) = 25% of $1 = $0.25
    const result = calculateForm3800(makeInput({
      regularTax: d(25001),
      currentYearCredits: d(5000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(25001);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0.25);
  });

  it("Form 3800 Line 16 - net regular tax $24,999: 25% excess is $0", () => {
    // Below threshold: 25% of max(0, $24,999 - $25,000) = $0
    const result = calculateForm3800(makeInput({
      regularTax: d(24999),
      currentYearCredits: d(5000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(24999);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0);
  });
});

// ── MFS $12,500 Threshold (IRC §38(c)(3)(B)) ────────────────────────

describe("Form 3800 - MFS $12,500 threshold boundary", () => {
  it("Form 3800 Line 16 - MFS net regular tax exactly $12,500: 25% excess is $0", () => {
    const result = calculateForm3800(makeInput({
      filingStatus: "married_filing_separately",
      regularTax: d(12500),
      currentYearCredits: d(3000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(12500);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0);
  });

  it("Form 3800 Line 16 - MFS net regular tax $12,501: 25% excess is $0.25", () => {
    const result = calculateForm3800(makeInput({
      filingStatus: "married_filing_separately",
      regularTax: d(12501),
      currentYearCredits: d(3000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(12501);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0.25);
  });

  it("Form 3800 Line 16 - MFS net regular tax $12,499: 25% excess is $0", () => {
    const result = calculateForm3800(makeInput({
      filingStatus: "married_filing_separately",
      regularTax: d(12499),
      currentYearCredits: d(3000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(12499);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0);
  });
});

// ── TMT Floor vs 25% Threshold Crossover ─────────────────────────────

describe("Form 3800 - TMT floor vs 25% threshold crossover (Line 18)", () => {
  it("Form 3800 Line 18 - TMT exceeds 25% excess: TMT becomes the floor", () => {
    // Net regular tax = $80,000 → 25% excess = 0.25 × ($80,000 - $25,000) = $13,750
    // TMT = $20,000 > $13,750 → TMT wins
    const result = calculateForm3800(makeInput({
      regularTax: d(80000),
      tentativeMinimumTax: d(20000),
      currentYearCredits: d(50000),
    }));

    expect(result.twentyFivePercentExcess.toNumber()).toBe(13750);
    expect(result.greaterOfThresholdOrTMT.toNumber()).toBe(20000);
  });

  it("Form 3800 Line 18 - 25% excess exceeds TMT: 25% excess becomes the floor", () => {
    // Net regular tax = $120,000 → 25% excess = 0.25 × ($120,000 - $25,000) = $23,750
    // TMT = $10,000 < $23,750 → 25% excess wins
    const result = calculateForm3800(makeInput({
      regularTax: d(120000),
      tentativeMinimumTax: d(10000),
      currentYearCredits: d(50000),
    }));

    expect(result.twentyFivePercentExcess.toNumber()).toBe(23750);
    expect(result.greaterOfThresholdOrTMT.toNumber()).toBe(23750);
  });

  it("Form 3800 Line 18 - TMT exactly equals 25% excess: same result either way", () => {
    // Net regular tax = $80,000 → 25% excess = $13,750
    // TMT = $13,750 → tie
    const result = calculateForm3800(makeInput({
      regularTax: d(80000),
      tentativeMinimumTax: d(13750),
      currentYearCredits: d(50000),
    }));

    expect(result.twentyFivePercentExcess.toNumber()).toBe(13750);
    expect(result.greaterOfThresholdOrTMT.toNumber()).toBe(13750);
  });
});

// ── Credit Limitation at Exact Boundaries ────────────────────────────

describe("Form 3800 - credit limitation exactly at boundary (Line 20/21)", () => {
  it("Form 3800 Line 20 - net income tax exactly equals floor: limitation is $0", () => {
    // Regular tax $50,000, no AMT, no personal credits
    // Net income tax = $50,000
    // 25% excess = 0.25 × ($50,000 - $25,000) = $6,250
    // TMT = $50,000 → max($6,250, $50,000) = $50,000
    // Limitation = max(0, $50,000 - $50,000) = $0
    const result = calculateForm3800(makeInput({
      regularTax: d(50000),
      tentativeMinimumTax: d(50000),
      currentYearCredits: d(10000),
    }));

    expect(result.netIncomeTax.toNumber()).toBe(50000);
    expect(result.creditLimitation.toNumber()).toBe(0);
    expect(result.allowableCredit.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(10000);
  });

  it("Form 3800 Line 20 - net income tax exceeds floor by $1: limitation is $1", () => {
    // Regular tax $50,001, TMT = $50,000
    // Net income tax = $50,001
    // Limitation = max(0, $50,001 - $50,000) = $1
    const result = calculateForm3800(makeInput({
      regularTax: d(50001),
      tentativeMinimumTax: d(50000),
      currentYearCredits: d(10000),
    }));

    expect(result.creditLimitation.toNumber()).toBe(1);
    expect(result.allowableCredit.toNumber()).toBe(1);
    expect(result.carryforwardToNextYear.toNumber()).toBe(9999);
  });

  it("Form 3800 Line 21 - total credit exactly equals limitation: no carryforward", () => {
    // Regular tax $80,000, TMT = $0
    // Net income tax = $80,000
    // 25% excess = 0.25 × ($80,000 - $25,000) = $13,750
    // Limitation = max(0, $80,000 - $13,750) = $66,250
    // Credit exactly $66,250
    const result = calculateForm3800(makeInput({
      regularTax: d(80000),
      tentativeMinimumTax: d(0),
      currentYearCredits: d(66250),
    }));

    expect(result.creditLimitation.toNumber()).toBe(66250);
    expect(result.allowableCredit.toNumber()).toBe(66250);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });
});

// ── Personal Credits Absorbing All Tax Liability ─────────────────────

describe("Form 3800 - personal credits absorb all regular tax", () => {
  it("Form 3800 Line 15 - personal credits exceed regular tax: net regular tax is $0", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(5000),
      childTaxCredit: d(6000),
      currentYearCredits: d(3000),
    }));

    expect(result.personalCredits.toNumber()).toBe(6000);
    expect(result.netRegularTax.toNumber()).toBe(0);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(0);
  });

  it("Form 3800 - personal credits equal regular tax: zero limitation when no AMT", () => {
    // Regular tax $10,000, CTC $10,000 → net regular tax = $0
    // Net income tax = max(0, $10,000 + $0 - $10,000) = $0
    // Limitation = max(0, $0 - $0) = $0
    const result = calculateForm3800(makeInput({
      regularTax: d(10000),
      childTaxCredit: d(10000),
      currentYearCredits: d(5000),
    }));

    expect(result.netRegularTax.toNumber()).toBe(0);
    expect(result.netIncomeTax.toNumber()).toBe(0);
    expect(result.creditLimitation.toNumber()).toBe(0);
    expect(result.allowableCredit.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(5000);
  });

  it("Form 3800 - personal credits absorb regular tax but AMT creates room", () => {
    // Regular tax $10,000, CTC $10,000, AMT $5,000
    // Net income tax = max(0, $10,000 + $5,000 - $10,000) = $5,000
    // Net regular tax = $0 → 25% excess = $0, TMT floor = $0
    // Limitation = max(0, $5,000 - $0) = $5,000
    const result = calculateForm3800(makeInput({
      regularTax: d(10000),
      childTaxCredit: d(10000),
      amt: d(5000),
      tentativeMinimumTax: d(0),
      currentYearCredits: d(3000),
    }));

    expect(result.netIncomeTax.toNumber()).toBe(5000);
    expect(result.creditLimitation.toNumber()).toBe(5000);
    expect(result.allowableCredit.toNumber()).toBe(3000);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });
});

// ── AMT Interaction with Net Income Tax ──────────────────────────────

describe("Form 3800 - AMT increases net income tax (Line 19)", () => {
  it("Form 3800 Line 19 - large AMT with zero TMT expands credit room significantly", () => {
    // Regular tax $50,000, AMT $30,000
    // Net income tax = max(0, $50,000 + $30,000 - $0) = $80,000
    // Net regular tax = $50,000 → 25% excess = $6,250
    // TMT = $0 → max($6,250, $0) = $6,250
    // Limitation = $80,000 - $6,250 = $73,750
    const result = calculateForm3800(makeInput({
      regularTax: d(50000),
      amt: d(30000),
      tentativeMinimumTax: d(0),
      currentYearCredits: d(40000),
    }));

    expect(result.netIncomeTax.toNumber()).toBe(80000);
    expect(result.creditLimitation.toNumber()).toBe(73750);
    expect(result.allowableCredit.toNumber()).toBe(40000);
  });

  it("Form 3800 Line 19 - AMT exactly offsets TMT floor: same limitation as without AMT", () => {
    // Regular tax $50,000, AMT $0, TMT $10,000
    // Net income tax = $50,000, floor = max($6,250, $10,000) = $10,000
    // Limitation = $50,000 - $10,000 = $40,000
    const withoutAMT = calculateForm3800(makeInput({
      regularTax: d(50000),
      amt: d(0),
      tentativeMinimumTax: d(10000),
      currentYearCredits: d(20000),
    }));

    // Regular tax $50,000, AMT $10,000, TMT $20,000
    // Net income tax = $60,000, floor = max($6,250, $20,000) = $20,000
    // Limitation = $60,000 - $20,000 = $40,000
    const withAMT = calculateForm3800(makeInput({
      regularTax: d(50000),
      amt: d(10000),
      tentativeMinimumTax: d(20000),
      currentYearCredits: d(20000),
    }));

    expect(withoutAMT.creditLimitation.toNumber()).toBe(40000);
    expect(withAMT.creditLimitation.toNumber()).toBe(40000);
  });
});

// ── Zero Credit / Zero Tax Scenarios ─────────────────────────────────

describe("Form 3800 - zero and extreme value scenarios", () => {
  it("Form 3800 - zero regular tax and zero AMT: credit limitation is $0", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(0),
      amt: d(0),
      tentativeMinimumTax: d(0),
      currentYearCredits: d(5000),
    }));

    expect(result.netIncomeTax.toNumber()).toBe(0);
    expect(result.creditLimitation.toNumber()).toBe(0);
    expect(result.allowableCredit.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(5000);
  });

  it("Form 3800 - very large credit ($1M) with moderate tax: most carries forward", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(80000),
      tentativeMinimumTax: d(0),
      currentYearCredits: d(1000000),
    }));

    // Net income tax = $80,000, 25% excess = $13,750
    // Limitation = $80,000 - $13,750 = $66,250
    expect(result.allowableCredit.toNumber()).toBe(66250);
    expect(result.carryforwardToNextYear.toNumber()).toBe(933750);
  });

  it("Form 3800 - zero credit with large tax: allowable is $0, no carryforward", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(200000),
      currentYearCredits: d(0),
    }));

    expect(result.totalCredit.toNumber()).toBe(0);
    expect(result.allowableCredit.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });
});

// ── Carryforward Mechanics ───────────────────────────────────────────

describe("Form 3800 - carryforward combined with current year credit", () => {
  it("Form 3800 - carryforward plus current year both fit within limitation", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(80000),
      currentYearCredits: d(10000),
      carryforward: d(5000),
    }));

    // Total credit = $15,000
    // Limitation = $80,000 - $13,750 = $66,250
    expect(result.totalCredit.toNumber()).toBe(15000);
    expect(result.allowableCredit.toNumber()).toBe(15000);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });

  it("Form 3800 - carryforward alone exceeds limitation: partial use, rest carries forward", () => {
    // Low tax scenario where the limitation is small
    // Regular tax $26,000, TMT $0
    // Net regular tax = $26,000 → 25% excess = 0.25 × $1,000 = $250
    // Net income tax = $26,000
    // Limitation = $26,000 - $250 = $25,750
    const result = calculateForm3800(makeInput({
      regularTax: d(26000),
      carryforward: d(30000),
    }));

    expect(result.totalCredit.toNumber()).toBe(30000);
    expect(result.allowableCredit.toNumber()).toBe(25750);
    expect(result.carryforwardToNextYear.toNumber()).toBe(4250);
  });

  it("Form 3800 - only carryforward, no current year credit", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(50000),
      carryforward: d(8000),
    }));

    expect(result.currentYearCredit.toNumber()).toBe(0);
    expect(result.totalCredit.toNumber()).toBe(8000);
    expect(result.allowableCredit.toNumber()).toBe(8000);
  });
});

// ── Filing Status Threshold Verification ─────────────────────────────

describe("Form 3800 - all filing statuses use correct threshold", () => {
  const testThreshold = (status: Form3800Input["filingStatus"], threshold: number) => {
    // Net regular tax = threshold + $4,000
    // 25% excess = 0.25 × $4,000 = $1,000
    const result = calculateForm3800(makeInput({
      filingStatus: status,
      regularTax: d(threshold + 4000),
      currentYearCredits: d(1000),
    }));

    expect(result.twentyFivePercentExcess.toNumber()).toBe(1000);
  };

  it("Form 3800 - single uses $25,000 threshold", () => {
    testThreshold("single", 25000);
  });

  it("Form 3800 - MFJ uses $25,000 threshold", () => {
    testThreshold("married_filing_jointly", 25000);
  });

  it("Form 3800 - HoH uses $25,000 threshold", () => {
    testThreshold("head_of_household", 25000);
  });

  it("Form 3800 - QSS uses $25,000 threshold", () => {
    testThreshold("qualifying_surviving_spouse", 25000);
  });

  it("Form 3800 - MFS uses $12,500 threshold", () => {
    testThreshold("married_filing_separately", 12500);
  });
});

// ── TMT Completely Blocks Credit ─────────────────────────────────────

describe("Form 3800 - TMT blocks entire credit (in-AMT year)", () => {
  it("Form 3800 - high TMT with moderate regular tax: zero credit, full carryforward", () => {
    // Regular tax $50,000, TMT $60,000 (taxpayer is in AMT this year)
    // AMT = max(0, $60,000 - $50,000) = $10,000
    // Net income tax = $50,000 + $10,000 = $60,000
    // Floor = max($6,250, $60,000) = $60,000
    // Limitation = max(0, $60,000 - $60,000) = $0
    const result = calculateForm3800(makeInput({
      regularTax: d(50000),
      amt: d(10000),
      tentativeMinimumTax: d(60000),
      currentYearCredits: d(15000),
    }));

    expect(result.creditLimitation.toNumber()).toBe(0);
    expect(result.allowableCredit.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(15000);
  });
});

// ── K-1 Aggregation from Multiple Partnerships ──────────────────────

describe("Form 3800 - multiple K-1 Box 15 credit aggregation", () => {
  it("Form 3800 - credits from 3 partnerships aggregate correctly", () => {
    const k1a = makeK1({ otherCredits: "2500" });
    const k1b = makeK1({ lowIncomeHousingCredit42j5: "3000" });
    const k1c = makeK1({ qualifiedRehabilitationExpenditures: "1500" });

    const result = calculateForm3800(makeInput({
      scheduleK1s: [k1a, k1b, k1c],
      regularTax: d(80000),
    }));

    expect(result.k1OtherCredits.toNumber()).toBe(2500);
    expect(result.k1LowIncomeHousing42j5.toNumber()).toBe(3000);
    expect(result.k1RehabilitationCredit.toNumber()).toBe(1500);
    expect(result.k1TotalCredits.toNumber()).toBe(7000);
    expect(result.currentYearCredit.toNumber()).toBe(7000);
  });

  it("Form 3800 - K-1 credits combined with direct credits", () => {
    const k1 = makeK1({ otherCredits: "5000" });

    const result = calculateForm3800(makeInput({
      scheduleK1s: [k1],
      currentYearCredits: d(3000),
      regularTax: d(80000),
    }));

    expect(result.currentYearCredit.toNumber()).toBe(8000);
  });
});

// ── Passive Activity Credits ─────────────────────────────────────────

describe("Form 3800 - passive activity credits (Line 2)", () => {
  it("Form 3800 Line 5 - passive credits aggregate with current year and carryforward", () => {
    const result = calculateForm3800(makeInput({
      currentYearCredits: d(2000),
      passiveActivityCredits: d(3000),
      carryforward: d(1000),
      regularTax: d(80000),
    }));

    expect(result.totalCredit.toNumber()).toBe(6000);
    expect(result.allowableCredit.toNumber()).toBe(6000);
  });
});

// ── Precision: Credit Exactly $1 ─────────────────────────────────────

describe("Form 3800 - minimal credit values", () => {
  it("Form 3800 - $1 credit with sufficient tax liability: fully allowed", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(80000),
      currentYearCredits: d(1),
    }));

    expect(result.allowableCredit.toNumber()).toBe(1);
    expect(result.carryforwardToNextYear.toNumber()).toBe(0);
  });

  it("Form 3800 - $1 credit with zero limitation: carries forward entirely", () => {
    const result = calculateForm3800(makeInput({
      regularTax: d(0),
      currentYearCredits: d(1),
    }));

    expect(result.allowableCredit.toNumber()).toBe(0);
    expect(result.carryforwardToNextYear.toNumber()).toBe(1);
  });
});

// ── Other Nonrefundable Credits Combined with CTC ────────────────────

describe("Form 3800 - mixed personal credits reduce net regular tax", () => {
  it("Form 3800 Line 14 - CTC plus other nonrefundable credits both reduce net regular tax", () => {
    // Regular tax $40,000, CTC $4,000, other $3,000
    // Net regular tax = max(0, $40,000 - $7,000) = $33,000
    // 25% excess = 0.25 × ($33,000 - $25,000) = $2,000
    const result = calculateForm3800(makeInput({
      regularTax: d(40000),
      childTaxCredit: d(4000),
      otherNonrefundableCredits: d(3000),
      currentYearCredits: d(20000),
    }));

    expect(result.personalCredits.toNumber()).toBe(7000);
    expect(result.netRegularTax.toNumber()).toBe(33000);
    expect(result.twentyFivePercentExcess.toNumber()).toBe(2000);
    // Net income tax = $40,000 + $0 - $7,000 = $33,000
    // Limitation = $33,000 - $2,000 = $31,000
    expect(result.creditLimitation.toNumber()).toBe(31000);
    expect(result.allowableCredit.toNumber()).toBe(20000);
  });
});

// ── Audit Trail Completeness ─────────────────────────────────────────

describe("Form 3800 - audit trail records all calculation lines", () => {
  it("Form 3800 audit trail includes K-1 Box 15, Part I, Part II, and carryforward", () => {
    const k1 = makeK1({ otherCredits: "1000" });

    const result = calculateForm3800(makeInput({
      scheduleK1s: [k1],
      regularTax: d(50000),
      amt: d(2000),
      tentativeMinimumTax: d(5000),
      childTaxCredit: d(1000),
      currentYearCredits: d(500),
      carryforward: d(200),
    }));

    const lineLabels = result.lines.map((l) => l.line);
    expect(lineLabels).toContain("K-1 Box 15");
    expect(lineLabels).toContain("Part I Line 1");
    expect(lineLabels).toContain("Part I Line 2");
    expect(lineLabels).toContain("Part I Line 3");
    expect(lineLabels).toContain("Part I Line 5");
    expect(lineLabels).toContain("Part II Line 14");
    expect(lineLabels).toContain("Part II Line 15");
    expect(lineLabels).toContain("Part II Line 16");
    expect(lineLabels).toContain("Part II Line 17");
    expect(lineLabels).toContain("Part II Line 18");
    expect(lineLabels).toContain("Part II Line 19");
    expect(lineLabels).toContain("Part II Line 20");
    expect(lineLabels).toContain("Part II Line 21");
    expect(lineLabels).toContain("Carryforward");
  });
});
