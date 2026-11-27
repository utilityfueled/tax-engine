import type { calculateSection45WSecondYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-second-year-2026.js";

type Workpaper = Parameters<typeof calculateSection45WSecondYearDepreciation2026>[0];

const identity = {
  taxpayerReference: "Fictional taxpayer original", activityReference: "Fictional Schedule C original",
  assetReference: "Fictional depreciation asset", vin: "1HGCM82633A004352", placedInServiceDate: "2025-06-01",
};
const filedReturnReference = "Fictional actually filed 2025 individual return";
const record = (sourceReference: string) => ({ sourceReference, originalComparedAndConfirmed: true as const });
export const section45WSecondYearOriginals = {
  taxYear: 2026,
  priorReturn: { taxYear: 2025, taxpayerReference: identity.taxpayerReference, filingStatus: "single", filedReturnReference,
    filedReturnDate: "2026-04-15", ...record("Fictional confirmed original e-file receipt"), calendarYearConfirmed: true,
    wholeDollarReportingConfirmed: true },
  originalAsset: { ...identity, ...record("Fictional original purchase and asset workpaper"), originalPreCreditBasis: "25000",
    vehicleKind: "truck_or_van", manufacturerGrossVehicleWeightRatingPounds: 7200,
    manufacturerReference: "Fictional manufacturer van rating", manufacturerVin: identity.vin, ordinaryListedTransportationConfirmed: true,
    primarySoleProprietorOwnershipConfirmed: true, retainedAndNoOtherBasisChangesConfirmed: true,
    inventoryReference: "Fictional original 2025 eligible depreciation inventory", onlyEligibleAssetPlacedInServiceConfirmed: true,
    inventoryAssetReference: identity.assetReference,
    mileage: { logReference: "Fictional full original year-one mileage log", taxYear: 2025, assetReference: identity.assetReference,
      fromDate: identity.placedInServiceDate, throughDate: "2025-12-31",
      qualifiedBusinessMiles: "7000", totalMiles: "7000", exclusivelyUnitedStatesUseConfirmed: true,
      completeForApplicablePeriodConfirmed: true },
  },
  filedClaim: { ...identity, ...record("Fictional filed Schedule A line 26 workpapers"), filedReturnReference,
    reportedBasisLine21: "25000", line26Credit: "6000", directClaimedBasisReductionConfirmed: true, noCompetingVehicleCreditConfirmed: true },
  filedClassElection: { ...record("Fictional filed Section 168(k)(7) election"), filedReturnReference,
    taxpayerReference: identity.taxpayerReference, taxYear: 2025, recoveryClass: "5_year", timelyFiledClassElectionOutConfirmed: true },
  priorDepreciation: { ...identity, ...record("Fictional filed Form 4562 asset calculation"), filedReturnReference,
    originalPreCreditBasis: "25000", postCreditTableBasis: "19000", recoveryPeriod: "5", method: "GDS_200DB", convention: "half_year",
    section179Deduction: "0", bonusDepreciation: "0", depreciationAllowed: "3800", depreciationAllowable: "3800",
    reportedRegularDepreciation: "3800", remainingBasisOnLedger: "15200", noMileageMethodOrOtherDepreciationConfirmed: true },
  currentAsset: { ...identity, ...record("Fictional continuing 2026 asset ledger"), taxYear: 2026,
    openingAdjustedBasis: "15200", sameOwnershipAndActivityConfirmed: true, retainedFullCalendarYearConfirmed: true,
    noDispositionUseChangeOrRecaptureConfirmed: true, noOtherBasisOrMethodChangesConfirmed: true,
    mileage: { logReference: "Fictional 2026 business mileage log", taxYear: 2026, assetReference: identity.assetReference,
      fromDate: "2026-01-01", throughDate: "2026-12-31",
      qualifiedBusinessMiles: "8750", totalMiles: "8750", exclusivelyUnitedStatesUseConfirmed: true,
      completeForApplicablePeriodConfirmed: true },
  },
} as const satisfies Workpaper;
