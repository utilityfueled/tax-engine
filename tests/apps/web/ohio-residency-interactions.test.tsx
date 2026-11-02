// @vitest-environment jsdom
// Spec: spec/state/guided-ohio-residency.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect } from 'vitest';
import { OhioResidencyDetails } from '@/components/guided-interview/ohio-residency-details';
import type { OhioResidencyDraft } from '@/lib/guided-ohio-residency-facts';
it('collects actual domicile facts and invalidates confirmation after source edits', async () => {
    (globalThis as {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    let latest: OhioResidencyDraft | undefined;
    function Harness() { const [data, setData] = useState<OhioResidencyDraft>(); return <OhioResidencyDetails data={data} filingStatus="single" taxYear={2025} onChange={value => { latest = value; setData(value); }}/>; }
    const click = async (label: string) => { const b = [...container.querySelectorAll('button')].find(b => b.textContent === label); if (!b)
        throw new Error(`Missing button ${label}`); await act(async () => b.click()); };
    const change = async (label: string, value: string) => { const l = [...container.querySelectorAll('label')].find(l => l.querySelector('.guided-field-label')?.textContent === label); const field = l?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!field)
        throw new Error(`Missing control ${label}`); const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set; if (!setter) throw new Error(`Missing native value setter for ${label}`); await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); };
    try {
        await act(async () => root.render(<Harness />));
        await click('Add Ohio residency source facts');
        expect(latest?.taxYear).toBe('');
        expect(latest?.sourceFactsConfirmed).toBeNull();
        await click('Add primary owner domicile source');
        const owner = latest?.owners[0];
        if (!owner) throw new Error('Adding a primary owner requires an actual owner row');
        const period = owner.periods[0];
        if (!period) throw new Error('Adding a primary owner requires a domicile period row');
        expect(owner.status).toBe('');
        expect(period.from).toBe('');
        await change('Ohio residency source year', '2025');
        await change('Ohio residency source reference', 'Actual synthetic domicile records');
        const confirmation = [...container.querySelectorAll('button')].find(button => button.textContent === 'Confirm actual Ohio residency sources');
        expect(confirmation).toBeTruthy();
        expect(confirmation?.disabled).toBe(true);
        expect(latest?.sourceFactsConfirmed).toBeNull();
        await change('Ohio residency source reference', 'Edited actual domicile records');
        expect(latest?.sourceFactsConfirmed).toBeNull();
        await click('Remove Ohio residency source facts');
        expect(latest).toBeUndefined();
    }
    finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
