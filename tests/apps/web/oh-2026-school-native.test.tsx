// @vitest-environment jsdom
import React from 'react';
import { expect, it } from 'vitest';
import { SectionStateReturn } from '@/components/guided-interview/section-state-return';
import { mountGuidedPanel } from './guided-panel-dom';
import { ohio2026NativeOriginalFixture } from '../../fixtures/guided-oh-2026-school-native';
it('offers a separate2026 source entry through the actual state section', async () => {
    const f = ohio2026NativeOriginalFixture();
    const panel = await mountGuidedPanel(<SectionStateReturn stateCode="OH" taxYear={2026} filingStatus="single" originalInput={f.baseInput} data={undefined} guidedPreview={null} onDataChange={() => { }}/>);
    try {
        expect(panel.container.textContent).toContain('2026 earned school source projection');
        expect([...panel.container.querySelectorAll('button')].some(b => b.textContent === 'Add actual2026 earned-school originals')).toBe(true);
    }
    finally {
        await panel.dispose();
    }
});
it('discloses unknown2026 school settlement before any confirmation', async () => {
    const f = ohio2026NativeOriginalFixture();
    const panel = await mountGuidedPanel(<SectionStateReturn stateCode="OH" taxYear={2026} filingStatus="single" originalInput={f.baseInput} data={undefined} guidedPreview={null} onDataChange={() => { }}/>);
    try {
        expect(panel.container.textContent).toContain('School liability, payments, refund, penalty and interest remain unknown');
    }
    finally {
        await panel.dispose();
    }
});
import { useState } from 'react';
import { act } from 'react';
import { Ohio2026SchoolSourceDetails } from '@/components/guided-interview/ohio-2026-school-source-details';
import { captureGuidedOhio2026SchoolOriginals, confirmGuidedOhio2026SchoolSource, buildGuidedOhio2026SchoolSource, type Ohio2026SchoolDraft } from '@/lib/guided-ohio-2026-school-sources';
import { enteredOhio2026SchoolDraft } from '../../fixtures/guided-oh-2026-school-native';
it('retains a no-op and revokes same-cash provenance without recapturing originals', async () => {
    const f = ohio2026NativeOriginalFixture();
    const original = confirmGuidedOhio2026SchoolSource(f.baseInput, captureGuidedOhio2026SchoolOriginals(f.baseInput, enteredOhio2026SchoolDraft()));
    let latest = original, writes = 0;
    function Panel() { const [draft, set] = useState(original); return <Ohio2026SchoolSourceDetails originalInput={f.baseInput} data={draft} onChange={d => { writes++; latest = d; set(d); }}/>; }
    const panel = await mountGuidedPanel(<Panel />);
    try {
        expect(panel.container.textContent).toContain('Current2026 source facts validated');
        const cash = panel.control('2026 payroll 1.1 wages');
        await act(async () => { cash.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
        expect(writes).toBe(0);
        expect(latest.sourceFactsConfirmed).toBe(true);
        await panel.change('2026 payroll 1.1 reference', original.employmentOriginals[0].serviceRows[0].sourceReference + ' replacement');
        expect(writes).toBe(1);
        expect(latest.sourceFactsConfirmed).toBeNull();
        expect(latest.originalTaxInput).toEqual(original.originalTaxInput);
        expect(latest.confirmedSourceFacts).toEqual(original.confirmedSourceFacts);
        expect(panel.container.textContent).not.toContain('Current2026 source facts validated');
        await panel.click('Confirm actual2026 earned-school sources after the last edit');
        expect(latest.sourceFactsConfirmed).toBe(true);
        expect(buildGuidedOhio2026SchoolSource(f.baseInput, latest).schoolWithholding).toBe('625.25');
        await panel.change('2026 capitalGains nonresidentOhioAmount', '');
        expect(latest.residency.owners[0].amounts?.capitalGains.nonresidentOhioAmount).toBe('');
        await panel.click('Confirm actual2026 earned-school sources after the last edit');
        expect(latest.sourceFactsConfirmed).toBeNull();
        expect(panel.container.querySelector('[role="alert"]')).not.toBeNull();
    }
    finally {
        await panel.dispose();
    }
});
it('collects actual source primitives visibly before explicit current capture', async () => {
    const f = ohio2026NativeOriginalFixture();
    let latest: Ohio2026SchoolDraft | undefined;
    function Panel() { const [d, set] = useState<Ohio2026SchoolDraft>(); return <Ohio2026SchoolSourceDetails originalInput={f.baseInput} data={d} onChange={n => { latest = n; set(n); }}/>; }
    const p = await mountGuidedPanel(<Panel />);
    try {
        await p.click('Add actual2026 earned-school originals');
        expect(latest?.originalFederalSources).toBeUndefined();
        await p.change('2026 school actual source year', '2026');
        await p.change('2026 school source reference', 'fictional-native-explicit-school');
        await p.change('2026 school actual owner', 'primary');
        await p.click('Add actual primary domicile record');
        expect(latest?.residency.owners[0].amounts?.wages.federalAmount).toBe('');
        for (const cat of ['wages', 'capitalGains', 'rentsRoyalties', 'gambling', 'interestDividends', 'pensions', 'unemployment', 'otherIncome', 'federalAdjustments']) {
            for (const field of ['federalAmount', 'residentAmount', 'nonresidentOhioAmount'])
                await p.change(`2026 ${cat} ${field}`, cat === 'wages' && field !== 'nonresidentOhioAmount' ? '50000' : '0');
            await p.change(`2026 ${cat} source reference`, 'fictional-native-category-' + cat);
        }
        await p.click('Add actual2026 employer source');
        await p.change('2026 employer 1 current W2', '0');
        await p.change('2026 employer 1 original name', f.baseInput.w2s[0].employer.name);
        await p.change('2026 employer 1 original EIN', f.baseInput.w2s[0].employer.ein);
        await p.click('Add actual2026 payroll 1');
        for (const [label, value] of [['original ID', 'fictional-payroll-id'], ['reference', 'fictional-payroll-reference'], ['begins', '2026-01-01'], ['ends', '2026-12-31'], ['paid on', '2026-12-31'], ['service state', 'OH'], ['wages', '50000']])
            await p.change(`2026 payroll 1.1 ${label}`, value);
        expect(latest?.employmentOriginals[0].serviceRows[0]).toMatchObject({ wages: '50000', sourceId: 'fictional-payroll-id', from: '2026-01-01' });
        await p.click('Capture current2026 school owner home and canonical originals');
        expect(latest?.originalFederalSources).toEqual(f.baseInput);
        expect(latest?.sourceFactsConfirmed).toBeNull();
        expect(latest?.taxYear).toBe('2026');
        expect(latest?.residence.finder.taxYear).toBe('');
        await p.click('Confirm actual2026 earned-school sources after the last edit');
        expect(latest?.sourceFactsConfirmed).toBeNull();
        expect(latest?.originalTaxInput).toBeUndefined();
        const expected = enteredOhio2026SchoolDraft();
        for (const [label, value] of [
            ['2026 school residence reference', expected.residence.sourceReference], ['2026 school residence begins', expected.residence.from], ['2026 school residence ends', expected.residence.through], ['2026 residence district code', expected.residence.districtCode],
            ['2026 Finder reference', expected.residence.finder.sourceReference], ['2026 Finder actual year', '2026'], ['2026 Finder lookup date', expected.residence.finder.lookupDate], ['2026 Finder district code', expected.residence.finder.districtCode], ['2026 Finder district name', expected.residence.finder.districtName], ['2026 Finder tax base', 'earned'], ['2026 Finder decimal rate', expected.residence.finder.rate], ['2026 actual Finder address and year matched', 'true'],
            ['2026 domicile actual year', '2026'], ['2026 domicile source reference', expected.residency.sourceReference], ['2026 domicile originals reviewed', 'true'], ['2026 all federal source originals included', 'true'], ['2026 actual records contain no business income', 'true'], ['2026 actual taxing-school residence', 'actual_district_sources_required'], ['2026 actual state adjustment inventory is empty', 'true'], ['2026 domicile owner 1 reference', expected.residency.owners[0].sourceReference], ['2026 domicile owner 1 status', 'full_year_resident'], ['2026 domicile owner 1 period 1 begins', '2026-01-01'], ['2026 domicile owner 1 period 1 ends', '2026-12-31'], ['2026 domicile owner 1 period 1 state', 'OH'],
            ['2026 all income originals included', 'true'], ['2026 no other income or adjustments', 'true'], ['2026 no self-employment', 'true'], ['2026 no special compensation', 'true'], ['2026 employer 1 source reference', expected.employmentOriginals[0].sourceReference], ['2026 employer 1 actual year', '2026'], ['2026 employer 1 owner', 'primary'], ['2026 employer 1 actual entity', 'c_corporation'], ['2026 employer 1 ordinary compensation', 'true'], ['2026 employer 1 all periods included', 'true']
        ])
            await p.change(label, value);
        for (const key of ['street', 'city', 'state', 'zip'] as const)
            await p.change(`2026 Finder original address ${key}`, expected.residence.finder.originalAddress[key]);
        await p.click('Add actual2026 local W2 coverage');
        await p.change('2026 local W2 1 current original', '0');
        await p.change('2026 local W2 1 reference', expected.w2Sources[0].sourceReference);
        await p.change('2026 local W2 1 actual Box14', 'none');
        await p.click('Add actual2026 printed local row 1');
        for (const [label, value] of [['printed position', '1'], ['reference', expected.w2Sources[0].localRows[0].sourceReference], ['classification', 'school_district'], ['district code', '0302']])
            await p.change(`2026 local W2 1 row 1 ${label}`, value);
        await p.click('Confirm actual2026 earned-school sources after the last edit');
        expect(p.container.querySelector('[role="alert"]')?.textContent).toBeUndefined();
        expect(latest?.sourceFactsConfirmed).toBe(true);
        if (!latest)
            throw Error('Entered records required');
        expect(buildGuidedOhio2026SchoolSource(f.baseInput, latest)).toMatchObject({ residentCompensation: '50000', schoolWithholding: '625.25', taxLiability: null, filingQualified: false });
    }
    finally {
        await p.dispose();
    }
});
