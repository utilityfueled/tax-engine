// @vitest-environment jsdom
// Spec: charitable-prior-net-operating-loss.yaml interactive-guide.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NetOperatingLossDetails } from '@/components/guided-interview/net-operating-loss-details';
import { buildGuidedNetOperatingLoss, type NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { priorCharitableNolInterview } from '../../fixtures/guided-charitable-prior-nol';
it('edits the independent prior AMT history and requires renewed confirmations', async () => {
    (globalThis as {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    const state = priorCharitableNolInterview(), host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    let latest = required(state.sectionData.adjustments).netOperatingLossSources;
    function Harness() { const [data, setData] = useState(latest); return <NetOperatingLossDetails data={data} onChange={next => { latest = next; setData(next); }}/>; }
    async function change(label: string, value: string) {
        const control = [...host.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
        if (!control)
            throw new Error(`Missing ${label}`);
        await act(async () => {
            Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(control, value);
            control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
        });
    }
    async function click(label: string) { const button = [...host.querySelectorAll('button')].find(node => node.textContent === label); if (!button)
        throw new Error(`Missing ${label}`); await act(async () => button.click()); }
    const build = (data: NetOperatingLossData | undefined = latest) => buildGuidedNetOperatingLoss(data, 2025, 'single', state.sectionData['personal-info'], state.sectionData.deductions);
    try {
        await act(async () => root.render(<Harness />));
        expect(host.textContent).toContain('Original AMT charitable source history');
        await change('Contribution 1 original excess', '10,000.49');
        await change('Contribution 1 opening carryforward', '10,000.49');
        await change('AMT charitable carry 1 amount', '10,000.49');
        const history = required(required(required(latest).alternativeTax).charitableCarryoverHistory);
        expect(required(required(history.alternativeCarryoverSources).vintages)[0].openingCarryforward).toBe('10,000.49');
        expect(required(history.alternativeCarryoverSources).sourceFactsConfirmed).toBeNull();
        expect(history.sourceFactsConfirmed).toBeNull();
        expect(required(latest).sourceFactsConfirmed).toBeNull();
        expect(() => build()).toThrow(/confirm|source|AMT/i);
        for (const label of ['Charitable carryover sources checked after the last edit', 'Charitable carry histories checked after the last edit', 'AMT NOL sources checked after the last edit', 'Regular NOL sources checked after the last edit'])
            await change(label, 'true');
        expect(build()?.alternativeTax?.charitableCarryoverHistory?.alternativeCarryoverSources?.vintages?.[0].openingCarryforward).toBe('10000.49');
        await change('The taxpayer or joint spouses are unchanged throughout the history', 'false');
        expect(required(required(required(required(latest).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).membershipUnchangedConfirmed).toBe(false);
        await click('Remove charitable carryover sources');
        expect(required(required(required(latest).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).toBeUndefined();
        expect(required(required(required(required(latest).alternativeTax).charitableCarryoverHistory).priorAlternativeCarryovers)[0].amount).toBe('10,000.49');
        await click('Add charitable carryover sources');
        expect(required(required(required(required(latest).alternativeTax).charitableCarryoverHistory).alternativeCarryoverSources).vintages).toBeUndefined();
    }
    finally {
        await act(async () => root.unmount());
        host.remove();
    }
});

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}
