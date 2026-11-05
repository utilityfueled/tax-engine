/** Fictional actual originals only; expected values are literal in tests. */
import { ohio2026OrdinaryFixture } from './oh-2026-ordinary-return.js';
export function ohio2026SchoolFixture(wages = '50000', withheld = '625.25') {
    const base = ohio2026OrdinaryFixture('full_year_resident', wages);
    const input = base.input;
    input.taxpayer.address = { street: '101 Fictional School Road', city: 'Fictional Town', state: 'OH', zip: '44805' };
    if (!input.ohioResidency)
        throw new Error('Explicit fictional residence required');
    input.ohioResidency.schoolDistrictStatus = 'actual_district_sources_required';
    const w2 = input.w2s[0];
    if (!w2?.stateLocalSources)
        throw new Error('Explicit fictional W2 required');
    w2.localWages = wages;
    w2.localTaxWithheld = withheld;
    w2.localityName = '0302 Hillsdale LSD';
    w2.stateLocalSources.localReporting = 'single';
    w2.stateLocalSources.localRows = [{ printedRow: 1, sourceReference: 'PRIVATE-LOCAL-ORIGINAL-1', localityNameStatus: 'reported', localityName: w2.localityName, wages, withheld }];
    const { stateLocalSources: _source, ...original } = w2;
    w2.stateLocalSources.originalW2 = structuredClone(original);
    const sources = { taxYear: 2026, sourceReference: 'PRIVATE-COMPLETE-SCHOOL-SOURCE', sourceFactsConfirmed: true,
        originalTaxInput: structuredClone(input), owner: { accountHolder: 'primary', originalTaxpayer: structuredClone(input.taxpayer.primary) },
        residence: { sourceReference: 'PRIVATE-ACTUAL-RESIDENCE', originalAddress: structuredClone(input.taxpayer.address),
            from: '2026-01-01', through: '2026-12-31', districtCode: '0302',
            finder: { sourceReference: 'PRIVATE-ACTUAL-FINDER-RESULT', taxYear: 2026, lookupDate: '2026-11-05', originalAddress: structuredClone(input.taxpayer.address), districtCode: '0302', districtName: 'Hillsdale LSD', taxBase: 'earned', rate: '0.0125', officialResultMatchedConfirmed: true } },
        income: { allIncomeOriginalsIncludedConfirmed: true, noOtherIncomeOrAdjustmentsConfirmed: true, noSelfEmploymentConfirmed: true, noSpecialCompensationConfirmed: true },
        employmentOriginals: structuredClone(base.sources.employmentOriginals),
        w2Sources: [{ w2Index: 0, sourceReference: 'PRIVATE-COMPLETE-LOCAL-SOURCE', box14SchoolDistrictReporting: 'none',
                localRows: [{ printedRow: 1, sourceReference: 'PRIVATE-LOCAL-CLASSIFICATION-1', classification: 'school_district', districtCode: '0302' }] }] };
    const packet = { input, sources };
    rebindOhio2026School(packet);
    return packet;
}
export function rebindOhio2026School(p: ReturnType<typeof ohio2026SchoolFixture>) {
    for (const w of p.input.w2s) {
        const { stateLocalSources: s, ...original } = w;
        if (s)
            s.originalW2 = structuredClone(original);
    }
    const { ohioResidency: _residency, ohioPayments: _payments, ...originals } = p.input;
    if (p.input.ohioResidency)
        p.input.ohioResidency.originalFederalSources = structuredClone(originals);
    p.sources.originalTaxInput = structuredClone(p.input);
}
