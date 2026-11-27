import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {OhioResidentCreditDraft} from './guided-ohio-resident-credit-sources';
import type { TaxYearInput } from '@/models/inputs';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioNrcCategory, type OhioResidencyFacts } from '@/models/ohio-residency';
import { Ohio2026UnemploymentOriginalSchema } from '@/models/ohio-2026-return-draft';
import { currentLocalCivilDate } from '@/utils/civil-date';
import { calculateOhioITNRC } from '@/engine/state/oh-it-nrc';
import { allocateOhioUnemploymentReceipts, assertOhio2026PrimaryResidencyDeclaration, ohio2026PrimaryResidencyConflict, type OhioUnemploymentReceipt } from '@/engine/state/oh-residency-source';
import {calculateFederalTax} from '@/engine/federal';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter';
import {calculateOhioCanonicalBusinessSource,readOhioCanonicalBusinessSource} from '@/engine/state/oh-business-source';
import {buildGuidedOhioBusinessFacts,type OhioBusinessDraft} from './guided-ohio-business-facts';
export interface OhioUnemploymentPaymentDraft extends OhioUnemploymentReceipt {
    originalStatementFingerprint: string;
    allPaymentsIncludedConfirmed: boolean | null;
}
export interface OhioUnemploymentPaymentScheduleDraft {
    originalStatementFingerprint: string;
    payments: OhioUnemploymentReceipt[];
    allPaymentsIncludedConfirmed: boolean | null;
}
export interface OhioResidencyDraft {
    residentCreditSources?: OhioResidentCreditDraft;
    businessSources?: OhioBusinessDraft;
    unemploymentPaymentSource?: OhioUnemploymentPaymentDraft;
    unemploymentPaymentSchedule?: OhioUnemploymentPaymentScheduleDraft;
    /** Bound only by explicit confirmation; old boolean-only saves require reconfirmation. */
    originalFederalSources?: Record<string, unknown>;
    taxYear: string;
    sourceReference: string;
    sourceFactsConfirmed: boolean | null;
    allFederalSourcesIncludedConfirmed: boolean | null;
    noBusinessIncomeConfirmed: boolean | null;
    schoolDistrictStatus: '' | 'no_ohio_taxing_district_residency' | 'actual_district_sources_required';
    owners: Array<{
        accountHolder: 'primary' | 'spouse';
        status: '' | 'full_year_resident' | 'part_year_resident' | 'nonresident';
        sourceReference: string;
        periods: Array<{
            from: string;
            to: string;
            domicileState: string;
        }>;
        amounts?: Record<OhioNrcCategory, {
            federalAmount: string;
            residentAmount: string;
            nonresidentOhioAmount: string;
            sourceReference: string;
        }>;
        stateAdditions: Array<{
            line: string;
            fullAmount: string;
            ohioAmount: string;
            sourceReference: string;
        }>;
        stateDeductions: Array<{
            line: string;
            fullAmount: string;
            ohioAmount: string;
            sourceReference: string;
        }>;
    }>;
}
export const emptyOhioResidencyDraft: OhioResidencyDraft = { taxYear: '', sourceReference: '', sourceFactsConfirmed: null, allFederalSourcesIncludedConfirmed: null, noBusinessIncomeConfirmed: null, schoolDistrictStatus: '', owners: [] };
export function emptyOhioResidencyOwner(accountHolder: 'primary' | 'spouse'): OhioResidencyDraft['owners'][number] { return { accountHolder, status: '', sourceReference: '', periods: [{ from: '', to: '', domicileState: '' }], amounts: Object.fromEntries(ohioNrcCategories.map(k => [k, { federalAmount: '', residentAmount: '', nonresidentOhioAmount: '', sourceReference: '' }])) as NonNullable<OhioResidencyDraft['owners'][number]['amounts']>, stateAdditions: [], stateDeductions: [] }; }
function normalizedAmount(value: string): string {
    const text = value.trim();
    return /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text) ? text.replace(/,/g, '') : value;
}
/** Discover an eligible current original without assigning any residence or payment facts. */
export function guidedOhioUnemploymentStatement(input: TaxYearInput | null | undefined) {
    const year = input?.taxpayer.taxYear;
    const originals = input?.form1099G;
    const original = originals?.[0];
    if ((year !== 2025 && year !== 2026) || !input || input.taxpayer.filingStatus !== 'single' || originals?.length !== 1
        || !original?.sourceId?.trim() || !original.accountReference?.trim()
        || original.accountHolder !== 'primary' || original.taxYear !== year
        || original.programType !== 'government-unemployment' || original.sourceFactsComplete !== true
        || original.sourceFactsConfirmed !== true || original.actualReceiptConfirmed !== true
        || original.additionalWorksheetRequired !== false || original.tradeOrBusinessRefund !== false
        || original.refundPaymentBasis || original.priorYearRepaymentSource
        || original.contributionProgramId !== undefined) return undefined;
    const box1 = new Decimal(original.unemploymentCompensation);
    const stateWithheld = new Decimal(original.stateWithheld ?? '0');
    if (year === 2025) {
        if (original.stateTaxReporting !== 'none' || !stateWithheld.isZero()) return undefined;
    } else {
        // The guided adapter can retain absent optional keys as undefined.
        const presentFacts = Object.fromEntries(Object.entries(original).filter(([, value]) => value !== undefined));
        if (!Ohio2026UnemploymentOriginalSchema.safeParse(presentFacts).success) return undefined;
        const federalWithheld = new Decimal(original.federalWithheld);
        if (federalWithheld.plus(stateWithheld).gt(box1)) return undefined;
        if (original.stateTaxReporting === 'single') {
            if (original.state !== 'OH' || !original.statePayerId?.trim() || !stateWithheld.gt(0)) return undefined;
        } else if (original.state !== undefined || original.statePayerId !== undefined || !stateWithheld.isZero()) return undefined;
    }
    const otherAmounts = [
        original.currentYearRepaid, original.priorYearRepaid, original.unrecoveredAfterTaxContributions,
        original.stateOrLocalTaxRefund, original.stateLocalIncomeTaxRefund, original.rtaaPayments, original.taxableGrants,
        original.agriculturePayments, original.marketGain, original.familyLeaveBenefits,
    ];
    if (!box1.gt(0) || !box1.isInteger() || otherAmounts.some(value => !new Decimal(value ?? '0').isZero())) return undefined;
    const { ssn, dateOfBirth } = input.taxpayer.primary;
    const ownedOriginal = stableOhioOriginal({ original, owner: { taxId: ssn.replace(/-/g, ''), dateOfBirth } });
    return {
        sourceId: original.sourceId.trim(),
        reference: original.accountReference.trim(),
        amount: box1.toFixed(),
        // The generated source ID and primary role alone cannot identify an owned original.
        fingerprint: bytesToHex(sha256(new TextEncoder().encode(ownedOriginal))),
    };
}
function hasPositiveUnemploymentBox1(input: TaxYearInput | null | undefined): boolean {
    return input?.form1099G?.some(statement => new Decimal(statement.unemploymentCompensation).gt(0)) === true;
}

export function hasGuidedOhio2026UnemploymentReceiptScope(data: OhioResidencyDraft | undefined, input: TaxYearInput | null | undefined): boolean {
    if (!data || input?.taxpayer.taxYear !== 2026 || input.taxpayer.filingStatus !== 'single' || input.ohioSchoolDistrict) return false;
    const [owner] = data.owners;
    return data.taxYear === '2026' && data.owners.length === 1 && owner?.accountHolder === 'primary'
        && owner.status === 'part_year_resident' && data.schoolDistrictStatus === 'no_ohio_taxing_district_residency'
        && !data.businessSources && !data.residentCreditSources
        && (Boolean(data.unemploymentPaymentSource || data.unemploymentPaymentSchedule) || hasPositiveUnemploymentBox1(input));
}

function projectUnemployment(data: OhioResidencyDraft, input?: TaxYearInput) {
    const year = input?.taxpayer.taxYear;
    const current2026 = year === 2026;
    const proof = data.unemploymentPaymentSource;
    const schedule = data.unemploymentPaymentSchedule;
    if (!current2026 && proof && schedule) throw new Error('Choose one way to enter actual unemployment payments.');
    const evidence = proof ?? schedule;
    const owner = data.owners[0];
    const allFull = data.owners.every(row => row.status === 'full_year_resident');
    if (!current2026 && !evidence && (allFull || year !== 2025 || !hasPositiveUnemploymentBox1(input))) return undefined;
    const original = guidedOhioUnemploymentStatement(input);
    if (current2026) {
        const reviewScope = hasGuidedOhio2026UnemploymentReceiptScope(data, input);
        if (!evidence && !reviewScope) return undefined;
        if (!reviewScope || !original) throw new Error('Ohio review requires a supported current 2026 Form 1099-G and one complete receipt for the single part-year taxpayer.');
        if (schedule) throw new Error('Remove the saved unemployment payment schedule before entering one Ohio review receipt.');
    }
    if (!original || data.owners.length !== 1 || owner?.accountHolder !== 'primary'
        || (owner.status !== 'part_year_resident' && owner.status !== 'nonresident')
        || data.businessSources || data.residentCreditSources || data.schoolDistrictStatus !== 'no_ohio_taxing_district_residency'
        || input?.ohioSchoolDistrict) {
        throw new Error('Ohio unemployment requires one verified ordinary 2025 Form 1099-G and the nonresident or part-year method.');
    }
    const amounts = { federalAmount: original.amount, residentAmount: '0', nonresidentOhioAmount: '0', sourceReference: original.reference };
    if (owner.status === 'nonresident') {
        if (evidence) throw new Error('Remove the part-year unemployment payment evidence for this full-year nonresident.');
        return { amounts, payment: undefined, paymentSchedule: undefined };
    }
    if (evidence && evidence.originalStatementFingerprint !== original.fingerprint) {
        throw new Error('The Form 1099-G was replaced or changed, or the unemployment owner changed. Enter the payment evidence again.');
    }
    if (evidence?.allPaymentsIncludedConfirmed !== true || (schedule && schedule.payments.length < 2)
        || (proof && (!proof.sourceReference?.trim() || !proof.paidOrAccruedOn || !proof.amount?.trim()))) {
        throw new Error('Enter and confirm the actual complete dated unemployment payment evidence.');
    }
    const rows = (schedule?.payments ?? (proof ? [proof] : [])).map(row => ({
        sourceReference: row.sourceReference,
        paidOrAccruedOn: row.paidOrAccruedOn,
        amount: normalizedAmount(row.amount),
    }));
    if (current2026 && rows.some(row => row.paidOrAccruedOn > currentLocalCivilDate())) {
        throw new Error('Ohio unemployment receipt dates for review must already have occurred.');
    }
    const resident = allocateOhioUnemploymentReceipts(rows, owner.periods, current2026 ? 2026 : 2025, new Decimal(original.amount));
    const linkage = { originalSourceId: original.sourceId, allPaymentsIncludedConfirmed: true as const };
    return {
        amounts: { ...amounts, residentAmount: resident.toFixed() },
        payment: proof ? { ...linkage, ...rows[0] } : undefined,
        paymentSchedule: schedule ? { ...linkage, payments: rows } : undefined,
    };
}
export function hasCurrentGuidedOhioUnemploymentEvidence(data: OhioResidencyDraft, input: TaxYearInput | null | undefined): boolean {
    try { projectUnemployment(data, input ?? undefined); return true; }
    catch { return false; }
}
function raw(data: OhioResidencyDraft, input: TaxYearInput | undefined, unemployment: ReturnType<typeof projectUnemployment>) {
    if(data.businessSources&&!input)throw Error('Actual current federal originals are required to replay Ohio business sources.');
    const allFull = data.owners.length > 0 && data.owners.every(owner => owner.status === 'full_year_resident');
    // The entered child has its own strict conversion and complete-source replay after parent/payment confirmation.
    const {residentCreditSources:_residentCredit, unemploymentPaymentSource:_unemploymentPayment,
        unemploymentPaymentSchedule:_unemploymentSchedule, ...parent}=data;
    return {
        ...parent, taxYear: Number(data.taxYear),
        ...(unemployment?.payment ? { unemploymentPaymentSource: unemployment.payment } : {}),
        ...(unemployment?.paymentSchedule ? { unemploymentPaymentSchedule: unemployment.paymentSchedule } : {}),
        ...(data.businessSources&&input?{businessSources:buildGuidedOhioBusinessFacts(data.businessSources,input)}:{}),
        allFederalSourcesIncludedConfirmed: data.allFederalSourcesIncludedConfirmed ?? undefined,
        noBusinessIncomeConfirmed: data.noBusinessIncomeConfirmed ?? undefined,
        owners: data.owners.map(owner => ({
            ...owner,
            amounts: allFull || !owner.amounts ? undefined : Object.fromEntries(ohioNrcCategories.map(category => {
                if (category === 'unemployment' && unemployment && owner.accountHolder === 'primary') return [category, unemployment.amounts];
                const row = owner.amounts?.[category];
                return [category, row ? {...row, federalAmount:normalizedAmount(row.federalAmount), residentAmount:normalizedAmount(row.residentAmount), nonresidentOhioAmount:normalizedAmount(row.nonresidentOhioAmount)} : undefined];
            })),
            stateAdditions: allFull ? [] : owner.stateAdditions,
            stateDeductions: allFull ? [] : owner.stateDeductions,
        })),
    };
}
export function ohioResidencyFactErrors(data: OhioResidencyDraft | undefined, taxYear: number | null | undefined, filingStatus: string | null | undefined, input?:TaxYearInput): Record<string, string> {
    if (!data)
        return { ohioResidency: 'Enter the actual Ohio owner domicile source facts, including full-year residency.' };
    if (taxYear == null || !/^\d{4}$/.test(data.taxYear) || String(taxYear) !== data.taxYear)
        return { 'ohio-residency-year': 'Enter the actual source year matching this return.' };
    let unemployment: ReturnType<typeof projectUnemployment>;
    try { unemployment = projectUnemployment(data, input); }
    catch (error) { return { 'ohio-unemployment-payment-source': error instanceof Error ? error.message : 'Reconcile actual Ohio unemployment.' }; }
    let parsed:ReturnType<typeof OhioResidencyFactsSchema.safeParse>;
    try{parsed = OhioResidencyFactsSchema.safeParse(raw(data,input,unemployment));}
    catch(error){return {'ohio-business-originals':error instanceof Error?error.message:'Complete the actual current Ohio business originals.'};}
    if (!parsed.success)
        return Object.fromEntries(parsed.error.issues.map(issue => [`ohio-residency-${issue.path.join('-')}`, `Complete the actual ${issue.path.join(' ')} source facts; use zero only when known.`]));
    try {
        const allFull = parsed.data.owners.every(o => o.status === 'full_year_resident');
        let agi = new Decimal(0);
        if (!allFull)
            for (const owner of parsed.data.owners)
                for (const category of ohioNrcCategories) {
                    if (!owner.amounts) throw new Error('Every actual NRC source category is required.');
                    const value = new Decimal(owner.amounts[category].federalAmount);
                    agi = category === 'federalAdjustments' ? agi.minus(value) : agi.plus(value);
                }
        let ohioAgi=agi.toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
        const businessFederal=parsed.data.businessSources&&input?calculateFederalTax(input):undefined;
        const businessSource=parsed.data.businessSources&&input&&businessFederal?calculateOhioCanonicalBusinessSource({taxInput:input,residencyFacts:parsed.data,federalResult:businessFederal}):undefined;
        if(businessSource&&businessFederal){const actual=readOhioCanonicalBusinessSource(businessSource,parsed.data,businessFederal.agi);agi=actual.federalAgi;ohioAgi=actual.ohioAgi;}
        calculateOhioITNRC({ taxYear, filingStatus: filingStatus ?? '', federalAgi: agi.toDecimalPlaces(0, Decimal.ROUND_HALF_UP), ohioAgi, taxRemainingBeforeResidencyCredits: '0', residencyFacts: parsed.data,...(businessSource?{businessSource}:{}) });
        if (input) assertOhio2026PrimaryResidencyDeclaration(input.taxpayer, parsed.data);
        if (unemployment && input?.taxpayer.taxYear === 2025) buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: parsed.data });
        return {};
    }
    catch (error) {
        return { 'ohio-residency-reconciliation': error instanceof Error ? error.message : 'Reconcile the actual owner domicile and source amounts.' };
    }
}
/** Exclude self-referential Ohio sources and federal Schedule B disclosures, which do not affect Ohio. */
export function snapshotGuidedOhioOriginals(input: TaxYearInput): Record<string, unknown> {
    return structuredClone(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'ohioResidency' && key !== 'ohioPayments' && key !== 'ohioSchoolDistrict' && key !== 'ohioReturnHeaderSources' && key !== 'scheduleBPartThree')));
}
function stableOhioOriginal(value: unknown): string {
    if (Array.isArray(value)) return '[' + value.map(stableOhioOriginal).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, child]) => child !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => JSON.stringify(key) + ':' + stableOhioOriginal(child)).join(',') + '}';
    return JSON.stringify(value) ?? 'null';
}
export function assertGuidedOhioOriginals(input: TaxYearInput, retained: Record<string, unknown> | undefined): void {
    if (!retained || stableOhioOriginal(retained) !== stableOhioOriginal(snapshotGuidedOhioOriginals(input)))
        throw new Error('Actual Ohio original sources are missing or stale; explicitly reconfirm current owner, year and federal originals.');
}

/** Check current review status without changing the retained confirmation. */
export function guidedOhio2026ResidencyReviewError(
    data: OhioResidencyDraft | undefined,
    taxYear: number | null | undefined,
    input: TaxYearInput | null | undefined,
): string | null {
    if (!data || (taxYear !== 2026 && data.taxYear !== '2026' && input?.taxpayer.taxYear !== 2026)) return null;
    const previouslyConfirmed = data.sourceFactsConfirmed === true;
    if (taxYear !== 2026 || data.taxYear !== '2026' || input?.taxpayer.taxYear !== 2026) {
        return previouslyConfirmed ? 'Ohio residency sources need the current 2026 return and matching source year.' : null;
    }
    const primaryStatus = data.owners.find(owner => owner.accountHolder === 'primary')?.status;
    const conflict = ohio2026PrimaryResidencyConflict(input.taxpayer, primaryStatus);
    if (conflict || !previouslyConfirmed) return conflict;
    if (!primaryStatus) return 'Enter the actual primary taxpayer Ohio domicile status and explicitly reconfirm.';
    try {
        assertGuidedOhioOriginals(input, data.originalFederalSources);
        projectUnemployment(data, input);
        return null;
    } catch (error) {
        if (!(error instanceof Error)) throw error;
        return error.message;
    }
}

/** Only an explicit confirmation may bind the current private originals. */
export function confirmGuidedOhioResidencyFacts(input: TaxYearInput, draft: OhioResidencyDraft | undefined): OhioResidencyDraft {
    if (!draft) throw new Error('Actual Ohio residency source facts are required.');
    const candidate = { ...structuredClone(draft), sourceFactsConfirmed: true, originalFederalSources: snapshotGuidedOhioOriginals(input) };
    buildGuidedOhioResidencyFacts(candidate, input);
    return candidate;
}
/** Pure replay of retained originals; reading never refreshes an earlier confirmation. */
export function buildGuidedOhioResidencyFacts(data: OhioResidencyDraft | undefined, input: TaxYearInput): OhioResidencyFacts {
    if (!data) throw new Error('Actual Ohio residency source facts are required.');
    assertGuidedOhioOriginals(input, data.originalFederalSources);
    const errors = ohioResidencyFactErrors(data, input.taxpayer.taxYear, input.taxpayer.filingStatus,input);
    if (Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
    return OhioResidencyFactsSchema.parse(raw(data,input,projectUnemployment(data,input)));
}
