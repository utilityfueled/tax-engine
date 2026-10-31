// Spec: spec/federal/foreign-tax-election.yaml.
import { execFileSync } from '../helpers/file-stdin-exec';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillScheduleA, SCHEDULE_A_FIELDS as F } from '@/pdf/fill-schedule-a.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { foreignTaxElectionFixture } from '../fixtures/foreign-tax-election.js';
const blank = 'forms/blank/2025/f1040sa.pdf';

describe('Schedule A actual foreign tax review', () => {
  it('preserves actual tax audit values in saved canonical fields and widget appearances', async () => {
    const input = foreignTaxElectionFixture();
    const result = calculateFederalTax(input);
    const reviewInput = redactReviewIdentifiers(input);
    expect(reviewInput.form1099Int[0].accountReference).toBe('');
    expect(input.form1099Int[0].accountReference).toBe('Synthetic foreign account A');
    const doc = await fillScheduleA(reviewInput, result, blank);
    const bytes = await doc.save();
    const reopened = await PDFDocument.load(bytes);
    const expected = { [F.line5a]: '15000', [F.line5b]: '6000', [F.line5c]: '1000', [F.line5d]: '22000', [F.line5e]: '22000', [F.line6Desc]: 'Foreign income taxes', [F.line6]: '601', [F.line7]: '22601', [F.line17]: '22601' };
    for (const [key, value] of Object.entries(expected)) expect(reopened.getForm().getTextField(key).getText(), key).toBe(value);
    const inspected = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
import io,json,sys
from pypdf import PdfReader
reader=PdfReader(io.BytesIO(sys.stdin.buffer.read())); fields=reader.get_fields() or {}; widgets={}
for page in reader.pages:
 for ref in page.get('/Annots',[]):
  obj=ref.get_object()
  if obj.get('/Subtype')!='/Widget': continue
  chain=[]; node=obj
  while node is not None:
   chain.append(node); parent=node.get('/Parent'); node=parent.get_object() if parent else None
  key='.'.join(str(item['/T']) for item in reversed(chain) if '/T' in item)
  value=next((str(item['/V']) for item in chain if '/V' in item),'')
  ap=obj.get('/AP',{}).get('/N'); stream=ap.get_object() if ap else None
  widgets[key]={'value':value,'appearance':bool(stream and hasattr(stream,'get_data') and stream.get_data())}
print(json.dumps({'fields':{key:str(value.get('/V','')) for key,value in fields.items()},'widgets':widgets,'pages':[page.extract_text() or '' for page in reader.pages]}))
`], { input: bytes, encoding: 'utf8' })) as { fields: Record<string,string>; widgets: Record<string,{value:string;appearance:boolean}>; pages:string[] };
    for (const [key,value] of Object.entries(expected)) { expect(inspected.fields[key],key).toBe(value); expect(inspected.widgets[key],key).toEqual({value,appearance:true}); }
    for (const page of inspected.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  });
  it('rejects missing duplicate and conflicting tax audits', async () => {
    const input = foreignTaxElectionFixture(); const result = calculateFederalTax(input);
    for (const number of ['5a','5b','5c','5d','5e','6','7']) {
      const actual = result.scheduleA.lines.find(line => line.form === 'Sched A' && line.line === number);
      if (!actual) throw new Error('Missing synthetic actual tax audit');
      const missing = result.scheduleA.lines.filter(line => line !== actual);
      for (const lines of [missing, [...result.scheduleA.lines,actual]]) {
        await expect(fillScheduleA(input,{...result,scheduleA:{...result.scheduleA,lines}},blank)).rejects.toThrow(/tax.*audit/i);
      }
    }
    const lines = result.scheduleA.lines.map(line => line.form === 'Sched A' && line.line === '6' ? {...line,value:line.value.plus(1)} : line);
    await expect(fillScheduleA(input,{...result,scheduleA:{...result.scheduleA,lines}},blank)).rejects.toThrow(/tax.*audit/i);
  });
});
