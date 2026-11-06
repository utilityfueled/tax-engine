/** Spec: state/pa-actual-care-official-review.yaml. Actual public saved packet and complete private source replay. */
import Decimal from 'decimal.js';
import {afterAll,expect,it} from 'vitest';
import {access,mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,basename} from 'node:path';
import {PDFDocument} from 'pdf-lib';
import {execFileSync} from 'node:child_process';
import {fillPACareOfficialReview} from '@/pdf/mappings/2025/fill-pa-care-official-review.js';
import {fillReturn} from '@/pdf/fill-return.js';
import {redactReviewIdentifiers} from '@/pdf/redact-review-identifiers.js';
import {preparePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {actualMarriedCarePaper,actualSingleCarePaper,CARE_DISPLAY_CASES} from '../fixtures/pa-actual-care-official-review.js';
const retained=process.env.TAX_ENGINE_PA_CARE_PAPER_ARTIFACT_DIR,evidence=retained??await mkdtemp(join(tmpdir(),'pa-care-official-'));
afterAll(async()=>{if(!retained)await rm(evidence,{recursive:true,force:true});});
const blank=join(process.cwd(),'forms/blank/2025');
it.each(['single','married-one','married-two','married-lesser'] as const)('actual care public packet includes official DC and required federal companions %s',async kind=>{
 const f=kind==='single'?actualSingleCarePaper():actualMarriedCarePaper('safe',kind==='married-two'?{twoChildren:true,expenses:'7000'}:kind==='married-lesser'?{wages:['99000','1000'],withholding:['3039','31']}:{});
 const original=JSON.stringify(f.input),resultBefore=JSON.stringify(f.result),options='returns'in f.owned?{paMarriedReview:preparePAMarriedReturnReview(f.input)}:{paOrdinaryReview:preparePAOrdinaryReturnReview(f.input)};
 const expected=kind==='married-two'?'1200':kind==='married-lesser'?'200':'600';
 expect(('returns'in f.owned?f.owned.returns[0]:f.owned).scheduleDC?.credit.toFixed()).toBe(expected);
 const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{...options,purpose:'review',blankFormsDir:blank,outputDir:join(evidence,kind),flatten:true,useObjectStreams:false});
 expect(packet.filledForms.map(path=>basename(path))).toContain('f2441-filled.pdf');
 expect(packet.filledForms.map(path=>basename(path))).toContain('f1040s3-filled.pdf');
 expect(packet.filledForms.filter(path=>path.endsWith('-dc-review.pdf'))).toHaveLength(1);
 expect(packet.filledForms.some(path=>path.endsWith('pa-schedule-dc-reference.pdf'))).toBe(false);
 expect(JSON.stringify(f.input)).toBe(original);expect(JSON.stringify(f.result)).toBe(resultBefore);
});
it.each(CARE_DISPLAY_CASES.filter(kind=>kind!=='safe'))('actual source private care displays reject public emission before IO %s',async kind=>{
 const f=actualMarriedCarePaper(kind),original=JSON.stringify(f.input),token=preparePAMarriedReturnReview(f.input);
 expect(f.owned.returns[0].scheduleDC?.credit.toFixed()).toBe('600');
 for(const [name,directory]of [['valid',blank],['missing',join(evidence,'deliberately-absent-templates')]]as const){
  const out=join(evidence,kind+'-'+name);
  await expect(fillReturn(redactReviewIdentifiers(f.input),f.result,{paMarriedReview:token,purpose:'review',blankFormsDir:directory,outputDir:out})).rejects.toThrow(/private.*display|identifier.*display|privacy/i);
  await expect(access(out)).rejects.toThrow();
 }
 expect(JSON.stringify(f.input)).toBe(original);
});
it('ordinary care federal mutation rejects before missing template IO',async()=>{
 const f=actualSingleCarePaper(),token=preparePAOrdinaryReturnReview(f.input);
 if(!f.result.form2441)throw Error('Actual federal2441 result required');f.result.form2441.credit=new Decimal('601');
 await expect(fillReturn(redactReviewIdentifiers(f.input),f.result,{paOrdinaryReview:token,purpose:'review',blankFormsDir:'/deliberately-missing-care-templates',outputDir:join(evidence,'bad-federal')})).rejects.toThrow(/federal.*original|federal.*differ|federal.*reconcil/i);
});

it.each(['provider-name-tin','provider-address-receipt-case','person-first-receipt-case'] as const)('actual single private care displays reject public emission before IO %s',async kind=>{
 const f=actualSingleCarePaper(kind),token=preparePAOrdinaryReturnReview(f.input),out=join(evidence,'single-'+kind);
 expect(f.owned.scheduleDC?.credit.toFixed()).toBe('600');
 await expect(fillReturn(redactReviewIdentifiers(f.input),f.result,{paOrdinaryReview:token,purpose:'review',blankFormsDir:blank,outputDir:out})).rejects.toThrow(/private.*display|identifier.*display|privacy/i);
 await expect(access(out)).rejects.toThrow();
});

it('legacy actual care cannot bypass privacy or federal binding by omitting documentary metadata',async()=>{
 const unsafe=actualSingleCarePaper('provider-address-receipt-case',false),token=preparePAOrdinaryReturnReview(unsafe.input);
 const out=join(evidence,'legacy-unsafe');
 await expect(fillReturn(redactReviewIdentifiers(unsafe.input),unsafe.result,{paOrdinaryReview:token,purpose:'review',blankFormsDir:blank,outputDir:out})).rejects.toThrow(/private.*display|privacy/i);
 await expect(access(out)).rejects.toThrow();
 const safe=actualSingleCarePaper('safe',false),safeToken=preparePAOrdinaryReturnReview(safe.input);
 const packet=await fillReturn(redactReviewIdentifiers(safe.input),safe.result,{paOrdinaryReview:safeToken,purpose:'review',blankFormsDir:blank,outputDir:join(evidence,'legacy-safe')});
 expect(packet.filledForms.some(path=>path.endsWith('pa-schedule-dc-reference.pdf'))).toBe(true);
 expect(packet.filledForms.some(path=>path.endsWith('-dc-review.pdf'))).toBe(false);
 if(!safe.result.form2441)throw Error('Actual federal result missing');safe.result.form2441.credit=new Decimal('601');
 await expect(fillReturn(redactReviewIdentifiers(safe.input),safe.result,{paOrdinaryReview:safeToken,purpose:'review',blankFormsDir:'/deliberately-missing-care-templates',outputDir:join(evidence,'legacy-stale')})).rejects.toThrow(/federal.*original|federal.*differ|federal.*reconcil/i);
});
it.each(['single','married','legacy']as const)('unredacted actual care public input rejects before IO %s',async kind=>{
 const f=kind==='married'?actualMarriedCarePaper():actualSingleCarePaper('safe',kind!=='legacy'),options=kind!=='married'?{paOrdinaryReview:preparePAOrdinaryReturnReview(f.input)}:{paMarriedReview:preparePAMarriedReturnReview(f.input)},out=join(evidence,'unredacted-'+kind),before=JSON.stringify(f.input);
 await expect(fillReturn(f.input,f.result,{...options,purpose:'review',blankFormsDir:blank,outputDir:out})).rejects.toThrow(/redacted.*input|input.*redact/i);
 await expect(access(out)).rejects.toThrow();expect(JSON.stringify(f.input)).toBe(before);
});

const physicalAudit=String.raw`
import sys,json,hashlib,re
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,StreamObject,ArrayObject
cfg=json.loads(sys.argv[1]);source=PdfReader(cfg['source'],strict=True);out=[]
for path in cfg['paths']:
 r=PdfReader(path,strict=True);seen=set();strings=[]
 def walk(x):
  if isinstance(x,IndirectObject):
   key=(x.idnum,x.generation)
   if key in seen:return
   seen.add(key);v=x.get_object();assert v is not None;walk(v)
  elif isinstance(x,DictionaryObject):
   for k,v in x.items():
    assert str(k) not in ['/JavaScript','/JS','/OpenAction','/AA','/EmbeddedFiles','/Filespec'];strings.append(str(k));walk(v)
   if isinstance(x,StreamObject):strings.append(x.get_data().decode('latin1','ignore'))
  elif isinstance(x,(ArrayObject,list)):
   for v in x:walk(v)
  elif isinstance(x,str):strings.append(str(x))
 walk(r.trailer)
 for gen,entries in r.xref.items():
  if gen!=65535:
   for oid in entries:
    if oid:walk(IndirectObject(oid,gen,r))
 for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
 texts=[p.extract_text() or '' for p in r.pages]
 for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
 raw='\n'.join(strings+texts)+open(path,'rb').read().decode('latin1','ignore')
 lower=raw.lower()
 for marker in cfg['private']:
  assert marker.lower() not in lower, 'private marker in saved object graph'
  if re.fullmatch(r'[-.()\s\d]+',marker) and len(re.sub(r'\D','',marker))>=4:assert not re.search(r'[-.()\s]*'.join(re.sub(r'\D','',marker)),raw),'separated private marker'
 dc=path.endswith('-dc-review.pdf')
 if dc:
  assert len(r.pages)==1 and not r.get_fields() and '/AcroForm' not in r.trailer['/Root']
  assert not r.pages[0].get('/Annots')
  for oid,gen in seen:
   obj=IndirectObject(oid,gen,r).get_object()
   if isinstance(obj,DictionaryObject):assert obj.get('/Subtype')!='/Widget'
  assert 'INSTRUCTIONS' not in texts[0]
  names=r.pages[0]['/Resources']['/XObject'];expected=cfg['ovals']
  actual=[hashlib.sha256(ref.get_object().get_data()).hexdigest()for name,ref in names.items() if str(name).startswith('/CareOval')]
  wanted=[]
  for ref,state in expected:
   widget=IndirectObject(ref,0,source).get_object();wanted.append(hashlib.sha256(widget['/AP']['/N'][state].get_object().get_data()).hexdigest())
  assert actual==wanted, (actual,wanted)
 out.append({'path':path,'texts':texts,'objects':len(seen),'staticDC':dc})
print(json.dumps(out))
`;
function originalPrivateStrings(input:unknown):string[]{
 const values=new Set<string>();
 function walk(value:unknown){if(!value||typeof value!=='object')return;for(const[key,item]of Object.entries(value)){if(typeof item==='string'&&item.trim()&&/(?:ssn|tin|ein|taxId|accountReference|sourceReference|receiptNumber)$/i.test(key))values.add(item);else walk(item);}}
 walk(input);return [...values];
}
it.each(([true,false]as const).flatMap(flatten=>(['ssn','itin','atin']as const).map(kind=>[flatten,kind]as const)))('official DC physical cells and source ovals preserve documentary facts %s %s',async(flatten,kind)=>{
  const f=actualMarriedCarePaper('safe',{twoChildren:true,expenses:'7000'},{providers:[kind==='ssn'?'ssn':'fein'],persons:[kind,'ssn']}),token=preparePAMarriedReturnReview(f.input),out=join(evidence,`physical-${flatten}-${kind}`),before=JSON.stringify(f.input);
  const packet=await fillReturn(redactReviewIdentifiers(f.input),f.result,{paMarriedReview:token,purpose:'review',blankFormsDir:blank,outputDir:out,flatten,useObjectStreams:false});
  const checked=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-B','-c',physicalAudit,JSON.stringify({source:join(blank,'pa-schedule-dc.pdf'),paths:packet.filledForms,private:originalPrivateStrings(f.input),ovals:[[kind==='ssn'?460:461,kind==='ssn'?'/1':'/2'],[kind==='itin'?493:492,kind==='itin'?'/2':'/1'],[500,'/1']]})],{encoding:'utf8',maxBuffer:4*1024*1024}))as Array<{path:string;texts:string[];objects:number;staticDC:boolean}>;
  const dc=checked.find(row=>row.staticDC);expect(dc?.texts).toHaveLength(1);const text=dc?.texts.join(' ').replace(/\s+/g,' ')??'';
  for(const literal of ['Fictional Care Center','11 Fictional Care Way, Pittsburgh PA 15201','Care','Second','Pennsylvania','02/01/2020','CHILD','7000','1200'])expect(text).toContain(literal);
  const dcPath=packet.filledForms.find(path=>path.endsWith('-dc-review.pdf'));if(!dcPath)throw Error('Actual saved DC required');const reopened=await PDFDocument.load(await readFile(dcPath));expect(reopened.getPageCount()).toBe(1);
  expect(JSON.stringify(f.input)).toBe(before);expect(f.owned.returns[0].scheduleDC?.qualifyingPersons).toBe(2);expect(f.owned.returns[0].scheduleDC?.credit.toFixed()).toBe('1200');
  await writeFile(join(out,'strict-object-audit.json'),JSON.stringify(checked,null,2)+'\n');
});
it('actual care retains unsupported stale year and filing boundaries',async()=>{
 const f=actualMarriedCarePaper(),token=preparePAMarriedReturnReview(f.input),original=JSON.stringify(f.input),render=redactReviewIdentifiers(f.input),missing='/deliberately-missing-care-template';
 await expect(fillPACareOfficialReview(render,f.result,missing,{kind:'married',prepared:{}as typeof token})).rejects.toThrow(/context|original/i);
 const stale=structuredClone(render);if(!stale.dependentCare?.providers)throw Error('Original care required');stale.dependentCare.providers[0].name='Different real provider';
 await expect(fillPACareOfficialReview(stale,f.result,missing,{kind:'married',prepared:token})).rejects.toThrow(/original|source|changed/i);
 await expect(fillPACareOfficialReview(render,f.result,join(blank,'pa-schedule-sp.pdf'),{kind:'married',prepared:token})).rejects.toThrow(/revision|hash/i);
 await expect(fillReturn(render,f.result,{purpose:'filing',blankFormsDir:blank,outputDir:join(evidence,'filing'),paMarriedReview:token})).rejects.toThrow(/filing.*unavailable/i);
 const future=structuredClone(render);future.taxpayer.taxYear=2026;const futureResult={...f.result,taxYear:2026};
 await expect(fillReturn(future,futureResult,{purpose:'review',blankFormsDir:blank,outputDir:join(evidence,'future'),paMarriedReview:token})).rejects.toThrow(/2026|mapping/i);
 expect(JSON.stringify(f.input)).toBe(original);
 const unsupported=actualMarriedCarePaper('safe',{}, {providers:['itin'],persons:['ssn']});expect(()=>preparePAMarriedReturnReview(unsupported.input)).toThrow(/provider ITIN|oval/i);
 const incomplete=actualMarriedCarePaper();if(!incomplete.input.paMarriedOrdinarySources.care?.careSources)throw Error('Original care required');delete incomplete.input.paMarriedOrdinarySources.care.careSources.paperIdentitySources;expect(()=>preparePAMarriedReturnReview(incomplete.input)).toThrow(/documentary|projection/i);
});

it.each([['2997.50','600'],['2997.49','599'],['3000.49','600']]as const)('actual cents credit and original refund reconcile independently %s %s',async(expenses,credit)=>{
 const f=actualMarriedCarePaper('safe',{expenses},undefined,credit),token=preparePAMarriedReturnReview(f.input),dc=f.owned.returns[0].scheduleDC,before=JSON.stringify(f.input);
 expect(dc?.credit.toFixed()).toBe(credit);expect(f.owned.returns[0].pa40.otherCredits.toFixed()).toBe(credit);expect(f.owned.returns[0].refundDisposition.refund.toFixed()).toBe(credit);
 const doc=await fillPACareOfficialReview(redactReviewIdentifiers(f.input),f.result,join(blank,'pa-schedule-dc.pdf'),{kind:'married',prepared:token});expect(doc.getPageCount()).toBe(1);expect(f.input.dependentCare?.providers?.[0].amountPaid).toBe(expenses);expect(JSON.stringify(f.input)).toBe(before);
});
