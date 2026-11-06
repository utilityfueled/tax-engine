// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1CharitableSourceDetails } from '@/components/guided-interview/k1-charitable-source-details';
import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import { guidedFirstAdmissionState } from '../../fixtures/guided-k1-charitable-first-admission';

it('collects annual admission originals without creating unknown links or amounts', async () => {
  // Spec: K1 Charitable First Admission, source-editor.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let latest: K1CharitableSourcesData | undefined = guidedFirstAdmissionState().sectionData.deductions!.k1CharitableSources!;
  delete latest.statements![0].basis!.priorBasisSuspensions![0].section170AdmissionSources;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  function Harness() { const [data, setData] = useState(latest); return <K1CharitableSourceDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  const prefix = 'Charitable K-1 1 prior basis origin 1 section170 admission';
  const source = () => latest?.statements?.[0].basis?.priorBasisSuspensions?.[0].section170AdmissionSources;
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
  }
  async function change(label: string, value: string) {
    const field = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    await click(`Add ${prefix} records`); expect(source()).toEqual({});
    await click(`Add ${prefix} year`);
    expect(source()?.records?.[0]).toEqual({});
    await change(`${prefix} year 1 tax year`, '2018');
    await click(`Record no ${prefix} year 1 regular carries`);
    expect(source()?.records?.[0].regularCarryoverSourceIds).toEqual([]);
    expect(source()?.records?.[0].alternativeCarryoverSourceIds).toBeUndefined();
    await click(`Add ${prefix} year 1 alternative carry`);
    await change(`${prefix} year 1 alternative carry 1 source ID`, 'actual-alternative-origin');
    await change(`${prefix} checked after the last edit`, 'true');
    expect(source()?.sourceFactsConfirmed).toBe(true);
    await change(`${prefix} year 1 basis worksheet reference`, 'Actual replacement annual original');
    expect(source()?.sourceFactsConfirmed).toBeNull(); expect(latest?.sourceFactsConfirmed).toBeNull();
    await click(`Remove ${prefix} records`); expect(source()).toBeUndefined();
    expect(element.querySelector('input[type="number"]')).toBeNull();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
