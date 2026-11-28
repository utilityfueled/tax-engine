// @vitest-environment jsdom
// Spec: spec/federal/2026/form-6198-schedule-c-guided.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { BusinessSourceDetails } from '@/components/guided-interview/business-source-details';
import type { BusinessSourceData } from '@/lib/guided-business-facts';

it('collects separate actual Form 6198 originals and preserves a known zero', async () => {
  const environment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let latest: BusinessSourceData | undefined;
  function Harness() {
    const [taxYear, setTaxYear] = useState(2026);
    const [data, setData] = useState<BusinessSourceData>({ allInvestmentAtRisk: false });
    return <>
      <button type="button" onClick={() => setTaxYear(2025)}>Switch to 2025</button>
      <BusinessSourceDetails data={data} taxYear={taxYear} onChange={next => { latest = next; setData(next); }} />
    </>;
  }
  const button = (label: string) => [...host.querySelectorAll('button')].find(element => element.textContent === label);
  const field = (label: string) => [...host.querySelectorAll('label')].find(element => element.querySelector('span')?.textContent === label)
    ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
  async function change(label: string, value: string) {
    const input = field(label);
    if (!input) throw new Error(`Expected a native field for ${label}`);
    await act(async () => {
      const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    });
  }

  try {
    await act(async () => root.render(<Harness />));
    const add = button('Add actual Form 6198 Part II records');
    expect(add).toBeDefined();
    await act(async () => add?.click());
    expect(latest?.form6198PartII2026).toEqual({});
    expect(field('Line 7 increases')?.value).toBe('');
    await change('Tax year on Form 6198', '2026');
    await change('Line 7 increases', '0.00');
    await change('Schedule C reference on Form 6198', 'Actual loss workpaper cited on Form 6198');
    await change('Current ordinary Schedule C loss on Form 6198', '-6000.57');
    expect(latest?.form6198PartII2026).toMatchObject({ taxYear: '2026', increases: '0.00', currentOrdinaryLoss: '-6000.57' });
    expect(latest?.form6198PartII2026?.decreases).toBeUndefined();
    expect(latest?.scheduleCSourceFacts).toBeUndefined();
    const confirmation = 'Have you checked the complete actual Form 6198 Part II originals?';
    await change(confirmation, 'true');
    expect(latest?.form6198PartII2026?.sourceFactsConfirmed).toBe(true);
    await change('Line 7 increases source reference', 'New actual source');
    expect(latest?.form6198PartII2026?.sourceFactsConfirmed).toBeNull();

    await act(async () => button('Switch to 2025')?.click());
    expect(field('Line 7 increases')?.value).toBe('0.00');
    await act(async () => button('Remove actual Form 6198 Part II records')?.click());
    expect(latest?.form6198PartII2026).toBeUndefined();
    expect(button('Add actual Form 6198 Part II records')).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
