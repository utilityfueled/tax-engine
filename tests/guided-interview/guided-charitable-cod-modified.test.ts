// Spec: charitable-cod-modified-composition.yaml actual-guide.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildCurrentLossOrigin } from '@/lib/guided-current-loss-origin';
import { updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { guidedCharitableCodModifiedState } from '../fixtures/guided-charitable-cod-modified';

it('preserves actual source records through guided composition and reconfirmation', () => {
  const state = guidedCharitableCodModifiedState(), before = structuredClone(state);
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state)), result = calculateFederalTax(input);
  expect(input.form1099C).toHaveLength(1);
  expect([result.nolDeduction,result.agi,result.netOperatingLoss?.determinedCharitableCarryover?.reduction,
    result.carryforwards.nolCarryforward,result.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
    .toEqual(['39200','60800','9408','55800','10400']);
  expect(input.form982NolSources?.debts?.[0]?.interestIncluded).toBe('0');
  expect(input.form982NolSources?.title11Case).toBe(false); expect(state).toEqual(before);
  expect(result.form2210?.sourceFactsVerified).toBe(true);
  expect([result.totalTax, result.estimatedTaxPenalty, result.amountOwed].map(value => value?.toFixed())).toEqual(['2351', '99', '2450']);
  for (const mutate of [
    (value: typeof state) => { const debt = value.sectionData.adjustments?.codNolSources?.debts?.[0]; if (debt) debt.interestIncluded = ''; },
    (value: typeof state) => { const history = value.sectionData.adjustments?.netOperatingLossSources?.alternativeTax; if (history) history.vintages = undefined; },
    (value: typeof state) => { const history = value.sectionData.deductions?.charitableCarryoverSources; if (history) history.vintages = undefined; },
    (value: typeof state) => { const cod = value.sectionData.adjustments?.codNolSources; if (cod) cod.title11Case = null; },
  ]) { const missing = structuredClone(state); mutate(missing); expect(buildTaxInputFromGuidedData(missing)).toBeNull(); }
  const adjustment = structuredClone(state.sectionData.adjustments), debt = adjustment?.codNolSources?.debts?.[0];
  if (!debt) throw new Error('Missing actual fictional debt'); debt.amountDischarged = '5001';
  const changed = updateSectionData(state, 'adjustments', adjustment);
  expect(changed.sectionData.adjustments?.codNolSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.netOperatingLossSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.currentLossOrigin?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.deductions?.charitableCarryoverSources?.sourceFactsConfirmed).toBeNull();
  expect(changed.sectionData.adjustments?.codNolSources?.debts?.[0]?.amountDischarged).toBe('5001');
  expect(buildTaxInputFromGuidedData(changed)).toBeNull();
  // Actual answers are independently reconfirmed, without replacing entered sources.
  const next = structuredClone(changed.sectionData.adjustments), deductions = structuredClone(changed.sectionData.deductions);
  const cod = next?.codNolSources, loss = next?.netOperatingLossSources, current = next?.currentLossOrigin;
  const history = loss?.alternativeTax?.charitableCarryoverHistory;
  if (!next || !cod?.debts?.[0] || !cod.insolvency || !loss?.alternativeTax || !current?.businessSources?.[0]
    || !current.alternativeTax || !history?.alternativeCarryoverSources || !deductions?.charitableCarryoverSources) throw new Error('Missing original source histories');
  cod.debts[0].sourceFactsConfirmed = true; cod.insolvency.sourceFactsConfirmed = true; cod.sourceFactsConfirmed = true;
  loss.sourceFactsConfirmed = true; loss.alternativeTax.sourceFactsConfirmed = true;
  history.sourceFactsConfirmed = true; history.alternativeCarryoverSources.sourceFactsConfirmed = true;
  current.businessSources[0].sourceFactsConfirmed = true; current.alternativeTax.sourceFactsConfirmed = true; current.sourceFactsConfirmed = true;
  deductions.charitableCarryoverSources.sourceFactsConfirmed = true;
  let reconfirmed = updateSectionData(updateSectionData(changed, 'adjustments', next), 'deductions', deductions);
  const payments = structuredClone(reconfirmed.sectionData.payments);
  if (!payments?.estimatedTaxFacts) throw new Error('Missing original payment history');
  expect(payments.estimatedTaxFacts.sourceFactsConfirmed).toBeNull();
  payments.estimatedTaxFacts.sourceFactsConfirmed = true;
  reconfirmed = updateSectionData(reconfirmed, 'payments', payments);
  const final = calculateFederalTax(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(reconfirmed)))));
  expect([final.nolDeduction,final.carryforwards.nolCarryforward,final.carryforwards.alternativeTaxNolCarryforward].map(value => value?.toFixed()))
    .toEqual(['39200','55799','10399']);
});

// Spec: charitable-cod-modified-composition.yaml navigation-boundaries.
it('defers only later regular charity while keeping adjustment sources mandatory', () => {
  for (const confirmation of [false, null, undefined]) {
    const state = guidedCharitableCodModifiedState(), regular = state.sectionData.deductions?.charitableCarryoverSources;
    if (!regular) throw new Error('Missing fictional original history'); regular.sourceFactsConfirmed = confirmation;
    const before = structuredClone(state);
    expect(validateSection(state, 'adjustments').status).toBe('complete');
    expect(validateSection(state, 'deductions').status).toBe('partial');
    expect(buildTaxInputFromGuidedData(state)).toBeNull(); expect(state).toEqual(before);
  }
  const missing = guidedCharitableCodModifiedState();
  if (!missing.sectionData.deductions) throw new Error('Missing fictional deductions');
  delete missing.sectionData.deductions.charitableCarryoverSources;
  expect(validateSection(missing, 'adjustments').status).toBe('complete');
  expect(validateSection(missing, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(missing)).toBeNull();
  for (const change of [
    (state: typeof missing) => { const prior = state.sectionData.adjustments?.netOperatingLossSources; if (prior) prior.sourceTaxYear = '2024'; },
    (state: typeof missing) => { const prior = state.sectionData.adjustments?.netOperatingLossSources?.alternativeTax; if (prior) prior.sourceFactsConfirmed = null; },
    (state: typeof missing) => { const prior = state.sectionData.adjustments?.netOperatingLossSources?.alternativeTax; if (prior) prior.vintages = undefined; },
    (state: typeof missing) => { const debt = state.sectionData.adjustments?.codNolSources?.debts?.[0]; if (debt) debt.interestIncluded = ''; },
    (state: typeof missing) => { const current = state.sectionData.adjustments?.currentLossOrigin; if (current) current.sourceFactsConfirmed = false; },
  ]) {
    const invalid = structuredClone(missing); change(invalid);
    expect(validateSection(invalid, 'adjustments').status).toBe('partial');
    expect(buildTaxInputFromGuidedData(invalid)).toBeNull();
  }
});

// Spec: charitable-cod-modified-composition.yaml navigation-own-history.
it('requires the owned AMT charity history when the actual NOL histories are empty', () => {
  const state = guidedCharitableCodModifiedState(), adjustment = state.sectionData.adjustments;
  const prior = adjustment?.netOperatingLossSources, current = adjustment?.currentLossOrigin;
  if (!adjustment || !prior?.alternativeTax?.charitableCarryoverHistory || !current) throw new Error('Missing actual fictional source histories');
  prior.vintages = []; prior.alternativeTax.vintages = [];
  delete adjustment.codNolSources; current.cancelledDebtIncluded = false;
  state.segmentation.lifeEvents = state.segmentation.lifeEvents.filter(event => event !== 'cancelled-debt');
  for (const confirmation of ['missing', false, null, undefined] as const) {
    const missing = structuredClone(state), facts = missing.sectionData.adjustments;
    const alternative = facts?.netOperatingLossSources?.alternativeTax;
    if (!facts?.currentLossOrigin || !alternative?.charitableCarryoverHistory) throw new Error('Missing actual fictional AMT history');
    if (confirmation === 'missing') delete alternative.charitableCarryoverHistory;
    else alternative.charitableCarryoverHistory.sourceFactsConfirmed = confirmation;
    const before = structuredClone(missing);
    expect(() => buildCurrentLossOrigin(facts.currentLossOrigin, missing)).toThrow(/charit.*histor/i);
    expect(buildTaxInputFromGuidedData(missing)).toBeNull();
    expect(validateSection(missing, 'adjustments').status).toBe('partial');
    expect(missing).toEqual(before);
  }
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  if (!state.sectionData.deductions) throw new Error('Missing actual fictional deductions');
  delete state.sectionData.deductions.charitableCarryoverSources;
  expect(validateSection(state, 'adjustments').status).toBe('complete');
  expect(validateSection(state, 'deductions').status).toBe('partial');
  expect(buildTaxInputFromGuidedData(state)).toBeNull();
});
