// Spec: spec/state/zero-income-misc-independent.yaml
import {describe,expect,it} from 'vitest';
import {buildGuidedZeroIncomeMiscSources,confirmZeroIncomeMiscSource,emptyZeroIncomeMiscSource,updateZeroIncomeMiscSource} from '@/lib/guided-zero-income-misc-sources';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {TaxYearInputSchema} from '@/models/inputs';
import {fictionalMiscFlow,fictionalMiscOriginal,confirmFictionalMisc,miscRows} from '../fixtures/guided-zero-income-misc';

function stateData(f:ReturnType<typeof fictionalMiscFlow>){const data=f.sectionData['state-return'];if(!data)throw Error('Explicit fictional state source required');return data;}
function person(f:ReturnType<typeof fictionalMiscFlow>){const data=f.sectionData['personal-info'];if(!data)throw Error('Explicit fictional recipient required');return data;}
function spouse(f:ReturnType<typeof fictionalMiscFlow>){const data=person(f).spouse;if(!data)throw Error('Explicit fictional spouse required');return data;}
describe('independent MISC source boundary',()=>{
 it('literal source cents survive canonical replay without inventing state qualifications',()=>{
  const f=fictionalMiscFlow(),before=structuredClone(f),out=TaxYearInputSchema.parse(buildTaxInputFromGuidedData(f));
  expect(out.form1099Misc[0]).toMatchObject({taxYear:2025,state:'PA',stateWithheld:'0.20',rents:'0',royalties:'0',otherIncome:'0',stateIncome:'0'});
  expect(out.paResidencySources).toBeUndefined();expect(out.paOrdinaryReturnFacts).toBeUndefined();expect(out.paOrdinaryReturnCompletionSources).toBeUndefined();expect(f).toEqual(before);
 });
 it('same cents and changed remittance original stay stale until explicit reconfirmation',()=>{
  const f=fictionalMiscFlow();miscRows(f)[0].remittance.confirmationNumber='Different actual receipt';const old=structuredClone(miscRows(f)[0].confirmedOriginal);
  expect(()=>buildGuidedZeroIncomeMiscSources(f)).toThrow(/stale|reconfirm/i);expect(miscRows(f)[0].confirmedOriginal).toEqual(old);
  const fixed=confirmZeroIncomeMiscSource(miscRows(f)[0],2025,'single');stateData(f).zeroIncomeMiscSources=[fixed];expect(buildGuidedZeroIncomeMiscSources(f)[0].stateWithheld).toBe('0.20');
 });
 it.each(['tax year','name','owner SSN'])('current %s edits do not rewrite confirmed originals',kind=>{
  const f=fictionalMiscFlow(),before=structuredClone(miscRows(f));if(kind==='tax year')f.taxYear=2026;else if(kind==='name')person(f).lastName='Other';else person(f).ssn='555-66-7777';
  expect(()=>buildGuidedZeroIncomeMiscSources(f)).toThrow();expect(miscRows(f)).toEqual(before);
 });
 it('MFJ spouse original requires explicit matching spouse facts and retains owner',()=>{
  const row=fictionalMiscOriginal();row.accountHolder='spouse';row.recipientFirstName='Taylor';row.recipientLastName='Separate';row.recipientSsn='555-66-7777';row.remittance.recipientSsn=row.recipientSsn;
  const f=fictionalMiscFlow([confirmFictionalMisc(row)]);f.segmentation.filingStatus='mfj';person(f).spouse={firstName:'Taylor',lastName:'Separate',ssn:'555-66-7777',dateOfBirth:'1985-01-02',usResidencyMonths:'12'};
  expect(buildGuidedZeroIncomeMiscSources(f)[0].accountHolder).toBe('spouse');spouse(f).firstName='Another';expect(()=>buildGuidedZeroIncomeMiscSources(f)).toThrow(/recipient/i);
 });
 it.each(['extra income alias','extra source metadata','extra receipt metadata'])('unknown %s cannot vanish through parsing',kind=>{
  const row=confirmFictionalMisc(fictionalMiscOriginal());if(kind==='extra receipt metadata')Object.assign(row.remittance,{amountOverride:'9'});else Object.assign(row,kind==='extra income alias'?{nonemployeeCompensation:'99'}:{allowedCredit:'0.20'});
  const f=fictionalMiscFlow([row]);expect(()=>buildGuidedZeroIncomeMiscSources(f)).toThrow();
 });
 it.each(['0.01','-0.00','1e-100'])('income amount %s cannot be silently treated as known zero',v=>{
  const row=fictionalMiscOriginal();row.rents=v;expect(()=>confirmZeroIncomeMiscSource(row,2025,'single')).toThrow();
 });
 it('source and remittance normalized identity aliases reject duplicates without changing originals',()=>{
  const first=fictionalMiscOriginal(),second=structuredClone(first);second.sourceId='Actual distinct source';second.accountReference=' FICTIONAL  PRIVATE SOURCE ACCOUNT A ';second.remittance.accountReference=second.accountReference;second.remittance.confirmationNumber='Distinct actual receipt';second.payerTin='987654321';second.remittance.payerTin=second.payerTin;
  const f=fictionalMiscFlow([confirmFictionalMisc(first),confirmFictionalMisc(second)]),before=structuredClone(f);expect(()=>buildGuidedZeroIncomeMiscSources(f)).toThrow(/duplicate/i);expect(f).toEqual(before);
 });
 it('distinct account and remittance originals remain exactly two with zero income each',()=>{
  const first=fictionalMiscOriginal(),second=structuredClone(first);second.sourceId='Actual independent second original';second.accountReference='Actual second account';second.remittance.accountReference=second.accountReference;second.remittance.confirmationNumber='Actual second remittance';
  const f=fictionalMiscFlow([confirmFictionalMisc(first),confirmFictionalMisc(second)]);const rows=buildGuidedZeroIncomeMiscSources(f);expect(rows.map(x=>x.stateWithheld)).toEqual(['0.20','0.20']);expect(rows.map(x=>x.otherIncome)).toEqual(['0','0']);
 });
 it('existing actual source route is retained once and semantic duplicate is rejected',()=>{
  const first=fictionalMiscFlow(),existing=buildGuidedZeroIncomeMiscSources(first);const second=fictionalMiscOriginal();second.sourceId='Distinct second ID';second.accountReference='Second source account';second.remittance.accountReference=second.accountReference;second.remittance.confirmationNumber='Second remittance';const f=fictionalMiscFlow([confirmFictionalMisc(second)]);
  expect(buildGuidedZeroIncomeMiscSources(f,existing).map(x=>x.sourceId)).toEqual(['Fictional-zero-income-MISC-2025-A','Distinct second ID']);second.sourceId=' fictional-zero-income-misc-2025-a ';stateData(f).zeroIncomeMiscSources=[confirmFictionalMisc(second)];expect(()=>buildGuidedZeroIncomeMiscSources(f,existing)).toThrow(/duplicate/i);
 });
 it('empty source has no known facts and local edit cannot confirm it',()=>{
  const row=emptyZeroIncomeMiscSource();expect(row.rents).toBe('');expect(row.recipientSsn).toBe('');expect(row.sourceTaxYear).toBe('');expect(row.remittance.actuallyRemittedConfirmed).toBeNull();expect(updateZeroIncomeMiscSource(row,{rents:'0'}).sourceFactsConfirmed).toBeNull();expect(()=>confirmZeroIncomeMiscSource(row,2025,'single')).toThrow();
 });
 it.each(['corrected','void'])('actual %s source requires separate method despite supplied zero amounts',key=>{
  const row=fictionalMiscOriginal();row[key]=true;expect(()=>confirmZeroIncomeMiscSource(row,2025,'single')).toThrow(/current|uncorrected|nonvoid/i);
 });
});
