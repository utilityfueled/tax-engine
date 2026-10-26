// Spec: spec/state/pa-royalty-property-sources.yaml.
import { expect,it } from 'vitest';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import Decimal from 'decimal.js';import {PDFDocument} from 'pdf-lib';
import {TaxYearInputSchema} from '@/models/inputs.js';
import {calculatePAReturn} from '@/engine/state/pa-orchestrator.js';import {calculateFederalTax} from '@/engine/federal.js';
import {buildPAScheduleEReferenceSummary,fillPAScheduleEReference,shouldIncludePAScheduleEReferenceSummary} from '@/pdf/fill-pa-schedule-e.js';
import {fillReturn} from '@/pdf/fill-return.js';import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {preparePARoyaltyReview,assertPARoyaltyReview,type PreparedPARoyaltyReview} from '@/pdf/pa-royalty-review-context.js';
import {prepareScheduleEReview} from '@/pdf/schedule-e-review-context.js';
import {paRoyaltyPropertyFixture} from '../fixtures/pa-royalty-property.js';

it('retains actual state property lines and zero net across review pages',async()=>{
 const raw=paRoyaltyPropertyFixture(),original=raw.form1099Misc[0],property=raw.royaltyPropertySources.properties[0];
 raw.form1099Misc=Array.from({length:7},(_,i)=>({...original,sourceId:`private-source-${i}`,accountReference:`private-account-${i}`,royalties:'1000'}));
 raw.royaltyPropertySources.properties=raw.form1099Misc.map((source,i)=>({...structuredClone(property),propertyId:`private-property-${i}`,incomeSources:[{sourceIndex:i,original:source,allocatedGross:'1000'}],
 expenses:[{...property.expenses[0],sourceId:`private-receipt-${i}`,amountPaid:'1000'}],paTreatment:{...property.paTreatment,expenses:[{...property.paTreatment.expenses[0],sourceId:`private-receipt-${i}`,amountPaid:'1000'}]}}));
 const input=TaxYearInputSchema.parse(raw),state=calculatePAReturn(input),result=state.scheduleE;if(!result)throw Error('Expected actual PA properties');
 const summary=buildPAScheduleEReferenceSummary(result);expect(shouldIncludePAScheduleEReferenceSummary(result)).toBe(true);
 expect(summary.totals).toContainEqual({label:'Actual PA royalty expenses',value:'7000'});
 expect(summary.totals).toContainEqual({label:'Actual PA royalty net income or loss',value:'0'});
 expect(summary.totals.some(row=>/^Line [1-6] /.test(row.label))).toBe(false);
 const dir=await mkdtemp(join(tmpdir(),'pa-royalty-review-'));try{
  const path=await fillPAScheduleEReference(result,dir),pdf=await PDFDocument.load(await readFile(path));expect(pdf.getPageCount()).toBeGreaterThan(1);
  const texts: string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON||'python3',['-c','import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8'}));
  for(const text of texts){
   expect(text).toContain('FOR REVIEW ONLY - NOT FOR FILING');
   const propertyCount=[...text.matchAll(/Royalty property \d+ -/g)].length;
   expect([...text.matchAll(/PA line 2 -/g)].length).toBe(propertyCount);
   expect([...text.matchAll(/PA line 21 -/g)].length).toBe(propertyCount);
  }
  const joined=texts.join('\n');expect(joined).toContain('Royalty property 7');expect(joined).toContain('PA line 8');
  expect(joined).not.toMatch(/private-source|private-account|private-receipt|private-property/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
it('rejects stale PA sources and balanced state result changes before output',async()=>{
 const input=TaxYearInputSchema.parse(paRoyaltyPropertyFixture()),result={...calculateFederalTax(input),stateReturns:{pennsylvania:calculatePAReturn(input)}};
 const altered={...result,stateReturns:{pennsylvania:{...result.stateReturns.pennsylvania,scheduleE:{...result.stateReturns.pennsylvania.scheduleE!,directRoyaltyExpenses:new Decimal('999'),directRoyaltyNetIncome:new Decimal('11001')}}}};
 await expect(fillReturn(input,altered,{blankFormsDir:'/invalid-template',outputDir:'/invalid-output'})).rejects.toThrow(/PA.*(royalt|state).*(reconcil|context|source)/i);
 const paRoyaltyReview=preparePARoyaltyReview(input);
 expect(()=>assertPARoyaltyReview(input,result,{} as PreparedPARoyaltyReview)).toThrow(/original.*context/i);
 const changed=TaxYearInputSchema.parse(paRoyaltyPropertyFixture());changed.royaltyPropertySources!.properties![0].expenses![0].sourceReference='Changed original reference';
 expect(()=>assertPARoyaltyReview(changed,result,paRoyaltyReview)).toThrow(/source.*changed/i);
 assertPARoyaltyReview(redactReviewIdentifiers(input),redactReviewIdentifiers(result),paRoyaltyReview);
 const scheduleEReview=prepareScheduleEReview(input);
 await expect(fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{scheduleEReview,blankFormsDir:'/invalid-template',outputDir:'/invalid-output'})).rejects.toThrow(/PA.*(original|royalt|source)/i);
 const dir=await mkdtemp(join(tmpdir(),'pa-source-packet-'));try{
  const packet=await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{scheduleEReview,paRoyaltyReview,blankFormsDir:'forms/blank/2025',outputDir:dir});
  const reference=packet.filledForms.find(path=>path.endsWith('pa-schedule-e-reference.pdf'));expect(reference).toBeDefined();
  const text=execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON||'python3',['-c','import sys;from pypdf import PdfReader;print("\\n".join(p.extract_text() for p in PdfReader(sys.argv[1]).pages))',reference!],{encoding:'utf8'});
  expect(text).toContain('Actual PA royalty net income or loss: 11000');expect(text).toContain('Source tax year: 2025');
  expect(text).not.toMatch(/royalty-account|Private legal receipt|123.?45.?6789/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
