"use client";
/** Spec: state/oh-return-header-sources.yaml. Local actual documents; no automatic source capture. */
import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import { OHIO_HEADER_2025_BOOKLET_SHA256 } from '@/models/ohio-return-header-sources';
import type { OhioResidencyDraft } from '@/lib/guided-ohio-residency-facts';
import type { OhioPaymentDraft } from '@/lib/guided-ohio-payment-facts';
import type { OhioSchoolDistrictDraft } from '@/lib/guided-ohio-school-district-facts';
import { confirmGuidedOhioReturnHeaderSources, emptyOhioReturnHeaderDraft, emptyOhioHeaderResidencePeriod, type OhioReturnHeaderDraft } from '@/lib/guided-ohio-return-header-sources';
import { BooleanFact, TextFact } from './fact-fields';
import { editOhioSourceDraft, type OhioSourceDraftPath } from './ohio-source-draft-edit';

type Draft = OhioReturnHeaderDraft;
type Address = Draft['residence']['originalAddress'];
type AddressKey = 'residence' | 'finderOriginal' | 'countyOriginal';
const addressLabels: Record<AddressKey, readonly [string, string, string, string, string]> = {
    residence: ['Actual residential street', 'Actual residential city', 'Actual residential state', 'Actual residential ZIP', 'Actual residential apartment'],
    finderOriginal: ['Finder queried residential street', 'Finder queried residential city', 'Finder queried residential state', 'Finder queried residential ZIP', 'Finder queried residential apartment'],
    countyOriginal: ['County original residential street', 'County original residential city', 'County original residential state', 'County original residential ZIP', 'County original residential apartment'],
};
export function OhioReturnHeaderDetails({ data, onChange, originalInput, ohioResidency, ohioPayments, ohioSchoolDistrict, taxYear }: {
    data: OhioReturnHeaderDraft | undefined;
    onChange: (next: OhioReturnHeaderDraft) => void;
    originalInput?: TaxYearInput | null;
    ohioResidency: OhioResidencyDraft | undefined;
    ohioPayments: OhioPaymentDraft | undefined;
    ohioSchoolDistrict?: OhioSchoolDistrictDraft;
    taxYear?: number | null;
}) {
    const [error, setError] = useState<string | null>(null);
    function edit(path: OhioSourceDraftPath, value: unknown) {
        if (!data) return;
        setError(null);
        onChange(editOhioSourceDraft(data, path, value));
    }
    function addressFields(key: AddressKey) {
        if (!data) return null;
        const labels = addressLabels[key], actual = data[key].originalAddress;
        const fields: readonly (keyof Address)[] = ['street', 'city', 'state', 'zip', 'apt'];
        return fields.map((field, index) => <TextFact key={field} label={labels[index] ?? field} value={actual[field] ?? ''} onChange={value => edit([key, 'originalAddress', field], value)} />);
    }
    return <div className="guided-card">
        <h3 className="guided-card-title">Ohio resident return header originals</h3>
        <p className="guided-hint">Use your actual residential calendar, official Finder result, independent county record and official district list. A mailing address or a missing tax rate does not establish these facts. For 2025, the full-year method covers a single resident at one location in Columbus CSD (2503), Franklin County, or Akron CSD (7701), Summit County. The separate 212-day Ohio and 153-day Virginia methods cover ordinary business income in the Columbus jurisdiction and payroll in Hillsdale LSD (0302), Ashland County. Other locations, calendars and sources need a separate supported method. Filing remains unavailable.</p>
        {!data ? <button type="button" className="utility-button" onClick={() => { setError(null); onChange(emptyOhioReturnHeaderDraft()); }}>Add actual Ohio resident return header sources</button> : <>
            <TextFact label="Header source tax year" value={data.taxYear} onChange={value => edit(['taxYear'], value)} />
            <TextFact label="Header source record reference" value={data.sourceReference} onChange={value => edit(['sourceReference'], value)} />
            <TextFact label="Header source as of date" type="date" value={data.asOfDate} onChange={value => edit(['asOfDate'], value)} />
            <fieldset><legend>Actual account owner</legend>
                <label className="guided-field"><span className="guided-field-label">Header account owner</span><select className="guided-input" value={data.owner.accountHolder} onChange={event => edit(['owner', 'accountHolder'], event.target.value)}><option value="">Choose actual owner</option><option value="primary">Primary taxpayer</option><option value="spouse">Spouse</option></select></label>
                <TextFact label="Header original first name" value={data.owner.originalTaxpayer.firstName} onChange={value => edit(['owner', 'originalTaxpayer', 'firstName'], value)} />
                <TextFact label="Header original last name" value={data.owner.originalTaxpayer.lastName} onChange={value => edit(['owner', 'originalTaxpayer', 'lastName'], value)} />
                <label className="guided-field"><span className="guided-field-label">Header original SSN</span><input className="guided-input" type="password" autoComplete="off" value={data.owner.originalTaxpayer.ssn} onChange={event => edit(['owner', 'originalTaxpayer', 'ssn'], event.target.value)} /></label>
                <TextFact label="Header original date of birth" type="date" value={data.owner.originalTaxpayer.dateOfBirth} onChange={value => edit(['owner', 'originalTaxpayer', 'dateOfBirth'], value)} />
            </fieldset>
            <fieldset><legend>Actual complete residential calendar</legend>
                <TextFact label="Residence original reference" value={data.residence.sourceReference} onChange={value => edit(['residence', 'sourceReference'], value)} />
                {addressFields('residence')}
                {data.residence.periods.map((period, index) => {
                    const suffix = index === 0 ? '' : ` ${index + 1}`;
                    return <fieldset key={index}><legend>Actual residence period {index + 1}</legend>
                        <TextFact label={`Actual residence period original reference${suffix}`} value={period.sourceReference} onChange={value => edit(['residence', 'periods', index, 'sourceReference'], value)} />
                        <TextFact label={`Actual residence from${suffix}`} type="date" value={period.from} onChange={value => edit(['residence', 'periods', index, 'from'], value)} />
                        <TextFact label={`Actual residence through${suffix}`} type="date" value={period.through} onChange={value => edit(['residence', 'periods', index, 'through'], value)} />
                        <button type="button" className="utility-button" onClick={() => edit(['residence', 'periods'], data.residence.periods.filter((_, row) => row !== index))}>Remove actual Ohio residential period {index + 1}</button>
                    </fieldset>;
                })}
                <button type="button" className="utility-button" onClick={() => edit(['residence', 'periods'], [...data.residence.periods, emptyOhioHeaderResidencePeriod()])}>Add actual Ohio residential period</button>
                <BooleanFact label="All actual Ohio residential periods included" value={data.residence.allOhioResidentialPeriodsIncludedConfirmed} onChange={value => edit(['residence', 'allOhioResidentialPeriodsIncludedConfirmed'], value)} />
            </fieldset>
            <fieldset><legend>Retained official Finder original</legend>
                <TextFact label="Finder original reference" value={data.finderOriginal.sourceReference} onChange={value => edit(['finderOriginal', 'sourceReference'], value)} />
                <TextFact label="Finder original tax year" value={data.finderOriginal.taxYear} onChange={value => edit(['finderOriginal', 'taxYear'], value)} />
                <TextFact label="Finder original lookup date" type="date" value={data.finderOriginal.lookupDate} onChange={value => edit(['finderOriginal', 'lookupDate'], value)} />
                {addressFields('finderOriginal')}
                <TextFact label="Actual school district number" value={data.finderOriginal.districtCode} onChange={value => edit(['finderOriginal', 'districtCode'], value)} />
                <TextFact label="Actual school district name" value={data.finderOriginal.districtName} onChange={value => edit(['finderOriginal', 'districtName'], value)} />
                <TextFact label="County shown in Finder original" value={data.finderOriginal.countyName} onChange={value => edit(['finderOriginal', 'countyName'], value)} />
                <label className="guided-field"><span className="guided-field-label">School income tax shown in actual original</span><select className="guided-input" value={data.finderOriginal.schoolIncomeTax} onChange={event => edit(['finderOriginal', 'schoolIncomeTax'], event.target.value)}><option value="">Choose actual result</option><option value="none">No school district income tax</option><option value="reported">School district income tax reported</option></select></label>
                <BooleanFact label="I reviewed the actual official Finder result" value={data.finderOriginal.officialResultMatchedConfirmed} onChange={value => edit(['finderOriginal', 'officialResultMatchedConfirmed'], value)} />
            </fieldset>
            <fieldset><legend>Independent actual county record</legend>
                <TextFact label="County original reference" value={data.countyOriginal.sourceReference} onChange={value => edit(['countyOriginal', 'sourceReference'], value)} />
                <TextFact label="County original tax year" value={data.countyOriginal.taxYear} onChange={value => edit(['countyOriginal', 'taxYear'], value)} />
                <TextFact label="County original record date" type="date" value={data.countyOriginal.recordDate} onChange={value => edit(['countyOriginal', 'recordDate'], value)} />
                <TextFact label="Actual county name" value={data.countyOriginal.countyName} onChange={value => edit(['countyOriginal', 'countyName'], value)} />
                {addressFields('countyOriginal')}
            </fieldset>
            <fieldset><legend>Actual reviewed official district-list row</legend>
                <label className="guided-field"><span className="guided-field-label">Actual official district list publication</span><select className="guided-input" value={data.officialInventoryOriginal.publication} onChange={event => edit(['officialInventoryOriginal'], { ...data.officialInventoryOriginal, publication: event.target.value, publicationSha256: event.target.value === 'ohio_2025_it1040_booklet' ? OHIO_HEADER_2025_BOOKLET_SHA256 : '' })}><option value="">Choose the actual publication reviewed</option><option value="ohio_2025_it1040_booklet">Official 2025 Ohio IT 1040 booklet</option></select></label>
                <TextFact label="Official district list original reference" value={data.officialInventoryOriginal.sourceReference} onChange={value => edit(['officialInventoryOriginal', 'sourceReference'], value)} />
                <TextFact label="Official district list tax year" value={data.officialInventoryOriginal.taxYear} onChange={value => edit(['officialInventoryOriginal', 'taxYear'], value)} />
                <TextFact label="Official district list printed page" value={data.officialInventoryOriginal.printedPage} onChange={value => edit(['officialInventoryOriginal', 'printedPage'], value)} />
                <TextFact label="District number in official list" value={data.officialInventoryOriginal.districtCode} onChange={value => edit(['officialInventoryOriginal', 'districtCode'], value)} />
                <TextFact label="District name in official list" value={data.officialInventoryOriginal.districtName} onChange={value => edit(['officialInventoryOriginal', 'districtName'], value)} />
                <TextFact label="Rate shown in official district list" value={data.officialInventoryOriginal.rateDisplay} onChange={value => edit(['officialInventoryOriginal', 'rateDisplay'], value)} />
                <TextFact label="Tax base shown in official district list" value={data.officialInventoryOriginal.taxBaseDisplay} onChange={value => edit(['officialInventoryOriginal', 'taxBaseDisplay'], value)} />
                <BooleanFact label="I reviewed the actual official district list row" value={data.officialInventoryOriginal.officialRowReviewedConfirmed} onChange={value => edit(['officialInventoryOriginal', 'officialRowReviewedConfirmed'], value)} />
            </fieldset>
            <p role="status">{data.sourceFactsConfirmed === true ? 'Stored header confirmation; current originals are checked again when used.' : 'Header originals need explicit confirmation.'}</p>
            <button type="button" className="utility-button" onClick={() => {
                if (!originalInput || taxYear !== originalInput.taxpayer.taxYear) { setError('Current return originals and the matching selected source year are required.'); return; }
                try { const confirmed = confirmGuidedOhioReturnHeaderSources(originalInput, data, ohioResidency, ohioPayments, ohioSchoolDistrict); setError(null); onChange(confirmed); }
                catch { setError('Complete and reconcile the actual header records with current confirmed residency, payment and resident-credit originals.'); }
            }}>Confirm actual Ohio resident return header sources</button>
            {error && <p role="alert" style={{ overflowWrap: 'anywhere' }}>{error}</p>}
        </>}
    </div>;
}
