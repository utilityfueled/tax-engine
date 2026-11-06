// Spec: spec/federal/marketplace-marriage-outside-person.yaml, review.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { fillForm7206, FORM_7206_FIELDS as H } from '@/pdf/fill-form-7206';
import { fillForm8962Marriage, FORM_8962_FIELDS as P } from '@/pdf/fill-form-8962';
import { fillReturn } from '@/pdf/fill-return';
import { preparePremiumTaxCreditReview } from '@/pdf/premium-tax-credit-review-context';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers';
import { d } from '@/utils/decimal';
import { marriageOutsidePersonInput } from '../fixtures/marketplace-marriage-outside-person';

it('prints and binds actual child relationship separately from marriage family amounts', async () => {
  const input=marriageOutsidePersonInput(), before=structuredClone(input), result=calculateFederalTax(input), prepared=preparePremiumTaxCreditReview(input);
  const dir=mkdtempSync(join(tmpdir(),'marriage-child-review-'));
  const read=(path:string):{pages:string[];fields:Record<string,string>}=>JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':{k:str(v.get('/V','')) for k,v in (r.get_fields() or {}).items()}}))",path],{encoding:'utf8',timeout:5000}));
  try {
    const health=await fillForm7206(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'forms/blank/2025/f7206.pdf','scheduleC','primary',undefined,prepared);
    const credit=await fillForm8962Marriage(redactReviewIdentifiers(input),redactReviewIdentifiers(result),'forms/blank/2025/f8962.pdf',prepared);
    const h=join(dir,'health.pdf'),p=join(dir,'credit.pdf');writeFileSync(h,await health.save());writeFileSync(p,await credit.save());
    const saved=read(h), ptc=read(p), text=saved.pages.join(' ').replace(/\s+/g,' ');
    expect([saved.fields[H.line1],saved.fields[H.line14]]).toEqual(['600','600']);
    expect([ptc.fields[P.line3],ptc.fields[P.line24],ptc.fields[P.line25],ptc.fields[P.line29]]).toEqual(['86060','5192','6000','808']);
    expect(P.marriage.slice(0,4).map(key=>ptc.fields[key])).toEqual(['1','194','01','07']);
    expect(text).toContain('Actual child relationship son_or_daughter; began 1999-01-02');
    expect(text).toContain('Actual parent and child relationship record');
    expect(text).toContain('Completed other-return Form8962 line24 $0');
    expect(text).toContain('Return-level Schedule 1 line 17 transfer: $6875');
    for(const page of [...saved.pages,...ptc.pages]){expect(page.split('FOR REVIEW ONLY - NOT FOR FILING')).toHaveLength(2);expect(page).not.toMatch(/111.?22.?3333|444.?55.?6666|234.?56.?7890/);}
    const output=join(dir,'must-not-exist');
    for(const field of ['sourceReference','ownerSsn','coveredIndividualSsn','relationshipStartDate']){
      const changed=structuredClone(input);Object.assign(changed.form7206!.plans![0].coveredPersons![1].childRelationshipSources!,{[field]:'changed'});
      // Identifier edits must be checked on the actual input: render redaction
      // deliberately removes those strings and cannot recover a discarded edit.
      const rendered=field.endsWith('Ssn')?changed:redactReviewIdentifiers(changed);
      await expect(fillReturn(rendered,redactReviewIdentifiers(result),{blankFormsDir:'/missing',outputDir:output,premiumTaxCreditReview:prepared})).rejects.toThrow(/stale|conflict|source/i);
    }
    const altered=calculateFederalTax(input);altered.form7206!.sourceRecords.find(row=>row.personId==='outside')!.eligiblePremium=d(101);
    await expect(fillForm7206(redactReviewIdentifiers(input),redactReviewIdentifiers(altered),'/missing','scheduleC','primary',undefined,prepared)).rejects.toThrow(/calculation|proof|reconcile/i);
    expect(readdirSync(dir).sort()).toEqual(['credit.pdf','health.pdf']);expect(input).toEqual(before);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
