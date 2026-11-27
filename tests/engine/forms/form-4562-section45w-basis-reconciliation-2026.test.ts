// Spec: spec/federal/form-4562-section45w-basis-reconciliation-2026.yaml
import { expect, it } from "vitest";
import { reconcileSection45WVehicleBasis2026 } from "@/engine/forms/form-4562-section45w-basis-reconciliation-2026.js";
import { commercialCleanVehicle2026Source as vehicle } from "../../fixtures/form-8936-commercial-clean-vehicle.js";

type Input = Parameters<typeof reconcileSection45WVehicleBasis2026>[0];

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
