// Spec: spec/state/pa-digital-refund-private-saved-pdf.yaml
import {expect,it} from 'vitest';
import {join} from 'node:path';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {PDFDocument,PDFTextField} from 'pdf-lib';
import {fillReturn} from '@/pdf/fill-return';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context';
import {prepareForm8949Review} from '@/pdf/form-8949-review-context';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers';
import {PA_ORDINARY_D_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-ordinary-schedule-d';
import {refundPrivatePaperFixture} from '../fixtures/pa-digital-refund-private-paper';
it('protects actual refund application and award references in the saved complete packet',async()=>{
 const f=refundPrivatePaperFixture(),before=JSON.stringify(f.input);
 expect(f.result.totalIncome.toFixed()).toBe('50030');
 expect(f.ordinary.pa40.netGainOrLoss.toFixed()).toBe('60');
 expect(f.ordinary.pa40.taxLiability.toFixed()).toBe('1537');
 expect(f.ordinary.pa40.stateWithholding.toFixed()).toBe('1');
 const token=preparePAOrdinaryReturnReview(f.input),capitalGainReview=prepareForm8949Review(f.input),dir=await mkdtemp(join(tmpdir(),'pa-refund-private-'));
 try{
  const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token,capitalGainReview});
  expect(packet.filledForms.some(path=>path.endsWith('pa-schedule-d-filled.pdf'))).toBe(true);
  const bytes=await readFile(join(dir,'pa-schedule-d-filled.pdf'));
  const output=process.env.PA_DIGITAL_REFUND_PDF_OUTPUT;if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'refund-private-source-fields.pdf'),bytes);}
  const saved=await PDFDocument.load(bytes),pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import io,json,sys;from pypdf import PdfReader;r=PdfReader(io.BytesIO(sys.stdin.buffer.read()),strict=True);print(json.dumps([p.extract_text() or '' for p in r.pages]))"],{input:bytes,encoding:'utf8'}));
  const printed=pages.join(' ').replace(/\s/g,''),fields=saved.getForm().getFields().map(field=>field instanceof PDFTextField?(field.getText()??''):'').join(' ').replace(/\s/g,'');
  const safe='0.001 Complete actual refund safe prefix [REDACTED] [REDACTED] COMPLETE ACTUAL REFUND SAFE END';
  expect.soft(printed).toContain(safe.replace(/\s/g,''));
  for(const secret of[f.applicationId,f.awardId]){expect.soft(printed).not.toContain(secret);expect.soft(fields).not.toContain(secret);}
  const value=(name:string)=>saved.getForm().getTextField(name).getText()??'';
  for(let index=0;index<3;index++){expect(value(F.rows[index].description)).toBe('SEE REFERENCE');expect(value(F.rows[index].proceeds)).toBe('100');expect(value(F.rows[index].basis)).toBe('80');expect(value(F.rows[index].gain)).toBe('20');}
  expect(value(F.line3)).toBe('60');expect(value(F.line12)).toBe('60');expect(value(F.ssn)).toBe('');
  for(const page of pages)expect(page).toContain('FOR REVIEW ONLY - NOT FOR FILING');
  expect(JSON.stringify(f.input)).toBe(before);expect(f.ordinary.readiness.filingEligible).toBe(false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
