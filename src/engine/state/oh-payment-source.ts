/** Spec: state/ohio-payments.yaml. Source projection, not a payment override. */
import Decimal from 'decimal.js';
import { calculateW2StateLocalSources } from '@/engine/forms/w2-state-local.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { TaxYearInput } from '@/models/inputs.js';
import { OhioPaymentFactsSchema, type OhioPaymentFacts } from '@/models/ohio-payments.js';
import type { EstimatedPaymentEntry } from './oh-it-sd-2210.js';
function stable(v: unknown): unknown { if (Decimal.isDecimal(v))
    return v.toString(); if (Array.isArray(v))
    return v.map(stable); if (v !== null && typeof v === 'object')
    return Object.fromEntries(Object.entries(v).filter(([, child]) => child !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, child]) => [k, stable(child)])); return v; }
function digest(v: unknown) { return bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(stable(v))))); }
function fail(message: string): never { throw new Error(`Ohio actual payment sources: ${message}`); }
function actualDate(value: string) { const d = new Date(value + 'T00:00:00Z'); if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value)
    fail('a real source date is required'); return value; }
function ssn(value: string) { const s = value.replace(/[\s-]/g, ''); if (!/^\d{9}$/.test(s))
    fail('actual private account SSN is required'); return s; }
function name(value: string) { return value.trim().replace(/\s+/g, ' ').toUpperCase(); }
export interface OhioPaymentSourceProjection {
    facts: OhioPaymentFacts;
    sourceDigest: string;
    methodVersion: 'ohio-it1040-calendar-endpoint-payment-sources-v1' | 'ohio-it1040-actual-dated-payment-sources-v1';
    /** Present only after complete actual dated source admission; never an override. */
    datedPayments?: ReadonlyArray<{ date: string; amount: Decimal }>;
    estimatedPayments: Decimal;
    estimatedPaymentSchedule: EstimatedPaymentEntry[];
    priorYearTaxLiability?: Decimal;
    priorYearTimelyFiled: boolean;
    useTax: Decimal;
    creditCarryforward: Decimal;
    donations: Decimal;
    latePaymentInterest: Decimal;
    valuationDate: string;
    asOfDate: string;
    timingKind: 'filed' | 'expected';
}
export function buildOhioPaymentSource(input: TaxYearInput, raw: unknown): OhioPaymentSourceProjection {
    const parsed = OhioPaymentFactsSchema.safeParse(raw);
    if (!parsed.success)
        fail('complete confirmed actual payment records are required');
    const facts = parsed.data;
    if (facts.taxYear !== 2025 || input.taxpayer.taxYear !== facts.taxYear)
        fail('the actual year payment method is unavailable');
    const { ohioResidency: _r, ohioPayments: _p, ...original } = input as TaxYearInput & {
        ohioResidency?: unknown;
        ohioPayments?: unknown;
    };
    if (digest(original) !== digest(facts.originalFederalSources))
        fail('current original federal snapshot differs');
    const timing = facts.currentTiming;
    const asOf = actualDate(timing.asOfDate);
    const valued = actualDate(timing.kind === 'filed' ? timing.filedDate : timing.expectedDate);
    if (timing.kind === 'filed' ? valued > asOf : valued < asOf)
        fail('filed/expected timing contradicts its as-of date');
    if (valued < '2026-01-01' || valued > '2026-04-15')
        fail('actual late or early-year timing needs its separate method');
    const owners = new Map<'primary' | 'spouse', {
        firstName: string;
        lastName: string;
        ssn: string;
    }>([['primary', input.taxpayer.primary]]);
    if (input.taxpayer.filingStatus === 'married_filing_jointly') {
        if (!input.taxpayer.spouse)
            fail('actual spouse original is missing');
        owners.set('spouse', input.taxpayer.spouse);
    }
    // Unknown actual Ohio withholding cannot become zero in the complete flow.
    const statementGroups: Array<[
        unknown[] | undefined,
        string
    ]> = [
        [input.w2s, 'stateTaxWithheld'], [input.formW2G, 'stateWithheld'], [input.form1099G, 'stateWithheld'], [input.form1099K, 'stateWithheld'], [input.form1099R, 'stateWithheld'], [input.form1099Nec, 'stateWithheld'], [input.form1099Misc, 'stateWithheld'], [input.form1099Int, 'stateWithheld'], [input.form1099Div, 'stateWithheld'], [input.form1099B, 'stateWithheld'], [input.form1099OID, 'stateWithheld'],
    ];
    for (const [statements, field] of statementGroups)
        for (const [index, statement] of (statements ?? []).entries()) {
            const row = statement as Record<string, unknown>;
            if (row.taxYear !== facts.taxYear || typeof row.accountHolder !== 'string' || !owners.has(row.accountHolder as 'primary' | 'spouse'))
                fail('actual Ohio statement owner/year/withholding is missing');
            // A complete current canonical W2 packet supplies actual Box17
            // evidence even when its explicitly unused legacy scalar is absent.
            // Validate the full original, never substitute a fabricated OH zero.
            const packet = field === 'stateTaxWithheld' ? row.stateLocalSources : undefined;
            if (packet !== undefined) {
                calculateW2StateLocalSources(input, index, packet);
                continue;
            }
            if (row[field] === undefined)
                fail('actual Ohio statement owner/year/withholding is missing');
            const actual = new Decimal(String(row[field]));
            if (!actual.isFinite() || actual.isNegative())
                fail('actual Ohio statement withholding is invalid');
            if (!actual.isZero() && (typeof row.state !== 'string' || !/^[A-Z]{2}$/.test(row.state.trim().toUpperCase())))
                fail('actual state for nonzero statement withholding is missing');
        }
    const payoff = facts.remainingTaxPayment;
    const endpointDates = ['2025-04-15', '2025-06-16', '2025-09-15', '2026-01-15'];
    const dated = facts.paymentRows.some(row => !new Decimal(row.amount).isZero() && !endpointDates.includes(row.date))
        || payoff.status === 'actual_payment' && payoff.date !== '2026-04-15';
    if (dated && payoff.status === 'expected_payment')
        fail('actual dated interval payment method requires actual settlement evidence, not an expected payment');
    if (payoff.status !== 'no_remaining_tax') {
        const paid = actualDate(payoff.date);
        if (paid < '2025-01-01' || paid > '2026-04-15' || paid !== '2026-04-15' && !dated)
            fail('actual dated interval payment method is required');
        if (payoff.status === 'expected_payment') {
            if (paid < asOf)
                fail('expected remaining-tax payment precedes as-of date');
        }
        else {
            const person = owners.get(payoff.accountHolder);
            const receipt = payoff.original;
            if (!person || paid > asOf || actualDate(receipt.date) !== paid || receipt.taxYear !== facts.taxYear || ssn(receipt.accountSsn) !== ssn(person.ssn) || name(receipt.accountName) !== name(person.firstName + ' ' + person.lastName) || new Decimal(receipt.amount).lt(payoff.amountAppliedToTax))
                fail('actual remaining-tax payment original contradicts current account facts');
        }
    }
    const schedule: Array<{ date: string; amount: Decimal }> = [];
    const ids = new Set<string>();
    const originals = new Set<string>();
    const actualConfirmations = new Set<string>();
    const confirmationKey = (accountSsn: string, confirmation: string) => ssn(accountSsn) + ':' + confirmation.trim().toUpperCase();
    if (dated && payoff.status === 'actual_payment') actualConfirmations.add(confirmationKey(payoff.original.accountSsn, payoff.original.confirmationNumber));
    for (const row of facts.paymentRows) {
        const person = owners.get(row.accountHolder);
        if (!person)
            fail('actual payment owner is not on this return');
        const receipt = row.original;
        if (ssn(receipt.accountSsn) !== ssn(person.ssn) || name(receipt.accountName) !== name(person.firstName + ' ' + person.lastName))
            fail('actual payment account identity differs');
        if (row.taxYear !== facts.taxYear || receipt.taxYear !== facts.taxYear || row.date !== receipt.date || row.kind !== receipt.kind || row.returnType !== receipt.returnType || !new Decimal(row.amount).eq(receipt.amount))
            fail('actual original payment receipt contradicts current row');
        const paid = actualDate(row.date);
        if (!new Decimal(row.amount).isZero() && !endpointDates.includes(paid) && !dated)
            fail('actual dated interval payment method is required');
        if (paid > asOf || paid < '2025-01-01' || dated && paid > '2026-04-15')
            fail('actual payment date is outside known current account records');
        const confirmation = confirmationKey(receipt.accountSsn, receipt.confirmationNumber);
        if (dated && actualConfirmations.has(confirmation)) fail('duplicate actual payment receipt confirmation across current account records');
        if (dated) actualConfirmations.add(confirmation);
        const semantic = digest({ ...receipt, accountName: name(receipt.accountName), accountSsn: ssn(receipt.accountSsn), amount: new Decimal(receipt.amount).toString() });
        if (ids.has(row.sourceId) || originals.has(semantic))
            fail('duplicate payment originals');
        ids.add(row.sourceId);
        originals.add(semantic);
        schedule.push({ date: paid, amount: new Decimal(row.amount) });
    }
    let priorLiability: Decimal | undefined;
    let timely = false;
    const prior = facts.priorReturn;
    if (prior.status === 'filed_return') {
        if (prior.taxYear !== 2024 || prior.periodStart !== '2024-01-01' || prior.periodEnd !== '2024-12-31' || prior.filingStatus !== input.taxpayer.filingStatus || prior.owners.length !== owners.size)
            fail('actual prior twelve-month current-owner original return is required');
        const priorOwners = new Set<string>();
        for (const owner of prior.owners) {
            const person = owners.get(owner.accountHolder);
            if (!person || priorOwners.has(owner.accountHolder) || ssn(owner.ssn) !== ssn(person.ssn) || name(owner.name) !== name(person.firstName + ' ' + person.lastName))
                fail('actual prior owner identity differs');
            priorOwners.add(owner.accountHolder);
        }
        const filed = actualDate(prior.filedDate);
        if (filed < '2025-01-01' || filed > asOf)
            fail('actual prior filing date differs from current records');
        timely = filed <= '2025-04-15';
        if (!timely)
            fail('late-filed prior twelve-month source treatment requires separate qualification');
        priorLiability = new Decimal(prior.line10).minus(prior.line16);
    }
    const carry = facts.priorCreditCarryforward;
    if (carry.status === 'actual_credit') {
        const person = owners.get(carry.accountHolder);
        if (prior.status !== 'filed_return' || !timely || !person || ssn(carry.accountSsn) !== ssn(person.ssn) || !new Decimal(carry.electedAmount).eq(prior.electedCreditCarryforward) || new Decimal(carry.availableForThisReturn).gt(carry.electedAmount))
            fail('actual available prior original-return carryforward does not reconcile');
        schedule.push({ date: '2025-04-15', amount: new Decimal(carry.availableForThisReturn) });
    }
    else if (prior.status === 'filed_return' && !new Decimal(prior.electedCreditCarryforward).isZero())
        fail('actual prior elected carryforward availability is unknown');
    const estimated = schedule.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
    const datedPayments = dated ? [...schedule, ...(payoff.status === 'actual_payment' ? [{ date: payoff.date, amount: new Decimal(payoff.amountAppliedToTax) }] : [])] : undefined;
    return { facts, sourceDigest: digest({ original: input, facts }), methodVersion: dated ? 'ohio-it1040-actual-dated-payment-sources-v1' : 'ohio-it1040-calendar-endpoint-payment-sources-v1', datedPayments, estimatedPayments: estimated, estimatedPaymentSchedule: schedule, priorYearTaxLiability: priorLiability, priorYearTimelyFiled: timely, useTax: new Decimal(facts.balanceFacts.useTax), creditCarryforward: new Decimal(facts.balanceFacts.outgoingCarryforward), donations: new Decimal(facts.balanceFacts.donations), latePaymentInterest: new Decimal(0), valuationDate: valued, asOfDate: asOf, timingKind: timing.kind };
}
