/** Spec: passenger-native-source-collector.yaml. Documentary capture, never an election calculator. */
import Decimal from 'decimal.js';
import { z } from 'zod';
import { Form4562Schema, TaxYearInputSchema, type Form4562Input } from '@/models/inputs';
import { PassengerFirstYearSourcesSchema } from '@/models/passenger-auto-first-year-sources';
import { PASSENGER_NATIVE_OTHER_INVENTORIES,PassengerNativeOtherSourcesSchema, PassengerAutoParentSourcesSchema, PassengerNativeContextSchema, PASSENGER_NATIVE_CONTEXT_KEYS, PASSENGER_PARENT_EXPENSE_KEYS } from '@/models/passenger-auto-parent-sources';
import { calculatePassengerFirstYear } from '@/engine/forms/form-4562-passenger-first-year';
import { calculateScheduleCPassengerSources } from '@/engine/schedules/schedule-c-passenger-first-year-sources';
import type { BusinessSourceData } from './guided-business-facts';
import { macrsSourceValue } from './guided-macrs-assets';
export const passengerOtherSourceInventories = PASSENGER_NATIVE_OTHER_INVENTORIES;
export interface GuidedPassengerDraft {
    sourceTaxYear?: string;
    otherSources?: Record<string, {
        sourceReference?: string;
        reviewedNoneConfirmed?: boolean | null;
    }>;
    vehicle?: Record<string, unknown>;
    summary?: Record<string, unknown>;
    parent?: Record<string, unknown>;
    sourceFactsConfirmed?: boolean | null;
    originalInput?: Record<string, unknown>;
    originalDraft?: Record<string, unknown>;
}
const draftSchema = z.strictObject({ sourceTaxYear: z.literal('2026'), vehicle: z.record(z.string(), z.unknown()), summary: z.record(z.string(), z.unknown()), parent: z.record(z.string(), z.unknown()), otherSources: PassengerNativeOtherSourcesSchema, sourceFactsConfirmed: z.boolean().nullable().optional(), originalInput: z.record(z.string(), z.unknown()).optional(), originalDraft: z.record(z.string(), z.unknown()).optional() });
export const passengerSummaryFields = ['specialDepreciationAllowance', 'section168f1Depreciation', 'otherDepreciation', 'macrsPre2025AssetsDepreciation', 'macrsCurrentYearGdsDepreciation', 'macrsCurrentYearAdsDepreciation', 'listedPropertyDepreciation', 'currentYearAmortization', 'priorYearAmortization', 'cumulativePriorMacrsDeductions', 'cumulativePriorAdsDeductions'] as const;
const fail = (s: string): never => { throw new Error('Actual passenger source records: ' + s); };
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype)
    return fail('plain actual documentary record required'); return v as Record<string, unknown>; }
function money(v: unknown): string { if (typeof v !== 'string' || v.length > 100 || !/^\d+(?:\.\d+)?$/.test(v))
    return fail('explicit finite nonnegative source amount required'); return v; }
function currentDraft(d: GuidedPassengerDraft) { const p = draftSchema.parse(d); return { sourceTaxYear: p.sourceTaxYear, vehicle: p.vehicle, summary: p.summary, parent: p.parent, otherSources: p.otherSources }; }
/** Reconstruct only declared documentary facts; canonical engine derives admission. */
export function buildGuidedPassengerForm(f: BusinessSourceData | undefined, year: number | null | undefined): Form4562Input | undefined {
    if (f?.depreciationMethod !== 'passenger') {
        if (f?.passengerSources)
            fail('passenger records cannot fall back to another method');
        return undefined;
    }
    if (f.macrsAssets)
        fail('competing ordinary inventory is retained for review');
    const d = f.passengerSources;
    if (!d)
        return fail('passenger documentary inventory is unknown');
    const p = currentDraft(d);
    if (year !== 2026)
        fail('actual return and source year must be2026');
    const v = p.vehicle, summary = p.summary;
    const extra = ['placedInServiceDate', 'description', 'recoveryPeriod', 'method', 'convention', 'isListedProperty', 'isPassengerAutomobile', 'disposedDuringYear', 'section280FRecaptureTriggered', 'firstYearBonusEligible'];
    const allowed = new Set([...Object.keys(PassengerFirstYearSourcesSchema.shape).filter(k => !['version', 'sourceTaxYear', 'originalForm'].includes(k)), ...extra]);
    if (Object.keys(v).some(k => !allowed.has(k)))
        fail('unsupported documentary asset fields require review');
    if (Object.keys(summary).length !== passengerSummaryFields.length || Object.keys(summary).some(k => !(passengerSummaryFields as readonly string[]).includes(k)))
        fail('complete separate summary records required');
    for (const k of passengerSummaryFields)
        money(summary[k]);
    const pi = record(v.partI), gross = money(v.grossCostBasis), use = money(v.businessUsePercentage);
    const Exact = Decimal.clone({ precision: 256 });
    if (!new Exact(use).eq(String(Number(use))))
        fail('actual business-use percentage cannot be represented exactly');
    const raw = { taxYear: 2026, assets: [{ description: v.description, costBasis: new Exact(gross).minus(money(pi.allowedSection179)).toString(), businessUsePercentage: Number(use), placedInServiceDate: v.placedInServiceDate, recoveryPeriod: v.recoveryPeriod, method: v.method, convention: v.convention, isListedProperty: v.isListedProperty, isPassengerAutomobile: v.isPassengerAutomobile, disposedDuringYear: v.disposedDuringYear, section280FRecaptureTriggered: v.section280FRecaptureTriggered, firstYearBonusEligible: v.firstYearBonusEligible, cumulativePriorMacrsDeductions: summary.cumulativePriorMacrsDeductions, cumulativePriorAdsDeductions: summary.cumulativePriorAdsDeductions }],
        ...Object.fromEntries(passengerSummaryFields.filter(k => !k.startsWith('cumulative')).map(k => [k, summary[k]])), section179MaximumDeduction: pi.maximum, section179ThresholdCost: pi.threshold, section179TotalCost: pi.totalCost, section179ElectedCost: pi.electedCost, section179BusinessIncomeLimit: pi.businessIncomeLimit, section179ExpenseDeduction: pi.allowedSection179, section179CarryoverFromPriorYear: pi.priorCarryover, section179CarryoverToNextYear: pi.nextCarryover };
    // No schema default can supply a missing vehicle fact or completed PartI amount.
    for (const k of extra)
        if (v[k] === undefined || v[k] === null || v[k] === '')
            fail('actual vehicle classification, method and history facts are incomplete');
    const original = Form4562Schema.parse(raw), source = Object.fromEntries(Object.entries(v).filter(([k]) => !extra.includes(k)));
    const form = Form4562Schema.parse({ ...original, passengerFirstYearSources: { ...source, version: 'passenger-first-year-v1', sourceTaxYear: 2026, originalForm: json(original) } });
    calculatePassengerFirstYear(form, 2026);
    return json(form);
}
/** Capture and normal build use the same actual parent proof and resolver. */
export function bindGuidedPassengerInput(raw: unknown, f: BusinessSourceData | undefined, capture = false) {
    const form = buildGuidedPassengerForm(f, record(record(raw).taxpayer).taxYear as number);
    if (!form)
        return undefined;
    const d = known(known(f).passengerSources), draft = currentDraft(d), p = record(draft.parent);
    const allowed = new Set(['sourceReference', 'assetReference', 'incomeWorksheetReference', 'ledgerReference', 'nonNecCashReceipts', 'amounts', 'expenseClassifications', 'scope', 'necRows']);
    if (Object.keys(p).some(k => !allowed.has(k)))
        fail('unsupported parent documentary facts require review');
    const input = record(json(raw)), business = record(input.scheduleC), expenses = record(business.expenses), ledger = record(record(p.amounts).expenses);
    for (const key of PASSENGER_PARENT_EXPENSE_KEYS) {
        const actual = ledger[key];
        money(actual);
        if (expenses[key] !== undefined && !new Decimal(money(expenses[key])).eq(money(actual)))
            fail('native expenses disagree with the original complete ledger');
        expenses[key] = actual;
    }
    if(input.form4562!==undefined&&macrsSourceValue(input.form4562)!==macrsSourceValue(form))fail('actual canonical form conflicts with documentary form originals');
    input.form4562 = form;
    PassengerNativeContextSchema.parse(Object.fromEntries(PASSENGER_NATIVE_CONTEXT_KEYS.filter(k => input[k] !== undefined).map(k => [k, input[k]])));
    if (Object.keys(input).some(k => input[k] !== undefined && !(k in TaxYearInputSchema.shape)))
        fail('unclassified native canonical source requires review');
    // Explicit documentary zero rows fill only missing native expense fields, never overwrite a known amount.
    // Structural parse prepares original snapshots; the complete canonical schema is always run after proof construction.
    const canonical = json(z.object(TaxYearInputSchema.shape).parse(input)), native = Object.fromEntries(PASSENGER_NATIVE_CONTEXT_KEYS.filter(k => canonical[k] !== undefined).map(k => [k, canonical[k]]));
    PassengerNativeContextSchema.parse(native);
    const b = known(canonical.scheduleC);
    const proof = PassengerAutoParentSourcesSchema.parse({ ...p, version: 'passenger-parent-v1', sourceTaxYear: 2026, confirmed: true, accountHolder: b.accountHolder, assetIndex: 0, originalTaxpayer: json(canonical.taxpayer), originalBusiness: json(b), originalForm: json(form), originalNativeContext: json(native),nativeOtherSources:json(draft.otherSources), necRows: Array.isArray(p.necRows) ? p.necRows.map((r, index) => { const row = record(r); if (Object.keys(row).some(k => !['index', 'sourceReference', 'confirmed', 'actualSameBusinessCashServicesConfirmed'].includes(k)) || row.index !== index || canonical.form1099Nec[index] === undefined)
            fail('actual unique NEC inventory index and references required'); return { ...row, originalRecord: json(canonical.form1099Nec[index]) }; }) : p.necRows });
    // The references cannot manufacture NEC coverage; exact real inventory and reconciliation are checked by the resolver.
    const snapshot = json(canonical) as unknown as Record<string, unknown>;
    b.sourceFacts = { ...b.sourceFacts, passengerFirstYear: proof };
    TaxYearInputSchema.parse(canonical);
    calculateScheduleCPassengerSources(canonical, b);
    if (!capture && (d.sourceFactsConfirmed !== true || macrsSourceValue(d.originalInput) !== macrsSourceValue(snapshot) || macrsSourceValue(d.originalDraft) !== macrsSourceValue(draft)))
        fail('original native facts changed or require explicit complete-source capture');
    return { input: canonical, draft: { ...d, sourceFactsConfirmed: true, originalInput: json(snapshot), originalDraft: json(draft) } as GuidedPassengerDraft };
}
/** Source-year display only; current owner, source and return admission still happens in the bridge. */
export function guidedPassengerDisplayAmount(f: BusinessSourceData | undefined): string | undefined { try {
    if (f?.passengerSources?.sourceFactsConfirmed !== true)
        return undefined;
    const form = buildGuidedPassengerForm(f, Number(f.passengerSources.sourceTaxYear));
    return form ? calculatePassengerFirstYear(form, 2026).line22.toString() : undefined;
}
catch {
    return undefined;
} }

function known<T>(value:T|null|undefined):T{if(value===null||value===undefined)throw new Error('Required actual source record is absent');return value;}
