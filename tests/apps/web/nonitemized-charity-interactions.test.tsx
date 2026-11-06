// @vitest-environment jsdom
// Spec: spec/federal/nonitemized-charitable-election.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { SectionDeductions } from '@/components/guided-interview/section-deductions';
import { SectionReview } from '@/components/guided-interview/section-review';
import { emptyDeductionData, type DeductionData } from '@/lib/guided-interview-flow';
import { startCompleteInterview } from '../../guided-interview/complete-facts';

it('collects a nonitemized election without displaying a standard deduction entitlement', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div'); document.body.appendChild(element); const root = createRoot(element);
  let latest: DeductionData = { ...emptyDeductionData, medicalExpenses: '250.10' };
  function Harness() { const [data, setData] = useState(latest); return <SectionDeductions data={data} filingStatus="mfs" taxYear={2026} onDataChange={next => { latest = next; setData(next); }} />; }
  try {
    await act(async () => root.render(<Harness />));
    const radio = element.querySelector<HTMLInputElement>('input[value="nonitemized"]');
    expect(radio).not.toBeNull(); await act(async () => radio?.click());
    expect(latest.method).toBe('nonitemized'); expect(latest.medicalExpenses).toBe('250.10');
    expect(element.textContent).toMatch(/standard deduction is unavailable/i);
    expect(element.querySelector('.guided-deduction-standard-callout')).toBeNull();
    expect(element.textContent).toContain('Earlier-year mortgage refunds and recoveries');
    expect([...element.querySelectorAll('button')].some(node => /add donation/i.test(node.textContent ?? ''))).toBe(true);
    const state = startCompleteInterview({ filingStatus: 'mfs', incomeTypes: ['w2-wages'], lifeEvents: [], stateCode: null });
    state.taxYear = 2026; state.sectionData.deductions = latest;
    await act(async () => root.render(<SectionReview state={state} preview={null} onJumpToSection={() => {}} />));
    expect(element.textContent).toContain('No standard or itemized deduction; current charity reviewed separately');
    expect(element.textContent).not.toContain('Standard deduction ($');
    expect(element.textContent).not.toContain('Itemized (Schedule A)');
    await act(async () => root.render(<SectionDeductions data={emptyDeductionData} filingStatus="mfs" taxYear={2025} onDataChange={() => {}} />));
    expect(element.querySelector('input[value="nonitemized"]')).toBeNull();
  } finally { await act(async () => root.unmount()); element.remove(); }
});
