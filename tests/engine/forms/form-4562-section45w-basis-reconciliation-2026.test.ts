// Spec: spec/federal/form-4562-section45w-basis-reconciliation-2026.yaml
import { expect, it } from "vitest";
import { reconcileSection45WVehicleBasis2026 } from "@/engine/forms/form-4562-section45w-basis-reconciliation-2026.js";
import { calculateSection45WFirstYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-first-year-2026.js";
import { commercialCleanVehicle2026Source as vehicle } from "../../fixtures/form-8936-commercial-clean-vehicle.js";

type Input = Parameters<typeof reconcileSection45WVehicleBasis2026>[0];
type Depreciation = Parameters<typeof calculateSection45WFirstYearDepreciation2026>[0]["depreciation"];

const fiveYearElection = {
  treatment: "elected_out",
  electionTaxYear: 2026,
  electionClass: "5_year",
  filedClassElectionConfirmed: true,
  decisionReference: "Filed five-year class election",
} as const satisfies Depreciation["bonus"];

const taxpayer = {
  taxYear: 2026,
  owner: "primary",
  taxpayerReference: "Primary owner original A",
  originalComparedAndConfirmed: true,
} as const;
const activityReference = "Verified Schedule C activity A";
const originals = {
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

function depreciationOriginals(basis: Input = originals) {
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

it("uses the credit-adjusted vehicle basis before first-year depreciation", () => {
  const input = depreciationOriginals();
  const { noCompetingClaimForVinConfirmed: _directClaimOnly, ...claim } = originals.claim;
  const noClaim = depreciationOriginals({ ...originals, claim: { ...claim, position: "no_claim", line26Amount: "0" } });
  const allowed = calculateSection45WFirstYearDepreciation2026(input);
  const allowableWithoutClaim = calculateSection45WFirstYearDepreciation2026(noClaim);
  expect(allowed.basisAfterSection45WAdjustment.toFixed()).toBe("19000");
  expect(allowed.line25.toFixed()).toBe("19000");
  expect(allowed.line26h.toFixed()).toBe("0");
  expect(allowed.line28.toFixed()).toBe("19000");
  expect(allowableWithoutClaim.basisAfterSection45WAdjustment.toFixed()).toBe("25000");
  expect(allowableWithoutClaim.line28.toFixed()).toBe("20300");
  expect(allowableWithoutClaim.lines.some(line => line.line === "26(e)")).toBe(false);
  expect(JSON.stringify(allowed)).not.toMatch(/1HGCM82633A004352|Primary owner|activity A|Bonus choice record|mileage log|Original passenger classification/u);
  expect(input).toEqual(depreciationOriginals());
});

it("selects the passenger limit from the original applicable weight", () => {
  const basis = { ...originals, vehicle: { ...vehicle, grossVehicleWeightRatingPounds: 6100 } };
  const { noCompetingClaimForVinConfirmed: _directClaimOnly, ...claim } = basis.claim;
  const input = depreciationOriginals({ ...basis, claim: { ...claim, position: "no_claim", line26Amount: "0" } });
  const classification = input.depreciation.classification;
  const car = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: { ...input.depreciation,
    classification: { ...classification, unloadedGrossWeightPounds: 6000 },
  } });
  const truck = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: { ...input.depreciation,
    classification: { kind: "truck_or_van", grossVehicleWeightRatingPounds: 6100, manufacturerRecordReference: classification.manufacturerRecordReference },
  } });
  expect(car.line28.toFixed()).toBe("20300");
  expect(truck.line28.toFixed()).toBe("25000");
  expect(() => calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: { ...input.depreciation,
    classification: { kind: "truck_or_van", grossVehicleWeightRatingPounds: 6000, manufacturerRecordReference: classification.manufacturerRecordReference },
  } })).toThrow(/weight/u);
});

it("uses original contract dates for transitional and permanent bonus depreciation", () => {
  const basis = { ...originals, vehicle: { ...vehicle, bindingContractDate: "2025-01-19", paymentDate: "2025-01-20" } };
  const input = depreciationOriginals(basis);
  const { acquisition, bonus } = input.depreciation;
  const earlier = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: { ...input.depreciation,
    bonus: { ...bonus, rate: "20_percent" },
  } });
  expect([earlier.line25, earlier.line26h, earlier.line28].map(amount => amount.toFixed())).toEqual(["3800", "3040", "6840"]);
  expect(earlier.lines.find(line => line.line === "26(e)")?.value.toFixed()).toBe("15200");
  expect(() => calculateSection45WFirstYearDepreciation2026(input)).toThrow(/bonus.*date/u);
  for (const revised of [
    { ...acquisition, enforceableDate: "2025-01-20" },
    { ...acquisition, cancellationRightsExpiredDate: "2025-01-20" },
    { ...acquisition, contingenciesSatisfiedDate: "2025-01-20" },
  ]) {
    const later = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: { ...input.depreciation, acquisition: revised } });
    expect(later.line28.toFixed()).toBe("19000");
  }
});

it("applies the passenger ceiling across a partial bonus and regular depreciation", () => {
  const input = depreciationOriginals({
    ...originals,
    vehicle: {
      ...vehicle,
      bindingContractDate: "2025-01-19", paymentDate: "2025-01-19",
      purchasePrice: "68000", taxBasis: "68000", comparableVehiclePrice: "62000",
    },
    depreciationAsset: { ...originals.depreciationAsset, originalPreCreditBasis: "68000" },
  });
  const { depreciation } = input;
  const withBonus = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: {
    ...depreciation, bonus: { ...depreciation.bonus, rate: "20_percent" },
  } });
  const withoutBonus = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: {
    ...depreciation, bonus: fiveYearElection,
  } });
  expect([withBonus.line25, withBonus.line26h, withBonus.line28].map(amount => amount.toFixed())).toEqual(["12400", "7900", "20300"]);
  expect([withoutBonus.line25, withoutBonus.line26h, withoutBonus.line28].map(amount => amount.toFixed())).toEqual(["0", "12300", "12300"]);
});

it("uses the verified service quarter and rounds only reportable deductions", () => {
  for (const [date, expected] of [["2026-09-30", "1400"], ["2026-10-01", "350"]] as const) {
    const basis = {
      ...originals,
      vehicle: { ...vehicle, datePlacedInService: date, taxBasis: "10001.01" },
      claim: { ...originals.claim, datePlacedInService: date, line26Amount: "3000.303" },
      commercialOriginalOwner: { ...originals.commercialOriginalOwner, datePlacedInService: date },
      depreciationAsset: { ...originals.depreciationAsset, datePlacedInService: date, originalPreCreditBasis: "10001.01" },
    };
    const input = depreciationOriginals(basis);
    const result = calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: { ...input.depreciation,
      bonus: fiveYearElection,
    } });
    expect(result.basisAfterSection45WAdjustment.toFixed()).toBe("7000.707");
    expect([result.line25, result.line26h, result.line28].map(amount => amount.toFixed())).toEqual(["0", expected, expected]);
  }
});

it("holds stale or incomplete first-year depreciation originals", () => {
  const input = depreciationOriginals();
  const { depreciation } = input;
  const invalid = [
    { ...depreciation, taxpayerReference: "Changed owner" },
    { ...depreciation, vin: "1M8GDM9AXKP042788" },
    { ...depreciation, activityReference: "Another activity" },
    { ...depreciation, assetReference: "Another asset record" },
    { ...depreciation, placedInServiceDate: "2026-02-02" },
    { ...depreciation, onlyAssetPlacedInServiceConfirmed: false },
    { ...depreciation, mileage: { ...depreciation.mileage, totalMiles: "1500.51" } },
    { ...depreciation, acquisition: { ...depreciation.acquisition, contractReference: "Wrong original" } },
    { ...depreciation, acquisition: { ...depreciation.acquisition, signedDate: "2025-09-29" } },
    { ...depreciation, acquisition: { ...depreciation.acquisition, enforceableDate: "2025-10-01" } },
    { ...depreciation, acquisition: { ...depreciation.acquisition, enforceableDate: "2026-02-02" } },
    { ...depreciation, acquisition: { ...depreciation.acquisition, contingenciesSatisfiedDate: undefined } },
    { ...depreciation, noOtherBasisAdjustmentsOrDeductionsConfirmed: false },
    { ...depreciation, fiveYearGds200DecliningBalanceConfirmed: false },
    { ...depreciation, noPassengerAutomobileExceptionConfirmed: false },
    { ...depreciation, bonus: { ...fiveYearElection, electionClass: "7_year" } },
    { ...depreciation, bonus: { ...fiveYearElection, filedClassElectionConfirmed: false } },
  ];
  for (const candidate of invalid) {
    expect(() => calculateSection45WFirstYearDepreciation2026({ ...input, depreciation: candidate as Depreciation }))
      .toThrow(/^Original 2026 §45W depreciation/u);
  }
});

it("reconciles the actual direct claim to a single original depreciation asset", () => {
  const result = reconcileSection45WVehicleBasis2026(JSON.parse(JSON.stringify(originals)));
  expect(result.section45WBasisReduction.toFixed()).toBe("6000");
  expect(result.basisAfterSection45WAdjustment.toFixed()).toBe("19000");
  expect(JSON.stringify(result.lines)).not.toMatch(/1HGCM82633A004352|Primary owner|activity A|prepared Schedule A|asset record|Delivery and possession record/u);
});

it("separates an actual claim from positive tentative credit or zero eligibility", () => {
  const { noCompetingClaimForVinConfirmed: _claimOnly, ...sharedClaim } = originals.claim;
  const noClaim = { ...sharedClaim, position: "no_claim", line26Amount: "0.00" } as const;
  expect(reconcileSection45WVehicleBasis2026({ ...originals, claim: noClaim }).basisAfterSection45WAdjustment.toFixed()).toBe("25000");
  const ineligible = { ...originals, vehicle: { ...vehicle, paymentDate: "2025-10-01" } };
  expect(reconcileSection45WVehicleBasis2026({ ...ineligible, claim: noClaim }).section45WBasisReduction.toFixed()).toBe("0");
  expect(() => reconcileSection45WVehicleBasis2026(ineligible)).toThrow(/line 26/u);
  expect(() => reconcileSection45WVehicleBasis2026({ ...originals, claim: { ...noClaim, line26Amount: "1" } })).toThrow(/line 26/u);
  expect(() => reconcileSection45WVehicleBasis2026({ ...originals, claim: { ...originals.claim, line26Amount: "0" } })).toThrow(/line 26/u);
  // A lower current-year Form 3800 utilization cannot be used for Schedule A line 26.
  expect(() => reconcileSection45WVehicleBasis2026({ ...originals, claim: { ...originals.claim, line26Amount: "1500" } })).toThrow(/line 26/u);
});

it("preserves exact basis and tentative credit without tax-form rounding", () => {
  const result = reconcileSection45WVehicleBasis2026({
    ...originals, vehicle: { ...vehicle, taxBasis: "10001.01" },
    depreciationAsset: { ...originals.depreciationAsset, originalPreCreditBasis: "10001.01" },
    claim: { ...originals.claim, line26Amount: "3000.303" },
  });
  expect(result.section45WBasisReduction.toFixed()).toBe("3000.303");
  expect(result.basisAfterSection45WAdjustment.toFixed()).toBe("7000.707");
});

it("holds stale or missing evidence of the exact vehicle owner and activity", () => {
  const { originalRecordReference: _unknown, ...withoutAssetEvidence } = originals.depreciationAsset;
  const cases = [
    { ...originals, depreciationAsset: withoutAssetEvidence },
    { ...originals, depreciationAsset: { ...originals.depreciationAsset, vin: "1M8GDM9AXKP042788" } },
    { ...originals, depreciationAsset: { ...originals.depreciationAsset, originalPreCreditBasis: "24999.99" } },
    { ...originals, depreciationAsset: { ...originals.depreciationAsset, datePlacedInService: "2026-02-02" } },
    { ...originals, depreciationAsset: { ...originals.depreciationAsset, activityReference: "Different Schedule C activity" } },
    { ...originals, depreciationAsset: { ...originals.depreciationAsset, beforeCreditAndCurrentDepreciationConfirmed: false } },
    { ...originals, claim: { ...originals.claim, vin: "1M8GDM9AXKP042788" } },
    { ...originals, claim: { ...originals.claim, taxpayerReference: "Different owner A" } },
    { ...originals, claim: { ...originals.claim, originalComparedAndConfirmed: false } },
    { ...originals, claim: { ...originals.claim, position: "dealer_transfer" } },
    { ...originals, claim: { ...originals.claim, noCompetingClaimForVinConfirmed: false } },
    { ...originals, activity: { ...originals.activity, owner: "spouse" } },
    { ...originals, activity: { ...originals.activity, taxYear: 2025 } },
    { ...originals, commercialOriginalOwner: { ...originals.commercialOriginalOwner, taxpayerReference: "Different owner B" } },
  ];
  for (const candidate of cases) {
    expect(() => reconcileSection45WVehicleBasis2026(candidate as Input)).toThrow(/^Original 2026 §45W/u);
  }
});

it("holds stale commercial owner evidence after a coordinated vehicle replacement", () => {
  const vin = "1M8GDM9AXKP042788";
  const replacement = {
    ...originals,
    vehicle: { ...vehicle, vin },
    claim: { ...originals.claim, vin },
    depreciationAsset: { ...originals.depreciationAsset, vin },
  };
  expect(() => reconcileSection45WVehicleBasis2026(replacement)).toThrow(/^Original 2026 §45W/u);
  const freshOwner = { ...originals.commercialOriginalOwner, vin: ` ${vin.toLowerCase()} ` };
  expect(reconcileSection45WVehicleBasis2026({ ...replacement, commercialOriginalOwner: freshOwner }).basisAfterSection45WAdjustment.toFixed()).toBe("19000");
  for (const owner of [
    { ...freshOwner, datePlacedInService: "2026-02-02" },
    { ...freshOwner, vehiclePossessionRecordReference: "Different original delivery record" },
    { ...freshOwner, vehiclePossessionRecordReference: undefined },
  ]) {
    expect(() => reconcileSection45WVehicleBasis2026({ ...replacement, commercialOriginalOwner: owner as Input["commercialOriginalOwner"] }))
      .toThrow(/^Original 2026 §45W/u);
  }
});
