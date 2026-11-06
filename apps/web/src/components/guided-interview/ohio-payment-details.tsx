'use client';
import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import { emptyOhioPaymentDraft, emptyOhioPaymentRow, emptyOhioPriorOwner, confirmGuidedOhioPaymentFacts, type OhioPaymentDraft } from '@/lib/guided-ohio-payment-facts';
import { BooleanFact, TextFact } from './fact-fields';
type Path = Array<string | number>;
function read(value: unknown, path: Path): unknown {
    let current = value;
    for (const key of path) {
        if (current === null || typeof current !== 'object')
            return undefined;
        current = (current as Record<string | number, unknown>)[key];
    }
    return current;
}
function write(value: OhioPaymentDraft, path: Path, next: unknown) {
    let current = value as unknown as Record<string | number, unknown>;
    for (const key of path.slice(0, -1)) {
        const existing = current[key];
        if (existing === null || typeof existing !== 'object')
            current[key] = {};
        current = current[key] as Record<string | number, unknown>;
    }
    const key = path.at(-1);
    if (key === undefined)
        throw new Error('A current source field is required.');
    current[key] = next;
}
export function OhioPaymentDetails({ data, onChange, taxYear, originalInput }: {
    originalInput?: TaxYearInput | null;
    data: OhioPaymentDraft | undefined;
    onChange: (data: OhioPaymentDraft) => void;
    taxYear: number | null | undefined;
}) {
    const current = data ?? emptyOhioPaymentDraft;
    const [confirmationError, setConfirmationError] = useState<string | null>(null);
    function update(path: Path, value: unknown) {
        const copy = structuredClone(current);
        write(copy, path, value);
        copy.sourceFactsConfirmed = false;
        setConfirmationError(null);
        onChange(copy);
    }
    function text(label: string, path: Path, type: 'text' | 'date' = 'text') {
        const value = read(current, path);
        return <TextFact key={path.join('.')} label={label} value={value == null ? '' : String(value)} type={type} onChange={value => update(path, value)}/>;
    }
    function choice(label: string, path: Path, options: Array<[
        string,
        string
    ]>) {
        const value = read(current, path);
        return <label key={path.join('.')} className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={event => update(path, event.target.value)}><option value="">Select from actual records</option>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>;
    }
    function confirmed(label: string, path: Path) {
        const value = read(current, path);
        return <BooleanFact key={path.join('.')} label={label} value={typeof value === 'boolean' ? value : null} onChange={value => update(path, value)}/>;
    }
    const rows = Array.isArray(current.paymentRows) ? current.paymentRows : [];
    const priorOwners = read(current, ['priorReturn', 'owners']);
    const owners = Array.isArray(priorOwners) ? priorOwners : [];
    const ownerOptions: Array<[
        string,
        string
    ]> = [['primary', 'Primary taxpayer'], ['spouse', 'Spouse']];
    const paymentKinds: Array<[
        string,
        string
    ]> = [['estimated', 'Estimated payment'], ['extension', 'Extension payment']];
    function receipt(path: Path, balance = false) {
        return <div className="grid gap-3 md:grid-cols-2">
      {text('Original account holder name', [...path, 'accountName'])}
      {text('Original account SSN', [...path, 'accountSsn'])}
      {text('Original payment tax year', [...path, 'taxYear'])}
      {choice('Original payment return type', [...path, 'returnType'], [['it1040', 'Ohio individual income tax (IT 1040)']])}
      {choice('Original payment type', [...path, 'kind'], balance ? [['balance', 'Payment of remaining tax']] : paymentKinds)}
      {text('Original payment date', [...path, 'date'], 'date')}
      {text('Original payment amount', [...path, 'amount'])}
      {text('Original payment confirmation number', [...path, 'confirmationNumber'])}
    </div>;
    }
    return <section className="space-y-5" aria-label="Ohio actual payment sources">
    <h3 className="font-semibold">Ohio payments and prior return</h3>
    <p>Use the account records, original payment receipts and prior return. Leave an answer blank when it is not known. Filing a return does not establish when its tax was paid.</p>
    {taxYear !== 2025 && <p role="status">This ordinary payment source calculation currently supports 2025. Other years require their own current sources.</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {text('Ohio payment source year', ['taxYear'])}
      {text('Ohio payment records source reference', ['sourceReference'])}
      {confirmed('These records cover the complete calendar tax year', ['calendarYearConfirmed'])}
      {confirmed('All payments and account credits are included', ['allPaymentsIncludedConfirmed'])}
      {choice('Current return is original or amended', ['returnKind'], [['original', 'Original return'], ['amended', 'Amended return']])}
      {choice('Current filing extension records', ['filingExtension', 'kind'], [['none', 'No filing extension'], ['reported', 'An extension applies']])}
      {choice('Current payment extension records', ['paymentExtension', 'kind'], [['none', 'No payment extension'], ['reported', 'An extension applies']])}
      {choice('Farming or fishing income in these actual records', ['specialFacts', 'farmingFishingIncome'], [['known_none', 'No farming or fishing income'], ['reported', 'Farming or fishing income is present']])}
      {choice('Military or disaster relief affecting these tax payments', ['specialFacts', 'militaryDisasterRelief'], [['known_none', 'No such relief applies'], ['reported', 'Such relief applies']])}
    </div>
    <fieldset className="space-y-3"><legend className="font-medium">Actual estimated and extension payment receipts</legend>
      <p>Enter each original once. An empty list establishes no payments only after complete account coverage is confirmed.</p>
      {rows.map((_, index) => <fieldset key={index} className="space-y-3 rounded border p-3"><legend>Payment receipt {index + 1}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {text('Current receipt record ID', ['paymentRows', index, 'sourceId'])}
          {text('Current receipt source reference', ['paymentRows', index, 'sourceReference'])}
          {choice('Current payment owner', ['paymentRows', index, 'accountHolder'], ownerOptions)}
          {text('Current payment tax year', ['paymentRows', index, 'taxYear'])}
          {choice('Current payment return type', ['paymentRows', index, 'returnType'], [['it1040', 'Ohio individual income tax (IT 1040)']])}
          {choice('Current payment type', ['paymentRows', index, 'kind'], paymentKinds)}
          {text('Current payment date', ['paymentRows', index, 'date'], 'date')}
          {text('Current payment amount', ['paymentRows', index, 'amount'])}
          {confirmed('This actual payment belongs to this return', ['paymentRows', index, 'appliedToThisReturnConfirmed'])}
        </div>
        {receipt(['paymentRows', index, 'original'])}
        <button type="button" onClick={() => update(['paymentRows'], rows.filter((_, row) => row !== index))}>Remove payment receipt {index + 1}</button>
      </fieldset>)}
      <button type="button" onClick={() => update(['paymentRows'], [...rows, emptyOhioPaymentRow()])}>Add actual Ohio payment receipt</button>
    </fieldset>
    <fieldset className="space-y-3"><legend className="font-medium">Prior Ohio original return</legend>
      {choice('Prior-year Ohio return history', ['priorReturn', 'status'], [['no_return', 'No Ohio return was filed'], ['filed_return', 'An Ohio return was filed']])}
      {text('Prior return history source reference', ['priorReturn', 'sourceReference'])}
      {read(current, ['priorReturn', 'status']) === 'filed_return' && <>
        <div className="grid gap-3 md:grid-cols-2">
          {text('Prior return tax year', ['priorReturn', 'taxYear'])}
          {choice('Prior return type', ['priorReturn', 'returnType'], [['it1040', 'Ohio individual income tax (IT 1040)']])}
          {text('Prior tax period starts', ['priorReturn', 'periodStart'], 'date')}
          {text('Prior tax period ends', ['priorReturn', 'periodEnd'], 'date')}
          {choice('Prior return filing status', ['priorReturn', 'filingStatus'], [['single', 'Single'], ['married_filing_jointly', 'Married filing jointly'], ['married_filing_separately', 'Married filing separately'], ['head_of_household', 'Head of household'], ['qualifying_surviving_spouse', 'Qualifying surviving spouse']])}
          {choice('Prior return is original or amended', ['priorReturn', 'returnKind'], [['original', 'Original return'], ['amended', 'Amended return']])}
          {text('Actual prior return filed date', ['priorReturn', 'filedDate'], 'date')}
          {choice('Prior filing extension records', ['priorReturn', 'filingExtension', 'kind'], [['none', 'No filing extension'], ['reported', 'An extension applies']])}
          {text('Prior IT 1040 line 10', ['priorReturn', 'line10'])}
          {text('Prior IT 1040 line 16', ['priorReturn', 'line16'])}
          {text('Actual prior credit elected for this year', ['priorReturn', 'electedCreditCarryforward'])}
        </div>
        {owners.map((_, index) => <fieldset key={index} className="space-y-3 rounded border p-3"><legend>Prior owner record {index + 1}</legend>{choice('Prior record owner', ['priorReturn', 'owners', index, 'accountHolder'], ownerOptions)}{text('Actual prior owner name', ['priorReturn', 'owners', index, 'name'])}{text('Actual prior owner SSN', ['priorReturn', 'owners', index, 'ssn'])}<button type="button" onClick={() => update(['priorReturn', 'owners'], owners.filter((_, row) => row !== index))}>Remove prior owner record {index + 1}</button></fieldset>)}
        <button type="button" onClick={() => update(['priorReturn', 'owners'], [...owners, emptyOhioPriorOwner()])}>Add actual prior owner record</button>
      </>}
    </fieldset>
    <fieldset className="space-y-3"><legend className="font-medium">Prior credit available on this account</legend>
      {choice('Prior credit carryforward account records', ['priorCreditCarryforward', 'status'], [['none', 'No prior credit carryforward'], ['actual_credit', 'Actual prior credit carryforward']])}
      {text('Prior credit account source reference', ['priorCreditCarryforward', 'sourceReference'])}
      {read(current, ['priorCreditCarryforward', 'status']) === 'actual_credit' && <div className="grid gap-3 md:grid-cols-2">
        {text('Original elected credit amount', ['priorCreditCarryforward', 'electedAmount'])}
        {text('Actual credit available for this return', ['priorCreditCarryforward', 'availableForThisReturn'])}
        {choice('Actual credit account owner', ['priorCreditCarryforward', 'accountHolder'], ownerOptions)}
        {text('Actual credit account SSN', ['priorCreditCarryforward', 'accountSsn'])}
        {confirmed('This available credit belongs to this return', ['priorCreditCarryforward', 'appliedToThisReturnConfirmed'])}
      </div>}
    </fieldset>
    <fieldset className="space-y-3"><legend className="font-medium">Return filing timing</legend>
      {text('Records as-of date', ['currentTiming', 'asOfDate'], 'date')}
      {choice('Current return filing timing', ['currentTiming', 'kind'], [['filed', 'Already filed'], ['expected', 'Expected filing']])}
      {read(current, ['currentTiming', 'kind']) === 'filed' ? text('Actual current return filed date', ['currentTiming', 'filedDate'], 'date') : read(current, ['currentTiming', 'kind']) === 'expected' ? text('Expected current return filing date', ['currentTiming', 'expectedDate'], 'date') : null}
    </fieldset>
    <fieldset className="space-y-3"><legend className="font-medium">Payment of remaining tax</legend>
      {choice('Remaining-tax payment records', ['remainingTaxPayment', 'status'], [['no_remaining_tax', 'Actual records establish no remaining tax'], ['expected_payment', 'Payment is expected'], ['actual_payment', 'Payment was made']])}
      {text('Remaining-tax payment source reference', ['remainingTaxPayment', 'sourceReference'])}
      {read(current, ['remainingTaxPayment', 'status']) !== '' && read(current, ['remainingTaxPayment', 'status']) !== 'no_remaining_tax' && <div className="grid gap-3 md:grid-cols-2">{text('Remaining-tax payment date', ['remainingTaxPayment', 'date'], 'date')}{text('Amount applied to remaining tax', ['remainingTaxPayment', 'amountAppliedToTax'])}</div>}
      {read(current, ['remainingTaxPayment', 'status']) === 'actual_payment' && <>{choice('Actual remaining-tax account owner', ['remainingTaxPayment', 'accountHolder'], ownerOptions)}{receipt(['remainingTaxPayment', 'original'], true)}</>}
      {confirmed('These remaining-tax payment facts match current records', ['remainingTaxPayment', 'sourceFactsConfirmed'])}
    </fieldset>
    <fieldset className="space-y-3"><legend className="font-medium">Use tax and refund elections</legend><div className="grid gap-3 md:grid-cols-2">
      {text('Use-tax and refund-election source reference', ['balanceFacts', 'sourceReference'])}
      {text('Actual use tax', ['balanceFacts', 'useTax'])}
      {text('Actual outgoing credit carryforward election', ['balanceFacts', 'outgoingCarryforward'])}
      {text('Actual donation election', ['balanceFacts', 'donations'])}
    </div></fieldset>
    <p role="status">{current.sourceFactsConfirmed === true ? 'Ohio payment sources explicitly confirmed.' : 'Ohio payment sources need explicit confirmation.'}</p>
    <button type="button" disabled={!originalInput} onClick={() => {
      if (!originalInput) return;
      try { const confirmed = confirmGuidedOhioPaymentFacts(originalInput, current); setConfirmationError(null); onChange(confirmed); }
      catch (error) { setConfirmationError(error instanceof Error ? error.message : 'Complete and reconcile actual Ohio payment sources.'); }
    }}>Confirm actual Ohio payment sources</button>
    {confirmationError && <p role="alert">{confirmationError}</p>}
  </section>;
}
