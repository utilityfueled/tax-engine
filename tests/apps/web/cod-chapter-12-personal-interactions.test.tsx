// @vitest-environment jsdom
// Spec: spec/federal/cod-title-11-chapter-12-personal.yaml visible-facts.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CodNolDetails } from '@/components/guided-interview/cod-nol-details';
import type { CodNolData } from '@/lib/guided-cod-nol';

it('collects actual history for chapters12 and13 without defaulting it', async () => {
  const oldAct = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  let latest: CodNolData = { title11Case: true, title11Chapter: '12' };
  function Harness() {
    const [data, setData] = useState(latest);
    return <CodNolDetails data={data} onChange={next => { if (!next) throw new Error('Missing original packet'); latest = next; setData(next); }} />;
  }
  const label = 'The case was never under Chapter 7 or Chapter 11';
  function field(name: string) {
    const row = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === name);
    const select = row?.querySelector('select'); if (!select) throw new Error(`Missing ${name}`); return select;
  }
  async function choose(name: string, value: string) {
    const select = field(name);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(field(label).value).toBe('');
    expect(latest.title11Source?.caseNeverChapter7Or11Confirmed).toBeUndefined();
    expect(container.textContent).toContain('chapter 12 or 13');
    await choose(label, 'true');
    expect(latest.title11Source?.caseNeverChapter7Or11Confirmed).toBe(true);
    await choose('Bankruptcy records checked', 'true');
    expect(latest.title11Source?.sourceFactsConfirmed).toBe(true);
    await choose(label, 'false');
    expect(latest.title11Source?.caseNeverChapter7Or11Confirmed).toBe(false);
    expect(latest.title11Source?.sourceFactsConfirmed).toBeNull();
    await choose('Bankruptcy chapter', '13');
    expect(field(label).value).toBe('false');
    await choose(label, '');
    expect(latest.title11Source?.caseNeverChapter7Or11Confirmed).toBeNull();
    await choose('Bankruptcy chapter', '7');
    expect(container.textContent).not.toContain(label);
  } finally {
    await act(async () => root.unmount()); container.remove();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = oldAct;
  }
});
