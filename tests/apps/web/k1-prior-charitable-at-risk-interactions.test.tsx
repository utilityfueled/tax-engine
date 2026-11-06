// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1CharitableSourceDetails } from '@/components/guided-interview/k1-charitable-source-details';
import { K1LossSourceDetails } from '@/components/guided-interview/k1-loss-source-details';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import { guidedK1PriorRiskState } from '../../fixtures/guided-k1-prior-charitable-at-risk';
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk';

function controls(element: HTMLElement) {
    return {
        click: async (label: string) => {
            const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
            if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
        },
        change: async (label: string, value: string) => {
            const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
            if (!input) throw new Error(`Missing ${label}`);
            await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
        },
    };
}
it('collects original historical deductions and gifts without calculated defaults', async () => {
    // Spec: K1 Prior Charitable At Risk, history-controls.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = guidedK1PriorRiskState(), charity = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
    delete requireRiskSource(requireRiskSource(requireRiskSource(charity.statements)[0].atRisk).priorLossHistory).characterSources;
    let latest: K1CharitableSourcesData | undefined = charity;
    const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element), ui = controls(element);
    function Harness() { const [data, setData] = useState(latest); return <K1CharitableSourceDetails data={data} activities={state.sectionData.adjustments?.k1LossSources?.activities} onChange={next => { latest = next; setData(next); }} />; }
    const history = () => latest?.statements?.[0].atRisk?.priorLossHistory?.characterSources;
    const prefix = 'Charitable K-1 1 prior at-risk character';
    try {
        await act(async () => root.render(<Harness />));
        await ui.click(`Add ${prefix} sources`); expect(history()).toEqual({});
        await ui.click(`Add ${prefix} original deduction`); expect(history()?.records).toEqual([{}]);
        await ui.change(`${prefix} deduction 1 original character`, 'charitable');
        await ui.change(`${prefix} deduction 1 basis limitation already applied`, 'false');
        expect(history()?.records?.[0].basisLimitationAlreadyAppliedConfirmed).toBe(false);
        await ui.change(`${prefix} deduction 1 basis limitation already applied`, '');
        expect(history()?.records?.[0].basisLimitationAlreadyAppliedConfirmed).toBeNull();
        await ui.click(`Add ${prefix} deduction 1 use year`);
        await ui.change(`${prefix} deduction 1 use 1 amount allowed`, '0.000000000000000001');
        expect(history()?.records?.[0].useHistory?.[0].amountAllowed).toBe('0.000000000000000001');
        await ui.click(`Add ${prefix} deduction 1 original gift`); expect(history()?.records?.[0].gift).toEqual({});
        await ui.change(`${prefix} deduction 1 gift original basis source ID`, 'actual-old-gift');
        await ui.change(`${prefix} deduction 1 gift original basis year`, '2022');
        await ui.change(`${prefix} deduction 1 receipt qualified organization`, 'false');
        expect(history()?.records?.[0].gift?.receipt?.qualifiedOrganization).toBe(false);
        await ui.change(`${prefix} checked after the last edit`, 'true'); expect(history()?.sourceFactsConfirmed).toBe(true);
        await ui.change(`${prefix} deduction 1 source reference`, 'Changed original statement');
        expect(history()?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
        await ui.click(`Record no ${prefix} deduction 1 use years`); expect(history()?.records?.[0].useHistory).toEqual([]);
        await ui.click(`Remove ${prefix} deduction 1 original gift`); expect(history()?.records?.[0].gift).toBeUndefined();
        await ui.click(`Remove ${prefix} deduction 1`); expect(history()?.records).toEqual([]);
        await ui.click(`Remove ${prefix} sources`); expect(history()).toBeUndefined();
        expect(latest?.statements?.[0].original?.ordinaryIncome).toBe('-40000');
        expect(element.querySelector('input[type="number"]')).toBeNull();
    } finally { await act(async () => root.unmount()); element.remove(); }
});
it('collects independent qualified history and revokes confirmation on edit', async () => {
    // Spec: K1 Prior Charitable At Risk, qbi-history-controls.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let latest: K1LossSourcesData | undefined = guidedK1PriorRiskState().sectionData.adjustments?.k1LossSources;
    requireRiskSource(requireRiskSource(requireRiskSource(requireRiskSource(latest).activities)[0].atRisk).priorLossHistory).vintages = [];
    const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element), ui = controls(element);
    function Harness() { const [data, setData] = useState(latest); return <K1LossSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
    const history = () => latest?.activities?.[0].atRisk?.priorLossHistory;
    try {
        await act(async () => root.render(<Harness />));
        await ui.click('Add K-1 1 at-risk qualified vintage'); expect(history()?.vintages).toEqual([{}]);
        await ui.change('K-1 1 at-risk qualified vintage 1 origin year', '2022');
        await ui.change('K-1 1 at-risk qualified vintage 1 original loss', '40000');
        await ui.change('K-1 1 at-risk qualified vintage 1 original qualified loss', '40000');
        await ui.change('K-1 1 at-risk qualified vintage 1 filed remaining loss', '20000');
        await ui.change('K-1 1 at-risk qualified vintage 1 filed remaining qualified loss', '20000');
        await ui.change('K-1 1 prior at-risk history checked after the last edit', 'true');
        await ui.change('K-1 1 at-risk qualified vintage 1 filed remaining loss', '19999');
        expect(history()?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
        await ui.click('Remove K-1 1 at-risk qualified vintage 1'); expect(history()?.vintages).toEqual([]);
    } finally { await act(async () => root.unmount()); element.remove(); }
});
