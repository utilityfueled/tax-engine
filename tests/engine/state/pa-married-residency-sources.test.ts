import {describe,it,expect} from 'vitest';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {paMarriedMixedResidencyFixture} from '../../fixtures/pa-married-residency-sources.js';
import {marriedOriginals} from '../../fixtures/pa-married-ordinary-return.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {preparePAMarriedReturnReview,resolvePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources.js';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator.js';
describe('PA married actual separate residency sources',()=>{
 it('retains actual federal MFJ while taxing only original nonresident PA payroll',()=>{
  const f=paMarriedMixedResidencyFixture(),before=structuredClone(f),r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(r.federal.filingStatus).toBe('married_filing_jointly');expect(r.federal.adjustedGrossIncome.toString()).toBe('80000');
  expect(r.perOwner.map(o=>o.rawCompensation.toString())).toEqual(['50000','12000']);
  expect(r.returns.map(o=>o.pa40.taxLiability.toString())).toEqual(['1535','368']);
  expect(r.returns.map(o=>o.pa40.stateWithholding.toString())).toEqual(['1535','368']);
  expect(r.returns.map(o=>o.schoolDistrictCode)).toEqual(['02745','99999']);
  expect(r.returns.map(o=>o.residency?.status)).toEqual(['resident','nonresident']);
  expect(r.readiness.filingEligible).toBe(false);expect(f).toEqual(before);
 });
 it('uses actual part-year cash chronology rather than a day fraction',()=>{
  const f=paMarriedMixedResidencyFixture('part_year'),r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(r.perOwner[1].rawCompensation.toString()).toBe('18000');expect(r.perOwner[1].actualPAServiceCompensation.toString()).toBe('9000');
  expect(r.returns[1].pa40.taxLiability.toString()).toBe('553');expect(r.returns[1].pa40.stateWithholding.toString()).toBe('553');
  expect(r.returns[1].schoolDistrictCode).toBe('02745');expect(r.federal.adjustedGrossIncome.toString()).toBe('80000');
  expect(r.returns[1].residency).toEqual({status:'part_year',residentPeriods:[{from:'2025-07-01',through:'2025-12-31'}]});
 });
 it('includes excluded nonresident worldwide cash in both married SP worksheets',()=>{
  const f=paMarriedMixedResidencyFixture(),r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(r.returns.map(o=>o.scheduleSP.eligibilityIncome.toString())).toEqual(['80000','80000']);
  expect(r.returns.map(o=>o.scheduleSP.taxForgivenessCredit.toString())).toEqual(['0','0']);
 });
 it('does not forgive low Pennsylvania-only cash when actual worldwide married income exceeds the table',()=>{
  const f=paMarriedMixedResidencyFixture();
  for(const [index,w] of f.input.w2s.entries()){
   Object.assign(w,{wages:'10000',socialSecurityWages:'10000',socialSecurityWithheld:'620',medicareWages:'10000',medicareWithheld:'145',stateWages:index===0?'10000':'2000',stateTaxWithheld:index===0?'307':'61'});
   const row=f.sources.wages[index];row.original=structuredClone(w);row.payroll[0].grossCompensation='10000';row.payroll[0].paServicesCompensation=index===0?'10000':'2000';row.payroll[0].outsidePAServicesCompensation=index===0?'0':'8000';
  }
  f.sources.originalFederalSources=marriedOriginals(f.input);
  const r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(r.returns.map(o=>o.pa40.totalPATaxableIncome.toString())).toEqual(['10000','2000']);
  expect(r.returns.map(o=>o.scheduleSP.eligibilityIncome.toString())).toEqual(['20000','20000']);
  expect(r.returns.map(o=>o.scheduleSP.taxForgivenessCredit.toString())).toEqual(['0','0']);
  expect(r.returns.map(o=>o.pa40.taxLiability.toString())).toEqual(['307','61']);
 });
 it('rejects stale and incomplete actual mixed-residency sources',()=>{
  for(const mutate of [
   (f:ReturnType<typeof paMarriedMixedResidencyFixture>)=>{f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=null;},
   (f:ReturnType<typeof paMarriedMixedResidencyFixture>)=>{f.sources.residencySources.owners[1].originalTaxpayer.firstName='Changed';},
   (f:ReturnType<typeof paMarriedMixedResidencyFixture>)=>{f.sources.wages[1].payroll[0].outsidePAServicesCompensation='17999';},
   (f:ReturnType<typeof paMarriedMixedResidencyFixture>)=>{f.input.w2s[1].stateWages='12001';f.sources.wages[1].original=structuredClone(f.input.w2s[1]);f.sources.originalFederalSources=marriedOriginals(f.input);},
  ]){const f=paMarriedMixedResidencyFixture();mutate(f);expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow();}
 });
 it('requires actual employer-required service location review rather than convenience inference',()=>{
  const f=paMarriedMixedResidencyFixture();f.sources.residencySources.owners[1].allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed=false;
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/employer|required|location/);
 });
 it('requires actual original-bound mixed paper and retains unavailable year gates',()=>{
  const f=paMarriedMixedResidencyFixture();f.input.paMarriedOrdinarySources=PAMarriedOrdinarySourcesSchema.parse(f.sources);
  expect(calculatePAMarriedOrdinaryReturn(f.input,f.sources).returns).toHaveLength(2);
  const token=preparePAMarriedReturnReview(f.input),married=calculatePAMarriedOrdinaryReturn(f.input,f.sources),result={...calculateFederalTax(f.input),stateReturns:{pennsylvania:married}};
  expect(resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),result,token).map(row=>row.projection.residency?.status)).toEqual(['resident','nonresident']);
  expect(()=>resolvePAMarriedReturnReview(redactReviewIdentifiers(f.input),result,{}as typeof token)).toThrow(/context|prepared/);
  f.input.taxpayer.taxYear=2026;expect(()=>preparePAMarriedReturnReview(f.input)).toThrow(/2026|year/);
 });
 it('reaches the actual canonical Pennsylvania dispatcher without scalar overrides',()=>{
  const f=paMarriedMixedResidencyFixture();f.input.paMarriedOrdinarySources=PAMarriedOrdinarySourcesSchema.parse(f.sources);
  expect(JSON.parse(JSON.stringify(calculatePAReturn(f.input)))).toEqual(JSON.parse(JSON.stringify(calculatePAMarriedOrdinaryReturn(f.input,f.sources))));
  expect(()=>calculatePAReturn(f.input,{compensation:'1'} as never)).toThrow(/overrid|scalar/i);
 });
 it('uses original move-out chronology and actual December31 outside school code',()=>{
  const f=paMarriedMixedResidencyFixture('part_year'),r=f.sources.residencySources.owners[1].residency;
  r.domicilePeriods[0].state='PA';r.domicilePeriods[1].state='FL';
  r.paPermanentAbodePeriods=[{from:'2025-01-01',through:'2025-06-30'}];r.outsidePAPermanentAbodePeriods=[{from:'2025-07-01',through:'2025-12-31'}];
  r.dec31PrincipalResidenceState='FL';r.schoolDistrictCode='99999';r.schoolDistrictName='Outside Pennsylvania';
  f.input.w2s[1].stateWages='21000';f.input.w2s[1].stateTaxWithheld='645';f.sources.wages[1].original=structuredClone(f.input.w2s[1]);f.sources.originalFederalSources=marriedOriginals(f.input);
  const out=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(out.perOwner[1].rawCompensation.toString()).toBe('21000');expect(out.returns[1].pa40.taxLiability.toString()).toBe('645');expect(out.returns[1].schoolDistrictCode).toBe('99999');
 });
 it('does not infer a nonresident reciprocity exemption from a neighboring-state name',()=>{
  const f=paMarriedMixedResidencyFixture();f.sources.residencySources.owners[1].residency.domicilePeriods[0].state='OH';
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/reciprocal/);
 });
 const invalid:Array<[string,(f:ReturnType<typeof paMarriedMixedResidencyFixture>)=>void]>=[
  ['unknown calendar confirmation',f=>{f.sources.residencySources.sourceFactsConfirmed=false;}],
  ['wrong selected source year',f=>{f.sources.residencySources.sourceTaxYear=2024;}],
  ['duplicate calendar owner',f=>{f.sources.residencySources.owners[1].accountHolder='primary';}],
  ['missing calendar owner',f=>{f.sources.residencySources.owners.pop();}],
  ['foreign current owner identity',f=>{f.sources.residencySources.owners[1].originalTaxpayer.ssn='900-70-9999';}],
  ['competing confirmed legacy residency',f=>{f.sources.owners[1].residency.factsConfirmed=true;}],
  ['competing legacy actual day value',f=>{f.sources.owners[1].residency.actualDaysInPA=0;}],
  ['retained legacy domicile claim',f=>{f.sources.owners[1].residency.domicileState='FL';}],
  ['claimed resident contradicts calendar',f=>{f.sources.residencySources.owners[1].residency.status='resident';}],
  ['joint state election was not sourced',f=>{f.sources.filingMode='J';}],
  ['unknown employer classification',f=>{f.sources.residencySources.owners[1].allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed=null;}],
  ['missing employer classification',f=>{Reflect.deleteProperty(f.sources.residencySources.owners[1],'allActualPayrollLocationsReviewedNoConvenienceAllocationConfirmed');}],
  ['impossible selected-year date',f=>{f.sources.residencySources.owners[1].residency.domicilePeriods[0].from='2025-02-30';}],
  ['incomplete full calendar',f=>{f.sources.residencySources.owners[1].residency.domicilePeriods[0].through='2025-12-30';}],
  ['unknown actual physical presence',f=>{f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=null;}],
  ['negative physical presence',f=>{f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=-1;}],
  ['excess statutory-resident presence',f=>{f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=184;}],
  ['partial statutory-abode ambiguity',f=>{f.sources.residencySources.owners[1].residency.paPermanentAbodePeriods[0].from='2025-02-01';}],
  ['outside principal residence wrong code',f=>{f.sources.residencySources.owners[1].residency.schoolDistrictCode='02745';}],
  ['missing actual PA school district',f=>{f.sources.residencySources.owners[0].residency.schoolDistrictCode='99999';}],
  ['stale original wage snapshot',f=>{f.input.w2s[1].wages='30001';}],
  ['payroll source owner reassigned',f=>{f.sources.wages[1].accountHolder='primary';}],
  ['canonical wage owner reassigned',f=>{f.input.w2s[1].accountHolder='primary';f.sources.originalFederalSources=marriedOriginals(f.input);f.sources.wages[1].original=structuredClone(f.input.w2s[1]);}],
  ['unknown original PA wages',f=>{Reflect.deleteProperty(f.input.w2s[1],'stateWages');f.sources.originalFederalSources=marriedOriginals(f.input);f.sources.wages[1].original=structuredClone(f.input.w2s[1]);}],
  ['changed PA withholding not reconfirmed',f=>{f.input.w2s[1].stateTaxWithheld='369';}],
  ['unknown PA service cash',f=>{f.sources.wages[1].payroll[0].paServicesCompensation='';}],
  ['inconsistent service cash',f=>{f.sources.wages[1].payroll[0].outsidePAServicesCompensation='18001';}],
  ['unexpected current document',f=>{f.sources.residencySources.owners[1].residency.domicilePeriods.push({state:'FL',from:'2025-12-31',through:'2025-12-31',daysInPA:0});}],
 ];
 for(const [label,mutate] of invalid)it('denies '+label,()=>{const f=paMarriedMixedResidencyFixture();mutate(f);const before=structuredClone(f);expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow();expect(f).toEqual(before);});
 it('requires actual payroll and cash payment inside one domicile period',()=>{
  const f=paMarriedMixedResidencyFixture('part_year');f.sources.wages[1].payroll[0].paidOn='2025-07-01';
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/crosses domicile/);
 });
 it('requires actual move abandonment and new domicile facts',()=>{
  const f=paMarriedMixedResidencyFixture('part_year');f.sources.residencySources.owners[1].residency.moveAbandonmentNewDomicileAndPresenceConfirmed=null;
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/move|abandonment/);
 });
 it('preserves fresh source commitments when actual equal-cash presence records change',()=>{
  const f=paMarriedMixedResidencyFixture(),before=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=171;
  const after=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(after.returns.map(r=>r.pa40.taxLiability.toString())).toEqual(['1535','368']);expect(after.sourceCommitment).not.toBe(before.sourceCommitment);
 });
 it('does not qualify the exactly183day nonresident source boundary',()=>{
  const f=paMarriedMixedResidencyFixture();f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=183;
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/statutory|boundary/);
 });
 it('does not infer part-year qualification at183aggregate actual presence days',()=>{
  const f=paMarriedMixedResidencyFixture('part_year');f.sources.residencySources.owners[1].residency.domicilePeriods[1].daysInPA=168;
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/statutory|boundary/);
 });
 it('does not settle an excess on one owner against the other owner shortage',()=>{
  const f=paMarriedMixedResidencyFixture();
  for(const [i,w] of f.input.w2s.entries()){w.stateTaxWithheld=i===0?'1536':'367';f.sources.wages[i].original=structuredClone(w);}
  f.sources.originalFederalSources=marriedOriginals(f.input);f.sources.dispositions[0].refundRequested='1';
  Object.assign(f.sources.dispositions[1].remainingPayment,{status:'expected_payment',sourceReference:'Fictional spouse actual own expected payment',date:'2026-04-15',amountAppliedToTax:'1'});
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/opposing separate-owner/);
 });
 it('retains the final2026 public married return gate',()=>{
  const f=paMarriedMixedResidencyFixture();f.input.taxpayer.taxYear=2026;f.input.paMarriedOrdinarySources=PAMarriedOrdinarySourcesSchema.parse(f.sources);
  expect(()=>calculatePAReturn(f.input)).toThrow(/final2026/);
 });
});

describe('actual mixed-residency physical presence consistency',()=>{
 it('rejects zero physical presence contradicted by actual services or a PA domicile move',()=>{
  for(const kind of ['nonresident','part_year'] as const){
   const f=paMarriedMixedResidencyFixture(kind),r=f.sources.residencySources.owners[1].residency;
   r.domicilePeriods[kind==='nonresident'?0:1].daysInPA=0;
   const before=structuredClone(f);
   expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/presence/);
   expect(f).toEqual(before);
  }
 });
 it('retains actual zero-presence nonresident cash with no Pennsylvania services',()=>{
  const f=paMarriedMixedResidencyFixture();
  f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=0;
  f.sources.wages[1].payroll[0].paServicesCompensation='0';f.sources.wages[1].payroll[0].outsidePAServicesCompensation='30000';
  f.input.w2s[1].stateWages='0';f.input.w2s[1].stateTaxWithheld='0';f.sources.wages[1].original=structuredClone(f.input.w2s[1]);f.sources.originalFederalSources=marriedOriginals(f.input);
  const before=structuredClone(f),r=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
  expect(r.federal.adjustedGrossIncome.toString()).toBe('80000');expect(r.perOwner[1].rawCompensation.toString()).toBe('0');expect(r.returns[1].pa40.taxLiability.toString()).toBe('0');expect(f).toEqual(before);
 });
 it('requires presence in the nonresident service period even when the resident period has actual days',()=>{
  const f=paMarriedMixedResidencyFixture('part_year');f.sources.residencySources.owners[1].residency.domicilePeriods[0].daysInPA=0;
  expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).toThrow(/presence/);
 });
});
