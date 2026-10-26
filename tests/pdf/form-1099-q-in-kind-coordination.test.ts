// Spec: spec/federal/form-1099-q-in-kind-coordination.yaml. Synthetic review evidence.
import { execFileSync } from 'node:child_process';
import { mkdtemp,readFile,readdir,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect,it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { buildForm1099QReferenceSummary,fillForm1099QReference } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { fillForm5329,FORM_5329_FIELDS as F } from '@/pdf/fill-form-5329.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { inKindCoordinationFixture } from '../fixtures/education-in-kind-coordination.js';
it('binds the original shared tuition election before producing review output',async()=>{
 const input=inKindCoordinationFixture(2025),result=calculateFederalTax(input),context=prepareEducationReview(input);
 const redacted=redactReviewIdentifiers(input),rendered=redactReviewIdentifiers(result);
 if(!result.form1099Q||!rendered.form1099Q)throw new Error('Missing education result');
 const originalResult=result.form1099Q;
 expect(JSON.stringify(context)).toBe('{}');
 const shown=buildForm1099QReferenceSummary(redacted.form1099Q,rendered.form1099Q,redacted.qualifiedEducationExpenses,context);
 expect(shown.sourceLines.find(row=>row.line==='prepaid:in-kind-esa:tuition')?.value).toBe('1000');
 const directory=await mkdtemp(join(tmpdir(),'in-kind-coordination-'));
 try{
  for(const mutation of ['balanced-election','balanced-assistance','taxpayer','missing-audit']){
   const changed=structuredClone(redacted),facts=changed.qualifiedEducationExpenses?.sourceFacts;
   if(!facts?.allocations?.[1]||!facts.expenses?.[0])throw new Error('Missing original source');
   if(mutation==='balanced-election'){facts.allocations[0].amount='1001';facts.allocations[1].amount='4999';}
   if(mutation==='balanced-assistance'){facts.expenses[0].amount='8001';facts.expenses[0].taxFreeAssistance='1001';}
   if(mutation==='taxpayer')changed.taxpayer.primary.ssn='777-88-9999';
   const changedResult=mutation==='missing-audit'?{...rendered,form1099Q:{...rendered.form1099Q,lines:rendered.form1099Q.lines.filter(row=>!row.line.includes('in-kind-esa'))}}:rendered;
   await expect(fillReturn(changed,changedResult,{blankFormsDir:join(directory,'absent'),outputDir:directory,educationReview:context})).rejects.toThrow(/stale|conflict|calculation|audit|identity/);
   await expect(fillForm5329(changed,changedResult,join(directory,'absent.pdf'),'primary',context)).rejects.toThrow(/stale|conflict|calculation|audit|identity/);
  }
  expect(await readdir(directory)).toEqual([]);
  const changed=structuredClone(input.qualifiedEducationExpenses),allocations=changed?.sourceFacts?.allocations;
  if(!allocations?.[1])throw new Error('Missing allocation');allocations[0].amount='1001';allocations[1].amount='4999';
  expect(()=>buildForm1099QReferenceSummary(input.form1099Q,originalResult,changed)).toThrow(/audit|allocation|in-kind/);
  const path=await fillForm1099QReference(redacted.form1099Q,rendered.form1099Q,redacted.qualifiedEducationExpenses,directory,context);
  const pages=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8'})) as string[];
  for(const page of pages)expect(page).toContain(REVIEW_PDF_NOTICE);
  const text=pages.join(' ').replace(/\s+/g,' ');for(const value of ['8000','1000','5000','1200','800','200','60'])expect(text).toContain(value);
  for(const secret of [input.taxpayer.primary.ssn,'actual-esa-account','Synthetic actual tuition credit application'])expect(text).not.toContain(secret);
  await fillReturn(redacted,rendered,{blankFormsDir:'forms/blank/2025',outputDir:directory,educationReview:context});
  const pdf=await PDFDocument.load(await readFile(join(directory,'f5329-primary-filled.pdf'))),form=pdf.getForm();
  expect(form.getTextField(F.line5).getText()).toBe('800');expect(form.getTextField(F.line6).getText()).toBe('200');expect(form.getTextField(F.line8).getText()).toBe('60');expect(form.getTextField(F.ssn).getText()??'').toBe('');
  const single=inKindCoordinationFixture(2025,false),singleResult=calculateFederalTax(single);if(!singleResult.form1099Q)throw new Error('Missing result');
  expect(buildForm1099QReferenceSummary(single.form1099Q,singleResult.form1099Q,single.qualifiedEducationExpenses).lines.find(row=>row.line==='net-penalty')?.value).toBe('20');
 }finally{await rm(directory,{recursive:true,force:true});}
});
