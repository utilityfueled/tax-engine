// @vitest-environment jsdom
// Spec: spec/federal/schedule-b.yaml.
import { act, useState } from 'react';
import { expect, it } from 'vitest';
import { SectionReview } from '@/components/guided-interview/section-review';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { collectGuidedReviewIssues, getGuidedSectionRoute, loadGuidedFlowState, saveGuidedFlowState, setInterviewTaxYear, updateSectionData } from '@/lib/guided-interview-flow';
import { computeGuidedPreview } from '@/lib/guided-preview-compute';
import { updateGuidedScheduleBPartThree } from '@/lib/guided-schedule-b-part-three';
import { guidedForeignTaxK3Fixture } from '../../fixtures/guided-foreign-tax-k3';
import { completeDividendEntry, completePersonalInfo, startCompleteInterview } from '../../guided-interview/complete-facts';
import { mountGuidedPanel } from './guided-panel-dom';

const disclosure = 'Foreign accounts and trusts (Schedule B)';
const accountQuestion = (year: number) => `During ${year}, did you have a financial interest in or signature authority over a financial account in a foreign country?`;
const fbarQuestion = (year: number) => `Were you required to file FinCEN Form 114 (FBAR) for ${year}?`;
const trustQuestion = (year: number) => `During ${year}, did you receive a distribution from a foreign trust, or were you a grantor of or transferor to one?`;

function reload(state: ReturnType<typeof startCompleteInterview>) {
  const workspace = 'schedule-b-test';
  expect(saveGuidedFlowState(localStorage, workspace, state)).toBe(true);
  const restored = loadGuidedFlowState(localStorage, workspace);
  localStorage.clear();
  if (!restored) throw new Error('Expected the guided draft to reload');
  return restored;
}

it('keeps unanswered Schedule B disclosures unknown when restoring older workspaces with foreign-source income', () => {
  const dividendState = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  dividendState.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [{
    ...completeDividendEntry, ordinaryDividends: '1700', foreignTaxPaid: '15', foreignCountry: 'United Kingdom',
  }], brokerageEntries: [] };
  const k3State = guidedForeignTaxK3Fixture().state;
  for (const state of [dividendState, k3State]) {
    const legacy = reload({ ...state, factsVersion: undefined });
    expect(legacy.sectionData.review).toBeUndefined();
    const input = buildTaxInputFromGuidedData(legacy);
    expect(input).not.toBeNull();
    expect(input).not.toHaveProperty('scheduleBPartThree');
    if (state === dividendState) expect(input?.form1099Div[0]?.foreignCountry).toBe('United Kingdom');
    else expect(input?.scheduleK1?.[0]?.foreignTaxPaid).toBe('50');
  }
});

it('records actual Schedule B disclosures by year and clears inapplicable follow-ups', async () => {
  let latest = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: [], stateCode: null });
  expect(getGuidedSectionRoute(latest).map(section => section.id)).toContain('review');
  const baseline = computeGuidedPreview(latest);
  expect(baseline).not.toBeNull();
  let apply: (state: typeof latest) => void;
  function Harness() {
    const [state, setState] = useState(latest);
    apply = next => { latest = next; setState(next); };
    return <SectionReview state={state} preview={null} onJumpToSection={() => {}}
      onScheduleBPartThreeChange={draft => apply(updateGuidedScheduleBPartThree(state, draft))} />;
  }
  const panel = await mountGuidedPanel(<Harness />);
  try {
    await panel.expand(disclosure);
    expect(panel.control(accountQuestion(2025)).value).toBe('');
    expect(panel.control(trustQuestion(2025)).value).toBe('');
    expect(panel.container.textContent).not.toContain(fbarQuestion(2025));
    expect(collectGuidedReviewIssues(latest)).toEqual([]);
    await panel.change(accountQuestion(2025), 'true');
    expect(panel.control(fbarQuestion(2025)).value).toBe('');
    expect(panel.container.querySelector('[role="status"]')?.textContent).toContain('Answer whether FinCEN Form 114 was required.');
    expect(collectGuidedReviewIssues(latest)).toContainEqual(expect.objectContaining({ sectionId: 'review', sectionLabel: 'Schedule B Part III', status: 'needs-review' }));
    expect(buildTaxInputFromGuidedData(latest)?.scheduleBPartThree).toEqual({ hasForeignAccounts: true });
    expect(computeGuidedPreview(latest)).not.toBeNull();
    await panel.change(fbarQuestion(2025), 'false');
    expect(buildTaxInputFromGuidedData(latest)?.scheduleBPartThree).toEqual({ hasForeignAccounts: true, fbarRequired: false });
    expect(panel.container.textContent).not.toContain('Foreign account country 1');
    await panel.change(fbarQuestion(2025), 'true');
    await panel.change('Foreign account country 1', ' Japan ');
    await panel.click('Add country');
    const partialDraft = reload(latest);
    expect(partialDraft.sectionData.review?.scheduleBPartThreeByYear?.[2025]?.foreignAccountCountries).toEqual([' Japan ', '']);
    expect(buildTaxInputFromGuidedData(partialDraft)?.scheduleBPartThree?.foreignAccountCountries).toBeUndefined();
    await panel.click('Remove foreign account country 2');
    expect(buildTaxInputFromGuidedData(latest)?.scheduleBPartThree?.foreignAccountCountries).toEqual(['Japan']);
    await panel.click('Add country');
    await panel.change('Foreign account country 2', 'Switzerland');
    await panel.change(trustQuestion(2025), 'false');
    const countries = { hasForeignAccounts: true, fbarRequired: true, foreignAccountCountries: ['Japan', 'Switzerland'], hasForeignTrust: false };
    expect(buildTaxInputFromGuidedData(reload(latest))?.scheduleBPartThree).toEqual(countries);
    expect(collectGuidedReviewIssues(latest)).toEqual([]);

    await act(async () => apply(updateSectionData(setInterviewTaxYear(latest, 2026), 'personal-info', completePersonalInfo)));
    expect(panel.control(accountQuestion(2026)).value).toBe('');
    expect(buildTaxInputFromGuidedData(latest)).not.toHaveProperty('scheduleBPartThree');
    await panel.change(trustQuestion(2026), 'true');
    expect(buildTaxInputFromGuidedData(reload(latest))?.scheduleBPartThree).toEqual({ hasForeignTrust: true });
    await act(async () => apply(updateSectionData(setInterviewTaxYear(latest, 2025), 'personal-info', completePersonalInfo)));
    expect(buildTaxInputFromGuidedData(latest)?.scheduleBPartThree).toEqual(countries);

    await panel.change(fbarQuestion(2025), 'false');
    expect(latest.sectionData.review?.scheduleBPartThreeByYear?.[2025]?.foreignAccountCountries).toBeUndefined();
    await panel.change(accountQuestion(2025), 'false');
    expect(latest.sectionData.review?.scheduleBPartThreeByYear?.[2025]?.fbarRequired).toBeUndefined();
    expect(buildTaxInputFromGuidedData(reload(latest))?.scheduleBPartThree).toEqual({ hasForeignAccounts: false, hasForeignTrust: false });
    await panel.change(accountQuestion(2025), 'true');
    expect(panel.control(fbarQuestion(2025)).value).toBe('');
    await panel.change(accountQuestion(2025), '');
    expect(buildTaxInputFromGuidedData(latest)?.scheduleBPartThree).toEqual({ hasForeignTrust: false });
    expect(computeGuidedPreview(latest)?.totalTax).toBe(baseline?.totalTax);
  } finally {
    await panel.dispose();
  }
});
