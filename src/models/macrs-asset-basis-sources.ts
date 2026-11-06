/** Original-bound, first-year GDS personal-property basis only. */
import { z } from "zod";
import Decimal from "decimal.js";

const decimalPattern = /^\d+(\.\d+)?$/;
const money = z.string().refine(value => decimalPattern.test(value) && new Decimal(value).isFinite());
const reference = z.string().min(1).max(500).refine(value => value.trim().length > 0);
const percentage = money.refine(value => decimalPattern.test(value) && new Decimal(value).isFinite() && new Decimal(value).lte(100));

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

const snapshot = z.strictObject({
  description: z.string().optional(),
  costBasis: money,
  placedInServiceDate: z.string().refine(isCalendarDate, "Actual calendar date required"),
  recoveryPeriod: z.enum(["3", "5", "7", "10"]),
  method: z.literal("200DB"),
  convention: z.enum(["halfYear", "midQuarter"]).optional(),
  disposedDuringYear: z.literal(false),
  isListedProperty: z.boolean(),
  isPassengerAutomobile: z.literal(false),
  businessUsePercentage: z.number().finite().min(0).max(100),
  firstYearBonusEligible: z.boolean().optional(),
  section280FRecaptureTriggered: z.literal(false).optional(),
});

export const MACRSAssetBasisSourcesSchema = z.strictObject({
  version: z.literal("macrs-basis-v1"),
  system: z.literal("GDS"),
  sourceTaxYear: z.number().int().min(1987).max(9999),
  sourceReference: reference,
  grossBasisSourceReference: reference,
  businessUseSourceReference: reference,
  section179SourceReference: reference,
  bonusSourceReference: reference,
  confirmed: z.literal(true),
  calendarYear: z.literal(true),
  usePattern: z.literal("constant_business_only"),
  changedUseDuringYear: z.literal(false),
  noOtherBasisAdjustmentsConfirmed: z.literal(true),
  noConversionOrCarryoverBasisConfirmed: z.literal(true),
  // Preserve the legacy scalar's explicit meaning; the calculation below starts
  // with gross basis rather than allocating a business-only deduction again.
  legacyCostBasisMeaning: z.literal("gross_basis_less_business_section179_before_bonus"),
  grossCostBasis: money,
  businessUsePercentage: percentage,
  section179BusinessDeduction: money,
  bonusBusinessDeduction: money,
  assetSnapshot: snapshot,
});

export type MACRSAssetBasisSources = z.infer<typeof MACRSAssetBasisSourcesSchema>;
export type MACRSBasisSourceStatus = "legacy_unqualified" | "documented_first_year";

export interface MACRSBasisSourceAmounts {
  legacyCostBasis: Decimal;
  grossCostBasis: Decimal;
  businessBasis: Decimal;
  section179BusinessDeduction: Decimal;
  bonusBusinessDeduction: Decimal;
  midQuarterTestBasis: Decimal;
  regularMacrsBasis: Decimal;
}

/** Structural input avoids a runtime cycle with the canonical input schema. */
interface BasisAsset {
  description?: string;
  costBasis: string;
  placedInServiceDate: string;
  recoveryPeriod: string;
  method?: string;
  convention?: string;
  disposedDuringYear?: boolean;
  isListedProperty?: boolean;
  isPassengerAutomobile?: boolean;
  businessUsePercentage?: number;
  firstYearBonusEligible?: boolean;
  section280FRecaptureTriggered?: boolean;
  cumulativePriorMacrsDeductions?: string;
  cumulativePriorAdsDeductions?: string;
  basisSources?: unknown;
}

function fail(reason: string): never {
  // Neither original documentary references nor raw validation errors are public.
  throw new Error(`MACRS asset basis sources: ${reason}`);
}

/**
 * Derive finite source-bound bases without trusting an override amount.
 * Absent metadata remains legacy compatibility, never source-qualified basis.
 * These records do not establish election eligibility or whole-asset readiness.
 */
export function resolveMACRSAssetBasisSources(
  asset: BasisAsset,
  taxYear: number,
): MACRSBasisSourceAmounts | undefined {
  if (asset.basisSources === undefined) return undefined;
  const parsed = MACRSAssetBasisSourcesSchema.safeParse(asset.basisSources);
  if (!parsed.success) fail("complete documented first-year facts are required");
  const source = parsed.data;
  if (!Number.isInteger(taxYear) || source.sourceTaxYear !== taxYear || Number(source.assetSnapshot.placedInServiceDate.slice(0, 4)) !== taxYear) {
    fail("the actual placed-in-service and source years must equal the calculation year");
  }
  const fields = ["description", "costBasis", "placedInServiceDate", "recoveryPeriod", "method", "convention", "disposedDuringYear", "isListedProperty", "isPassengerAutomobile", "businessUsePercentage", "firstYearBonusEligible", "section280FRecaptureTriggered"] as const;
  if (fields.some(field => !Object.is(asset[field], source.assetSnapshot[field]))) {
    fail("the original asset snapshot no longer matches");
  }
  if (asset.cumulativePriorMacrsDeductions !== undefined && (!money.safeParse(asset.cumulativePriorMacrsDeductions).success || !new Decimal(asset.cumulativePriorMacrsDeductions).isZero())) fail("prior depreciation history is outside this first-year path");
  if (asset.cumulativePriorAdsDeductions !== undefined && (!money.safeParse(asset.cumulativePriorAdsDeductions).success || !new Decimal(asset.cumulativePriorAdsDeductions).isZero())) fail("prior depreciation history is outside this first-year path");
  const businessUse = new Decimal(source.businessUsePercentage);
  if (!businessUse.eq(new Decimal(String(asset.businessUsePercentage)))) fail("actual business-use percentages disagree");
  if (asset.isListedProperty && businessUse.lte(50)) fail("listed property at or below fifty percent requires a separate ADS and history path");
  const grossCostBasis = new Decimal(source.grossCostBasis);
  const section179BusinessDeduction = new Decimal(source.section179BusinessDeduction);
  const bonusBusinessDeduction = new Decimal(source.bonusBusinessDeduction);
  const legacyCostBasis = new Decimal(asset.costBasis);
  const businessBasis = grossCostBasis.times(businessUse).dividedBy(100);
  if (section179BusinessDeduction.gt(businessBasis)) fail("section179 exceeds the actual business basis");
  const midQuarterTestBasis = businessBasis.minus(section179BusinessDeduction);
  if (bonusBusinessDeduction.gt(midQuarterTestBasis)) fail("bonus exceeds the remaining business basis");
  if (!legacyCostBasis.eq(grossCostBasis.minus(section179BusinessDeduction))) fail("legacy cost basis conflicts with its documented gross-less-section179 meaning");
  if (asset.firstYearBonusEligible !== undefined && asset.firstYearBonusEligible !== bonusBusinessDeduction.gt(0)) fail("the recorded bonus flag and actual allocation disagree");
  return {
    legacyCostBasis, grossCostBasis, businessBasis, section179BusinessDeduction,
    bonusBusinessDeduction, midQuarterTestBasis,
    regularMacrsBasis: midQuarterTestBasis.minus(bonusBusinessDeduction),
  };
}
