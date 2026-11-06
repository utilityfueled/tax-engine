/** Spec: state/oh-2026-school-native.yaml. Source handoff only; never a completed return. */
import type { TaxYearInput } from '@/models/inputs';
import { OhioResidencyFactsSchema } from '@/models/ohio-residency';
import { Ohio2026SchoolSourcesSchema } from '@/models/ohio-2026-school-sources';
import { calculateOhio2026SchoolSource, readOhio2026SchoolSource } from '@/engine/state/oh-2026-school-source';
import { emptyOhioResidencyDraft, type OhioResidencyDraft } from './guided-ohio-residency-facts';
type Answer = boolean | null;
interface Address {
    street: string;
    apt?: string;
    city: string;
    state: string;
    zip: string;
}
interface Person {
    firstName: string;
    lastName: string;
    ssn: string;
    dateOfBirth: string;
}
export interface Ohio2026SchoolEmploymentDraft {
    w2Index: number | null;
    sourceReference: string;
    sourceTaxYear: string;
    accountHolder: string;
    employerTin: string;
    employerName: string;
    entityType: string;
    ordinaryEmployeeCompensationConfirmed: Answer;
    allServiceAndPaymentPeriodsIncludedConfirmed: Answer;
    serviceRows: Array<{
        sourceId: string;
        sourceReference: string;
        from: string;
        to: string;
        paymentDate: string;
        serviceState: string;
        wages: string;
    }>;
}
export interface Ohio2026SchoolDraft {
    taxYear: string;
    sourceReference: string;
    sourceFactsConfirmed: Answer;
    originalFederalSources?: Record<string, unknown>;
    originalTaxInput?: Record<string, unknown>;
    confirmedSourceFacts?: Record<string, unknown>;
    owner: {
        accountHolder: string;
        originalTaxpayer: Person;
    };
    residence: {
        sourceReference: string;
        originalAddress: Address;
        from: string;
        through: string;
        districtCode: string;
        finder: {
            sourceReference: string;
            taxYear: string;
            lookupDate: string;
            originalAddress: Address;
            districtCode: string;
            districtName: string;
            taxBase: string;
            rate: string;
            officialResultMatchedConfirmed: Answer;
        };
    };
    residency: OhioResidencyDraft;
    noStateAdjustmentsConfirmed: Answer;
    income: {
        allIncomeOriginalsIncludedConfirmed: Answer;
        noOtherIncomeOrAdjustmentsConfirmed: Answer;
        noSelfEmploymentConfirmed: Answer;
        noSpecialCompensationConfirmed: Answer;
    };
    employmentOriginals: Ohio2026SchoolEmploymentDraft[];
    w2Sources: Array<{
        w2Index: number | null;
        sourceReference: string;
        box14SchoolDistrictReporting: string;
        localRows: Array<{
            printedRow: number | null;
            sourceReference: string;
            classification: string;
            districtCode: string;
        }>;
    }>;
}
const address = (): Address => ({ street: '', city: '', state: '', zip: '' });
export function emptyOhio2026SchoolDraft(): Ohio2026SchoolDraft { return { taxYear: '', sourceReference: '', sourceFactsConfirmed: null, owner: { accountHolder: '', originalTaxpayer: { firstName: '', lastName: '', ssn: '', dateOfBirth: '' } }, residence: { sourceReference: '', originalAddress: address(), from: '', through: '', districtCode: '', finder: { sourceReference: '', taxYear: '', lookupDate: '', originalAddress: address(), districtCode: '', districtName: '', taxBase: '', rate: '', officialResultMatchedConfirmed: null } }, residency: structuredClone(emptyOhioResidencyDraft), noStateAdjustmentsConfirmed: null, income: { allIncomeOriginalsIncludedConfirmed: null, noOtherIncomeOrAdjustmentsConfirmed: null, noSelfEmploymentConfirmed: null, noSpecialCompensationConfirmed: null }, employmentOriginals: [], w2Sources: [] }; }
export function emptyOhio2026SchoolEmployment(): Ohio2026SchoolEmploymentDraft { return { w2Index: null, sourceReference: '', sourceTaxYear: '', accountHolder: '', employerTin: '', employerName: '', entityType: '', ordinaryEmployeeCompensationConfirmed: null, allServiceAndPaymentPeriodsIncludedConfirmed: null, serviceRows: [] }; }
export function emptyOhio2026SchoolPayroll(): Ohio2026SchoolEmploymentDraft['serviceRows'][number] { return { sourceId: '', sourceReference: '', from: '', to: '', paymentDate: '', serviceState: '', wages: '' }; }
function fail(message: string): never { throw Error(`Ohio2026 school native sources: ${message}`); }
function stable(v: unknown): unknown {
    if (Array.isArray(v))
        return v.map(stable);
    if (v && typeof v === 'object')
        return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, stable(x)]));
    return v;
}
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const year = (v: string) => /^\d{4}$/.test(v) ? Number(v) : v;
/** Exact primitive normalization only; malformed/unknown values are retained for rejection. */
export function normalizeOhio2026SchoolCash(v: string): string { return /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(v.trim()) ? v.trim().replaceAll(',', '') : v; }
function baseOnly(input: TaxYearInput): void {
    if (input.taxpayer.taxYear !== 2026)
        fail('actual selected2026 originals required');
    for (const key of ['ohioResidency', 'ohioPayments', 'ohioSchoolDistrict', 'ohioReturnHeaderSources'] as const)
        if (input[key] !== undefined)
            fail(`retained canonical ${key} requires explicit reconciliation; it has not been overwritten`);
}
/** An explicit capture can update private input, owner and home originals, never money/Finder/payroll. */
export function captureGuidedOhio2026SchoolOriginals(input: TaxYearInput, draft: Ohio2026SchoolDraft): Ohio2026SchoolDraft {
    baseOnly(input);
    const next = structuredClone(draft);
    next.originalFederalSources = structuredClone(input);
    next.owner.originalTaxpayer = structuredClone(input.taxpayer.primary);
    next.residence.originalAddress = structuredClone(input.taxpayer.address);
    next.sourceFactsConfirmed = null;
    return next;
}
function canonical(input: TaxYearInput, draft: Ohio2026SchoolDraft): TaxYearInput {
    baseOnly(input);
    if (!draft.originalFederalSources || !same(draft.originalFederalSources, input))
        fail('captured canonical originals missing or stale; explicitly capture current records');
    if (draft.residency.originalFederalSources !== undefined && !same(draft.residency.originalFederalSources, draft.originalFederalSources))
        fail('retained residency snapshot conflicts with captured originals; reconcile it explicitly');
    if (draft.noStateAdjustmentsConfirmed !== true)
        fail('actual known empty state-adjustment inventory required');
    const residency = OhioResidencyFactsSchema.parse({ ...structuredClone(draft.residency), taxYear: year(draft.residency.taxYear), originalFederalSources: draft.originalFederalSources });
    return { ...input, ohioResidency: residency };
}
function packet(d: Ohio2026SchoolDraft) {
    const { residency: _residency, noStateAdjustmentsConfirmed: _adjustments, originalFederalSources: _base, confirmedSourceFacts: _sourceProof, ...s } = structuredClone(d);
    return Ohio2026SchoolSourcesSchema.parse({ ...s, taxYear: year(d.taxYear), residence: { ...s.residence, finder: { ...s.residence.finder, taxYear: year(s.residence.finder.taxYear) } }, employmentOriginals: s.employmentOriginals.map(e => ({ ...e, sourceTaxYear: year(e.sourceTaxYear), serviceRows: e.serviceRows.map(row => ({ ...row, wages: normalizeOhio2026SchoolCash(row.wages) })) })) });
}
/** Pure replay; no read refreshes either captured snapshot or its confirmation. */
export function buildGuidedOhio2026SchoolSource(input: TaxYearInput, draft: Ohio2026SchoolDraft | undefined) {
    if (!draft || draft.sourceFactsConfirmed !== true)
        fail('explicit source confirmation required after the last edit');
    if (!draft.confirmedSourceFacts || !same(draft.confirmedSourceFacts, ohio2026SchoolActualValues(draft)))
        fail('source confirmation is stale; explicitly reconfirm current entered originals');
    const current = canonical(input, draft), sources = packet(draft), context = calculateOhio2026SchoolSource(current, sources);
    return readOhio2026SchoolSource(context, current, sources);
}
/** Final confirmation is separate from capture; complete actual originals must pass the existing API. */
export function confirmGuidedOhio2026SchoolSource(input: TaxYearInput, draft: Ohio2026SchoolDraft): Ohio2026SchoolDraft {
    const current = canonical(input, draft), next = { ...structuredClone(draft), sourceFactsConfirmed: true, originalTaxInput: structuredClone(current), confirmedSourceFacts: structuredClone(ohio2026SchoolActualValues(draft)) as Record<string, unknown> };
    buildGuidedOhio2026SchoolSource(input, next);
    return next;
}
export function ohio2026SchoolActualValues(draft: Ohio2026SchoolDraft | undefined): unknown {
    if (!draft)
        return undefined;
    const { sourceFactsConfirmed: _confirmed, originalFederalSources: _base, originalTaxInput: _complete, confirmedSourceFacts: _sourceProof, ...actual } = draft;
    return actual;
}
