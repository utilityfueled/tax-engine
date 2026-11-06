// Spec: spec/state/pa-schedule-dc-reference-units.yaml.
import {it,expect} from 'vitest';
import Decimal from 'decimal.js';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {calculateScheduleDC} from '@/engine/state/pa-schedule-dc.js';
import {fillPAScheduleDCReference} from '@/pdf/mappings/2025/fill-pa-schedule-dc.js';

it.each([[1,'600'],[2,'1200']] as const)('saved DC reference displays persons as a count and credits as currency %s',async(count,credit)=>{
 const result=calculateScheduleDC({taxYear:2025,qualifyingPersons:count,paTaxableIncome:new Decimal('100120'),federalCredit:new Decimal(credit)});
 const dir=await mkdtemp(join(tmpdir(),'pa-dc-units-')),path=await fillPAScheduleDCReference(result,dir);
 const saved=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',
  'import sys,json;from pypdf import PdfReader;r=PdfReader(sys.argv[1],strict=True);print(json.dumps({"pages":len(r.pages),"text":" ".join(p.extract_text() or "" for p in r.pages)}))',path],{encoding:'utf8'}));
 expect(saved.pages).toBe(1);
 expect(saved.text).toContain(`Line 1 qualifying persons: ${count}`);
 expect(saved.text).not.toContain(`Line 1 qualifying persons: $${count}`);
 expect(saved.text).toContain(`Federal Form 2441 Line 9a credit: $${credit}`);
 expect(saved.text).toContain(`PA-40 Line 23 Schedule DC credit: $${credit}`);
 expect(saved.text).toContain('REFERENCE SUMMARY ONLY');
 expect(saved.text.replace(/\s+/g,' ')).toContain('not an official PA Schedule DC filing copy');
 if(process.env.PA_DC_UNITS_RECEIPT_DIR)await writeFile(join(process.env.PA_DC_UNITS_RECEIPT_DIR,`saved-${count}.json`),JSON.stringify({path,...saved},null,2));
});
