// Spec: spec/federal/form-4562-section45w-second-year-2026.yaml
import { expect, it } from "vitest";
import { calculateSection45WSecondYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-second-year-2026.js";

type Workpaper = Parameters<typeof calculateSection45WSecondYearDepreciation2026>[0];

const identity = {
  taxpayerReference: "Fictional taxpayer original", activityReference: "Fictional Schedule C original",
  assetReference: "Fictional depreciation asset", vin: "1HGCM82633A004352", placedInServiceDate: "2025-06-01",
};
const filedReturnReference = "Fictional actually filed 2025 individual return";
const record = (sourceReference: string) => ({ sourceReference, originalComparedAndConfirmed: true as const });
const observed = { asOfDate: "2027-01-05" };

const originals = {
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

it("uses the filed credit and original workpapers to determine the second-year deduction", () => {
  const result = calculateSection45WSecondYearDepreciation2026({ ...originals,
    currentAsset: { ...originals.currentAsset, vin: ` ${identity.vin.toLowerCase()} ` },
  }, observed);
  expect(result.tableBasisAfterCredit.toFixed()).toBe("19000");
  expect(result.verifiedDepreciation2025.toFixed()).toBe("3800");
  expect(result.openingAdjustedBasis.toFixed()).toBe("15200");
  expect(result.exactDepreciation2026.toFixed()).toBe("6080");
  expect(result.line26h.toFixed()).toBe("6080");
  expect(result.line28.toFixed()).toBe("6080");
  expect(result.remainingBasisAfterCalculatedDepreciation.toFixed()).toBe("9120");
  expect(JSON.stringify(result)).not.toMatch(/Fictional|1HGCM82633A004352/u);
});

it("requires a closed observation year and an earlier actual original filing", () => {
  expect(() => calculateSection45WSecondYearDepreciation2026(originals, { asOfDate: "2026-12-31" })).toThrow(/completed 2026 calendar year/u);
  expect(() => calculateSection45WSecondYearDepreciation2026(originals, { asOfDate: "2027-02-29" })).toThrow(/completed 2026 calendar year/u);
  expect(calculateSection45WSecondYearDepreciation2026(originals, { asOfDate: "2027-01-01" }).line28.toFixed()).toBe("6080");
  const priorReturn = { ...originals.priorReturn, filedReturnDate: "2027-01-05" };
  expect(() => calculateSection45WSecondYearDepreciation2026({ ...originals, priorReturn }, observed)).toThrow(/prior filing date/u);
});

it("holds inconsistent original identity, elections, convention, use or prior depreciation", () => {
  const { priorReturn, originalAsset, filedClaim, filedClassElection, priorDepreciation, currentAsset } = originals;
  const changes = [
    { priorReturn: { ...priorReturn, filedReturnDate: "2025-12-31" } },
    { priorReturn: { ...priorReturn, wholeDollarReportingConfirmed: false } },
    { filedClaim: { ...filedClaim, taxpayerReference: "Another taxpayer" } },
    { filedClaim: { ...filedClaim, vin: "1HGCM82633A004353" } },
    { filedClaim: { ...filedClaim, line26Credit: "7500.01" } },
    { filedClaim: { ...filedClaim, line26Credit: "0" } },
    { filedClaim: { ...filedClaim, reportedBasisLine21: "25001" } },
    { filedClaim: { ...filedClaim, line26Credit: "5999" } },
    { filedClaim: { ...filedClaim, filedReturnReference: "A different filed return" } },
    { filedClassElection: undefined },
    { filedClassElection: { ...filedClassElection, recoveryClass: "7_year" } },
    { filedClassElection: { ...filedClassElection, filedReturnReference: "A different filed return" } },
    { filedClassElection: { ...filedClassElection, timelyFiledClassElectionOutConfirmed: false } },
    { originalAsset: { ...originalAsset, manufacturerGrossVehicleWeightRatingPounds: 6000 } },
    { originalAsset: { ...originalAsset, manufacturerGrossVehicleWeightRatingPounds: 14000 } },
    { originalAsset: { ...originalAsset, manufacturerVin: "1HGCM82633A004353" } },
    { originalAsset: { ...originalAsset, onlyEligibleAssetPlacedInServiceConfirmed: false } },
    { originalAsset: { ...originalAsset, inventoryAssetReference: "An unrelated 2025 inventory asset" } },
    { originalAsset: { ...originalAsset, mileage: { ...originalAsset.mileage, qualifiedBusinessMiles: "6999" } } },
    { originalAsset: { ...originalAsset, mileage: { ...originalAsset.mileage, fromDate: "2025-06-02" } } },
    { originalAsset: { ...originalAsset, mileage: { ...originalAsset.mileage, exclusivelyUnitedStatesUseConfirmed: false } } },
    { priorDepreciation: { ...priorDepreciation, convention: "mid_quarter" } },
    { priorDepreciation: { ...priorDepreciation, method: "straight_line" } },
    { priorDepreciation: { ...priorDepreciation, section179Deduction: "1" } },
    { priorDepreciation: { ...priorDepreciation, bonusDepreciation: "1" } },
    { priorDepreciation: { ...priorDepreciation, depreciationAllowed: "3799" } },
    { priorDepreciation: { ...priorDepreciation, depreciationAllowable: "3801" } },
    { priorDepreciation: { ...priorDepreciation, reportedRegularDepreciation: "3801" } },
    { priorDepreciation: { ...priorDepreciation, remainingBasisOnLedger: "15199" } },
    { currentAsset: { ...currentAsset, openingAdjustedBasis: "15199" } },
    { currentAsset: { ...currentAsset, activityReference: "Transferred Schedule C activity" } },
    { currentAsset: { ...currentAsset, noDispositionUseChangeOrRecaptureConfirmed: false } },
    { currentAsset: { ...currentAsset, noOtherBasisOrMethodChangesConfirmed: false } },
    { currentAsset: { ...currentAsset, mileage: originalAsset.mileage } },
    { currentAsset: { ...currentAsset, mileage: { ...currentAsset.mileage, assetReference: "A different mileage log asset" } } },
    { currentAsset: { ...currentAsset, mileage: { ...currentAsset.mileage, throughDate: "2026-12-30" } } },
    { currentAsset: { ...currentAsset, mileage: { ...currentAsset.mileage, exclusivelyUnitedStatesUseConfirmed: false } } },
    { currentAsset: { ...currentAsset, mileage: { ...currentAsset.mileage, totalMiles: "0", qualifiedBusinessMiles: "0" } } },
  ];
  for (const change of changes) {
    expect(() => calculateSection45WSecondYearDepreciation2026({ ...originals, ...change } as Workpaper, observed), JSON.stringify(change)).toThrow(/2026 Section 45W depreciation/u);
  }
  const fourthQuarter = { ...originals, originalAsset: { ...originalAsset, placedInServiceDate: "2025-10-01" },
    filedClaim: { ...filedClaim, placedInServiceDate: "2025-10-01" },
    priorDepreciation: { ...priorDepreciation, placedInServiceDate: "2025-10-01" },
    currentAsset: { ...currentAsset, placedInServiceDate: "2025-10-01" },
  };
  expect(() => calculateSection45WSecondYearDepreciation2026(fourthQuarter, observed)).toThrow(/actual 2025 half-year convention/u);
  const exceedsBasisLimit = { ...originals, originalAsset: { ...originalAsset, originalPreCreditBasis: "10000" },
    filedClaim: { ...filedClaim, reportedBasisLine21: "10000", line26Credit: "4000" },
    priorDepreciation: { ...priorDepreciation, originalPreCreditBasis: "10000", postCreditTableBasis: "6000",
      depreciationAllowed: "1200", depreciationAllowable: "1200", reportedRegularDepreciation: "1200", remainingBasisOnLedger: "4800" },
    currentAsset: { ...currentAsset, openingAdjustedBasis: "4800" },
  };
  expect(() => calculateSection45WSecondYearDepreciation2026(exceedsBasisLimit, observed)).toThrow(/actual filed credit reduction/u);
  const roundedFiledLimit = calculateSection45WSecondYearDepreciation2026({ ...originals,
    originalAsset: { ...originalAsset, originalPreCreditBasis: "9999.99" },
    filedClaim: { ...filedClaim, reportedBasisLine21: "10000", line26Credit: "3000" },
    priorDepreciation: { ...priorDepreciation, originalPreCreditBasis: "9999.99", postCreditTableBasis: "6999.99",
      depreciationAllowed: "1399.998", depreciationAllowable: "1399.998", reportedRegularDepreciation: "1400", remainingBasisOnLedger: "5599.992" },
    currentAsset: { ...currentAsset, openingAdjustedBasis: "5599.992" },
  }, observed);
  expect(roundedFiledLimit.tableBasisAfterCredit.toFixed()).toBe("6999.99");
  expect(roundedFiledLimit.exactDepreciation2026.toFixed()).toBe("2239.9968");
  const roundedLine21 = calculateSection45WSecondYearDepreciation2026({ ...originals,
    originalAsset: { ...originalAsset, originalPreCreditBasis: "10001.50" },
    filedClaim: { ...filedClaim, reportedBasisLine21: "10002", line26Credit: "3001" },
    priorDepreciation: { ...priorDepreciation, originalPreCreditBasis: "10001.50", postCreditTableBasis: "7000.50",
      depreciationAllowed: "1400.10", depreciationAllowable: "1400.10", reportedRegularDepreciation: "1400", remainingBasisOnLedger: "5600.40" },
    currentAsset: { ...currentAsset, openingAdjustedBasis: "5600.40" },
  }, observed);
  expect(roundedLine21.exactDepreciation2026.toFixed()).toBe("2240.16");
  expect(roundedLine21.remainingBasisAfterCalculatedDepreciation.toFixed()).toBe("3360.24");
  const fractionalClaimWithinRoundedLimit = { ...originals,
    originalAsset: { ...originalAsset, originalPreCreditBasis: "10001.70" },
    filedClaim: { ...filedClaim, reportedBasisLine21: "10002", line26Credit: "3000.99" },
    priorDepreciation: { ...priorDepreciation, originalPreCreditBasis: "10001.70", postCreditTableBasis: "7000.71",
      depreciationAllowed: "1400.142", depreciationAllowable: "1400.142", reportedRegularDepreciation: "1400", remainingBasisOnLedger: "5600.568" },
    currentAsset: { ...currentAsset, openingAdjustedBasis: "5600.568" },
  };
  expect(() => calculateSection45WSecondYearDepreciation2026(fractionalClaimWithinRoundedLimit, observed)).toThrow(/complete originals/u);
});

it("preserves the exact basis and rounds only the reportable current deduction", () => {
  const result = calculateSection45WSecondYearDepreciation2026({ ...originals,
    originalAsset: { ...originals.originalAsset, originalPreCreditBasis: "25001.63" },
    filedClaim: { ...originals.filedClaim, reportedBasisLine21: "25002" },
    priorDepreciation: { ...originals.priorDepreciation, originalPreCreditBasis: "25001.63", postCreditTableBasis: "19001.63",
      depreciationAllowed: "3800.326", depreciationAllowable: "3800.326", remainingBasisOnLedger: "15201.304" },
    currentAsset: { ...originals.currentAsset, openingAdjustedBasis: "15201.304" },
  }, observed);
  expect(result.tableBasisAfterCredit.toFixed()).toBe("19001.63");
  expect(result.exactDepreciation2026.toFixed()).toBe("6080.5216");
  expect(result.line28.toFixed()).toBe("6081");
  expect(result.remainingBasisAfterCalculatedDepreciation.toFixed()).toBe("9120.7824");
});
