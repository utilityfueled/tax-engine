// @vitest-environment jsdom
// Spec: spec/federal/foreign-tax-direct-credit.yaml, guided-portfolio-k3.
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { ForeignTaxElectionDetails } from '@/components/guided-interview/foreign-tax-election-details';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedForeignTaxK3Fixture } from '../../fixtures/guided-foreign-tax-k3';
import { mountGuidedPanel } from './guided-panel-dom';

it('collects original K3 facts through actual controls and retains originals when clearing the annual choice', async () => {
  const fixture = guidedForeignTaxK3Fixture();
  fixture.facts.qualifiedK3Statements = [];
  let current = fixture.state;
  function Harness() {
    const [state, setState] = useState(fixture.state);
    const other = state.sectionData['other-taxes'];
    return <ForeignTaxElectionDetails data={other?.foreignTaxElection} investment={state.sectionData['income-investments']} onChange={foreignTaxElection => {
      if (!other) throw new Error('Explicit fictional annual facts missing');
      current = updateSectionData(state, 'other-taxes', { ...other, foreignTaxElection });
      setState(current);
    }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  try {
    await panel.click('Add original partnership K1 and K3');
    expect(panel.control('K3 1 original interest').value).toBe('');
    expect(panel.control('K3 1 has no prior basis-suspended amounts, including foreign tax').value).toBe('');
    expect(buildTaxInputFromGuidedData(current)).toBeNull();
    for (const [label, value] of [
      ['original tax year', '2025'], ['entity type', 'partnership'], ['partnership name', 'Fictional Portfolio LP'], ['partnership EIN', '12-3456789'],
      ['return owner', 'primary'], ['original recipient name', 'Jordan Example'], ['recipient taxpayer identifier last four digits', '3333'],
      ['original K1 reference', 'Synthetic original portfolio K1'], ['actual qualified statement', 'schedule_k3_1065'],
      ['qualified K3 and country detail reference', 'Synthetic original Schedule K3 and country detail'], ['actual foreign country', 'Canada'], ['actual foreign income category', 'passive'],
      ['original interest', '100.00'], ['original ordinary dividends', '40.00'], ['original qualified-dividend subset', '20.00'],
      ['actual foreign gross income', '140.00'], ['actual foreign tax', '50.00'], ['opening outside basis', '100.00'],
      ['opening outside basis reference', 'Synthetic opening outside basis worksheet'],
      ['is an actual continuing domestic non-PTP partnership', 'true'], ['has only portfolio interest and dividends outside the ordinary course of business, all foreign and passive category', 'true'],
      ['has known zero other boxes, including business, rental, capital gains or losses, self-employment, QBI, deductions, distributions, withholding, credits and AMT items', 'true'],
      ['has no other basis changes, including contributions or liability changes', 'true'], ['has no prior basis-suspended amounts, including foreign tax', 'true'],
      ['has no prior at-risk-suspended amounts', 'true'], ['has no prior passive-suspended amounts', 'true'], ['original facts checked after the last edit', 'true'],
    ]) await panel.change(`K3 1 ${label}`, value);
    await panel.change('Direct-credit election facts checked after the last edit', 'true');
    await panel.change('Foreign-tax election sources checked after the last edit', 'true');
    expect(validateSection(current, 'other-taxes').status).toBe('complete');
    expect(buildTaxInputFromGuidedData(current)?.scheduleK1[0].foreignTaxPaid).toBe('50');
    expect(panel.container.textContent).not.toContain('Add payment for source 2');
    await panel.change('K3 1 original interest', '100.01');
    expect(panel.control('K3 1 original facts checked after the last edit').value).toBe('');
    expect(panel.control('Direct-credit election facts checked after the last edit').value).toBe('');
    expect(panel.control('Foreign-tax election sources checked after the last edit').value).toBe('');
    expect(buildTaxInputFromGuidedData(current)).toBeNull();
    await panel.click('Clear annual choice and keep K3 originals');
    expect(current.sectionData['other-taxes']?.foreignTaxElection?.qualifiedK3Statements?.[0].interestIncome).toBe('100.01');
    expect(buildTaxInputFromGuidedData(current)).toBeNull();
  } finally { await panel.dispose(); }
});
