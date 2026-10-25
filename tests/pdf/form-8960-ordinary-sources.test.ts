/** Spec: spec/federal/form-8960-ordinary-sources.yaml, final2025 review template. */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import { fillForm8960, FORM_8960_FIELDS as F } from '@/pdf/fill-form-8960.js';
import { REVIEW_PDF_NOTICE } from '@/pdf/export-policy.js';
import { ordinaryNiitSourceFixture } from '../fixtures/niit-ordinary-sources.js';

describe('Form8960 ordinary source review PDF', () => {
  it('preserves audited ordinary sources in reopened canonical and widget fields', async () => {
    const input = ordinaryNiitSourceFixture();
    const result = calculateFederalTax(input);
    const document = await fillForm8960(input, result, 'forms/blank/2025/f8960.pdf');
    const bytes = await document.save();
    const reopened = await PDFDocument.load(bytes);
    const expected = { [F.line1]: '20000', [F.line3]: '10000', [F.line8]: '30000', [F.line9b]: '2501', [F.line11]: '2501', [F.line12]: '27499', [F.line13]: '280000', [F.line14]: '200000', [F.line15]: '80000', [F.line16]: '27499', [F.line17]: '1045' };
    for (const [key, value] of Object.entries(expected)) expect(reopened.getForm().getTextField(key).getText(), key).toBe(value);
    expect(reopened.getSubject()).toBe(REVIEW_PDF_NOTICE);
    const inspected = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', `
import io,json,sys
from pypdf import PdfReader
reader=PdfReader(io.BytesIO(sys.stdin.buffer.read()))
fields=reader.get_fields() or {}
widgets={}
for page in reader.pages:
  for ref in page.get('/Annots', []):
    obj=ref.get_object()
    if obj.get('/Subtype')!='/Widget': continue
    chain=[]; node=obj
    while node is not None:
      chain.append(node); parent=node.get('/Parent'); node=parent.get_object() if parent else None
    key='.'.join(str(item['/T']) for item in reversed(chain) if '/T' in item)
    value=next((str(item['/V']) for item in chain if '/V' in item), '')
    appearance=obj.get('/AP',{}).get('/N')
    stream=appearance.get_object() if appearance else None
    widgets[key]={'value':value,'appearance':bool(stream and hasattr(stream,'get_data') and stream.get_data())}
print(json.dumps({'fields':{key:str(value.get('/V','')) for key,value in fields.items()},'widgets':widgets,'pages':[page.extract_text() or '' for page in reader.pages]}))
`], { input: bytes, encoding: 'utf8' })) as { fields: Record<string, string>; widgets: Record<string, { value: string; appearance: boolean }>; pages: string[] };
    for (const [key, value] of Object.entries(expected)) {
      expect(inspected.fields[key], `canonical ${key}`).toBe(value);
      expect(inspected.widgets[key], `widget ${key}`).toEqual({ value, appearance: true });
    }
    for (const page of inspected.pages) expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
  });
});
