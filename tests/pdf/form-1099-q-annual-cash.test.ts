// Spec: spec/federal/form-1099-q-annual-cash.yaml private-reference.
import Decimal from 'decimal.js';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { calculateForm1099Q } from '@/engine/forms/form-1099-q.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildForm1099QReferenceSummary } from '@/pdf/fill-form-1099-q.js';
import { fillReturn } from '@/pdf/fill-return.js';
import { FORM_1040_FIELDS as F1040 } from '@/pdf/fill-form-1040.js';
import { FORM_5329_FIELDS as F5329 } from '@/pdf/fill-form-5329.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { prepareEducationReview } from '@/pdf/education-review-context.js';
import { annualCashQtpFixture, annualCashReportingFixture } from '../fixtures/education-annual-cash.js';
it('binds the annual cash fraction to every original source before rendering', () => {
  const { input, facts } = annualCashQtpFixture(), result = calculateForm1099Q(input.form1099Q, input.qualifiedEducationExpenses, { taxYear: 2025 });
  const token = prepareEducationReview(input), shown = buildForm1099QReferenceSummary(input.form1099Q, result, input.qualifiedEducationExpenses, token);
  expect(shown.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Statement 1: Annual cash gross', value: '20000' });
  expect(shown.qualifiedEducationExpenseInputs).toContainEqual({ label: 'Statement 1: Annual qualified cash expenses', value: '6000' });
  for (const mutation of ['statement', 'same-net', 'period', 'missing-audit', 'taxable']) {
    const forms = structuredClone(input.form1099Q), summary = structuredClone(input.qualifiedEducationExpenses);
    const copy = { ...result, lines: result.lines.map(line => ({ ...line })), perDistribution: result.perDistribution.map(row => ({ ...row })) };
    const first = forms[0], receipt = summary?.sourceFacts?.expenses?.[0], period = summary?.sourceFacts?.roomBoardPeriods?.[0], row = copy.perDistribution[0];
    if (!first || !receipt || !period || !row) throw new Error('Missing fictional actual source');
    if (mutation === 'statement') first.payerName = 'Different actual payer';
    if (mutation === 'same-net') { receipt.amount = '5001'; receipt.refundedAmount = '1'; }
    if (mutation === 'period') period.sourceReference = 'Replaced allowance record';
    if (mutation === 'missing-audit') copy.lines = copy.lines.filter(line => !line.line.endsWith(':annual-cash'));
    if (mutation === 'taxable') row.taxableEarnings = new Decimal('2799');
    expect(() => buildForm1099QReferenceSummary(forms, copy, summary, token)).toThrow(/source|audit|calculation|annual/i);
    expect(() => buildForm1099QReferenceSummary(forms, copy, summary)).toThrow(/source|audit|calculation|annual/i);
  }
  const original = JSON.stringify(facts); buildForm1099QReferenceSummary(input.form1099Q, result, input.qualifiedEducationExpenses);
  expect(JSON.stringify(facts)).toBe(original);
});

it('prints summed annual cents and rejects rounded-source total forgery',async()=>{
  const {input}=annualCashReportingFixture('4.50','95.50'),result=calculateFederalTax(input),education=result.form1099Q;
  if(!education)throw new Error('Missing actual annual education calculation');
  expect(education.taxableEarnings.toFixed()).toBe('5');
  const token=prepareEducationReview(input),shown=buildForm1099QReferenceSummary(input.form1099Q,education,input.qualifiedEducationExpenses,token);
  expect(shown.sourceLines.filter(row=>row.line.endsWith(':taxable-earnings')).map(row=>row.value)).toEqual(['2.25','2.25']);
  for(const target of ['return','recipient']){
    const forged={...education,perRecipient:education.perRecipient.map(row=>({...row})),lines:education.lines.map(row=>({...row}))};
    if(target==='return')forged.taxableEarnings=new Decimal(4);
    else {const recipient=forged.perRecipient[0];if(!recipient)throw new Error('Missing actual recipient');recipient.taxableEarnings=new Decimal(4);}
    for(const line of forged.lines)if(line.line===(target==='return'?'taxable-earnings':'primary:primary:5'))line.value=new Decimal(4);
    expect(()=>buildForm1099QReferenceSummary(input.form1099Q,forged,input.qualifiedEducationExpenses)).toThrow(/audit|reconcile/);
    expect(()=>buildForm1099QReferenceSummary(input.form1099Q,forged,input.qualifiedEducationExpenses,token)).toThrow(/audit|reconcile|conflict/);
  }
  for(const field of ['denominator','taxableNumerator','excludedNumerator','creditExceptionNumerator','penaltyExceptionNumerator'] as const){
    const forged={...education,perDistribution:education.perDistribution.map(row=>({...row,annualCashReporting:row.annualCashReporting?{...row.annualCashReporting}:undefined}))};
    const amounts=forged.perDistribution[0]?.annualCashReporting;if(!amounts)throw new Error('Missing exact calculated reporting amounts');
    amounts[field]=amounts[field].plus(1);
    expect(()=>buildForm1099QReferenceSummary(input.form1099Q,forged,input.qualifiedEducationExpenses)).toThrow(/source|reporting|exception/i);
    expect(()=>buildForm1099QReferenceSummary(input.form1099Q,forged,input.qualifiedEducationExpenses,token)).toThrow(/audit|reconcile|conflict/i);
  }
  const directory=await mkdtemp(join(tmpdir(),'annual-cash-rounding-review-'));
  try{
    await fillReturn(redactReviewIdentifiers(input),redactReviewIdentifiers(result),{blankFormsDir:'forms/blank/2025',outputDir:directory,educationReview:token});
    const fields=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',
      'import json,sys;from pypdf import PdfReader;print(json.dumps([{k:str(v.get("/V","")) for k,v in PdfReader(p).get_fields().items()} for p in sys.argv[1:]]))',
      join(directory,'f1040-filled.pdf'),join(directory,'f5329-primary-filled.pdf')],{encoding:'utf8',timeout:30000})) as Array<Record<string,string>>;
    expect([fields[0]?.[F1040.line11],fields[1]?.[F5329.line5],fields[1]?.[F5329.line6],fields[1]?.[F5329.line8]]).toEqual(['50005','5','','1']);
    expect(fields[1]?.[F5329.ssn]).toBe('');
  }finally{await rm(directory,{recursive:true,force:true});}
});
