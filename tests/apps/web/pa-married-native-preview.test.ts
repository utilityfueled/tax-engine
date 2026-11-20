import {requiredNative} from '../../fixtures/pa-married-native-public';
/** Spec: spec/state/pa-married-native-public.yaml. Actual unchanged native conversion. */
import {afterEach, expect, it, vi} from 'vitest';
import * as marriedReturn from '@/engine/state/pa-married-ordinary-return';
import * as bridge from '@/lib/guided-interview-bridge';
import {computeGuidedPreviewOutcome} from '@/lib/guided-preview-compute';
import {confirmGuidedPAMarriedOrdinarySources} from '@/lib/guided-pa-married-ordinary-sources';
import {confirmGuidedPAMarriedPayments, updateGuidedPAMarriedPayments} from '@/lib/guided-pa-married-payments';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {updateSectionData,validateSection,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {calculatePAReturn} from '@/index';
import {guidedPAMarriedNativeFixture} from '../../fixtures/guided-pa-married-native';
import {paMarriedPaymentNativeBrowserFixture} from '../../fixtures/pa-married-payment-native-browser';
it('PA married preview retains two owned results without a household cash scalar',()=>{const f=guidedPAMarriedNativeFixture('M','shared-sp'),before=JSON.stringify(f.state),out=computeGuidedPreviewOutcome(f.state);expect(out.blockedBy).toBeNull();expect(out.metrics).not.toBeNull();expect(out.metrics?.state).toMatchObject({kind:'separate-returns',stateCode:'PA',returns:[{accountHolder:'primary',filingChoice:'M',stateTax:'307',stateWithholding:'307',stateRefund:'276',stateAmountOwed:'0'},{accountHolder:'spouse',filingChoice:'M',stateTax:'92',stateWithholding:'92',stateRefund:'83',stateAmountOwed:'0'}]});for(const scalar of ['stateTax','stateWithholding','stateRefund','stateAmountOwed'])expect(out.metrics?.state).not.toHaveProperty(scalar);expect(JSON.stringify(f.state)).toBe(before);});
it('PA married native original builder reaches existing public API without single source roots',()=>{const f=guidedPAMarriedNativeFixture(),input=buildGuidedStateOriginals(f.input,f.state),result:unknown=calculatePAReturn(input);expect(input.paMarriedOrdinarySources).toEqual(f.sources);for(const key of ['paResidencySources','paReciprocitySources','paOrdinaryReturnFacts','paOrdinaryReturnCompletionSources'])expect(input).not.toHaveProperty(key);expect(result).toMatchObject({methodVersion:'pa-married-ordinary-return-v1',filingMode:'M',returns:[{accountHolder:'primary'},{accountHolder:'spouse'}]});});
it('PA married native section validation accepts complete actual household sources',()=>{const f=guidedPAMarriedNativeFixture();expect(validateSection(f.state,'state-return').status).toBe('complete');});
it('PA married native owner edit invalidates confirmation before preview and cannot refresh proof',()=>{const f=guidedPAMarriedNativeFixture(),before=structuredClone(f.sources.originalFederalSources),p=requiredNative(f.state.sectionData['personal-info']);const next=updateSectionData(f.state,'personal-info',{...p,spouse:{...requiredNative(p.spouse),firstName:'Actual edited Robin'}});expect(next.sectionData['state-return']?.paMarriedOrdinarySources?.sourceFactsConfirmed).toBeNull();expect(next.sectionData['state-return']?.paMarriedOrdinarySources?.originalFederalSources).toEqual(before);expect(validateSection(next,'state-return').status).toBe('partial');expect(computeGuidedPreviewOutcome(next).metrics?.state??null).toBeNull();});
it.each(['stateEstimatedPayments','additionalStateWithholdingEntries']as const)('PA married native cannot suppress retained generic %s',key=>{const f=guidedPAMarriedNativeFixture(),data=requiredNative(f.state.sectionData['state-return']);if(key==='stateEstimatedPayments')data.stateEstimatedPayments=[{state:'PA',date:'2025-04-15',amount:'0'}];else data.additionalStateWithholdingEntries=[{payer:'Fictional retained source',documentType:'W-2',state:'PA',taxYear:'2025',amount:'0'}];const before=JSON.stringify(data);expect(()=>buildGuidedStateOriginals(f.input,f.state)).toThrow();expect(validateSection(f.state,'state-return').status).toBe('partial');expect(JSON.stringify(data)).toBe(before);});

afterEach(() => vi.restoreAllMocks());

it.each(['J', 'M'] as const)('calculates the current guided PA %s preview once', mode => {
  const {state} = guidedPAMarriedNativeFixture(mode, 'shared-sp');
  const calculation = vi.spyOn(marriedReturn, 'calculatePAMarriedOrdinaryReturn');
  const outcome = computeGuidedPreviewOutcome(state);

  expect(outcome.blockedBy).toBeNull();
  if (mode === 'J') {
    expect(outcome.metrics?.state).toEqual({
      stateCode: 'PA', stateName: 'Pennsylvania', stateTax: '40', stateRefund: '359',
      stateAmountOwed: '0', stateWithholding: '399',
    });
  } else {
    expect(outcome.metrics?.state).toMatchObject({
      kind: 'separate-returns', returns: [
        {accountHolder: 'primary', stateTax: '307', stateRefund: '276', stateWithholding: '307', stateAmountOwed: '0'},
        {accountHolder: 'spouse', stateTax: '92', stateRefund: '83', stateWithholding: '92', stateAmountOwed: '0'},
      ],
    });
  }
  expect(calculation).toHaveBeenCalledTimes(1);
});

it('replays the current separate PA payments after a receipt edit and reload', () => {
  const {state, input, expected} = paMarriedPaymentNativeBrowserFixture();
  const data = requiredNative(state.sectionData['state-return']);
  data.paMarriedOrdinarySources = expected;
  const outcome = computeGuidedPreviewOutcome(state);
  expect(outcome.metrics?.state).toMatchObject({
    kind: 'separate-returns', returns: [
      {accountHolder: 'primary', stateTax: '1535', stateRefund: '327', stateWithholding: '1862', stateAmountOwed: '0'},
      {accountHolder: 'spouse', stateTax: '921', stateRefund: '80', stateWithholding: '1001', stateAmountOwed: '0'},
    ],
  });

  const editedPayments = structuredClone(requiredNative(expected.paymentSources));
  editedPayments.accounts[0].receipts[0].sourceReference = 'Fictional changed receipt original reference';
  const edited = updateSectionData(state, 'state-return', {
    ...data, paMarriedOrdinarySources: updateGuidedPAMarriedPayments(expected, editedPayments),
  });
  const reopened = JSON.parse(JSON.stringify(edited)) as GuidedFlowState;
  const reopenedData = requiredNative(reopened.sectionData['state-return']);
  const reopenedSources = requiredNative(reopenedData.paMarriedOrdinarySources);
  expect(computeGuidedPreviewOutcome(reopened).metrics?.state).toBeNull();
  expect(() => buildGuidedStateOriginals(input, reopened)).toThrow(/confirm actual selected-year/);
  const paymentConfirmed = confirmGuidedPAMarriedPayments(input, reopenedSources);
  reopenedData.paMarriedOrdinarySources = paymentConfirmed;
  expect(computeGuidedPreviewOutcome(reopened).metrics?.state).toBeNull();

  reopenedData.paMarriedOrdinarySources = confirmGuidedPAMarriedOrdinarySources(input, paymentConfirmed);
  expect(computeGuidedPreviewOutcome(reopened)).toEqual(outcome);
  expect(buildGuidedStateOriginals(input, reopened).paMarriedOrdinarySources)
    .toEqual(reopenedData.paMarriedOrdinarySources);
});

it('requires a retained canonical PA packet to match the current guided originals', () => {
  const {state, input, sources} = guidedPAMarriedNativeFixture('J', 'shared-sp');
  const outcome = computeGuidedPreviewOutcome(state);
  const buildInput = vi.spyOn(bridge, 'buildTaxInputFromGuidedData');
  buildInput.mockReturnValueOnce({...input, paMarriedOrdinarySources: structuredClone(sources)});
  expect(computeGuidedPreviewOutcome(state)).toEqual(outcome);

  const conflictingInput = {...input, paMarriedOrdinarySources: {...sources, sourceReference: 'Fictional conflicting retained original'}};
  buildInput.mockReturnValueOnce(conflictingInput);
  expect(computeGuidedPreviewOutcome(state).metrics?.state).toBeNull();
  expect(() => buildGuidedStateOriginals(conflictingInput, state)).toThrow(/canonical source packet conflicts/);

  delete requiredNative(state.sectionData['state-return']).paMarriedOrdinarySources;
  buildInput.mockReturnValueOnce({...input, paMarriedOrdinarySources: sources});
  expect(computeGuidedPreviewOutcome(state).metrics?.state).toBeNull();
  expect(() => buildGuidedStateOriginals({...input, paMarriedOrdinarySources: sources}, state)).toThrow(/retained married PA household packet/);
});
