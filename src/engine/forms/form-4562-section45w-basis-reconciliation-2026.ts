/** Private §45W asset linkage and basis reconciliation before depreciation. */
import type Decimal from "decimal.js";
import { z } from "zod";
import { calculateCommercialCleanVehicleCredit2026 } from "@/engine/forms/form-8936-commercial-clean-vehicle-2026.js";
import { CommercialCleanVehicle2026SourceSchema } from "@/models/inputs.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { d } from "@/utils/decimal.js";

const reference = z.string().refine(value => value.trim().length > 0);
const normalizedVin = (vin: string) => vin.trim().toUpperCase();
const originalRecord = {
  taxYear: z.literal(2026),
  owner: z.literal("primary"),
  taxpayerReference: reference,
  originalRecordReference: reference,
  originalComparedAndConfirmed: z.literal(true),
};
const vehicleIdentity = {
  vin: z.string().refine(vin => /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim())),
  datePlacedInService: z.iso.date().refine(date => date.startsWith("2026-")),
};
const claimRecord = {
  ...originalRecord,
  ...vehicleIdentity,
  // A private exact working amount can contain fractions of a cent.
  line26Amount: z.string().regex(/^\d{1,12}(?:\.\d{1,3})?$/u),
};

const reconciliationSchema = z.strictObject({
  commercialOriginalOwner: z.strictObject({
    ...originalRecord,
    ...vehicleIdentity,
    vehiclePossessionRecordReference: reference,
  }),
  vehicle: CommercialCleanVehicle2026SourceSchema,
  claim: z.discriminatedUnion("position", [
    z.strictObject({ ...claimRecord, position: z.literal("direct_claim"), noCompetingClaimForVinConfirmed: z.literal(true) }),
    z.strictObject({ ...claimRecord, position: z.literal("no_claim") }),
  ]),
  activity: z.strictObject({
    ...originalRecord,
    activityReference: reference,
    businessCode: z.string().regex(/^\d{6}$/u),
    principalBusinessActivity: reference,
    soleProprietorConfirmed: z.literal(true),
  }),
  // Vehicle and activity identifiers come from the underlying depreciation asset record.
  depreciationAsset: z.strictObject({
    ...originalRecord,
    ...vehicleIdentity,
    activityReference: reference,
    originalPreCreditBasis: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u),
    beforeCreditAndCurrentDepreciationConfirmed: z.literal(true),
  }),
});

type ReconciliationInput = z.input<typeof reconciliationSchema>;

interface ReconciliationResult {
  section45WBasisReduction: Decimal;
  basisAfterSection45WAdjustment: Decimal;
  lines: CalculatedLine[];
}

export function reconcileSection45WVehicleBasis2026(input: ReconciliationInput): ReconciliationResult {
  const parsed = reconciliationSchema.safeParse(input);
  if (!parsed.success) throw new Error("Original 2026 §45W evidence is incomplete or outside the supported basis workpaper.");

  const { commercialOriginalOwner, vehicle, claim, activity, depreciationAsset } = parsed.data;
  const originalBasis = d(vehicle.taxBasis);
  const vin = normalizedVin(vehicle.vin);
  const taxpayerReference = commercialOriginalOwner.taxpayerReference;
  if ([claim, activity, depreciationAsset].some(record => record.taxpayerReference !== taxpayerReference)
    || [commercialOriginalOwner, claim, depreciationAsset].some(record =>
      normalizedVin(record.vin) !== vin || record.datePlacedInService !== vehicle.datePlacedInService)
    || commercialOriginalOwner.vehiclePossessionRecordReference !== vehicle.placedInServiceReference
    || activity.activityReference !== depreciationAsset.activityReference
    || !originalBasis.eq(depreciationAsset.originalPreCreditBasis)) {
    throw new Error("Original 2026 §45W evidence must agree across the taxpayer, vehicle, Schedule C activity and pre-credit asset basis.");
  }

  const { tentativeCredit } = calculateCommercialCleanVehicleCredit2026({ taxYear: claim.taxYear, vehicles: [vehicle] });
  const claimedAmount = d(claim.line26Amount);
  const supportedClaim = claim.position === "direct_claim" ? claimedAmount.gt(0) && claimedAmount.eq(tentativeCredit) : claimedAmount.isZero();
  if (!supportedClaim) throw new Error("The documented Schedule A line 26 amount conflicts with the credit or the confirmed claim position.");

  const adjustedBasis = originalBasis.minus(claimedAmount);
  const audit = new AuditTrail();
  audit.record("Form 4562", "basis-after-section45w", "Vehicle basis after the §45W adjustment", adjustedBasis,
    "Reconciled original basis minus the actual direct credit claimed, before current depreciation", {
      "Original pre-credit basis": originalBasis,
      "Actual §45W basis reduction": claimedAmount,
    });
  return { section45WBasisReduction: claimedAmount, basisAfterSection45WAdjustment: adjustedBasis, lines: audit.getLines() };
}
