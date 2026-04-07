/**
 * Edge case tests for Schedule C (self-employment business income).
 * Tests expense limits, home office, meals deduction, and zero/negative scenarios.
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import type { TaxYearInput } from "@/models/inputs.js";

const d = (n: number | string) => new Decimal(n);

// ═══════════════════════════════════════════════════════════
// Meals Deduction (50% limit)
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Meals 50% deduction", () => {
  it("meals deducted at 50%", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      expenses: { meals: "10000" },
    });
    // $10K meals × 50% = $5K deduction
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(5000);
  });

  it("meals at zero means zero deduction", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      expenses: { meals: "0" },
    });
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Home Office Deduction
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Home office deduction", () => {
  it("simplified method: $5/sqft up to 300 sqft = $1,500 max", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500);
  });

  it("simplified method: less than 300 sqft", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      homeOffice: { method: "simplified", squareFeet: 200 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(1000);
  });

  it("simplified method: capped at 300 sqft even if more", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      homeOffice: { method: "simplified", squareFeet: 500 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500);
  });

  it("actual method: passes through Form 8829 amount", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      homeOffice: { method: "actual", actualAmount: "3000" },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(3000);
  });

  it("no home office: zero deduction", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
  });

  it("simplified method: cannot create a loss (tentative profit = 0)", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "5000",
      expenses: { supplies: "5000" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    expect(result.tentativeProfit.toNumber()).toBe(0);
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
  });

  it("simplified method: limited to tentative profit when profit < $1,500", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "5000",
      expenses: { supplies: "4200" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    // Tentative profit: $5K - $4.2K = $800 < $1,500
    expect(result.tentativeProfit.toNumber()).toBe(800);
    expect(result.homeOfficeDeduction.toNumber()).toBe(800);
    expect(result.netProfit.toNumber()).toBe(0);
  });

  it("simplified method: zero when tentative profit is negative", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "5000",
      expenses: { supplies: "8000" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    expect(result.tentativeProfit.toNumber()).toBe(-3000);
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(-3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Profit / Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Net profit/loss edge cases", () => {
  it("net loss when expenses exceed income", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "20000",
      expenses: {
        advertising: "5000",
        supplies: "10000",
        otherExpenses: "15000",
      },
    });
    // Gross: $20K, Expenses: $30K → Net: -$10K
    expect(result.netProfit.toNumber()).toBe(-10000);
  });

  it("zero gross receipts with no 1099-NEC", () => {
    const noNECFixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [],
    };
    const result = calculateScheduleC(noNECFixture);
    expect(result.grossReceipts.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });

  it("COGS reduces gross income", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      costOfGoodsSold: "40000",
    });
    expect(result.grossIncome.toNumber()).toBe(60000);
    expect(result.netProfit.toNumber()).toBe(60000);
  });

  it("returns and allowances reduce gross receipts", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      returnsAndAllowances: "5000",
    });
    expect(result.grossIncome.toNumber()).toBe(95000);
  });

  it("all expense categories combined", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      expenses: {
        advertising: "1000",
        carAndTruck: "2000",
        contractLabor: "3000",
        insurance: "4000",
        legalAndProfessional: "5000",
        officeExpense: "1000",
        supplies: "2000",
        travel: "3000",
        meals: "4000", // → $2K deducted
        utilities: "1000",
        otherExpenses: "2000",
      },
    });
    // Total expenses: 1+2+3+4+5+1+2+3+2+1+2 = $26K
    expect(result.totalExpenses.toNumber()).toBe(26000);
    expect(result.netProfit.toNumber()).toBe(74000);
  });

  it("COGS exceeding receipts creates negative gross income", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "10000",
      costOfGoodsSold: "15000",
    });
    expect(result.grossIncome.toNumber()).toBe(-5000);
    expect(result.netProfit.toNumber()).toBe(-5000);
  });

  it("Schedule C sub-result exposed in federal return", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "40000", federalWithheld: "0" }],
      scheduleC: {
        expenses: { supplies: "5000", insurance: "2000" },
      },
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.scheduleC).toBeDefined();
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(33000);
    expect(federal.scheduleC!.totalExpenses.toNumber()).toBe(7000);
  });

  it("Schedule C net loss flows into federal total income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "10000", federalWithheld: "0" }],
      scheduleC: {
        expenses: { otherExpenses: "15000" },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C: $10K - $15K = -$5K loss
    // Total: $85K wages + (-$5K) = $80K
    expect(federal.totalIncome.toNumber()).toBe(80000);
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Gross Revenue
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Zero gross revenue", () => {
  it("zero gross revenue: net loss equals total expenses", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "0",
      expenses: {
        advertising: "2000",
        supplies: "3000",
        utilities: "1000",
      },
    });
    expect(result.grossReceipts.toNumber()).toBe(0);
    expect(result.grossIncome.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(6000);
    // Net loss must equal negative total expenses when revenue is zero
    expect(result.netProfit.toNumber()).toBe(-6000);
    expect(result.netProfit.toNumber()).toBe(-result.totalExpenses.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Profit — Precision
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Very high profit precision", () => {
  it("$1M+ gross revenue with expenses produces exact net profit without floating-point drift", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "1500000",
      expenses: {
        advertising: "25000",
        contractLabor: "300000",
        insurance: "12000",
        legalAndProfessional: "18000",
        otherExpenses: "45000",
      },
    });
    // Total expenses: 25K + 300K + 12K + 18K + 45K = 400K
    expect(result.totalExpenses.toNumber()).toBe(400000);
    // Net profit: 1.5M - 400K = 1.1M — must be exact
    expect(result.netProfit.toNumber()).toBe(1100000);
    // Decimal precision: toString should not contain floating-point artifacts
    expect(result.netProfit.toFixed(2)).toBe("1100000.00");
  });
});

// ═══════════════════════════════════════════════════════════
// All Expense Categories Simultaneously
// ═══════════════════════════════════════════════════════════

describe("Schedule C - All expense categories simultaneously", () => {
  it("every expense field populated: totals and net profit are correct", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "200000",
      returnsAndAllowances: "2000",
      costOfGoodsSold: "10000",
      expenses: {
        advertising: "5000",
        carAndTruck: "4000",
        contractLabor: "20000",
        insurance: "3000",
        legalAndProfessional: "6000",
        officeExpense: "2000",
        supplies: "4000",
        travel: "3000",
        meals: "2000", // → $1,000 deducted at 50%
        utilities: "2000",
        otherExpenses: "5000",
      },
    });
    // Gross income: 200K - 2K returns - 10K COGS = 188K
    expect(result.grossIncome.toNumber()).toBe(188000);
    // Expenses: 5+4+20+3+6+2+4+3+1+2+5 = 55K
    expect(result.totalExpenses.toNumber()).toBe(55000);
    // Meals (50%): $2K × 50% = $1K
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(1000);
    // Net profit: 188K - 55K = 133K
    expect(result.netProfit.toNumber()).toBe(133000);
  });
});

// ═══════════════════════════════════════════════════════════
// Home Office — Simplified Method (additional edge cases)
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Home office simplified method $5/sqft cap", () => {
  it("exactly 300 sqft yields $1,500 deduction and reduces net profit", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "20000",
      expenses: { supplies: "5000" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    // Tentative profit: 20K - 5K = 15K; deduction is capped at $1,500
    expect(result.tentativeProfit.toNumber()).toBe(15000);
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500);
    expect(result.netProfit.toNumber()).toBe(13500);
  });
});

// ═══════════════════════════════════════════════════════════
// Vehicle Expenses (Standard Mileage Rate)
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Vehicle expenses via carAndTruck", () => {
  it("standard mileage rate deduction flows through carAndTruck line", () => {
    // 2025 IRS standard mileage rate: 70 cents/mile (business)
    const miles = 10000;
    const ratePerMile = 0.70;
    const vehicleDeduction = (miles * ratePerMile).toString(); // "7000"

    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      expenses: { carAndTruck: vehicleDeduction },
    });
    expect(result.expenseBreakdown["Car and truck"].toNumber()).toBe(7000);
    expect(result.totalExpenses.toNumber()).toBe(7000);
    expect(result.netProfit.toNumber()).toBe(43000);
  });

  it("vehicle deduction cannot exceed gross income to drive net below zero independently", () => {
    // $60K vehicle deduction on $50K revenue → net loss
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      expenses: { carAndTruck: "60000" },
    });
    expect(result.netProfit.toNumber()).toBe(-10000);
  });
});

// ═══════════════════════════════════════════════════════════
// Net Loss → Schedule 1 Line 3 → Reduces AGI
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Net loss flows to Schedule 1 Line 3 and reduces AGI", () => {
  it("Schedule C net loss is recorded on Schedule 1 Line 3 and reduces AGI below wages", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Startup Client", nonemployeeCompensation: "5000", federalWithheld: "0" }],
      scheduleC: {
        expenses: { otherExpenses: "12000" },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C net: $5K revenue - $12K expenses = -$7K
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(-7000);
    // Schedule 1 Line 3 audit line carries the loss (visible in allLines)
    const sched1Line3 = federal.allLines.find(
      (l) => l.form === "Sched 1" && l.line === "3"
    );
    expect(sched1Line3).toBeDefined();
    expect(sched1Line3!.value.toNumber()).toBe(-7000);
    // Schedule SE uses Schedule C Line 31, so the net loss does not create SE tax.
    // AGI: $85K wages + (-$7K) sched C = $78K total income.
    // SE uses Schedule C net profit (-$7K) → negative → no SE tax → deductible half = $0
    expect(federal.totalIncome.toNumber()).toBe(78000);
    expect(federal.selfEmploymentTax.toNumber()).toBe(0);
    expect(federal.agi.toNumber()).toBe(78000);
  });

  it("pure net loss with no 1099-NEC: AGI equals wages minus Schedule C loss", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      scheduleC: {
        grossReceipts: "0",
        expenses: { otherExpenses: "8000" },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Sched C: $0 revenue - $8K = -$8K loss; no SE income → no SE deduction
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(-8000);
    expect(federal.totalIncome.toNumber()).toBe(77000); // $85K wages + (-$8K)
    expect(federal.agi.toNumber()).toBe(77000); // no adjustments
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C Profit Triggers SE Tax in Federal Pipeline
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Profit triggers SE tax through federal pipeline", () => {
  it("self-employment profit over $400 produces nonzero SE tax on Schedule SE", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Freelance Client", nonemployeeCompensation: "30000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    // SE earnings: $30K × 0.9235 = $27,705; SE tax = $27,705 × 15.3% ≈ $4,238.87
    expect(federal.selfEmploymentTax.toNumber()).toBeGreaterThan(0);
    // Deductible half reduces AGI
    expect(federal.adjustmentsToIncome.toNumber()).toBeGreaterThan(0);
    // scheduleSE sub-result is present and consistent
    expect(federal.scheduleSE.totalSETax.toNumber()).toBe(federal.selfEmploymentTax.toNumber());
  });

  it("SE profit below $400 threshold produces zero SE tax", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "One-Time Job", nonemployeeCompensation: "300", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    expect(federal.selfEmploymentTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Business Income With No Expenses
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Business income with no expenses", () => {
  it("gross receipts with no expenses: profit equals gross receipts", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "75000",
    });
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.grossIncome.toNumber()).toBe(75000);
    expect(result.tentativeProfit.toNumber()).toBe(75000);
    expect(result.netProfit.toNumber()).toBe(75000);
    // All expense breakdown entries must be zero
    for (const val of Object.values(result.expenseBreakdown)) {
      expect(val.toNumber()).toBe(0);
    }
  });

  it("1099-NEC income with no scheduleC input: profit equals NEC total", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [
        { payer: "Client A", nonemployeeCompensation: "20000", federalWithheld: "0" },
        { payer: "Client B", nonemployeeCompensation: "10000", federalWithheld: "0" },
      ],
    };
    const result = calculateScheduleC(fixture);
    expect(result.grossReceipts.toNumber()).toBe(30000);
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(30000);
  });
});

// ═══════════════════════════════════════════════════════════
// Simplified Home Office — $5/sqft, 300 sqft max, $1,500 cap
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Simplified home office edge cases", () => {
  it("1 sqft yields exactly $5 deduction", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      homeOffice: { method: "simplified", squareFeet: 1 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(5);
    expect(result.netProfit.toNumber()).toBe(49995);
  });

  it("0 sqft yields $0 deduction", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      homeOffice: { method: "simplified", squareFeet: 0 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(50000);
  });

  it("home office deduction limited to tentative profit of $1 (profit < $5/sqft × sqft)", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "10001",
      expenses: { supplies: "10000" },
      homeOffice: { method: "simplified", squareFeet: 100 },
    });
    // Tentative profit: $10,001 - $10,000 = $1; simplified calc: 100 × $5 = $500
    // Deduction limited to tentative profit
    expect(result.tentativeProfit.toNumber()).toBe(1);
    expect(result.homeOfficeDeduction.toNumber()).toBe(1);
    expect(result.netProfit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Vehicle Expenses — Additional Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Vehicle expense edge cases", () => {
  it("high-mileage vehicle deduction with other expenses combined", () => {
    // 20,000 miles at $0.70/mi = $14,000 vehicle deduction
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "80000",
      expenses: {
        carAndTruck: "14000",
        insurance: "3000",
        supplies: "2000",
      },
    });
    expect(result.expenseBreakdown["Car and truck"].toNumber()).toBe(14000);
    expect(result.totalExpenses.toNumber()).toBe(19000);
    expect(result.netProfit.toNumber()).toBe(61000);
  });

  it("vehicle expense as sole deduction on zero-profit business", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "7000",
      expenses: { carAndTruck: "7000" },
    });
    expect(result.tentativeProfit.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Large Revenue with Large Expenses — Decimal Precision
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Large revenue with large expenses precision", () => {
  it("$10M revenue minus $9.5M expenses yields exact $500K profit with no floating-point drift", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "10000000",
      costOfGoodsSold: "4000000",
      returnsAndAllowances: "500000",
      expenses: {
        contractLabor: "3000000",
        insurance: "200000",
        legalAndProfessional: "150000",
        officeExpense: "100000",
        supplies: "250000",
        travel: "100000",
        meals: "400000", // 50% = $200K
        utilities: "100000",
        otherExpenses: "200000",
      },
    });
    // Gross income: $10M - $500K - $4M = $5.5M
    expect(result.grossIncome.toNumber()).toBe(5500000);
    // Total expenses: 3M + 200K + 150K + 100K + 250K + 100K + 200K + 100K + 200K = $4.3M
    expect(result.totalExpenses.toNumber()).toBe(4300000);
    // Net: $5.5M - $4.3M = $1.2M
    expect(result.netProfit.toNumber()).toBe(1200000);
    expect(result.netProfit.toFixed(2)).toBe("1200000.00");
  });
});

// ═══════════════════════════════════════════════════════════
// Zero Revenue with Home Office — Cannot Create Loss
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Zero revenue with home office", () => {
  it("zero revenue: home office deduction is zero (cannot create loss)", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "0",
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    expect(result.grossReceipts.toNumber()).toBe(0);
    expect(result.tentativeProfit.toNumber()).toBe(0);
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });

  it("zero revenue with expenses: home office stays zero even though loss exists", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "0",
      expenses: { supplies: "3000" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    expect(result.tentativeProfit.toNumber()).toBe(-3000);
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(-3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Negative Net Profit — Federal Pipeline Interaction
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Negative net profit reduces total income", () => {
  it("large Schedule C loss offsets W-2 wages in total income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "20000", federalWithheld: "0" }],
      scheduleC: {
        expenses: { otherExpenses: "50000" },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C: $20K - $50K = -$30K loss
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(-30000);
    // Total income: $85K wages + (-$30K) = $55K
    expect(federal.totalIncome.toNumber()).toBe(55000);
  });
});

// ═══════════════════════════════════════════════════════════
// SE Tax Interaction — Deductible Half Reduces AGI
// ═══════════════════════════════════════════════════════════

describe("Schedule C - SE tax interaction with AGI", () => {
  it("Schedule C profit produces SE tax and deductible half lowers AGI below total income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Consulting Co", nonemployeeCompensation: "50000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C net: $50K
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(50000);
    // SE tax on $50K: $50K × 0.9235 = $46,175 × 15.3% = $7,064.78 (rounded)
    expect(federal.selfEmploymentTax.toNumber()).toBeGreaterThan(0);
    // Total income includes Schedule C profit
    expect(federal.totalIncome.toNumber()).toBe(135000); // $85K + $50K
    // AGI is reduced by deductible half of SE tax
    expect(federal.agi.toNumber()).toBeLessThan(135000);
    // Deductible half ≈ $3,532
    const deductibleHalf = d(135000).minus(federal.agi);
    expect(deductibleHalf.toNumber()).toBeGreaterThan(3000);
    expect(deductibleHalf.toNumber()).toBeLessThan(4000);
  });

  it("Schedule C net loss produces zero SE tax even when gross 1099-NEC exceeds $400", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }],
      scheduleC: {
        expenses: { supplies: "5500" },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C: $5K - $5.5K = -$500 loss
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(-500);
    // Net SE earnings negative → SE tax is zero
    expect(federal.selfEmploymentTax.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Multiple Schedule C Businesses (Aggregated via calculateScheduleC)
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Multiple businesses calculated independently", () => {
  it("two separate Schedule C calculations can be summed to represent multiple businesses", () => {
    // Business 1: Consulting
    const biz1 = calculateScheduleC(simpleW2Fixture, {
      businessName: "Consulting LLC",
      grossReceipts: "80000",
      expenses: { contractLabor: "20000", supplies: "5000" },
    });
    // Business 2: E-commerce
    const biz2 = calculateScheduleC(simpleW2Fixture, {
      businessName: "E-Shop",
      grossReceipts: "120000",
      costOfGoodsSold: "60000",
      expenses: { advertising: "10000", utilities: "3000" },
    });
    expect(biz1.netProfit.toNumber()).toBe(55000); // 80K - 25K
    expect(biz2.netProfit.toNumber()).toBe(47000); // (120K - 60K) - 13K

    // Combined net profit for both businesses
    const combinedProfit = biz1.netProfit.plus(biz2.netProfit);
    expect(combinedProfit.toNumber()).toBe(102000);
  });

  it("one profitable and one loss-making business: combined net is correct", () => {
    const profitable = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "60000",
      expenses: { supplies: "10000" },
    });
    const lossmaking = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "15000",
      expenses: { otherExpenses: "25000" },
    });
    expect(profitable.netProfit.toNumber()).toBe(50000);
    expect(lossmaking.netProfit.toNumber()).toBe(-10000);
    expect(profitable.netProfit.plus(lossmaking.netProfit).toNumber()).toBe(40000);
  });

  it("three businesses: two profitable, one loss — net sum reflects all three", () => {
    const bizA = calculateScheduleC(simpleW2Fixture, {
      businessName: "Design Studio",
      grossReceipts: "90000",
      expenses: { contractLabor: "30000", advertising: "5000" },
    });
    const bizB = calculateScheduleC(simpleW2Fixture, {
      businessName: "Online Store",
      grossReceipts: "40000",
      costOfGoodsSold: "18000",
      expenses: { utilities: "2000" },
    });
    const bizC = calculateScheduleC(simpleW2Fixture, {
      businessName: "Failed Venture",
      grossReceipts: "5000",
      expenses: { legalAndProfessional: "20000" },
    });
    // Biz A: 90K - 35K = $55K profit
    expect(bizA.netProfit.toNumber()).toBe(55000);
    // Biz B: (40K - 18K) - 2K = $20K profit
    expect(bizB.netProfit.toNumber()).toBe(20000);
    // Biz C: 5K - 20K = -$15K loss
    expect(bizC.netProfit.toNumber()).toBe(-15000);
    // Combined: 55K + 20K + (-15K) = $60K net
    const combined = bizA.netProfit.plus(bizB.netProfit).plus(bizC.netProfit);
    expect(combined.toNumber()).toBe(60000);
  });
});

// ═══════════════════════════════════════════════════════════
// Schedule C Feeding into QBI Deduction (Form 8995)
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Net profit feeds QBI deduction via Form 8995", () => {
  it("Schedule C profit below QBI threshold produces 20% Section 199A deduction", () => {
    // Single filer, $85K wages + $60K NEC → well below $197,300 QBI threshold
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Consulting Corp", nonemployeeCompensation: "60000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C net = $60K (no expenses)
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(60000);
    // Form 8995 must be computed (QBI source exists, income below threshold)
    expect(federal.form8995).toBeDefined();
    // Per IRS Form 8995 Instructions, QBI = Schedule C net profit - deductible half SE tax (§164(f))
    // SE: $60K × 0.9235 = $55,410 → SS $6,871 + MC $1,607 = $8,478 → deductible half = $4,239
    // QBI = $60K - $4,239 = $55,761; QBI component = 20% × $55,761 = $11,152
    expect(federal.form8995!.qbiComponent.toNumber()).toBe(11152);
    // QBI deduction is min(qbiComponent, incomeLimitation) — both > 0
    expect(federal.form8995!.qbiDeduction.toNumber()).toBeGreaterThan(0);
    expect(federal.form8995!.qbiDeduction.toNumber()).toBeLessThanOrEqual(11152);
  });

  it("Schedule C net loss produces zero QBI deduction and generates carryforward", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Client", nonemployeeCompensation: "10000", federalWithheld: "0" }],
      scheduleC: {
        expenses: { otherExpenses: "30000" },
      },
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C net: $10K - $30K = -$20K (QBI is negative)
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(-20000);
    // QBI deduction must be zero (no positive QBI to deduct 20% of)
    expect(federal.form8995).toBeDefined();
    expect(federal.form8995!.qbiDeduction.toNumber()).toBe(0);
    // Negative QBI carries forward to next year
    expect(federal.form8995!.qbiLossCarryforward.toNumber()).toBe(20000);
  });

  it("Schedule C profit above QBI threshold (single filer) means form8995 is not computed", () => {
    // Single filer: QBI threshold $197,300; with $85K wages + $500K NEC, AGI is far above
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "BigClient", nonemployeeCompensation: "500000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);
    // Schedule C net = $500K; total income is very high → above QBI threshold
    expect(federal.scheduleC!.netProfit.toNumber()).toBe(500000);
    // form8995 is undefined when taxable income exceeds simplified threshold
    expect(federal.form8995).toBeUndefined();
    // QBI deduction on 1040 Line 13 should be $0
    const qbiLine = federal.allLines.find((l) => l.form === "1040" && l.line === "13");
    expect(qbiLine).toBeDefined();
    expect(qbiLine!.value.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Very High Schedule C Income — SE Tax at $500K+
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Very high income SE tax implications ($500K+)", () => {
  it("$500K NEC income: SS portion capped by wage base, Medicare runs unbounded", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Enterprise Client", nonemployeeCompensation: "500000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);

    // SE uses 1099-NEC total directly: $500K × 0.9235 = $461,750 taxable earnings
    expect(federal.scheduleSE.taxableEarnings.toNumber()).toBe(461750);

    // W-2 SS wages = $85K; SS wage base = $176,100; remaining room = $91,100
    // SS portion: $91,100 × 12.4% = $11,296.40 → $11,296
    expect(federal.scheduleSE.socialSecurityPortion.toNumber()).toBe(11296);

    // Medicare portion (no cap): $461,750 × 2.9% = $13,390.75 → $13,391
    expect(federal.scheduleSE.medicarePortion.toNumber()).toBe(13391);

    // Total SE tax
    expect(federal.scheduleSE.totalSETax.toNumber()).toBe(24687);

    // SE tax is nonzero and significant
    expect(federal.selfEmploymentTax.toNumber()).toBe(24687);
  });

  it("$500K NEC income: deductible half of SE tax reduces AGI below total income", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Enterprise Client", nonemployeeCompensation: "500000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);

    // Total income: $85K wages + $500K sched C = $585K
    expect(federal.totalIncome.toNumber()).toBe(585000);

    // Deductible half: $24,687 × 0.5 = $12,343.50 → $12,344
    expect(federal.scheduleSE.deductibleHalf.toNumber()).toBe(12344);

    // AGI = $585K - $12,344 = $572,656
    expect(federal.agi.toNumber()).toBe(572656);
  });

  it("$500K NEC income: additional Medicare tax applies above $200K threshold", () => {
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "HighVolume LLC", nonemployeeCompensation: "500000", federalWithheld: "0" }],
    };
    const federal = calculateFederalTax(fixture);

    // SE net earnings ($500K) far exceeds additional Medicare threshold ($200K single)
    expect(federal.additionalMedicareTax.toNumber()).toBeGreaterThan(0);

    // Additional Medicare tax at 0.9% on wages + SE above $200K
    // Wages $85K + SE $461,750 = $546,750 total; above $200K threshold by $346,750
    // 0.9% × $346,750 ≈ $3,120.75 → but exact depends on form8959 implementation
    expect(federal.additionalMedicareTax.toNumber()).toBeGreaterThan(3000);
  });
});

// ═══════════════════════════════════════════════════════════
// Home Office — Exactly 300 vs 301 Square Feet
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Home office simplified method boundary at 300/301 sq ft", () => {
  it("exactly 300 sq ft: deduction equals $1,500 (the maximum)", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    // 300 sq ft × $5 = $1,500 — exactly the cap
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500);
    expect(result.netProfit.toNumber()).toBe(98500);
  });

  it("301 sq ft: deduction is still $1,500 — IRS cap prevents any more than 300 sq ft", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      homeOffice: { method: "simplified", squareFeet: 301 },
    });
    // min(301, 300) × $5 = 300 × $5 = $1,500 — identical to 300 sq ft
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500);
    // Net profit same as 300 sq ft case
    expect(result.netProfit.toNumber()).toBe(98500);
  });

  it("299 sq ft: deduction is $1,495 — one square foot below cap", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "100000",
      homeOffice: { method: "simplified", squareFeet: 299 },
    });
    // 299 sq ft × $5 = $1,495
    expect(result.homeOfficeDeduction.toNumber()).toBe(1495);
    expect(result.netProfit.toNumber()).toBe(98505);
  });
});

// ═══════════════════════════════════════════════════════════
// Meals 50% Rule — Additional Scenarios
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Meals 50% deduction additional scenarios", () => {
  it("large meals expense: only half deducted, net profit reflects the haircut", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "200000",
      expenses: { meals: "40000" },
    });
    // $40K meals × 50% = $20K deducted
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(20000);
    expect(result.totalExpenses.toNumber()).toBe(20000);
    // Net profit: $200K - $20K = $180K (not $160K — the full $40K is not deducted)
    expect(result.netProfit.toNumber()).toBe(180000);
  });

  it("odd-dollar meals: 50% rounds to nearest dollar per IRS rounding", () => {
    // $10,001 meals × 50% = $5,000.50 → rounds to $5,001
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      expenses: { meals: "10001" },
    });
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(5001);
    expect(result.netProfit.toNumber()).toBe(44999);
  });
});

// ═══════════════════════════════════════════════════════════
// Vehicle Standard Mileage + Other Expenses Combined
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Vehicle standard mileage combined with other expense categories", () => {
  it("mileage deduction combined with supplies, meals, and home office all interact correctly", () => {
    // 15,000 miles at $0.70/mi = $10,500 vehicle deduction
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "80000",
      expenses: {
        carAndTruck: "10500",  // 15K miles × $0.70
        supplies: "3000",
        meals: "2000",         // → $1,000 deducted at 50%
        insurance: "1500",
      },
      homeOffice: { method: "simplified", squareFeet: 200 }, // → $1,000 deduction
    });
    // Tentative profit: $80K - (10,500 + 3,000 + 1,000 + 1,500) = $80K - $16,000 = $64,000
    expect(result.tentativeProfit.toNumber()).toBe(64000);
    // Home office: min(200 × $5, tentativeProfit) = min($1,000, $64,000) = $1,000
    expect(result.homeOfficeDeduction.toNumber()).toBe(1000);
    // Net profit: $64,000 - $1,000 = $63,000
    expect(result.netProfit.toNumber()).toBe(63000);
    // Vehicle line in breakdown
    expect(result.expenseBreakdown["Car and truck"].toNumber()).toBe(10500);
    // Meals at 50%
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(1000);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail — Key Schedule C Lines
// ═══════════════════════════════════════════════════════════

describe("Schedule C - Audit trail records key form lines", () => {
  it("audit lines array contains all major Schedule C line numbers", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "60000",
      costOfGoodsSold: "5000",
      returnsAndAllowances: "1000",
      expenses: {
        advertising: "2000",
        meals: "3000",
        supplies: "4000",
      },
      homeOffice: { method: "simplified", squareFeet: 150 },
    });

    const lineNumbers = result.lines.map((l) => l.line);

    // Core income lines
    expect(lineNumbers).toContain("1");   // Gross receipts
    expect(lineNumbers).toContain("2");   // Returns and allowances
    expect(lineNumbers).toContain("3");   // COGS
    expect(lineNumbers).toContain("5");   // Gross income
    expect(lineNumbers).toContain("7");   // Gross profit

    // Key expense lines
    expect(lineNumbers).toContain("8");   // Advertising
    expect(lineNumbers).toContain("24b"); // Meals (50%)
    expect(lineNumbers).toContain("22");  // Supplies
    expect(lineNumbers).toContain("28");  // Total expenses

    // Net profit lines
    expect(lineNumbers).toContain("29");  // Tentative profit
    expect(lineNumbers).toContain("30");  // Home office deduction
    expect(lineNumbers).toContain("31");  // Net profit or loss

    // All lines must be on the "Sched C" form
    const nonSchedCLines = result.lines.filter((l) => l.form !== "Sched C");
    expect(nonSchedCLines).toHaveLength(0);
  });

  it("audit line values match result object fields exactly", () => {
    const result = calculateScheduleC(simpleW2Fixture, {
      grossReceipts: "50000",
      expenses: { supplies: "8000", meals: "4000" },
      homeOffice: { method: "simplified", squareFeet: 250 },
    });

    const findLine = (line: string) => result.lines.find((l) => l.line === line);

    // Line 1: gross receipts
    expect(findLine("1")!.value.toNumber()).toBe(result.grossReceipts.toNumber());
    // Line 5: gross income
    expect(findLine("5")!.value.toNumber()).toBe(result.grossIncome.toNumber());
    // Line 28: total expenses
    expect(findLine("28")!.value.toNumber()).toBe(result.totalExpenses.toNumber());
    // Line 29: tentative profit
    expect(findLine("29")!.value.toNumber()).toBe(result.tentativeProfit.toNumber());
    // Line 30: home office deduction
    expect(findLine("30")!.value.toNumber()).toBe(result.homeOfficeDeduction.toNumber());
    // Line 31: net profit
    expect(findLine("31")!.value.toNumber()).toBe(result.netProfit.toNumber());
  });
});

// ═══════════════════════════════════════════════════════════
// SE Health Insurance Cap (IRS Schedule 1 Instructions, Line 17)
// "You can't deduct more than the net profit you earned from the
// trade or business under which the insurance plan was established
// (reduced by any deductions you claim on Schedule 1, lines 15 and 16)."
// ═══════════════════════════════════════════════════════════

describe("Schedule C + SE Health Insurance cap through federal pipeline", () => {
  it("SE health insurance premiums capped at net profit minus deductible SE tax", () => {
    // $85K wages + $15K Schedule C net profit = $100K total income
    // SE tax on $15K: taxable = round(15000 × 0.9235) = $13,853
    //   SS portion = round(13853 × 0.124) = $1,718
    //   Medicare = round(13853 × 0.029) = $402
    //   Total SE = $2,120, deductible half = $1,060
    // SE health insurance cap = max(0, 15000 - 1060) = $13,940
    // Capped deduction = min(20000, 13940) = $13,940
    // Adjustments = 1060 + 13940 = $15,000
    // AGI = 100000 - 15000 = $85,000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Freelance", nonemployeeCompensation: "15000", federalWithheld: "0" }],
      adjustments: {
        ...simpleW2Fixture.adjustments!,
        selfEmployedHealthInsurance: "20000",
      },
    };
    const result = calculateFederalTax(fixture);
    // Verify the cap was applied — AGI should reflect capped deduction
    expect(result.agi.toNumber()).toBe(85000);
    // Adjustments should be deductible SE ($1,060) + capped insurance ($13,940)
    expect(result.adjustmentsToIncome.toNumber()).toBe(15000);
  });

  it("SE health insurance zero when Schedule C has net loss", () => {
    // $85K wages + Schedule C: $5K revenue - $15K expenses = -$10K loss
    // Net SE earnings ≤ 0 → SE tax = 0, deductible half = 0
    // Cap = max(0, -10000 - 0) = 0
    // SE health insurance deduction = min(12000, 0) = 0
    // AGI = (85000 + (-10000)) - 0 = $75,000
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Freelance", nonemployeeCompensation: "5000", federalWithheld: "0" }],
      scheduleC: { expenses: { otherExpenses: "15000" } },
      adjustments: {
        ...simpleW2Fixture.adjustments!,
        selfEmployedHealthInsurance: "12000",
      },
    };
    const result = calculateFederalTax(fixture);
    // No SE tax deduction (loss), no SE health insurance (cap = 0)
    expect(result.adjustmentsToIncome.toNumber()).toBe(0);
    expect(result.agi.toNumber()).toBe(75000);
  });

  it("SE health insurance below cap passes through unchanged", () => {
    // $85K wages + $80K Schedule C = $165K total income
    // SE on $80K: taxable = round(80000 × 0.9235) = $73,880
    //   SS = round(73880 × 0.124) = $9,161
    //   Medicare = round(73880 × 0.029) = $2,143
    //   Total SE = $11,304, deductible half = $5,652
    // Cap = max(0, 80000 - 5652) = $74,348
    // $14,000 < $74,348 → no cap hit
    // Adjustments = 5652 + 14000 = $19,652
    // AGI = 165000 - 19652 = $145,348
    const fixture: TaxYearInput = {
      ...simpleW2Fixture,
      form1099Nec: [{ payer: "Consulting", nonemployeeCompensation: "80000", federalWithheld: "0" }],
      adjustments: {
        ...simpleW2Fixture.adjustments!,
        selfEmployedHealthInsurance: "14000",
      },
    };
    const result = calculateFederalTax(fixture);
    expect(result.adjustmentsToIncome.toNumber()).toBe(19652);
    expect(result.agi.toNumber()).toBe(145348);
  });
});
