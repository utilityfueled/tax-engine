/**
 * Schedule F — Profit or Loss From Farming
 * Spec: spec/federal/schedule-f.yaml
 *
 * Reports income and expenses from farming operations where the taxpayer
 * materially participates. Net farm profit or loss (Line 34) flows to
 * Schedule 1 Line 6 and Schedule SE Line 1a/4a.
 *
 * This slice implements the cash-method path (Part I and Part II).
 * Conservation expenses (Line 12) are capped at 25% of gross farm income
 * per IRC section 175.
 */

import Decimal from "decimal.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { d, sum, min, zeroFloor, roundDollar } from "@/utils/decimal.js";
import { AuditTrail } from "@/utils/audit.js";

const ZERO = new Decimal(0);
const CONSERVATION_CAP_RATE = new Decimal(0.25);

export interface ScheduleFInput {
  principalCropOrActivity?: string;
  activityCode?: string;
  ein?: string;
  accountingMethod?: "cash" | "accrual";
  materiallyParticipated?: boolean;
  // Part I: Farm Income — Cash Method
  salesOfPurchasedLivestock?: string;
  costOfPurchasedLivestock?: string;
  salesOfProductsRaised?: string;
  cooperativeDistributions?: string;
  agriculturalProgramPayments?: string;
  cccLoansElected?: string;
  cccLoansForfeited?: string;
  cropInsuranceProceeds?: string;
  priorYearDeferredCropInsurance?: string;
  customHireIncome?: string;
  otherFarmIncome?: string;
  // Part II: Farm Expenses
  expenses?: FarmExpenses;
  conservationCarryforward?: string;
}

export interface FarmExpenses {
  carAndTruck?: string;
  chemicals?: string;
  conservation?: string;
  customHire?: string;
  depreciation?: string;
  employeeBenefits?: string;
  feed?: string;
  fertilizersAndLime?: string;
  freightAndTrucking?: string;
  gasolineFuelOil?: string;
  insurance?: string;
  mortgageInterest?: string;
  otherInterest?: string;
  laborHired?: string;
  pensionAndProfitSharing?: string;
  rentLeaseVehicles?: string;
  rentLeaseOther?: string;
  repairsAndMaintenance?: string;
  seedsAndPlants?: string;
  storageAndWarehousing?: string;
  supplies?: string;
  taxes?: string;
  utilities?: string;
  veterinaryBreedingMedicine?: string;
  otherExpenses?: string;
}

export interface ScheduleFResult {
  // Part I
  netPurchasedLivestock: Decimal;   // Line 1c
  grossFarmIncome: Decimal;         // Line 9

  // Part II
  conservationDeduction: Decimal;   // Line 12 (after 25% cap)
  conservationCarryforward: Decimal; // Excess over cap
  totalExpenses: Decimal;           // Line 33
  expenseBreakdown: Record<string, Decimal>;

  // Result
  netFarmProfit: Decimal;           // Line 34

  lines: CalculatedLine[];
}

export function calculateScheduleF(
  input?: ScheduleFInput,
  options: { dependentCareBenefitsAdjustment?: Decimal } = {},
): ScheduleFResult {
  const audit = new AuditTrail();

  if (!input) {
    return {
      netPurchasedLivestock: ZERO,
      grossFarmIncome: ZERO,
      conservationDeduction: ZERO,
      conservationCarryforward: ZERO,
      totalExpenses: ZERO,
      expenseBreakdown: {},
      netFarmProfit: ZERO,
      lines: [],
    };
  }

  // ── Part I: Farm Income — Cash Method ─────────────────────

  // Line 1a/1b/1c: Purchased livestock net
  const salesPurchased = d(input.salesOfPurchasedLivestock);
  const costPurchased = d(input.costOfPurchasedLivestock);
  const netPurchasedLivestock = salesPurchased.minus(costPurchased);
  audit.record("Sched F", "1a", "Sales of purchased livestock", salesPurchased, "Gross sales of purchased items");
  audit.record("Sched F", "1b", "Cost of purchased livestock", costPurchased, "Cost basis of purchased items");
  audit.record("Sched F", "1c", "Net purchased livestock", netPurchasedLivestock, "Line 1a - Line 1b");

  // Lines 2-8: Other income items
  const salesRaised = d(input.salesOfProductsRaised);
  audit.record("Sched F", "2", "Sales of products raised", salesRaised, "Livestock, produce, grains raised");

  const coopDistributions = d(input.cooperativeDistributions);
  audit.record("Sched F", "3b", "Cooperative distributions", coopDistributions, "Taxable cooperative distributions");

  const agProgramPayments = d(input.agriculturalProgramPayments);
  audit.record("Sched F", "4b", "Agricultural program payments", agProgramPayments, "Taxable ag program payments");

  const cccLoansElected = d(input.cccLoansElected);
  audit.record("Sched F", "5a", "CCC loans elected", cccLoansElected, "CCC loan proceeds elected as income");

  const cccLoansForfeited = d(input.cccLoansForfeited);
  audit.record("Sched F", "5c", "CCC loans forfeited", cccLoansForfeited, "Taxable forfeited CCC loans");

  const cropInsurance = d(input.cropInsuranceProceeds);
  audit.record("Sched F", "6b", "Crop insurance proceeds", cropInsurance, "Taxable crop insurance and disaster payments");

  const priorYearDeferred = d(input.priorYearDeferredCropInsurance);
  audit.record("Sched F", "6d", "Prior-year deferred crop insurance", priorYearDeferred, "Deferred from prior year");

  const customHireIncome = d(input.customHireIncome);
  audit.record("Sched F", "7", "Custom hire income", customHireIncome, "Machine work income");

  const otherIncome = d(input.otherFarmIncome);
  audit.record("Sched F", "8", "Other farm income", otherIncome, "Bartering, canceled debt, fuel credits, etc.");

  // Line 9: Gross farm income
  const grossFarmIncome = sum(
    netPurchasedLivestock,
    salesRaised,
    coopDistributions,
    agProgramPayments,
    cccLoansElected,
    cccLoansForfeited,
    cropInsurance,
    priorYearDeferred,
    customHireIncome,
    otherIncome
  );
  audit.record("Sched F", "9", "Gross farm income", grossFarmIncome,
    "Line 1c + 2 + 3b + 4b + 5a + 5c + 6b + 6d + 7 + 8");

  // ── Part II: Farm Expenses ────────────────────────────────
  const expenses = input.expenses ?? {};
  const expenseBreakdown: Record<string, Decimal> = {};

  const addExpense = (line: string, label: string, amount: string | undefined): Decimal => {
    const val = d(amount);
    expenseBreakdown[label] = val;
    audit.record("Sched F", line, label, val, `Farm ${label.toLowerCase()}`);
    return val;
  };

  let totalExpenses = ZERO;
  totalExpenses = totalExpenses.plus(addExpense("10", "Car and truck", expenses.carAndTruck));
  totalExpenses = totalExpenses.plus(addExpense("11", "Chemicals", expenses.chemicals));

  // Line 12: Conservation expenses — capped at 25% of gross farm income (IRC section 175)
  const rawConservation = d(expenses.conservation).plus(d(input.conservationCarryforward));
  const conservationCap = roundDollar(grossFarmIncome.times(CONSERVATION_CAP_RATE));
  const conservationDeduction = grossFarmIncome.greaterThan(ZERO)
    ? min(rawConservation, conservationCap)
    : ZERO;
  const conservationCarryforward = zeroFloor(rawConservation.minus(conservationDeduction));
  expenseBreakdown["Conservation"] = conservationDeduction;
  audit.record("Sched F", "12", "Conservation expenses", conservationDeduction,
    `min(${rawConservation}, 25% × ${grossFarmIncome} = ${conservationCap})`, {
      "Raw conservation + carryforward": rawConservation,
      "25% cap": conservationCap,
      "Carryforward to next year": conservationCarryforward,
    });
  totalExpenses = totalExpenses.plus(conservationDeduction);

  totalExpenses = totalExpenses.plus(addExpense("13", "Custom hire", expenses.customHire));
  totalExpenses = totalExpenses.plus(addExpense("14", "Depreciation and section 179", expenses.depreciation));
  const employeeBenefits = d(expenses.employeeBenefits).plus(options.dependentCareBenefitsAdjustment ?? ZERO);
  if (!employeeBenefits.isFinite() || employeeBenefits.lt(0)) {
    throw new Error("Schedule F employee benefits must reconcile to a finite nonnegative expense");
  }
  totalExpenses = totalExpenses.plus(addExpense("15", "Employee benefits", employeeBenefits.toString()));
  totalExpenses = totalExpenses.plus(addExpense("16", "Feed", expenses.feed));
  totalExpenses = totalExpenses.plus(addExpense("17", "Fertilizers and lime", expenses.fertilizersAndLime));
  totalExpenses = totalExpenses.plus(addExpense("18", "Freight and trucking", expenses.freightAndTrucking));
  totalExpenses = totalExpenses.plus(addExpense("19", "Gasoline, fuel, and oil", expenses.gasolineFuelOil));
  totalExpenses = totalExpenses.plus(addExpense("20", "Insurance", expenses.insurance));
  totalExpenses = totalExpenses.plus(addExpense("21a", "Mortgage interest", expenses.mortgageInterest));
  totalExpenses = totalExpenses.plus(addExpense("21b", "Other interest", expenses.otherInterest));
  totalExpenses = totalExpenses.plus(addExpense("22", "Labor hired", expenses.laborHired));
  totalExpenses = totalExpenses.plus(addExpense("23", "Pension and profit-sharing", expenses.pensionAndProfitSharing));
  totalExpenses = totalExpenses.plus(addExpense("24a", "Rent/lease vehicles", expenses.rentLeaseVehicles));
  totalExpenses = totalExpenses.plus(addExpense("24b", "Rent/lease other", expenses.rentLeaseOther));
  totalExpenses = totalExpenses.plus(addExpense("25", "Repairs and maintenance", expenses.repairsAndMaintenance));
  totalExpenses = totalExpenses.plus(addExpense("26", "Seeds and plants", expenses.seedsAndPlants));
  totalExpenses = totalExpenses.plus(addExpense("27", "Storage and warehousing", expenses.storageAndWarehousing));
  totalExpenses = totalExpenses.plus(addExpense("28", "Supplies", expenses.supplies));
  totalExpenses = totalExpenses.plus(addExpense("29", "Taxes", expenses.taxes));
  totalExpenses = totalExpenses.plus(addExpense("30", "Utilities", expenses.utilities));
  totalExpenses = totalExpenses.plus(addExpense("31", "Veterinary, breeding, medicine", expenses.veterinaryBreedingMedicine));
  totalExpenses = totalExpenses.plus(addExpense("32f", "Other expenses", expenses.otherExpenses));

  // Line 33: Total expenses
  audit.record("Sched F", "33", "Total expenses", totalExpenses, "Sum of Lines 10-32f");

  // Line 34: Net farm profit or loss
  const netFarmProfit = grossFarmIncome.minus(totalExpenses);
  audit.record("Sched F", "34", "Net farm profit or loss", netFarmProfit,
    "Line 9 - Line 33", {
      "Gross farm income": grossFarmIncome,
      "Total expenses": totalExpenses,
    });

  return {
    netPurchasedLivestock,
    grossFarmIncome,
    conservationDeduction,
    conservationCarryforward,
    totalExpenses,
    expenseBreakdown,
    netFarmProfit,
    lines: audit.getLines(),
  };
}
