// @vitest-environment jsdom
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { OhioReturnHeaderDetails } from '@/components/guided-interview/ohio-return-header-details';
import { OhioSchoolDistrictDetails } from '@/components/guided-interview/ohio-school-district-details';
import { confirmGuidedOhioSchoolDistrictFacts } from '@/lib/guided-ohio-school-district-facts';
import { guidedSchoolDistrictFixture, required } from '../../fixtures/guided-oh-school-district-complete';
import { currentHeaderDraft, ohioReturnHeaderFixture } from '../../fixtures/oh-return-header-sources';
import { mountGuidedPanel } from './guided-panel-dom';

it('copies only the edited Ohio school source path and clears its prior confirmation', async () => {
    const { original, data, draft } = guidedSchoolDistrictFixture('estimates');
    const residency = data.ohioResidency;
    const payments = data.ohioPayments;
    const previous = confirmGuidedOhioSchoolDistrictFacts(original, draft, residency, payments);
    const saved = structuredClone(previous);
    let latest = previous;
    function Harness() {
        const [current, setCurrent] = useState(previous);
        return <OhioSchoolDistrictDetails data={current} originalInput={original} ohioResidency={residency} ohioPayments={payments}
            taxYear={2025} onChange={next => { latest = required(next); setCurrent(latest); }} />;
    }
    const panel = await mountGuidedPanel(<Harness />);
    try {
        await panel.change('School receipt 1 original account holder name', 'Corrected fictional name');
        expect(latest.sourceFactsConfirmed).toBeNull();
        expect(latest.payments.paymentRows[0].original.accountName).toBe('Corrected fictional name');
        expect(latest.payments).not.toBe(previous.payments);
        expect(latest.payments.paymentRows).not.toBe(previous.payments.paymentRows);
        expect(latest.payments.paymentRows[0]).not.toBe(previous.payments.paymentRows[0]);
        expect(latest.payments.paymentRows[1]).toBe(previous.payments.paymentRows[1]);
        expect(latest.residence).toBe(previous.residence);
        expect(latest.originalFederalSources).toBe(previous.originalFederalSources);
        expect(previous).toEqual(saved);
    } finally {
        await panel.dispose();
    }
});

it('copies only the edited Ohio header source path and clears its prior confirmation', async () => {
    const { original } = ohioReturnHeaderFixture();
    const previous = currentHeaderDraft();
    const saved = structuredClone(previous);
    let latest = previous;
    function Harness() {
        const [current, setCurrent] = useState(previous);
        return <OhioReturnHeaderDetails data={current} originalInput={original} ohioResidency={undefined} ohioPayments={undefined}
            taxYear={2025} onChange={next => { latest = next; setCurrent(next); }} />;
    }
    const panel = await mountGuidedPanel(<Harness />);
    try {
        await panel.change('Finder queried residential ZIP', '44308');
        expect(latest.sourceFactsConfirmed).toBeNull();
        expect(latest.finderOriginal.originalAddress.zip).toBe('44308');
        expect(latest.finderOriginal).not.toBe(previous.finderOriginal);
        expect(latest.finderOriginal.originalAddress).not.toBe(previous.finderOriginal.originalAddress);
        expect(latest.countyOriginal).toBe(previous.countyOriginal);
        expect(latest.originalFederalSources).toBe(previous.originalFederalSources);
        expect(previous).toEqual(saved);
    } finally {
        await panel.dispose();
    }
});
