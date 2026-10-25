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

  it("Form 461 Line 1 - employee wages do not count as business income", () => {
    // Final2025 instructions reserve line1; employee wages are excluded.
    const result = form461({ totalWages: new Decimal(100000) });
    expect(result.line1Wages).toEqual(new Decimal(0));
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(0));
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

  it("Form 461 legacy farm summary - Schedule F net farm profit or loss", () => {
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

  it("Form 461 legacy other-business summary - other business income", () => {
    const result = form461({ otherBusinessIncome: new Decimal(10000) });
    expect(result.line7OtherBusiness).toEqual(new Decimal(10000));
  });

  it("Form 461 Line 8 - total business income aggregates positive lines", () => {
    // Business income is25000C+5000K1;75000employee wages do not enter.
    const result = form461({
      totalWages: new Decimal(75000),
      scheduleCNetProfit: new Decimal(25000),
      scheduleFNetProfit: new Decimal(-10000), // loss -> not in line 8
      nonpassiveK1Income: new Decimal(5000),
      nonpassiveK1Loss: new Decimal(0),
    });
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(30000));
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

  it("Form 461 legacy deduction summary - deductible SE tax", () => {
    const result = form461({ deductibleSETax: new Decimal(7065) });
    expect(result.line10DeductibleSETax).toEqual(new Decimal(7065));
  });

  it("Form 461 legacy deduction summary - SE health insurance", () => {
    const result = form461({ seHealthInsurance: new Decimal(12000) });
    expect(result.line11SEHealthInsurance).toEqual(new Decimal(12000));
  });

  it("Form 461 legacy deduction summary - SE retirement contributions", () => {
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
    // Business loss200000 plus3000deductible SE tax;50000wages excluded.
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-200000),
      deductibleSETax: new Decimal(3000),
    });
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-203000));
  });

  it("Form 461 Line 15 - threshold by filing status", () => {
    expect(form461({}, "single").line15Threshold).toEqual(new Decimal(313000));
    expect(form461({}, "married_filing_jointly").line15Threshold).toEqual(new Decimal(626000));
    expect(form461({}, "married_filing_separately").line15Threshold).toEqual(new Decimal(313000));
    expect(form461({}, "head_of_household").line15Threshold).toEqual(new Decimal(313000));
    expect(form461({}, "qualifying_surviving_spouse").line15Threshold).toEqual(new Decimal(313000));
  });

  it("Form 461 Line 16 - no excess when business income exceeds deductions", () => {
    // Only50000ScheduleC profit is business income; wages excluded.
    const result = form461({
      totalWages: new Decimal(100000),
      scheduleCNetProfit: new Decimal(50000),
    });
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(50000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 Line 16 - no excess when business loss within threshold", () => {
    // Business loss300000 is below313000; employee wages do not reduce it.
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-300000),
    });
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-300000));
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
    // 500000loss+7065deduction-313000threshold=194065; wages excluded.
    const result = form461({
      totalWages: new Decimal(50000),
      scheduleCNetProfit: new Decimal(-500000),
      deductibleSETax: new Decimal(7065),
    });
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(194065));
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
    // 800000C+100000F+10000deduction-626000threshold=284000.
    const result = form461(
      {
        totalWages: new Decimal(100000),
        scheduleCNetProfit: new Decimal(-800000),
        scheduleFNetProfit: new Decimal(-100000),
        deductibleSETax: new Decimal(10000),
      },
      "married_filing_jointly"
    );
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(284000));
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

  it("Form 461 - wages cannot offset business losses", () => {
    // 600000business loss-313000threshold=287000 regardless200000employee wages.
    const result = form461({
      totalWages: new Decimal(200000),
      scheduleCNetProfit: new Decimal(-600000),
    });
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(287000));
  });

  it("Form 461 - multiple business sources mix income and losses", () => {
    // 30000C+5000gain-450000F-10000K1-8000SE-15000health=-448000; excess135000.
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
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(35000));
    expect(result.line9BusinessDeductionsFromLines).toEqual(new Decimal(460000));
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-448000));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(135000));
  });

  it("Form 461 - no business activity produces zero excess", () => {
    const result = form461({});
    expect(result.line8TotalBusinessIncome).toEqual(new Decimal(0));
    expect(result.line13TotalBusinessDeductions).toEqual(new Decimal(0));
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(0));
    expect(result.line16ExcessBusinessLoss).toEqual(new Decimal(0));
    expect(result.applies).toBe(false);
  });

  it("Form 461 - large wages do not change a below-threshold business loss", () => {
    // 200000business loss+15000SE deduction=215000loss;500000wages excluded.
    const result = form461({
      totalWages: new Decimal(500000),
      scheduleCNetProfit: new Decimal(-200000),
      deductibleSETax: new Decimal(15000),
    });
    expect(result.line14NetBusinessAmount).toEqual(new Decimal(-215000));
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
    // 550000C loss-313000threshold=237000addback; canonical Schedule1 includes original loss once.
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

    expect(result.form461).toBeDefined();
    expect(result.form461!.applies).toBe(true);
    expect(result.form461!.line16ExcessBusinessLoss).toEqual(new Decimal(237000));

    expect(result.otherIncome.toString()).toBe("-313000");
    expect(result.totalIncome.toString()).toBe("-263000");
    expect(result.agi.toString()).toBe("-263000");
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
