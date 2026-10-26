// Spec: spec/federal/k1-passive-distribution-gain.yaml
import { expect, it } from 'vitest';
import { calculateK1CharitableReturnSources } from '@/engine/forms/k1-charitable-return-sources.js';
import { k1PassiveDistributionFixture, passiveDistributionSource } from '../../fixtures/k1-passive-distribution.js';
it('derives the actual valuation date from complete entity event sources',()=>{
  const input=k1PassiveDistributionFixture(),p=passiveDistributionSource(input);
  p.entitySelectedValuationDate='year_start';p.valuationDate='2025-01-01';
  p.activityEvents![0].propertyDisposedValue='10000';
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.passiveActivity?.valuationDate).toBe('2025-01-01');
  p.activityEvents![0].propertyDisposedValue='10000.01';
  expect(()=>calculateK1CharitableReturnSources(input)).toThrow(/valuation date/);
  p.valuationDate='2025-12-30';
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.passiveActivity?.valuationDate).toBe('2025-12-30');
  p.activityEvents![0].propertyDisposedValue='0';p.appreciatedContributionsFmv='1000.01';
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.passiveActivity?.valuationDate).toBe('2025-12-30');
  p.appreciatedContributionsFmv='0';p.depreciatedContributionsBasis='1000';p.valuationDate='2025-01-01';
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.passiveActivity?.valuationDate).toBe('2025-01-01');
});
it('requires complete actual passive property and participation evidence',()=>{
  for(const change of [
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.combinedParticipationHours=undefined;},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.combinedParticipationHours='100.01';},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.assets![0].character='portfolio';},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.assets![0].ownerBasisAdjustment=undefined;},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.assets![0].continuousPassiveUseConfirmed=false;},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.assets!.push({...p.assets![0]});},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.activityEvents=undefined;},
    (p:ReturnType<typeof passiveDistributionSource>)=>{p.sourceFactsConfirmed=false;},
  ]) {const input=k1PassiveDistributionFixture();change(passiveDistributionSource(input));expect(()=>calculateK1CharitableReturnSources(input)).toThrow();}
  const input=k1PassiveDistributionFixture(),original=JSON.stringify(input);
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.passiveActivity?.fairMarketValue.toFixed()).toBe('100000');
  expect(JSON.stringify(input)).toBe(original);
});

it('rejects split or missing actual activity identities in the valuation event ledger',()=>{
  const input=k1PassiveDistributionFixture(),p=passiveDistributionSource(input);
  p.entitySelectedValuationDate='year_start';p.valuationDate='2025-01-01';
  Object.assign(p.activityEvents![0],{activityName:'Original activity',propertyDisposedValue:'6000'});
  p.activityEvents!.push({...p.activityEvents![0],sourceId:'different-row',sourceReference:'Second actual event',activityName:' original ACTIVITY '});
  expect(()=>calculateK1CharitableReturnSources(input)).toThrow(/activity identit/);
  p.activityEvents!.pop();
  delete (p.activityEvents![0] as unknown as Record<string,unknown>).activityName;
  expect(()=>calculateK1CharitableReturnSources(input)).toThrow(/activity identit/);
});

it('reconciles actual business cash without inventing appreciation',()=>{
  const input=k1PassiveDistributionFixture(),p=passiveDistributionSource(input);
  p.assets![0].character='business_cash';
  expect(()=>calculateK1CharitableReturnSources(input)).toThrow(/cash.*basis/);
  p.assets![0].adjustedBasis='100000';
  expect(calculateK1CharitableReturnSources(input)?.statements[0].distributionGain?.gain.toFixed()).toBe('1000');
  p.assets![0].ownerBasisAdjustment='0.01';
  expect(()=>calculateK1CharitableReturnSources(input)).toThrow(/cash.*basis/);
});
