// Spec: spec/federal/form-1099-q-room-board-periods.yaml. Synthetic saved output.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { buildForm1099QReferenceSummary, fillForm1099QReference } from '@/pdf/fill-form-1099-q.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { roomBoardPeriodFixture } from '../fixtures/education-room-board-periods.js';
it('binds original period records before writing the review summary', async () => {
  const {input,facts}=roomBoardPeriodFixture(),forms=input.form1099Q??[],result=calculateForm1099Q(forms,input.qualifiedEducationExpenses,{taxYear:2025});
  const token=prepareEducationReview(input),shown=buildForm1099QReferenceSummary(forms,result,input.qualifiedEducationExpenses,token);
  expect(shown.sourceLines.find(l=>l.line==='prepaid:room-board-period:fall')?.value).toBe('6000');
  for(const mutation of ['allowance','institution','receipt-date','missing','equal-total']){
    const summary=structuredClone(input.qualifiedEducationExpenses),period=summary?.sourceFacts?.roomBoardPeriods?.[0],link=summary?.sourceFacts?.roomBoardPeriodExpenses?.[0];
    if(!period||!link)throw new Error('Missing actual period sources');
    if(mutation==='allowance')period.roomBoardAllowance='5999';
    if(mutation==='institution')period.institutionName='Replaced institution';
    if(mutation==='receipt-date')link.coveredStart='2025-09-02';
    if(mutation==='missing')summary.sourceFacts.roomBoardPeriods=undefined;
    if(mutation==='equal-total')period.schoolOwnedHousingCharge='0.00';
    expect(()=>buildForm1099QReferenceSummary(forms,result,summary,token)).toThrow(/source|audit|period/i);
    if(mutation!=='equal-total')expect(()=>buildForm1099QReferenceSummary(forms,result,summary)).toThrow(/source|audit|period|room/i);
  }
  const directory=await mkdtemp(join(tmpdir(),'room-board-period-review-'));
  try {
    const path=await fillForm1099QReference(forms,result,input.qualifiedEducationExpenses,directory,token);
    const pages=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c','import json,sys;from pypdf import PdfReader;print(json.dumps([p.extract_text() for p in PdfReader(sys.argv[1]).pages]))',path],{encoding:'utf8'})) as string[];
    pages.forEach(page=>expect(page).toContain(REVIEW_PDF_NOTICE));const text=pages.join('\n');
    for(const value of ['10000','6000','1200','800','80','Academic period'])expect(text).toContain(value);
    for(const value of [input.taxpayer.primary.ssn,'fictional-institution','Fictional fall attendance record','prepaid-account'])expect(text).not.toContain(value);
    expect(facts.roomBoardPeriodExpenses).toHaveLength(2);
  } finally {await rm(directory,{recursive:true,force:true});}
});
