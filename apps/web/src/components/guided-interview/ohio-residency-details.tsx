'use client';
import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import { ohioNrcCategories, type OhioNrcCategory } from '@/models/ohio-residency';
import { emptyOhioResidencyDraft, emptyOhioResidencyOwner, confirmGuidedOhioResidencyFacts, guidedOhioUnemploymentStatement, hasCurrentGuidedOhioUnemploymentEvidence, type OhioResidencyDraft, type OhioUnemploymentPaymentDraft } from '@/lib/guided-ohio-residency-facts';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';

type Owner = OhioResidencyDraft['owners'][number];
const categoryLabels: Record<OhioNrcCategory, string> = {
    wages: 'Wages and compensation', capitalGains: 'Nonbusiness capital gains and losses',
    rentsRoyalties: 'Nonbusiness rents and royalties', gambling: 'Gambling income',
    interestDividends: 'Interest and dividends', pensions: 'Pensions and IRA distributions',
    unemployment: 'Unemployment', otherIncome: 'Other nonbusiness income',
    federalAdjustments: 'Federal adjustments to income',
};
const amountFields = [
    ['federalAmount', 'Full federal source amount'],
    ['residentAmount', 'Amount received while an Ohio resident'],
    ['nonresidentOhioAmount', 'Ohio-source amount while a nonresident'],
] as const;
function currentOwner(data: OhioResidencyDraft, key: Owner['accountHolder']): Owner {
    const owner = data.owners.find(row => row.accountHolder === key);
    if (!owner) throw new Error('The current owner source row was removed.');
    return owner;
}
function currentAmounts(owner: Owner): NonNullable<Owner['amounts']> {
    if (!owner.amounts) throw new Error('The actual allocation source rows are missing.');
    return owner.amounts;
}
export function OhioResidencyDetails({ data, onChange, filingStatus, taxYear, originalInput }: {
    originalInput?: TaxYearInput | null;
    data: OhioResidencyDraft | undefined;
    onChange: (data: OhioResidencyDraft | undefined) => void;
    filingStatus: string | null | undefined;
    taxYear: number | null | undefined;
}) {
    const [confirmationError, setConfirmationError] = useState<string | null>(null);
    function edit(change: (copy: OhioResidencyDraft) => void) {
        const copy = structuredClone(data ?? emptyOhioResidencyDraft);
        change(copy);
        copy.sourceFactsConfirmed = null;
        setConfirmationError(null);
        onChange(copy);
    }
    function editOwner(key: Owner['accountHolder'], change: (owner: Owner) => void) {
        edit(copy => change(currentOwner(copy, key)));
    }
    function editPeriod(key: Owner['accountHolder'], index: number, field: keyof Owner['periods'][number], value: string) {
        editOwner(key, owner => {
            const period = owner.periods[index];
            if (!period) throw new Error('The current domicile period was removed.');
            period[field] = value;
        });
    }
    const owners = filingStatus === 'married_filing_jointly' ? ['primary', 'spouse'] as const : ['primary'] as const;
    const needsAmounts = Boolean(data?.owners.some(owner => owner.status !== 'full_year_resident'));
    const unemployment = taxYear === 2025 && data?.schoolDistrictStatus === 'no_ohio_taxing_district_residency'
        && !data.businessSources && !data.residentCreditSources ? guidedOhioUnemploymentStatement(originalInput) : undefined;
    const payment = unemployment && data?.unemploymentPaymentSource?.originalStatementFingerprint === unemployment.fingerprint
        ? data.unemploymentPaymentSource : undefined;
    const confirmed = data?.sourceFactsConfirmed === true && hasCurrentGuidedOhioUnemploymentEvidence(data, originalInput);
    function editUnemployment(change: Partial<OhioUnemploymentPaymentDraft>) {
        if (!unemployment) return;
        edit(copy => {
            copy.unemploymentPaymentSource = {
                ...(payment ?? { sourceReference: '', paidOrAccruedOn: '', amount: '' }),
                allPaymentsIncludedConfirmed: null,
                ...change,
                originalStatementFingerprint: unemployment.fingerprint,
            };
        });
    }
    return <div className="guided-card">
        <h3 className="guided-card-title">Ohio domicile and income sources</h3>
        <p className="guided-hint">Use actual domicile records and income allocation worksheets for each owner. A mailing address does not establish residency. Enter actual zero amounts explicitly. Business, district tax and other specialized sources require their separate worksheets. These records apply to {taxYear ?? 'the selected year'}.</p>
        {!data ? <button type="button" className="utility-button" onClick={() => onChange(structuredClone(emptyOhioResidencyDraft))}>Add Ohio residency source facts</button> : <>
            <TextFact label="Ohio residency source year" value={data.taxYear} onChange={value => edit(copy => { copy.taxYear = value; })} />
            <TextFact label="Ohio residency source reference" value={data.sourceReference} onChange={value => edit(copy => { copy.sourceReference = value; })} />
            <label className="guided-field">
                <span className="guided-field-label">Ohio school district residency source status</span>
                <select className="guided-input" value={data.schoolDistrictStatus} onChange={event => edit(copy => { copy.schoolDistrictStatus = event.target.value as OhioResidencyDraft['schoolDistrictStatus']; })}>
                    <option value="">Choose actual source status</option>
                    <option value="no_ohio_taxing_district_residency">No residence in an Ohio taxing school district</option>
                    <option value="actual_district_sources_required">Actual taxing district sources require reconciliation</option>
                </select>
            </label>
            {owners.map(key => {
                const owner = data.owners.find(row => row.accountHolder === key);
                if (!owner) return <button key={key} type="button" className="utility-button" onClick={() => edit(copy => { copy.owners.push(emptyOhioResidencyOwner(key)); })}>Add {key} owner domicile source</button>;
                const amounts = owner.amounts;
                return <fieldset key={key}>
                    <legend>{key} owner actual sources</legend>
                    <TextFact label={`${key} domicile source reference`} value={owner.sourceReference} onChange={value => editOwner(key, row => { row.sourceReference = value; })} />
                    <label className="guided-field">
                        <span className="guided-field-label">{key} actual Ohio residency status</span>
                        <select className="guided-input" value={owner.status} onChange={event => edit(copy => {
                            const status = event.target.value as Owner['status'];
                            currentOwner(copy, key).status = status;
                            if (key === 'primary' && status !== 'part_year_resident') delete copy.unemploymentPaymentSource;
                        })}>
                            <option value="">Choose actual source status</option>
                            <option value="full_year_resident">Full-year resident</option>
                            <option value="part_year_resident">Part-year resident</option>
                            <option value="nonresident">Nonresident</option>
                        </select>
                    </label>
                    {owner.periods.map((period, index) => <div key={index}>
                        <TextFact label={`${key} domicile period ${index + 1} begins`} value={period.from} onChange={value => editPeriod(key, index, 'from', value)} />
                        <TextFact label={`${key} domicile period ${index + 1} ends`} value={period.to} onChange={value => editPeriod(key, index, 'to', value)} />
                        <TextFact label={`${key} domicile period ${index + 1} state`} value={period.domicileState} onChange={value => editPeriod(key, index, 'domicileState', value)} />
                        <button type="button" className="utility-button" onClick={() => editOwner(key, row => { row.periods.splice(index, 1); })}>Remove {key} domicile period {index + 1}</button>
                    </div>)}
                    <button type="button" className="utility-button" onClick={() => editOwner(key, row => { row.periods.push({ from: '', to: '', domicileState: '' }); })}>Add {key} domicile period</button>
                    {needsAmounts && amounts && ohioNrcCategories.map(category => <fieldset key={category}>
                        <legend>{key}: {categoryLabels[category]}</legend>
                        {category === 'unemployment' && key === 'primary' && unemployment && (owner.status === 'part_year_resident' || owner.status === 'nonresident') ? <>
                            <p className="guided-hint">Verified Form 1099-G Box 1: ${unemployment.amount}</p>
                            {owner.status === 'part_year_resident' && <>
                                <TextFact label="Unemployment payment record reference" value={payment?.sourceReference ?? ''} onChange={sourceReference => editUnemployment({ sourceReference })} />
                                <TextFact label="Unemployment payment or accrual date" type="date" value={payment?.paidOrAccruedOn ?? ''} onChange={paidOrAccruedOn => editUnemployment({ paidOrAccruedOn })} />
                                <CurrencyField label="Actual unemployment payment amount" value={payment?.amount ?? ''} onChange={amount => editUnemployment({ amount })} />
                                <BooleanFact label="Does this one payment account for all of Form 1099-G Box 1?" value={payment?.allPaymentsIncludedConfirmed} onChange={allPaymentsIncludedConfirmed => editUnemployment({ allPaymentsIncludedConfirmed })} />
                            </>}
                        </> : <>
                            <TextFact label={`${key} ${categoryLabels[category]} original source reference`} value={amounts[category].sourceReference} onChange={value => editOwner(key, row => { currentAmounts(row)[category].sourceReference = value; })} />
                            {amountFields.map(([field, label]) => <CurrencyField key={field} allowNegative={['capitalGains','rentsRoyalties','otherIncome'].includes(category)} label={`${key} ${categoryLabels[category]}: ${label}`} value={amounts[category][field]} onChange={value => editOwner(key, row => { currentAmounts(row)[category][field] = value; })} />)}
                        </>}
                    </fieldset>)}
                    <button type="button" className="utility-button" onClick={() => edit(copy => {
                        copy.owners = copy.owners.filter(row => row.accountHolder !== key);
                        if (key === 'primary') delete copy.unemploymentPaymentSource;
                    })}>Remove {key} owner domicile source</button>
                </fieldset>;
            })}
            {data.unemploymentPaymentSource && !unemployment && <button type="button" className="utility-button" onClick={() => edit(copy => { delete copy.unemploymentPaymentSource; })}>Remove unemployment payment evidence</button>}
            {(needsAmounts || data.schoolDistrictStatus === 'actual_district_sources_required') && <>
                <BooleanFact label="All actual federal income and adjustment sources included" value={data.allFederalSourcesIncludedConfirmed} onChange={value => edit(copy => { copy.allFederalSourcesIncludedConfirmed = value; })} />
                <BooleanFact label="Actual sources contain no business income requiring Ohio apportionment" value={data.noBusinessIncomeConfirmed} onChange={value => edit(copy => { copy.noBusinessIncomeConfirmed = value; })} />
            </>}
            <p role="status">{confirmed ? 'Ohio residency sources explicitly confirmed.' : 'Ohio residency sources need explicit confirmation.'}</p>
            <button type="button" className="utility-button" disabled={!originalInput} onClick={() => {
                if (!originalInput) return;
                try { const confirmed = confirmGuidedOhioResidencyFacts(originalInput, data); setConfirmationError(null); onChange(confirmed); }
                catch (error) { setConfirmationError(error instanceof Error ? error.message : 'Complete and reconcile actual Ohio residency sources.'); }
            }}>Confirm actual Ohio residency sources</button>
            {confirmationError && <p role="alert">{confirmationError}</p>}
            <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Ohio residency source facts</button>
        </>}
    </div>;
}
