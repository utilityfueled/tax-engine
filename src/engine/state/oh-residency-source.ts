import { buildOhioResidentCreditSource, type OhioResidentCreditSourceContext } from './oh-resident-credit-source.js';
import { buildOhioSchoolDistrictSource, type OhioSchoolDistrictSourceProjection } from './oh-sd-100-sources.js';
/** Spec: state/oh-input-adapter.yaml#actual-owner-residency-nrc-source. */
import Decimal from 'decimal.js';
import { calculateOhioReciprocalWageSource, type OhioReciprocalWageContext } from './oh-reciprocal-wage-source.js';
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
/** Spec: state/oh-source-material-equality.yaml#normalization; durable digests remain unchanged. */
function sameSourceMaterial(left: unknown, right: unknown): boolean {
    return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}
function fail(message: string): never {
    throw new Error(`Ohio actual residency sources: ${message}`);
}
function withoutFacts(input: TaxYearInput) {
    const { ohioResidency: _, ohioPayments: _payments, ohioSchoolDistrict: _school, ohioReturnHeaderSources: _header, ...source } = input as TaxYearInput & { ohioResidency?: unknown; ohioPayments?:unknown };
    return source;
}
/** Spec: state/oh-it-nrc.yaml, canonical-unemployment-source. */
function ordinaryUnemployment(input: TaxYearInput, federal: TaxReturnResult, facts: OhioResidencyFacts): Decimal {
    const originals = input.form1099G ?? [];
    const payment = facts.unemploymentPaymentSource;
    if (!payment && !originals.some(form => d(form.unemploymentCompensation).gt(0))) return new Decimal(0);
    const [form] = originals;
    const [owner] = facts.owners;
    if (facts.taxYear !== 2025 || input.taxpayer.filingStatus !== 'single' || facts.owners.length !== 1
        || owner?.accountHolder !== 'primary' || originals.length !== 1 || !form
        || facts.businessSources || input.ohioSchoolDistrict) {
        fail('one actual ordinary 2025 unemployment source is required');
    }
    const box1 = d(form.unemploymentCompensation);
    const otherAmounts = [
        form.currentYearRepaid, form.priorYearRepaid, form.unrecoveredAfterTaxContributions,
        form.stateOrLocalTaxRefund, form.stateLocalIncomeTaxRefund, form.rtaaPayments, form.taxableGrants,
        form.agriculturePayments, form.marketGain, form.familyLeaveBenefits, form.stateWithheld,
    ];
    if (form.accountHolder !== owner.accountHolder || form.taxYear !== facts.taxYear || !form.sourceId?.trim()
        || form.programType !== 'government-unemployment' || form.sourceFactsComplete !== true
        || form.sourceFactsConfirmed !== true || form.actualReceiptConfirmed !== true
        || form.tradeOrBusinessRefund !== false || form.stateTaxReporting !== 'none'
        || form.refundPaymentBasis || form.priorYearRepaymentSource || form.contributionProgramId !== undefined
        || !box1.gt(0) || !box1.isInteger() || otherAmounts.some(value => !d(value).isZero())) {
        fail('unemployment requires an ordinary same-owner whole-dollar Box 1 without other source amounts');
    }
    const federalLine7 = federal.allLines.filter(line => line.form === 'Sched 1' && line.line === '7');
    if (federalLine7.length !== 1 || !federalLine7[0]?.value.eq(box1)) {
        fail('unemployment does not reconcile to current federal Schedule 1 line 7');
    }
    if (!payment && owner.status === 'part_year_resident') fail('actual complete dated unemployment payment evidence is required');
    let resident = new Decimal(0);
    if (payment) {
        const date = payment.paidOrAccruedOn;
        const stamp = Date.parse(`${date}T00:00:00Z`);
        const period = owner.periods.find(period => period.from <= date && period.to >= date);
        if (!date.startsWith(`${facts.taxYear}-`) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date
            || !period || payment.originalSourceId !== form.sourceId.trim() || !d(payment.amount).eq(box1)) {
            fail('unemployment payment date, source, or amount does not reconcile');
        }
        if (period.domicileState === 'OH') resident = box1;
    }
    const allocation = owner.amounts?.unemployment;
    if (!allocation || !d(allocation.federalAmount).eq(box1) || !d(allocation.residentAmount).eq(resident)
        || !d(allocation.nonresidentOhioAmount).isZero()) {
        fail('unemployment allocation contradicts the actual original and domicile');
    }
    return box1;
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
    reciprocalWageSource?: OhioReciprocalWageContext;
    residentCreditSource?: OhioResidentCreditSourceContext;
    /** Fresh local result only; no caller-provided or cross-invocation projection. */
    schoolDistrictSource?: OhioSchoolDistrictSourceProjection;
} {
    const parsed = OhioResidencyFactsSchema.safeParse(raw);
    if (!parsed.success)
        fail('complete actual owner facts are required');
    const facts = parsed.data;
    if (facts.taxYear !== input.taxpayer.taxYear || result.taxYear !== input.taxpayer.taxYear || result.filingStatus !== input.taxpayer.filingStatus)
        fail('current year or filing status contradicts originals');
    if (!facts.originalFederalSources || !sameSourceMaterial(facts.originalFederalSources, withoutFacts(input))) {
        fail('current private federal original source snapshot is missing or changed');
    }
    const fresh = calculateFederalTax(input);
    if (!sameSourceMaterial(redactReviewIdentifiers(fresh), redactReviewIdentifiers(result)))
        fail('saved federal result is stale');
    // Spec: state/oh-school-source-same-invocation.yaml. Keep this first validation in order.
    let schoolDistrictSource: OhioSchoolDistrictSourceProjection | undefined;
    if (input.ohioSchoolDistrict) {
        schoolDistrictSource = buildOhioSchoolDistrictSource(input, result, ohio);
    } else if (facts.schoolDistrictStatus !== 'no_ohio_taxing_district_residency')
        fail('actual school district residency sources require their separate method');
    if (!input.ohioSchoolDistrict && ((input.w2s ?? []).some(w => d(w.localTaxWithheld).gt(0)) || (ohio.schoolDistricts?.length ?? 0)))
        fail('actual local/school withholding or residence requires separate district reconciliation');
    const full = facts.owners.every(o => o.status === 'full_year_resident');
    if (facts.unemploymentPaymentSource && (full || facts.reciprocalWageSources || facts.residentCreditSources)) {
        fail('unemployment payment evidence requires the ordinary nonresident or part-year method');
    }
    if (facts.residentCreditSources) {
        if (ohio.otherStateTaxes !== undefined || ohio.residentCredit !== undefined)
            fail('actual resident-credit sources reject caller credit or other-state tax rows');
        const residentCreditSource = buildOhioResidentCreditSource(input, result, facts);
        return { facts, sourceDigest: digest({ input: withoutFacts(input), facts }), residentCreditSource, ...(schoolDistrictSource ? {schoolDistrictSource} : {}) };
    }
    if ((ohio.otherStateTaxes?.length ?? 0) || ohio.residentCredit !== undefined) {
        fail('resident-period same-income credit linkage requires actual separate sources');
    }
    if (facts.reciprocalWageSources) {
        if (facts.businessSources) fail('actual reciprocal wages and business require their separate composition');
        const adjustments = calculateOhioScheduleOfAdjustments(ohio);
        if (!adjustments.line14_totalAdditions.isZero() || !adjustments.line47_totalDeductions.isZero())
            fail('reciprocal wages cannot override or suppress other actual state adjustments');
        const reciprocalWageSource = calculateOhioReciprocalWageSource(input, result, facts);
        return {facts, sourceDigest:digest({input:withoutFacts(input),facts}), reciprocalWageSource, ...(schoolDistrictSource ? {schoolDistrictSource} : {})};
    }
    const businessSource = facts.businessSources ? calculateOhioCanonicalBusinessSource({taxInput:input,federalResult:result,residencyFacts:facts}) : undefined;
    const business = businessSource ? readOhioCanonicalBusinessSource(businessSource,facts,result.agi) : undefined;
    const effectiveOhio = business ? {...ohio,qualifyingBusinessIncome:business.worksheet.businessIncomeBeforeDeductionCap} : ohio;
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
        const unemployment = ordinaryUnemployment(input, fresh, facts);
        if (unemployment.gt(0)) add('primary', 'unemployment', unemployment);
        if(business) add('primary','federalAdjustments',business.deductibleHalf);
        const expected: Record<OhioNrcCategory, Decimal> = { wages: result.totalWages, capitalGains: result.capitalGainLoss, rentsRoyalties: new Decimal(0), gambling: new Decimal(0), interestDividends: result.totalInterest.plus(result.totalDividends), pensions: result.iraDistributionsTaxable.plus(result.pensionDistributionsTaxable), unemployment, otherIncome: result.otherIncome.minus(unemployment).minus(business?.worksheet.columnA ?? new Decimal(0)).plus(result.socialSecurityBenefitsTaxable), federalAdjustments: result.adjustmentsToIncome };
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
    return { facts, sourceDigest: digest({ input: withoutFacts(input), facts }), ...(schoolDistrictSource ? {schoolDistrictSource} : {}), ...(businessSource && business ? {businessSource,canonicalQualifyingBusinessIncome:business.worksheet.businessIncomeBeforeDeductionCap} : {}) };
}
