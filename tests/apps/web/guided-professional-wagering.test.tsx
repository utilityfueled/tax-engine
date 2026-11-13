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

const ledgerConfirmations = [
  'This ledger covers the entire calendar year', 'This ledger includes all domestic professional wagering',
  'The ledger includes no other activity or duplicate amounts',
];

async function mountWageringEditor() {
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
  return { panel, owner, get current() { return current; } };
}

it('preserves confirmed professional ledger facts in the guided Schedule C input', async () => {
  const editor = await mountWageringEditor();
  const { panel, owner } = editor;
  const confirmations = [...ledgerConfirmations, 'There are no Forms W-2G to reconcile'];
  const build = () => buildTaxInputFromGuidedData(editor.current);
  const aiPermission = () => panel.container.querySelector<HTMLInputElement>('input[aria-label="Allow AI review of selected business documents"]');
  try {
    await panel.click('Add professional wagering ledger');
    expect(aiPermission()?.disabled).toBe(true);
    expect(validateSection(editor.current, 'income-self-employment').fieldErrors?.professionalWagering).toBeTruthy();
    expect(build()).toBeNull();
    const draftReview = await mountGuidedPanel(<SectionReview state={editor.current} preview={null} onJumpToSection={() => undefined} />);
    try {
      expect(draftReview.container.textContent).toContain('Otherwise deductible wagering expensesReview source amount');
    } finally {
      await draftReview.dispose();
    }
    expect(buildGuidedFactAnswers(editor.current).find(answer => answer.factId === 'nonemployee-compensation')?.answerText).toBe('Professional wagering gains still need ledger review.');
    await panel.change('Private wagering ledger reference', 'synthetic-private-wagering');
    await panel.change('Gross taxable wagering gains', '12,000.15');
    await panel.change('Wagering losses', '10000.25');
    await panel.change('Otherwise deductible wagering expenses', '0');
    for (const label of confirmations) await panel.change(label, 'true');
    const current = editor.current;
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
    expect(validateSection(editor.current, 'income-self-employment').fieldErrors?.professionalWagering).toBeUndefined();
  } finally {
    await panel.dispose();
  }
});

it('reconciles guided W-2G originals before retaining federal withholding', async () => {
  const editor = await mountWageringEditor();
  const { panel } = editor;
  const build = () => buildTaxInputFromGuidedData(editor.current);
  const sourceConfirmation = 'These are all original individual 2026 domestic cash slot payments, with no state or local reporting';
  const confirm = async () => {
    for (const label of [...ledgerConfirmations, sourceConfirmation]) await panel.change(label, 'true');
  };
  try {
    await panel.click('Add professional wagering ledger');
    await panel.change('Private wagering ledger reference', 'synthetic-private-wagering');
    await panel.change('Gross taxable wagering gains', '8000.05');
    await panel.change('Wagering losses', '4000.05');
    await panel.change('Otherwise deductible wagering expenses', '0');
    await panel.change('There are no Forms W-2G to reconcile', 'true');
    await panel.click('Add Form W-2G original');
    await panel.click('Add Form W-2G original');
    const enter = async (index: number, date: string, amount: string, withheld: string) => {
      const fields = {
        'Private statement reference': `private-statement-${index}`,
        'Private linked ledger entry': `private-ledger-entry-${index}`,
        'Payer name': 'Synthetic Slot Payer', 'Payer TIN': '95-8765432',
        'Recipient TIN last four digits': '3333', 'Date won (box 2)': date,
        'Reportable winnings (box 1)': amount, 'Recognized gain in your ledger': amount,
        'Federal withholding (box 4)': withheld,
      };
      for (const [label, value] of Object.entries(fields)) await panel.change(`W-2G ${index}: ${label}`, value);
    };
    await enter(1, '2026-03-12', '5000.01', '1200.01');
    await enter(2, '2026-04-18', '3000.04', '');
    await panel.change('Other gross taxable wagering gains', '0');
    await confirm();
    expect(build()).toBeNull();
    await panel.change('W-2G 2: Federal withholding (box 4)', '0');
    expect(panel.control(sourceConfirmation).value).toBe('');
    await confirm();
    expect(validateSection(editor.current, 'income-self-employment').status).toBe('complete');
    const input = TaxYearInputSchema.parse(build());
    expect(input.formW2G.map(form => [form.sourceId, form.reportableWinnings, form.federalWithheld])).toEqual([
      ['private-statement-1', '5000.01', '1200.01'], ['private-statement-2', '3000.04', '0'],
    ]);
    const result = calculateScheduleC(input);
    expect(result.grossReceipts.toFixed()).toBe('8000.05');
    expect(result.professionalW2GWithholding?.toFixed()).toBe('1200.01');
    const review = await mountGuidedPanel(<SectionReview state={editor.current} preview={null} onJumpToSection={() => undefined} />);
    try {
      expect(review.container.textContent).toContain('Form W-2G federal withholding$1,200.01');
      expect(review.container.textContent).not.toMatch(/private-statement|private-ledger-entry|Synthetic Slot Payer|95-8765432/);
    } finally {
      await review.dispose();
    }
    expect(JSON.stringify(buildGuidedFactAnswers(editor.current))).not.toMatch(/private-statement|private-ledger-entry|Synthetic Slot Payer|95-8765432|1200\.01/);
    await panel.change('W-2G 2: Recipient TIN last four digits', '3332');
    await confirm();
    expect(build()).toBeNull();
    await panel.change('W-2G 2: Recipient TIN last four digits', '3333');
    await panel.change('W-2G 2: Recognized gain in your ledger', '3000.03');
    await confirm();
    expect(build()).toBeNull();
    await panel.change('W-2G 2: Recognized gain in your ledger', '3000.04');
    await panel.change('W-2G 2: Private linked ledger entry', 'PRIVATE-LEDGER-ENTRY-1');
    await confirm();
    expect(build()).toBeNull();
    await panel.click('Remove Form W-2G 2');
    await panel.click('Remove Form W-2G 1');
    expect(panel.control('There are no Forms W-2G to reconcile').value).toBe('');
    expect(build()).toBeNull();
  } finally {
    await panel.dispose();
  }
});
