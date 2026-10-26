// @vitest-environment jsdom
// Spec: spec/federal/guided-panel-behavior.yaml.
import React, { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { SectionStateReturn } from '@/components/guided-interview/section-state-return';
import { emptyStateReturnData, updateSectionData, validateSection, type GuidedFlowState } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import type { GuidedPreviewMetrics } from '@/lib/guided-interview-bridge';
import { completeInterestSource, startCompleteInterview } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('reconciles state payment records through actual add edit and remove controls', async () => {
  let state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: 'MI' });
  const personal = state.sectionData['personal-info'];
  if (!personal) throw new Error('Missing synthetic personal facts');
  state.sectionData['personal-info'] = { ...personal, state: 'MI' };
  state.sectionData['state-return'] = { ...emptyStateReturnData, additionalStateWithholding: '0.30' };
  const initial = structuredClone(state);
  function Harness() {
    const [current, setCurrent] = useState(state);
    return <SectionStateReturn stateCode="MI" data={current.sectionData['state-return']} guidedPreview={null}
      onDataChange={next => { state = updateSectionData(current, 'state-return', next); setCurrent(state); }} />;
  }
  const dom = await mountGuidedPanel(<Harness />);
  const errors = () => validateSection(state, 'state-return');
  try {
    expect(dom.container.textContent).toContain('Complete the income and state source facts');
    expect(errors().status).toBe('partial');
    await dom.click('+ Add withholding source');
    expect(state.sectionData['state-return']?.additionalStateWithholdingEntries?.[0]).toEqual({ payer: '', documentType: '', state: '', taxYear: '', amount: '' });
    await dom.change('Payer from source form', 'Actual first payer');
    await dom.change('Source form', '1099-MISC');
    await dom.change('State shown in the payment or withholding record', 'MI');
    await dom.change('Source form tax year', '2025');
    await dom.change('State withholding on this form', '0.10');
    await dom.click('+ Add withholding source');
    await dom.change('Payer from source form', 'Actual second payer', 1);
    await dom.change('Source form', 'W-2G', 1);
    await dom.change('State shown in the payment or withholding record', 'MI', 1);
    await dom.change('Source form tax year', '2025', 1);
    await dom.change('State withholding on this form', '0.20', 1);
    expect(errors().status).toBe('complete');
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('0.3');
    await dom.change('Source form tax year', '2024', 1);
    expect(errors().status).toBe('partial');
    await dom.change('Source form tax year', '2025', 1);
    await dom.change('State shown in the payment or withholding record', 'OH', 1);
    expect(errors().status).toBe('partial');
    await dom.change('State shown in the payment or withholding record', 'MI', 1);

    await dom.click('Add another state estimated tax payment');
    expect(state.sectionData['state-return']?.stateEstimatedPayments[0]).toEqual({ date: '', amount: '' });
    expect(errors().status).toBe('partial');
    await dom.change('State shown in the payment or withholding record', 'MI', 2);
    await dom.change('Date paid', '2025-06-16');
    await dom.change('Amount', '50.25');
    await dom.click('Add another state estimated tax payment');
    await dom.change('State shown in the payment or withholding record', 'MI', 3);
    await dom.change('Date paid', '2025-09-15', 1);
    await dom.change('Amount', '0', 1);
    expect(errors().status).toBe('complete');
    expect(state.sectionData['state-return']?.stateEstimatedPayments.map(row => row.amount)).toEqual(['50.25', '0']);
    await dom.change('Amount', '', 1);
    expect(errors().status).toBe('partial');
    await dom.click('Remove state estimated payment 2');
    expect(state.sectionData['state-return']?.stateEstimatedPayments).toEqual([{ date: '2025-06-16', amount: '50.25', state: 'MI' }]);
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('50.55');

    await dom.click('Remove', 0);
    expect(state.sectionData['state-return']?.additionalStateWithholdingEntries?.map(row => row.payer)).toEqual(['Actual second payer']);
    expect(errors().status).toBe('partial');
    await dom.change('Saved additional withholding total to reconcile', '0.20');
    expect(errors().status).toBe('complete');
    expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('50.45');
    expect(initial.sectionData['state-return']).toEqual({ stateEstimatedPayments: [], additionalStateWithholding: '0.30' });
  } finally { await dom.dispose(); }
});

it('binds Ohio allocation edits and displays actual state result states', async () => {
  let state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: 'OH' });
  state.sectionData['income-investments'] = { interestEntries: [{ ...completeInterestSource, taxExemptInterest: '100.30' }], dividendEntries: [], brokerageEntries: [] };
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network expected'));
  function Harness({ preview = null }: { preview?: GuidedPreviewMetrics | null }) {
    const [current, setCurrent] = useState<GuidedFlowState>(state);
    return <SectionStateReturn stateCode="OH" data={current.sectionData['state-return']} guidedPreview={preview}
      onDataChange={next => { state = updateSectionData(current, 'state-return', next); setCurrent(state); }} />;
  }
  const dom = await mountGuidedPanel(<Harness />);
  try {
    expect(validateSection(state, 'state-return').status).toBe('partial');
    await dom.click('Add Ohio interest allocation');
    expect(state.sectionData['state-return']?.ohioInterestAllocation?.sourceFactsConfirmed).toBeNull();
    await dom.change('Ohio interest source tax year', '2025');
    await dom.change('Ohio issuer allocation source reference', 'Actual issuer breakdown');
    await dom.change('Federal tax-exempt interest total from source records', '100.30');
    await dom.change("Other states' and local governments' obligations", '0.10');
    await dom.change('Ohio and Ohio local-government obligations', '100.20');
    await dom.change('Federal or territory obligations also exempt from Ohio tax', '0');
    await dom.change('Federal or territory obligations taxable by Ohio', '0');
    await dom.change('Ohio issuer classifications checked after the last source edit', 'true');
    expect(validateSection(state, 'state-return').status).toBe('complete');
    await dom.change("Other states' and local governments' obligations", '0.20');
    expect(state.sectionData['state-return']?.ohioInterestAllocation?.sourceFactsConfirmed).toBeNull();
    await dom.change('Ohio issuer classifications checked after the last source edit', 'true');
    expect(validateSection(state, 'state-return').status).toBe('partial');
    await dom.change('Ohio and Ohio local-government obligations', '100.10');
    await dom.change('Ohio issuer classifications checked after the last source edit', 'true');
    expect(validateSection(state, 'state-return').status).toBe('complete');
    expect(state.sectionData['state-return']?.ohioInterestAllocation?.otherInterestExemptFromOhio).toBe('0');
    await dom.change('Ohio issuer classifications checked after the last source edit', '');
    expect(state.sectionData['state-return']?.ohioInterestAllocation?.sourceFactsConfirmed).toBeNull();
    await dom.click('Remove Ohio interest allocation');
    expect(state.sectionData['state-return']?.ohioInterestAllocation).toBeUndefined();
    expect(validateSection(state, 'state-return').status).toBe('partial');

    const stateMetrics = {stateCode:'OH',stateName:'Ohio',stateTax:'100.10',stateWithholding:'125.35',stateRefund:'25.25',stateAmountOwed:'0'};
    const preview: GuidedPreviewMetrics = { totalIncome:'0',agi:'0',taxableIncome:'0',totalTax:'0',totalPayments:'0',refund:'0',amountOwed:'0',state:stateMetrics };
    await dom.render(<Harness preview={preview} />);
    expect(dom.container.querySelector('[role="status"]')?.textContent).toContain('State Refund$25.25');
    expect(dom.container.querySelector('.guided-ticker-breakdown-refund')).not.toBeNull();
    await dom.render(<Harness preview={{...preview,state:{...stateMetrics,stateTax:'137.85',stateRefund:'0',stateAmountOwed:'12.50'}}} />);
    expect(dom.container.querySelector('[role="status"]')?.textContent).toContain('State Balance Due$12.50');
    expect(dom.container.querySelector('.guided-ticker-breakdown-owed')).not.toBeNull();
    await dom.render(<Harness preview={{...preview,state:{...stateMetrics,stateTax:'125.35',stateRefund:'0',stateAmountOwed:'0'}}} />);
    expect(dom.container.querySelector('[role="status"]')?.textContent).toContain('State Result—');
    expect(network).not.toHaveBeenCalled();
  } finally { await dom.dispose(); network.mockRestore(); }
});
