/** Form 8829 owned-home source binding. Spec: spec/federal/form-8829-2026-template.yaml. */
import Decimal from "decimal.js";
import { z } from "zod";
import { Form8829Schema, type Form8829Input } from "@/models/inputs.js";

const reference = z.string().trim().min(1);
const actualDate = z.iso.date().refine(date => !date.startsWith("0000-"));
const wholeDollar = z.string().regex(/^\d{1,12}(?:\.0{1,2})?$/u);
const propertyOriginal = z.strictObject({ propertyReference: reference, reference });
const datedPropertyOriginal = propertyOriginal.extend({ date: actualDate });
const firstUseValuation = datedPropertyOriginal.extend({ total: wholeDollar, land: wholeDollar });
const currentPropertyAmount = propertyOriginal.extend({ taxYear: z.literal(2026), amount: wholeDollar });
const qualifiedExpense = currentPropertyAmount.extend({
  qualifiedPaidOrKnownZeroNotDeductedElsewhereConfirmed: z.literal(true),
});

const ownedHomePropertySources = z.strictObject({
  taxYear: z.literal(2026),
  propertyReference: reference,
  purchase: datedPropertyOriginal,
  firstBusinessUse: datedPropertyOriginal,
  ownedAndQualifyingExclusiveUseAllYearUnchangedConfirmed: z.literal(true),
  continuouslyUsedForThisBusinessConfirmed: z.literal(true),
  standard39YearGdsRecoveryConfirmed: z.literal(true),
  noOtherDepreciationMethodsAllowancesOrImprovementsConfirmed: z.literal(true),
  noOtherExpensesAdjustmentsOrCarryoversConfirmed: z.literal(true),
  standardDeduction: z.strictObject({ taxYear: z.literal(2026), reference, claimedConfirmed: z.literal(true) }),
  floorArea: propertyOriginal.extend({
    businessSquareFeet: z.number().int().positive(),
    totalSquareFeet: z.number().int().positive(),
  }),
  adjustedBasis: firstUseValuation,
  fairMarketValue: firstUseValuation,
  mortgageInterest: qualifiedExpense,
  realEstateTaxes: qualifiedExpense,
});

const ownedHomeReviewSources = ownedHomePropertySources.extend({
  scheduleCLine29: currentPropertyAmount.extend({
    singleScheduleCBusinessUsingHomeConfirmed: z.literal(true),
    allGrossIncomeFromBusinessUseOfHomeConfirmed: z.literal(true),
    incomeSourceNote: reference,
  }),
});

// IRS Form 8829 line 41 uses the published 39-year GDS full-year table rate.
const fullYearDepreciationRate = new Decimal("2.564").div(100);

function valuation({ total, land }: { total: string; land: string }) {
  const totalValue = new Decimal(total);
  const landValue = new Decimal(land);
  return { total: totalValue, land: landValue, building: totalValue.minus(landValue) };
}

export function buildForm8829OwnedHomeReviewInput(raw: unknown): Form8829Input {
  const { scheduleCLine29, ...originals } = ownedHomeReviewSources.parse(raw);
  if (scheduleCLine29.propertyReference !== originals.propertyReference) {
    throw new Error("Form 8829 owned-home originals must identify the same property.");
  }
  return { ...buildForm8829OwnedHomePropertyInput(originals), grossIncomeLimit: scheduleCLine29.amount };
}

export function buildForm8829OwnedHomePropertyInput(raw: unknown): Form8829Input {
  const { propertyReference, purchase, firstBusinessUse, floorArea,
    adjustedBasis, fairMarketValue, mortgageInterest, realEstateTaxes } = ownedHomePropertySources.parse(raw);
  if ([purchase, firstBusinessUse, floorArea, adjustedBasis, fairMarketValue, mortgageInterest, realEstateTaxes]
    .some(original => original.propertyReference !== propertyReference)) {
    throw new Error("Form 8829 owned-home originals must identify the same property.");
  }
  const { date: firstUseDate } = firstBusinessUse;
  if (purchase.date > firstUseDate || firstUseDate < "1994-01-01" || firstUseDate >= "2026-01-01"
    || adjustedBasis.date !== firstUseDate || fairMarketValue.date !== firstUseDate) {
    throw new Error("Form 8829 requires dated purchase and prior-year first business use with basis and valuation on that first-use date.");
  }
  const { businessSquareFeet, totalSquareFeet } = floorArea;
  if (businessSquareFeet > totalSquareFeet) {
    throw new Error("Form 8829 business square feet cannot exceed the measured home area.");
  }

  const basis = valuation(adjustedBasis);
  const market = valuation(fairMarketValue);
  const lower = basis.total.lte(market.total) ? basis : market;
  if ((basis.total.eq(market.total) && !basis.land.eq(market.land))
    || !lower.land.eq(Decimal.min(basis.land, market.land))
    || !lower.building.eq(Decimal.min(basis.building, market.building))
    || !lower.building.gt(0)) {
    throw new Error("Form 8829 owned-home basis and land originals must identify consistent positive depreciable building value.");
  }

  return Form8829Schema.parse({
    areaUsedForBusiness: businessSquareFeet,
    totalAreaOfHome: totalSquareFeet,
    indirectExpenses: { excessMortgageInterest: mortgageInterest.amount, excessRealEstateTaxes: realEstateTaxes.amount },
    adjustedBasisOrFairMarketValue: lower.total.toFixed(),
    landValue: lower.land.toFixed(),
    depreciationPercentage: fullYearDepreciationRate.toFixed(),
  });
}
