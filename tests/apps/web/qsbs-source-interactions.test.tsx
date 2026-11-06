// @vitest-environment jsdom
// Spec: spec/federal/guided-qsbs-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { QsbsSourceDetails } from '@/components/guided-interview/qsbs-source-details';
import type { QsbsSourceData } from '@/lib/guided-qsbs-sources';
it('collects issuer history and original lots without guessed eligibility', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: QsbsSourceData | undefined;
  function Harness() { const [data, setData] = useState(latest); return <QsbsSourceDetails data={data} investments={{ brokerageEntries: [], dividendEntries: [] }} onChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) { const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select'); if (!input) throw new Error(`Missing ${label}`); await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); }); }
  try {
    await act(async () => root.render(<Harness />)); await click('Add actual QSBS issuer sources'); expect(latest).toEqual({});
    await click('Add issuer history'); expect(latest?.issuers).toEqual([{}]);
    await change('Issuer 1 prior eligible gain before exclusion', '9007199254740993.03'); await click('Add Issuer 1 prior return');
    expect(latest?.issuers?.[0]?.priorReturns).toEqual([{}]);
    await change('Issuer 1 prior return 1 tax year', '2020'); await change('Issuer 1 prior return 1 eligible gain used', '0');
    await change('Issuer 1 prior return 1 primary first name', 'Jordan');
    await click('Add Issuer 1 prior return 1 spouse identity'); await change('Issuer 1 prior return 1 spouse ID last four', '6666');
    await click('Add Issuer 1 gain allocation'); await change('Issuer 1 allocation 1 ordinary eligible gain', '0');
    expect(latest?.issuers?.[0]?.eligibleGainAllocations?.[0]?.empowermentEligibleGain).toBeUndefined();
    await click('Add original issuer lot'); expect(latest?.lots).toEqual([{}]);
    await change('Lot 1 original proceeds', '9007199254740993.03'); await change('Lot 1 original cost basis', '0');
    await change('Lot 1 original wash-sale amount', '0'); await change('Lot 1 original wash-sale answer', 'false');
    await change('Lot 1 acquisition method', 'original_issue'); await change('Lot 1 domestic C corporation at issue', 'false');
    expect(latest?.lots?.[0]?.qualification?.domesticCCorporationAtIssue).toBe(false); expect(latest?.lots?.[0]?.qualification?.activeBusinessRequirementSatisfied).toBeUndefined();
    await click('Add Lot 1 fund ownership sources'); expect(latest?.lots?.[0]?.passThrough).toEqual({});
    await change('Lot 1 original ownership percentage', '1.00000001'); await change('Lot 1 original entity recognized gain', '1000.01');
    await change('QSBS sources checked after the last edit', 'true'); expect(latest?.sourceFactsConfirmed).toBe(true);
    await change('Lot 1 issuer ID', 'actual-issuer'); expect(latest?.sourceFactsConfirmed).toBeNull();
    expect(latest?.lots?.[0]?.proceeds).toBe('9007199254740993.03');
    await change('Lot 1 original cost basis', ''); expect(latest?.lots?.[0]?.costBasis).toBe('');
    await click('Remove Lot 1 fund ownership sources'); expect(latest?.lots?.[0]?.passThrough).toBeUndefined();
    await click('Remove Issuer 1 prior return 1 spouse identity'); expect(latest?.issuers?.[0]?.priorReturns?.[0]?.spouse).toBeUndefined();
    await click('Remove Issuer 1 allocation 1'); expect(latest?.issuers?.[0]?.eligibleGainAllocations).toEqual([]);
    await click('Use no explicit allocation for Issuer 1'); expect(latest?.issuers?.[0]?.eligibleGainAllocations).toBeUndefined();
    await click('Record no prior returns for Issuer 1'); expect(latest?.issuers?.[0]?.priorReturns).toEqual([]);
    await click('Remove Lot 1'); expect(latest?.lots).toEqual([]);
    await click('Remove Issuer 1'); expect(latest?.issuers).toEqual([]);
    await click('Remove QSBS source packet'); expect(latest).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
