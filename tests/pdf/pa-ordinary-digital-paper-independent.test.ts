// Spec: spec/state/pa-ordinary-digital-paper-independent.yaml. Independent controls, no PDF authoring.
import {expect,it}from 'vitest';
import {calculateFederalTax}from '@/engine/federal.js';
import {calculatePAOrdinaryReturn}from '@/engine/state/pa-ordinary-return.js';
import {preparePAOrdinaryReturnReview,assertPAOrdinaryReturnReview}from '@/pdf/pa-ordinary-return-review-context.js';
import {redactReviewIdentifiers}from '@/pdf/redact-review-identifiers.js';
import {assessReturnReadiness}from '@/utils/return-readiness.js';
import {PAOrdinaryReturnFactsSchema}from '@/models/pa-ordinary-return-facts.js';
import {PAOrdinaryReturnCompletionSourcesSchema}from '@/models/pa-ordinary-return-completion.js';
import {paOrdinaryDigitalPaperFixture}from '../fixtures/pa-ordinary-digital-official-pdf.js';
import {refreshDigitalFixtureOriginals}from '../fixtures/pa-ordinary-digital-sources.js';
type Fixture=ReturnType<typeof paOrdinaryDigitalPaperFixture>;
const paper=(f:Fixture)=>assertPAOrdinaryReturnReview(redactReviewIdentifiers(f.input),f.result,preparePAOrdinaryReturnReview(f.input)).scheduleD;
function replay(f:Fixture){refreshDigitalFixtureOriginals(f);f.input.paOrdinaryReturnFacts=PAOrdinaryReturnFactsSchema.parse(f.facts);f.input.paOrdinaryReturnCompletionSources=PAOrdinaryReturnCompletionSourcesSchema.parse(f.sources);f.ordinary=calculatePAOrdinaryReturn(f.input,f.input.paOrdinaryReturnFacts,f.input.paOrdinaryReturnCompletionSources);f.result=calculateFederalTax(f.input);f.result.stateReturns={pennsylvania:f.ordinary};}
it.each(['basisSourceReference','paBasisSourceReference','stateIdentificationNumber']as const)('independent actual typed source identifiers embedded in descriptions stay private: %s',key=>{
 const f=paOrdinaryDigitalPaperFixture(),statement=f.input.form1099DA[0],t=statement.transactions[0],secret='PRIVATE-ORIGINAL-'+key+'-987654';
 if(key==='stateIdentificationNumber'){statement.stateTaxReporting='single';statement.state='PA';statement.stateWithheld='0';statement.stateIdentificationNumber=secret;}else t[key]=secret;
 t.digitalAssetName='Complete safe original asset prefix '+secret+' COMPLETE SAFE ORIGINAL END';replay(f);const before=JSON.stringify(f.input),out=paper(f)?.rows[0].description??'';
 expect(out).toContain('Complete safe original asset prefix');expect(out).toContain('COMPLETE SAFE ORIGINAL END');expect(out).toContain('[REDACTED]');expect(out).not.toContain(secret);expect(JSON.stringify(f.input)).toBe(before);
});
it.each(['mismatch-low','mismatch-high']as const)('independent printed column disagreement never changes admitted engine values: %s',kind=>{
 const f=paOrdinaryDigitalPaperFixture(kind),before=JSON.stringify(f.input);expect(f.ordinary.pa40.netGainOrLoss.toFixed()).toBe('20');expect(()=>paper(f)).toThrow();expect(JSON.stringify(f.input)).toBe(before);
});
it('independent aggregate paper mismatch cannot allocate a fictional residual',()=>{const f=paOrdinaryDigitalPaperFixture('mismatch-sum'),before=JSON.stringify(f.input);expect(f.ordinary.pa40.netGainOrLoss.toFixed()).toBe('1');expect(()=>paper(f)).toThrow();expect(JSON.stringify(f.input)).toBe(before);});
it('independent same primary mixed gains retain signed paper total without wage offset',()=>{
 const f=paOrdinaryDigitalPaperFixture(),a=f.input.form1099DA[0].transactions[0];a.paCostBasis='80.49';f.input.form1099DA[0].transactions.push({...structuredClone(a),sourceId:'NEW independent original second actual sale',paCostBasis:'130.49',digitalAssetName:'Independent second asset'});f.facts.timing.remainingTaxPayment.amountAppliedToTax='1535';replay(f);
 const p=paper(f);expect(p?.rows.map(x=>[x.proceeds,x.basis,x.gain,x.loss])).toEqual([['100','80','20',false],['100','130','-30',true]]);expect(p?.total).toBe('-10');expect(f.ordinary.pa40.totalPATaxableIncome.toFixed()).toBe('50000');expect(f.ordinary.scheduleSP.eligibilityIncome.toFixed()).toBe('50000');
});
it('independent returned paper facts cannot mutate the original prepared authority',()=>{
 const f=paOrdinaryDigitalPaperFixture(),token=preparePAOrdinaryReturnReview(f.input),first=assertPAOrdinaryReturnReview(redactReviewIdentifiers(f.input),f.result,token);if(!first.scheduleD)throw Error('Missing actual D');first.scheduleD.rows[0].gain='999';first.scheduleD.total='999';first.scheduleD.rows[0].description='Forged later renderfact';const second=assertPAOrdinaryReturnReview(redactReviewIdentifiers(f.input),f.result,token);expect(second.scheduleD?.total).toBe('20');expect(second.scheduleD?.rows[0].gain).toBe('20');expect(second.scheduleD?.rows[0].description).toBe('0.001 Bitcoin');
});
it('independent equal money different original cannot reuse another prepared token',()=>{
 const f=paOrdinaryDigitalPaperFixture(),token=preparePAOrdinaryReturnReview(f.input),other=paOrdinaryDigitalPaperFixture();other.input.form1099DA[0].accountReference='Independent actual different original account';replay(other);expect(other.ordinary.pa40.netGainOrLoss.toFixed()).toBe('20');expect(()=>assertPAOrdinaryReturnReview(redactReviewIdentifiers(other.input),other.result,token)).toThrow();
});
it('independent stripped ordinary source marker cannot choose legacy paper authority',()=>{
 const f=paOrdinaryDigitalPaperFixture(),token=preparePAOrdinaryReturnReview(f.input),altered={...f.result,stateReturns:{...f.result.stateReturns,pennsylvania:{...f.ordinary}}};delete(altered.stateReturns.pennsylvania as unknown as Record<string,unknown>).methodVersion;expect(()=>assertPAOrdinaryReturnReview(redactReviewIdentifiers(f.input),altered,token)).toThrow();
});
it('independent exact official artifact basename cannot promote filing readiness',()=>{
 const f=paOrdinaryDigitalPaperFixture();for(const name of['pa-schedule-d-reference.pdf','pa-schedule-d-filled.pdf.reference','old-pa-schedule-d-filled.pdf']){const r=assessReturnReadiness({taxInput:f.input,federalResult:f.result,stateCode:'PA',includedForms:['pa-40-filled.pdf',name]});expect(r.findings.some(x=>/ordinary Schedule D is missing/.test(x))).toBe(true);expect(r.filingQualified).toBe(false);}const r=assessReturnReadiness({taxInput:f.input,federalResult:f.result,stateCode:'PA',includedForms:['pa-40-filled.pdf','/review/path/PA-SCHEDULE-D-FILLED.PDF']});expect(r.findings.some(x=>/ordinary Schedule D is missing/.test(x))).toBe(false);expect(r.filingQualified).toBe(false);
});
