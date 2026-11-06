// @vitest-environment jsdom
// Spec: spec/federal/guided-rrta-payroll.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { RRTAPayrollSourceDetails } from '@/components/guided-interview/rrta-payroll-source-details';
import { emptyGuidedRRTA, type GuidedRRTADraft } from '@/lib/guided-rrta-payroll-sources';
import { nativeRRTA } from '../../guided-interview/guided-rrta-fixture';
it('collects actual RRTA facts and captures only after explicit review', async () => {
    (globalThis as {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    const div = document.createElement('div');
    document.body.append(div);
    const root = createRoot(div), state = nativeRRTA();
    let latest: GuidedRRTADraft | undefined;
    function Harness() { const [data, setData] = useState<GuidedRRTADraft>(); latest = data; return <RRTAPayrollSourceDetails state={state} data={data} onChange={setData}/>; }
    async function click(label: string) { const b = [...div.querySelectorAll('button')].find(b => b.textContent === label); if (!b)
        throw Error('Missing ' + label); await act(async () => b.click()); }
    async function change(label: string, value: string) { const control = [...div.querySelectorAll('label')].find(e => e.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!control)
        throw Error('Missing ' + label); await act(async () => { need(need(Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')).set).call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
    try {
        await act(async () => root.render(<Harness />));
        await click('Add original railroad payroll sources');
        expect(latest).toEqual(emptyGuidedRRTA());
        await click('Add actual railroad original');
        expect(latest?.sources[0]?.additionalMedicareTaxWithheld).toBe('');
        for (const [label, value] of [['RRTA collection source tax year', '2025'], ['RRTA collection source reference', 'Actual railroad originals'], ['All railroad compensation sources are included', 'true'], ['No employee representative compensation', 'true'], ['No payroll corrections or settlements requiring adjustments', 'true'], ['No other railroad tax adjustments', 'true'], ['No self-employment income', 'true']])
            await change(need(label), need(value));
        for (const [label, value] of [['Actual owner', 'primary'], ['Actual W-2 source', 'formW2:0'], ['Source label', 'rail-original'], ['Source tax year', '2025'], ['Original reference', 'Actual Box14'], ['Actual Tier1 Social Security compensation', '230000'], ['Actual Tier1 Medicare compensation', '230000'], ['Actual Additional Medicare tax withheld', '270'], ['Actual Box 1 equals railroad Medicare compensation', 'true'], ['Ordinary FICA boxes 3 4 5 6 7 and8 are checked zero', 'true'], ['No railroad-covered tips', 'true'], ['Original row checked after the last edit', 'true']])
            await change('Railroad original 1: ' + label, need(value));
        await click('Capture reviewed original railroad payroll sources');
        expect(div.textContent).toContain('Original payroll sources captured.');
        expect(latest?.capturedOriginal?.packet.sources?.[0]?.additionalMedicareTaxWithheld).toBe('270');
        expect(latest?.sourceFactsConfirmed).toBeNull();
        await change('RRTA originals confirmed after capture and the last edit', 'true');
        expect(latest?.sourceFactsConfirmed).toBe(true);
        const original = structuredClone(latest?.capturedOriginal);
        await change('Railroad original 1: Original reference', 'Same-cash documentary edit');
        expect(latest?.sourceFactsConfirmed).toBeNull();
        expect(latest?.sources[0]?.sourceFactsConfirmed).toBeNull();
        expect(latest?.capturedOriginal).toEqual(original);
        await click('Remove railroad source method');
        expect(latest).toBeUndefined();
    }
    finally {
        await act(async () => root.unmount());
        div.remove();
    }
});

function need<T>(value:T|null|undefined):T {if(value==null)throw Error('Required fictional fixture value');return value;}
