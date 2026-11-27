// Spec: spec/federal/form-3800-commercial-clean-vehicle-2026.yaml
import { expect, it } from "vitest";
import { calculateCommercialCleanVehicleForm3800Workpaper2026 } from "@/engine/forms/form-3800-commercial-clean-vehicle-2026.js";
import { commercialCleanVehicle2026Source as vehicle } from "../../fixtures/form-8936-commercial-clean-vehicle.js";

type Workpaper = Parameters<typeof calculateCommercialCleanVehicleForm3800Workpaper2026>[0];

const priorYear = {
  taxYear: 2025,
  filingStatus: "single",
  samePrimaryTaxpayerAndCalendarYearConfirmed: true,
  filedReturnReference: "Original prior individual return",
  section38LimitationReference: "Prior-year ordinary Section 38 limitation workpaper",
  priorityCreditOrderingReference: "Prior-year unused-credit ordering workpaper",
  section39CapacityVerifiedConfirmed: true,
  onlyOrdinarySection38PriorityCreditsConfirmed: true,
  excludesProposedCarrybackConfirmed: true,
  section38Limitation: "2000",
  section38CarryforwardAndCurrentCredits: "1000",
  earlierSourceYearCarrybacks: "0",
} as const satisfies NonNullable<Workpaper["priorYear"]>;

const originals = {
  taxYear: 2026,
  owner: "primary",
  filingStatus: "single",
  taxableIndividualCalendarYearConfirmed: true,
  materiallyParticipatingSoleProprietorConfirmed: true,
  noOtherCurrentPassiveOrCarryCreditsConfirmed: true,
  requiredBasisAdjustmentsReflectedInTaxAndCreditsConfirmed: true,
  currentWorkpapersForSamePrimaryTaxpayerConfirmed: true,
  vehicles: [vehicle],
  otherVehicleClaimVinsConfirmed: true,
  otherClaimVins: [],
  regularTaxWorkpaper: {
    taxYear: 2026,
    reference: "Regular income tax workpaper",
    amount: "3000",
    applicableSchedule2AndExclusionsReconciledConfirmed: true,
  },
  alternativeMinimumTaxWorkpaper: {
    taxYear: 2026,
    reference: "Separate Form 6251 workpaper",
    amt: "0",
    tentativeMinimumTax: "1000",
    actualForm6251AmountsConfirmed: true,
  },
  nonrefundableCreditsWorkpaper: {
    taxYear: 2026,
    reference: "Nonrefundable personal credit reconciliation",
    childTaxCredit: "250",
    otherNonrefundableCredits: "250",
    allowableSection38ReductionsReconciledConfirmed: true,
  },
  priorYear,
} as const satisfies Workpaper;

it("applies the ordinary tax limit and the confirmed prior-year capacity", () => {
  const result = calculateCommercialCleanVehicleForm3800Workpaper2026(originals);
  expect(result.tentativeSection45WCredit.toFixed()).toBe("6000");
  expect(result.currentYearSection38Limitation.toFixed()).toBe("1500");
  expect(result.allowableCredit2026.toFixed()).toBe("1500");
  expect(result.unusedCredit2026.toFixed()).toBe("4500");
  expect(result.priorYearSection39Capacity?.toFixed()).toBe("1000");
  expect(result.carrybackTo2025.toFixed()).toBe("1000");
  expect(result.potentialCarryforwardTo2027.toFixed()).toBe("3500");
  expect(result.lines.find(line => line.line === "current-year-limitation")?.value.toFixed()).toBe("1500");
  expect(result.lines.some(line => line.line.startsWith("Part "))).toBe(false);
  expect(JSON.stringify(result.lines)).not.toMatch(/Original prior individual return|credit reconciliation|1HGCM82633A004352/u);
});

it("holds missing prior-year evidence and distinguishes confirmed zero capacity", () => {
  expect(() => calculateCommercialCleanVehicleForm3800Workpaper2026({ ...originals, priorYear: undefined })).toThrow(/2025.*workpaper/u);
  const noPriorRoom = { ...priorYear, section38Limitation: "200" };
  const result = calculateCommercialCleanVehicleForm3800Workpaper2026({ ...originals, priorYear: noPriorRoom });
  expect(result.priorYearSection39Capacity?.toFixed()).toBe("0");
  expect(result.carrybackTo2025.toFixed()).toBe("0");
  expect(result.potentialCarryforwardTo2027.toFixed()).toBe("4500");

  const enoughPriorRoom = { ...priorYear, section38Limitation: "10000" };
  const covered = calculateCommercialCleanVehicleForm3800Workpaper2026({ ...originals, priorYear: enoughPriorRoom });
  expect(covered.carrybackTo2025.toFixed()).toBe("4500");
  expect(covered.potentialCarryforwardTo2027.toFixed()).toBe("0");
});

it("keeps fractional amounts and never treats the whole unused amount as carried forward", () => {
  const result = calculateCommercialCleanVehicleForm3800Workpaper2026({
    ...originals,
    vehicles: [{ ...vehicle, taxBasis: "2000.01" }],
    regularTaxWorkpaper: { ...originals.regularTaxWorkpaper, amount: "100.05" },
    alternativeMinimumTaxWorkpaper: { ...originals.alternativeMinimumTaxWorkpaper, tentativeMinimumTax: "0" },
    nonrefundableCreditsWorkpaper: { ...originals.nonrefundableCreditsWorkpaper, childTaxCredit: "0", otherNonrefundableCredits: "0" },
    priorYear: { ...priorYear, section38Limitation: "1100.0025" },
  });
  expect(result.tentativeSection45WCredit.toFixed()).toBe("600.003");
  expect(result.carrybackTo2025.toFixed()).toBe("100.0025");
  expect(result.potentialCarryforwardTo2027.toFixed()).toBe("399.9505");
  expect(result.lines.some(line => line.line === "Carryforward")).toBe(false);
});

it("uses the greater 25-percent excess when it exceeds tentative minimum tax", () => {
  const result = calculateCommercialCleanVehicleForm3800Workpaper2026({
    ...originals,
    regularTaxWorkpaper: { ...originals.regularTaxWorkpaper, amount: "40000" },
    priorYear: undefined,
  });
  // Net tax of 39,500 less the greater of 3,625 or 1,000 equals 35,875.
  expect(result.currentYearSection38Limitation.toFixed()).toBe("35875");
  expect(result.allowableCredit2026.toFixed()).toBe("6000");
  expect(result.priorYearSection39Capacity).toBeUndefined();
  expect(result.potentialCarryforwardTo2027.toFixed()).toBe("0");
});

it("holds the tentative minimum tax floor when actual AMT is positive", () => {
  const result = calculateCommercialCleanVehicleForm3800Workpaper2026({
    ...originals,
    regularTaxWorkpaper: { ...originals.regularTaxWorkpaper, amount: "1000" },
    alternativeMinimumTaxWorkpaper: { ...originals.alternativeMinimumTaxWorkpaper, amt: "900", tentativeMinimumTax: "1900" },
    nonrefundableCreditsWorkpaper: { ...originals.nonrefundableCreditsWorkpaper, childTaxCredit: "0", otherNonrefundableCredits: "0" },
  });
  expect(result.allowableCredit2026.toFixed()).toBe("0");
  expect(result.carrybackTo2025.toFixed()).toBe("1000");
  expect(result.potentialCarryforwardTo2027.toFixed()).toBe("5000");
});

it("does not require prior tax facts when the verified vehicle credit is zero", () => {
  const result = calculateCommercialCleanVehicleForm3800Workpaper2026({ ...originals, priorYear: undefined,
    vehicles: [{ ...vehicle, paymentDate: "2025-10-01" }],
  });
  expect(result.allowableCredit2026.toFixed()).toBe("0");
  expect(result.unusedCredit2026.toFixed()).toBe("0");
  expect(result.carrybackTo2025.toFixed()).toBe("0");
});

it("holds same-year duplicate vehicle claims from other Form 8936 cohorts", () => {
  expect(() => calculateCommercialCleanVehicleForm3800Workpaper2026({
    ...originals, otherClaimVins: [` ${vehicle.vin.toLowerCase()} `],
  })).toThrow(/distinct VIN/u);
  expect(calculateCommercialCleanVehicleForm3800Workpaper2026({
    ...originals, otherClaimVins: ["1M8GDM9AXKP042788"],
  }).allowableCredit2026.toFixed()).toBe("1500");
});

it("holds unsupported owners, mismatched years and unknown or contradictory tax facts", () => {
  const { alternativeMinimumTaxWorkpaper: _missing, ...withoutAmt } = originals;
  const badSources = [
    withoutAmt,
    { ...originals, taxYear: 2025 },
    { ...originals, owner: "spouse" },
    { ...originals, filingStatus: "married_filing_separately" },
    { ...originals, materiallyParticipatingSoleProprietorConfirmed: false },
    { ...originals, noOtherCurrentPassiveOrCarryCreditsConfirmed: false },
    { ...originals, requiredBasisAdjustmentsReflectedInTaxAndCreditsConfirmed: false },
    { ...originals, currentWorkpapersForSamePrimaryTaxpayerConfirmed: false },
    { ...originals, otherVehicleClaimVinsConfirmed: false },
    { ...originals, otherClaimVins: ["unknown"] },
    { ...originals, regularTaxWorkpaper: { ...originals.regularTaxWorkpaper, taxYear: 2025 } },
    { ...originals, regularTaxWorkpaper: { ...originals.regularTaxWorkpaper, amount: "" } },
    { ...originals, regularTaxWorkpaper: { ...originals.regularTaxWorkpaper, amount: NaN } },
    { ...originals, alternativeMinimumTaxWorkpaper: { ...originals.alternativeMinimumTaxWorkpaper, amt: "1000.01" } },
    { ...originals, alternativeMinimumTaxWorkpaper: { ...originals.alternativeMinimumTaxWorkpaper, actualForm6251AmountsConfirmed: false } },
    { ...originals, nonrefundableCreditsWorkpaper: { ...originals.nonrefundableCreditsWorkpaper, childTaxCredit: "2750.01" } },
    { ...originals, priorYear: { ...priorYear, taxYear: 2024 } },
    { ...originals, priorYear: { ...priorYear, samePrimaryTaxpayerAndCalendarYearConfirmed: false } },
    { ...originals, priorYear: { ...priorYear, excludesProposedCarrybackConfirmed: false } },
    { ...originals, priorYear: { ...priorYear, onlyOrdinarySection38PriorityCreditsConfirmed: false } },
    { ...originals, priorYear: { ...priorYear, earlierSourceYearCarrybacks: "-1" } },
    { ...originals, priorYear: { ...priorYear, earlierSourceYearCarrybacks: "0.01" } },
  ];
  for (const source of badSources) expect(() => calculateCommercialCleanVehicleForm3800Workpaper2026(source as Workpaper)).toThrow(/workpapers/u);
});
