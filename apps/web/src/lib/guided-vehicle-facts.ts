import type { FilingStatus } from "./guided-interview-flow";
import { parseGuidedCurrency } from "./guided-currency";

export interface VehicleEntryData {
  kind?: "new" | "used" | "";
  owner?: "primary" | "spouse" | "";
  vin?: string;
  dateAcquired?: string;
  datePlacedInService?: string;
  bindingContractDate?: string;
  paymentDate?: string;
  bindingContractConfirmed?: boolean | null;
  sellerReportReceived?: boolean | null;
  sellerReportCreditAmount?: string;
  eligibilityConfirmed?: boolean | null;
  creditTransferredToDealer?: boolean | null;
  creditTransferredAmount?: string;
  resoldWithin30Days?: boolean | null;
  returnedToSellerWithin30Days?: boolean | null;
  sellerReportUpdatedForReturn?: boolean | null;
  personalUsePercentage?: string;
  powertrain?: "battery" | "fuel_cell" | "";
  msrp?: string;
  vehicleType?: "suv_van_pickup" | "other" | "";
  criticalMineralsRequirementMet?: boolean | null;
  batteryComponentsRequirementMet?: boolean | null;
  salePrice?: string;
  priorYearMagi?: string;
  priorYearFilingStatus?: FilingStatus | "";
  priorYearMagiConfirmed?: boolean | null;
}

export interface VehicleCreditData {
  entries: VehicleEntryData[];
  agiAdjustmentsConfirmed?: boolean | null;
  foreignEarnedIncomeExclusion?: string;
  foreignHousingDeduction?: string;
  possessionIncomeExclusion?: string;
  priorYearAgi?: string;
  priorYearFilingStatus?: FilingStatus | "";
  priorYearAgiAdjustmentsConfirmed?: boolean | null;
  priorYearForeignEarnedIncomeExclusion?: string;
  priorYearForeignHousingDeduction?: string;
  priorYearPossessionIncomeExclusion?: string;
}

const filingStatusMap = { single: "single", mfj: "married_filing_jointly", mfs: "married_filing_separately", hoh: "head_of_household", qss: "qualifying_surviving_spouse" } as const;
const present = (value: string | undefined) => !!value?.trim();
function actualAmount(value: string | undefined, allowNegative = false): boolean {
  if (!present(value)) return false;
  try { const parsed = parseGuidedCurrency(value); return allowNegative || parsed.gte(0); } catch { return false; }
}
function amount(value: string | undefined): string {
  parseGuidedCurrency(value);
  return (value ?? "").trim().replace(/,/g, "");
}
function actualDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function actualStatus(value: FilingStatus | "" | undefined): value is FilingStatus { return !!value && value in filingStatusMap; }

export function vehicleFactErrors(data: VehicleCreditData | undefined, taxYear?: number | null, status?: FilingStatus | null): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!data?.entries.length) return errors;
  if (data.agiAdjustmentsConfirmed !== true) errors.vehicleMagi = "Confirm the actual current-year Form 8936 MAGI adjustments";
  for (const field of ["foreignEarnedIncomeExclusion", "foreignHousingDeduction", "possessionIncomeExclusion"] as const) {
    if (!actualAmount(data[field])) errors[`vehicle-${field}`] = "Enter each current-year MAGI adjustment, including zero";
  }
  if (present(data.priorYearAgi)) {
    if (!actualAmount(data.priorYearAgi, true)) errors.vehiclePriorAgi = "Enter the actual prior-year AGI";
    if (!actualStatus(data.priorYearFilingStatus) || data.priorYearAgiAdjustmentsConfirmed !== true) errors.vehiclePriorMagi = "Confirm the actual prior-year filing status and MAGI adjustments";
    for (const field of ["priorYearForeignEarnedIncomeExclusion", "priorYearForeignHousingDeduction", "priorYearPossessionIncomeExclusion"] as const) {
      if (!actualAmount(data[field])) errors[`vehicle-${field}`] = "Enter each prior-year MAGI adjustment, including zero";
    }
  }
  const vins = new Set<string>();
  data.entries.forEach((entry, index) => {
    const key = `vehicle-${index}`;
    if (!["new", "used"].includes(entry.kind ?? "")) errors[`${key}-kind`] = "Choose the actual new or used vehicle category";
    if (!["primary", "spouse"].includes(entry.owner ?? "") || (entry.owner === "spouse" && status !== undefined && status !== "mfj")) errors[`${key}-owner`] = "Choose an actual vehicle owner on this return";
    const vin = entry.vin?.trim().toUpperCase() ?? "";
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || vins.has(vin)) errors[`${key}-vin`] = "Enter a valid unique vehicle VIN";
    vins.add(vin);
    for (const field of ["dateAcquired", "datePlacedInService", "bindingContractDate", "paymentDate"] as const) {
      if (!actualDate(entry[field])) errors[`${key}-${field}`] = "Enter the actual calendar date from the vehicle records";
      else if (field !== "datePlacedInService" && actualDate(entry.datePlacedInService) && (entry[field] ?? "") > (entry.datePlacedInService ?? "")) errors[`${key}-${field}`] = "Acquisition, contract and payment dates cannot follow possession";
    }
    if (taxYear && actualDate(entry.datePlacedInService) && !entry.datePlacedInService?.startsWith(`${taxYear}-`)) errors[`${key}-year`] = "Use the return for the vehicle's actual placed-in-service year";
    for (const field of ["bindingContractConfirmed", "sellerReportReceived", "eligibilityConfirmed", "creditTransferredToDealer", "resoldWithin30Days", "returnedToSellerWithin30Days"] as const) {
      if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = "Confirm each actual vehicle qualification, transfer and resale/return fact";
    }
    for (const field of ["sellerReportCreditAmount", "personalUsePercentage"] as const) if (!actualAmount(entry[field])) errors[`${key}-${field}`] = "Enter the actual seller credit and personal-use percentage, including zero";
    if (actualAmount(entry.personalUsePercentage) && parseGuidedCurrency(entry.personalUsePercentage).gt(100)) errors[`${key}-personalUsePercentage`] = "Personal use cannot exceed 100 percent";
    if (entry.kind === "new") {
      if (!actualAmount(entry.msrp) || !["suv_van_pickup", "other"].includes(entry.vehicleType ?? "") || !["battery", "fuel_cell"].includes(entry.powertrain ?? "")) errors[`${key}-new`] = "Enter the actual MSRP, vehicle type and powertrain";
      for (const field of ["criticalMineralsRequirementMet", "batteryComponentsRequirementMet"] as const) if (typeof entry[field] !== "boolean") errors[`${key}-${field}`] = "Confirm the actual seller-report component requirements";
    } else if (entry.kind === "used" && !actualAmount(entry.salePrice)) errors[`${key}-salePrice`] = "Enter the actual used-vehicle sale price";
    if (entry.creditTransferredToDealer) {
      if (!actualAmount(entry.creditTransferredAmount) || parseGuidedCurrency(entry.creditTransferredAmount).lte(0)
        || !actualAmount(entry.sellerReportCreditAmount) || !parseGuidedCurrency(entry.creditTransferredAmount).eq(parseGuidedCurrency(entry.sellerReportCreditAmount))) errors[`${key}-transfer`] = "The transferred amount must equal the entire actual seller credit";
      if (entry.returnedToSellerWithin30Days && entry.sellerReportUpdatedForReturn !== true) errors[`${key}-return`] = "A returned transferred vehicle needs the updated seller report and dealer reconciliation";
    } else if (present(entry.creditTransferredAmount) && (!actualAmount(entry.creditTransferredAmount) || !parseGuidedCurrency(entry.creditTransferredAmount).isZero())) errors[`${key}-transfer`] = "A positive transferred amount conflicts with no transfer election";
    if (entry.resoldWithin30Days && entry.returnedToSellerWithin30Days) errors[`${key}-resale`] = "A vehicle cannot both be resold and returned to the seller within 30 days";
    if (present(entry.priorYearMagi) && (!actualAmount(entry.priorYearMagi, true) || !actualStatus(entry.priorYearFilingStatus) || entry.priorYearMagiConfirmed !== true)) errors[`${key}-priorMagi`] = "Confirm the actual owner's prior-year MAGI and filing status";
  });
  return errors;
}

export function buildVehicleCreditInput(data: VehicleCreditData | undefined, taxYear?: number | null, status?: FilingStatus | null) {
  if (!data?.entries.length) return undefined;
  const errors = vehicleFactErrors(data, taxYear, status);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  const common = (entry: VehicleEntryData) => ({
    owner: entry.owner as "primary" | "spouse", vin: entry.vin?.trim().toUpperCase(),
    dateAcquired: entry.dateAcquired as string, datePlacedInService: entry.datePlacedInService,
    bindingContractDate: entry.bindingContractDate, paymentDate: entry.paymentDate,
    bindingContractConfirmed: entry.bindingContractConfirmed as boolean, sellerReportReceived: entry.sellerReportReceived as boolean,
    sellerReportCreditAmount: amount(entry.sellerReportCreditAmount), eligibilityConfirmed: entry.eligibilityConfirmed as boolean,
    personalUsePercentage: amount(entry.personalUsePercentage), creditTransferredToDealer: entry.creditTransferredToDealer as boolean,
    ...(present(entry.creditTransferredAmount) ? { creditTransferredAmount: amount(entry.creditTransferredAmount) } : {}),
    resoldWithin30Days: entry.resoldWithin30Days as boolean, returnedToSellerWithin30Days: entry.returnedToSellerWithin30Days as boolean,
    sellerReportUpdatedForReturn: entry.sellerReportUpdatedForReturn ?? undefined,
    ...(present(entry.priorYearMagi) && actualStatus(entry.priorYearFilingStatus) ? { priorYearMagi: amount(entry.priorYearMagi), priorYearFilingStatus: filingStatusMap[entry.priorYearFilingStatus], priorYearMagiConfirmed: entry.priorYearMagiConfirmed as boolean } : {}),
  });
  return {
    newCleanVehicles: data.entries.filter((entry) => entry.kind === "new").map((entry) => ({ ...common(entry), powertrain: entry.powertrain as "battery" | "fuel_cell", msrp: amount(entry.msrp), vehicleType: entry.vehicleType as "suv_van_pickup" | "other", criticalMineralsRequirementMet: entry.criticalMineralsRequirementMet as boolean, batteryComponentsRequirementMet: entry.batteryComponentsRequirementMet as boolean })),
    previouslyOwnedCleanVehicles: data.entries.filter((entry) => entry.kind === "used").map((entry) => ({ ...common(entry), salePrice: amount(entry.salePrice) })),
    agiAdjustmentsConfirmed: data.agiAdjustmentsConfirmed as boolean,
    foreignEarnedIncomeExclusion: amount(data.foreignEarnedIncomeExclusion), foreignHousingDeduction: amount(data.foreignHousingDeduction), possessionIncomeExclusion: amount(data.possessionIncomeExclusion),
    ...(present(data.priorYearAgi) && actualStatus(data.priorYearFilingStatus) ? { priorYearAgi: amount(data.priorYearAgi), priorYearFilingStatus: filingStatusMap[data.priorYearFilingStatus], priorYearAgiAdjustmentsConfirmed: data.priorYearAgiAdjustmentsConfirmed as boolean, priorYearForeignEarnedIncomeExclusion: amount(data.priorYearForeignEarnedIncomeExclusion), priorYearForeignHousingDeduction: amount(data.priorYearForeignHousingDeduction), priorYearPossessionIncomeExclusion: amount(data.priorYearPossessionIncomeExclusion) } : {}),
  };
}
