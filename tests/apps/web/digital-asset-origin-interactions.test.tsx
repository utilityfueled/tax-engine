// @vitest-environment jsdom
// Spec: spec/federal/form-1099-da-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { DigitalAssetSourceCards } from '@/components/guided-interview/digital-asset-source-details';
import type { DigitalAssetEntryData } from '@/lib/guided-digital-asset-facts';

function render() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const state: { latest: DigitalAssetEntryData[] } = { latest: [{ transactions: [{}] }] };
  function Harness() { const [entries, setEntries] = useState(state.latest); return <DigitalAssetSourceCards entries={entries} stateCode={null} onChange={value => { state.latest = value; setEntries(value); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  }
  return { container, root, state, Harness, change };
}
const row = (state: { latest: DigitalAssetEntryData[] }) => state.latest[0]!.transactions![0]!;
const text = 'DA 1 sale 1';

it('collects gift facts and clears them when the row changes', async () => {
  const { container, root, state, Harness, change } = render();
  await act(async () => root.render(<Harness />));
  await change(`${text} — Actual original acquisition`, 'gift');
  await change(`${text} — This came from a spouse, or a former spouse in a divorce`, 'false');
  await change(`${text} — Donor's adjusted basis, plus any gift tax you may add, or 0 if it cannot be documented`, '10,000');
  await change(`${text} — Value on the gift date`, '8,000');
  await change(`${text} — Gift date`, '2023-03-01');
  await change(`${text} — Records support the donor's basis, the value and the gift date`, 'true');
  await change(`${text} — Records show how long the donor held it`, 'true');
  expect(row(state)).toMatchObject({ assetOrigin: 'gift', giftFromSpouse: false, giftDonorBasis: '10,000', giftFairMarketValue: '8,000', giftDate: '2023-03-01', giftSourceConfirmed: true, giftHoldingDocumented: true });
  expect(container.textContent).not.toContain('separate acquisition');
  await change(`${text} — Completed taxpayer cost basis`, '1');
  expect(row(state)).toMatchObject({ giftSourceConfirmed: null, giftHoldingDocumented: null, giftDate: '2023-03-01' });
  expect(container.textContent).toContain('separate acquisition');
  await act(async () => root.unmount()); container.remove();
});

it('asks only the answer for the origin in use', async () => {
  const { container, root, state, Harness, change } = render();
  await act(async () => root.render(<Harness />));
  const asked = (phrase: string) => [...container.querySelectorAll('.guided-field-label')].some(node => node.textContent?.includes(phrase));
  expect([asked('decedent'), asked('Gift date'), asked('reported as income')]).toEqual([false, false, false]);
  await change(`${text} — Actual original acquisition`, 'staking');
  expect([asked('decedent'), asked('Gift date'), asked('reported as income')]).toEqual([false, false, true]);
  await change(`${text} — Its value when received was reported as income, and that amount is the basis above`, 'true');
  expect(row(state)).toMatchObject({ assetOrigin: 'staking', originIncomeIncludedConfirmed: true });
  expect(container.textContent).not.toContain('separate acquisition');
  await change(`${text} — Actual original acquisition`, 'inheritance');
  expect(row(state).originIncomeIncludedConfirmed).toBeNull();
  expect([asked('decedent'), asked('Gift date'), asked('reported as income')]).toEqual([true, false, false]);
  await change(`${text} — The basis above is the value at the decedent's death, or the elected alternate value`, 'true');
  expect(row(state)).toMatchObject({ assetOrigin: 'inheritance', inheritedBasisConfirmed: true });
  await act(async () => root.unmount()); container.remove();
});
