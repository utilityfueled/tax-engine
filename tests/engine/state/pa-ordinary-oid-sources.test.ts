// Spec: spec/state/pa-ordinary-oid-sources.yaml. Missing-module control distinct from behavior red.
import { describe, expect, it } from 'vitest';
import { calculatePAOrdinaryOIDSources } from '@/engine/state/pa-ordinary-oid-sources.js';
import { paOrdinaryOIDFixture,refreshPAOIDOriginals } from '../../fixtures/pa-ordinary-oid-sources.js';
const periods={resident:[{from:'2025-01-01',through:'2025-12-31'}],part_year:[{from:'2025-07-01',through:'2025-12-31'}],nonresident:[]};
const run=(f:ReturnType<typeof paOrdinaryOIDFixture>,status:keyof typeof periods='resident')=>calculatePAOrdinaryOIDSources(f.input,f.oidAndMiscSources,periods[status]);
describe('finite PA personal OID and actual withholding original method',()=>{
 it('allocates actual taxable OID accruals to all three residencies',()=>{
  for(const [status,included,outside] of [['resident','1000','0'],['part_year','300','700'],['nonresident','0','1000']] as const){
   const result=run(paOrdinaryOIDFixture(status,'taxable'),status);
   expect(result.taxableInterest.toFixed()).toBe(included);expect(result.excludedNonresidentInterest.toFixed()).toBe(outside);
  }
 });
 it('preserves exact private source cents and all actual withholding jurisdictions',()=>{
  const f=paOrdinaryOIDFixture();const result=run(f);expect(result.paWithholding.toFixed()).toBe('0.3');
  expect(result.worldwideExemptInterest.toFixed()).toBe('1000');expect(result.taxableInterest.toFixed()).toBe('0');
 });
 it('binds private originals without leaking identifiers or changing originals',()=>{
  const f=paOrdinaryOIDFixture();f.oidAndMiscSources.sourceReference='Private900-70-0311 accountprivate-source-account';const before=structuredClone(f);
  const result=run(f);expect(result.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(result.lines)).not.toMatch(/900-70-0311|private-source-account|12-3456789|actual-original-state-id/);
  expect(f).toEqual(before);f.oidAndMiscSources.sourceReference+=' changed';expect(run(f).sourceCommitment).not.toBe(result.sourceCommitment);
 });
 it('rejects missing owner year current status and all-box confirmation',()=>{
  for(const field of ['sourceTaxYear','sourceFactsConfirmed','owner'] as const){const f=paOrdinaryOIDFixture();delete(f.oidAndMiscSources as Record<string,unknown>)[field];expect(()=>run(f)).toThrow();}
  const f=paOrdinaryOIDFixture();f.oidAndMiscSources.oid[0].currentUncorrectedNonvoidOriginalConfirmed=false;expect(()=>run(f)).toThrow();
 });
 it('does not infer direct Treasury exemption from federal classification',()=>{
  const f=paOrdinaryOIDFixture();f.oidAndMiscSources.oid[0].instrument.usTreasuryDirectObligationConfirmed=false;expect(()=>run(f)).toThrow();
  const guaranteed=paOrdinaryOIDFixture();guaranteed.oidAndMiscSources.oid[0].instrument.guaranteedAgencyOnly=true;expect(()=>run(guaranteed)).toThrow();
 });
 it('rejects strips premiums market discount and unknown recipient adjustments',()=>{
  const stripped=paOrdinaryOIDFixture();stripped.oidAndMiscSources.oid[0].instrument.stripped=true;expect(()=>run(stripped)).toThrow();
  for(const key of ['acquisitionPremium','bondPremium','marketDiscount','earlyWithdrawalPenalty'] as const){const f=paOrdinaryOIDFixture();f.input.form1099OID[0][key]='1';refreshPAOIDOriginals(f);expect(()=>run(f)).toThrow();}
 });
 it('requires dated exact accrual reconciliation and forbids cross-resident-period allocation guesses',()=>{
  const f=paOrdinaryOIDFixture();f.oidAndMiscSources.oid[0].accruals[0].oid='701';expect(()=>run(f)).toThrow();
  const crossing=paOrdinaryOIDFixture('part_year','taxable');crossing.oidAndMiscSources.oid[0].accruals=[{from:'2025-01-01',through:'2025-12-31',oid:'1000',coupon:'0',sourceReference:'Actual annual-only source insufficient for split'}];expect(()=>run(crossing,'part_year')).toThrow();
 });
 it('rejects unknown original status fields and contradictory private-activity classification',()=>{
  const f=paOrdinaryOIDFixture();Object.assign(f.input.form1099OID[0],{corrected:true});refreshPAOIDOriginals(f);expect(()=>run(f)).toThrow();
  const contradictory=paOrdinaryOIDFixture();contradictory.input.form1099OID[0].specifiedPrivateActivityBond=true;refreshPAOIDOriginals(contradictory);expect(()=>run(contradictory)).toThrow();
 });
 it('rejects duplicate semantic originals and prior-refunded claimed withholding',()=>{
  const duplicate=paOrdinaryOIDFixture();duplicate.input.form1099OID.push(structuredClone(duplicate.input.form1099OID[0]));duplicate.oidAndMiscSources.oid.push({...structuredClone(duplicate.oidAndMiscSources.oid[0]),originalIndex:1,sourceReference:'Different prose same original'});expect(()=>run(duplicate)).toThrow();
  const refunded=paOrdinaryOIDFixture();refunded.oidAndMiscSources.miscWithholding[0].withholdingConfirmation.notRefundedByPayerConfirmed=false;expect(()=>run(refunded)).toThrow();
 });
});
