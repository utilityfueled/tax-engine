// @vitest-environment jsdom
// Spec: spec/federal/guided-investment-interest.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { InvestmentInterestSourceDetails } from '@/components/guided-interview/investment-interest-source-details';
import type { InvestmentInterestSourceData } from '@/lib/guided-investment-interest';
import { actualInvestmentInterestSources, investmentInterestChild } from '../../fixtures/guided-investment-interest';
it('collects exact regular and AMT sources without copying unknown amounts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: InvestmentInterestSourceData | undefined;
  const children = [structuredClone(investmentInterestChild)], before = JSON.stringify(children);
  function Harness() { const [data, setData] = useState(latest); return <InvestmentInterestSourceDetails data={data} childEntries={children} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) { const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add investment-interest source worksheets'); await click('Add regular worksheet');
    expect(latest?.regular).toEqual({}); expect(latest?.amt).toBeUndefined();
    await change('Regular gross investment income', '9007199254740993.03'); await change('Regular net investment-property gain', '-300.25');
    await click('Add regular parent and child partition'); await click('Copy actual child identities into regular partition');
    expect(latest?.regular?.childIncomeSources?.children?.[0]).toMatchObject({ sourceId: 'form8814:0', ssnLast4: '6701' });
    expect(latest?.regular?.childIncomeSources?.parentGrossInvestmentIncome).toBeUndefined();
    await change('Regular parent gross investment income excluding children', '0');
    await change('Regular child partition checked after the last edit', 'true');
    await change('Regular investment worksheet checked after the last edit', 'true');
    expect(latest?.regular?.sourceFactsConfirmed).toBe(true); expect(latest?.regular?.childIncomeSources?.sourceFactsConfirmed).toBe(true);
    await click('Add AMT worksheet'); expect(latest?.amt).toEqual({});
    await change('Regular gross investment income', ''); expect(latest?.regular?.grossInvestmentIncome).toBe(''); expect(latest?.regular?.sourceFactsConfirmed).toBeNull();
    expect(latest?.regular?.netGainFromInvestmentProperty).toBe('-300.25'); expect(JSON.stringify(children)).toBe(before);
    await click('Remove investment-interest source worksheets'); expect(latest).toBeUndefined(); expect(JSON.stringify(children)).toBe(before);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
it('keeps election and child evidence while editing each worksheet source', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: InvestmentInterestSourceData | undefined = structuredClone(actualInvestmentInterestSources);
  function Harness() { const [data, setData] = useState(latest); return <InvestmentInterestSourceDetails data={data} childEntries={[investmentInterestChild]} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) { const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  try {
    await act(async () => root.render(<Harness />));
    await change('Regular investment worksheet tax year', '2026'); await change('Regular investment worksheet source reference', 'Actual changed source');
    await change('Regular prior carryforward source year', '2025'); await change('Regular investment expenses are deductible on this return', 'false');
    await change('Regular preferential-income election allocation', 'explicit'); await change('Regular explicit elected net capital gain', '123.45');
    await change('Regular preferential-income election allocation', 'capital_first');
    expect(latest?.regular?.electedNetCapitalGain).toBe('123.45'); expect(latest?.regular?.sourceFactsConfirmed).toBeNull();
    await change('Regular child partition tax year', '2026'); await change('Regular child partition source reference', 'Partition original');
    await change('Regular child 1 original source reference', 'Child original changed'); await change('Regular child 1 date of birth', '2012-05-11');
    await change('Regular parent sources exclude all elected children', 'false');
    expect(latest?.regular?.childIncomeSources?.children?.[0]?.sourceReference).toBe('Child original changed');
    expect(latest?.regular?.childIncomeSources?.parentSourcesExcludeAllChildrenConfirmed).toBe(false);
    expect(latest?.regular?.investmentExpensesDeductibleConfirmed).toBe(false);
    expect(latest?.amt?.sourceTaxYear).toBe('2025'); expect(latest?.amt?.childIncomeSources?.sourceFactsConfirmed).toBe(true);
    await click('Remove regular parent and child partition'); expect(latest?.regular?.childIncomeSources).toBeUndefined();
    await click('Remove AMT worksheet'); expect(latest?.amt).toBeUndefined();
    await click('Remove regular worksheet'); expect(latest?.regular).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
