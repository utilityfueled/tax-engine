// Spec: state/pa-nonchild-household-source-pdf.yaml. Literal assertions precede execution.
import {expect,it} from 'vitest';
import {join} from 'node:path';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {PDFName,PDFDocument} from 'pdf-lib';
import type {TaxYearInput} from '@/models/inputs.js';
import {PAOrdinaryReturnFactsSchema} from '@/models/pa-ordinary-return-facts.js';
import {PAOrdinaryReturnCompletionSourcesSchema} from '@/models/pa-ordinary-return-completion.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillPA40,PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40.js';
import {paNonchildHouseholdFixture} from '../fixtures/pa-nonchild-dependent-household.js';
const blank=join(process.cwd(),'forms/blank/2025/pa-40.pdf');
function actual(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paNonchildHouseholdFixture(status);const input:TaxYearInput={...f.input,paOrdinaryReturnFacts:PAOrdinaryReturnFactsSchema.parse(f.facts),paOrdinaryReturnCompletionSources:PAOrdinaryReturnCompletionSourcesSchema.parse(f.sources)};
 const ordinary=calculatePAOrdinaryReturn(input,input.paOrdinaryReturnFacts,input.paOrdinaryReturnCompletionSources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:ordinary};return {input,ordinary,result};
}
const text=(doc:PDFDocument,field:string)=>doc.getForm().getTextField(field).getText()??'';
for(const [status,tax,residency]of [['resident','1539','/1'],['part_year','799','/3'],['nonresident','184','/2']]as const){
 it('actual sourcecomplete3federal1PAchild saved PDF '+status,async()=>{
  const {input,ordinary,result}=actual(status),before=structuredClone(input),token=preparePAOrdinaryReturnReview(input);expect(input.taxpayer.dependents).toHaveLength(3);expect(input.paOrdinaryReturnFacts?.filing.otherFederalDependents).toHaveLength(2);expect(ordinary.dependentChildren).toBe(1);expect(ordinary.pa40.taxLiability.toString()).toBe(tax);expect(ordinary.readiness.filingEligible).toBe(false);
  const doc=await fillPA40(redactReviewIdentifiers(input),result,blank,undefined,token);expect(text(doc,F.dependents)).toBe('1');expect(text(doc,F.line12).replaceAll(',','')).toBe(tax);expect(doc.getForm().getField(F.residencyStatus).acroField.dict.get(PDFName.of('V'))?.toString()).toBe(residency);expect(doc.getPageCount()).toBe(2);
  const bytes=await doc.save(),pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"],{input:bytes,encoding:'utf8'}));const fields=doc.getForm().getFields().map(field=>field.acroField.dict.get(PDFName.of('V'))?.toString()??'').join('\n');
  for(const value of ['900-70-0311','900700311','900-70-0322','900700322','900-70-0333','900700333','900-70-0344','900700344','Fictional actual parent relationship','Fictional actual adult son relationship'])expect(fields+'\n'+pages.join('\n')).not.toContain(value);
  expect(input).toEqual(before);const retainedOutput=process.env.PA_HOUSEHOLD_PDF_OUTPUT;const output=retainedOutput??await mkdtemp(join(tmpdir(),'pa-household-proof-'));try{await mkdir(output,{recursive:true});await writeFile(join(output,status+'.pdf'),bytes);}finally{if(!retainedOutput)await rm(output,{recursive:true,force:true});}
 });
}
it('actual nonchild proof missing rejects source review',()=>{const f=actual(),facts=f.input.paOrdinaryReturnFacts;if(!facts)throw Error('Actual source packet missing');facts.filing.otherFederalDependents?.pop();expect(()=>preparePAOrdinaryReturnReview(f.input)).toThrow(/dependent|nonchild|source|review/i);expect(f.input.taxpayer.dependents).toHaveLength(3);});
it('actual nonchild original edit rejects prepared PDF before IO',async()=>{const f=actual(),token=preparePAOrdinaryReturnReview(f.input),parent=f.input.taxpayer.dependents[1];if(!parent)throw Error('Actual parent original missing');parent.lastName='Changed actual original';await expect(fillPA40(redactReviewIdentifiers(f.input),f.result,'/does-not-exist/household.pdf',undefined,token)).rejects.toThrow(/original|source|changed/i);});
