// Spec: spec/state/pa-ordinary-oid-precision-integration.yaml; original6peercontrolsunchanged.
import {describe,it,expect} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {PAResidencySourcesSchema} from '@/models/pa-residency.js';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources.js';
import {paOrdinaryOIDFixture,refreshPAOIDOriginals} from '../../fixtures/pa-ordinary-oid-sources.js';
describe('independent actual OID downstream precision',()=>{
 it('preserves accepted OID digits through actual residency and Schedule A',()=>{
  const f=paOrdinaryOIDFixture('resident','taxable');const big='1'+'0'.repeat(100)+'.49';
  f.input.form1099OID[0].originalIssueDiscount=big;
  f.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-12-31',oid:big,coupon:'0',sourceReference:'Fictional actual accepted OID original long amount'}];
  refreshPAOIDOriginals(f);
  expect(TaxYearInputSchema.safeParse(f.input).success).toBe(true);
  expect(PAResidencySourcesSchema.safeParse(f.sources).success).toBe(true);
  const result=calculatePAResidencySources(f.input,f.sources);
  expect.soft(result.interest.toFixed()).toBe('10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000120.49');
  expect.soft(result.scheduleA.line1.toFixed()).toBe('10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000120');
  expect.soft(result.reportedInterest.toFixed()).toBe('10000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000120');
 });
});
