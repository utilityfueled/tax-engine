/**
 * Pennsylvania Schedule F — Farm Income and Expenses
 * Spec: spec/state/pa-schedule-f.yaml
 */

import Decimal from "decimal.js";
import { AuditTrail } from "@/utils/audit.js";
import { d, roundDollar, sum, zeroFloor } from "@/utils/decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";

const SUPPORTED_TAX_YEARS = new Set([2024, 2025, 2026]);

export type PAScheduleFInput = NonNullable<TaxYearInput["scheduleF"]> & {
  taxYear: number;
};

export interface PAScheduleFResult {
  line1: Decimal;
  line2: Decimal;
  line3: Decimal;
  line4: Decimal;
  line5a: Decimal;
  line5b: Decimal;
  line6: Decimal;
  line7a: Decimal;
  line7b: Decimal;
  line8: Decimal;
  line9: Decimal;
  excludedPriorYearDeferredCropInsurance: Decimal;
  line10: Decimal;
  line11: Decimal;
  line12: Decimal;
  line13: Decimal;
  line14: Decimal;
  line15: Decimal;
  conservationCarryforward: Decimal;
  line16a: Decimal;
  line16b: Decimal;
  line17: Decimal;
  line18: Decimal;
  line19: Decimal;
  line20: Decimal;
  line21: Decimal;
  line22: Decimal;
  line23a: Decimal;
  line23b: Decimal;
  line23c: Decimal;
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
  line40: Decimal;
  line41a: Decimal;
  line41b: Decimal;
  line42: Decimal;
  line43: Decimal;
  line44: Decimal;
  line45: Decimal;
  line46: Decimal;
  line47: Decimal;
  line48: Decimal;
  line49: Decimal;
  line50: Decimal;
  line51: Decimal;
  netFarmProfit: Decimal;
  lines: CalculatedLine[];
}

function normalizeAmount(value?: string): Decimal {
  return roundDollar(d(value));
}

export function calculatePAScheduleF(input: PAScheduleFInput): PAScheduleFResult {
  if (!SUPPORTED_TAX_YEARS.has(input.taxYear)) {
    throw new Error(`PA Schedule F constants not available for tax year ${input.taxYear}`);
  }

  const audit = new AuditTrail();
  const expenses = input.expenses;
  const isAccrualMethod = input.accountingMethod === "accrual";
  const zero = new Decimal(0);

  const line1 = isAccrualMethod ? zero : normalizeAmount(input.salesOfPurchasedLivestock);
  const line2 = isAccrualMethod ? zero : normalizeAmount(input.costOfPurchasedLivestock);
  const line3 = line1.minus(line2);
  const line4 = isAccrualMethod ? zero : normalizeAmount(input.salesOfProductsRaised);
  const line5a = isAccrualMethod ? zero : normalizeAmount(input.cooperativeDistributions);
  const line5b = isAccrualMethod ? zero : normalizeAmount(input.cooperativeNonIncomeItems);
  const line6 = line5a.minus(line5b);
  const line7a = isAccrualMethod ? zero : normalizeAmount(input.agriculturalProgramPayments);
  const line7b = isAccrualMethod ? zero : normalizeAmount(input.agriculturalProgramMaterialsServices);
  const line8 = isAccrualMethod
    ? zero
    : sum(normalizeAmount(input.cccLoansElected), normalizeAmount(input.cccLoansForfeited));
  const line9 = isAccrualMethod ? zero : normalizeAmount(input.cropInsuranceProceeds);
  const excludedPriorYearDeferredCropInsurance = normalizeAmount(input.priorYearDeferredCropInsurance);
  const line10 = isAccrualMethod ? zero : normalizeAmount(input.customHireIncome);
  const line11 = isAccrualMethod ? zero : normalizeAmount(input.otherFarmIncome);

  const line40 = isAccrualMethod ? normalizeAmount(input.accrualSalesDuringYear) : zero;
  const line41a = isAccrualMethod ? normalizeAmount(input.agriculturalProgramPayments) : zero;
  const line41b = isAccrualMethod ? normalizeAmount(input.agriculturalProgramMaterialsServices) : zero;
  const line42 = isAccrualMethod
    ? sum(normalizeAmount(input.cccLoansElected), normalizeAmount(input.cccLoansForfeited))
    : zero;
  const line43 = isAccrualMethod ? normalizeAmount(input.customHireIncome) : zero;
  const line44 = isAccrualMethod ? normalizeAmount(input.otherFarmIncome) : zero;
  const line45 = sum(line40, line41a, line41b, line42, line43, line44);
  const line46 = isAccrualMethod ? normalizeAmount(input.accrualBeginningInventory) : zero;
  const line47 = isAccrualMethod ? normalizeAmount(input.accrualPurchasesDuringYear) : zero;
  const line48 = line46.plus(line47);
  const line49 = isAccrualMethod ? normalizeAmount(input.accrualEndingInventory) : zero;
  const line50 = line48.minus(line49);
  const line51 = line45.minus(line50);
  const line12 = isAccrualMethod
    ? line51
    : sum(line3, line4, line6, line7a, line7b, line8, line9, line10, line11);

  const line13 = normalizeAmount(expenses?.breedingFees);
  const line14 = normalizeAmount(expenses?.chemicals);
  const conservationCap = zeroFloor(roundDollar(line12.times("0.25")));
  const rawConservation = sum(normalizeAmount(expenses?.conservation), normalizeAmount(input.conservationCarryforward));
  const line15 = Decimal.min(rawConservation, conservationCap);
  const conservationCarryforward = zeroFloor(rawConservation.minus(line15));
  const line16a = normalizeAmount(expenses?.depreciation);
  const line16b = normalizeAmount(expenses?.section179Expense);
  const line17 = normalizeAmount(expenses?.employeeBenefits);
  const line18 = normalizeAmount(expenses?.feed);
  const line19 = normalizeAmount(expenses?.fertilizersAndLime);
  const line20 = normalizeAmount(expenses?.freightAndTrucking);
  const line21 = normalizeAmount(expenses?.gasolineFuelOil);
  const line22 = normalizeAmount(expenses?.insurance);
  const line23a = normalizeAmount(expenses?.laborHired);
  const line23b = normalizeAmount(expenses?.jobsCredit);
  const line23c = line23a.minus(line23b);
  const line24 = normalizeAmount(expenses?.landClearing);
  const line25 = normalizeAmount(expenses?.customHire);
  const line26 = normalizeAmount(expenses?.mortgageInterest);
  const line27 = normalizeAmount(expenses?.otherInterest);
  const line28 = normalizeAmount(expenses?.pensionAndProfitSharing);
  const line29 = normalizeAmount(expenses?.rentLeaseOther);
  const line30 = normalizeAmount(expenses?.repairsAndMaintenance);
  const line31 = normalizeAmount(expenses?.seedsAndPlants);
  const line32 = normalizeAmount(expenses?.storageAndWarehousing);
  const line33 = normalizeAmount(expenses?.supplies);
  const line34 = normalizeAmount(expenses?.taxes);
  const line35 = normalizeAmount(expenses?.utilities);
  const line36 = normalizeAmount(expenses?.veterinaryBreedingMedicine);
  const line37 = sum(
    normalizeAmount(expenses?.otherExpenses),
    normalizeAmount(expenses?.carAndTruck),
    normalizeAmount(expenses?.rentLeaseVehicles),
  );
  const line38 = sum(
    line13,
    line14,
    line15,
    line16a,
    line16b,
    line17,
    line18,
    line19,
    line20,
    line21,
    line22,
    line23c,
    line24,
    line25,
    line26,
    line27,
    line28,
    line29,
    line30,
    line31,
    line32,
    line33,
    line34,
    line35,
    line36,
    line37,
  );
  const line39 = line12.minus(line38);

  if (!isAccrualMethod) {
    audit.record("PA-Schedule-F", "1", "Sales of livestock and other items bought for resale", line1, "Rounded sales-of-purchased-livestock input");
    audit.record("PA-Schedule-F", "2", "Cost or other basis of livestock and other items bought for resale", line2, "Rounded cost-of-purchased-livestock input");
    audit.record("PA-Schedule-F", "3", "Net purchased livestock", line3, "Line 1 - Line 2");
    audit.record("PA-Schedule-F", "4", "Sales of products raised", line4, "Rounded sales-of-products-raised input");
    audit.record("PA-Schedule-F", "5a", "Total distributions received from cooperatives", line5a, "Rounded cooperative-distributions input");
    audit.record("PA-Schedule-F", "5b", "Less: non-income items", line5b, "Rounded cooperative non-income items input");
    audit.record("PA-Schedule-F", "6", "Net distributions", line6, "Line 5a - Line 5b");
    audit.record("PA-Schedule-F", "7a", "Agricultural program payments - cash", line7a, "Rounded agricultural-program-payments input");
    audit.record("PA-Schedule-F", "7b", "Agricultural program payments - materials and services", line7b, "Rounded agricultural-program materials-and-services input");
    audit.record("PA-Schedule-F", "8", "Commodity credit loans under election (or forfeited)", line8, "Rounded CCC-loans-elected plus rounded CCC-loans-forfeited");
    audit.record("PA-Schedule-F", "9", "Crop insurance proceeds", line9, "Rounded current-year crop-insurance proceeds");
    audit.record("PA-Schedule-F", "10", "Machine work", line10, "Rounded custom-hire income input");
    audit.record("PA-Schedule-F", "11", "Other income", line11, "Rounded other-farm-income input");
  } else {
    audit.record("PA-Schedule-F", "40", "Sales during year", line40, "Rounded accrual-sales-during-year input");
    audit.record("PA-Schedule-F", "41a", "Agricultural program payments - cash", line41a, "Rounded agricultural-program-payments input");
    audit.record("PA-Schedule-F", "41b", "Agricultural program payments - materials and services", line41b, "Rounded agricultural-program materials-and-services input");
    audit.record("PA-Schedule-F", "42", "Commodity credit loans under election (or forfeited)", line42, "Rounded CCC-loans-elected plus rounded CCC-loans-forfeited");
    audit.record("PA-Schedule-F", "43", "Machine work", line43, "Rounded custom-hire income input");
    audit.record("PA-Schedule-F", "44", "Other income", line44, "Rounded other-farm-income input");
    audit.record("PA-Schedule-F", "45", "Total accrual-method gross receipts", line45, "Line 40 + Line 41a + Line 41b + Line 42 + Line 43 + Line 44");
    audit.record("PA-Schedule-F", "46", "Beginning inventory", line46, "Rounded accrual beginning-inventory input");
    audit.record("PA-Schedule-F", "47", "Purchases during year", line47, "Rounded accrual purchases-during-year input");
    audit.record("PA-Schedule-F", "48", "Inventory plus purchases", line48, "Line 46 + Line 47");
    audit.record("PA-Schedule-F", "49", "Ending inventory", line49, "Rounded accrual ending-inventory input");
    audit.record("PA-Schedule-F", "50", "Cost of products sold", line50, "Line 48 - Line 49");
    audit.record("PA-Schedule-F", "51", "Accrual-method gross income", line51, "Line 45 - Line 50");
  }
  audit.record(
    "PA-Schedule-F",
    "excluded-prior-year-deferred-crop-insurance",
    "Prior-year deferred crop-insurance proceeds excluded from current-year PA income",
    excludedPriorYearDeferredCropInsurance,
    "Rounded prior-year deferred crop-insurance input kept out of current-year PA gross income",
  );
  audit.record(
    "PA-Schedule-F",
    "12",
    "Gross income",
    line12,
    isAccrualMethod
      ? "Section III Line 51 carried to Section I Line 12"
      : "Line 3 + Line 4 + Line 6 + Line 7a + Line 7b + Line 8 + Line 9 + Line 10 + Line 11",
  );
  audit.record("PA-Schedule-F", "13", "Breeding fees", line13, "Rounded breeding-fee expense");
  audit.record("PA-Schedule-F", "14", "Chemicals", line14, "Rounded farm chemical expense");
  audit.record(
    "PA-Schedule-F",
    "15",
    "Conservation expenses",
    line15,
    "min(rounded conservation expense + carryforward, 25% of Line 12)",
    {
      "Raw conservation expense + carryforward": rawConservation,
      "25% cap": conservationCap,
      "Carryforward to future year": conservationCarryforward,
    },
  );
  audit.record("PA-Schedule-F", "16a", "Regular depreciation", line16a, "Rounded Pennsylvania-adjusted depreciation expense");
  audit.record("PA-Schedule-F", "16b", "Section 179 expense", line16b, "Rounded Pennsylvania Section 179 expense input");
  audit.record("PA-Schedule-F", "17", "Employee benefit programs", line17, "Rounded employee-benefit-program expense");
  audit.record("PA-Schedule-F", "18", "Feed purchased", line18, "Rounded feed expense");
  audit.record("PA-Schedule-F", "19", "Fertilizers and lime", line19, "Rounded fertilizers-and-lime expense");
  audit.record("PA-Schedule-F", "20", "Freight, trucking", line20, "Rounded freight-and-trucking expense");
  audit.record("PA-Schedule-F", "21", "Gasoline, fuel, oil", line21, "Rounded gasoline-fuel-oil expense");
  audit.record("PA-Schedule-F", "22", "Insurance", line22, "Rounded insurance expense");
  audit.record("PA-Schedule-F", "23a", "Labor hired", line23a, "Rounded labor-hired expense");
  audit.record("PA-Schedule-F", "23b", "Jobs credit", line23b, "Rounded jobs-credit reduction");
  audit.record("PA-Schedule-F", "23c", "Balance", line23c, "Line 23a - Line 23b");
  audit.record("PA-Schedule-F", "24", "Land clearing", line24, "Rounded land-clearing expense");
  audit.record("PA-Schedule-F", "25", "Machine hire", line25, "Rounded custom-hire farm expense");
  audit.record("PA-Schedule-F", "26", "Mortgage interest paid to financial institutions", line26, "Rounded mortgage-interest expense");
  audit.record("PA-Schedule-F", "27", "Other interest", line27, "Rounded other-interest expense");
  audit.record("PA-Schedule-F", "28", "Pension and profit-sharing plans for employees", line28, "Rounded pension-and-profit-sharing expense");
  audit.record("PA-Schedule-F", "29", "Rent of farm, pasture", line29, "Rounded rent-lease-other expense");
  audit.record("PA-Schedule-F", "30", "Repairs, maintenance", line30, "Rounded repairs-and-maintenance expense");
  audit.record("PA-Schedule-F", "31", "Seeds, plants purchased", line31, "Rounded seeds-and-plants expense");
  audit.record("PA-Schedule-F", "32", "Storage, warehousing", line32, "Rounded storage-and-warehousing expense");
  audit.record("PA-Schedule-F", "33", "Supplies purchased", line33, "Rounded supplies expense");
  audit.record("PA-Schedule-F", "34", "Taxes", line34, "Rounded taxes expense");
  audit.record("PA-Schedule-F", "35", "Utilities", line35, "Rounded utilities expense");
  audit.record("PA-Schedule-F", "36", "Veterinary fees, medicine", line36, "Rounded veterinary-breeding-medicine expense");
  audit.record("PA-Schedule-F", "37", "Total other expenses", line37, "Rounded other-expenses + car-and-truck + rent-lease-vehicles");
  audit.record("PA-Schedule-F", "38", "Total expenses", line38, "Sum of supported Pennsylvania Schedule F expense lines");
  audit.record("PA-Schedule-F", "39", "Net farm profit or loss", line39, "Line 12 - Line 38");

  return {
    line1,
    line2,
    line3,
    line4,
    line5a,
    line5b,
    line6,
    line7a,
    line7b,
    line8,
    line9,
    excludedPriorYearDeferredCropInsurance,
    line10,
    line11,
    line12,
    line13,
    line14,
    line15,
    conservationCarryforward,
    line16a,
    line16b,
    line17,
    line18,
    line19,
    line20,
    line21,
    line22,
    line23a,
    line23b,
    line23c,
    line24,
    line25,
    line26,
    line27,
    line28,
    line29,
    line30,
    line31,
    line32,
    line33,
    line34,
    line35,
    line36,
    line37,
    line38,
    line39,
    line40,
    line41a,
    line41b,
    line42,
    line43,
    line44,
    line45,
    line46,
    line47,
    line48,
    line49,
    line50,
    line51,
    netFarmProfit: line39,
    lines: audit.getLines(),
  };
}
