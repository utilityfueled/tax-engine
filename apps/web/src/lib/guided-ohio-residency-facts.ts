import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioNrcCategory, type OhioResidencyFacts } from '@/models/ohio-residency';
import { calculateOhioITNRC } from '@/engine/state/oh-it-nrc';
export interface OhioResidencyDraft {
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
function raw(data: OhioResidencyDraft) {
    const allFull = data.owners.length > 0 && data.owners.every(owner => owner.status === 'full_year_resident');
    return {
        ...data, taxYear: Number(data.taxYear),
        allFederalSourcesIncludedConfirmed: data.allFederalSourcesIncludedConfirmed ?? undefined,
        noBusinessIncomeConfirmed: data.noBusinessIncomeConfirmed ?? undefined,
        owners: data.owners.map(owner => ({
            ...owner,
            amounts: allFull || !owner.amounts ? undefined : Object.fromEntries(ohioNrcCategories.map(category => {
                const row = owner.amounts?.[category];
                return [category, row ? {...row, federalAmount:normalizedAmount(row.federalAmount), residentAmount:normalizedAmount(row.residentAmount), nonresidentOhioAmount:normalizedAmount(row.nonresidentOhioAmount)} : undefined];
            })),
            stateAdditions: allFull ? [] : owner.stateAdditions,
            stateDeductions: allFull ? [] : owner.stateDeductions,
        })),
    };
}
export function ohioResidencyFactErrors(data: OhioResidencyDraft | undefined, taxYear: number | null | undefined, filingStatus: string | null | undefined): Record<string, string> {
    if (!data)
        return { ohioResidency: 'Enter the actual Ohio owner domicile source facts, including full-year residency.' };
    if (taxYear == null || !/^\d{4}$/.test(data.taxYear) || String(taxYear) !== data.taxYear)
        return { 'ohio-residency-year': 'Enter the actual source year matching this return.' };
    const parsed = OhioResidencyFactsSchema.safeParse(raw(data));
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
        calculateOhioITNRC({ taxYear, filingStatus: filingStatus ?? '', federalAgi: agi.toDecimalPlaces(0, Decimal.ROUND_HALF_UP), ohioAgi: agi.toDecimalPlaces(0, Decimal.ROUND_HALF_UP), taxRemainingBeforeResidencyCredits: '0', residencyFacts: parsed.data });
        return {};
    }
    catch (error) {
        return { 'ohio-residency-reconciliation': error instanceof Error ? error.message : 'Reconcile the actual owner domicile and source amounts.' };
    }
}
/** Snapshot only the current original; no amount or residence is inferred. */
export function buildGuidedOhioResidencyFacts(data: OhioResidencyDraft | undefined, input: TaxYearInput): OhioResidencyFacts {
    if (!data) throw new Error("Actual Ohio residency source facts are required.");
    const errors = ohioResidencyFactErrors(data, input.taxpayer.taxYear, input.taxpayer.filingStatus);
    if (Object.keys(errors).length)
        throw new Error(Object.values(errors).join(' '));
    const { ohioResidency: _, ohioPayments: _payments, ...original } = input as TaxYearInput & {
        ohioResidency?: unknown; ohioPayments?:unknown;
    };
    return OhioResidencyFactsSchema.parse({ ...raw(data), originalFederalSources: structuredClone(original) });
}
