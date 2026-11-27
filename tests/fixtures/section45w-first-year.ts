import type { reconcileSection45WVehicleBasis2026 } from "@/engine/forms/form-4562-section45w-basis-reconciliation-2026.js";
import { commercialCleanVehicle2026Source as vehicle } from "./form-8936-commercial-clean-vehicle.js";

type Input = Parameters<typeof reconcileSection45WVehicleBasis2026>[0];

const taxpayer = {
  taxYear: 2026,
  owner: "primary",
  taxpayerReference: "Primary owner original A",
  originalComparedAndConfirmed: true,
} as const;
const activityReference = "Verified Schedule C activity A";
export const section45WBasisOriginals = {
  commercialOriginalOwner: {
    ...taxpayer, originalRecordReference: "Original delivery record owner",
    vin: vehicle.vin, datePlacedInService: vehicle.datePlacedInService,
    vehiclePossessionRecordReference: vehicle.placedInServiceReference,
  },
  vehicle,
  claim: {
    ...taxpayer, originalRecordReference: "Confirmed prepared Schedule A",
    vin: vehicle.vin, datePlacedInService: vehicle.datePlacedInService,
    position: "direct_claim", line26Amount: "6000.00", noCompetingClaimForVinConfirmed: true,
  },
  activity: {
    ...taxpayer, originalRecordReference: "Original Schedule C workpaper", activityReference,
    businessCode: "541618", principalBusinessActivity: "Consulting", soleProprietorConfirmed: true,
  },
  depreciationAsset: {
    ...taxpayer, originalRecordReference: "Original Form 4562 vehicle asset record", activityReference,
    vin: ` ${vehicle.vin.toLowerCase()} `, datePlacedInService: vehicle.datePlacedInService,
    originalPreCreditBasis: "25000", beforeCreditAndCurrentDepreciationConfirmed: true,
  },
} as const satisfies Input;

export function section45WDepreciationOriginals(basis: Input = section45WBasisOriginals) {
  return {
    basis,
    depreciation: {
      taxYear: 2026,
      owner: "primary",
      taxpayerReference: basis.depreciationAsset.taxpayerReference,
      activityReference: basis.depreciationAsset.activityReference,
      assetReference: basis.depreciationAsset.originalRecordReference,
      vin: basis.vehicle.vin,
      placedInServiceDate: basis.vehicle.datePlacedInService,
      inventoryReference: "Full-year sole-proprietor property inventory",
      onlyAssetPlacedInServiceConfirmed: true,
      fullCalendarYearConfirmed: true,
      classification: {
        kind: "car",
        unloadedGrossWeightPounds: 3000,
        manufacturerRecordReference: "Original passenger classification",
      },
      acquisition: {
        contractReference: basis.vehicle.bindingContractReference,
        signedDate: basis.vehicle.bindingContractDate,
        enforceableDate: basis.vehicle.bindingContractDate,
        cancellationRightsExpiredDate: null,
        contingenciesSatisfiedDate: null,
        writtenBindingContractTermsConfirmed: true,
      },
      mileage: {
        logReference: "Fictional complete mileage log",
        qualifiedBusinessMiles: "1500.5",
        totalMiles: "1500.5",
        contemporaneousFullUseConfirmed: true,
      },
      bonus: { treatment: "claim", rate: "100_percent", decisionReference: "Bonus choice record" },
      qualificationReference: "Fictional depreciation methods workpaper",
      purchasedNewOriginalUseConfirmed: true,
      ordinaryListedTransportationConfirmed: true,
      fiveYearGds200DecliningBalanceConfirmed: true,
      noPassengerAutomobileExceptionConfirmed: true,
      noAdsOrAlternativeMacrsMethodConfirmed: true,
      noOtherBasisAdjustmentsOrDeductionsConfirmed: true,
      noDispositionOrUseChangeConfirmed: true,
      noReducedRateTransitionElectionConfirmed: true,
    },
  } as const;
}
