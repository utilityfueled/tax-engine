'use client';
/** Spec: state/oh-2026-school-native.yaml. Independent source intake, not a tax return. */
import { useState } from 'react';
import type { TaxYearInput } from '@/models/inputs';
import { ohioNrcCategories } from '@/models/ohio-residency';
import { emptyOhioResidencyOwner } from '@/lib/guided-ohio-residency-facts';
import { emptyOhio2026SchoolDraft, emptyOhio2026SchoolEmployment, emptyOhio2026SchoolPayroll, captureGuidedOhio2026SchoolOriginals, confirmGuidedOhio2026SchoolSource, buildGuidedOhio2026SchoolSource, normalizeOhio2026SchoolCash, type Ohio2026SchoolDraft } from '@/lib/guided-ohio-2026-school-sources';
import { BooleanFact, TextFact } from './fact-fields';
import { CurrencyField } from './currency-field';
type Path = Array<string | number>;
function read(value: unknown, path: Path): unknown {
    for (const key of path) {
        if (!value || typeof value !== 'object')
            return undefined;
        value = Reflect.get(value, key);
    }
    return value;
}
function write(value: Ohio2026SchoolDraft, path: Path, next: unknown) {
    let at: object = value;
    for (const key of path.slice(0, -1)) {
        const child: unknown = Reflect.get(at, key);
        if (!child || typeof child !== 'object')
            throw Error('Actual source row required');
        at = child;
    }
    const key = path.at(-1);
    if (key === undefined)
        throw Error('Actual field required');
    Reflect.set(at, key, next);
}
export function Ohio2026SchoolSourceDetails({ data, originalInput, onChange }: {
    data: Ohio2026SchoolDraft | undefined;
    originalInput: TaxYearInput | null;
    onChange: (next: Ohio2026SchoolDraft) => void;
}) {
    const [error, setError] = useState<string | null>(null);
    const d = data ?? emptyOhio2026SchoolDraft();
    function edit(path: Path, value: unknown) {
        if (read(d, path) === value)
            return;
        const next = structuredClone(d);
        write(next, path, value);
        next.sourceFactsConfirmed = null;
        setError(null);
        onChange(next);
    }
    function text(label: string, path: Path, type: 'text' | 'date' = 'text') { const value = read(d, path); return <TextFact key={path.join('.')} label={label} value={typeof value === 'string' ? value : ''} type={type} onChange={value => edit(path, value)}/>; }
    function amount(label: string, path: Path) { const value = read(d, path); return <CurrencyField key={path.join('.')} label={label} value={typeof value === 'string' ? value : ''} onChange={value => edit(path, normalizeOhio2026SchoolCash(value))}/>; }
    function bool(label: string, path: Path) { const value = read(d, path); return <BooleanFact key={path.join('.')} label={label} value={typeof value === 'boolean' ? value : null} onChange={value => edit(path, value)}/>; }
    function choice(label: string, path: Path, choices: ReadonlyArray<readonly [
        string,
        string
    ]>) { const value = read(d, path); return <label key={path.join('.')} className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'string' ? value : ''} onChange={e => edit(path, e.target.value)}><option value="">Choose from actual records</option>{choices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>; }
    function position(label: string, path: Path, positions: ReadonlyArray<readonly [
        number,
        string
    ]>) { const value = read(d, path); return <label key={path.join('.')} className="guided-field"><span className="guided-field-label">{label}</span><select className="guided-input" value={typeof value === 'number' ? String(value) : ''} onChange={e => edit(path, /^\d+$/.test(e.target.value) ? Number(e.target.value) : null)}><option value="">Choose actual printed/current position</option>{positions.map(([n, label]) => <option key={n} value={n}>{label}</option>)}</select></label>; }
    function address(label: string, path: Path) { return (['street', 'apt', 'city', 'state', 'zip'] as const).map(key => text(`${label} ${key}`, [...path, key])); }
    function action(kind: 'capture' | 'confirm') {
        if (!originalInput)
            return;
        try {
            const next = kind === 'capture' ? captureGuidedOhio2026SchoolOriginals(originalInput, d) : confirmGuidedOhio2026SchoolSource(originalInput, d);
            setError(null);
            onChange(next);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Complete the actual source records.');
        }
    }
    let projection: ReturnType<typeof buildGuidedOhio2026SchoolSource> | undefined;
    if (data?.sourceFactsConfirmed && originalInput)
        try {
            projection = buildGuidedOhio2026SchoolSource(originalInput, data);
        }
        catch { /* Saved confirmation is never a current proof by itself. */ }
    const currentW2s = originalInput?.w2s.map((w, i) => [i, `W2 ${i + 1}: ${w.employer.name}`] as const) ?? [];
    return <section className="guided-card space-y-4" aria-label="2026 earned school source projection"><h3>2026 earned school source projection</h3>
 <p>Record actual2026 school originals separately. This validates source facts only. School liability, payments, refund, penalty and interest remain unknown. Filing and paper remain unavailable.</p>
 <p>Only a single primary taxpayer under65, full-year Ohio ordinary W2 earned district is supported. Traditional, part-year, nonresident, joint, self-employment and special compensation require separate methods. Keep unknown answers blank and enter zero only from actual records.</p>
 <a href="https://tax.ohio.gov/finder" target="_blank" rel="noreferrer">Open Ohio’s official school district Finder</a><p>No address is sent to the Finder. Enter your independent actual year/address result; a W2 locality does not establish residence.</p>
 {!data ? <button type="button" onClick={() => onChange(emptyOhio2026SchoolDraft())}>Add actual2026 earned-school originals</button> : <>
 <fieldset><legend>Current original capture and independent source identity</legend>{text('2026 school actual source year', ['taxYear'])}{text('2026 school source reference', ['sourceReference'])}{choice('2026 school actual owner', ['owner', 'accountHolder'], [['primary', 'Primary taxpayer'], ['spouse', 'Spouse — separate method']])}
 <button type="button" disabled={!originalInput} onClick={() => action('capture')}>Capture current2026 school owner home and canonical originals</button><p>Capture does not set year, district, Finder result, money, payroll, residence answers or confirmation. It retains the current private canonical input and owner/home originals only.</p>
 {text('2026 captured first name', ['owner', 'originalTaxpayer', 'firstName'])}{text('2026 captured last name', ['owner', 'originalTaxpayer', 'lastName'])}<label className="guided-field"><span className="guided-field-label">2026 captured SSN</span><input className="guided-input" type="password" autoComplete="off" value={d.owner.originalTaxpayer.ssn} onChange={e => edit(['owner', 'originalTaxpayer', 'ssn'], e.target.value)}/></label>{text('2026 captured birth date', ['owner', 'originalTaxpayer', 'dateOfBirth'], 'date')}
 </fieldset>
 <fieldset><legend>Actual residence and independent Finder original</legend>{text('2026 school residence reference', ['residence', 'sourceReference'])}{address('2026 captured home', ['residence', 'originalAddress'])}{text('2026 school residence begins', ['residence', 'from'], 'date')}{text('2026 school residence ends', ['residence', 'through'], 'date')}{text('2026 residence district code', ['residence', 'districtCode'])}
 {text('2026 Finder reference', ['residence', 'finder', 'sourceReference'])}{text('2026 Finder actual year', ['residence', 'finder', 'taxYear'])}{text('2026 Finder lookup date', ['residence', 'finder', 'lookupDate'], 'date')}{address('2026 Finder original address', ['residence', 'finder', 'originalAddress'])}{text('2026 Finder district code', ['residence', 'finder', 'districtCode'])}{text('2026 Finder district name', ['residence', 'finder', 'districtName'])}{choice('2026 Finder tax base', ['residence', 'finder', 'taxBase'], [['earned', 'Earned income'], ['traditional', 'Traditional — separate method']])}{text('2026 Finder decimal rate', ['residence', 'finder', 'rate'])}{bool('2026 actual Finder address and year matched', ['residence', 'finder', 'officialResultMatchedConfirmed'])}</fieldset>
 <fieldset><legend>Independent Ohio domicile and every source category</legend>{text('2026 domicile actual year', ['residency', 'taxYear'])}{text('2026 domicile source reference', ['residency', 'sourceReference'])}{bool('2026 domicile originals reviewed', ['residency', 'sourceFactsConfirmed'])}{bool('2026 all federal source originals included', ['residency', 'allFederalSourcesIncludedConfirmed'])}{bool('2026 actual records contain no business income', ['residency', 'noBusinessIncomeConfirmed'])}{choice('2026 actual taxing-school residence', ['residency', 'schoolDistrictStatus'], [['actual_district_sources_required', 'Actual taxing district requires independent sources'], ['no_ohio_taxing_district_residency', 'No taxing district — reconcile separate answer']])}{bool('2026 actual state adjustment inventory is empty', ['noStateAdjustmentsConfirmed'])}
 {d.residency.owners.map((o, i) => <fieldset key={i}><legend>Domicile original owner {i + 1}</legend>{text(`2026 domicile owner ${i + 1} reference`, ['residency', 'owners', i, 'sourceReference'])}{choice(`2026 domicile owner ${i + 1} status`, ['residency', 'owners', i, 'status'], [['full_year_resident', 'Full-year Ohio resident'], ['part_year_resident', 'Part-year — separate method'], ['nonresident', 'Nonresident — separate method']])}
 {o.periods.map((_, j) => <div key={j}>{text(`2026 domicile owner ${i + 1} period ${j + 1} begins`, ['residency', 'owners', i, 'periods', j, 'from'], 'date')}{text(`2026 domicile owner ${i + 1} period ${j + 1} ends`, ['residency', 'owners', i, 'periods', j, 'to'], 'date')}{text(`2026 domicile owner ${i + 1} period ${j + 1} state`, ['residency', 'owners', i, 'periods', j, 'domicileState'])}</div>)}
 {ohioNrcCategories.map(category => <fieldset key={category}><legend>{category} actual source category</legend>{(['federalAmount', 'residentAmount', 'nonresidentOhioAmount'] as const).map(key => amount(`2026 ${category} ${key}`, ['residency', 'owners', i, 'amounts', category, key]))}{text(`2026 ${category} source reference`, ['residency', 'owners', i, 'amounts', category, 'sourceReference'])}</fieldset>)}
 <button type="button" onClick={() => edit(['residency', 'owners'], d.residency.owners.filter((_, n) => n !== i))}>Remove2026 domicile owner {i + 1}</button></fieldset>)}
 <button type="button" onClick={() => edit(['residency', 'owners'], [...d.residency.owners, emptyOhioResidencyOwner('primary')])}>Add actual primary domicile record</button></fieldset>
 <fieldset><legend>Actual complete income classification</legend>{bool('2026 all income originals included', ['income', 'allIncomeOriginalsIncludedConfirmed'])}{bool('2026 no other income or adjustments', ['income', 'noOtherIncomeOrAdjustmentsConfirmed'])}{bool('2026 no self-employment', ['income', 'noSelfEmploymentConfirmed'])}{bool('2026 no special compensation', ['income', 'noSpecialCompensationConfirmed'])}</fieldset>
 <fieldset><legend>Actual employer and complete original payroll</legend><p>No payroll money, date, entity or identity is copied from W2 totals. Enter every actual period and payment.</p>
 {d.employmentOriginals.map((e, i) => <fieldset key={i}><legend>Employer original {i + 1}</legend>{position(`2026 employer ${i + 1} current W2`, ['employmentOriginals', i, 'w2Index'], currentW2s)}{text(`2026 employer ${i + 1} source reference`, ['employmentOriginals', i, 'sourceReference'])}{text(`2026 employer ${i + 1} actual year`, ['employmentOriginals', i, 'sourceTaxYear'])}{choice(`2026 employer ${i + 1} owner`, ['employmentOriginals', i, 'accountHolder'], [['primary', 'Primary taxpayer'], ['spouse', 'Spouse — separate method']])}{text(`2026 employer ${i + 1} original name`, ['employmentOriginals', i, 'employerName'])}{text(`2026 employer ${i + 1} original EIN`, ['employmentOriginals', i, 'employerTin'])}{choice(`2026 employer ${i + 1} actual entity`, ['employmentOriginals', i, 'entityType'], [['c_corporation', 'C corporation'], ['other', 'Other — separate method']])}{bool(`2026 employer ${i + 1} ordinary compensation`, ['employmentOriginals', i, 'ordinaryEmployeeCompensationConfirmed'])}{bool(`2026 employer ${i + 1} all periods included`, ['employmentOriginals', i, 'allServiceAndPaymentPeriodsIncludedConfirmed'])}
 {e.serviceRows.map((_, j) => <fieldset key={j}><legend>Payroll original {i + 1}.{j + 1}</legend>{text(`2026 payroll ${i + 1}.${j + 1} original ID`, ['employmentOriginals', i, 'serviceRows', j, 'sourceId'])}{text(`2026 payroll ${i + 1}.${j + 1} reference`, ['employmentOriginals', i, 'serviceRows', j, 'sourceReference'])}{text(`2026 payroll ${i + 1}.${j + 1} begins`, ['employmentOriginals', i, 'serviceRows', j, 'from'], 'date')}{text(`2026 payroll ${i + 1}.${j + 1} ends`, ['employmentOriginals', i, 'serviceRows', j, 'to'], 'date')}{text(`2026 payroll ${i + 1}.${j + 1} paid on`, ['employmentOriginals', i, 'serviceRows', j, 'paymentDate'], 'date')}{text(`2026 payroll ${i + 1}.${j + 1} service state`, ['employmentOriginals', i, 'serviceRows', j, 'serviceState'])}{amount(`2026 payroll ${i + 1}.${j + 1} wages`, ['employmentOriginals', i, 'serviceRows', j, 'wages'])}<button type="button" onClick={() => edit(['employmentOriginals', i, 'serviceRows'], e.serviceRows.filter((_, n) => n !== j))}>Remove2026 payroll {i + 1}.{j + 1}</button></fieldset>)}
 <button type="button" onClick={() => edit(['employmentOriginals', i, 'serviceRows'], [...e.serviceRows, emptyOhio2026SchoolPayroll()])}>Add actual2026 payroll {i + 1}</button><button type="button" onClick={() => edit(['employmentOriginals'], d.employmentOriginals.filter((_, n) => n !== i))}>Remove2026 employer {i + 1}</button></fieldset>)}
 <button type="button" onClick={() => edit(['employmentOriginals'], [...d.employmentOriginals, emptyOhio2026SchoolEmployment()])}>Add actual2026 employer source</button></fieldset>
 <fieldset><legend>Current W2 and every actual printed local row</legend>{d.w2Sources.map((row, i) => {
                const original = row.w2Index === null ? undefined : originalInput?.w2s[row.w2Index];
                const positions = original?.stateLocalSources?.localRows.flatMap(r => r.printedRow === null ? [] : [[r.printedRow, `Printed row ${r.printedRow}: ${r.localityName}`] as const]) ?? [];
                return <fieldset key={i}><legend>Local W2 coverage {i + 1}</legend>{position(`2026 local W2 ${i + 1} current original`, ['w2Sources', i, 'w2Index'], currentW2s)}{text(`2026 local W2 ${i + 1} reference`, ['w2Sources', i, 'sourceReference'])}{choice(`2026 local W2 ${i + 1} actual Box14`, ['w2Sources', i, 'box14SchoolDistrictReporting'], [['none', 'Actual Box14 has no school reporting'], ['reported', 'School reporting — separate method']])}
 {row.localRows.map((_, j) => <fieldset key={j}>{position(`2026 local W2 ${i + 1} row ${j + 1} printed position`, ['w2Sources', i, 'localRows', j, 'printedRow'], positions)}{text(`2026 local W2 ${i + 1} row ${j + 1} reference`, ['w2Sources', i, 'localRows', j, 'sourceReference'])}{choice(`2026 local W2 ${i + 1} row ${j + 1} classification`, ['w2Sources', i, 'localRows', j, 'classification'], [['school_district', 'School district'], ['municipal', 'Municipal — separate method']])}{text(`2026 local W2 ${i + 1} row ${j + 1} district code`, ['w2Sources', i, 'localRows', j, 'districtCode'])}<button type="button" onClick={() => edit(['w2Sources', i, 'localRows'], row.localRows.filter((_, n) => n !== j))}>Remove2026 local row {i + 1}.{j + 1}</button></fieldset>)}
 <button type="button" onClick={() => edit(['w2Sources', i, 'localRows'], [...row.localRows, { printedRow: null, sourceReference: '', classification: '', districtCode: '' }])}>Add actual2026 printed local row {i + 1}</button><button type="button" onClick={() => edit(['w2Sources'], d.w2Sources.filter((_, n) => n !== i))}>Remove2026 local W2 {i + 1}</button></fieldset>;
            })}
 <button type="button" onClick={() => edit(['w2Sources'], [...d.w2Sources, { w2Index: null, sourceReference: '', box14SchoolDistrictReporting: '', localRows: [] }])}>Add actual2026 local W2 coverage</button></fieldset>
 <button type="button" disabled={!originalInput} onClick={() => action('confirm')}>Confirm actual2026 earned-school sources after the last edit</button>
 {projection ? <div role="status"><p>Current2026 source facts validated; school calculation remains incomplete.</p><p>Actual district {projection.districtCode} {projection.districtName}; base {projection.taxBase}; annual rate {projection.rate}</p><p>Actual resident compensation {projection.residentCompensation}; actual school withholding {projection.schoolWithholding}</p><p>Liability unknown; payments unknown; refund unknown; penalty unknown; interest unknown. Filing qualified: no.</p></div> : <p>2026 school source confirmation is missing, stale or incomplete.</p>}
 {error && <p role="alert" style={{ overflowWrap: 'anywhere' }}>{error}</p>}
 </>}
 </section>;
}
