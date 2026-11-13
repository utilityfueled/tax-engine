// @vitest-environment jsdom
// Spec: spec/federal/schedule-c-wagering-2026.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { SectionSelfEmployment } from '@/components/guided-interview/section-self-employment';
import { SectionReview } from '@/components/guided-interview/section-review';
import { calculateScheduleC } from '@/engine/schedules/schedule-c';
import { buildGuidedFactAnswers, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyDeductionData, startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { TaxYearInputSchema } from '@/models/inputs';
import { completeBusinessSection, completePersonalInfo } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

it('preserves confirmed professional ledger facts in the guided Schedule C input', async () => {
  const interview = startInterview({ filingStatus: 'single', incomeTypes: ['self-employment'], lifeEvents: [], stateCode: null }, 2026);
  const owner = { ...structuredClone(completePersonalInfo), spouse: undefined };
  const business = { ...structuredClone(completeBusinessSection), businessFacts: {
    ...completeBusinessSection.businessFacts, activityDescription: 'Professional wagering', businessCode: '713200',
  } };
  const initial = updateSectionData(updateSectionData(interview, 'personal-info', owner), 'income-self-employment', business);
  let current = initial;
  const workspace = createWorkspaceRecord('synthetic-guided-professional-wagering');
  function Harness() {
    const [state, setState] = useState(initial);
    const data = state.sectionData['income-self-employment'];
    if (!data) throw new Error('Missing synthetic business source.');
    return <SectionSelfEmployment workspace={workspace} flowState={state} {...data} manualGrossReceipts={data.manualGrossReceipts ?? ''}
      bankStatementAnalyses={[]} incomeDocumentAnalyses={[]} onSectionChange={next => {
        current = updateSectionData(state, 'income-self-employment', next);
        setState(current);
      }} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  const confirmations = [
    'This ledger covers the entire calendar year', 'This ledger includes all domestic professional wagering',
    'The ledger includes no other activity or duplicate amounts', 'There are no Forms W-2G to reconcile',
  ];
  const build = () => buildTaxInputFromGuidedData(current);
  const aiPermission = () => panel.container.querySelector<HTMLInputElement>('input[aria-label="Allow AI review of selected business documents"]');
  try {
    await panel.click('Add professional wagering ledger');
    expect(aiPermission()?.disabled).toBe(true);
    expect(validateSection(current, 'income-self-employment').fieldErrors?.professionalWagering).toBeTruthy();
    expect(build()).toBeNull();
    const draftReview = await mountGuidedPanel(<SectionReview state={current} preview={null} onJumpToSection={() => undefined} />);
    try {
      expect(draftReview.container.textContent).toContain('Otherwise deductible wagering expensesReview source amount');
    } finally {
      await draftReview.dispose();
    }
    expect(buildGuidedFactAnswers(current).find(answer => answer.factId === 'nonemployee-compensation')?.answerText).toBe('Professional wagering gains still need ledger review.');
    await panel.change('Private wagering ledger reference', 'synthetic-private-wagering');
    await panel.change('Gross taxable wagering gains', '12,000.15');
    await panel.change('Wagering losses', '10000.25');
    await panel.change('Otherwise deductible wagering expenses', '0');
    for (const label of confirmations) await panel.change(label, 'true');
    expect(validateSection(current, 'income-self-employment').status).toBe('complete');
    const input = TaxYearInputSchema.parse(build());
    expect(input.scheduleC?.grossReceipts).toBeUndefined();
    expect(input.scheduleC?.expenses).toBeUndefined();
    expect(input.scheduleC?.professionalWagering).toMatchObject({
      ledgerReference: 'synthetic-private-wagering', grossTaxableWageringGains: '12000.15',
      wageringLosses: '10000.25', otherwiseDeductibleWageringExpenses: '0',
    });
    const result = calculateScheduleC(input);
    expect(result.netProfit.toFixed()).toBe('2999.925');
    expect(JSON.stringify(result.lines)).not.toContain('synthetic-private-wagering');
    const review = await mountGuidedPanel(<SectionReview state={current} preview={null} onJumpToSection={() => undefined} />);
    try {
      const rows = Array.from(review.container.querySelectorAll('.guided-review-row'), row => row.textContent);
      expect(rows).toContain('Gross taxable wagering gains$12,000.15');
      expect(rows).toContain('Wagering losses$10,000.25');
      expect(rows).toContain('Otherwise deductible wagering expenses$0');
      expect(review.container.textContent).not.toMatch(/1099-NEC receipts|synthetic-private-wagering/);
    } finally {
      await review.dispose();
    }
    const answers = buildGuidedFactAnswers(current);
    expect(answers.find(answer => answer.factId === 'nonemployee-compensation')?.answerText).toBe('Professional wagering gains confirmed from the annual ledger.');
    expect(answers.find(answer => answer.factId === 'schedule-c-expense-review')?.answerText).toBe('Professional wagering losses and otherwise deductible expenses confirmed from the annual ledger.');
    expect(JSON.stringify(answers)).not.toMatch(/synthetic-private-wagering|12,000\.15|10,000\.25/);
    expect(buildTaxInputFromGuidedData(updateSectionData(current, 'personal-info', { ...owner, lastName: 'Changed' }))).toBeNull();
    expect(buildTaxInputFromGuidedData({ ...current, segmentation: { ...current.segmentation, stateCode: 'OH' } })).toBeNull();
    expect(buildTaxInputFromGuidedData(updateSectionData(current, 'deductions', { ...emptyDeductionData, gamblingWinnings: '1' }))).toBeNull();
    const saved = current.sectionData['income-self-employment'];
    if (!saved) throw new Error('Missing retained business source.');
    expect(buildTaxInputFromGuidedData(updateSectionData(current, 'income-self-employment', { ...saved, expenses: { ...saved.expenses, supplies: '0.01' } }))).toBeNull();
    await panel.change('Wagering losses', '10000.50');
    for (const label of confirmations) expect(panel.control(label).value).toBe('');
    expect(build()).toBeNull();
    await panel.click('Remove professional wagering ledger');
    expect(aiPermission()?.disabled).toBe(false);
    expect(validateSection(current, 'income-self-employment').fieldErrors?.professionalWagering).toBeUndefined();
  } finally {
    await panel.dispose();
  }
});
