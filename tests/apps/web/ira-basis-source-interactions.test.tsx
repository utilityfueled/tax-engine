// @vitest-environment jsdom
// Spec: spec/federal/guided-ira-basis.yaml
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { IraBasisSourceFields } from '@/components/guided-interview/ira-basis-source-fields';
import type { GuidedIraBasisData } from '@/lib/guided-ira-basis';
import { guidedIraBasisFixture } from '../../guided-interview/ira-basis-fixture';

it('collects separate owner history and account values without filling unknown answers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: GuidedIraBasisData | undefined;
  const entries = guidedIraBasisFixture().sectionData['income-retirement']!.entries;
  function Harness() { const [value, setValue] = useState(latest); return <IraBasisSourceFields data={value} entries={entries} onChange={next => { latest = next; setValue(next); }} />; }
  async function click(label: string) { const button = [...container.querySelectorAll('button')].find(node => node.textContent === label); if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click()); }
  async function change(label: string, value: string) {
    const control = [...container.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!control) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(control.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(control, value); control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />)); expect(latest).toBeUndefined();
    await click('Add ordinary IRA basis records'); await click('Add IRA owner');
    expect(latest?.owners?.[0]?.accountHolder).toBeUndefined(); expect(latest?.owners?.[0]?.ordinaryFacts).toBeUndefined();
    await change('IRA owner #1', 'spouse'); await change('Owner #1 first name as filed', 'John');
    await change('Owner #1 prior basis method', 'prior_form_8606'); await change('Owner #1 prior Form 8606 line 14', '9007199254740993.01');
    await click('Add account for owner #1'); await change('Owner #1 account #1 year-end value', '0');
    expect(latest?.owners?.[0]?.basisHistory?.line14).toBe('9007199254740993.01');
    expect(latest?.owners?.[0]?.accounts?.[0]).toMatchObject({ yearEndValue: '0' });
    expect(latest?.owners?.[0]?.accounts?.[0]?.accountType).toBeUndefined();
    await click('Replace distribution links from current 1099-R sources');
    expect(latest?.distributions?.[0]).toMatchObject({ sourceId: 'form1099R:0', taxableAmount: '' });
    expect(latest?.distributions?.[0]?.accountId).toBeUndefined();
    await change('All IRA basis sources checked after the last edit', 'true');
    await change('Owner #1 prior Form 8606 line 14', '');
    expect(latest?.sourceFactsConfirmed).toBeNull(); expect(latest?.owners?.[0]?.basisHistory?.line14).toBe('');
    await change('Owner #1: Any Roth conversions?', 'false'); await change('Owner #1: Any Roth conversions?', '');
    expect(latest?.owners?.[0]?.ordinaryFacts?.conversionsPresent).toBeNull();
    await click('Remove IRA owner #1'); expect(latest?.owners).toEqual([]);
  } finally { await act(async () => root.unmount()); container.remove(); }
});
