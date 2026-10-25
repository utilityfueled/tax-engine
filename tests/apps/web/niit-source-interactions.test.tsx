// @vitest-environment jsdom
// Spec: spec/federal/guided-niit-ordinary-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { NiitSourceDetails } from '@/components/guided-interview/niit-source-details';
import { buildGuidedNiitSources, type NiitSourceData } from '@/lib/guided-niit-facts';
import { completeRetirementSource } from '../../guided-interview/complete-facts';

it('collects actual NIIT source records and resets confirmation after edits', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: NiitSourceData | undefined;
  const retirement = { ...completeRetirementSource, distributionCode: '7D' };
  function Harness() { const [data, setData] = useState<NiitSourceData>(); return <NiitSourceDetails data={data} entries={[retirement]} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(item => item.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(item => item.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    if (!setter) throw new Error('Missing setter');
    await act(async () => { setter.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add NIIT source worksheet');
    expect(latest?.sourceTaxYear).toBeUndefined(); expect(latest?.sourceFactsConfirmed).toBeUndefined();
    await change('NIIT source tax year', '2025'); await change('NIIT source worksheet reference', 'Actual worksheet');
    await click('Add annuity classification');
    expect(latest?.annuities?.[0].classification).toBeUndefined();
    await change('Actual retirement statement 1', 'form1099R:0');
    expect(latest?.annuities?.[0]).toMatchObject({ payerName: retirement.payer, payerTin: retirement.payerTin, accountReference: retirement.accountReference, owner: 'primary', grossDistribution: '1000' });
    await change('Statement 1 NIIT classification', 'nonqualified_annuity');
    await change('Statement 1 contract or plan reference', 'Actual insurer contract');
    await change('NIIT sources checked after the last edit', 'true');
    expect(buildGuidedNiitSources(latest, [retirement], 2025, 'single')?.annuities?.[0].classification).toBe('nonqualified_annuity');
    await click('Add allocable tax worksheet');
    expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.ordinaryTaxAllocation?.incomeOrSalesTaxes?.investmentAllocableAmount).toBeUndefined();
    await change('Income or elected sales taxes investment allocation', '9007199254740993.03');
    expect(latest?.ordinaryTaxAllocation?.incomeOrSalesTaxes?.investmentAllocableAmount).toBe('9007199254740993.03');
    await change('NIIT sources checked after the last edit', 'true');
    await change('Tax allocation method and source explanation', 'Actual source method');
    expect(latest?.sourceFactsConfirmed).toBeNull();
    await click('Remove NIIT source worksheet'); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); container.remove(); }
});
