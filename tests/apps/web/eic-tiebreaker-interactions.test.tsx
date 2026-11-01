// @vitest-environment jsdom
// Spec: spec/federal/eic-qualifying-child-tiebreaker.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EicQualifyingChildSourceDetails } from '@/components/guided-interview/eic-separated-spouse-details';
import type { EicSeparatedChildData } from '@/lib/guided-eic-separated-spouse';

it('asks the married-child and tiebreaker questions only when they apply', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  let latest: EicSeparatedChildData = { sourceId: 'dependent:0', original: { firstName: 'Avery', lastName: 'Lee', relationship: 'grandchild' }, otherEligibleClaimants: [{}] } as EicSeparatedChildData;
  function Harness() { const [data, setData] = useState(latest); return <EicQualifyingChildSourceDetails data={data} index={0} onChange={next => { latest = next; setData(next); }} />; }
  async function change(label: string, value: string) {
    const field = [...container.querySelectorAll('label')].find(row => row.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing ${label}`);
    await act(async () => { Object.getOwnPropertyDescriptor(field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(field, value); field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  }
  const asked = (phrase: string) => [...container.querySelectorAll('.guided-field-label')].some(node => node.textContent?.includes(phrase));
  await act(async () => root.render(<Harness />));
  expect(asked('claim this married child')).toBe(false);
  await change('Child 1: married at year end', 'true');
  await change('Child 1: can you claim this married child as a dependent', 'released_to_other_parent');
  expect(latest.marriedChildDependency).toBe('released_to_other_parent');
  await change('Child 1: married at year end', 'false');
  expect(latest.marriedChildDependency).toBeUndefined();
  expect(asked('claim this married child')).toBe(false);
  await change("Child 1, claimant 1: is the child's parent", 'true');
  await change('Child 1, claimant 1: adjusted gross income', '10,000');
  await change('Child 1: your adjusted gross income on this return, for the tiebreaker', '30,000');
  expect(latest).toMatchObject({ taxpayerTiebreakAgi: '30000', otherEligibleClaimants: [{ isParent: true, adjustedGrossIncome: '10000' }], allOtherEligibleClaimantsIncluded: null });
  await change('Child 1: all other eligible claimants recorded', 'true');
  await change("Child 1, claimant 1: is the child's parent", 'false');
  expect(latest.allOtherEligibleClaimantsIncluded).toBeNull();
  await change('Child 1: all other eligible claimants recorded', 'true');
  await change('Child 1, claimant 1: adjusted gross income', '11000');
  expect(latest.allOtherEligibleClaimantsIncluded).toBeNull();
  await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent?.startsWith('Remove'))!.click());
  expect(latest.otherEligibleClaimants).toEqual([]);
  expect(latest.taxpayerTiebreakAgi).toBeUndefined();
  expect(asked('for the tiebreaker')).toBe(false);
  await act(async () => root.unmount()); container.remove();
});

it('leaves the filer AGI out for a parent', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div'); document.body.appendChild(container); const root = createRoot(container);
  const data = { sourceId: 'dependent:0', original: { firstName: 'Avery', lastName: 'Lee', relationship: 'child' }, otherEligibleClaimants: [{}] } as EicSeparatedChildData;
  await act(async () => root.render(<EicQualifyingChildSourceDetails data={data} index={0} onChange={() => undefined} />));
  expect(container.textContent).not.toContain('for the tiebreaker');
  await act(async () => root.unmount()); container.remove();
});
