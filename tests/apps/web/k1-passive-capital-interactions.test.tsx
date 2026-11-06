// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1CharitableSourceDetails } from '@/components/guided-interview/k1-charitable-source-details';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import { guidedK1PassiveCapitalState } from '../../fixtures/guided-k1-passive-capital';
import { requireRiskSource } from '../../fixtures/k1-charitable-at-risk';

it('collects original capital character and separate histories without defaults', async () => {
    // Spec: K1 Passive Capital Sources, guided-controls.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = guidedK1PassiveCapitalState(), packet = requireRiskSource(requireRiskSource(state.sectionData.deductions).k1CharitableSources);
    delete requireRiskSource(packet.statements)[0].capitalCharacter;
    let latest: K1CharitableSourcesData | undefined = packet;
    const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
    function Harness() { const [data, setData] = useState(latest); return <K1CharitableSourceDetails data={data}
        activities={state.sectionData.adjustments?.k1LossSources?.activities} onChange={next => { latest = next; setData(next); }} />; }
    const click = async (name: string) => {
        const button = [...element.querySelectorAll('button')].find(node => node.textContent === name);
        if (!button) throw new Error(`Missing ${name}`); await act(async () => button.click());
    };
    const change = async (name: string, value: string) => {
        const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === name)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
        if (!input) throw new Error(`Missing ${name}`);
        await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value);
            input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
    };
    const prefix = 'Charitable K-1 1 capital character', source = () => latest?.statements?.[0].capitalCharacter;
    try {
        await act(async () => root.render(<Harness />));
        await click(`Add ${prefix} sources`); expect(source()).toEqual({});
        await change(`${prefix} short-term original amount`, '-1000.0000000000000001');
        await change(`${prefix} short-term original treatment`, 'passive_activity');
        expect(source()?.currentShortTerm?.originalAmount).toBe('-1000.0000000000000001');
        await change(`${prefix} same passive activity established`, 'false');
        expect(source()?.samePassiveActivityConfirmed).toBe(false);
        await change(`${prefix} same passive activity established`, '');
        expect(source()?.samePassiveActivityConfirmed).toBeNull();
        await change(`${prefix} prior passive short-term loss`, '0');
        expect(source()?.priorPassiveCapital?.shortTermLoss).toBe('0');
        expect(source()?.priorPassiveCapital?.longTermLoss).toBeUndefined();
        await click(`Add ${prefix} prior at-risk capital record`); expect(source()?.priorAtRiskCapital).toEqual([{}]);
        await change(`${prefix} prior at-risk record 1 source ID`, 'actual-old-capital');
        await change(`${prefix} prior at-risk record 1 original treatment`, 'portfolio');
        await change(`${prefix} checked after the last edit`, 'true'); expect(source()?.sourceFactsConfirmed).toBe(true);
        await change(`${prefix} source reference`, 'Changed actual statement');
        expect(source()?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
        await click(`Remove ${prefix} prior at-risk record 1`); expect(source()?.priorAtRiskCapital).toEqual([]);
        await click(`Record no ${prefix} prior at-risk capital records`); expect(source()?.priorAtRiskCapital).toEqual([]);
        await click(`Remove ${prefix} sources`); expect(source()).toBeUndefined();
        expect(latest?.statements?.[0].original?.ordinaryIncome).toBe('-40000');
        expect(element.querySelector('input[type="number"]')).toBeNull();
    } finally { await act(async () => root.unmount()); element.remove(); }
});
