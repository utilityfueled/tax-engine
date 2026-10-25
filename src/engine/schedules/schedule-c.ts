/**
 * Schedule C — Profit or Loss From Business (Sole Proprietorship)
 * Spec: spec/federal/schedule-c.yaml
 *
 * Reports income/expenses from self-employment. Net profit flows to
 * Form 1040 and Schedule SE.
 */

import Decimal from "decimal.js";
import type { Form8829Input, TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, min, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import type { Form4562Result } from "@/engine/forms/form-4562.js";
import { calculateForm4562 } from "@/engine/forms/form-4562.js";
import { calculateForm8829 } from "@/engine/forms/form-8829.js";

/** Business expense categories matching Schedule C line items */
export interface BusinessExpenses {
  advertising?: string; // Line 8
  carAndTruck?: string; // Line 9
  contractLabor?: string; // Line 11
  depreciation?: string; // Line 13
  insurance?: string; // Line 15
  legalAndProfessional?: string; // Line 17
  officeExpense?: string; // Line 18
  supplies?: string; // Line 22
  travel?: string; // Line 24a
  meals?: string; // Line 24b (input is full amount; 50% deduction applied)
  utilities?: string; // Line 25
  otherExpenses?: string; // Line 27
}

export interface HomeOfficeDeduction {
  method: "simplified" | "actual";
  squareFeet?: number; // For simplified method (max 300)
  actualAmount?: string; // For actual method (Form 8829 result)
  form8829?: Form8829Input; // For actual method calculated from Form 8829 inputs
}

export interface ScheduleCInput {
  businessName?: string;
  businessCode?: string; // NAICS code
  ein?: string;
  accountingMethod?: "cash" | "accrual";
  grossReceipts?: string; // Line 1 (override — otherwise sum of 1099-NEC)
  returnsAndAllowances?: string; // Line 2
  costOfGoodsSold?: string; // Line 4
  otherIncome?: string; // Line 6, separate from gross receipts
  expenses?: BusinessExpenses;
  homeOffice?: HomeOfficeDeduction;
}

export interface ScheduleCResult {
  grossReceipts: Decimal; // Line 1
  returnsAndAllowances: Decimal; // Line 2
  netReceipts: Decimal; // Line 3
  costOfGoodsSold: Decimal; // Line 4
  grossProfit: Decimal; // Line 5
  otherIncome: Decimal; // Line 6
  grossIncome: Decimal; // Line 7

  // Expenses
  depreciationAndSection179Deduction: Decimal; // Line 13
  expenseBreakdown: Record<string, Decimal>;
  totalExpenses: Decimal; // Line 28

  tentativeProfit: Decimal; // Line 29
  homeOfficeDeduction: Decimal; // Line 30
  netProfit: Decimal; // Line 31
  form4562?: Form4562Result;

  lines: CalculatedLine[];
}

const MEAL_DEDUCTION_RATE = new Decimal(0.5);
const SIMPLIFIED_HOME_OFFICE_RATE = new Decimal(5); // $5/sq ft
const SIMPLIFIED_HOME_OFFICE_MAX_SQFT = 300;
const SIMPLIFIED_HOME_OFFICE_MAX = new Decimal(1500);

export function calculateScheduleC(
  input: TaxYearInput,
  scheduleCInput?: ScheduleCInput
): ScheduleCResult {
  const audit = new AuditTrail();

  // Line 1: Gross receipts
  const necTotal = input.form1099Nec.reduce(
    (acc, f) => acc.plus(d(f.nonemployeeCompensation)),
    new Decimal(0)
  );
  const grossReceipts = scheduleCInput?.grossReceipts
    ? d(scheduleCInput.grossReceipts)
    : necTotal;
  audit.record("Sched C", "1", "Gross receipts or sales", grossReceipts, "Sum of 1099-NEC + other business income");

  // Line 2: Returns and allowances
  const returnsAndAllowances = d(scheduleCInput?.returnsAndAllowances);
  audit.record("Sched C", "2", "Returns and allowances", returnsAndAllowances, "Refunds/rebates");

  // Lines 3–7: receipts, cost of goods, and separately reported other income.
  const netReceipts = grossReceipts.minus(returnsAndAllowances);
  audit.record("Sched C", "3", "Net receipts", netReceipts, "Line 1 - Line 2");
  const costOfGoodsSold = d(scheduleCInput?.costOfGoodsSold);
  audit.record("Sched C", "4", "Cost of goods sold", costOfGoodsSold, "Line 42 (inventory calculation)");
  const grossProfit = netReceipts.minus(costOfGoodsSold);
  audit.record("Sched C", "5", "Gross profit", grossProfit, "Line 3 - Line 4");
  const otherIncome = d(scheduleCInput?.otherIncome);
  audit.record("Sched C", "6", "Other business income", otherIncome, "Actual income classified separately from gross receipts");
  const grossIncome = grossProfit.plus(otherIncome);
  audit.record("Sched C", "7", "Gross income", grossIncome, "Line 5 + Line 6");

  // ── Expenses (Lines 8-27) ────────────────────────────
  const expenses = scheduleCInput?.expenses ?? {};
  const expenseBreakdown: Record<string, Decimal> = {};
  const form4562 = input.form4562 ? calculateForm4562(input.form4562) : undefined;
  if (form4562) {
    audit.merge(form4562.lines);
  }

  const addExpense = (line: string, label: string, amount: string | undefined): Decimal => {
    const val = d(amount);
    expenseBreakdown[label] = val;
    audit.record("Sched C", line, label, val, `Business ${label.toLowerCase()}`);
    return val;
  };

  let totalExpenses = new Decimal(0);
  totalExpenses = totalExpenses.plus(addExpense("8", "Advertising", expenses.advertising));
  totalExpenses = totalExpenses.plus(addExpense("9", "Car and truck", expenses.carAndTruck));
  totalExpenses = totalExpenses.plus(addExpense("11", "Contract labor", expenses.contractLabor));
  const depreciationAndSection179Deduction = form4562?.line22 ?? d(expenses.depreciation);
  expenseBreakdown["Depreciation and section 179"] = depreciationAndSection179Deduction;
  audit.record(
    "Sched C",
    "13",
    "Depreciation and section 179 expense deduction",
    depreciationAndSection179Deduction,
    form4562 ? "Form 4562 Line 22" : "Validated manual Schedule C depreciation amount",
    form4562
      ? { "Form 4562 Line 22": form4562.line22 }
      : { "Validated manual Schedule C depreciation amount": d(expenses.depreciation) }
  );
  totalExpenses = totalExpenses.plus(depreciationAndSection179Deduction);
  totalExpenses = totalExpenses.plus(addExpense("15", "Insurance", expenses.insurance));
  totalExpenses = totalExpenses.plus(addExpense("17", "Legal and professional", expenses.legalAndProfessional));
  totalExpenses = totalExpenses.plus(addExpense("18", "Office expense", expenses.officeExpense));
  totalExpenses = totalExpenses.plus(addExpense("22", "Supplies", expenses.supplies));
  totalExpenses = totalExpenses.plus(addExpense("24a", "Travel", expenses.travel));

  // Meals at 50%
  const fullMeals = d(expenses.meals);
  const deductibleMeals = roundDollar(fullMeals.times(MEAL_DEDUCTION_RATE));
  expenseBreakdown["Meals (50%)"] = deductibleMeals;
  audit.record("Sched C", "24b", "Deductible meals (50%)", deductibleMeals, `${fullMeals} × 50%`);
  totalExpenses = totalExpenses.plus(deductibleMeals);

  totalExpenses = totalExpenses.plus(addExpense("25", "Utilities", expenses.utilities));
  totalExpenses = totalExpenses.plus(addExpense("27b", "Other expenses", expenses.otherExpenses));

  // Line 28: Total expenses
  audit.record("Sched C", "28", "Total expenses", totalExpenses, "Sum of Lines 8-27");

  // Line 29: Tentative profit
  const tentativeProfit = grossIncome.minus(totalExpenses);
  audit.record("Sched C", "29", "Tentative profit or loss", tentativeProfit, "Line 7 - Line 28");

  // Line 30: Home office deduction
  let homeOfficeDeduction = new Decimal(0);
  if (scheduleCInput?.homeOffice) {
    const ho = scheduleCInput.homeOffice;
    if (ho.method === "simplified") {
      const sqft = Math.min(ho.squareFeet ?? 0, SIMPLIFIED_HOME_OFFICE_MAX_SQFT);
      homeOfficeDeduction = min(
        SIMPLIFIED_HOME_OFFICE_RATE.times(sqft),
        SIMPLIFIED_HOME_OFFICE_MAX
      );
      // Simplified method cannot create a loss
      if (tentativeProfit.lessThanOrEqualTo(0)) {
        homeOfficeDeduction = new Decimal(0);
      } else {
        homeOfficeDeduction = min(homeOfficeDeduction, tentativeProfit);
      }
    } else if (ho.method === "actual") {
      if (ho.form8829) {
        const form8829 = calculateForm8829({
          ...ho.form8829,
          grossIncomeLimit: ho.form8829.grossIncomeLimit ?? tentativeProfit.toString(),
        });
        audit.merge(form8829.lines);
        homeOfficeDeduction = form8829.line36;
      } else {
        homeOfficeDeduction = d(ho.actualAmount);
      }
    }
  }
  audit.record("Sched C", "30", "Home office deduction", homeOfficeDeduction,
    scheduleCInput?.homeOffice?.method === "actual" && scheduleCInput.homeOffice.form8829
      ? "Form 8829 Line 36 or simplified method"
      : "Form 8829 or simplified method");

  // Line 31: Net profit or loss
  const netProfit = tentativeProfit.minus(homeOfficeDeduction);
  audit.record("Sched C", "31", "Net profit or loss", netProfit, "Line 29 - Line 30");

  return {
    grossReceipts,
    returnsAndAllowances,
    netReceipts,
    costOfGoodsSold,
    grossIncome,
    grossProfit,
    otherIncome,
    depreciationAndSection179Deduction,
    expenseBreakdown,
    totalExpenses,
    tentativeProfit,
    homeOfficeDeduction,
    netProfit,
    form4562,
    lines: audit.getLines(),
  };
}
