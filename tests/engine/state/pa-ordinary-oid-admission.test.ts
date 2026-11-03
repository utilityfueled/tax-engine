// Spec: spec/state/pa-ordinary-oid-sources.yaml. Existing engine behavioral controls.
import { describe, expect, it } from 'vitest';
import { calculatePAResidencySources } from '@/engine/state/pa-residency-sources.js';
import { calculatePAOrdinaryReturnFacts } from '@/engine/state/pa-ordinary-return-facts.js';
import { calculatePAOrdinaryReturn } from '@/engine/state/pa-ordinary-return.js';
import { paOrdinaryOIDFixture,refreshPAOIDOriginals } from '../../fixtures/pa-ordinary-oid-sources.js';

// Literal all-three values independently follow aggregate PA class income and 3.07%.
describe('actual PA personal investment original admission',()=>{
 it('admits actual direct Treasury OID while preserving all three literal PA taxes',()=>{
  for(const [status,tax] of [['resident','1539'],['part_year','799'],['nonresident','184']] as const){
   const f=paOrdinaryOIDFixture(status);const result=calculatePAResidencySources(f.input,f.sources);
   expect(result.taxBeforeCredits.toFixed()).toBe(tax);
   expect(result.reportedInterest.toFixed()).toBe(status==='resident'?'120':status==='part_year'?'40':'0');
  }
 });
 it('preserves worldwide exempt Treasury income for SP line2',()=>{
  for(const status of ['resident','part_year','nonresident'] as const){
   const f=paOrdinaryOIDFixture(status);const result=calculatePAOrdinaryReturnFacts(f.input,f.facts);
   expect(result.spOtherIncomeByLine['2'].toFixed()).toBe('1000');
   expect(result.paWithholding.toFixed()).toBe((status==='resident'?'1539.3':status==='part_year'?'799.3':'184.3'));
  }
 });
 it('combines bank and OID cents before one PA class rounding',()=>{
  const f=paOrdinaryOIDFixture('resident','taxable');f.input.form1099Int[0].interestIncome='120.49';
  f.sources.interest[0].original=structuredClone(f.input.form1099Int[0]);f.sources.interest[0].credits[0].amount='120.49';
  f.input.form1099OID[0].originalIssueDiscount='0.49';f.oidAndMiscSources.oid[0].accruals[0].oid='0.49';f.oidAndMiscSources.oid[0].accruals[1].oid='0';
  refreshPAOIDOriginals(f);expect(calculatePAResidencySources(f.input,f.sources).reportedInterest.toFixed()).toBe('121');
 });
 it('keeps outside-period taxable OID in worldwide SP income',()=>{
  const f=paOrdinaryOIDFixture('part_year','taxable');const result=calculatePAOrdinaryReturnFacts(f.input,f.facts);
  expect(result.paTaxableIncome.toFixed()).toBe('26340');expect(result.spOutsidePAIncome.toFixed()).toBe('24780');
  expect(result.spOtherIncomeByLine['2'].toFixed()).toBe('0');
 });
 it('retains exact original OID and MISC withholding before reported PA40 rounding',()=>{
  const f=paOrdinaryOIDFixture();const result=calculatePAOrdinaryReturnFacts(f.input,f.facts);
  expect(result.paWithholding.toFixed()).toBe('1539.3');expect(result.estimatedPayments.toFixed()).toBe('0');
 });
 it('rejects missing source rows and stale original identity',()=>{
  const f=paOrdinaryOIDFixture();f.oidAndMiscSources.oid=[];expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
  const stale=paOrdinaryOIDFixture();stale.input.form1099OID[0].treasuryOID='1001';expect(()=>calculatePAResidencySources(stale.input,stale.sources)).toThrow();
 });
 it('rejects known positive or unknown MISC income while preserving erroneous actual withholding',()=>{
  const positive=paOrdinaryOIDFixture();positive.input.form1099Misc[0].rents='1';refreshPAOIDOriginals(positive);
  expect(()=>calculatePAResidencySources(positive.input,positive.sources)).toThrow();
  const missing=paOrdinaryOIDFixture();delete missing.oidAndMiscSources.miscWithholding[0].original.rents;
  expect(()=>calculatePAResidencySources(missing.input,missing.sources)).toThrow();
  const actual=paOrdinaryOIDFixture();expect(calculatePAOrdinaryReturnFacts(actual.input,actual.facts).paWithholding.toFixed()).toBe('1539.3');
 });
 it('reconciles retained PA OID classification and rejects a free schedule override',()=>{
  const f=paOrdinaryOIDFixture();f.input.paResidentReturn={scheduleA:{oidSources:[{sourceId:'fictional-oid-original-1',sourceReference:'Actual PA issuer worksheet',factsConfirmed:true,paTaxTreatment:'us_government',strippedBond:false,bondPremiumNettedOnStatement:'0',paBondPremiumAmortization:'0'}]}};
  refreshPAOIDOriginals(f);expect(calculatePAResidencySources(f.input,f.sources).taxBeforeCredits.toFixed()).toBe('1539');
  const scheduleA=f.input.paResidentReturn.scheduleA;if(!scheduleA)throw new Error('Fixture actual ScheduleA missing');
  scheduleA.additionAdjustments=[{description:'Free caller adjustment',amount:'1'}];
  expect(()=>calculatePAResidencySources(f.input,f.sources)).toThrow();
 });
 it('retains positive outside-state withholding and requires its actual credit successor',()=>{
  const f=paOrdinaryOIDFixture();expect(calculatePAOrdinaryReturn(f.input,f.facts,f.completion).pa40.taxLiability.toFixed()).toBe('1539');
  const stateRows=f.input.form1099OID[0].stateWithholding;if(!stateRows)throw new Error('Fixture actual state rows missing');
  stateRows.push({state:'DE',statePayerId:'actual-other-state-id',stateWithheld:'3'});refreshPAOIDOriginals(f);
  expect(calculatePAOrdinaryReturnFacts(f.input,f.facts).paWithholding.toFixed()).toBe('1539.3');
  expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.completion)).toThrow(/other.state|jurisdiction|credit/i);
 });
});
