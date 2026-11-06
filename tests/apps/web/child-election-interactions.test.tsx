// @vitest-environment jsdom
// Spec: spec/federal/guided-child-election.yaml.
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ChildElectionCards } from '@/components/guided-interview/child-election-details';
import { childElectionFactErrors, type ChildElectionData } from '@/lib/guided-child-election-facts';
import { actualGuidedChild } from '../../fixtures/guided-child-election';
let container: HTMLDivElement, root: Root, latest: ChildElectionData[];
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function change(label: string, value: string) {
  const control = [...container.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
  if (!control) throw new Error(`Missing ${label}`);
  await act(async () => { Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function click(label: string) { const button = [...container.querySelectorAll('button')].find(node => node.textContent?.trim() === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
it('collects and edits actual child and preference sources', async () => {
  latest = [structuredClone(actualGuidedChild)];
  function Harness() { const [entries, setEntries] = useState(latest); return <ChildElectionCards entries={entries} onChange={next => { latest = next; setEntries(next); }} />; }
  await act(async () => root.render(<Harness />));
  await change('Child taxable interest', '4000.26');
  expect(latest[0]?.taxableInterest).toBe('4000.26'); expect(latest[0]?.sourceFactsConfirmed).toBeNull();
  await change('Child federal income tax withheld', ''); expect(childElectionFactErrors(latest, 2025)).toHaveProperty('childElectionSources');
  await change('Child federal income tax withheld', '0');
  await change('Child statement 1 specified preference', '125.11'); expect(latest[0]?.amtFactsConfirmed).toBeNull();
  await change('Have you checked every child AMT statement?', 'true');
  await change('Have you reviewed all child election sources?', 'true'); expect(childElectionFactErrors(latest, 2025)).toEqual({});
  await change('Did the child receive Alaska Permanent Fund dividends?', 'true');
  await change('Have you reviewed all child election sources?', 'true'); expect(childElectionFactErrors(latest, 2025).childElectionSources).toMatch(/actual.*source reference/i);
  await change('Child ordinary dividends', '2000');
  await change('Child Alaska Permanent Fund dividends included in ordinary dividends', '2000');
  await change('Child income character source reference', 'Actual Alaska dividend statement');
  await change('Have you reviewed all child election sources?', 'true'); expect(childElectionFactErrors(latest, 2025)).toEqual({});
  expect(latest[0]?.amtStatements?.[0]?.specifiedPrivateActivityBondInterest).toBe('125.11');
  await click('Add child statement'); expect(latest[0]?.amtStatements).toHaveLength(2);
  await click('Remove child statement 2'); expect(latest[0]?.amtStatements).toHaveLength(1);
  await click('Add child election'); expect(latest).toHaveLength(2); expect(latest[1]).toEqual({});
  await click('Remove child election 2'); expect(latest).toHaveLength(1);
});
