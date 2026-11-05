import Decimal from 'decimal.js';
// Spec: spec/state/oh-2026-school-sources.yaml. Source projection only, no final2026 SD100 claim.
import { expect, it } from 'vitest';
import { calculateOhio2026SchoolSource, readOhio2026SchoolSource } from '@/engine/state/oh-2026-school-source.js';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { ohio2026SchoolFixture, rebindOhio2026School } from '../../fixtures/ohio-2026-school.js';
function current<T>(v: T | null | undefined): T {
    if (v === null || v === undefined)
        throw new Error('Actual synthetic original required');
    return v;
}
const run = (p: ReturnType<typeof ohio2026SchoolFixture>) => calculateOhio2026SchoolSource(p.input, p.sources);
it('projects actual resident wages and withholding without inventing school liability', () => { const p = ohio2026SchoolFixture(); const before = JSON.stringify(p); const c = run(p); const r = readOhio2026SchoolSource(c, p.input, p.sources); expect(r).toMatchObject({ taxYear: 2026, districtCode: '0302', taxBase: 'earned', rate: '0.0125', residentCompensation: '50000', schoolWithholding: '625.25', taxLiability: null, payments: null, refund: null, underpaymentPenalty: null, lateInterest: null, filingQualified: false, calculationStatus: 'source-only-incomplete' }); expect(r.limitations.length).toBeGreaterThan(0); expect(JSON.stringify(p)).toBe(before); expect(JSON.stringify(r)).not.toMatch(/PRIVATE-|900-70|Fictional School Road/); });
it('revokes changed sources and rejects forged contexts', () => { const p = ohio2026SchoolFixture(); const c = run(p); expect(() => readOhio2026SchoolSource({ ...c }, p.input, p.sources)).toThrow(/context/); p.sources.sourceReference += '-changed'; expect(() => readOhio2026SchoolSource(c, p.input, p.sources)).toThrow(/current/); const fresh = run(p); expect(fresh.sourceCommitment).not.toBe(c.sourceCommitment); });
it('returns a detached projection without exposing retained originals', () => { const p = ohio2026SchoolFixture(), c = run(p), r = readOhio2026SchoolSource(c, p.input, p.sources); r.limitations.length = 0; expect(readOhio2026SchoolSource(c, p.input, p.sources).limitations.length).toBeGreaterThan(0); });
it('preserves explicit zero and exact cents without rounding a school tax', () => { const p = ohio2026SchoolFixture('0', '0'); expect(readOhio2026SchoolSource(run(p), p.input, p.sources)).toMatchObject({ residentCompensation: '0', schoolWithholding: '0', taxLiability: null }); const q = ohio2026SchoolFixture('10002.49', '0.01'); expect(readOhio2026SchoolSource(run(q), q.input, q.sources)).toMatchObject({ residentCompensation: '10002.49', schoolWithholding: '0.01' }); });
it('leaves the ordinary and final return gates closed', () => { const p = ohio2026SchoolFixture(); run(p); expect(() => calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources })).toThrow(); });
const mutations: Array<[
    string,
    (p: ReturnType<typeof ohio2026SchoolFixture>) => void
]> = [
    ['source year', p => { p.sources.taxYear = 2025; }], ['unknown source confirmation', p => { p.sources.sourceFactsConfirmed = false; }],
    ['Finder year', p => { p.sources.residence.finder.taxYear = 2025; }], ['Finder date', p => { p.sources.residence.finder.lookupDate = '2027-02-30'; }],
    ['Finder false', p => { p.sources.residence.finder.officialResultMatchedConfirmed = false; }], ['Finder source', p => { p.sources.residence.finder.sourceReference = ' '; }],
    ['address mismatch', p => { p.sources.residence.finder.originalAddress.street += 'wrong'; }], ['source address', p => { p.sources.residence.originalAddress.zip = '00000'; }],
    ['district mismatch', p => { p.sources.residence.finder.districtCode = '2514'; }], ['name mismatch', p => { p.sources.residence.finder.districtName = 'Other'; }],
    ['rate mismatch', p => { p.sources.residence.finder.rate = '0.01'; }], ['base mismatch', p => { p.sources.residence.finder.taxBase = 'traditional'; }],
    ['expired district', p => { p.sources.residence.districtCode = '1505'; p.sources.residence.finder.districtCode = '1505'; }],
    ['traditional', p => { p.sources.residence.districtCode = '5402'; p.sources.residence.finder.districtCode = '5402'; p.sources.residence.finder.districtName = 'Coldwater EVSD'; p.sources.residence.finder.rate = '0.0100'; p.sources.residence.finder.taxBase = 'traditional'; }],
    ['part year', p => { p.sources.residence.from = '2026-01-02'; }], ['invalid calendar', p => { p.sources.residence.through = '2026-02-30'; }],
    ['wrong owner', p => { p.sources.owner.originalTaxpayer.ssn = '900-70-9999'; }], ['school local owner', p => { current(p.input.w2s[0]).accountHolder = 'spouse'; }],
    ['joint', p => { p.input.taxpayer.filingStatus = 'married_filing_jointly'; }], ['senior', p => { p.input.taxpayer.primary.dateOfBirth = '1961-12-31'; p.sources.owner.originalTaxpayer.dateOfBirth = '1961-12-31'; }],
    ['unknown wage', p => { current(p.input.w2s[0]).wages = ''; }], ['wrong payroll wages', p => { current(current(p.sources.employmentOriginals[0]).serviceRows[0]).wages = '49999'; }],
    ['late payroll', p => { current(current(p.sources.employmentOriginals[0]).serviceRows[0]).paymentDate = '2027-01-01'; }], ['payroll gap', p => { current(current(p.sources.employmentOriginals[0]).serviceRows[0]).from = '2026-01-02'; }],
    ['payroll employer', p => { current(p.sources.employmentOriginals[0]).employerTin = '90-0000000'; }], ['unknown box14', p => { current(p.sources.w2Sources[0]).box14SchoolDistrictReporting = 'unknown'; }],
    ['municipal', p => { current(current(p.sources.w2Sources[0]).localRows[0]).classification = 'municipal'; }], ['unresolved', p => { current(current(p.sources.w2Sources[0]).localRows[0]).classification = 'unresolved'; }],
    ['wrong local district', p => { current(current(p.sources.w2Sources[0]).localRows[0]).districtCode = '2514'; }], ['missing row', p => { current(p.sources.w2Sources[0]).localRows = []; }],
    ['duplicate classification', p => { current(p.sources.w2Sources[0]).localRows.push(structuredClone(current(current(p.sources.w2Sources[0]).localRows[0]))); }],
    ['duplicate W2 inventory', p => { p.sources.w2Sources.push(structuredClone(current(p.sources.w2Sources[0]))); }], ['duplicate payroll', p => { p.sources.employmentOriginals.push(structuredClone(current(p.sources.employmentOriginals[0]))); }],
    ['special compensation', p => { current(p.input.w2s[0]).socialSecurityTips = '1'; }], ['missing income answer', p => { delete (p.sources.income as Partial<typeof p.sources.income>).noSelfEmploymentConfirmed; }],
    ['foreign income object', p => { (p.input as unknown as Record<string, unknown>).interestIncome = [{ amount: '0' }]; }],
    ['school residency unknown', p => { current(p.input.ohioResidency).schoolDistrictStatus = 'no_ohio_taxing_district_residency'; }],
    ['nonresident', p => { current(current(p.input.ohioResidency).owners[0]).status = 'nonresident'; }], ['foreign domicile', p => { current(current(current(p.input.ohioResidency).owners[0]).periods[0]).domicileState = 'VA'; }],
];
it.each(mutations)('denies incomplete/conflicting/unsupported originals: %s', (_label, edit) => { const p = ohio2026SchoolFixture(); edit(p); rebindOhio2026School(p); expect(() => run(p)).toThrow(); });
it('rejects original edits until explicit fresh originals match', () => { const p = ohio2026SchoolFixture(); p.input.taxpayer.address.street += ' changed'; expect(() => run(p)).toThrow(/original|address/); });
it('allows actual absence of school withholding, never inferred zero from an absent amount', () => { const p = ohio2026SchoolFixture(); const w = current(p.input.w2s[0]); w.localWages = '0'; w.localTaxWithheld = '0'; w.localityName = ''; current(w.stateLocalSources).localRows = []; current(w.stateLocalSources).localReporting = 'none'; current(p.sources.w2Sources[0]).localRows = []; rebindOhio2026School(p); expect(readOhio2026SchoolSource(run(p), p.input, p.sources).schoolWithholding).toBe('0'); const q = ohio2026SchoolFixture(); current(current(current(q.input.w2s[0]).stateLocalSources).localRows[0]).withheld = ''; rebindOhio2026School(q); expect(() => run(q)).toThrow(); });
it('uses local exact arithmetic under a caller low-precision Decimal configuration', () => { const precision = Decimal.precision, rounding = Decimal.rounding; const p = ohio2026SchoolFixture('10002.49', '125.03'); try {
    Decimal.set({ precision: 3, rounding: Decimal.ROUND_DOWN });
    expect(readOhio2026SchoolSource(run(p), p.input, p.sources)).toMatchObject({ residentCompensation: '10002.49', schoolWithholding: '125.03' });
}
finally {
    Decimal.set({ precision, rounding });
} });
it('requires actual complete address and dependent inventory rather than schema defaults', () => { for (const edit of [(p: ReturnType<typeof ohio2026SchoolFixture>) => { p.input.taxpayer.address.street = ''; p.sources.residence.originalAddress.street = ''; p.sources.residence.finder.originalAddress.street = ''; }, (p: ReturnType<typeof ohio2026SchoolFixture>) => { delete (p.input.taxpayer as Partial<typeof p.input.taxpayer>).dependents; }]) {
    const p = ohio2026SchoolFixture();
    edit(p);
    rebindOhio2026School(p);
    expect(() => run(p)).toThrow();
} });
it('reconciles every reported ordinary school wage row rather than accepting inconsistent local cash', () => { const p = ohio2026SchoolFixture(); const w = current(p.input.w2s[0]); w.localWages = '49999'; current(current(w.stateLocalSources).localRows[0]).wages = '49999'; rebindOhio2026School(p); expect(() => run(p)).toThrow(/wage row/); });
it('sums two distinct complete employment originals once with literal independent expected amounts', () => { const p = ohio2026SchoolFixture(); const second = ohio2026SchoolFixture('12345.67', '154.32'); const w = current(second.input.w2s[0]); w.employer = { name: 'Distinct Fictional Company', ein: '90-7000999' }; p.input.w2s.push(w); const employment = structuredClone(current(second.sources.employmentOriginals[0])); employment.w2Index = 1; employment.employerName = w.employer.name; employment.employerTin = w.employer.ein; employment.sourceReference = 'PRIVATE-SECOND-EMPLOYMENT'; for (const row of employment.serviceRows) {
    row.sourceId += '-SECOND';
    row.sourceReference += '-SECOND';
} p.sources.employmentOriginals.push(employment); const school = structuredClone(current(second.sources.w2Sources[0])); school.w2Index = 1; school.sourceReference = 'PRIVATE-SECOND-LOCAL'; p.sources.w2Sources.push(school); const amounts = current(current(current(p.input.ohioResidency).owners[0]).amounts); amounts.wages.federalAmount = '62345.67'; amounts.wages.residentAmount = '62345.67'; rebindOhio2026School(p); expect(readOhio2026SchoolSource(run(p), p.input, p.sources)).toMatchObject({ residentCompensation: '62345.67', schoolWithholding: '779.57' }); });
it('preserves current commitment invalidation for amount, owner, year and address edits', () => { for (const edit of [(p: ReturnType<typeof ohio2026SchoolFixture>) => { current(p.input.w2s[0]).wages = '50001'; }, (p: ReturnType<typeof ohio2026SchoolFixture>) => { p.input.taxpayer.primary.lastName += 'Changed'; }, (p: ReturnType<typeof ohio2026SchoolFixture>) => { p.input.taxpayer.taxYear = 2025; }, (p: ReturnType<typeof ohio2026SchoolFixture>) => { p.input.taxpayer.address.street += ' changed'; }]) {
    const p = ohio2026SchoolFixture(), c = run(p);
    edit(p);
    expect(() => readOhio2026SchoolSource(c, p.input, p.sources)).toThrow(/current/);
    expect(() => run(p)).toThrow();
} });

it.each(['CITY OF COLUMBUS','2301 Amanda-Clearcreek LSD'])('rejects an actual printed locality contradicting the claimed school district: %s',locality=>{
  const p=ohio2026SchoolFixture(),w=current(p.input.w2s[0]);w.localityName=locality;current(current(w.stateLocalSources).localRows[0]).localityName=locality;rebindOhio2026School(p);
  expect(()=>run(p)).toThrow(/printed locality/);
});

it.each(['0302','Hillsdale LSD','0302 Hillsdale LSD','Hillsdale LSD 0302','  hillsdale   lsd  '])('accepts a finite actual printed identity for this district: %s',locality=>{
  const p=ohio2026SchoolFixture(),w=current(p.input.w2s[0]);w.localityName=locality;current(current(w.stateLocalSources).localRows[0]).localityName=locality;rebindOhio2026School(p);
  expect(readOhio2026SchoolSource(run(p),p.input,p.sources)).toMatchObject({districtCode:'0302',schoolWithholding:'625.25',taxLiability:null,payments:null});
});
it.each(['','Hillsdale','CITY OF HILLSDALE','0302 CITY OF COLUMBUS','0302 2301 Hillsdale LSD','Hillsdale LSD 2301','School district tax'])('denies ambiguous blank or mixed actual printed identities: %s',locality=>{
  const p=ohio2026SchoolFixture(),w=current(p.input.w2s[0]);w.localityName=locality;current(current(w.stateLocalSources).localRows[0]).localityName=locality;rebindOhio2026School(p);expect(()=>run(p)).toThrow();
});
it('cannot attach a label from another row or an explicit blank original to this classification',()=>{const p=ohio2026SchoolFixture(),w=current(p.input.w2s[0]);w.localityName='';const row=current(current(w.stateLocalSources).localRows[0]);row.localityName='';row.localityNameStatus='blank_original';rebindOhio2026School(p);expect(()=>run(p)).toThrow(/printed locality/);});

it('requires a printed code when the exact school name is ambiguous in the annual catalog',()=>{
  const p=ohio2026SchoolFixture(),w=current(p.input.w2s[0]);p.sources.residence.districtCode='1204';Object.assign(p.sources.residence.finder,{districtCode:'1204',districtName:'Northwestern LSD',rate:'0.0100'});current(current(p.sources.w2Sources[0]).localRows[0]).districtCode='1204';w.localityName='Northwestern LSD';current(current(w.stateLocalSources).localRows[0]).localityName=w.localityName;rebindOhio2026School(p);expect(()=>run(p)).toThrow(/printed locality/);
  w.localityName='1204 Northwestern LSD';current(current(w.stateLocalSources).localRows[0]).localityName=w.localityName;rebindOhio2026School(p);expect(readOhio2026SchoolSource(run(p),p.input,p.sources)).toMatchObject({districtCode:'1204',schoolWithholding:'625.25',taxLiability:null});
});
