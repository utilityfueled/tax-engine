import type { RentalProperty, TaxYearInput } from "@/models/inputs.js";
import { RentalUseAllocation2026Schema, rentalAllocationCategories } from "@/models/rental-use-allocation-2026.js";
import { d } from "@/utils/decimal.js";
import { isActualDate } from "@/utils/civil-date.js";
import { sumSourceMoneyValues } from "@/utils/sum-source-money.js";
import { sumSourceMoneyRatios } from "@/utils/sum-source-money-ratios.js";

const exclusiveRentalCategories = new Set(["advertising", "commissions", "managementFees"]);
const unsupportedExpenses = ["autoTravel", "cleaning", "legalProfessional", "mortgageInterest", "otherInterest",
  "repairs", "supplies", "depreciation", "otherExpenses"] as const;

export function rentalUseAllocationIssue(detail: string): never {
  throw new Error(`2026 Schedule E personal use requires actual dwelling-use records, a rental and personal expense allocation, and any applicable section 280A worksheet. ${detail}`);
}

function sourceKey(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueOriginals(rows: ReadonlyArray<{ sourceReference: string }>): boolean {
  return new Set(rows.map(row => sourceKey(row.sourceReference))).size === rows.length;
}

export function calculateRentalUseAllocation2026(property: RentalProperty, asOfDate?: string) {
  const parsed = RentalUseAllocation2026Schema.safeParse(property.rentalUseAllocationSources);
  if (!parsed.success) return rentalUseAllocationIssue("Complete the original calendar, rent, expenses and asset records.");
  const source = parsed.data;
  if (!asOfDate || !isActualDate(asOfDate) || asOfDate < "2026-01-01") {
    return rentalUseAllocationIssue("Supply the trusted calculation as-of date for actual 2026 rental records.");
  }
  if (source.confirmedOrdinaryTenantRelationship !== true) {
    return rentalUseAllocationIssue("Confirm the arm’s-length profit-seeking lease without significant tenant services or a special relationship.");
  }
  const dwelling = sourceKey(property.description);
  if (sourceKey(source.propertyAddress) !== dwelling || sourceKey(source.depreciation.propertyAddress) !== dwelling
    || property.accountHolder !== "primary" || !d(property.ownershipPercentage).eq(100)
    || !["single_family", "vacation"].includes(property.propertyType) || property.sourceFactsConfirmed !== true
    || property.allInvestmentAtRisk !== true || property.qualifiesForQBI || property.form4562 !== undefined
    || property.qbiMateriallyParticipated === true || !d(property.qbiW2Wages).isZero() || !d(property.qbiUBIA).isZero()
    || unsupportedExpenses.some(category => property[category] === undefined || !d(property[category]).isZero())) {
    return rentalUseAllocationIssue("This method requires one confirmed whole, sole-owned ordinary dwelling with explicit zero unsupported expenses.");
  }

  let rentalDays = 0;
  let personalDays = 0;
  let previousEnd = "";
  const periods = [...source.periods].sort((left, right) => left.start.localeCompare(right.start));
  if (!uniqueOriginals(periods)) return rentalUseAllocationIssue("Identify each actual rental or personal-use period separately.");
  const leases = periods.filter(period => period.use === "fair_rental");
  for (const period of periods) {
    if (!period.start.startsWith("2026-") || !period.end.startsWith("2026-") || period.end < period.start
      || period.start <= previousEnd) return rentalUseAllocationIssue("Use periods must be ordered, nonoverlapping actual days in 2026.");
    if (period.end > asOfDate) return rentalUseAllocationIssue("Occupied periods must end on or before the calculation as-of date.");
    const days = (Date.parse(period.end) - Date.parse(period.start)) / 86_400_000 + 1;
    if (period.use === "fair_rental") rentalDays += days;
    else personalDays += days;
    previousEnd = period.end;
  }
  if (!rentalDays || !personalDays || rentalDays !== property.rentalDays || personalDays !== property.personalUseDays
    || (personalDays > 14 && 10 * personalDays > rentalDays)) {
    return rentalUseAllocationIssue("Original day counts must match and stay within the nonresidence method.");
  }
  const [lease] = leases;
  if (!lease || leases.length !== 1 || rentalDays <= 30) {
    return rentalUseAllocationIssue("This method requires one original tenant lease covering more than 30 days of fair rental.");
  }

  const assets = source.depreciation.assets;
  if (!uniqueOriginals(assets) || assets.filter(asset => asset.kind === "building").length !== 1
    || assets.some(asset => asset.placedInServiceDate >= asset.basisFullyRecoveredDate
      || asset.basisFullyRecoveredDate >= "2026-01-01" || !d(asset.depreciableBasis).gt(0)
      || !d(asset.priorAllowableDepreciation).eq(asset.depreciableBasis))) {
    return rentalUseAllocationIssue("The actual asset register must prove every asset, including the building, was fully recovered before 2026.");
  }

  const { rentReceipts, expenseReceipts } = source;
  const allReceipts = [...rentReceipts, ...expenseReceipts];
  if (allReceipts.some(receipt => receipt.datePaid > asOfDate)) {
    return rentalUseAllocationIssue("Original rent and expense receipts must be paid on or before the calculation as-of date.");
  }
  if (!uniqueOriginals(rentReceipts) || !uniqueOriginals(expenseReceipts)
    || allReceipts.some(receipt => sourceKey(receipt.propertyAddress) !== dwelling
      || !receipt.datePaid.startsWith("2026-") || !d(receipt.amount).gt(0))) {
    return rentalUseAllocationIssue("Original rent and expense receipts must be distinct, positive, for the dwelling and actually paid in 2026.");
  }
  if (rentReceipts.some(receipt => sourceKey(receipt.leaseReference) !== sourceKey(lease.sourceReference))) {
    return rentalUseAllocationIssue("Each original rent receipt must identify the same tenant lease as the recorded fair rental period.");
  }

  const grossRents = sumSourceMoneyValues(rentReceipts.map(receipt => d(receipt.amount)));
  if (!grossRents.eq(property.rents)) return rentalUseAllocationIssue("Original rent receipts must match gross rents.");
  const rentalUseRatio = { numerator: d(rentalDays), denominator: d(rentalDays + personalDays) };
  const categorySources = rentalAllocationCategories.map(category => {
    const direct = exclusiveRentalCategories.has(category);
    const receipts = expenseReceipts.filter(receipt => receipt.category === category && receipt.use !== "personal");
    const amount = sumSourceMoneyValues(receipts.map(receipt => d(receipt.amount)));
    const entered = property[category];
    if (entered === undefined || !amount.eq(entered)
      || receipts.some(receipt => receipt.use !== (direct ? "rental_only" : "shared"))) {
      return rentalUseAllocationIssue(`Original ${category} receipts must match the entered category and its actual rental use.`);
    }
    return { category, amount, ...(direct ? {} : rentalUseRatio) };
  });
  const totalExpenses = sumSourceMoneyRatios(categorySources);
  const netRentalIncome = sumSourceMoneyRatios([{ amount: grossRents }, ...categorySources.map(source => ({ ...source, amount: source.amount.negated() }))]);
  if (!netRentalIncome.gt(0)) return rentalUseAllocationIssue("Only a positive result after all allowable rental expenses is supported.");
  return { totalExpenses, netRentalIncome, rentalDays, personalDays,
    expensesByCategory: Object.fromEntries(categorySources.map(source => [source.category, sumSourceMoneyRatios([source])])) };
}

export type RentalUseReturnContext = Partial<Pick<TaxYearInput, "deductionElection" | "form1098" | "scheduleC" | "scheduleF"
  | "qbiLossSources" | "scheduleK1Form1041" | "royaltyPropertySources">> & {
  priorYear?: Pick<NonNullable<TaxYearInput["priorYear"]>, "suspendedPassiveLosses" | "qbiLossCarryforward" | "reitPtpLossSource">;
};
