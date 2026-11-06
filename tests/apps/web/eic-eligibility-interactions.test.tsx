// @vitest-environment jsdom
// Spec: spec/federal/eic-claimant-eligibility.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionPersonalInfo } from '@/components/guided-interview/section-personal-info';
import type { PersonalInfoData } from '@/lib/guided-interview-flow';
import { completePersonalInfo } from '../../guided-interview/complete-facts';

it('collects actual EIC claimant facts for childless joint filers without default answers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  if (!completePersonalInfo.spouse) throw new Error('Missing synthetic spouse');
  let latest: PersonalInfoData = { ...structuredClone(completePersonalInfo), employmentValidSsnIssuedByDueDate: null,
    spouse: { ...completePersonalInfo.spouse, employmentValidSsnIssuedByDueDate: null } };
  function Harness() { const [data, setData] = useState(latest); return <SectionPersonalInfo data={data} filingStatus="mfj" onDataChange={next => { latest = next; setData(next); }} />; }
  async function click(label: string) {
    const button = [...element.querySelectorAll('button')].find(node => node.textContent === label);
    if (!button) throw new Error(`Missing ${label}`); await act(async () => button.click());
  }
  function field(label: string) {
    const input = [...element.querySelectorAll('label')].find(node => node.querySelector('.guided-field-label')?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!input) throw new Error(`Missing ${label}`); return input;
  }
  async function change(label: string, value: string) {
    const input = field(label);
    await act(async () => { Object.getOwnPropertyDescriptor(input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')?.set?.call(input, value); input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(field('Was your employment-valid SSN issued by the return due date, including extensions?').value).toBe('');
    expect(field("Was your spouse's employment-valid SSN issued by the return due date, including extensions?").value).toBe('');
    await click('Add EIC claimant sources'); expect(latest.eicClaimantEligibility).toEqual({});
    await change('EIC claimant source tax year', '2025'); await change('EIC claimant source reference', 'Actual records');
    await change('Were you a nonresident alien for any part of the tax year?', 'false');
    await change('Was your spouse a nonresident alien for any part of the tax year?', 'true');
    expect(latest.eicClaimantEligibility?.residentJointElection).toBeUndefined();
    await change('Valid joint resident election under section 6013(g) or (h)', 'false');
    expect(latest.eicClaimantEligibility?.residentJointElection).toBe(false);
    await change('EIC claimant sources checked after the last edit', 'true');
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBe(true);
    await change('EIC claimant source reference', 'Changed records');
    expect(latest.eicClaimantEligibility?.sourceFactsConfirmed).toBeNull();
    await change('Were you a nonresident alien for any part of the tax year?', '');
    expect(latest.eicClaimantEligibility?.primaryNonresidentAlienDuringYear).toBeNull();
    await click('Remove EIC claimant sources'); expect(latest.eicClaimantEligibility).toBeUndefined();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
