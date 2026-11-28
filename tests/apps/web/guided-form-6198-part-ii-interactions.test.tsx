// @vitest-environment jsdom
// Spec: spec/federal/2026/form-6198-guided-part-ii.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionAdjustments } from '@/components/guided-interview/section-adjustments';
import { setInterviewTaxYear, startInterview, updateSectionData, type AdjustmentData } from '@/lib/guided-interview-flow';

it('collects ordinary Part II facts in 2026 and exposes retained drafts for removal', async () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let latest: AdjustmentData | undefined;

  function Harness() {
    const [state, setState] = useState(() => startInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: ['k1-loss-sources'], stateCode: null }, 2026));
    return <>
      <button type="button" onClick={() => setState(setInterviewTaxYear(state, 2025))}>Switch to 2025</button>
      <SectionAdjustments data={state.sectionData.adjustments} taxYear={state.taxYear} hasK1LossSources
        hasSelfEmployment={false} hasStudentLoans={false} hasHsa={false} filingStatus="single" onDataChange={data => {
          const next = updateSectionData(state, 'adjustments', data);
          latest = next.sectionData.adjustments;
          setState(next);
        }} />
    </>;
  }
  const button = (label: string) => [...container.querySelectorAll('button')].find(element => element.textContent === label);
  const field = (label: string) => [...container.querySelectorAll('label')].find(element => element.querySelector('span')?.textContent === label)
    ?.querySelector<HTMLInputElement>('input');
  async function change(label: string, value: string) {
    const input = field(label);
    if (!input) throw new Error(`Expected input for ${label}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  try {
    await act(async () => root.render(<Harness />));
    const add = button('Add ordinary Form 6198 Part II records');
    expect(add).toBeDefined();
    await act(async () => add?.click());
    expect(latest?.form6198PartII).toEqual({});
    const increases = field('Form 6198 line 7 increases');
    expect(increases?.value).toBe('');
    await change('Form 6198 line 7 increases', '0.00');
    expect(latest?.form6198PartII?.increases).toBe('0.00');
    expect(latest?.form6198PartII?.decreases).toBeUndefined();
    expect(latest?.form6198PartII?.currentOutsideBasis).toBeUndefined();
    const addOutsideBasis = button('Add current outside-basis workpaper');
    expect(addOutsideBasis).toBeDefined();
    await act(async () => addOutsideBasis?.click());
    expect(field('Current adjusted outside basis available for losses')?.value).toBe('');
    await change('Current outside-basis workpaper reference', 'Actual year-end worksheet');
    await change('Current adjusted outside basis available for losses', '0.00');
    expect(latest?.form6198PartII?.currentOutsideBasis).toEqual({ reference: 'Actual year-end worksheet', availableForLosses: '0.00' });
    await act(async () => button('Switch to 2025')?.click());
    expect(field('Form 6198 line 7 increases')?.value).toBe('0.00');
    expect(field('Current adjusted outside basis available for losses')?.value).toBe('0.00');
    expect(container.textContent).toContain('These saved Form 6198 records require a 2026 return.');
    const remove = button('Remove ordinary Form 6198 Part II records');
    expect(remove).toBeDefined();
    await act(async () => remove?.click());
    expect(latest?.form6198PartII).toBeUndefined();
    expect(button('Add ordinary Form 6198 Part II records')).toBeUndefined();
    expect(button('Add K-1 and qualified loss sources')).toBeDefined();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
