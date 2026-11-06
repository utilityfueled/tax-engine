// @vitest-environment jsdom
// Spec: spec/federal/guided-k1-passive-distribution.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1CharitableSourceDetails } from '@/components/guided-interview/k1-charitable-source-details';
import { actualGuidedK1PassiveDistribution } from '../../fixtures/guided-k1-passive-distribution';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
it('collects original passive valuation and event rows without defaults', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: K1CharitableSourcesData | undefined = actualGuidedK1PassiveDistribution().charity;
  if (!latest.statements?.[0]?.cashDistribution) throw new Error('Missing fictional distribution');
  latest.statements[0].cashDistribution.passiveActivity = undefined;
  const original = structuredClone(latest.statements[0].original), basis = structuredClone(latest.statements[0].basis?.currentContributions);
  function Harness() { const [data, setData] = useState(latest); return <K1CharitableSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  const packet = () => latest?.statements?.[0].cashDistribution?.passiveActivity;
  const prefix = 'Charitable K-1 1 passive valuation';
  async function click(label: string) { const button = [...element.querySelectorAll('button')].find(n => n.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const field = [...element.querySelectorAll('label')].find(n => n.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click('Add Charitable K-1 1 passive activity report'); expect(packet()).toEqual({});
    await click(`Add ${prefix} annual activity`); expect(packet()?.activityEvents).toEqual([{}]);
    await click(`Add ${prefix} asset`); expect(packet()?.assets).toEqual([{}]);
    await change(`${prefix} annual activity 1 original source ID`, 'original-activity-17');
    await change(`${prefix} annual activity 1 property disposed value`, '0.00');
    await change(`${prefix} asset 1 owner basis adjustment`, '-1.25');
    await change(`${prefix} asset 1 actual property character`, 'portfolio');
    await change(`${prefix} asset 1 continuously used in this passive activity`, 'false');
    expect(packet()?.activityEvents?.[0]).toMatchObject({ sourceId: 'original-activity-17', propertyDisposedValue: '0.00' });
    expect(packet()?.assets?.[0]).toMatchObject({ ownerBasisAdjustment: '-1.25', character: 'portfolio', continuousPassiveUseConfirmed: false });
    expect(packet()?.sourceTaxYear).toBeUndefined(); expect(packet()?.assets?.[0].sourceId).toBeUndefined();
    await change(`${prefix} checked after the last edit`, 'true'); expect(packet()?.sourceFactsConfirmed).toBe(true);
    await change(`${prefix} asset 1 acquired date`, '2020-01-01'); expect(packet()?.sourceFactsConfirmed).toBeNull();
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.statements?.[0].cashDistribution?.sourceFactsConfirmed).toBeNull();
    await change(`${prefix} asset 1 continuously used in this passive activity`, ''); expect(packet()?.assets?.[0].continuousPassiveUseConfirmed).toBeNull();
    await change('Charitable K-1 1 distribution actual underlying activity', 'mixed_or_other');
    expect(element.textContent).toContain(`${prefix} asset 1`); expect(packet()?.assets?.[0].character).toBe('portfolio');
    await click(`Add ${prefix} asset`); expect(packet()?.assets?.[1]).toEqual({});
    await click(`Remove ${prefix} asset 2`); expect(packet()?.assets).toHaveLength(1);
    await click(`Remove ${prefix} annual activity 1`); expect(packet()?.activityEvents).toEqual([]);
    expect(element.querySelector('input[type="number"]')).toBeNull();
    expect([...element.querySelectorAll('.guided-field-label')].map(n => n.textContent).filter(n => n?.startsWith(prefix))).not.toContain(`${prefix} calculated gain`);
    await click('Remove Charitable K-1 1 passive activity report'); expect(packet()).toBeUndefined();
    expect(latest?.statements?.[0].original).toEqual(original); expect(latest?.statements?.[0].basis?.currentContributions).toEqual(basis);
  } finally { await act(async () => root.unmount()); element.remove(); }
});
