// Spec: spec/federal/marketplace-health-separate-business.yaml.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm7206, FORM_7206_FIELDS as F, assertForm7206ReviewSource } from '@/pdf/fill-form-7206.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { separateBusinessHealthInput } from '../fixtures/marketplace-health-separate-business.js';

it('saves separate nonspecified forms and the conserved historical source trace', async () => {
 const input=separateBusinessHealthInput(), original=JSON.stringify(input), result=calculateFederalTax(input), render=redactReviewIdentifiers(input);
 const directory=mkdtempSync(join(tmpdir(),'health-separate-business-review-'));
 try {
  for (const source of ['scheduleC','scheduleF']) {
   const pdf=await fillForm7206(render,result,'forms/blank/2025/f7206.pdf',source,'primary');
   const bytes=await pdf.save(), reopened=await PDFDocument.load(bytes), fields=reopened.getForm();
   expect(fields.getTextField(F.line14).getText()).toBe(source==='scheduleC'?'0':'3000');
   expect(fields.getTextField(F.ssn).getText()??'').toBe('');
   const path=join(directory,`${source}.pdf`);writeFileSync(path,bytes);
   const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8',timeout:5000}));
   const text=pages.join(' ').replace(/\s+/g,' ');
   expect(text).toContain('Return-level Schedule 1 line 17 transfer: $4647');
   expect(text).toContain('Pub974 Worksheet W line 13: $4646.6');
   expect(text).toContain('Pub974 Worksheet W line 14: $3000');
   expect(text).toContain('Pub974 Worksheet W line 15: $1646.6');
   expect(text).toContain('The other business deduction reduces the published historical limit; its earnings are not borrowed.');
   expect(text).toContain('not a separate deduction for this business');
   for(const page of pages){expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);expect(page).not.toMatch(/123.?45.?6789|6789/);}
  }
  expect(JSON.stringify(input)).toBe(original);
  const changed=structuredClone(input);changed.form7206!.plans![1]!.payments![0]!.ownerOrBusinessPaid='250.01';
  expect(()=>assertForm7206ReviewSource(changed,result)).toThrow(/source|reconcile|paid/i);
  const row=result.marketplaceHealthInsurance!.historicalLimit!.lines.find(item=>item.form==='Pub974 Worksheet W'&&item.line==='13');
  if(!row)throw Error('Missing actual historical audit');row.value=row.value.plus('.01');
  expect(()=>assertForm7206ReviewSource(input,result)).toThrow(/source|audit|reconcile/i);
 } finally {rmSync(directory,{recursive:true,force:true});}
});
