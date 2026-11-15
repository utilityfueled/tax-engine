import { required } from '../../fixtures/foreign-tax-k3-ordinary';
// @vitest-environment jsdom
// Spec: spec/federal/foreign-tax-k3-ordinary.yaml, visible.
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { ForeignTaxElectionDetails } from '@/components/guided-interview/foreign-tax-election-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { mountGuidedPanel } from './guided-panel-dom';
import { guidedOrdinaryK3 } from '../../fixtures/foreign-tax-k3-ordinary';
it('originates explicit ordinary K3 originals and invalidates source confirmation', async () => {
    const fixture = guidedOrdinaryK3();
    let current = fixture.state;
    required(required(current.sectionData['other-taxes']).foreignTaxElection).qualifiedK3Statements = [];
    required(required(required(current.sectionData['other-taxes']).foreignTaxElection).creditWithForm1116).incomeSources = [];
    function Harness() { const [state, setState] = useState(current); const other = required(state.sectionData['other-taxes']); return <ForeignTaxElectionDetails data={other.foreignTaxElection} investment={state.sectionData['income-investments']} onChange={foreignTaxElection => { current = updateSectionData(state, 'other-taxes', { ...other, foreignTaxElection }); setState(current); }}/>; }
    const panel = await mountGuidedPanel(<Harness />);
    try {
        await panel.click('Add original partnership K1 and K3');
        expect(panel.control('K3 1 allocated foreign deductions').value).toBe('');
        expect(panel.control('K3 1 original entity-paid taxes are reported in USD').value).toBe('');
        expect(buildTaxInputFromGuidedData(current)).toBeNull();
        for (const [label, value] of [
            ['original tax year', '2025'], ['entity type', 'partnership'], ['partnership name', 'Fictional Ordinary LP'], ['partnership EIN', '12-3456789'], ['return owner', 'primary'], ['original recipient name', 'Jordan Example'], ['recipient taxpayer identifier last four digits', '3333'], ['original K1 reference', 'Private original K1'], ['actual qualified statement', 'schedule_k3_1065'], ['qualified K3 and country detail reference', 'Private K3 original and Canada detail'], ['actual foreign country', 'Canada'], ['actual foreign income category', 'passive'], ['original interest', '20000'], ['original ordinary dividends', '0'], ['original qualified-dividend subset', '0'], ['actual foreign gross income', '20000'], ['actual foreign tax', '900'], ['opening outside basis', '10000'], ['opening outside basis reference', 'Private opening basis'], ['allocated foreign deductions', '0'], ['allocated foreign interest expense', '0'], ['allocated other expenses', '0'], ['tax reductions', '0'], ['redetermination amount', '0'], ['is an actual calendar-year partnership', 'true'], ['original entity-paid taxes are reported in USD', 'true'], ['USD paid-tax original reference', 'Private PartIII section4 original USD paid tax details'], ['is an actual continuing domestic non-PTP partnership', 'true'], ['has only portfolio interest and dividends outside the ordinary course of business, all foreign and passive category', 'true'], ['has known zero other boxes, including business, rental, capital gains or losses, self-employment, QBI, deductions, distributions, withholding, credits and AMT items', 'true'], ['has no other basis changes, including contributions or liability changes', 'true'], ['has no prior basis-suspended amounts, including foreign tax', 'true'], ['has no prior at-risk-suspended amounts', 'true'], ['has no prior passive-suspended amounts', 'true']
        ])
            await panel.change(`K3 1 ${label}`, value);
        await panel.click('Add K3 1 entity-paid tax detail');
        await panel.change('K3 1 entity-paid detail 1 date', '2025-09-15');
        await panel.change('K3 1 entity-paid detail 1 USD amount', '900');
        await panel.change('K3 1 original facts checked after the last edit', 'true');
        await panel.click('Add ordinary foreign income statement');
        await panel.change('Ordinary income statement 1', 'scheduleK1:0');
        await panel.change('Ordinary income 1 passive group', 'withholding_under_15');
        await panel.change('Ordinary credit sources checked after the last edit', 'true');
        await panel.change('Foreign-tax election sources checked after the last edit', 'true');
        expect(buildTaxInputFromGuidedData(current)).not.toBeNull();
        await panel.change('K3 1 allocated foreign deductions', '0.01');
        expect(panel.control('K3 1 original facts checked after the last edit').value).toBe('');
        expect(panel.control('Ordinary credit sources checked after the last edit').value).toBe('');
        expect(buildTaxInputFromGuidedData(current)).toBeNull();
    }
    finally {
        await panel.dispose();
    }
});

it('retains incompatible originals when visibly switching from ordinary to direct', async () => {
    const { guidedForeignTaxK3Fixture } = await import('../../fixtures/guided-foreign-tax-k3');
    const { buildGuidedForeignTaxK3Sources } = await import('@/lib/guided-foreign-tax-k3');
    const fixture = guidedForeignTaxK3Fixture();
    let current = fixture.state;
    const initialAnnual = required(required(current.sectionData['other-taxes']).foreignTaxElection);
    initialAnnual.creditWithoutForm1116 = undefined;
    initialAnnual.creditWithForm1116 = {};
    Object.assign(fixture.k3, { foreignDeductions: '0' });
    function Harness() {
        const [state, setState] = useState(current);
        const other = required(state.sectionData['other-taxes']);
        return <ForeignTaxElectionDetails data={other.foreignTaxElection} investment={state.sectionData['income-investments']} onChange={foreignTaxElection => { current = updateSectionData(state, 'other-taxes', { ...other, foreignTaxElection }); setState(current); }} />;
    }
    const panel = await mountGuidedPanel(<Harness />);
    try {
        expect(panel.control('K3 1 allocated foreign deductions').value).toBe('0');
        await panel.click('Remove ordinary Form 1116 worksheet');
        await panel.click('Add election without Form 1116');
        await panel.change('K3 1 original facts checked after the last edit', 'true');
        const original = required(required(required(current.sectionData['other-taxes']).foreignTaxElection).qualifiedK3Statements)[0];
        expect(original.foreignDeductions).toBe('0');
        expect(() => buildGuidedForeignTaxK3Sources(current)).toThrow(/unsupported source field/);
    } finally { await panel.dispose(); }
});
