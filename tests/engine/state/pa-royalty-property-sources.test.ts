// Spec: spec/state/pa-royalty-property-sources.yaml.
import { expect, it } from 'vitest';
import { calculatePAReturn } from '@/engine/state/pa-orchestrator.js';
import { parsedRoyaltyPropertyFixture } from '../../fixtures/royalty-property.js';

it('requires the PA property source method before using actual royalty ledgers',()=>{
  const input=parsedRoyaltyPropertyFixture();input.taxpayer.address.state='PA';
  expect(()=>calculatePAReturn(input)).toThrow(/PA.*royalty.*(classification|source|expense)/i);
});
