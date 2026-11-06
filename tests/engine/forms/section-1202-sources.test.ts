// Spec: spec/federal/section-1202-sources.yaml.
import { expect, it } from 'vitest';
import { calculateSection1202Sources } from '@/engine/forms/section-1202-sources.js';
import { qsbsInput } from '../../fixtures/section-1202.js';

const packet = (input: ReturnType<typeof qsbsInput>) => {
  if (!input.section1202Sources) throw new Error('Missing synthetic source packet');
  return input.section1202Sources;
};
it('binds the actual brokerage gain and preserves source cents', () => {
  const result = calculateSection1202Sources(qsbsInput());
  expect(result?.exclusion.toFixed()).toBe('500.125');
  expect(result?.section1202WorksheetComponent.toFixed()).toBe('500.125');
  expect(result?.amtPreference.toFixed()).toBe('35.00875');
  expect(result?.lots[0].sourceId).toBe('actual-lot');
  expect(result?.bindings[0].originalSourceId).toBe('form1099B:0:transaction:0');
  expect(JSON.stringify(result?.lines)).not.toMatch(/Private|Jane|6789|actual-issuer/);
});
it('reconciles prior issuer use before applying exclusion percentages', () => {
  const input = qsbsInput();
  packet(input).issuers[0].priorEligibleGainUsed = '9999500';
  packet(input).issuers[0].priorReturns = [{ taxYear: 2024, sourceReference: 'Actual prior return', filingStatus: 'single',
    primary: { firstName: 'Jane', lastName: 'Doe', ssnLast4: '6789' }, eligibleGainUsed: '9999500' }];
  packet(input).lots[0].basisIgnoringPostIssueAdditions = '0';
  expect(calculateSection1202Sources(input)?.exclusion.toFixed()).toBe('250');
  packet(input).issuers[0].priorReturns[0].eligibleGainUsed = '9999499';
  expect(() => calculateSection1202Sources(input)).toThrow(/history|reconcile/i);
});
it('uses original corporate and business facts rather than the stock label', () => {
  for (const change of [
    { domesticCCorporationAtIssue: false }, { consideration: 'stock' }, { maxGrossAssetsBeforeIssue: '50000000.01' },
    { grossAssetsImmediatelyAfterIssue: '50000000.01' }, { cCorporationThroughoutHolding: false },
    { activeBusinessRequirementSatisfied: false }, { redemptionRestrictionsSatisfied: false },
  ]) {
    const input = qsbsInput(); Object.assign(packet(input).lots[0].qualification, change);
    expect(calculateSection1202Sources(input)?.exclusion.toFixed()).toBe('0');
  }
  const unresolved = qsbsInput(); packet(unresolved).lots[0].qualification.offsettingPositionPresent = true;
  expect(() => calculateSection1202Sources(unresolved)).toThrow(/offsetting|position/i);
});
it('binds each fund issuer and original constant ownership share', () => {
  const input = qsbsInput('fund');
  expect(calculateSection1202Sources(input)?.exclusion.toFixed()).toBe('500.125');
  const original = packet(input).lots[0];
  if (!original.passThrough) throw new Error('Missing synthetic fund source');
  original.passThrough.entityRecognizedGain = '100024';
  expect(() => calculateSection1202Sources(input)).toThrow(/gain|reconcile/i);
  const partitioned = qsbsInput('fund'), sources = packet(partitioned);
  sources.issuers.push({ ...sources.issuers[0], issuerId: 'second-issuer', issuerName: 'Second synthetic corporation' });
  const first = sources.lots[0];
  if (!first.passThrough) throw new Error('Missing synthetic fund source');
  first.recognizedGain = '600.10'; first.passThrough.entityRecognizedGain = '60010';
  sources.lots.push({ ...first, lotId: 'second-lot', issuerId: 'second-issuer', securityDescription: 'Second synthetic corporation',
    originalIssueDate: '2011-01-02', effectiveAcquiredDate: '2011-01-02', recognizedGain: '400.15',
    passThrough: { ...first.passThrough, entityRecognizedGain: '40015' } });
  expect(calculateSection1202Sources(partitioned)?.exclusion.toFixed()).toBe('700.2');
  sources.lots.pop();
  expect(() => calculateSection1202Sources(partitioned)).toThrow(/partition/i);
});
it('does not qualify late or interrupted fund ownership', () => {
  for (const change of [{ ownerInterestAcquiredDate: '2008-01-03' }, { heldContinuouslyThroughSale: false }]) {
    const input = qsbsInput('fund'); Object.assign(packet(input).lots[0].passThrough ?? {}, change);
    expect(calculateSection1202Sources(input)?.exclusion.toFixed()).toBe('0');
  }
  const input = qsbsInput('fund');
  if (!packet(input).lots[0].passThrough) throw new Error('Missing synthetic fund source');
  Object.assign(packet(input).lots[0].passThrough, { unchangedOwnershipProportionConfirmed: false });
  expect(() => calculateSection1202Sources(input)).toThrow(/interest|ownership/i);
});
it('requires the actual empowerment source for a positive attribution', () => {
  const input = qsbsInput(); packet(input).lots[0].empowermentZoneGainThrough2018 = '400';
  expect(() => calculateSection1202Sources(input)).toThrow(/empowerment/i);
  packet(input).lots[0].empowermentQualificationAndAttributionConfirmed = true;
  expect(calculateSection1202Sources(input)?.exclusion.toFixed()).toBe('540.125');
});
it('rejects unknown stale incomplete or conflicting source facts', () => {
  const changes: Array<(input: ReturnType<typeof qsbsInput>) => void> = [
    input => { packet(input).taxYear = 2024; }, input => { packet(input).primary.firstName = 'Other'; },
    input => { packet(input).lots[0].proceeds = '1100.36'; }, input => { packet(input).lots[0].payerName = 'Other'; },
    input => { packet(input).lots[0].accountHolder = 'spouse'; }, input => { packet(input).lots[0].dateSold = '2025-07-01'; },
    input => { packet(input).lots[0].recognizedGain = '1000.26'; }, input => { packet(input).lots.push({ ...packet(input).lots[0] }); },
    input => { packet(input).lots[0].sourceReference = ''; }, input => { packet(input).lots[0].qualification.maxGrossAssetsBeforeIssue = '-1'; },
    input => { packet(input).lots[0].qualification.allPredecessorAndControlledGroupAssetsIncluded = false; },
    input => { packet(input).lots[0].sourceId = 'form1099B:00:transaction:0'; },
    input => { input.form1099B[0].transactions[0].holdingPeriod = 'short'; },
  ];
  for (const change of changes) { const input = qsbsInput(); change(input); expect(() => calculateSection1202Sources(input)).toThrow(); }
  const missing = qsbsInput('fund'); missing.section1202Sources = undefined;
  expect(() => calculateSection1202Sources(missing)).toThrow(/source|history/i);
  const omitted = qsbsInput('fund'); packet(omitted).lots = [];
  expect(() => calculateSection1202Sources(omitted)).toThrow(/source|reconcile|partition/i);
});
