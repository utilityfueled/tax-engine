// Spec: spec/federal/k1-passive-distribution-gain.yaml
import { expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8582, FORM_8582_FIELDS as P } from '@/pdf/fill-form-8582.js';
import { fillForm8949, FORM_8949_FIELDS as F } from '@/pdf/fill-form-8949.js';
import { fillScheduleD, SCHEDULE_D_FIELDS as D } from '@/pdf/fill-schedule-d.js';
import { fillK1CharitableReview } from '@/pdf/mappings/2025/k1-charitable-review.js';
import { prepareForm8949Review } from '@/pdf/form-8949-review-context.js';
import { prepareCharitableReview } from '@/pdf/charitable-review-context.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { REVIEW_PDF_NOTICE, markReviewPdf } from '@/pdf/export-policy.js';
import { k1PassiveDistributionFixture, passiveDistributionSource } from '../fixtures/k1-passive-distribution.js';
it('saves original passive distribution character and separate capital and loss amounts',async()=>{
  const input=k1PassiveDistributionFixture(),result=calculateFederalTax(input),original=JSON.stringify(input);
  const charity=prepareCharitableReview(input),capital=prepareForm8949Review(input),redacted=redactReviewIdentifiers(input);
  const dir=await mkdtemp(join(tmpdir(),'k1-passive-review-'));
  try {
    const docs=[
      ['passive',await fillForm8582(redacted,redactReviewIdentifiers(result),'forms/blank/2025/f8582.pdf',charity)],
      ['capital',await fillForm8949(redacted,'forms/blank/2025/f8949.pdf',capital)],
      ['schedule-d',await fillScheduleD(redacted,redactReviewIdentifiers(result),'forms/blank/2025/f1040sd.pdf',charity)],
      ['reference',await fillK1CharitableReview(redacted,redactReviewIdentifiers(result),charity)],
    ] as const;
    for(const [name,doc] of docs){
      await markReviewPdf(doc);const path=join(dir,`${name}.pdf`);await writeFile(path,await doc.save());
      const reopened=await PDFDocument.load(await readFile(path)),form=reopened.getForm();
      if(name==='passive'){
        expect(form.getTextField(P.line2a).getText()).toBe('1000');
        expect(form.getTextField(P.line2c).getText()).toBe('1500');
        expect(form.getTextField(P.line11).getText()).toBe('1000');
        expect(form.getTextField(P.part8.rows[0].b).getText()).toBe('500');
        expect(form.getTextField(P.part8.rows[0].c).getText()).toBe('1000');
        expect(form.getTextField(P.ssn).getText()).toBeUndefined();
      } else if(name==='capital') expect(form.getTextField(F.page2Rows[0].gainLoss).getText()).toBe('1000');
      else if(name==='schedule-d') expect(form.getTextField(D.line10GainLoss).getText()).toBe('1000');
      const pages:string[]=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',
        'from pypdf import PdfReader\nimport json,sys\nprint(json.dumps([p.extract_text() or "" for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8',timeout:10000}));
      for(const page of pages){
        expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        for(const secret of ['123456789','6789','asset-1','activity-1','Fictional complete entity activity and valuation report']) expect(page).not.toContain(secret);
      }
      if(name==='reference'){
        const text=pages.join(' ');expect(text).toContain('single passive business');
        expect(text).toContain('Valuation date: 2025-12-31');expect(text).toContain('Ordinary passive loss allowed: $1000');
        expect(text).toContain('Passive loss remaining: $500');expect(text).not.toContain('investment gain');
      }
      if(process.env.TAX_ENGINE_RETAIN_K1_PASSIVE_PDFS){await mkdir(process.env.TAX_ENGINE_RETAIN_K1_PASSIVE_PDFS,{recursive:true});await writeFile(join(process.env.TAX_ENGINE_RETAIN_K1_PASSIVE_PDFS,`${name}.pdf`),await readFile(path));}
    }
    expect(JSON.stringify(input)).toBe(original);
  } finally {await rm(dir,{recursive:true,force:true});}
});
it('rejects stale passive sources and retained results before template access',async()=>{
  const input=k1PassiveDistributionFixture(),result=calculateFederalTax(input),charity=prepareCharitableReview(input),redacted=redactReviewIdentifiers(input);
  for(const change of [
    (x:typeof input)=>{passiveDistributionSource(x).valuationDate='2025-12-30';},
    (x:typeof input)=>{passiveDistributionSource(x).activityEvents![0].propertyDisposedValue='10000.01';},
    (x:typeof input)=>{passiveDistributionSource(x).assets![0].noNonpassiveRecharacterizationConfirmed=false;},
    (x:typeof input)=>{x.taxpayer.primary.ssn='999999999';},
  ]){const changed=structuredClone(redacted);change(changed);await expect(fillForm8582(changed,result,'missing.pdf',charity)).rejects.toThrow(/source|stale/);}
  const stale={...result,allLines:result.allLines.map(row=>row.form==='K1 Passive Distribution'?{...row,value:row.value.plus('.01')}:row)};
  await expect(fillForm8582(redacted,stale,'missing.pdf',charity)).rejects.toThrow(/calculation|reconcile/);
});
