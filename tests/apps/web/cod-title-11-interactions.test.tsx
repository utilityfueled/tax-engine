// @vitest-environment jsdom
// Spec: spec/federal/cod-title-11-chapter-13.yaml guide.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { CodNolDetails } from '@/components/guided-interview/cod-nol-details';
import type { CodNolData } from '@/lib/guided-cod-nol';

it('shows and collects the chapter 13 facts only after a bankruptcy answer', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: CodNolData | undefined = {};
  function Harness() { const [data, setData] = useState(latest); return <CodNolDetails data={data} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    const setter = Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    await act(async () => { setter?.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  }
  await act(async () => root.render(<Harness />));
  expect(container.textContent).not.toContain('Bankruptcy chapter');
  await change('Debt was discharged in a title 11 bankruptcy case', 'false');
  expect(container.textContent).not.toContain('Bankruptcy chapter');
  await change('Debt was discharged in a title 11 bankruptcy case', 'true');
  expect(container.textContent).toContain('still needed to limit basis reduction');
  await change('Bankruptcy chapter', '13');
  await change('Bankruptcy discharge order or plan reference', 'Fictional order');
  await change("You were a debtor under the court's jurisdiction", 'true');
  await change('The court granted the discharge, or it follows a plan the court approved', 'true');
  await change('Bankruptcy records checked', 'true');
  expect(latest).toMatchObject({ title11Case: true, title11Chapter: '13', title11Source: { sourceReference: 'Fictional order', debtorUnderCourtJurisdictionConfirmed: true, dischargeByCourtOrApprovedPlanConfirmed: true, sourceFactsConfirmed: true } });
  await change('Bankruptcy discharge order or plan reference', 'Corrected order');
  expect(latest?.title11Source).toMatchObject({ sourceReference: 'Corrected order', sourceFactsConfirmed: null, debtorUnderCourtJurisdictionConfirmed: true });
  await act(async () => root.unmount()); container.remove();
});
