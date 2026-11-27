import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { calculateSection45WFirstYearDepreciation2026 } from "@/engine/forms/form-4562-section45w-first-year-2026";
import { ScheduleCSection45WFirstYearSchema } from "@/models/schedule-c-section45w-first-year";
import { Section45WCurrentCreditSchema } from "@/models/section45w-current-credit";
import { currentLocalCivilDate } from "@/utils/civil-date";
import { d } from "@/utils/decimal";
import { reviewCommercialScheduleCLink, type GuidedCommercialScheduleCContext } from "./guided-commercial-vehicle-schedule-c";
import type { CommercialVehicleOriginal } from "./guided-vehicle-facts";
import type { z } from "zod";

const workpaperRecords = ScheduleCSection45WFirstYearSchema.pick({ workpaper: true }).extend({
  currentCredit: Section45WCurrentCreditSchema.omit({ priorYearCarryback: true }),
});

export type GuidedCommercialVehicleWorkpaperRecords = z.output<typeof workpaperRecords>;

export interface GuidedCommercialVehicleWorkpaper {
  records?: GuidedCommercialVehicleWorkpaperRecords;
  reviewedFingerprint?: string;
}

const normalizedVin = (value: string | undefined) => value?.trim().toUpperCase();
const normalizedReference = (value: string) => value.trim().replace(/\s+/gu, " ").toLowerCase();
const sourceIssue = "Use complete original eligibility, depreciation and current credit records for one 2026 work van with a 100 percent bonus claim.";

function verifiedWorkpaperRecords(raw: unknown) {
  const parsed = workpaperRecords.safeParse(raw);
  if (!parsed.success) throw new Error(sourceIssue);
  const records = parsed.data;
  let depreciation: ReturnType<typeof calculateSection45WFirstYearDepreciation2026>;
  try {
    // The canonical calculator validates the full nested original records.
    depreciation = calculateSection45WFirstYearDepreciation2026(records.workpaper);
  } catch {
    throw new Error(sourceIssue);
  }
  const { basis, depreciation: source } = records.workpaper;
  if (basis.claim.position !== "direct_claim" || source.classification.kind !== "truck_or_van"
    || source.classification.grossVehicleWeightRatingPounds <= 6000 || source.bonus.treatment !== "claim"
    || source.bonus.rate !== "100_percent") throw new Error(sourceIssue);
  return { records, adjustedBasis: depreciation.basisAfterSection45WAdjustment };
}

export function parseCommercialVehicleWorkpaperRecords(raw: unknown): GuidedCommercialVehicleWorkpaperRecords {
  return verifiedWorkpaperRecords(raw).records;
}

export function reopenCommercialVehicleWorkpaper(raw: GuidedCommercialVehicleWorkpaper | undefined): GuidedCommercialVehicleWorkpaper | undefined {
  if (!raw?.records) return undefined;
  try {
    const records = parseCommercialVehicleWorkpaperRecords(raw.records);
    const { reviewedFingerprint } = raw;
    return typeof reviewedFingerprint === "string" && /^[0-9a-f]{64}$/u.test(reviewedFingerprint)
      ? { records, reviewedFingerprint }
      : { records };
  } catch {
    return undefined;
  }
}

export function reviewCommercialVehicleWorkpaper(original: CommercialVehicleOriginal, context: GuidedCommercialScheduleCContext) {
  const link = original.scheduleCLink;
  const { summary, fingerprint: ledgerFingerprint, message } = reviewCommercialScheduleCLink(original, context);
  if (!summary || !link || !ledgerFingerprint || link.reviewedFingerprint !== ledgerFingerprint) return { message };
  if (!original.workpaper?.records) return { message };
  if (currentLocalCivilDate() < "2027-01-01") {
    return { message: "Complete the actual annual workpapers after the 2026 calendar year closes." };
  }

  let verified: ReturnType<typeof verifiedWorkpaperRecords>;
  try { verified = verifiedWorkpaperRecords(original.workpaper.records); }
  catch { return { message: sourceIssue }; }
  const { records, adjustedBasis } = verified;
  const { activity, claim, commercialOriginalOwner, depreciationAsset, vehicle } = records.workpaper.basis;
  const { participation, amtDepreciation, creditInventory } = records.currentCredit;
  const { personal, business } = context;
  const facts = business?.businessFacts;
  if (!personal || !facts || business?.qbiMateriallyParticipated !== true
    || normalizedVin(vehicle.vin) !== normalizedVin(original.vin)
    || vehicle.bindingContractDate !== original.bindingContractDate || vehicle.bindingContractReference !== original.bindingContractReference?.trim()
    || vehicle.paymentDate !== original.paymentDate || vehicle.paymentReference !== original.paymentReference?.trim()
    || vehicle.datePlacedInService !== original.datePlacedInService || vehicle.placedInServiceReference !== original.placedInServiceReference?.trim()
    || activity.taxpayerReference !== link.taxpayerReference?.trim() || activity.activityReference !== link.activityReference?.trim()
    || activity.originalRecordReference !== summary.sourceReference || activity.principalBusinessActivity !== summary.activity || activity.businessCode !== facts.businessCode
    || commercialOriginalOwner.originalRecordReference !== link.ownerRecordReference?.trim()) {
    return { message: "Reconcile the workpaper with the confirmed original vehicle, taxpayer, Schedule C activity and cash ledger." };
  }

  const claimAndCurrentReferences = [claim.originalRecordReference, depreciationAsset.originalRecordReference,
    participation.originalRecordReference, amtDepreciation.originalRecordReference, creditInventory.originalRecordReference].map(normalizedReference);
  const hours = d(participation.actualHours);
  if (new Set(claimAndCurrentReferences).size !== claimAndCurrentReferences.length
    || hours.lte(500) || hours.gt(8760)
    || [participation, amtDepreciation, creditInventory].some(source => source.taxpayerReference !== activity.taxpayerReference)
    || participation.activityReference !== activity.activityReference || amtDepreciation.activityReference !== activity.activityReference
    || amtDepreciation.assetReference !== depreciationAsset.originalRecordReference
    || normalizedVin(amtDepreciation.vin) !== normalizedVin(vehicle.vin) || amtDepreciation.placedInServiceDate !== vehicle.datePlacedInService
    || !adjustedBasis.eq(amtDepreciation.regularAdjustedBasis) || !adjustedBasis.eq(amtDepreciation.amtAdjustedBasis)) {
    return { message: "Reconcile separate original claim, asset, participation, AMT basis and credit inventory records for the same owner and activity." };
  }

  const scheduleC = ScheduleCSection45WFirstYearSchema.safeParse({
    workpaper: records.workpaper,
    owner: {
      firstName: personal.firstName, lastName: personal.lastName, tin: personal.ssn,
      taxpayerReference: activity.taxpayerReference, originalRecordReference: commercialOriginalOwner.originalRecordReference,
      identityComparedToVehicleAndTaxReturnConfirmed: link.sameOwnerAndVehicleConfirmed,
    },
    ledger: {
      originalRecordReference: link.ledgerRecordReference?.trim(), activityReference: activity.activityReference,
      businessName: facts.businessName?.trim() || null, businessEin: facts.ein?.trim() || null,
      grossReceipts: summary.grossReceipts,
      expenses: { advertising: summary.advertising, officeExpense: summary.officeExpense, supplies: summary.supplies },
      completeAndReconciledConfirmed: link.scopeAndAmountsConfirmed,
      excludesVehicleCostsAndOtherActivitiesConfirmed: link.scopeAndAmountsConfirmed,
    },
  });
  if (!scheduleC.success) return { message: "Reconcile the actual Schedule C owner and exact cash ledger." };

  const binding = JSON.stringify(["guided-45w-workpaper-v1", ledgerFingerprint, personal.middleName ?? "", records], (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
      : value);
  const fingerprint = bytesToHex(sha256(new TextEncoder().encode(binding)));
  if (original.workpaper.reviewedFingerprint !== fingerprint) {
    return { fingerprint, message: "Review and confirm the original commercial vehicle workpaper." };
  }
  return {
    fingerprint,
    packet: {
      scheduleC: scheduleC.data,
      form8936: { newCleanVehicles: [], previouslyOwnedCleanVehicles: [], commercialCleanVehicles: [vehicle], commercialCleanVehicleCurrentCredit: records.currentCredit },
    },
  };
}
