/**
 * Tests for Schedule C — Profit or Loss From Business
 * Spec: spec/federal/schedule-c.yaml
 */

import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateScheduleC, type ScheduleCInput } from "@/engine/schedules/schedule-c.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const d = (n: number | string) => new Decimal(n);

function makeScheduleCFixture(
  necForms: TaxYearInput["form1099Nec"],
  scheduleCInput?: ScheduleCInput
): { input: TaxYearInput; scInput?: ScheduleCInput } {
  return {
    input: { ...simpleW2Fixture, form1099Nec: necForms },
    scInput: scheduleCInput,
  };
}

// ═══════════════════════════════════════════════════════════
// Income Lines (1-7)
// ═══════════════════════════════════════════════════════════

describe("Schedule C Income", () => {
  it("Schedule C Line 1 - gross receipts from 1099-NEC", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client A", nonemployeeCompensation: "10000", federalWithheld: "0" },
      { payer: "Client B", nonemployeeCompensation: "5000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input);
    expect(result.grossReceipts.toNumber()).toBe(15000);
  });

  it("Schedule C Line 1 - gross receipts override", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client A", nonemployeeCompensation: "10000", federalWithheld: "0" }],
      { grossReceipts: "20000" }
    );
    const result = calculateScheduleC(input, { grossReceipts: "20000" });
    expect(result.grossReceipts.toNumber()).toBe(20000);
  });

  it("Schedule C Line 2 - returns and allowances", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "10000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { returnsAndAllowances: "500" });
    expect(result.returnsAndAllowances.toNumber()).toBe(500);
    expect(result.grossIncome.toNumber()).toBe(9500);
  });

  it("Schedule C Line 3 - COGS", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "20000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { costOfGoodsSold: "3000" });
    expect(result.costOfGoodsSold.toNumber()).toBe(3000);
    expect(result.grossIncome.toNumber()).toBe(17000);
  });

  it("Schedule C Line 5 - gross income", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "25000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      returnsAndAllowances: "1000",
      costOfGoodsSold: "4000",
    });
    expect(result.grossIncome.toNumber()).toBe(20000); // 25000 - 1000 - 4000
  });

  it("Schedule C Line 7 - gross profit equals gross income for services", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "15000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input);
    expect(result.grossProfit.equals(result.grossIncome)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Expenses
// ═══════════════════════════════════════════════════════════

describe("Schedule C Expenses", () => {
  it("Schedule C expenses - advertising", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { advertising: "2000" } });
    expect(result.expenseBreakdown["Advertising"].toNumber()).toBe(2000);
  });

  it("Schedule C expenses - car and truck", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { carAndTruck: "3500" } });
    expect(result.expenseBreakdown["Car and truck"].toNumber()).toBe(3500);
  });

  it("Schedule C expenses - contract labor", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { contractLabor: "10000" } });
    expect(result.expenseBreakdown["Contract labor"].toNumber()).toBe(10000);
  });

  it("Schedule C Line 13 - Form 4562 total deduction flows through the depreciation line", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(
      {
        ...input,
        form4562: {
          section179ExpenseDeduction: "40000",
          specialDepreciationAllowance: "5000",
          macrsCurrentYearGdsDepreciation: "10000",
          listedPropertyDepreciation: "2000",
        },
      },
      {
        expenses: {
          advertising: "3000",
          depreciation: "999999",
        },
      }
    );

    expect(result.depreciationAndSection179Deduction.toNumber()).toBe(57000);
    expect(result.expenseBreakdown["Depreciation and section 179"].toNumber()).toBe(57000);
    expect(result.totalExpenses.toNumber()).toBe(60000);
    expect(result.netProfit.toNumber()).toBe(20000);
    expect(result.form4562?.line22.toNumber()).toBe(57000);

    const line13 = result.lines.find((line) => line.form === "Sched C" && line.line === "13");
    expect(line13?.formula).toContain("Form 4562");
  });

  it("Schedule C Line 13 - manual depreciation input is used when Form 4562 is absent", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "75000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { depreciation: "8500" },
    });

    expect(result.depreciationAndSection179Deduction.equals(d("8500"))).toBe(true);
    expect(result.expenseBreakdown["Depreciation and section 179"].equals(d("8500"))).toBe(true);
    expect(result.netProfit.toNumber()).toBe(66500);
  });

  it("Schedule C expenses - insurance", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { insurance: "1200" } });
    expect(result.expenseBreakdown["Insurance"].toNumber()).toBe(1200);
  });

  it("Schedule C expenses - legal and professional", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { legalAndProfessional: "5000" } });
    expect(result.expenseBreakdown["Legal and professional"].toNumber()).toBe(5000);
  });

  it("Schedule C expenses - office expense", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { officeExpense: "800" } });
    expect(result.expenseBreakdown["Office expense"].toNumber()).toBe(800);
  });

  it("Schedule C expenses - supplies", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { supplies: "600" } });
    expect(result.expenseBreakdown["Supplies"].toNumber()).toBe(600);
  });

  it("Schedule C expenses - travel", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { travel: "4000" } });
    expect(result.expenseBreakdown["Travel"].toNumber()).toBe(4000);
  });

  it("Schedule C expenses - meals at 50% deduction", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { meals: "2000" } });
    expect(result.expenseBreakdown["Meals (50%)"].toNumber()).toBe(1000); // 2000 × 50%
  });

  it("Schedule C expenses - utilities", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { utilities: "1500" } });
    expect(result.expenseBreakdown["Utilities"].toNumber()).toBe(1500);
  });

  it("Schedule C expenses - other", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, { expenses: { otherExpenses: "3000" } });
    expect(result.expenseBreakdown["Other expenses"].toNumber()).toBe(3000);
  });

  it("Schedule C Line 28 - total expenses", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: {
        advertising: "1000",
        officeExpense: "500",
        travel: "2000",
        meals: "1000", // 50% = $500
      },
    });
    expect(result.totalExpenses.toNumber()).toBe(4000); // 1000 + 500 + 2000 + 500
  });
});

// ═══════════════════════════════════════════════════════════
// Profit/Loss and Home Office
// ═══════════════════════════════════════════════════════════

describe("Schedule C Profit/Loss", () => {
  it("Schedule C Line 29 - tentative profit", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "30000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "5000" },
    });
    expect(result.tentativeProfit.toNumber()).toBe(25000);
  });

  it("Schedule C Line 29 - tentative loss", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { contractLabor: "8000" },
    });
    expect(result.tentativeProfit.toNumber()).toBe(-3000);
  });

  it("Schedule C Line 30 - home office deduction simplified method", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      homeOffice: { method: "simplified", squareFeet: 200 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(1000); // 200 × $5
  });

  it("Schedule C Line 30 - simplified home office capped at 300 sq ft", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      homeOffice: { method: "simplified", squareFeet: 500 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500); // 300 × $5 max
  });

  it("Schedule C Line 30 - simplified cannot create loss", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "2000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "2000" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    // Tentative profit = 0, so home office = 0
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
  });

  it("Schedule C Line 30 - simplified limited to tentative profit", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "4200" },
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    // Tentative profit = $800, simplified = $1500, limited to $800
    expect(result.homeOfficeDeduction.toNumber()).toBe(800);
  });

  it("Schedule C Line 30 - actual method", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      homeOffice: { method: "actual", actualAmount: "3500" },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(3500);
  });

  it("Schedule C Line 31 - net profit or loss", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "5000", travel: "3000" },
      homeOffice: { method: "simplified", squareFeet: 200 },
    });
    // Gross: 50000, Expenses: 8000, Tentative: 42000, Home office: 1000
    expect(result.netProfit.toNumber()).toBe(41000);
  });

  it("Schedule C - zero income zero expenses", () => {
    const { input } = makeScheduleCFixture([]);
    const result = calculateScheduleC(input);
    expect(result.grossReceipts.toNumber()).toBe(0);
    expect(result.totalExpenses.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule C - edge cases", () => {
  it("Schedule C - very high gross income $1M+", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Big Client", nonemployeeCompensation: "1200000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { contractLabor: "300000", advertising: "50000" },
    });
    expect(result.grossReceipts.toNumber()).toBe(1200000);
    expect(result.totalExpenses.toNumber()).toBe(350000);
    expect(result.netProfit.toNumber()).toBe(850000);
  });

  it("Schedule C - all expense categories present", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "100000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: {
        advertising: "2000",
        carAndTruck: "3000",
        contractLabor: "5000",
        insurance: "1200",
        legalAndProfessional: "2500",
        officeExpense: "800",
        supplies: "400",
        travel: "3000",
        meals: "2000", // 50% = $1000
        utilities: "1800",
        otherExpenses: "1500",
      },
    });
    // Sum: 2000+3000+5000+1200+2500+800+400+3000+1000+1800+1500 = 22200
    expect(result.totalExpenses.toNumber()).toBe(22200);
    expect(result.netProfit.toNumber()).toBe(77800);
  });

  it("Schedule C - expenses exceeding income (net loss)", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "5000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { contractLabor: "8000", supplies: "2000" },
    });
    expect(result.netProfit.toNumber()).toBe(-5000);
  });

  it("Schedule C - very small profit ($1)", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "1001", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "1000" },
    });
    expect(result.netProfit.toNumber()).toBe(1);
  });

  it("Schedule C - multiple 1099-NEC from different clients", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client A", nonemployeeCompensation: "25000", federalWithheld: "0" },
      { payer: "Client B", nonemployeeCompensation: "15000", federalWithheld: "0" },
      { payer: "Client C", nonemployeeCompensation: "10000", federalWithheld: "0" },
      { payer: "Client D", nonemployeeCompensation: "5000", federalWithheld: "0" },
      { payer: "Client E", nonemployeeCompensation: "3000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input);
    expect(result.grossReceipts.toNumber()).toBe(58000);
  });

  it("Schedule C - COGS and returns both reduce gross income", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "40000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      returnsAndAllowances: "2000",
      costOfGoodsSold: "8000",
    });
    expect(result.grossIncome.toNumber()).toBe(30000);
  });

  it("Schedule C - home office simplified at exactly 300 sq ft", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      homeOffice: { method: "simplified", squareFeet: 300 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(1500);
  });

  it("Schedule C - home office simplified at 1 sq ft", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      homeOffice: { method: "simplified", squareFeet: 1 },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(5);
  });

  it("Schedule C - fractional amounts preserve precision", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "12345.67", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "1234.56" },
    });
    expect(result.grossReceipts.equals(d("12345.67"))).toBe(true);
    expect(result.netProfit.equals(d("11111.11"))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════
// Audit Trail
// ═══════════════════════════════════════════════════════════

describe("Schedule C - audit trail", () => {
  it("produces comprehensive audit trail", () => {
    const { input } = makeScheduleCFixture(
      [{ payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" }]
    );
    const result = calculateScheduleC(input, {
      expenses: { advertising: "1000", meals: "500" },
      homeOffice: { method: "simplified", squareFeet: 150 },
    });
    const lineNumbers = result.lines.map((l) => l.line);
    expect(lineNumbers).toContain("1");
    expect(lineNumbers).toContain("5");
    expect(lineNumbers).toContain("28");
    expect(lineNumbers).toContain("29");
    expect(lineNumbers).toContain("30");
    expect(lineNumbers).toContain("31");
  });
});

// ═══════════════════════════════════════════════════════════
// New Edge Cases
// ═══════════════════════════════════════════════════════════

describe("Schedule C - net loss scenarios", () => {
  it("net loss has correct negative netProfit when all expense categories combined exceed income", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "10000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: {
        advertising: "3000",
        contractLabor: "5000",
        insurance: "2000",
        supplies: "1500",
        utilities: "1000",
      },
    });
    // Total expenses: 12500, gross income: 10000 → net loss of 2500
    expect(result.totalExpenses.toNumber()).toBe(12500);
    expect(result.tentativeProfit.toNumber()).toBe(-2500);
    expect(result.netProfit.toNumber()).toBe(-2500);
    expect(result.netProfit.isNegative()).toBe(true);
  });

  it("net loss with home office simplified method stays as loss (home office does not reduce further)", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "8000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { otherExpenses: "10000" },
      homeOffice: { method: "simplified", squareFeet: 200 },
    });
    // Tentative profit: -2000; simplified home office cannot apply when tentative ≤ 0
    expect(result.tentativeProfit.toNumber()).toBe(-2000);
    expect(result.homeOfficeDeduction.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(-2000);
  });
});

describe("Schedule C - vehicle standard mileage rate", () => {
  it("standard mileage rate 10000 miles at $0.70/mile yields $7000 carAndTruck deduction", () => {
    const miles = 10000;
    const ratePerMile = new Decimal("0.70");
    const vehicleDeduction = ratePerMile.times(miles).toString(); // "7000"

    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { carAndTruck: vehicleDeduction },
    });
    expect(result.expenseBreakdown["Car and truck"].toNumber()).toBe(7000);
    expect(result.netProfit.toNumber()).toBe(43000);
  });

  it("standard mileage rate 15000 miles at $0.70/mile combined with other expenses", () => {
    const vehicleDeduction = new Decimal("0.70").times(15000).toString(); // "10500"

    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: {
        carAndTruck: vehicleDeduction,
        insurance: "2000",
        supplies: "1500",
      },
    });
    expect(result.expenseBreakdown["Car and truck"].toNumber()).toBe(10500);
    expect(result.totalExpenses.toNumber()).toBe(14000); // 10500 + 2000 + 1500
    expect(result.netProfit.toNumber()).toBe(66000);
  });
});

describe("Schedule C - multiple Schedule C businesses", () => {
  it("two businesses calculated independently produce correct individual net profits", () => {
    const { input: input1 } = makeScheduleCFixture([
      { payer: "Consulting Client", nonemployeeCompensation: "60000", federalWithheld: "0" },
    ]);
    const { input: input2 } = makeScheduleCFixture([
      { payer: "Design Client", nonemployeeCompensation: "30000", federalWithheld: "0" },
    ]);

    const biz1 = calculateScheduleC(input1, {
      businessName: "Consulting LLC",
      expenses: { contractLabor: "10000", officeExpense: "2000" },
    });
    const biz2 = calculateScheduleC(input2, {
      businessName: "Design Studio",
      expenses: { supplies: "5000", advertising: "1000" },
    });

    expect(biz1.netProfit.toNumber()).toBe(48000); // 60000 - 12000
    expect(biz2.netProfit.toNumber()).toBe(24000); // 30000 - 6000
    // Combined profit is the sum of independent results
    expect(biz1.netProfit.plus(biz2.netProfit).toNumber()).toBe(72000);
  });

  it("profitable and loss-making businesses have independent audit trails", () => {
    const { input: input1 } = makeScheduleCFixture([
      { payer: "Profitable Co", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const { input: input2 } = makeScheduleCFixture([
      { payer: "Loss Co", nonemployeeCompensation: "5000", federalWithheld: "0" },
    ]);

    const profitable = calculateScheduleC(input1, { expenses: { supplies: "5000" } });
    const lossmaker = calculateScheduleC(input2, { expenses: { otherExpenses: "12000" } });

    expect(profitable.netProfit.toNumber()).toBe(45000);
    expect(lossmaker.netProfit.toNumber()).toBe(-7000);
    // Each has its own complete audit trail
    expect(profitable.lines.length).toBeGreaterThan(0);
    expect(lossmaker.lines.length).toBeGreaterThan(0);
    // Line 31 in each trail reflects the correct individual result
    const profit31 = profitable.lines.find((l) => l.line === "31");
    const loss31 = lossmaker.lines.find((l) => l.line === "31");
    expect(profit31!.value.toNumber()).toBe(45000);
    expect(loss31!.value.toNumber()).toBe(-7000);
  });
});

describe("Schedule C - gross income exactly zero", () => {
  it("gross income is exactly zero when COGS equals gross receipts with no returns", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Store Client", nonemployeeCompensation: "20000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, { costOfGoodsSold: "20000" });
    expect(result.grossReceipts.toNumber()).toBe(20000);
    expect(result.costOfGoodsSold.toNumber()).toBe(20000);
    expect(result.grossIncome.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });

  it("gross income is exactly zero when returns equal gross receipts", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "15000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, { returnsAndAllowances: "15000" });
    expect(result.grossIncome.toNumber()).toBe(0);
    expect(result.tentativeProfit.toNumber()).toBe(0);
    expect(result.netProfit.toNumber()).toBe(0);
  });
});

describe("Schedule C - cost of goods sold calculation", () => {
  it("COGS reduces gross income and net profit by the same amount", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Retailer", nonemployeeCompensation: "100000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      costOfGoodsSold: "35000",
      expenses: { advertising: "5000" },
    });
    // Gross income: 100000 - 35000 = 65000
    expect(result.grossIncome.toNumber()).toBe(65000);
    // Net profit: 65000 - 5000 = 60000
    expect(result.netProfit.toNumber()).toBe(60000);
    // The COGS reduction equals the difference between gross receipts and gross income
    expect(result.grossReceipts.minus(result.grossIncome).toNumber()).toBe(35000);
  });

  it("COGS combined with returns and allowances both reduce gross income cumulatively", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Wholesaler", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      returnsAndAllowances: "3000",
      costOfGoodsSold: "12000",
    });
    // Gross income: 50000 - 3000 - 12000 = 35000
    expect(result.grossIncome.toNumber()).toBe(35000);
    expect(result.netProfit.toNumber()).toBe(35000);
  });
});

describe("Schedule C - business use of home percentage method", () => {
  it("actual method deducts the provided Form 8829 calculated amount directly", () => {
    // Business use percentage: 250 sq ft office / 2000 sq ft home = 12.5%
    // Annual home costs: $24000 × 12.5% = $3000 home office deduction (pre-calculated via Form 8829)
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "60000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      homeOffice: { method: "actual", actualAmount: "3000" },
    });
    expect(result.homeOfficeDeduction.toNumber()).toBe(3000);
    expect(result.netProfit.toNumber()).toBe(57000);
  });

  it("actual method can calculate the Form 8829 amount from home-office facts", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "60000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      homeOffice: {
        method: "actual",
        form8829: {
          areaUsedForBusiness: 300,
          totalAreaOfHome: 1500,
          directExpenses: {
            repairsAndMaintenance: "400",
          },
          indirectExpenses: {
            deductibleMortgageInterest: "6000",
            realEstateTaxes: "3000",
            insurance: "1200",
            utilities: "2400",
            repairsAndMaintenance: "1000",
            otherExpenses: "600",
          },
          adjustedBasisOrFairMarketValue: "240000",
          landValue: "60000",
          depreciationPercentage: "0.02564",
        },
      },
    });
    const line30 = result.lines.find((line) => line.line === "30");

    expect(result.homeOfficeDeduction.toNumber()).toBe(4163);
    expect(result.netProfit.toNumber()).toBe(55837);
    expect(line30?.formula).toContain("Form 8829");
  });

  it("actual method with larger home office deduction than simplified cap", () => {
    // Actual method can exceed $1500 (the simplified cap) when home costs are high
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "80000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      homeOffice: { method: "actual", actualAmount: "4200" },
    });
    // Actual method allows deduction above the $1500 simplified ceiling
    expect(result.homeOfficeDeduction.toNumber()).toBe(4200);
    expect(result.homeOfficeDeduction.toNumber()).toBeGreaterThan(1500);
    expect(result.netProfit.toNumber()).toBe(75800);
  });
});

describe("Schedule C - audit trail line verification", () => {
  it("audit trail line 1 value matches grossReceipts", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "45000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input);
    const line1 = result.lines.find((l) => l.line === "1");
    expect(line1).toBeDefined();
    expect(line1!.value.toNumber()).toBe(45000);
    expect(line1!.value.equals(result.grossReceipts)).toBe(true);
  });

  it("audit trail line 28 value matches totalExpenses", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { advertising: "2000", supplies: "3000", travel: "1000" },
    });
    const line28 = result.lines.find((l) => l.line === "28");
    expect(line28).toBeDefined();
    expect(line28!.value.toNumber()).toBe(6000);
    expect(line28!.value.equals(result.totalExpenses)).toBe(true);
  });

  it("audit trail line 31 value matches netProfit including home office deduction", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "40000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { officeExpense: "5000" },
      homeOffice: { method: "simplified", squareFeet: 250 },
    });
    // Tentative profit: 35000; home office: 250 × $5 = $1250
    const line31 = result.lines.find((l) => l.line === "31");
    expect(line31).toBeDefined();
    expect(line31!.value.toNumber()).toBe(33750);
    expect(line31!.value.equals(result.netProfit)).toBe(true);
  });

  it("audit trail contains entries for all expense lines including 24b meals", () => {
    const { input } = makeScheduleCFixture([
      { payer: "Client", nonemployeeCompensation: "50000", federalWithheld: "0" },
    ]);
    const result = calculateScheduleC(input, {
      expenses: { meals: "3000" },
    });
    const lineNumbers = result.lines.map((l) => l.line);
    // Meals are on line 24b
    expect(lineNumbers).toContain("24b");
    const line24b = result.lines.find((l) => l.line === "24b");
    // Deductible meals = 50% of input
    expect(line24b!.value.toNumber()).toBe(1500);
  });
});
