// @vitest-environment jsdom
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk.js';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1CharitableSourceDetails } from '@/components/guided-interview/k1-charitable-source-details';
import { guidedK1CharitableAtRiskSources } from '../../fixtures/guided-k1-charitable-at-risk';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
it('collects original activity membership without inventing a gift identity', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { charity, qualifiedLoss } = guidedK1CharitableAtRiskSources();
    delete requireRiskSource(requireRiskSource(charity.statements)[0].atRisk).activityAllocation;
    const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
    let latest: K1CharitableSourcesData | undefined = charity;
    function Harness() { const [data, setData] = useState(latest); return <K1CharitableSourceDetails data={data} activities={qualifiedLoss.activities} onChange={next => { latest = next; setData(next); }} />; }
    async function click(label: string) {
        const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
        if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
    }
    async function change(label: string, value: string) {
        const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
        if (!input) throw new Error(`Missing ${label}`);
        await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
    }
    const assignment = () => latest?.statements?.[0].atRisk?.activityAllocation;
    try {
        await act(async () => root.render(<Harness />));
        expect(element.textContent).toContain('Current ordinary charitable gifts stay outside this activity list.');
        await click('Add Charitable K-1 1 activity assignment');
        expect(assignment()).toEqual({});
        expect(assignment()?.charitableSourceIds).toBeUndefined();
        await click('Add Charitable K-1 1 assigned gift');
        expect(assignment()?.charitableSourceIds).toEqual(['']);
        await change('Charitable K-1 1 assigned gift 1 original source ID', 'original-gift-1');
        await change('Charitable K-1 1 activity assignment source year', '2025');
        await change('Charitable K-1 1 activity assignment source reference', 'Actual original activity item statement');
        await change('Charitable K-1 1 activity assignment every original item belongs to this activity', 'false');
        expect(assignment()?.allOriginalItemsBelongToActivityConfirmed).toBe(false);
        await change('Charitable K-1 1 activity assignment every original item belongs to this activity', '');
        expect(assignment()?.allOriginalItemsBelongToActivityConfirmed).toBeNull();
        await change('Charitable K-1 1 activity assignment every original item belongs to this activity', 'true');
        await change('Charitable K-1 1 activity assignment checked after the last edit', 'true');
        expect(assignment()?.sourceFactsConfirmed).toBe(true);
        await change('Charitable K-1 1 assigned gift 1 original source ID', 'replacement');
        expect(assignment()?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
        expect(latest?.statements?.[0].basis?.sourceFactsConfirmed).toBeNull();
        await click('Record no Charitable K-1 1 assigned gifts'); expect(assignment()?.charitableSourceIds).toEqual([]);
        await click('Remove Charitable K-1 1 activity assignment'); expect(assignment()).toBeUndefined();
        expect(element.querySelector('input[type="number"]')).toBeNull();
        expect(latest?.statements?.[0].original?.ordinaryIncome).toBe('-80000');
    } finally { await act(async () => root.unmount()); element.remove(); }
});
