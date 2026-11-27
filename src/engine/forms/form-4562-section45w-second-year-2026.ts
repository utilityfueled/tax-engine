/** Private evidence-bound second-year worksheet for one 2025 commercial clean work van. */
import type Decimal from "decimal.js";
import { z } from "zod";
import { MACRS_GDS_200DB_HALF_YEAR } from "@/models/constants.js";
import type { CalculatedLine } from "@/models/outputs.js";
import { AuditTrail } from "@/utils/audit.js";
import { isActualDate } from "@/utils/civil-date.js";
import { d, max, roundDollar } from "@/utils/decimal.js";

const FORM = "Form 4562";
const reference = z.string().refine(value => value.trim().length > 0);
const exactAmount = z.string().regex(/^\d{1,12}(?:\.\d{1,5})?$/u);
const cents = z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/u);
const wholeDollarAmount = z.string().regex(/^\d{1,12}(?:\.0{1,2})?$/u);
const zeroAmount = z.string().regex(/^0{1,12}(?:\.0{1,5})?$/u);
const vehicleVin = z.string().refine(value => /^[A-HJ-NPR-Z0-9]{17}$/iu.test(value.trim()));
const original = { sourceReference: reference, originalComparedAndConfirmed: z.literal(true) };
const sameAsset = {
  taxpayerReference: reference,
  activityReference: reference,
  assetReference: reference,
  vin: vehicleVin,
  placedInServiceDate: z.iso.date().refine(date => date.startsWith("2025-")),
};
const mileage = z.strictObject({
  logReference: reference,
  assetReference: reference,
  fromDate: z.iso.date(),
  throughDate: z.iso.date(),
  qualifiedBusinessMiles: exactAmount,
  totalMiles: exactAmount,
  exclusivelyUnitedStatesUseConfirmed: z.literal(true),
  completeForApplicablePeriodConfirmed: z.literal(true),
});

const workpaperSchema = z.strictObject({
  taxYear: z.literal(2026),
  priorReturn: z.strictObject({
    ...original, taxYear: z.literal(2025), filingStatus: z.literal("single"), taxpayerReference: reference,
    filedReturnReference: reference, filedReturnDate: z.iso.date(),
    calendarYearConfirmed: z.literal(true), wholeDollarReportingConfirmed: z.literal(true),
  }),
  originalAsset: z.strictObject({
    ...original, ...sameAsset, originalPreCreditBasis: cents, vehicleKind: z.literal("truck_or_van"),
    manufacturerGrossVehicleWeightRatingPounds: z.number().int().gt(6000).lt(14000), manufacturerReference: reference, manufacturerVin: vehicleVin,
    ordinaryListedTransportationConfirmed: z.literal(true), primarySoleProprietorOwnershipConfirmed: z.literal(true),
    retainedAndNoOtherBasisChangesConfirmed: z.literal(true), inventoryReference: reference,
    onlyEligibleAssetPlacedInServiceConfirmed: z.literal(true), inventoryAssetReference: reference,
    mileage: mileage.extend({ taxYear: z.literal(2025) }),
  }),
  filedClaim: z.strictObject({
    ...original, ...sameAsset, filedReturnReference: reference, reportedBasisLine21: wholeDollarAmount, line26Credit: wholeDollarAmount,
    directClaimedBasisReductionConfirmed: z.literal(true), noCompetingVehicleCreditConfirmed: z.literal(true),
  }),
  filedClassElection: z.strictObject({
    ...original, taxpayerReference: reference, filedReturnReference: reference, taxYear: z.literal(2025),
    recoveryClass: z.literal("5_year"), timelyFiledClassElectionOutConfirmed: z.literal(true),
  }),
  priorDepreciation: z.strictObject({
    ...original, ...sameAsset, filedReturnReference: reference, originalPreCreditBasis: cents,
    postCreditTableBasis: exactAmount, recoveryPeriod: z.literal("5"), method: z.literal("GDS_200DB"), convention: z.literal("half_year"),
    section179Deduction: zeroAmount, bonusDepreciation: zeroAmount,
    depreciationAllowed: exactAmount, depreciationAllowable: exactAmount, reportedRegularDepreciation: wholeDollarAmount,
    remainingBasisOnLedger: exactAmount, noMileageMethodOrOtherDepreciationConfirmed: z.literal(true),
  }),
  currentAsset: z.strictObject({
    ...original, ...sameAsset, taxYear: z.literal(2026), openingAdjustedBasis: exactAmount,
    sameOwnershipAndActivityConfirmed: z.literal(true), retainedFullCalendarYearConfirmed: z.literal(true),
    noDispositionUseChangeOrRecaptureConfirmed: z.literal(true), noOtherBasisOrMethodChangesConfirmed: z.literal(true),
    mileage: mileage.extend({ taxYear: z.literal(2026) }),
  }),
});

type Workpaper = z.input<typeof workpaperSchema>;

interface WorkpaperResult {
  tableBasisAfterCredit: Decimal;
  verifiedDepreciation2025: Decimal;
  openingAdjustedBasis: Decimal;
  exactDepreciation2026: Decimal;
  line26h: Decimal;
  line28: Decimal;
  remainingBasisAfterCalculatedDepreciation: Decimal;
  lines: CalculatedLine[];
}

export function calculateSection45WSecondYearDepreciation2026(input: Workpaper, observation: { asOfDate: string }): WorkpaperResult {
  const fail = (reason: string): never => { throw new Error(`2026 Section 45W depreciation ${reason}.`); };
  const asOfDate = observation?.asOfDate;
  if (!asOfDate || !isActualDate(asOfDate) || asOfDate < "2027-01-01") return fail("requires a completed 2026 calendar year as of the observation date");
  const parsed = workpaperSchema.safeParse(input);
  if (!parsed.success) return fail("requires the complete originals for one continuing ordinary listed work van");

  const { priorReturn, originalAsset, filedClaim, filedClassElection, priorDepreciation, currentAsset } = parsed.data;
  if (priorReturn.filedReturnDate <= "2025-12-31" || priorReturn.filedReturnDate >= asOfDate) {
    return fail("requires a prior filing date after the 2025 year-end and before observation");
  }
  const { taxpayerReference, activityReference, assetReference, placedInServiceDate } = originalAsset;
  const vin = originalAsset.vin.trim().toUpperCase();
  if (priorReturn.taxpayerReference !== taxpayerReference || filedClassElection.taxpayerReference !== taxpayerReference
    || originalAsset.manufacturerVin.trim().toUpperCase() !== vin || originalAsset.inventoryAssetReference !== assetReference
    || [filedClaim, filedClassElection, priorDepreciation].some(record => record.filedReturnReference !== priorReturn.filedReturnReference)
    || [filedClaim, priorDepreciation, currentAsset].some(record => record.taxpayerReference !== taxpayerReference
      || record.activityReference !== activityReference || record.assetReference !== assetReference
      || record.placedInServiceDate !== placedInServiceDate || record.vin.trim().toUpperCase() !== vin)) {
    return fail("requires consistent originals for the filed return, taxpayer, activity and retained vehicle");
  }
  if (placedInServiceDate >= "2025-10-01") return fail("requires the actual 2025 half-year convention");
  if (originalAsset.mileage.fromDate !== placedInServiceDate || originalAsset.mileage.throughDate !== "2025-12-31"
    || currentAsset.mileage.fromDate !== "2026-01-01" || currentAsset.mileage.throughDate !== "2026-12-31") {
    return fail("requires complete original mileage periods for both depreciation years");
  }
  if ([originalAsset.mileage, currentAsset.mileage].some(log => log.assetReference !== assetReference
    || !d(log.totalMiles).gt(0) || !d(log.totalMiles).eq(log.qualifiedBusinessMiles))) {
    return fail("requires exclusive qualified business mileage for both depreciation years");
  }

  const priorBasis = d(originalAsset.originalPreCreditBasis);
  const reportedBasis = d(filedClaim.reportedBasisLine21);
  const credit = d(filedClaim.line26Credit);
  const tableBasisAfterCredit = priorBasis.minus(credit);
  // Allow the upper bound from either exact calculation or the verified whole-dollar line 21.
  const creditBasisCeiling = roundDollar(max(priorBasis, reportedBasis).times("0.30"));
  if (!credit.gt(0) || credit.gt(7500) || credit.gt(creditBasisCeiling) || !roundDollar(priorBasis).eq(reportedBasis)
    || !priorBasis.eq(priorDepreciation.originalPreCreditBasis)
    || !tableBasisAfterCredit.eq(priorDepreciation.postCreditTableBasis)) {
    return fail("requires matching original basis and the actual filed credit reduction");
  }

  const [priorRate, currentRate] = MACRS_GDS_200DB_HALF_YEAR[5];
  const verifiedDepreciation2025 = tableBasisAfterCredit.times(priorRate).div(100);
  const openingAdjustedBasis = tableBasisAfterCredit.minus(verifiedDepreciation2025);
  if (!verifiedDepreciation2025.eq(priorDepreciation.depreciationAllowed)
    || !verifiedDepreciation2025.eq(priorDepreciation.depreciationAllowable)
    || !roundDollar(verifiedDepreciation2025).eq(priorDepreciation.reportedRegularDepreciation)
    || !openingAdjustedBasis.eq(priorDepreciation.remainingBasisOnLedger) || !openingAdjustedBasis.eq(currentAsset.openingAdjustedBasis)) {
    return fail("requires consistent allowed and allowable 2025 depreciation and opening basis");
  }

  const exactDepreciation2026 = tableBasisAfterCredit.times(currentRate).div(100);
  const line26h = roundDollar(exactDepreciation2026);
  const remainingBasisAfterCalculatedDepreciation = openingAdjustedBasis.minus(exactDepreciation2026);
  const audit = new AuditTrail();
  audit.record(FORM, "prior-business-basis", "Business table basis after the commercial clean vehicle credit",
    tableBasisAfterCredit, "Original business basis less the verified filed credit", {
      "Original business basis": priorBasis, "Filed credit": credit,
    });
  audit.record(FORM, "opening-adjusted-basis", "Adjusted opening basis for the second depreciation year",
    openingAdjustedBasis, "Business table basis less verified prior allowed and allowable depreciation", {
      "Verified prior depreciation": verifiedDepreciation2025,
    });
  audit.record(FORM, "26(h)", "Second-year listed-property depreciation", line26h,
    "Apply the second-year GDS half-year percentage to the original table basis", {
      "Applicable MACRS percentage": currentRate, "Exact current depreciation": exactDepreciation2026,
    });
  audit.record(FORM, "28", "Total listed-property depreciation for the continuing vehicle", line26h,
    "Include the regular deduction once for the retained vehicle");
  return { tableBasisAfterCredit, verifiedDepreciation2025, openingAdjustedBasis, exactDepreciation2026,
    line26h, line28: line26h, remainingBasisAfterCalculatedDepreciation, lines: audit.getLines() };
}
