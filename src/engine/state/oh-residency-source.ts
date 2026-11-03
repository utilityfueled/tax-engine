/** Spec: state/oh-input-adapter.yaml#actual-owner-residency-nrc-source. */
import Decimal from 'decimal.js';
import { calculateOhioCanonicalBusinessSource, readOhioCanonicalBusinessSource, type OhioCanonicalBusinessContext } from './oh-business-source.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { calculateFederalTax } from '@/engine/federal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioResidencyFacts, type OhioNrcCategory } from '@/models/ohio-residency.js';
import type { OhioResidentReturnInput } from './oh-return.js';
import { calculateOhioITNRC } from './oh-it-nrc.js';
import { calculateOhioScheduleOfAdjustments } from './oh-schedule-adjustments.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { d, roundDollar } from '@/utils/decimal.js';
function stable(value: unknown): unknown {
    if (Decimal.isDecimal(value)) return value.toString();
    if (Array.isArray(value)) return value.map(stable);
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .filter(([, child]) => child !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, stable(child)]));
    }
    return value;
}
function digest(value: unknown): string {
    return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(value)))));
}
function fail(message: string): never {
    throw new Error(`Ohio actual residency sources: ${message}`);
}
function withoutFacts(input: TaxYearInput) {
    const { ohioResidency: _, ohioPayments: _payments, ...source } = input as TaxYearInput & { ohioResidency?: unknown; ohioPayments?:unknown };
    return source;
}
const brand = Symbol('prepared Ohio original review');
export interface PreparedOhioResidencyReview {
    readonly [brand]: true;
}
const contexts = new WeakMap<PreparedOhioResidencyReview, {
    original: TaxYearInput;
    originalDigest: string;
    redactedDigest: string;
    resultDigest: string;
}>();
/** Prepare only from current complete originals; token is local and unforgeable. */
export function prepareOhioResidencyReview(input: TaxYearInput): PreparedOhioResidencyReview {
    const original = structuredClone(input);
    const fresh = calculateFederalTax(original);
    const token = Object.freeze({ [brand]: true as const });
    contexts.set(token, {
        original,
        originalDigest: digest(original),
        redactedDigest: digest(redactReviewIdentifiers(original)),
        resultDigest: digest(redactReviewIdentifiers(fresh)),
    });
    return token;
}
/** Recover the private original solely for fresh source validation, not display. */
export function resolveOhioResidencyReview(input: TaxYearInput, result: TaxReturnResult, token?: PreparedOhioResidencyReview): TaxYearInput {
    const context = contexts.get(token ?? prepareOhioResidencyReview(input));
    if (!context) fail('a valid original review context is required');
    const actual = digest(input);
    if (actual !== context.originalDigest && actual !== context.redactedDigest) {
        fail('current originals differ from prepared review');
    }
    if (digest(redactReviewIdentifiers(result)) !== context.resultDigest) {
        fail('saved federal calculation differs from current original computation');
    }
    return structuredClone(context.original);
}
/** Validate canonical originals; isolated old resident math is not source evidence. */
export function buildOhioResidencySource(input: TaxYearInput, result: TaxReturnResult, ohio: OhioResidentReturnInput, raw: unknown): {
    facts: OhioResidencyFacts;
    sourceDigest: string;
    businessSource?: OhioCanonicalBusinessContext;
    canonicalQualifyingBusinessIncome?: Decimal;
} {
    const parsed = OhioResidencyFactsSchema.safeParse(raw);
    if (!parsed.success)
        fail('complete actual owner facts are required');
    const facts = parsed.data;
    if (facts.taxYear !== input.taxpayer.taxYear || result.taxYear !== input.taxpayer.taxYear || result.filingStatus !== input.taxpayer.filingStatus)
        fail('current year or filing status contradicts originals');
    if (!facts.originalFederalSources || digest(facts.originalFederalSources) !== digest(withoutFacts(input))) {
        fail('current private federal original source snapshot is missing or changed');
    }
    const fresh = calculateFederalTax(input);
    if (digest(redactReviewIdentifiers(fresh)) !== digest(redactReviewIdentifiers(result)))
        fail('saved federal result is stale');
    if (facts.schoolDistrictStatus !== 'no_ohio_taxing_district_residency')
        fail('actual school district residency sources require their separate method');
    if ((input.w2s ?? []).some(w => d(w.localTaxWithheld).gt(0)) || (ohio.schoolDistricts?.length ?? 0))
        fail('actual local/school withholding or residence requires separate district reconciliation');
    if ((ohio.otherStateTaxes?.length ?? 0) || ohio.residentCredit !== undefined) {
        fail('resident-period same-income credit linkage requires actual separate sources');
    }
    const businessSource = facts.businessSources ? calculateOhioCanonicalBusinessSource({taxInput:input,federalResult:result,residencyFacts:facts}) : undefined;
    const business = businessSource ? readOhioCanonicalBusinessSource(businessSource,facts,result.agi) : undefined;
    const effectiveOhio = business ? {...ohio,qualifyingBusinessIncome:business.worksheet.businessIncomeBeforeDeductionCap} : ohio;
    const full = facts.owners.every(o => o.status === 'full_year_resident');
    if (!full) {

        if ((!business && input.scheduleC) || input.scheduleF || (input.scheduleK1?.length ?? 0) || (input.form1099Nec?.length ?? 0) || (input.rentalProperties?.length ?? 0) || (input.scheduleK1Form1041?.length ?? 0))
            fail('actual business/rental originals require Section II/III or separate nonbusiness classification');
        if (!business && !d(ohio.qualifyingBusinessIncome).isZero())
            fail('business income cannot be inferred zero');

        for (const owner of facts.owners) {
            if (d(owner.amounts?.wages.nonresidentOhioAmount).gt(0) && owner.periods.some(period => ['IN','KY','MI','PA','WV'].includes(period.domicileState))) {
                fail('actual reciprocal-period Ohio compensation requires its separate exemption allocation sources');
            }
        }
        const categoryTotals = Object.fromEntries(ohioNrcCategories.map(k => [k, new Decimal(0)])) as Record<OhioNrcCategory, Decimal>;
        const ownerTotals = new Map(facts.owners.map(o => [o.accountHolder, Object.fromEntries(ohioNrcCategories.map(k => [k, new Decimal(0)])) as Record<OhioNrcCategory, Decimal>]));
        const add = (owner: 'primary' | 'spouse' | undefined, category: OhioNrcCategory, value: Decimal) => { if (!owner || !ownerTotals.has(owner))
            fail('every actual income original needs its current return owner'); const current = ownerTotals.get(owner); if (!current) fail('actual source owner is missing'); current[category] = current[category].plus(value); categoryTotals[category] = categoryTotals[category].plus(value); };
        for (const w of input.w2s ?? [])
            add(w.accountHolder, 'wages', d(w.wages));
        for (const b of input.form1099Int ?? [])
            add(b.accountHolder, 'interestDividends', d(b.interestIncome).plus(d(b.usSavingsBondInterest)));
        for (const b of input.form1099Div ?? [])
            add(b.accountHolder, 'interestDividends', d(b.ordinaryDividends));
        if(business) add('primary','federalAdjustments',business.deductibleHalf);
        const expected: Record<OhioNrcCategory, Decimal> = { wages: result.totalWages, capitalGains: result.capitalGainLoss, rentsRoyalties: new Decimal(0), gambling: new Decimal(0), interestDividends: result.totalInterest.plus(result.totalDividends), pensions: result.iraDistributionsTaxable.plus(result.pensionDistributionsTaxable), unemployment: new Decimal(0), otherIncome: result.otherIncome.minus(business?.worksheet.columnA ?? new Decimal(0)).plus(result.socialSecurityBenefitsTaxable), federalAdjustments: result.adjustmentsToIncome };
        for (const category of ohioNrcCategories) {
            if (!roundDollar(categoryTotals[category]).eq(expected[category]))
                fail(`actual ${category} needs a separately qualified original classification`);
            for (const owner of facts.owners) {
                const current=ownerTotals.get(owner.accountHolder);
                if (!current || !owner.amounts || !d(owner.amounts[category].federalAmount).eq(current[category]))
                    fail(`actual owner ${category} source amounts do not reconcile`);
            }
        }
        if (facts.owners.some(o => (o.stateAdditions?.length ?? 0) || (o.stateDeductions?.length ?? 0)))
            fail('claimed adjustment source rows require complete actual current line reconciliation');
        const actualAdjustments = calculateOhioScheduleOfAdjustments(effectiveOhio);
        if (!actualAdjustments.line14_totalAdditions.isZero() || !actualAdjustments.line47_totalDeductions.minus(business?.worksheet.businessIncomeDeduction ?? new Decimal(0)).isZero())
            fail('actual Ohio additions/deductions require complete allocation and exclusion sources');
        // Initial canonical cohort has no state adjustments. The isolated worksheet
        // accepts actual listed rows; no exclusions or depreciation are guessed here.
        if (!d(ohio.nonOhioStateLocalInterest).isZero() || !d(ohio.federalInterestExemptFromOhio).isZero() || !d(ohio.taxableSocialSecurity).isZero())
            fail('actual Ohio adjustment/exclusion allocations need their separate source method');
        const probe = calculateOhioITNRC({ taxYear: ohio.taxYear, filingStatus: ohio.filingStatus, federalAgi: ohio.federalAgi, ohioAgi: business?.ohioAgi ?? ohio.federalAgi, taxRemainingBeforeResidencyCredits: '0', residencyFacts: facts, businessSource, expectedFederalCategories: expected });
        if (!probe.line7.isZero() || !probe.line8.isZero())
            fail('actual Ohio adjustment allocation needs complete current adjustment source reconciliation');
    }
    // Also validate every full-resident timeline, without fabricating NRC amounts.
    calculateOhioITNRC({ taxYear: ohio.taxYear, filingStatus: ohio.filingStatus, federalAgi: ohio.federalAgi, ohioAgi: business?.ohioAgi ?? ohio.federalAgi, taxRemainingBeforeResidencyCredits: '0', residencyFacts: facts, businessSource });
    return { facts, sourceDigest: digest({ input: withoutFacts(input), facts }), ...(businessSource && business ? {businessSource,canonicalQualifyingBusinessIncome:business.worksheet.businessIncomeBeforeDeductionCap} : {}) };
}
