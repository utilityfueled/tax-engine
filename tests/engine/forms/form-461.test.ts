/**
 * Tests for Form 461 — Limitation on Business Losses (IRC §461(l)).
 * Spec: spec/federal/form-461.yaml
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm461, type Form461Input } from "@/engine/forms/form-461.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { getConstants, type FilingStatus } from "@/models/constants.js";

const constants = getConstants(2025);

function form461(
  overrides: Partial<Form461Input> = {},
  filingStatus: FilingStatus = "single"
) {
  const input: Form461Input = {
    totalWages: overrides.totalWages ?? new Decimal(0),
    scheduleCNetProfit: overrides.scheduleCNetProfit ?? new Decimal(0),
    scheduleFNetProfit: overrides.scheduleFNetProfit ?? new Decimal(0),
    form4797OrdinaryGainOrLoss: overrides.form4797OrdinaryGainOrLoss ?? new Decimal(0),
    nonpassiveK1Income: overrides.nonpassiveK1Income ?? new Decimal(0),
    nonpassiveK1Loss: overrides.nonpassiveK1Loss ?? new Decimal(0),
    otherBusinessIncome: overrides.otherBusinessIncome ?? new Decimal(0),
    deductibleSETax: overrides.deductibleSETax ?? new Decimal(0),
    seHealthInsurance: overrides.seHealthInsurance ?? new Decimal(0),
    seRetirementContributions: overrides.seRetirementContributions ?? new Decimal(0),
    priorYearEBLNol: overrides.priorYearEBLNol ?? new Decimal(0),
  };
  return calculateForm461(input, filingStatus, constants);
}

describe("Form 461 Limitation on Business Losses", () => {
  // ── Part I: Business Income Aggregation ────────────────────

  it("Form 461 Line 1 - W-2 wages count as business income", () => {
    const result = form461({ totalWages: new Decimal(100000) });
    expect(result.line1Wages).toEqual(new Decimal(100000));
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(100000));
  });

  it("Form 461 Line 2 - Schedule C net profit or loss", () => {
    const result = form461({ scheduleCNetProfit: new Decimal(50000) });
    expect(result.line2ScheduleC).toEqual(new Decimal(50000));
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(50000));
  });

  it("Form 461 Line 2 - Schedule C loss flows to deductions", () => {
    const result = form461({ scheduleCNetProfit: new Decimal(-80000) });
    expect(result.line2ScheduleC).toEqual(new Decimal(-80000));
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(0));
    expect(result.line9BusinessDeductionsFromLines).toEqual(new Decimal(80000));
  });

  it("Form 461 Line 3 - Schedule F net farm profit or loss", () => {
    const result = form461({ scheduleFNetProfit: new Decimal(30000) });
    expect(result.line3ScheduleF).toEqual(new Decimal(30000));
  });

  it("Form 461 Line 4 - Form 4797 ordinary gain or loss", () => {
    const result = form461({ form4797OrdinaryGainOrLoss: new Decimal(15000) });
    expect(result.line4Form4797).toEqual(new Decimal(15000));
  });

  it("Form 461 Line 5 - nonpassive K-1 income or loss", () => {
    const result = form461({
      nonpassiveK1Income: new Decimal(20000),
      nonpassiveK1Loss: new Decimal(-5000),
    });
    expect(result.line5NonpassiveK1).toEqual(new Decimal(15000));
  });

  it("Form 461 Line 7 - other business income", () => {
    const result = form461({ otherBusinessIncome: new Decimal(10000) });
    expect(result.line7OtherBusiness).toEqual(new Decimal(10000));
  });

  it("Form 461 Line 8 - total business income aggregates positive lines", () => {
    const result = form461({
      totalWages: new Decimal(75000),
      scheduleCNetProfit: new Decimal(25000),
      scheduleFNetProfit: new Decimal(-10000), // loss -> not in line 8
      nonpassiveK1Income: new Decimal(5000),
      nonpassiveK1Loss: new Decimal(0),
    });
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(105000));
  });

  it("Form 461 Line 9 - total business deductions from negative lines", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-100000),
      scheduleFNetProfit: new Decimal(-50000),
      nonpassiveK1Income: new Decimal(0),
      nonpassiveK1Loss: new Decimal(-25000),
    });
    expect(result.line9BusinessDeductionsFromLines).toEqual(new Decimal(175000));
  });

  // ── Above-the-line business deductions ─────────────────────

  it("Form 461 Line 10 - deductible SE tax", () => {
    const result = form461({ deductibleSETax: new Decimal(7065) });
    expect(result.line10DeductibleSETax).toEqual(new Decimal(7065));
  });

  it("Form 461 Line 11 - SE health insurance", () => {
    const result = form461({ seHealthInsurance: new Decimal(12000) });
    expect(result.line11SEHealthInsurance).toEqual(new Decimal(12000));
  });

  it("Form 461 Line 12 - SE retirement contributions", () => {
    const result = form461({ seRetirementContributions: new Decimal(15000) });
    expect(result.line12SERetirement).toEqual(new Decimal(15000));
  });

  it("Form 461 Line 13 - total business deductions", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-200000),
      deductibleSETax: new Decimal(5000),
      seHealthInsurance: new Decimal(10000),
      seRetirementContributions: new Decimal(20000),
    });
    // Line 9 = 200000 (|Schedule C loss|), Line 10 = 5000, Line 11 = 10000, Line 12 = 20000
    expect(result.line13TotalBusinessDeductions).toEqual(new Decimal(235000));
  });

  // ── Part II: Excess Business Loss ──────────────────────────

  it("Form 461 Line 14 - net business income or loss", () => {
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-200000),
      deductibleSETax: new Decimal(3000),
    });
    // Line 8 = 50000, Line 13 = 200000 + 3000 = 203000
    // Line 14 = 50000 - 203000 = -153000
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-153000));
  });

  it("Form 461 Line 15 - threshold by filing status", () => {
    expect(form461({}, "single").line15Threshold).toEqual(new Decimal(313000));
    expect(form461({}, "married_filing_jointly").line15Threshold).toEqual(new Decimal(626000));
    expect(form461({}, "married_filing_separately").line15Threshold).toEqual(new Decimal(313000));
    expect(form461({}, "head_of_household").line15Threshold).toEqual(new Decimal(313000));
    expect(form461({}, "qualifying_surviving_spouse").line15Threshold).toEqual(new Decimal(313000));
  });

  it("Form 461 Line 16 - no excess when business income exceeds deductions", () => {
    const result = form461({
      totalWages: new Decimal(100000),
      scheduleCNetProfit: new Decimal(50000),
    });
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(150000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - no excess when business loss within threshold", () => {
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-300000),
    });
    // Net = 50000 - 300000 = -250000, threshold = 313000
    // |Net| = 250000 < 313000 → no excess
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-250000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - loss exactly at threshold produces $0 excess", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-313000),
    });
    // Net = -313000, threshold = 313000
    // |Net| - threshold = 0
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - loss $1 over threshold produces $1 excess", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-313001),
    });
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(1));
    expect(result.applies).toBe(true);
  });

  it("Form 461 Line 16 - excess business loss computation", () => {
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-500000),
      deductibleSETax: new Decimal(7065),
    });
    // Line 8 = 50000, Line 13 = 500000 + 7065 = 507065
    // Line 14 = 50000 - 507065 = -457065
    // Line 16 = max(0, 457065 - 313000) = 144065
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(144065));
    expect(result.applies).toBe(true);
  });

  it("Form 461 Line 16 - MFJ double threshold reduces excess", () => {
    const result = form461(
      {
        totalWages: new Decimal(50000),
        scheduleCNetProfit: new Decimal(-500000),
        deductibleSETax: new Decimal(7065),
      },
      "married_filing_jointly"
    );
    // Line 14 = 50000 - 507065 = -457065
    // MFJ threshold = 626000
    // |457065| < 626000 → no excess
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 - large business losses above MFJ threshold", () => {
    const result = form461(
      {
        totalWages: new Decimal(100000),
        scheduleCNetProfit: new Decimal(-800000),
        scheduleFNetProfit: new Decimal(-100000),
        deductibleSETax: new Decimal(10000),
      },
      "married_filing_jointly"
    );
    // Line 8 = 100000, Line 13 = 900000 + 10000 = 910000
    // Line 14 = 100000 - 910000 = -810000
    // MFJ Line 16 = max(0, 810000 - 626000) = 184000
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(184000));
    expect(result.applies).toBe(true);
  });

  // ── NOL Carryforward ───────────────────────────────────────

  it("Form 461 - excess business loss produces NOL carryforward", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-500000),
    });
    // Net = -500000, threshold = 313000
    // Excess = 500000 - 313000 = 187000
    // NOL = 187000 (no prior carryforward)
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(187000));
    expect(result.nolCarryforward).toEqual(new Decimal(187000));
  });

  it("Form 461 - NOL carryforward accumulates with prior year", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-400000),
      priorYearEBLNol: new Decimal(50000),
    });
    // Current excess = 400000 - 313000 = 87000
    // Total NOL = 87000 + 50000 = 137000
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(87000));
    expect(result.nolCarryforward).toEqual(new Decimal(137000));
  });

  it("Form 461 - no current excess still preserves prior NOL carryforward", () => {
    const result = form461({
      scheduleCNetProfit: new Decimal(-100000), // within threshold
      priorYearEBLNol: new Decimal(75000),
    });
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.nolCarryforward).toEqual(new Decimal(75000));
  });

  // ── Mixed business sources ─────────────────────────────────

  it("Form 461 - wages offset business losses to reduce excess", () => {
    const result = form461({
      totalWages: new Decimal(200000),
      scheduleCNetProfit: new Decimal(-600000),
    });
    // Line 8 = 200000, Line 13 = 600000
    // Line 14 = 200000 - 600000 = -400000
    // Excess = 400000 - 313000 = 87000
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(87000));
  });

  it("Form 461 - multiple business sources mix income and losses", () => {
    const result = form461({
      totalWages: new Decimal(80000),
      scheduleCNetProfit: new Decimal(30000),
      scheduleFNetProfit: new Decimal(-450000),
      nonpassiveK1Income: new Decimal(10000),
      nonpassiveK1Loss: new Decimal(-20000),
      form4797OrdinaryGainOrLoss: new Decimal(5000),
      deductibleSETax: new Decimal(8000),
      seHealthInsurance: new Decimal(15000),
    });
    // Positive: wages 80000 + sched C 30000 + K1 net (10000-20000=-10000→negative) + 4797 5000 = 115000
    // Wait, K1 net is -10000 which is negative.
    // Line 5 = 10000 + (-20000) = -10000 → goes to line 9
    // Positive items: wages 80000, sched C 30000, 4797 5000 = 115000
    // Negative items: sched F 450000, K1 net 10000 = 460000
    // Line 8 = 115000
    // Line 9 = 460000
    // Line 13 = 460000 + 8000 + 15000 = 483000
    // Line 14 = 115000 - 483000 = -368000
    // Excess = 368000 - 313000 = 55000
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(115000));
    expect(result.line9BusinessDeductionsFromLines).toEqual(new Decimal(460000));
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-368000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(55000));
  });

  it("Form 461 - no business activity produces zero excess", () => {
    const result = form461({});
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(0));
    expect(result.line13TotalBusinessDeductions).toEqual(new Decimal(0));
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(0));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 - net positive business income never triggers excess", () => {
    const result = form461({
      totalWages: new Decimal(500000),
      scheduleCNetProfit: new Decimal(-200000),
      deductibleSETax: new Decimal(15000),
    });
    // Line 8 = 500000, Line 13 = 200000 + 15000 = 215000
    // Line 14 = 500000 - 215000 = 285000 > 0 → no excess
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(285000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
  });

  // ── Filing status edge cases ───────────────────────────────

  it("Form 461 - MFS uses single threshold ($313K), not half MFJ", () => {
    const result = form461(
      { scheduleCNetProfit: new Decimal(-400000) },
      "married_filing_separately"
    );
    // Excess = 400000 - 313000 = 87000
    expect(result.line15Threshold).toEqual(new Decimal(313000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(87000));
  });

  it("Form 461 - head of household uses same threshold as single", () => {
    const result = form461(
      { scheduleCNetProfit: new Decimal(-400000) },
      "head_of_household"
    );
    expect(result.line15Threshold).toEqual(new Decimal(313000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(87000));
  });

  it("Form 461 - qualifying surviving spouse uses single threshold", () => {
    const result = form461(
      { scheduleCNetProfit: new Decimal(-400000) },
      "qualifying_surviving_spouse"
    );
    expect(result.line15Threshold).toEqual(new Decimal(313000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(87000));
  });

  // ── Audit trail ────────────────────────────────────────────

  it("Form 461 - produces audit trail lines for all computed values", () => {
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-500000),
      deductibleSETax: new Decimal(5000),
    });
    expect(result.lines.length).toBeGreaterThan(0);
    const forms = result.lines.map((l) => l.form);
    expect(forms.every((f) => f === "Form 461")).toBe(true);
  });
});

describe("Form 461 Federal Integration", () => {
  // These tests verify that Form 461 is wired correctly into the
  // federal orchestrator and affects totalIncome and AGI.

  function makeInput(overrides: Record<string, unknown> = {}) {
    return {
      taxpayer: {
        taxYear: 2025,
        filingStatus: (overrides.filingStatus as string) ?? "single",
        primary: {
          firstName: "Test",
          lastName: "Filer",
          ssn: "000-00-0000",
          dateOfBirth: "1980-01-01",
        },
        address: { street: "1 Main St", city: "Test", state: "WA", zip: "98101" },
        dependents: [],
      },
      w2s: overrides.w2s ?? [],
      form1099Int: [],
      form1099Div: [],
      form1099B: [],
      form1099Nec: [],
      form1099Misc: [],
      form1099G: [],
      formW2G: [],
      form1098: [],
      form1095A: [],
      donations: [],
      rentalProperties: [],
      scheduleK1: [],
      savingsBondRedemptions: [],
      form8814: [],
      ...(overrides.scheduleC !== undefined ? { scheduleC: overrides.scheduleC } : {}),
      ...(overrides.scheduleF !== undefined ? { scheduleF: overrides.scheduleF } : {}),
      ...(overrides.priorYear !== undefined ? { priorYear: overrides.priorYear } : {}),
    };
  }

  it("Form 461 - excess business loss flows to Schedule 1 as income add-back", () => {
    // Sole proprietor with large Schedule C loss and modest wages
    const result = calculateFederalTax(makeInput({
      w2s: [{
        employer: { name: "Employer", ein: "00-0000000" },
        wages: "50000",
        federalWithheld: "5000",
      }],
      scheduleC: {
        businessName: "Test LLC",
        grossReceipts: "10000",
        expenses: { otherExpenses: "560000" },
      },
    }));

    // Schedule C net = 10000 - 560000 = -550000
    // Form 461: wages 50000, sched C -550000
    // Line 8 = 50000, Line 9 = 550000
    // SE tax on loss = 0 (negative net SE), so deductible SE tax = 0
    // Line 14 = 50000 - 550000 = -500000
    // Excess = 500000 - 313000 = 187000
    expect(result.form461).toBeDefined();
    expect(result.form461!.applies).toBe(true);
    expect(result.form461!.line16ExcessBusinessLoss).toEqual(new Decimal(187000));

    // The excess should be added back to otherIncome
    expect(result.otherIncome.greaterThanOrEqualTo(new Decimal(187000))).toBe(true);
  });

  it("Form 461 - no excess when business loss within threshold", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{
        employer: { name: "Employer", ein: "00-0000000" },
        wages: "100000",
        federalWithheld: "10000",
      }],
      scheduleC: {
        businessName: "Small Biz",
        grossReceipts: "5000",
        expenses: { otherExpenses: "150000" },
      },
    }));

    // Schedule C net = 5000 - 150000 = -145000
    // Form 461: wages 100000, sched C -145000
    // Net = 100000 - 145000 = -45000
    // |45000| < 313000 → no excess
    expect(result.form461!.applies).toBe(false);
    expect(result.form461!.line16ExcessBusinessLoss).toEqual(new Decimal(0));
  });

  it("Form 461 - EBL NOL carryforward tracked in result", () => {
    const result = calculateFederalTax(makeInput({
      scheduleC: {
        businessName: "Big Loss LLC",
        grossReceipts: "0",
        expenses: { otherExpenses: "500000" },
      },
    }));

    // Schedule C net = 0 - 500000 = -500000
    // Excess = 500000 - 313000 = 187000
    expect(result.form461!.applies).toBe(true);
    expect(result.carryforwards.excessBusinessLossNOL).toEqual(new Decimal(187000));
  });

  it("Form 461 - prior year NOL carryforward accumulates", () => {
    const result = calculateFederalTax(makeInput({
      scheduleC: {
        businessName: "Startup",
        grossReceipts: "0",
        expenses: { otherExpenses: "400000" },
      },
      priorYear: {
        excessBusinessLossNOL: "50000",
      },
    }));

    // Schedule C net = -400000
    // Current excess = 400000 - 313000 = 87000
    // Total NOL = 87000 + 50000 = 137000
    expect(result.form461!.line16ExcessBusinessLoss).toEqual(new Decimal(87000));
    expect(result.carryforwards.excessBusinessLossNOL).toEqual(new Decimal(137000));
  });

  it("Form 461 - wage earner with no business never triggers EBL", () => {
    const result = calculateFederalTax(makeInput({
      w2s: [{
        employer: { name: "BigCo", ein: "00-0000000" },
        wages: "500000",
        federalWithheld: "100000",
      }],
    }));

    // All wages, no losses → net positive → no excess
    expect(result.form461!.applies).toBe(false);
    expect(result.form461!.line16ExcessBusinessLoss).toEqual(new Decimal(0));
  });
});
