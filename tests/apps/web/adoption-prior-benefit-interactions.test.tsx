// @vitest-environment jsdom
// Spec: spec/federal/guided-adoption-prior-benefits.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { AdoptionSourceDetails } from '@/components/guided-interview/adoption-source-details';
import type { AdoptionCreditData } from '@/lib/guided-adoption-facts';
it('collects actual adoption history without defaulting source facts', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: AdoptionCreditData = { children: [{ isForeignAdoption: true }] };
  function Harness() { const [data, setData] = useState(latest); return <AdoptionSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); await click('Add historical employer-benefit sources');
    expect(latest.children[0].priorYearForeignBenefitHistory).toEqual({});
    await click('Add original prior benefit statement'); expect(latest.children[0].priorYearForeignBenefitHistory?.records).toEqual([{}]);
    await change('Prior benefit 1 original benefits', '1000.10'); await change('Prior benefit 1 amount allocated to this child', '0');
    await change('Prior benefit 1 allocated amount was included in prior income', 'false');
    expect(latest.children[0].priorYearForeignBenefitHistory?.records?.[0]).toMatchObject({ originalEmployerBenefits: '1000.10', benefitsAllocatedToChild: '0', allocatedBenefitsIncludedInPriorIncome: false });
    expect(latest.children[0].priorYearForeignBenefitHistory?.records?.[0].taxYear).toBeUndefined();
    await change('Historical benefit sources checked after the last edit', 'true');
    await change('Prior benefit 1 actual receipt year', '2024');
    expect(latest.children[0].priorYearForeignBenefitHistory?.sourceFactsConfirmed).toBeNull();
    await change('Historical benefit sources checked after the last edit', 'true');
    await change("Child's actual first name", 'Sam');
    expect(latest.children[0].priorYearForeignBenefitHistory?.sourceFactsConfirmed).toBeNull();
    await change('Prior benefit 1 allocated amount was included in prior income', '');
    expect(latest.children[0].priorYearForeignBenefitHistory?.records?.[0].allocatedBenefitsIncludedInPriorIncome).toBeNull();
    expect(element.querySelector('input[type="number"]')).toBeNull();
    await click('Remove historical employer-benefit sources'); expect(latest.children[0].priorYearForeignBenefitHistory).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
