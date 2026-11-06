// Spec: spec/federal/rrta-payroll-review-paper.yaml.
import { it, expect, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Decimal from 'decimal.js';
import type { TaxYearInput } from '@/models/inputs.js';
import type { TaxReturnResult } from '@/models/outputs.js';
import type { PreparedRRTAPayrollReview } from '@/pdf/rrta-payroll-review-context.js';
import { rrtaPayrollReviewDisplayInput } from '@/pdf/rrta-payroll-review-context.js';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { calculateFederalTax } from '@/engine/federal.js';
import * as publicPdf from '@/pdf/fill-return.js';
import { fillForm8959, FORM_8959_FIELDS as F } from '@/pdf/fill-form-8959.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { rrtaPaperInput,rrtaPaperSources } from '../fixtures/rrta-payroll-review-paper.js';
const prepare=(input:TaxYearInput)=>publicPdf.prepareRRTAPayrollReview(input,rrtaPaperSources(input));
const blank = 'forms/blank/2025';
const temporary: string[] = [];
afterAll(async () => { for (const dir of temporary)
    await rm(dir, { recursive: true, force: true }); });
async function output(label: string): Promise<string> {
    const retained = process.env.TAX_ENGINE_RRTA_PAPER_ARTIFACT_DIR;
    if (retained) {
        await mkdir(retained, { recursive: true });
        const dir = join(retained, label);
        await mkdir(dir);
        return dir;
    }
    const dir = await mkdtemp(join(tmpdir(), 'rrta-paper-' + label + '-'));
    temporary.push(dir);
    return dir;
}
const fields = (doc: PDFDocument) => Object.fromEntries(Object.entries(F).map(([key, name]) => [key, doc.getForm().getTextField(name).getText() ?? '']));
function rawValues(input: TaxYearInput): string[] {
    const values = new Set<string>();
    const collect = (value: unknown): void => { if (!value || typeof value !== 'object')
        return; for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string' && item.trim() && /(?:ssn|tin|ein|sourceId|sourceReference|reportingSourceReference)$/i.test(key)) {
            values.add(item);
            if (/^[-.()\s\d]+$/.test(item))
                values.add(item.replace(/\D/g, ''));
        }
        else
            collect(item);
    } };
    collect(input);
    return [...values];
}
const inspect = String.raw `
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject
import json,sys
results=[];allstrings=[]
for path in json.loads(sys.argv[1]):
 r=PdfReader(path,strict=True);seen=set();strings=[]
 def walk(x):
  if isinstance(x,IndirectObject):
   key=(x.idnum,x.generation)
   if key in seen:return
   seen.add(key);walk(x.get_object());return
  if isinstance(x,DictionaryObject):
   assert str(x.get('/Subtype',''))!='/Widget'
   for k,v in x.items():assert str(k) not in ['/AcroForm','/JS','/JavaScript','/OpenAction','/AA'];walk(v)
   if isinstance(x,StreamObject):strings.append(x.get_data().decode('latin1','ignore'))
  elif isinstance(x,(ArrayObject,list)):
   for v in x:walk(v)
  elif isinstance(x,str):strings.append(x)
 walk(r.trailer)
 for gen,entries in r.xref.items():
  if gen!=65535:
   for oid in entries:
    if oid:walk(IndirectObject(oid,gen,r))
 for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
 texts=[page.extract_text() or '' for page in r.pages]
 for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
 allstrings+=strings+texts
 results.append({'path':path,'pages':texts,'objects':len(seen),'sizes':[[float(p.mediabox.width),float(p.mediabox.height)] for p in r.pages]})
text='\n'.join(allstrings)
for value in json.loads(sys.argv[2]):assert value.lower() not in text.lower(),value
print(json.dumps(results))
`;
async function packet(input: TaxYearInput, label: string) {
    const result = calculateFederalTax(input), token = prepare(input), render = redactReviewIdentifiers(input), dir = await output(label);
    const before = JSON.stringify({ input, result });
    const doc = await fillForm8959(render, result, join(blank, 'f8959.pdf'), token);
    const values = fields(doc);
    await import('node:fs/promises').then(async (fs) => fs.writeFile(join(dir, 'f8959-interactive.pdf'), await doc.save()));
    const written = await publicPdf.fillReturn(render, result, { blankFormsDir: blank, outputDir: dir, flatten: true, useObjectStreams: false, pageOnlyTemporaryMerge: true, rrtaPayrollReview: token });
    expect(JSON.stringify({ input, result })).toBe(before);
    const scan = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', inspect, JSON.stringify(written.filledForms), JSON.stringify(rawValues(input))], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
    await import('node:fs/promises').then(fs => fs.writeFile(join(dir, 'saved-scan.json'), JSON.stringify({ values, scan }, null, 2) + '\n'));
    return { values, written, scan, dir };
}
it('maps separate original wage and railroad lines in the public review packet', async () => {
    const { values, written } = await packet(rrtaPaperInput(), 'both-parts');
    expect(values).toEqual({name:'Jane Doe & John Doe',ssn:'',line1:'260000',line2:'1000',line3:'',line4:'261000',line5:'250000',line6:'11000',line7:'99',line8:'',line9:'',line10:'',line11:'',line12:'',line13:'',line14:'300000',line15:'250000',line16:'50000',line17:'450',line18:'549',line19:'3860',line20:'260000',line21:'3770',line22:'90',line23:'450',line24:'540'});
    expect(written.filledForms.map(path => path.split('/').pop())).toEqual(expect.arrayContaining(['f1040-filled.pdf', 'f1040s2-filled.pdf', 'f4137-filled.pdf', 'f8959-filled.pdf']));
});
it('keeps zero-tax railroad withholding in a review-only companion', async () => {
    const { values, written } = await packet(rrtaPaperInput('150000', '20000', '145', '290'), 'withholding-only');
    expect(values.line18).toBe('0');
    expect(values.line22).toBe('0');
    expect(values.line23).toBe('145');
    expect(values.line24).toBe('145');
    expect(values.line14).toBe('150000');
    expect(values.line15).toBe('250000');
    expect(values.line16).toBe('0');
    expect(values.line17).toBe('0');
    expect(written.filledForms.some(path => path.endsWith('/f8959-filled.pdf'))).toBe(true);
});
it('maps the actual joint threshold without combining wages and railroad compensation', async () => {
  // IRS instructions example6: wage190000 + RRTA150000 do not combine.
  // This fixture additionally has actual unreported tips1000 and withheld145.
  const {values}=await packet(rrtaPaperInput('150000','190000','145','2755'),'joint-independent-thresholds');
  expect(values.line4).toBe('191000');expect(values.line14).toBe('150000');
  expect(values.line5).toBe('250000');expect(values.line15).toBe('250000');
  expect(values.line7).toBe('0');expect(values.line17).toBe('0');expect(values.line18).toBe('0');
  expect(values.line22).toBe('0');expect(values.line23).toBe('145');expect(values.line24).toBe('145');
});
it('maps the separate single RRTA threshold from actual primary originals',async()=>{
 const input=rrtaPaperInput('230000','0','270','0',false),result=calculateFederalTax(input);
 const values=fields(await fillForm8959(redactReviewIdentifiers(input),result,join(blank,'f8959.pdf'),prepare(input)));
 expect(values.line15).toBe('200000');expect(values.line16).toBe('30000');expect(values.line17).toBe('270');expect(values.line18).toBe('270');expect(values.line22).toBe('0');expect(values.line23).toBe('270');expect(values.line24).toBe('270');
});
async function deny(input: TaxYearInput, result: TaxReturnResult, token?: PreparedRRTAPayrollReview) {
    const parent = await mkdtemp(join(tmpdir(), 'rrta-deny-')), out = join(parent, 'not-created');
    try {
        await expect(publicPdf.fillReturn(input, result, { blankFormsDir: '/missing-templates', outputDir: out, rrtaPayrollReview: token })).rejects.toThrow(/RRTA|year/i);
        expect(existsSync(out)).toBe(false);
        await expect(fillForm8959(input, result, '/missing.pdf', token)).rejects.toThrow(/RRTA|year/i);
    }
    finally {
        await rm(parent, { recursive: true, force: true });
    }
}
it('denies missing forged stale and altered source contexts before output', async () => {
    const input = rrtaPaperInput(), result = calculateFederalTax(input), token = prepare(input), render = redactReviewIdentifiers(input);
    await deny(render, result);
    await deny(render, result, {} as PreparedRRTAPayrollReview);
    await deny(input, result, token);
    const stale = structuredClone(render);
    required(stale.rrtaPayrollSources).sourceReference += ' revised';
    await deny(stale, result, token);
    const lexical = structuredClone(render);
    required(required(lexical.rrtaPayrollSources).sources)[0].tier1MedicareCompensation = '300000.00';
    await deny(lexical, result, token);
    const removed = structuredClone(render);
    delete removed.rrtaPayrollSources;
    await deny(removed, result, token);
    const owner = structuredClone(render);
    required(required(owner.rrtaPayrollSources).sources)[0].owner = 'spouse';
    await deny(owner, result, token);
    const stripped = structuredClone(render);
    delete stripped.rrtaPayrollSources;
    const strippedResult = { ...result, form8959: { ...required(result.form8959), lines: required(result.form8959).lines.filter(row => !['14', '15', '16', '17', '23'].includes(row.line)) } };
    await deny(stripped, strippedResult, token);
    await deny(render, { ...result, totalTax: result.totalTax.plus(1) }, token);
    await deny(render, { ...result, form8959: { ...required(result.form8959), lines: required(result.form8959).lines.map(row => row.line === '22' ? { ...row, value: new Decimal(360) } : row) } }, token);
    await deny({ ...render, taxpayer: { ...render.taxpayer, taxYear: 2026 } }, result, token);
});
it('preserves private originals while redacting every companion employer identifier', async () => {
    const input = rrtaPaperInput(), result = calculateFederalTax(input), before = JSON.stringify({ input, result }), token = prepare(input);
    const display = rrtaPayrollReviewDisplayInput(redactReviewIdentifiers(input), result, token);
    expect(required(required(required(display.form4137).sourceFacts).employers)[0].employerEin).toBe('');
    expect(required(required(required(display.form4137).sourceFacts).employers)[0].employerName).not.toContain('Restaurant');
    for (const value of rawValues(input))
        expect(JSON.stringify(display).toLowerCase()).not.toContain(value.toLowerCase());
    expect(JSON.stringify({ input, result })).toBe(before);
});
for (const embedding of ['123456789', '57-3926418', 'Fictional original railroad W2 and annual ledger', 'fictional ORIGINAL RAILROAD w2 and annual ledger'])
    it('denies embedded private household display ' + embedding, async () => {
        const input = rrtaPaperInput();
        input.taxpayer.address.street = embedding;
        required(input.rrtaPayrollSources).originalTaxpayer = structuredClone(input.taxpayer);
        const result = calculateFederalTax(input), token = prepare(input);
        await deny(redactReviewIdentifiers(input), result, token);
    });
it('preserves filing denial and rejects unknown or absent original identity', async () => {
    const input = rrtaPaperInput(), result = calculateFederalTax(input), token = prepare(input);
    await expect(publicPdf.fillReturn(redactReviewIdentifiers(input), result, { blankFormsDir: '/missing', outputDir: '/missing', purpose: 'filing', rrtaPayrollReview: token })).rejects.toThrow(/Filing exports/);
    const missing = structuredClone(input);
    missing.taxpayer.primary.ssn = '';
    expect(() => prepare(missing)).toThrow(/original/);
    const unknown = structuredClone(input);
    delete required(required(unknown.rrtaPayrollSources).sources)[0].additionalMedicareTaxWithheld;
    expect(() => prepare(unknown)).toThrow(/RRTA/);
});
it('shows known-zero computed excess and tax while skipping inapplicable self-employment', async () => {
    const input = rrtaPaperInput('150000', '20000', '145', '290'), result = calculateFederalTax(input);
    const doc = await fillForm8959(redactReviewIdentifiers(input), result, join(blank, 'f8959.pdf'), prepare(input)), values = fields(doc);
    expect(values.line6).toBe('0');
    expect(values.line16).toBe('0');
    expect(values.line17).toBe('0');
    expect(values.line18).toBe('0');
    expect(values.line22).toBe('0');
    for (const line of ['line8', 'line9', 'line10', 'line11', 'line12', 'line13'])
        expect(values[line]).toBe('');
});
function required<T>(value: T | undefined): T { if (value === undefined)
    throw Error("Missing actual fictional original"); return value; }

it('requires actual paper-only ordinary uncollected Medicare absence evidence',()=>{
 const input=rrtaPaperInput();
 expect(()=>publicPdf.prepareRRTAPayrollReview(input)).toThrow(/RRTA.*paper.*withholding/i);
 const facts=rrtaPaperSources(input);
 for(const change of [{noOrdinaryUncollectedMedicareCodesBOrNConfirmed:false},{noOrdinaryUncollectedMedicareCodesBOrNConfirmed:undefined},{sourceTaxYear:2026},{sourceReference:''},{originalW2s:[]}])expect(()=>publicPdf.prepareRRTAPayrollReview(input,{...facts,...change} as unknown as Parameters<typeof publicPdf.prepareRRTAPayrollReview>[1])).toThrow(/RRTA.*paper.*withholding/i);
 const stale=structuredClone(facts);stale.originalW2s[0].wages+='0';expect(()=>publicPdf.prepareRRTAPayrollReview(input,stale)).toThrow(/RRTA.*paper.*withholding/i);
 const before=JSON.stringify({input,facts});publicPdf.prepareRRTAPayrollReview(input,facts);expect(JSON.stringify({input,facts})).toBe(before);
});
