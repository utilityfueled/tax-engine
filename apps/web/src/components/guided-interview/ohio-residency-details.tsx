'use client';
import { ohioNrcCategories, type OhioNrcCategory } from '@/models/ohio-residency';
import { emptyOhioResidencyDraft, emptyOhioResidencyOwner, type OhioResidencyDraft } from '@/lib/guided-ohio-residency-facts';
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
export function OhioResidencyDetails({ data, onChange, filingStatus, taxYear }: {
    data: OhioResidencyDraft | undefined;
    onChange: (data: OhioResidencyDraft | undefined) => void;
    filingStatus: string | null | undefined;
    taxYear: number | null | undefined;
}) {
    function edit(change: (copy: OhioResidencyDraft) => void, confirmation = false) {
        const copy = structuredClone(data ?? emptyOhioResidencyDraft);
        change(copy);
        if (!confirmation) copy.sourceFactsConfirmed = null;
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
                        <select className="guided-input" value={owner.status} onChange={event => editOwner(key, row => { row.status = event.target.value as Owner['status']; })}>
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
                        <TextFact label={`${key} ${categoryLabels[category]} original source reference`} value={amounts[category].sourceReference} onChange={value => editOwner(key, row => { currentAmounts(row)[category].sourceReference = value; })} />
                        {amountFields.map(([field, label]) => <CurrencyField key={field} allowNegative={['capitalGains','rentsRoyalties','otherIncome'].includes(category)} label={`${key} ${categoryLabels[category]}: ${label}`} value={amounts[category][field]} onChange={value => editOwner(key, row => { currentAmounts(row)[category][field] = value; })} />)}
                    </fieldset>)}
                    <button type="button" className="utility-button" onClick={() => edit(copy => { copy.owners = copy.owners.filter(row => row.accountHolder !== key); })}>Remove {key} owner domicile source</button>
                </fieldset>;
            })}
            {needsAmounts && <>
                <BooleanFact label="All actual federal income and adjustment sources included" value={data.allFederalSourcesIncludedConfirmed} onChange={value => edit(copy => { copy.allFederalSourcesIncludedConfirmed = value; })} />
                <BooleanFact label="Actual sources contain no business income requiring Ohio apportionment" value={data.noBusinessIncomeConfirmed} onChange={value => edit(copy => { copy.noBusinessIncomeConfirmed = value; })} />
            </>}
            <BooleanFact label="Ohio residency sources checked after the last edit" value={data.sourceFactsConfirmed} onChange={value => edit(copy => { copy.sourceFactsConfirmed = value; }, true)} />
            <button type="button" className="utility-button" onClick={() => onChange(undefined)}>Remove Ohio residency source facts</button>
        </>}
    </div>;
}
