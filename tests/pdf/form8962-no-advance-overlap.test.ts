// Spec: spec/federal/form-8962-no-advance-overlap.yaml.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {calculateFederalTax} from '@/engine/federal.js';
import {d} from '@/utils/decimal.js';
import {fillForm8962SharedPolicy,FORM_8962_FIELDS as F,buildForm8962ReferenceSummary,fillForm8962Reference} from '@/pdf/fill-form-8962.js';
import {preparePremiumTaxCreditReview,type PreparedPremiumTaxCreditReview} from '@/pdf/premium-tax-credit-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {REVIEW_PDF_NOTICE} from '@/pdf/export-policy.js';
import {noAdvanceOverlapFixture} from '../fixtures/no-advance-overlap.js';
it('saves complete family benchmark groups and rejects stale source or retained calculation',async()=>{
 const input=noAdvanceOverlapFixture(),result=calculateFederalTax(input),prepared=preparePremiumTaxCreditReview(input),redacted=redactReviewIdentifiers(input),hidden=redactReviewIdentifiers(result),context={input:redacted,prepared};
 const summary=buildForm8962ReferenceSummary(redacted.form1095A,hidden,context);
 expect(summary.householdMonths?.[0].noAdvanceBenchmarkGroups).toEqual([{policyOrdinals:[1,2],slcsp:'1200'}]);
 const dir=mkdtempSync(join(tmpdir(),'tax-no-advance-family-pdf-'));
 const inspect=(path:string):{pages:string[];fields:Record<string,string>}=>JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','from pypdf import PdfReader\nimport json,sys\nr=PdfReader(sys.argv[1]);print(json.dumps({"pages":[p.extract_text() or "" for p in r.pages],"fields":{k:str(v.get("/V","")) for k,v in (r.get_fields() or {}).items()}}))',path],{encoding:'utf8',timeout:5000}));
 try{const physical=await fillForm8962SharedPolicy(redacted,hidden,'forms/blank/2025/f8962.pdf',prepared),path=join(dir,'physical.pdf');writeFileSync(path,await physical.save());const saved=inspect(path);
 for(const [i,value] of ['1000','1200','0','1200','1000','0'].entries())expect(saved.fields[F.monthly[0][i]]).toBe(value);
 for(const row of F.allocations.slice(0,2)){expect(saved.fields[row[4]]).toBe('0.67');expect(saved.fields[row[5]]).toBe('');expect(saved.fields[row[6]]).toBe('');}
 const reference=inspect(await fillForm8962Reference(redacted.form1095A,hidden,dir,context)),text=reference.pages.join(' ');expect(text).toContain('Complete own coverage-family group');expect(text).toContain('1200 / 1800');expect(text).toContain('benchmark $1200, counted once');
 for(const secret of ['123-45-6789','234-56-7890','345-67-8901','456-78-9012','123456789','Actual full monthly','WA-area-1'])expect(text).not.toContain(secret);for(const page of [...saved.pages,...reference.pages])expect(page).toContain(REVIEW_PDF_NOTICE);
 }finally{rmSync(dir,{recursive:true,force:true});}
 const stale=structuredClone(input);stale.form8962!.sharedPolicyAllocations!.noAdvanceCoverageFamilies!.months![0].families![1].groups![0].ratingArea='Changed actual area';expect(()=>buildForm8962ReferenceSummary(stale.form1095A,result,{input:stale,prepared})).toThrow(/stale|conflict/i);
 const changed={...hidden,form8962:{...hidden.form8962!,sharedPolicyAllocation:{...hidden.form8962!.sharedPolicyAllocation!,householdMonths:hidden.form8962!.sharedPolicyAllocation!.householdMonths.map(row=>({...row,noAdvanceBenchmarkGroups:row.noAdvanceBenchmarkGroups?.map(group=>({...group,slcsp:d(1201)}))}))}}};expect(()=>buildForm8962ReferenceSummary(redacted.form1095A,changed,context)).toThrow(/retained|reconcil/i);
 expect(()=>buildForm8962ReferenceSummary(redacted.form1095A,hidden,{input:redacted,prepared:{} as PreparedPremiumTaxCreditReview})).toThrow(/original|prepared/i);
});
