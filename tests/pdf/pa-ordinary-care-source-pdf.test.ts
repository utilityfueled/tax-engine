// Spec: spec/state/pa-ordinary-care-source-pdf.yaml.
import {expect,it} from 'vitest';
import Decimal from 'decimal.js';
import {join} from 'node:path';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {fillPA40,PA_40_FIELDS as F} from '@/pdf/mappings/2025/fill-pa-40.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {paOrdinaryCareFixture} from '../fixtures/pa-ordinary-care-sources.js';
function actual(){const f=paOrdinaryCareFixture();const input=Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources});f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(input);const ordinary=calculatePAOrdinaryReturn(input,f.facts,f.sources),result=calculateFederalTax(input);result.stateReturns={pennsylvania:ordinary};return{...f,input,ordinary,result};}
const readSaved=String.raw`import json,sys
from pypdf import PdfReader
r=PdfReader(sys.argv[1],strict=True);fields=r.get_fields() or {};texts=[];widgets=[]
for p in r.pages:
 texts.append(p.extract_text() or '')
 for ref in p['/Annots'] if '/Annots' in p else []:
  a=ref.get_object();assert a is not None,'dangling annotation'
  if a.get('/Subtype')!='/Widget':continue
  parent=a.get('/Parent');parent=parent.get_object() if parent else a
  names=[];node=a;value=''
  while node:
   if node.get('/T') is not None:names.append(str(node['/T']))
   if value=='' and node.get('/V') is not None:value=node['/V']
   link=node.get('/Parent');node=link.get_object() if link else None
  name='.'.join(reversed(names))
  rect=a.get('/Rect');assert rect and float(rect[2])>=float(rect[0]) and float(rect[3])>=float(rect[1]),'invalid widget rectangle'
  if str(value) not in ('','/Off'):
   ap=a.get('/AP');assert ap and ap.get('/N') is not None,'missing populated widget appearance'
  if name in fields:assert str(fields[name].get('/V',''))==str(value),'field/widget disagreement'
  widgets.append({'name':name,'value':str(value),'rect':[float(n) for n in rect]})
print(json.dumps({'pages':texts,'fields':{k:str(v.get('/V','')) for k,v in fields.items()},'widgets':widgets,'metadata':str(r.metadata)}))`;
it('actual care saved packet preserves official PA cells privacy and reference scope',async()=>{
 const f=actual(),before=structuredClone(f.input),token=preparePAOrdinaryReturnReview(f.input),dir=await mkdtemp(join(tmpdir(),'pa-care-peer-pdf-'));
 const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{blankFormsDir:join(process.cwd(),'forms/blank/2025'),outputDir:dir,paOrdinaryReview:token,purpose:'review'});
 const paPath=packet.filledForms.find(p=>p.endsWith('pa-40-filled.pdf')),dcPath=packet.filledForms.find(p=>p.endsWith('pa-schedule-dc-reference.pdf'));expect(paPath).toBeDefined();expect(dcPath).toBeDefined();if(!paPath||!dcPath)throw Error('Actual PA40 and DC reference required');
 const values:Record<string,string>={[F.line23]:'600',[F.line24]:'3674',[F.line26]:'',[F.line29]:'600',[F.line30]:'600',[F.primarySSN]:''};
 const privateValues=[f.input.taxpayer.primary.ssn,f.input.taxpayer.primary.ssn.replace(/\D/g,''),f.input.taxpayer.dependents[0].ssn,f.input.taxpayer.dependents[0].ssn.replace(/\D/g,''),f.sources.care.careSources.sourceReference,f.sources.care.careSources.payments[0].sourceReference,f.sources.care.careSources.payments[0].originalReceipt.receiptNumber];
 const inspected:Array<{path:string;sha256?:string;pages:string[];fields:Record<string,string>;widgets:Array<{name:string;value:string;rect:number[]}>;metadata:string}>=[];
 for(const path of packet.filledForms){const saved=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',readSaved,path],{encoding:'utf8'}));inspected.push({path,...saved});const contents=JSON.stringify(saved);for(const value of privateValues)expect(contents).not.toContain(value);if(path===paPath){for(const[name,value]of Object.entries(values)){expect((saved.fields[name]??'').replaceAll(',','')).toBe(value);const widgets=saved.widgets.filter((w:{name:string})=>w.name===name);if(value)expect(widgets.some((w:{value:string})=>w.value.replaceAll(',','')===value)).toBe(true);}}if(path===dcPath){expect(saved.pages.join('\n')).toContain('REFERENCE SUMMARY ONLY');expect(saved.pages.join('\n').replace(/\s+/g,' ')).toContain('not an official PA Schedule DC filing copy');expect(saved.pages.join('\n')).toContain('$600');}}
 const pa=await PDFDocument.load(await readFile(paPath));expect(pa.getForm().getTextField(F.line23).getText()).toBe('600');expect(f.result.form2441?.lines.find(row=>row.line==='9a')?.value.toString()).toBe('600');expect(f.input).toEqual(before);expect(f.ordinary.readiness.filingEligible).toBe(false);
 await writeFile(join(dir,'independent-reopened-pdf-inspection.json'),JSON.stringify(inspected,null,2));if(process.env.PA_CARE_PEER_ARTIFACT_RECEIPT)await writeFile(process.env.PA_CARE_PEER_ARTIFACT_RECEIPT,JSON.stringify({dir,files:packet.filledForms},null,2));
});
it.each(['fabricated','providerName','receiptReference','personName','savedCredit','savedScheduleDC']as const)('actual care packet rejects stale private sources and changed results before I O %s',async kind=>{
 const f=actual(),token=preparePAOrdinaryReturnReview(f.input),missing='/does-not-exist/private-care-pa40.pdf';
 if(kind==='providerName'){const c=f.input.dependentCare;if(!c?.providers)throw Error('Actual provider required');c.providers[0].name='Different actual provider';}
 if(kind==='receiptReference')f.sources.care.careSources.payments[0].sourceReference='Different actual receipt same dollars';
 if(kind==='personName')f.input.taxpayer.dependents[0].firstName='Different actual child';
 if(kind==='savedCredit')f.ordinary.pa40.otherCredits=new Decimal(1);
 if(kind==='savedScheduleDC'){if(!f.ordinary.scheduleDC)throw Error('Actual DC result required');f.ordinary.scheduleDC.credit=new Decimal(1);}
 await expect(fillPA40(redactReviewIdentifiers(f.input),f.result,missing,undefined,kind==='fabricated'?{}as typeof token:token)).rejects.toThrow(/source|original|context|changed|reconcile/i);
});
it('actual care packet preserves public future-year denial',()=>{const f=paOrdinaryCareFixture(2026);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/2026.*rule pack.*incomplete/i);});
