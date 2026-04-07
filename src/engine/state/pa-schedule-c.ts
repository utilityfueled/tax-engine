/**
 * Pennsylvania Schedule C — Profit or Loss from Business or Profession
 * Spec: spec/state/pa-schedule-c.yaml
 */

import Decimal from "decimal.js";
import { calculateForm8829 } from "@/engine/forms/form-8829.js";
import type { Form8829Input } from "@/models/inputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { roundDollar, sum } from "@/utils/decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

export interface PAScheduleCExpensesInput {
  advertising?: Decimal;
  amortization?: Decimal;
  badDebts?: Decimal;
  bankCharges?: Decimal;
  carAndTruck?: Decimal;
  commissionsAndFees?: Decimal;
  contractLabor?: Decimal;
  depletion?: Decimal;
  depreciation?: Decimal;
  duesAndPublications?: Decimal;
  employeeBenefitPrograms?: Decimal;
  businessInterest?: Decimal;
  freight?: Decimal;
  idcsAmortization?: Decimal;
  idcsCurrentExpensing?: Decimal;
  section179Expense?: Decimal;
  insurance?: Decimal;
  laundryAndCleaning?: Decimal;
  legalAndProfessional?: Decimal;
  managementFees?: Decimal;
  officeExpense?: Decimal;
  pensionAndProfitSharing?: Decimal;
  postage?: Decimal;
  rentOnBusinessProperty?: Decimal;
  repairsAndMaintenance?: Decimal;
  startupCostsDirectExpense?: Decimal;
  supplies?: Decimal;
  taxes?: Decimal;
  telephone?: Decimal;
  travel?: Decimal;
  meals?: Decimal;
  utilities?: Decimal;
  wages?: Decimal;
  otherExpenses?: Decimal;
}

export interface PAScheduleCHomeOfficeInput {
  method?: "actual" | "simplified";
  squareFeet?: number;
  actualAmount?: Decimal;
  form8829?: Form8829Input;
}

export interface PAScheduleCInput {
  taxYear: number;
  grossReceipts?: Decimal;
  returnsAndAllowances?: Decimal;
  costOfGoodsSold?: Decimal;
  otherIncome?: Decimal;
  expenses?: PAScheduleCExpensesInput;
  homeOffice?: PAScheduleCHomeOfficeInput;
}

export interface PAScheduleCResult {
  line1a: Decimal;
  line1b: Decimal;
  line1c: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5: Decimal;
  line6: Decimal;
  line7: Decimal;
  line8: Decimal;
  line9: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13a: Decimal;
  line13b: Decimal;
  line14: Decimal;
  line15: Decimal;
  line16: Decimal;
  line17: Decimal;
  line18: Decimal;
  line19: Decimal;
  line20: Decimal;
  line21: Decimal;
  line22: Decimal;
  line23: Decimal;
  line24: Decimal;
  line25: Decimal;
  line26: Decimal;
  line27: Decimal;
  line28: Decimal;
  line29: Decimal;
  line30: Decimal;
  line31: Decimal;
  line32: Decimal;
  line33: Decimal;
  line34: Decimal;
  line35: Decimal;
  line36: Decimal;
  line37: Decimal;
  line38: Decimal;
  line39: Decimal;
  lines: CalculatedLine[];
}

function normalizeAmount(value?: Decimal): Decimal {
  return roundDollar(value ?? new Decimal(0));
}

export function calculatePAScheduleC(input: PAScheduleCInput): PAScheduleCResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule C constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const expenses = input.expenses;

  const line1a = normalizeAmount(input.grossReceipts);
  const line1b = normalizeAmount(input.returnsAndAllowances);
  const line1c = line1a.minus(line1b);
  const line2 = normalizeAmount(input.costOfGoodsSold);
  const line3 = line1c.minus(line2);
  const line4 = normalizeAmount(input.otherIncome);
  const line5 = line3.plus(line4);
  const line37OtherExpenses = normalizeAmount(expenses?.otherExpenses);
  const expenseLines = {
    line6: normalizeAmount(expenses?.advertising),
    line7: normalizeAmount(expenses?.amortization),
    line8: normalizeAmount(expenses?.badDebts),
    line9: normalizeAmount(expenses?.bankCharges),
    line10: normalizeAmount(expenses?.carAndTruck),
    line11: normalizeAmount(expenses?.commissionsAndFees),
    line12: normalizeAmount(expenses?.depletion),
    line13a: normalizeAmount(expenses?.depreciation),
    line13b: normalizeAmount(expenses?.section179Expense),
    line14: normalizeAmount(expenses?.duesAndPublications),
    line15: normalizeAmount(expenses?.employeeBenefitPrograms),
    line16: normalizeAmount(expenses?.freight),
    line17: normalizeAmount(expenses?.insurance),
    line18: normalizeAmount(expenses?.businessInterest),
    line19: normalizeAmount(expenses?.laundryAndCleaning),
    line20: normalizeAmount(expenses?.legalAndProfessional),
    line21: normalizeAmount(expenses?.managementFees),
    line22: normalizeAmount(expenses?.officeExpense),
    line23: normalizeAmount(expenses?.pensionAndProfitSharing),
    line24: normalizeAmount(expenses?.postage),
    line25: normalizeAmount(expenses?.rentOnBusinessProperty),
    line26: normalizeAmount(expenses?.repairsAndMaintenance),
    line27: normalizeAmount(expenses?.contractLabor),
    line28: normalizeAmount(expenses?.supplies),
    line29: normalizeAmount(expenses?.taxes),
    line30: normalizeAmount(expenses?.telephone),
    line31: sum(normalizeAmount(expenses?.travel), normalizeAmount(expenses?.meals)),
    line32: normalizeAmount(expenses?.utilities),
    line33: normalizeAmount(expenses?.wages),
    line34: normalizeAmount(expenses?.idcsCurrentExpensing),
    line35: normalizeAmount(expenses?.idcsAmortization),
    line36: normalizeAmount(expenses?.startupCostsDirectExpense),
    line37: line37OtherExpenses,
  };
  const totalExpensesBeforeHomeOffice = sum(
    expenseLines.line6,
    expenseLines.line7,
    expenseLines.line8,
    expenseLines.line9,
    expenseLines.line10,
    expenseLines.line11,
    expenseLines.line12,
    expenseLines.line13a,
    expenseLines.line13b,
    expenseLines.line14,
    expenseLines.line15,
    expenseLines.line16,
    expenseLines.line17,
    expenseLines.line18,
    expenseLines.line19,
    expenseLines.line20,
    expenseLines.line21,
    expenseLines.line22,
    expenseLines.line23,
    expenseLines.line24,
    expenseLines.line25,
    expenseLines.line26,
    expenseLines.line27,
    expenseLines.line28,
    expenseLines.line29,
    expenseLines.line30,
    expenseLines.line31,
    expenseLines.line32,
    expenseLines.line33,
    expenseLines.line34,
    expenseLines.line35,
    expenseLines.line36,
    expenseLines.line37,
  );
  const tentativeProfitBeforeHomeOffice = line5.minus(totalExpensesBeforeHomeOffice);
  let homeOfficeExpense = new Decimal(0);

  if (input.homeOffice?.method === "actual") {
    if (input.homeOffice.form8829) {
      const form8829 = calculateForm8829({
        ...input.homeOffice.form8829,
        grossIncomeLimit:
          input.homeOffice.form8829.grossIncomeLimit
          ?? tentativeProfitBeforeHomeOffice.toString(),
      });
      audit.merge(form8829.lines);
      homeOfficeExpense = form8829.line36;
    } else {
      homeOfficeExpense = normalizeAmount(input.homeOffice.actualAmount);
    }
  }

  const line37 = expenseLines.line37.plus(homeOfficeExpense);
  const line38 = totalExpensesBeforeHomeOffice.plus(homeOfficeExpense);
  const line39 = line5.minus(line38);

  audit.record("PA-Schedule-C", "1a", "Gross receipts or sales", line1a, "Rounded gross receipts input");
  audit.record("PA-Schedule-C", "1b", "Returns and allowances", line1b, "Rounded returns and allowances input");
  audit.record("PA-Schedule-C", "1c", "Balance", line1c, "Line 1a - Line 1b");
  audit.record("PA-Schedule-C", "2", "Cost of goods sold and/or operations", line2, "Rounded cost of goods sold input");
  audit.record("PA-Schedule-C", "3", "Gross profit", line3, "Line 1c - Line 2");
  audit.record("PA-Schedule-C", "4", "Other income", line4, "Rounded other-income input");
  audit.record("PA-Schedule-C", "5", "Total income", line5, "Line 3 + Line 4");
  audit.record("PA-Schedule-C", "6", "Advertising", expenseLines.line6, "Rounded advertising expense");
  audit.record("PA-Schedule-C", "7", "Amortization", expenseLines.line7, "Rounded amortization expense");
  audit.record("PA-Schedule-C", "8", "Bad debts from sales or services", expenseLines.line8, "Rounded bad-debts expense");
  audit.record("PA-Schedule-C", "9", "Bank charges", expenseLines.line9, "Rounded bank-charges expense");
  audit.record("PA-Schedule-C", "10", "Car and truck expenses", expenseLines.line10, "Rounded car and truck expense");
  audit.record("PA-Schedule-C", "11", "Commissions and fees", expenseLines.line11, "Rounded commissions-and-fees expense");
  audit.record("PA-Schedule-C", "12", "Depletion", expenseLines.line12, "Rounded depletion expense");
  audit.record("PA-Schedule-C", "13a", "Regular depreciation", expenseLines.line13a, "Rounded Pennsylvania-adjusted depreciation expense");
  audit.record("PA-Schedule-C", "13b", "Section 179 expense", expenseLines.line13b, "Rounded Pennsylvania Section 179 expense input");
  audit.record("PA-Schedule-C", "14", "Dues and publications", expenseLines.line14, "Rounded dues-and-publications expense");
  audit.record("PA-Schedule-C", "15", "Employee benefit programs", expenseLines.line15, "Rounded employee-benefit-program expense");
  audit.record("PA-Schedule-C", "16", "Freight", expenseLines.line16, "Rounded freight expense");
  audit.record("PA-Schedule-C", "17", "Insurance", expenseLines.line17, "Rounded insurance expense");
  audit.record("PA-Schedule-C", "18", "Interest on business indebtedness", expenseLines.line18, "Rounded business-interest expense");
  audit.record("PA-Schedule-C", "19", "Laundry and cleaning", expenseLines.line19, "Rounded laundry-and-cleaning expense");
  audit.record("PA-Schedule-C", "20", "Legal and professional services", expenseLines.line20, "Rounded legal and professional expense");
  audit.record("PA-Schedule-C", "21", "Management fees", expenseLines.line21, "Rounded management-fees expense");
  audit.record("PA-Schedule-C", "22", "Office supplies", expenseLines.line22, "Rounded office-expense input");
  audit.record("PA-Schedule-C", "23", "Pension and profit-sharing plans for employees", expenseLines.line23, "Rounded employee pension-and-profit-sharing expense");
  audit.record("PA-Schedule-C", "24", "Postage", expenseLines.line24, "Rounded postage expense");
  audit.record("PA-Schedule-C", "25", "Rent on business property", expenseLines.line25, "Rounded rent expense");
  audit.record("PA-Schedule-C", "26", "Repairs and maintenance", expenseLines.line26, "Rounded repairs-and-maintenance expense");
  audit.record("PA-Schedule-C", "27", "Subcontractor fees", expenseLines.line27, "Rounded contract-labor expense");
  audit.record("PA-Schedule-C", "28", "Supplies", expenseLines.line28, "Rounded supplies expense");
  audit.record("PA-Schedule-C", "29", "Taxes", expenseLines.line29, "Rounded taxes expense");
  audit.record("PA-Schedule-C", "30", "Telephone", expenseLines.line30, "Rounded telephone expense");
  audit.record("PA-Schedule-C", "31", "Travel and entertainment", expenseLines.line31, "Rounded travel expense + rounded meals expense");
  audit.record("PA-Schedule-C", "32", "Utilities", expenseLines.line32, "Rounded utilities expense");
  audit.record("PA-Schedule-C", "33", "Wages", expenseLines.line33, "Rounded wages expense");
  audit.record("PA-Schedule-C", "34", "IDCs (1/3 current expensing)", expenseLines.line34, "Rounded Pennsylvania-allowable current IDC expense");
  audit.record("PA-Schedule-C", "35", "IDCs (amortization)", expenseLines.line35, "Rounded Pennsylvania IDC amortization expense");
  audit.record("PA-Schedule-C", "36", "Start-up costs (direct expense)", expenseLines.line36, "Rounded Pennsylvania-allowable direct start-up-cost expense");
  audit.record(
    "PA-Schedule-C",
    "37",
    "Total other expenses",
    line37,
    input.homeOffice?.method === "actual"
      ? "Rounded aggregate other-expenses input + allowable actual home-office expense"
      : input.homeOffice?.method === "simplified"
        ? "Rounded aggregate other-expenses input; federal simplified home-office method is not allowed for Pennsylvania"
        : "Rounded aggregate other-expenses input",
  );
  audit.record("PA-Schedule-C", "38", "Total expenses", line38, "Sum of supported Schedule C deduction lines");
  audit.record("PA-Schedule-C", "39", "Net profit or loss", line39, "Line 5 - Line 38");

  return {
    line1a,
    line1b,
    line1c,
    line2,
    line3,
    line4,
    line5,
    ...expenseLines,
    line37,
    line38,
    line39,
    lines: audit.getLines(),
  };
}
