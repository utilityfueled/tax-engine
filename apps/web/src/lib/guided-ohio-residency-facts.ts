import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {OhioResidentCreditDraft} from './guided-ohio-resident-credit-sources';
import type { TaxYearInput } from '@/models/inputs';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioNrcCategory, type OhioResidencyFacts } from '@/models/ohio-residency';
import { calculateOhioITNRC } from '@/engine/state/oh-it-nrc';
import {calculateFederalTax} from '@/engine/federal';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter';
import {calculateOhioCanonicalBusinessSource,readOhioCanonicalBusinessSource} from '@/engine/state/oh-business-source';
import {buildGuidedOhioBusinessFacts,type OhioBusinessDraft} from './guided-ohio-business-facts';
export interface OhioUnemploymentPaymentDraft {
    originalStatementFingerprint: string;
    sourceReference: string;
    paidOrAccruedOn: string;
    amount: string;
    allPaymentsIncludedConfirmed: boolean | null;
}
export interface OhioResidencyDraft {
    residentCreditSources?: OhioResidentCreditDraft;
    businessSources?: OhioBusinessDraft;
    unemploymentPaymentSource?: OhioUnemploymentPaymentDraft;
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
    const originals = input?.form1099G;
    const original = originals?.[0];
    if (input?.taxpayer.taxYear !== 2025 || input.taxpayer.filingStatus !== 'single' || originals?.length !== 1
        || !original?.sourceId?.trim() || !original.accountReference?.trim()
        || original.accountHolder !== 'primary' || original.taxYear !== 2025
        || original.programType !== 'government-unemployment' || original.sourceFactsComplete !== true
        || original.sourceFactsConfirmed !== true || original.actualReceiptConfirmed !== true
        || original.additionalWorksheetRequired !== false || original.tradeOrBusinessRefund !== false
        || original.stateTaxReporting !== 'none' || original.refundPaymentBasis || original.priorYearRepaymentSource
        || original.contributionProgramId !== undefined) return undefined;
    const box1 = new Decimal(original.unemploymentCompensation);
    const otherAmounts = [
        original.currentYearRepaid, original.priorYearRepaid, original.unrecoveredAfterTaxContributions,
        original.stateOrLocalTaxRefund, original.stateLocalIncomeTaxRefund, original.rtaaPayments, original.taxableGrants,
        original.agriculturePayments, original.marketGain, original.familyLeaveBenefits, original.stateWithheld,
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
function projectUnemployment(data: OhioResidencyDraft, input?: TaxYearInput) {
    const proof = data.unemploymentPaymentSource;
    const owner = data.owners[0];
    const allFull = data.owners.every(row => row.status === 'full_year_resident');
    if (!proof && (allFull || input?.taxpayer.taxYear !== 2025
        || !input.form1099G?.some(original => new Decimal(original.unemploymentCompensation).gt(0)))) return undefined;
    const original = guidedOhioUnemploymentStatement(input);
    if (!original || data.owners.length !== 1 || owner?.accountHolder !== 'primary'
        || (owner.status !== 'part_year_resident' && owner.status !== 'nonresident')
        || data.businessSources || data.residentCreditSources || data.schoolDistrictStatus !== 'no_ohio_taxing_district_residency'
        || input?.ohioSchoolDistrict) {
        throw new Error('Ohio unemployment requires one verified ordinary 2025 Form 1099-G and the nonresident or part-year method.');
    }
    const amounts = { federalAmount: original.amount, residentAmount: '0', nonresidentOhioAmount: '0', sourceReference: original.reference };
    if (owner.status === 'nonresident') {
        if (proof) throw new Error('Remove the part-year unemployment payment evidence for this full-year nonresident.');
        return { amounts };
    }
    if (proof && proof.originalStatementFingerprint !== original.fingerprint) {
        throw new Error('The Form 1099-G was replaced or changed, or the unemployment owner changed. Enter the payment evidence again.');
    }
    if (!proof?.sourceReference?.trim() || !proof.paidOrAccruedOn || !proof.amount?.trim() || proof.allPaymentsIncludedConfirmed !== true) {
        throw new Error('Enter and confirm the actual complete dated unemployment payment evidence.');
    }
    const amount = normalizedAmount(proof.amount);
    if (!/^\d+(?:\.\d+)?$/.test(amount) || !new Decimal(amount).eq(original.amount)) {
        throw new Error('The actual unemployment payment amount must match Form 1099-G Box 1 exactly.');
    }
    const date = proof.paidOrAccruedOn;
    const stamp = Date.parse(`${date}T00:00:00Z`);
    const period = owner.periods.find(period => period.from <= date && period.to >= date);
    if (!/^2025-\d{2}-\d{2}$/.test(date) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== date || !period) {
        throw new Error('Enter the actual unemployment payment or accrual date within the confirmed 2025 domicile periods.');
    }
    return {
        amounts: { ...amounts, residentAmount: period.domicileState === 'OH' ? original.amount : '0' },
        payment: {
            originalSourceId: original.sourceId, sourceReference: proof.sourceReference, paidOrAccruedOn: date,
            amount, allPaymentsIncludedConfirmed: true as const,
        },
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
    const {residentCreditSources:_residentCredit, unemploymentPaymentSource:_unemploymentPayment, ...parent}=data;
    return {
        ...parent, taxYear: Number(data.taxYear),
        ...(unemployment?.payment ? { unemploymentPaymentSource: unemployment.payment } : {}),
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
        if (unemployment && input) buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: parsed.data });
        return {};
    }
    catch (error) {
        return { 'ohio-residency-reconciliation': error instanceof Error ? error.message : 'Reconcile the actual owner domicile and source amounts.' };
    }
}
/** Canonical federal originals exclude only the self-referential Ohio source roots. */
export function snapshotGuidedOhioOriginals(input: TaxYearInput): Record<string, unknown> {
    return structuredClone(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'ohioResidency' && key !== 'ohioPayments' && key !== 'ohioSchoolDistrict' && key !== 'ohioReturnHeaderSources')));
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
