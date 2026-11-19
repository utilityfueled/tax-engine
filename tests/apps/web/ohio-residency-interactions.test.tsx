// @vitest-environment jsdom
// Spec: spec/state/guided-ohio-residency.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect } from 'vitest';
import { OhioResidencyDetails } from '@/components/guided-interview/ohio-residency-details';
import { buildGovernmentPaymentSourceRecords } from '@/lib/guided-government-payment-inputs';
import { snapshotGuidedOhioOriginals, type OhioResidencyDraft } from '@/lib/guided-ohio-residency-facts';
import { TaxYearInputSchema } from '@/models/inputs';
import { unemploymentSource } from '../../fixtures/guided-government-uc-original';
import { ohioResidencyFacts, ohioResidencyOwner } from '../../fixtures/oh-residency';
import { simpleW2Fixture } from '../../fixtures/simple-w2';
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

it('collects the four part-year payment facts and clears the view after a same-value replacement statement', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const form = { ...unemploymentSource, compensation: '1000' };
    const original = TaxYearInputSchema.parse({ ...simpleW2Fixture,
        w2s: simpleW2Fixture.w2s.map(wage => ({ ...wage, accountHolder: 'primary', taxYear: 2025 })),
        form1099G: buildGovernmentPaymentSourceRecords([form]) });
    const replacement = TaxYearInputSchema.parse({ ...original,
        form1099G: buildGovernmentPaymentSourceRecords([{ ...form, accountReference: 'Replacement of the same value' }]) });
    const owner = ohioResidencyOwner('primary', 'part_year_resident');
    Object.assign(owner.amounts.wages, { federalAmount: '85000', residentAmount: '30000', nonresidentOhioAmount: '10000' });
    const initial: OhioResidencyDraft = { ...ohioResidencyFacts(), taxYear: '2025', owners: [owner],
        originalFederalSources: snapshotGuidedOhioOriginals(original) };
    let latest: OhioResidencyDraft | undefined = initial;
    function Harness() {
        const [data, setData] = useState<OhioResidencyDraft | undefined>(initial);
        const [input, setInput] = useState(original);
        return <>
            <button type="button" onClick={() => setInput(replacement)}>Replace fixture statement</button>
            <OhioResidencyDetails data={data} originalInput={input} filingStatus="single" taxYear={2025}
                onChange={value => { latest = value; setData(value); }} />
        </>;
    }
    const control = (label: string) => [...container.querySelectorAll('label')]
        .find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    const click = async (label: string) => {
        const button = [...container.querySelectorAll('button')].find(candidate => candidate.textContent === label);
        if (!button) throw new Error(`Missing button ${label}`);
        await act(async () => button.click());
    };
    const change = async (label: string, value: string) => {
        const field = control(label);
        if (!field) throw new Error(`Missing control ${label}`);
        const select = field instanceof HTMLSelectElement;
        const setter = Object.getOwnPropertyDescriptor(select ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
        if (!setter) throw new Error(`Missing native value setter for ${label}`);
        await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true })); });
    };
    const reference = 'Unemployment payment record reference';
    const date = 'Unemployment payment or accrual date';
    const amount = 'Actual unemployment payment amount';
    const complete = 'Does this one payment account for all of Form 1099-G Box 1?';
    try {
        await act(async () => root.render(<Harness />));
        expect(container.querySelector('[role="status"]')?.textContent).toContain('need explicit confirmation');
        expect(control('primary Unemployment: Full federal source amount')).toBeUndefined();
        await click('Confirm actual Ohio residency sources');
        expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/complete dated unemployment/i);
        await change(reference, 'Synthetic actual unemployment receipt');
        await change(date, '2025-07-01');
        await change(amount, '1000');
        await change(complete, 'true');
        expect(latest?.unemploymentPaymentSource).toMatchObject({ paidOrAccruedOn: '2025-07-01', amount: '1000', allPaymentsIncludedConfirmed: true });
        await change(date, '2025-07-02');
        expect(latest?.unemploymentPaymentSource?.allPaymentsIncludedConfirmed).toBeNull();
        await change(complete, 'true');
        await click('Confirm actual Ohio residency sources');
        expect(latest?.sourceFactsConfirmed).toBe(true);
        await click('Replace fixture statement');
        expect(container.querySelector('[role="status"]')?.textContent).toContain('need explicit confirmation');
        for (const name of [reference, date, amount, complete]) expect(control(name)?.value).toBe('');
        await change(reference, 'New actual receipt reference');
        expect(latest?.unemploymentPaymentSource).toMatchObject({ sourceReference: 'New actual receipt reference',
            paidOrAccruedOn: '', amount: '', allPaymentsIncludedConfirmed: null });
        await change('primary actual Ohio residency status', 'nonresident');
        for (const name of [reference, date, amount, complete]) expect(control(name)).toBeUndefined();
        expect(latest?.unemploymentPaymentSource).toBeUndefined();
        await change('primary actual Ohio residency status', 'part_year_resident');
        await change(reference, 'Fresh synthetic payment record');
        await click('Remove primary owner domicile source');
        expect(latest?.unemploymentPaymentSource).toBeUndefined();
        await click('Add primary owner domicile source');
        await change('primary actual Ohio residency status', 'part_year_resident');
        for (const name of [reference, date, amount, complete]) expect(control(name)?.value).toBe('');
    }
    finally {
        await act(async () => root.unmount());
        container.remove();
    }
});
