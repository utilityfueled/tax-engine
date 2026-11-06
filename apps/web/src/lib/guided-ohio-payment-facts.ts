import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs';
import { OhioPaymentFactsSchema, type OhioPaymentFacts } from '@/models/ohio-payments';
import { buildOhioPaymentSource } from '@/engine/state/oh-payment-source';
import { assertGuidedOhioOriginals, snapshotGuidedOhioOriginals } from './guided-ohio-residency-facts';
type RawFields = Record<string, unknown>;
export interface OhioPaymentDraft {
    originalFederalSources?: Record<string, unknown>;
    taxYear: string;
    sourceReference: string;
    sourceFactsConfirmed: boolean | null;
    calendarYearConfirmed: boolean | null;
    allPaymentsIncludedConfirmed: boolean | null;
    paymentRows: RawFields[];
    priorReturn: RawFields;
    priorCreditCarryforward: RawFields;
    currentTiming: RawFields;
    remainingTaxPayment: RawFields;
    filingExtension: RawFields;
    paymentExtension: RawFields;
    returnKind: string;
    specialFacts: {
        farmingFishingIncome: string;
        militaryDisasterRelief: string;
    };
    balanceFacts: {
        sourceReference: string;
        useTax: string;
        outgoingCarryforward: string;
        donations: string;
    };
}
export const emptyOhioPaymentDraft: OhioPaymentDraft = {
    taxYear: '', sourceReference: '', sourceFactsConfirmed: null,
    calendarYearConfirmed: null, allPaymentsIncludedConfirmed: null, paymentRows: [],
    priorReturn: { status: '', sourceReference: '', taxYear: '', periodStart: '', periodEnd: '', filingStatus: '', owners: [], returnKind: '', filedDate: '', filingExtension: { kind: '' }, line10: '', line16: '', electedCreditCarryforward: '' },
    priorCreditCarryforward: { status: '', sourceReference: '', electedAmount: '', availableForThisReturn: '', accountHolder: '', accountSsn: '', appliedToThisReturnConfirmed: null },
    currentTiming: { kind: '', filedDate: '', expectedDate: '', asOfDate: '' },
    remainingTaxPayment: { status: '', sourceReference: '', sourceFactsConfirmed: null, date: '', amountAppliedToTax: '', accountHolder: '', original: { accountName: '', accountSsn: '', taxYear: '', returnType: '', kind: '', date: '', amount: '', confirmationNumber: '' } },
    filingExtension: { kind: '' }, paymentExtension: { kind: '' }, returnKind: '',
    specialFacts: { farmingFishingIncome: '', militaryDisasterRelief: '' },
    balanceFacts: { sourceReference: '', useTax: '', outgoingCarryforward: '', donations: '' },
};
export function emptyOhioPaymentRow(): RawFields {
    return { sourceId: '', sourceReference: '', accountHolder: '', taxYear: '', returnType: '', kind: '', date: '', amount: '', appliedToThisReturnConfirmed: null,
        original: { accountName: '', accountSsn: '', taxYear: '', returnType: '', kind: '', date: '', amount: '', confirmationNumber: '' } };
}
export function emptyOhioPriorOwner(): RawFields { return { accountHolder: '', name: '', ssn: '' }; }
function fields(value: unknown): RawFields { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RawFields : {}; }
const moneyKeys = new Set(['amount', 'amountAppliedToTax', 'line10', 'line16', 'electedCreditCarryforward', 'electedAmount', 'availableForThisReturn', 'useTax', 'outgoingCarryforward', 'donations']);
function normalize(value: unknown, key = ''): unknown {
    if (Array.isArray(value))
        return value.map(item => normalize(item));
    if (value !== null && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalize(child, key)]));
    if (key === 'taxYear' && typeof value === 'string')
        return /^\d{4}$/.test(value.trim()) ? Number(value.trim()) : value;
    if (moneyKeys.has(key) && typeof value === 'string') {
        const trimmed = value.trim();
        return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(trimmed) ? trimmed.replaceAll(',', '') : value;
    }
    return value;
}
function raw(data: OhioPaymentDraft, original: RawFields): unknown {
    const prior = fields(data.priorReturn), carry = fields(data.priorCreditCarryforward), timing = fields(data.currentTiming), remaining = fields(data.remainingTaxPayment);
    return normalize({
        taxYear: data.taxYear, sourceReference: data.sourceReference, sourceFactsConfirmed: data.sourceFactsConfirmed,
        originalFederalSources: original, calendarYearConfirmed: data.calendarYearConfirmed, allPaymentsIncludedConfirmed: data.allPaymentsIncludedConfirmed,
        // The ordinary statutory withholding convention is selected in code, not a taxpayer formula election.
        withholdingTreatment: 'equal_quarters', paymentRows: data.paymentRows,
        priorReturn: prior.status === 'no_return' ? { status: prior.status, sourceReference: prior.sourceReference } : prior,
        priorCreditCarryforward: carry.status === 'none' ? { status: carry.status, sourceReference: carry.sourceReference } : carry,
        currentTiming: timing.kind === 'filed' ? { kind: timing.kind, filedDate: timing.filedDate, asOfDate: timing.asOfDate } : { kind: timing.kind, expectedDate: timing.expectedDate, asOfDate: timing.asOfDate },
        remainingTaxPayment: remaining.status === 'no_remaining_tax' ? { status: remaining.status, sourceReference: remaining.sourceReference, sourceFactsConfirmed: remaining.sourceFactsConfirmed } : remaining.status === 'expected_payment' ? { status: remaining.status, sourceReference: remaining.sourceReference, sourceFactsConfirmed: remaining.sourceFactsConfirmed, date: remaining.date, amountAppliedToTax: remaining.amountAppliedToTax } : remaining,
        filingExtension: data.filingExtension, paymentExtension: data.paymentExtension, returnKind: data.returnKind,
        specialMethod: 'regular', balanceFacts: data.balanceFacts,
    });
}
/** Compare explicitly reported source income, not statutory farmer eligibility. */
function hasReportedFarmingOrFishingIncome(input: TaxYearInput): boolean {
    const farm = input.scheduleF;
    const common = farm ? [farm.cooperativeDistributions, farm.agriculturalProgramPayments,
        farm.cccLoansElected, farm.cccLoansForfeited, farm.cropInsuranceProceeds,
        farm.priorYearDeferredCropInsurance, farm.customHireIncome, farm.otherFarmIncome] : [];
    const farmReceipts = farm ? farm.accountingMethod === 'accrual'
        ? [farm.accrualSalesDuringYear, ...common]
        : [farm.salesOfPurchasedLivestock, farm.salesOfProductsRaised, ...common] : [];
    const statementReceipts = (input.form1099Misc ?? []).flatMap(row => [row.fishingBoatProceeds, row.cropInsurance]);
    return [...farmReceipts, ...statementReceipts].some(amount => amount !== undefined && new Decimal(amount).gt(0));
}
function preconditions(data: OhioPaymentDraft | undefined, taxYear: number | null | undefined, input?: TaxYearInput): Record<string, string> {
    if (!data)
        return { ohioPayments: 'Enter the actual Ohio payment and prior-return records.' };
    if (taxYear == null || !/^\d{4}$/.test(data.taxYear) || String(taxYear) !== data.taxYear)
        return { 'ohio-payment-year': 'Enter the actual source year matching this return.' };
    if (data.specialFacts?.farmingFishingIncome !== 'known_none' || data.specialFacts?.militaryDisasterRelief !== 'known_none')
        return { 'ohio-payment-special-facts': 'Confirm the actual farming/fishing and military/disaster facts. Reported relief or farming/fishing income requires its separate payment method.' };
    if (input && hasReportedFarmingOrFishingIncome(input))
        return { 'ohio-payment-special-source-contradiction': 'The no farming or fishing income answer contradicts actual reported original farm or fishing receipts.' };
    return {};
}
export function ohioPaymentFactErrors(data: OhioPaymentDraft | undefined, taxYear: number | null | undefined, input?: TaxYearInput): Record<string, string> {
    const errors = preconditions(data, taxYear, input);
    if (Object.keys(errors).length || !data)
        return errors;
    if (input) {
        try { assertGuidedOhioOriginals(input, data.originalFederalSources); }
        catch (error) { return { 'ohio-payment-originals': error instanceof Error ? error.message : 'Reconfirm actual current Ohio originals.' }; }
    }
    const original = data.originalFederalSources ?? {};
    const parsed = OhioPaymentFactsSchema.safeParse(raw(data, original));
    if (!parsed.success)
        return Object.fromEntries(parsed.error.issues.map(issue => [`ohio-payment-${issue.path.join('-')}`, `Complete the actual ${issue.path.join(' ')} source facts; use zero only when known.`]));
    if (input) {
        try {
            buildOhioPaymentSource(input, parsed.data);
        }
        catch (error) {
            return { 'ohio-payment-reconciliation': error instanceof Error ? error.message : 'Reconcile the actual Ohio account originals.' };
        }
    }
    return {};
}
/** Explicit confirmation is the only operation that replaces retained private originals. */
export function confirmGuidedOhioPaymentFacts(input: TaxYearInput, draft: OhioPaymentDraft | undefined): OhioPaymentDraft {
    if (!draft) throw new Error('Actual Ohio payment source facts are required.');
    const candidate = { ...structuredClone(draft), sourceFactsConfirmed: true, originalFederalSources: snapshotGuidedOhioOriginals(input) };
    buildGuidedOhioPaymentFacts(candidate, input);
    return candidate;
}
/** Validate retained originals without refreshing them or interpreting unknown special facts. */
export function buildGuidedOhioPaymentFacts(data: OhioPaymentDraft | undefined, input: TaxYearInput): OhioPaymentFacts {
    const errors = ohioPaymentFactErrors(data, input.taxpayer.taxYear, input);
    if (!data || Object.keys(errors).length) throw new Error(Object.values(errors).join(' '));
    return buildOhioPaymentSource(input, raw(data, structuredClone(data.originalFederalSources ?? {}))).facts;
}
