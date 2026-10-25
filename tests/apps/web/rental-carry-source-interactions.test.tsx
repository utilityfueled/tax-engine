// @vitest-environment jsdom
// Spec: spec/federal/guided-rental-carry-sources.yaml controls.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionRentalIncome } from '@/components/guided-interview/section-rental-income';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { actualGuidedRentalCarry } from '../../fixtures/guided-rental-carry';
import { completeRentalSource, startCompleteInterview } from '../../guided-interview/complete-facts';

it('collects actual loss history and preserves unknown comparison facts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['rental'], lifeEvents: [], stateCode: null });
  latest.sectionData['income-rental'] = { entries: [{ ...completeRentalSource, priorYearUnallowedLoss: '3000', priorLossSources: structuredClone(actualGuidedRentalCarry) }] };
  function Harness() { const [state, setState] = useState(latest); return <SectionRentalIncome entries={state.sectionData['income-rental']?.entries ?? []}
    onEntriesChange={entries => { latest = updateSectionData(state, 'income-rental', { entries }); setState(latest); }} />; }
  function control(label: string) { const node = [...container.querySelectorAll('label')].find(item => item.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!node) throw new Error(`Missing ${label}`); return node; }
  async function change(label: string, value: string) { const node = control(label); await act(async () => { Object.getOwnPropertyDescriptor(node.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(node, value); node.dispatchEvent(new Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(item => item.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  const packet = () => latest.sectionData['income-rental']?.entries[0].priorLossSources;
  try {
    await act(async () => root.render(<Harness />));
    expect(validateSection(latest, 'income-rental').status).toBe('complete');
    await change('Loss year 1 original suspended loss', '9007199254740993');
    expect(packet()?.vintages?.[0]?.originalLoss).toBe('9007199254740993');
    expect(packet()?.sourceFactsConfirmed).toBeNull();
    await change('Loss year 1 remaining qualified loss', '0');
    expect(packet()?.vintages?.[0]?.qualifiedRemainingLoss).toBe('0');
    await change('Loss year 1 remaining qualified loss', '');
    expect(packet()?.vintages?.[0]?.qualifiedRemainingLoss).toBe('');
    await change('AMT prior suspended loss matches the regular filed carry', 'false');
    expect(packet()?.amtPriorLossMatches).toBe(false);
    await change('AMT prior suspended loss matches the regular filed carry', '');
    expect(packet()?.amtPriorLossMatches).toBeNull();
    await change('AMT prior suspended loss matches the regular filed carry', 'true');
    await change('Loss year 1 original suspended loss', '5000'); await change('Loss year 1 remaining qualified loss', '3000');
    await change('Rental carry sources checked after the last edit', 'true');
    await change('Have you checked the actual property, ownership, use, income and expense facts after the latest edits?', 'true');
    expect(validateSection(latest, 'income-rental').status).toBe('complete');
    await click('Add originating loss year');
    expect(packet()?.vintages?.[1]).toEqual({}); expect(control('Loss year 2 original suspended loss').value).toBe('');
    await click('Remove loss year 2');
    expect(packet()?.vintages).toHaveLength(1);
    await click('Remove rental carry sources');
    expect(packet()).toBeUndefined(); expect(validateSection(latest, 'income-rental').status).toBe('partial');
    await click('Add actual rental carry sources');
    expect(packet()).toEqual({});
    expect(control('Carry source return tax year').value).toBe(''); expect(control('Original rental owner name').value).toBe('');
    expect(control('AMT prior suspended loss matches the regular filed carry').value).toBe('');
  } finally { await act(async () => root.unmount()); container.remove(); }
});
