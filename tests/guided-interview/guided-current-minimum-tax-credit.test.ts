// Spec: current-minimum-tax-credit-sources.yaml guided-originals/guided-edit-confirmation.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { buildGuidedCodAttributes } from '@/lib/guided-cod-attributes';
import { updateGuidedCodNol } from '@/lib/guided-cod-nol';
import { validateSection } from '@/lib/guided-interview-flow';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { guidedCurrentMtcState } from '../fixtures/guided-current-minimum-tax-credit';
import { actualGuidedK1Sources } from '../fixtures/guided-k1-qbi-sources';

it('preserves signed original statements and separate empty histories through the strict bridge', () => {
  const state = guidedCurrentMtcState(true), data = state.sectionData.adjustments!.codNolSources!.attributeSources!;
  const browserOriginal = JSON.parse(readFileSync(new URL('../fixtures/current-minimum-tax-credit-browser.json', import.meta.url), 'utf8'));
  expect(browserOriginal).toEqual(state);
  data.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements![0]!.depreciationAdjustment = '-200,000.00';
  const saved = JSON.parse(JSON.stringify(state)) as typeof state;
  expect(buildGuidedCodAttributes(data)?.currentMinimumTaxCredit?.sourceYearCalculation?.k1Statements?.[0]?.depreciationAdjustment).toBe('-200000');
  expect(validateSection(saved, 'adjustments').status).toBe('complete');
  const raw = buildTaxInputFromGuidedData(saved); expect(raw).not.toBeNull();
  const input = TaxYearInputSchema.parse(raw);
  expect(input.scheduleK1?.[0]?.amtDepreciationAdjustment).toBe('-200000');
  expect(input.netOperatingLoss?.alternativeTax?.regularBasisAndLossLimitsSameAsAlternativeConfirmed).toBe(false);
  const result = calculateFederalTax(input);
  expect(result.form8801?.creditAllowed.toFixed()).toBe('10361');
  expect(result.currentMinimumTaxCredit?.signedCurrentAdjustment.toFixed()).toBe('-41639');
  expect(result.carryforwards.minimumTaxCredit.toFixed()).toBe('17900');
});

it('retains unknown source answers and rejects mixed original packets', () => {
  const state = guidedCurrentMtcState(), original = state.sectionData.adjustments!.codNolSources!;
  for (const change of [
    (next: typeof state) => { next.sectionData.adjustments!.codNolSources!.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.minimumTaxCreditNolHistory!.carrybackSources = undefined; },
    (next: typeof state) => { next.sectionData.adjustments!.codNolSources!.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements![0]!.depreciationAdjustment = ''; },
    (next: typeof state) => { Object.assign(next.sectionData.adjustments!.codNolSources!.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements![0]!, { standaloneOriginal: { sourceReference: 'Actual original', entityType: 'partnership', allOtherAmountsZeroConfirmed: null, domesticContinuingNonPtpConfirmed: true } }); },
    (next: typeof state) => { next.sectionData.adjustments!.k1LossSources = actualGuidedK1Sources(); },
    (next: typeof state) => { next.sectionData.adjustments!.codNolSources!.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements!.push(structuredClone(next.sectionData.adjustments!.codNolSources!.attributeSources!.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements![0]!)); },
  ]) {
    const next = structuredClone(state); change(next); expect(buildTaxInputFromGuidedData(next)).toBeNull();
  }
  const attributes = structuredClone(original.attributeSources!);
  attributes.currentMinimumTaxCredit!.sourceYearCalculation!.k1Statements![0]!.depreciationAdjustment = '199999';
  const changed = updateGuidedCodNol(original, { attributeSources: attributes });
  expect(changed.sourceFactsConfirmed).toBeNull();
  expect(changed.attributeSources?.currentMinimumTaxCredit?.sourceYearCalculation?.k1Statements?.[0]?.sourceFactsConfirmed).toBeNull();
  expect(changed.attributeSources?.currentMinimumTaxCredit?.sourceYearCalculation?.minimumTaxCreditNolHistory?.sourceFactsConfirmed).toBeNull();
  state.sectionData.adjustments!.codNolSources = changed;
  expect(buildTaxInputFromGuidedData(JSON.parse(JSON.stringify(state)))).toBeNull();
});
