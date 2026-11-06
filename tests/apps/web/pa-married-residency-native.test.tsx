// @vitest-environment jsdom
// Spec: state/pa-married-residency-native.yaml.
import React, { useState } from 'react';
import { it, expect, vi, afterEach } from 'vitest';
import { PAMarriedOrdinaryDetails } from '@/components/guided-interview/pa-married-ordinary-details';
import { calculatePAMarriedOrdinaryReturn } from '@/engine/state/pa-married-ordinary-return';
import { paMarriedResidencyNativeFixture } from '../../fixtures/pa-married-residency-native';
import { mountGuidedPanel } from './guided-panel-dom';
afterEach(() => vi.unstubAllGlobals());
it('actual married household exposes detailed calendar source collection', async () => { const f = paMarriedResidencyNativeFixture(), initial = structuredClone(f.sources); delete initial.residencySources; let latest = initial; function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain actual draft'); latest = next; set(next); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    await p.click('Add actual separate spouse residency calendars');
    expect(latest.residencySources).toMatchObject({ sourceTaxYear: null, sourceReference: '', sourceFactsConfirmed: null, owners: [] });
}
finally {
    await p.dispose();
} });
it('parent payroll edits revoke detailed confirmation without replacing originals', async () => { const f = paMarriedResidencyNativeFixture(), before = structuredClone(f.sources); let latest = f.sources; function Harness() { const [d, set] = useState(f.sources); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain actual draft'); latest = next; set(next); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    await p.change('Wage 1 actual payroll original source reference', 'Fictional replacement same-cash payroll');
    expect(latest.residencySources?.sourceFactsConfirmed).toBeNull();
    expect(latest.sourceFactsConfirmed).toBeNull();
    expect(latest.residencySources?.owners.map(o => o.originalTaxpayer)).toEqual(before.residencySources?.owners.map(o => o.originalTaxpayer));
    expect(latest.originalFederalSources).toEqual(before.originalFederalSources);
}
finally {
    await p.dispose();
} });
function present<T>(x: T | null | undefined): T { if (x == null)
    throw Error('Missing synthetic original'); return x; }
it.each(['nonresident', 'part_year'] as const)('visibly enters actual %s calendars and payroll before separate confirmations', async (kind) => {
    const f = paMarriedResidencyNativeFixture(kind), expected = structuredClone(f.sources), initial = structuredClone(f.sources);
    delete initial.residencySources;
    initial.sourceFactsConfirmed = null;
    initial.wages.forEach(w => { w.payroll = []; });
    let latest = initial;
    function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
        throw Error('Retain draft'); latest = next; set(next); }}/>; }
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const p = await mountGuidedPanel(<Harness />);
    try {
        await p.click('Add actual separate spouse residency calendars');
        await p.change('Separate PA calendar source tax year', '2025');
        await p.change('Separate PA calendar collection source reference', present(expected.residencySources).sourceReference);
        for (const [o, owner] of present(expected.residencySources).owners.entries()) {
            const prefix = `Calendar owner ${o + 1}`, r = owner.residency;
            await p.click(`Add ${owner.accountHolder} actual calendar owner`);
            expect(present(latest.residencySources).owners[o].originalTaxpayer.ssn).toBe('');
            await p.click(`Capture ${prefix} current taxpayer original`);
            await p.change(prefix + ' actual payroll locations reviewed without convenience allocation', 'true');
            await p.change(prefix + ' actual residency status', r.status);
            await p.change(prefix + ' calendar original source reference', r.sourceReference);
            for (const [n, row] of r.domicilePeriods.entries()) {
                await p.click(`Add ${prefix} actual domicile period`);
                for (const [key, label] of [['state', 'state'], ['from', 'from'], ['through', 'through'], ['daysInPA', 'days in PA']] as const)
                    await p.change(prefix + ` domicile ${n + 1} actual ${label}`, String(row[key]));
            }
            for (const [key, label] of [['paPermanentAbodePeriods', 'PA abode'], ['outsidePAPermanentAbodePeriods', 'outside PA abode']] as const) {
                for (const [n, row] of r[key].entries()) {
                    await p.click(`Add ${prefix} actual ${label} period`);
                    await p.change(prefix + ` ${label} ${n + 1} actual from`, row.from);
                    await p.change(prefix + ` ${label} ${n + 1} actual through`, row.through);
                }
            }
            await p.change(prefix + ' actual move abandonment new domicile and presence confirmed', String(r.moveAbandonmentNewDomicileAndPresenceConfirmed));
            await p.change(prefix + ' actual December31 principal residence state', r.dec31PrincipalResidenceState);
            await p.change(prefix + ' actual December31 school district code', r.schoolDistrictCode);
            await p.change(prefix + ' actual December31 school district name', r.schoolDistrictName);
            await p.change(prefix + ' actual calendar records checked', 'true');
        }
        for (const [w, wage] of expected.wages.entries())
            for (const [n, pay] of wage.payroll.entries()) {
                await p.click(`Wage ${w + 1} add actual payroll record`);
                for (const [key, label] of [['sourceReference', 'original source reference'], ['paidOn', 'paid date'], ['serviceFrom', 'service from'], ['serviceThrough', 'service through'], ['grossCompensation', 'gross compensation'], ['paServicesCompensation', 'PA services compensation'], ['outsidePAServicesCompensation', 'outside PA services compensation']] as const)
                    await p.change(`Wage ${w + 1} actual ${label === 'original source reference' ? 'payroll ' : ''}${label}`, pay[key], n);
            }
        expect(present(latest.residencySources).sourceFactsConfirmed).toBeNull();
        expect(latest.wages.map(w => w.payroll)).toEqual(expected.wages.map(w => w.payroll));
        await p.click('Confirm actual separate spouse residency calendars after the last edit');
        expect(present(latest.residencySources).sourceFactsConfirmed).toBe(true);
        expect(latest.sourceFactsConfirmed).toBeNull();
        await p.click('Confirm actual married PA household sources after the last edit');
        expect(latest.sourceFactsConfirmed).toBe(true);
        const result = calculatePAMarriedOrdinaryReturn(f.input, latest);
        expect(result.perOwner.map(o => o.reportedCompensation.toString())).toEqual(['50000', kind === 'part_year' ? '18000' : '12000']);
        expect(result.perOwner.map(o => o.reportedPAWithholding.toString())).toEqual(['1535', kind === 'part_year' ? '553' : '368']);
        expect(result.readiness.filingEligible).toBe(false);
        const before = structuredClone(latest);
        await p.change('Calendar owner 2 calendar original source reference', present(latest.residencySources).owners[1].residency.sourceReference + ' same-money replacement original');
        expect(latest.sourceFactsConfirmed).toBeNull();
        expect(present(latest.residencySources).sourceFactsConfirmed).toBeNull();
        expect(present(latest.residencySources).owners.map(o => o.originalTaxpayer)).toEqual(present(before.residencySources).owners.map(o => o.originalTaxpayer));
        expect(latest.originalFederalSources).toEqual(before.originalFederalSources);
        expect(latest.wages).toEqual(before.wages);
    }
    finally {
        await p.dispose();
    }
});
it('calendar exact no-op emits no parent write and explicit unknown differs from zero', async () => { const f = paMarriedResidencyNativeFixture(); let latest = f.sources, writes = 0; function Harness() { const [d, set] = useState(f.sources); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain draft'); writes++; latest = next; set(next); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    await p.change('Calendar owner 2 calendar original source reference', present(latest.residencySources).owners[1].residency.sourceReference);
    expect(writes).toBe(0);
    expect(present(latest.residencySources).sourceFactsConfirmed).toBe(true);
    await p.change('Calendar owner 2 domicile 1 actual days in PA', '');
    expect(present(latest.residencySources).owners[1].residency.domicilePeriods[0].daysInPA).toBeNull();
    await p.click('Confirm actual separate spouse residency calendars after the last edit');
    expect(present(latest.residencySources).sourceFactsConfirmed).toBeNull();
    await p.change('Calendar owner 2 domicile 1 actual days in PA', '0');
    expect(present(latest.residencySources).owners[1].residency.domicilePeriods[0].daysInPA).toBe(0);
    await p.click('Confirm actual separate spouse residency calendars after the last edit');
    expect(present(latest.residencySources).sourceFactsConfirmed).toBe(true);
    await p.click('Confirm actual married PA household sources after the last edit');
    expect(latest.sourceFactsConfirmed).toBeNull();
}
finally {
    await p.dispose();
} });
it('adding detailed calendars retains competing legacy facts for explicit reconciliation', async () => { const f = paMarriedResidencyNativeFixture(), initial = structuredClone(f.sources); delete initial.residencySources; initial.owners[0].residency.actualDaysInPA = 180; initial.owners[0].residency.factsConfirmed = true; let latest = initial; function Harness() { const [d, set] = useState(initial); return <PAMarriedOrdinaryDetails originalInput={f.input} data={d} onChange={next => { if (!next)
    throw Error('Retain draft'); latest = next; set(next); }}/>; } vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); const p = await mountGuidedPanel(<Harness />); try {
    await p.click('Add actual separate spouse residency calendars');
    expect(latest.owners[0].residency).toEqual(initial.owners[0].residency);
    expect(p.control('Primary actual days in PA').value).toBe('180');
    await p.change('Primary actual days in PA', '');
    await p.change('Primary actual residency records checked', 'false');
    expect(latest.owners[0].residency.actualDaysInPA).toBeNull();
    expect(latest.owners[0].residency.factsConfirmed).toBe(false);
    expect(latest.owners[1]).toEqual(initial.owners[1]);
}
finally {
    await p.dispose();
} });
