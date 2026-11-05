/** Finite original-bound ordinary nonterminal GDS disposal. No return/filing qualification. */
import { z } from 'zod';
import Decimal from 'decimal.js';
import { MACRS_GDS_200DB_HALF_YEAR, MACRS_GDS_200DB_MID_QUARTER, MACRS_RESIDENTIAL_RENTAL_MID_MONTH, MACRS_NONRESIDENTIAL_REAL_MID_MONTH, type MACRSConvention, type MACRSMethod } from '@/models/constants.js';
import { roundDollar } from '@/utils/decimal.js';
const money = z.string().refine(v => /^\d+(\.\d+)?$/.test(v) && new Decimal(v).isFinite());
const ref = z.string().min(1).max(500).refine(v => v.trim().length > 0);
function calendarDate(v: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v))
        return false;
    const [y, m, d] = v.split('-').map(Number);
    if (y < 1987 || m < 1 || m > 12 || d < 1)
        return false;
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
const date = z.string().refine(calendarDate, 'Actual full calendar date required');
const snapshot = z.strictObject({
    description: z.string(), costBasis: money, placedInServiceDate: date, recoveryPeriod: z.enum(['3', '5', '7', '10', '27.5', '39']), method: z.enum(['200DB', 'SL']), convention: z.enum(['halfYear', 'midQuarter', 'midMonth']), disposedDuringYear: z.literal(true), isListedProperty: z.literal(false), isPassengerAutomobile: z.literal(false), businessUsePercentage: z.literal(100), firstYearBonusEligible: z.literal(false), section280FRecaptureTriggered: z.literal(false), cumulativePriorMacrsDeductions: money, cumulativePriorAdsDeductions: money
});
const historyRow = z.strictObject({
    taxYear: z.number().int().min(1987).max(9999), sourceReference: ref, originalMacrsBasis: money, businessUsePercentage: money, section179Deduction: money, bonusDeduction: money, otherBasisAdjustments: money, regularAllowedOrAllowable: money, regularClaimed: money
});
export const MACRSDispositionSourcesSchema = z.strictObject({
    version: z.literal('macrs-disposition-v1'), sourceTaxYear: z.number().int().min(1987).max(9999), sourceReference: ref, assetIdentity: ref, activityIdentity: ref, originalBasisSourceReference: ref, originalConventionSourceReference: ref, originalElectionSourceReference: ref, dispositionSourceReference: ref, historySourceReference: ref,
    historyRounding: z.literal('whole_dollar_each_year'),
    constantOwnershipConfirmed: z.literal(true),
    noSystemOrMethodChangeConfirmed: z.literal(true),
    confirmed: z.literal(true), system: z.literal('GDS'), calendarYear: z.literal(true), dispositionKind: z.literal('whole_asset_sale'), ownershipPercentage: money, businessUsePercentage: money, constantUseConfirmed: z.literal(true), noOtherBasisAdjustmentsConfirmed: z.literal(true), noConversionOrCarryoverBasisConfirmed: z.literal(true), noPartialOrGeneralAssetAccountConfirmed: z.literal(true),
    section179Deduction: money, bonusDeduction: money, otherBasisAdjustments: money, bonusTreatment: z.enum(['elected_out', 'not_applicable']), grossCostBasis: money, originalMacrsBasis: money, adjustedBasisAtYearStart: money, dispositionDate: date, assetSnapshot: snapshot, history: z.array(historyRow).min(1).max(40)
});
export type MACRSDispositionSources = z.infer<typeof MACRSDispositionSourcesSchema>;
interface DispositionAsset {
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
    dispositionSources?: unknown;
}
export interface MACRSDispositionAmounts {
    sourceTaxYear: number;
    dispositionDate: string;
    originalMacrsBasis: Decimal;
    remainingBasis: Decimal;
    priorAllowedOrAllowable: Decimal;
    annualPercentage: Decimal;
    fraction: Decimal;
    fractionNumerator: Decimal;
    fractionDenominator: Decimal;
    recoveryYear: number;
    placedInServiceYear: number;
    placedInServiceMonth: number;
    recoveryPeriod: number;
    method: MACRSMethod;
    convention: MACRSConvention;
}
function fail(label: string): never { throw new Error(`MACRS disposition sources: ${label}`); }
/** Absence remains unqualified for held assets; any asserted disposal needs complete actual facts. */
export function resolveMACRSDispositionSources(asset: DispositionAsset, taxYear: number): MACRSDispositionAmounts | undefined {
    if (asset.dispositionSources === undefined) {
        // Legacy same-year exclusion proves no depreciation only; it admits no source packet.
        if (asset.disposedDuringYear === true && (!Number.isInteger(taxYear) || Number(asset.placedInServiceDate.slice(0, 4)) !== taxYear))
            fail('actual disposition date, original convention, basis and complete prior history required');
        return undefined;
    }
    if (asset.basisSources !== undefined)
        fail('first-year basis and prior-year disposition packets cannot be mixed');
    const parsed = MACRSDispositionSourcesSchema.safeParse(asset.dispositionSources);
    if (!parsed.success)
        fail('complete supported ordinary original facts required');
    const s = parsed.data;
    if (!Number.isInteger(taxYear) || s.sourceTaxYear !== taxYear || Number(s.dispositionDate.slice(0, 4)) !== taxYear)
        fail('actual disposition and source years must match the owner calculation year');
    for (const key of Object.keys(s.assetSnapshot) as (keyof typeof s.assetSnapshot)[])
        if (!Object.is(asset[key], s.assetSnapshot[key]))
            fail('original asset snapshot changed; reconfirm originals');
    if (s.dispositionDate <= s.assetSnapshot.placedInServiceDate)
        fail('actual disposition must follow original service date');
    const pisYear = Number(s.assetSnapshot.placedInServiceDate.slice(0, 4)), pisMonth = Number(s.assetSnapshot.placedInServiceDate.slice(5, 7)), recoveryYear = taxYear - pisYear + 1, period = Number(s.assetSnapshot.recoveryPeriod), method = s.assetSnapshot.method, convention = s.assetSnapshot.convention;
    const real = period === 27.5 || period === 39;
    // Pub946 GDS footnote4: this packet has no pre1994 contract/construction facts.
    if (period === 39 && pisYear < 1994)
        fail('pre1994 nonresidential recovery period requires separate transition facts');
    if ((real && (method !== 'SL' || convention !== 'midMonth' || s.bonusTreatment !== 'not_applicable')) || (!real && (method !== '200DB' || !['halfYear', 'midQuarter'].includes(convention) || s.bonusTreatment !== 'elected_out')))
        fail('unsupported original system, convention or bonus election');
    const table = real ? (period === 27.5 ? MACRS_RESIDENTIAL_RENTAL_MID_MONTH[pisMonth] : MACRS_NONRESIDENTIAL_REAL_MID_MONTH[pisMonth]) : convention === 'halfYear' ? MACRS_GDS_200DB_HALF_YEAR[period] : MACRS_GDS_200DB_MID_QUARTER[Math.ceil(pisMonth / 3)]?.[period];
    if (!table || recoveryYear < 2 || recoveryYear >= table.length)
        fail('first or terminal recovery year requires its separate duration/history path');
    const basis = new Decimal(s.originalMacrsBasis);
    if (!basis.gt(0) || !basis.eq(s.grossCostBasis) || !basis.eq(asset.costBasis))
        fail('original plain purchase MACRS basis conflicts with the asset');
    if (!new Decimal(s.ownershipPercentage).eq(100) || !new Decimal(s.businessUsePercentage).eq(100))
        fail('partial ownership or use requires a separate allocation path');
    for (const value of [s.section179Deduction, s.bonusDeduction, s.otherBasisAdjustments, s.assetSnapshot.cumulativePriorAdsDeductions])
        if (!new Decimal(value).isZero())
            fail('nonzero elections, adjustments or ADS history unsupported');
    if (s.history.length !== recoveryYear - 1)
        fail('complete contiguous prior-year history required');
    let prior = new Decimal(0);
    const references = new Set<string>();
    for (const [rowIndex, row] of s.history.entries()) {
        if (row.taxYear !== pisYear + rowIndex || references.has(row.sourceReference))
            fail('prior-year records must be ordered, unique and contiguous');
        references.add(row.sourceReference);
        if (!new Decimal(row.originalMacrsBasis).eq(basis) || !new Decimal(row.businessUsePercentage).eq(100) || ![row.section179Deduction, row.bonusDeduction, row.otherBasisAdjustments].every(v => new Decimal(v).isZero()))
            fail('historical basis, use or deductions changed');
        const allowed = new Decimal(row.regularAllowedOrAllowable);
        if (!allowed.eq(row.regularClaimed) || !allowed.eq(roundDollar(basis.times(table[rowIndex]).div(100))))
            fail('actual prior allowed and claimed history must reconcile to the original table');
        prior = prior.plus(allowed);
    }
    const remaining = basis.minus(prior);
    if (!remaining.gt(0) || !remaining.eq(s.adjustedBasisAtYearStart) || !prior.eq(s.assetSnapshot.cumulativePriorMacrsDeductions))
        fail('actual opening adjusted basis and prior depreciation do not reconcile');
    const month = Number(s.dispositionDate.slice(5, 7));
    const fractionNumerator = convention === 'halfYear' ? new Decimal(1) : convention === 'midQuarter' ? new Decimal(Math.ceil(month / 3)).times(2).minus(1) : new Decimal(month).minus('0.5');
    const fractionDenominator = new Decimal(convention === 'halfYear' ? 2 : convention === 'midQuarter' ? 8 : 12);
    const fraction = fractionNumerator.div(fractionDenominator);
    return {
        sourceTaxYear: taxYear, dispositionDate: s.dispositionDate, originalMacrsBasis: basis, remainingBasis: remaining, priorAllowedOrAllowable: prior, annualPercentage: table[recoveryYear - 1], fraction, fractionNumerator, fractionDenominator, recoveryYear, placedInServiceYear: pisYear, placedInServiceMonth: pisMonth, recoveryPeriod: period, method, convention
    };
}
