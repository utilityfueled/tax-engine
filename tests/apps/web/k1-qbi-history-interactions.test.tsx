// @vitest-environment jsdom
// Spec: spec/federal/guided-k1-qbi-sources.yaml.
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { K1LossSourceDetails } from '@/components/guided-interview/k1-loss-source-details';
import type { K1LossSourcesData } from '@/lib/guided-qbi-loss-data';
import type { NetOperatingLossData } from '@/lib/guided-net-operating-loss';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { emptyAdjustmentData } from '@/lib/guided-interview-flow';
import { actualGuidedK1Sources } from '../../fixtures/guided-k1-qbi-sources';
import { actualGuidedNolSources } from '../../fixtures/guided-net-operating-loss';
import { completeW2Entry, startCompleteInterview } from '../../guided-interview/complete-facts';

function preview(data: K1LossSourcesData | undefined, nol?: NetOperatingLossData) {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2-wages'], lifeEvents: ['k1-loss-sources'], stateCode: null });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages: '100000' }] };
  state.sectionData.adjustments = { ...emptyAdjustmentData, k1LossSources: data, netOperatingLossSources: nol };
  return buildTaxInputFromGuidedData(state);
}

async function mount(initial: K1LossSourcesData, nol?: NetOperatingLossData) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div');
  document.body.appendChild(element);
  const root = createRoot(element);
  let latest: K1LossSourcesData | undefined = initial;
  function Harness() {
    const [data, setData] = useState(latest);
    return <K1LossSourceDetails data={data} nol={nol} onChange={next => { latest = next; setData(next); }} />;
  }
  function control(label: string) {
    const field = [...element.querySelectorAll('label')]
      .find(row => row.querySelector('.guided-field-label')?.textContent === label)
      ?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select');
    if (!field) throw new Error(`Missing control: ${label}`);
    return field;
  }
  async function change(label: string, value: string) {
    const field = control(label);
    await act(async () => {
      const prototype = field.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(field, value);
      field.dispatchEvent(new Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  }
  await act(async () => root.render(<Harness />));
  return {
    element, control, change,
    data: () => latest,
    async click(text: string) {
      const button = [...element.querySelectorAll('button')].find(row => row.textContent === text);
      if (!button) throw new Error(`Missing button: ${text}`);
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
    },
    async confirmSources() {
      const labels = [...element.querySelectorAll('.guided-field-label')]
        .map(row => row.textContent ?? '').filter(label => label.endsWith('checked after the last edit'));
      for (const label of labels) await change(label, 'true');
    },
    async close() { await act(async () => root.unmount()); element.remove(); },
  };
}

it('preserves passive history facts and requires reconfirmation after editing', async () => {
  const initial = actualGuidedK1Sources();
  const savedInitial = JSON.stringify(initial);
  const ui = await mount(initial);
  try {
    expect(preview(ui.data())).not.toBeNull();
    await ui.click('Add K-1 1 passive vintage');
    await ui.change('K-1 1 passive vintage 1 origin year', '2023');
    await ui.change('K-1 1 passive vintage 1 original loss', '1200.17');
    await ui.change('K-1 1 passive vintage 1 original qualified loss', '960.13');
    await ui.change('K-1 1 passive vintage 1 filed remaining loss', '1000.11');
    await ui.change('K-1 1 passive vintage 1 filed remaining qualified loss', '800.09');
    await ui.change('K-1 1 passive vintage 1 current material participation', 'false');
    expect(ui.data()?.activities?.[0].passiveHistory?.vintages).toEqual([{
      taxYear: '2023', originalLoss: '1200.17', qualifiedOriginalLoss: '960.13',
      remainingLoss: '1000.11', qualifiedRemainingLoss: '800.09', materiallyParticipatedInCurrentYear: false,
    }]);
    expect(ui.data()?.sourceFactsConfirmed).toBeNull();
    expect(ui.data()?.activities?.[0].basis?.sourceFactsConfirmed).toBeNull();
    expect(ui.data()?.activities?.[0].passiveHistory?.sourceFactsConfirmed).toBeNull();
    expect(preview(ui.data())).toBeNull();
    expect(JSON.stringify(initial)).toBe(savedInitial);

    await ui.click('Add K-1 1 passive vintage');
    await ui.change('K-1 1 passive vintage 2 origin year', '2024');
    await ui.click('Remove K-1 1 passive vintage 1');
    expect(ui.data()?.activities?.[0].passiveHistory?.vintages).toEqual([{ taxYear: '2024' }]);
    await ui.click('Remove K-1 1 prior passive history');
    expect(ui.data()?.activities?.[0].passiveHistory).toBeUndefined();
    await ui.click('Add K-1 1 prior passive history');
    expect(ui.data()?.activities?.[0].passiveHistory?.vintages).toBeUndefined();
    expect(ui.element.textContent).toContain('The prior passive vintage list is unknown.');
    await ui.change('K-1 1 prior passive history source year', '2024');
    await ui.change('K-1 1 prior passive history source reference', 'Fictional filed passive history');
    await ui.confirmSources();
    expect(preview(ui.data())).toBeNull();
    await ui.click('Record no K-1 1 prior passive vintages');
    expect(ui.data()?.activities?.[0].passiveHistory?.vintages).toEqual([]);
    await ui.confirmSources();
    expect(preview(ui.data())).not.toBeNull();

    await ui.change('K-1 1 prior passive history source reference', 'Corrected fictional filed history');
    expect(preview(ui.data())).toBeNull();
    expect(ui.data()?.activities?.[0].passiveHistory?.vintages).toEqual([]);
    await ui.confirmSources();
    expect(preview(ui.data())).not.toBeNull();
  } finally { await ui.close(); }
});

it('rebuilds independent basis risk and SE histories without inventing zero', async () => {
  const ui = await mount(actualGuidedK1Sources());
  try {
    await ui.click('Remove K-1 1 opening basis sources');
    expect(ui.data()?.activities?.[0].basis).toBeUndefined();
    await ui.click('Add K-1 1 opening basis sources');
    expect(ui.data()?.activities?.[0].basis).toEqual({});
    for (const [label, value] of [
      ['source year', '2024'], ['source reference', 'Fictional outside basis'],
      ['actual opening basis', '100000.01'], ['filed prior suspended basis loss', '1.25'],
      ['no other basis changes beyond the reported ordinary result', 'true'],
    ]) await ui.change(`K-1 1 basis ${label}`, value);
    await ui.confirmSources();
    expect(preview(ui.data())).toBeNull();
    expect(ui.data()?.activities?.[0].basis?.priorSuspendedLoss).toBe('1.25');
    await ui.change('K-1 1 basis filed prior suspended basis loss', '0');
    await ui.confirmSources();
    expect(preview(ui.data())).not.toBeNull();
    await ui.change('K-1 1 basis filed prior suspended basis loss', '');
    await ui.confirmSources();
    expect(ui.data()?.activities?.[0].basis?.priorSuspendedLoss).toBe('');
    expect(preview(ui.data())).toBeNull();
    await ui.change('K-1 1 basis filed prior suspended basis loss', '0');

    await ui.click('Remove K-1 1 at-risk sources');
    expect(ui.data()?.activities?.[0].atRisk).toBeUndefined();
    await ui.click('Add K-1 1 at-risk sources');
    expect(ui.data()?.activities?.[0].atRisk).toEqual({});
    for (const [label, value] of [
      ['source year', '2025'], ['source reference', 'Fictional simplified at-risk source'],
      ['simplified method eligibility established', 'true'], ['adjusted basis at effective date', '0'],
      ['prior-year amount at risk', '60000'], ['current source increases', '0'],
      ['current source decreases', '0'], ['filed prior suspended at-risk loss', '0'],
    ]) await ui.change(`K-1 1 at risk ${label}`, value);
    await ui.click('Add K-1 1 prior at-risk history');
    expect(ui.data()?.activities?.[0].atRisk?.priorLossHistory?.vintages).toBeUndefined();
    await ui.change('K-1 1 prior at-risk history source year', '2024');
    await ui.change('K-1 1 prior at-risk history source reference', 'Fictional filed risk history');
    await ui.confirmSources();
    expect(preview(ui.data())).toBeNull();
    await ui.click('Record no K-1 1 prior at-risk vintages');
    await ui.confirmSources();
    expect(preview(ui.data())).not.toBeNull();

    await ui.click('Remove K-1 1 partner adjustment facts');
    expect(ui.data()?.activities?.[0].selfEmploymentTreatment).toBeUndefined();
    await ui.click('Add K-1 1 partner adjustment facts');
    for (const [label, value] of [
      ['source method', 'ordinary_current'], ['source year', '2025'],
      ['source reference', 'Fictional partner adjustments'], ['no other partner deductions or adjustments', 'true'],
    ]) await ui.change(`K-1 1 SE ${label}`, value);
    await ui.click('Add K-1 1 prior SE history');
    expect(ui.data()?.activities?.[0].selfEmploymentTreatment?.priorLossHistory?.amount).toBeUndefined();
    await ui.change('K-1 1 prior SE history source year', '2024');
    await ui.change('K-1 1 prior SE history source reference', 'Fictional filed SE history');
    await ui.confirmSources();
    expect(preview(ui.data())).toBeNull();
    await ui.change('K-1 1 prior SE history actual suspended SE loss', '1.25');
    await ui.confirmSources();
    expect(preview(ui.data())).toBeNull();
    expect(ui.data()?.activities?.[0].selfEmploymentTreatment?.priorLossHistory?.amount).toBe('1.25');
    await ui.change('K-1 1 prior SE history actual suspended SE loss', '0');
    await ui.confirmSources();
    const complete = preview(ui.data());
    expect(complete).not.toBeNull();
    expect(complete?.scheduleK1[0].ordinaryIncome).toBe('-100000.00');
    expect(complete?.scheduleK1[0].form6198?.ordinaryIncome).toBe('-100000');
  } finally { await ui.close(); }
});

it('binds EBL history controls to an immutable original regular source', async () => {
  const data = actualGuidedK1Sources(), nol = structuredClone(actualGuidedNolSources);
  const template = nol.vintages?.[0], alternative = nol.alternativeTax;
  if (!template || !alternative) throw new Error('Missing fictional original loss records');
  data.activities = [];
  delete data.form461Classification;
  data.allExcessBusinessLossHistoriesIncluded = true;
  nol.vintages = [{ ...template, originKind: 'excess_business_loss', originalLoss: '100000',
    openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] },
  { ...structuredClone(template), sourceId: 'ordinary2022', lossTaxYear: '2022',
    history: [{ taxYear: '2023', nolUsed: '5000', attributeReduction: '1000', sourceReference: 'Fictional filed 2023 ordinary loss history' }] }];
  alternative.vintages = [];
  const original = nol.vintages[0];
  const ui = await mount(data, nol);
  try {
    await ui.click('Add prior EBL qualified history');
    const choices = ui.control('EBL history 1 original regular NOL source') as HTMLSelectElement;
    expect([...choices.options].map(row => row.value)).toEqual(['', 'regular2021']);
    expect([...ui.element.querySelectorAll('button')]
      .find(row => row.textContent === 'Copy EBL history 1 original regular NOL record')?.disabled).toBe(true);
    await ui.change('EBL history 1 original regular NOL source', 'regular2021');
    await ui.click('Copy EBL history 1 original regular NOL record');
    expect(ui.data()?.excessBusinessLossHistories?.[0].originalNol).toEqual(original);
    expect(ui.data()?.excessBusinessLossHistories?.[0].originalNol).not.toBe(original);
    expect(ui.data()?.excessBusinessLossHistories?.[0].originalNol?.history).not.toBe(original.history);
    for (const [label, value] of [
      ['source year', '2024'], ['source reference', 'Fictional prior qualified EBL history'],
      ['owner', 'primary'], ['recipient name', 'Jordan Example'], ['recipient taxpayer ID last four', '3333'],
      ['origin activity name', 'Fictional prior activity'], ['origin activity EIN', '12-3456789'],
      ['origin Form 461 and character record', 'Fictional filed 461 and qualified character'],
      ['filed original qualified loss', '80000'], ['filed opening qualified carry', '80000'],
      ['all intervening qualified history included', 'true'], ['current material participation', 'true'],
    ]) await ui.change(`EBL history 1 ${label}`, value);
    await ui.click('Add EBL history 1 use or reduction');
    for (const [label, value] of [
      ['actual year', '2023'], ['qualified loss absorption', '120.17'],
      ['qualified attribute reduction', '0.09'], ['source reference', 'Fictional filed qualified history row'],
    ]) await ui.change(`EBL history 1 use 1 ${label}`, value);
    expect(ui.data()?.excessBusinessLossHistories?.[0].history).toEqual([{
      taxYear: '2023', qualifiedNolAbsorption: '120.17', qualifiedAttributeReduction: '0.09',
      sourceReference: 'Fictional filed qualified history row',
    }]);
    await ui.confirmSources();
    expect(preview(ui.data(), nol)).toBeNull(); // The new use conflicts with the unchanged actual regular origin.
    await ui.click('Remove EBL history 1 use 1');
    expect(ui.data()?.excessBusinessLossHistories?.[0].history).toEqual([]);
    await ui.confirmSources();
    expect(preview(ui.data(), nol)).not.toBeNull();
    original.sourceReference = 'Replacement original filed record';
    expect(ui.data()?.excessBusinessLossHistories?.[0].originalNol?.sourceReference).toBe('Original filed 2021 NOL worksheet');
    expect(preview(ui.data(), nol)).toBeNull();
    await ui.click('Copy EBL history 1 original regular NOL record');
    expect(ui.data()?.sourceFactsConfirmed).toBeNull();
    expect(ui.data()?.excessBusinessLossHistories?.[0].sourceFactsConfirmed).toBeNull();
    await ui.confirmSources();
    expect(preview(ui.data(), nol)).not.toBeNull();
    await ui.click('Add EBL history 1 use or reduction');
    await ui.click('Record no EBL history 1 prior uses or reductions');
    expect(ui.data()?.excessBusinessLossHistories?.[0].history).toEqual([]);
    await ui.click('Remove EBL history 1');
    expect(ui.data()?.excessBusinessLossHistories).toEqual([]);
    await ui.confirmSources();
    expect(preview(ui.data(), nol)).toBeNull();
    await ui.click('Remove K-1 and qualified loss sources');
    expect(ui.data()).toBeUndefined();
    expect(preview(ui.data(), nol)).toBeNull();
  } finally { await ui.close(); }
});
