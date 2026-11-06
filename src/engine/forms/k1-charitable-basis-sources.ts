/** Actual original statement and basis-only history. Spec: k1-charitable-basis-sources.yaml. */
import Decimal from 'decimal.js';
import type { ScheduleK1, TaxYearInput } from '@/models/inputs.js';
import type { K1CharitableBasisSources } from '@/models/k1-charitable-basis-sources.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';
type Identity = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
export interface K1CharitableBasisContext {
    taxpayer: {
        taxYear: number;
        filingStatus: TaxYearInput['taxpayer']['filingStatus'];
        primary: Identity;
        spouse?: Identity;
    };
    sources: K1CharitableBasisSources;
}
export type K1CharitableCategory = 'cash_60' | 'capital_gain_30' | 'capital_gain_20';
export interface K1CharitableBasisRecord {
    sourceId: string;
    originTaxYear: number;
    category: K1CharitableCategory;
    current: boolean;
    contributionShare: Decimal;
    originalBasis: Decimal;
    basisPreviouslyAllowed: Decimal;
    basisSubjectToLimit: Decimal;
    appreciationExempt: Decimal;
}
export interface K1CharitableBasisSourceResult {
    records: K1CharitableBasisRecord[];
    currentBasis: Decimal;
    priorBasis: Decimal;
    appreciationExempt: Decimal;
    lines: CalculatedLine[];
}
function amount(value: string | undefined, label: string): Decimal {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value))
        throw new Error(`K1 charitable ${label} requires an actual nonnegative source amount`);
    const n = d(value);
    if (!n.isFinite() || n.lt(0))
        throw new Error(`K1 charitable ${label} must be finite and nonnegative`);
    return n;
}
function text(value: string | undefined, label: string): string {
    if (!value?.trim())
        throw new Error(`K1 charitable ${label} is unknown`);
    return value.trim();
}
function normalized(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
function date(value: string | undefined, label: string): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
        throw new Error(`K1 charitable ${label} requires an actual date`);
    return value;
}
function contribution(value: {
    category?: K1CharitableCategory;
    contributionShare?: string;
    adjustedBasisShare?: string;
}) {
    const category = value.category;
    if (category !== 'cash_60' && category !== 'capital_gain_30' && category !== 'capital_gain_20')
        throw new Error('K1 charitable category is unknown or unsupported');
    const share = amount(value.contributionShare, 'original contribution share');
    const basis = category === 'cash_60' ? share : amount(value.adjustedBasisShare, 'original allocated property basis');
    if (category === 'cash_60' && value.adjustedBasisShare !== undefined && !amount(value.adjustedBasisShare, 'cash basis').eq(share))
        throw new Error('K1 charitable cash basis must equal the actual cash contribution');
    if (basis.gt(share))
        throw new Error('K1 charitable decreased-value property requires its separate basis reduction method');
    return { category, share, basis, appreciation: share.minus(basis) };
}
export function calculateK1CharitableBasisSources(k1: ScheduleK1, context: K1CharitableBasisContext): K1CharitableBasisSourceResult {
    const { sources: s, taxpayer } = context, year = taxpayer.taxYear;
    if (![2025, 2026].includes(year) || s.sourceTaxYear !== year || k1.taxYear !== year)
        throw new Error('K1 charitable actual source and return years must match');
    text(s.sourceReference, 'original statement reference');
    const start = date(s.statementYearStart, 'statement year start'), end = date(s.statementYearEnd, 'statement year end');
    const elapsedDays = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000;
    if (start > end || end.slice(0, 4) !== String(year) || elapsedDays > 365)
        throw new Error('K1 charitable original statement period must end in the actual return year and span at most one year');
    if (s.sourceFactsConfirmed !== true || s.basisFactsConfirmed !== true || s.noOtherBasisChangesConfirmed !== true
        || s.priorBasisHistoryComplete !== true)
        throw new Error('K1 charitable requires confirmed complete original basis facts and history');
    const owner = s.accountHolder;
    if (!owner || owner !== k1.accountHolder || (owner === 'spouse' && (taxpayer.filingStatus !== 'married_filing_jointly' || !taxpayer.spouse)))
        throw new Error('K1 charitable actual original owner must match the return');
    const person = owner === 'primary' ? taxpayer.primary : taxpayer.spouse;
    if (!person || normalized(text(s.recipientName, 'recipient name')) !== normalized(`${person.firstName} ${person.lastName}`)
        || !/^\d{9}$/.test(person.ssn.replaceAll('-', '')) || !/^\d{4}$/.test(s.recipientTaxpayerIdLast4 ?? '')
        || person.ssn.replaceAll('-', '').slice(-4) !== s.recipientTaxpayerIdLast4)
        throw new Error('K1 charitable recipient identity must match the actual return');
    const ein = text(s.entityEIN, 'entity EIN').replaceAll('-', '');
    if (!/^\d{9}$/.test(ein) || ein !== k1.partnershipEIN.replaceAll('-', '') || !s.entityType || s.entityType !== k1.entityType
        || normalized(text(s.entityName, 'entity name')) !== normalized(k1.partnershipName))
        throw new Error('K1 charitable original entity identity must match');
    amount(k1.beginningBasis, 'original beginning basis');
    for (const key of ['ordinaryIncome', 'netRentalIncome', 'otherNetRentalIncome', 'interestIncome', 'ordinaryDividends', 'royalties',
        'netShortTermCapitalGain', 'netLongTermCapitalGain', 'section1231Gain', 'otherIncome', 'taxExemptInterest', 'otherTaxExemptIncome'] as const) {
        if (!d(k1[key]).isFinite())
            throw new Error(`K1 charitable original ${key} must be finite`);
    }
    for (const key of ['interestIncome', 'ordinaryDividends', 'royalties', 'taxExemptInterest', 'otherTaxExemptIncome'] as const) {
        if (d(k1[key]).lt(0))
            throw new Error(`K1 charitable negative ${key} requires its separate basis loss source method`);
    }
    if (!d(k1.priorSuspendedLosses?.ebie).isZero())
        throw new Error('K1 charitable prior EBIE requires its separate reconciled basis method');
    if (k1.isPubliclyTradedPartnership || k1.ptpFullyDisposedInTaxableTransaction || k1.isForeignPartnership)
        throw new Error('K1 charitable PTP foreign and disposition sources require a separate basis method');
    for (const key of ['guaranteedPayments', 'foreignTaxPaid', 'excessBusinessInterest', 'excessTaxableIncome', 'excessBusinessInterestIncome', 'ptpDispositionGainOrLoss'] as const) {
        if (!d(k1[key]).isFinite() || !d(k1[key]).isZero())
            throw new Error(`K1 charitable ${key} requires a separate reconciled basis method`);
    }
    if (s.cashDistributionsOnlyConfirmed !== true)
        throw new Error('K1 charitable requires actual cash-only distribution confirmation; property distributions need their source method');
    for (const key of ['distributions', 'nondeductibleExpenses', 'section179Deduction', 'otherDeductions', 'investmentInterestExpense'] as const) {
        if (!d(k1[key]).isFinite() || d(k1[key]).lt(0))
            throw new Error(`K1 charitable original ${key} must be finite and nonnegative`);
    }
    // This assertion establishes actual zero for absent original prior categories;
    // any supplied amount must still be valid and the charitable ledger must reconcile.
    for (const value of Object.values(k1.priorSuspendedLosses ?? {}))
        if (!d(value).isFinite() || d(value).lt(0))
            throw new Error('K1 charitable prior basis loss amounts must be finite and nonnegative');
    if (k1.entityType === 's_corporation') {
        for (const key of ['beginningDebtBasis', 'additionalLoansToScorp', 'priorDebtBasisReduction'] as const)
            amount(k1[key], `actual ${key}`);
    }
    else {
        if (k1.election1367 || ['beginningDebtBasis', 'additionalLoansToScorp', 'priorDebtBasisReduction'].some(key => !d(k1[key as keyof ScheduleK1] as string | undefined).isZero()))
            throw new Error('K1 charitable partnership sources cannot contain S-corporation debt or election facts');
    }
    if (!Array.isArray(s.currentContributions) || !Array.isArray(s.priorBasisSuspensions))
        throw new Error('K1 charitable requires explicit current and prior basis source lists, including none');
    const ids = new Set<string>(), records: K1CharitableBasisRecord[] = [];
    const addId = (value: string | undefined) => { const id = text(value, 'source identity'); if (ids.has(id))
        throw new Error('K1 charitable duplicate source identity'); ids.add(id); return id; };
    for (const row of s.currentContributions) {
        const sourceId = addId(row.sourceId);
        text(row.sourceReference, 'current attachment reference');
        const contributionDate = date(row.contributionDate, 'current contribution date');
        if (contributionDate < start || contributionDate > end)
            throw new Error('K1 charitable current contribution date must fall within the actual statement period');
        const c = contribution(row);
        records.push({ sourceId, originTaxYear: year, category: c.category, current: true, contributionShare: c.share,
            originalBasis: c.basis, basisPreviouslyAllowed: d(0), basisSubjectToLimit: c.basis, appreciationExempt: c.appreciation });
    }
    const originalFields = { cash_60: 'charitableCash', capital_gain_30: 'charitableCapitalGain30', capital_gain_20: 'charitableCapitalGain20' } as const;
    for (const category of Object.keys(originalFields) as K1CharitableCategory[]) {
        const actual = amount(k1[originalFields[category]], `original ${category} amount`);
        if (!sum(...records.filter(row => row.category === category).map(row => row.contributionShare)).eq(actual))
            throw new Error('K1 charitable current category values must reconcile exactly to original statement totals');
    }
    for (const row of s.priorBasisSuspensions) {
        const sourceId = addId(row.sourceId);
        text(row.sourceReference, 'original prior basis reference');
        const origin = row.originTaxYear;
        if (!Number.isInteger(origin) || origin === undefined || origin < 2018 || origin >= year)
            throw new Error('K1 charitable prior source requires its actual supported earlier origin year');
        const c = contribution(row);
        if (!amount(row.appreciationPreviouslyTakenIntoAccount, 'prior appreciation already accounted for').eq(c.appreciation))
            throw new Error('K1 charitable prior appreciation must reconcile once to its original source');
        if (!Array.isArray(row.basisUseHistory) || row.basisUseHistory.length !== year - origin)
            throw new Error('K1 charitable prior basis history must include every original through preceding year');
        const historyYears = new Set<number>();
        let used = d(0);
        for (const h of row.basisUseHistory) {
            if (!Number.isInteger(h.taxYear) || h.taxYear === undefined || h.taxYear < origin || h.taxYear >= year || historyYears.has(h.taxYear))
                throw new Error('K1 charitable basis history years must be actual unique consecutive years');
            historyYears.add(h.taxYear);
            used = used.plus(amount(h.basisAllowed, 'prior basis use'));
        }
        if (used.gt(c.basis))
            throw new Error('K1 charitable prior basis history exceeds original source basis');
        records.push({ sourceId, originTaxYear: origin, category: c.category, current: false, contributionShare: c.share,
            originalBasis: c.basis, basisPreviouslyAllowed: used, basisSubjectToLimit: c.basis.minus(used), appreciationExempt: d(0) });
    }
    const currentBasis = sum(...records.filter(row => row.current).map(row => row.basisSubjectToLimit));
    const priorBasis = sum(...records.filter(row => !row.current).map(row => row.basisSubjectToLimit));
    if (!priorBasis.eq(d(k1.priorSuspendedLosses?.charitable)))
        throw new Error('K1 charitable actual prior history must reconcile to the original aggregate basis suspension');
    const appreciationExempt = sum(...records.map(row => row.appreciationExempt)), audit = new AuditTrail();
    audit.record('K1 Charitable Basis', 'subject', 'Actual current and prior charitable basis subject to limitation', currentBasis.plus(priorBasis), 'Original allocated basis plus unreleased original basis history; excludes appreciation', { 'Current basis': currentBasis, 'Prior basis': priorBasis });
    audit.record('K1 Charitable Basis', 'appreciation', 'Current appreciation excluded from the basis limitation', appreciationExempt, 'IRC704(d)(3)(B) / 1366(d)(4); prior appreciation is never repeated');
    return { records, currentBasis, priorBasis, appreciationExempt, lines: audit.getLines() };
}
