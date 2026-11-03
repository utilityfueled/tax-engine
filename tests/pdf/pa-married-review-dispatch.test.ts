/** Spec: state/pa-married-workspace-review.yaml. Routing source controls predate products. */
import {expect,it}from 'vitest';
import {execFileSync}from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,rm}from 'node:fs/promises';
import {join,basename}from 'node:path';
import {tmpdir}from 'node:os';
import {fillReturn,type FillReturnOptions}from '@/pdf/fill-return.js';
import {preparePAMarriedReturnReview,type PreparedPAMarriedReturnReview}from '@/pdf/pa-married-return-review-context.js';
import {prepareEicReview,hasEicReviewSources}from '@/pdf/eic-review-context.js';
import {redactReviewIdentifiers}from '@/pdf/redact-review-identifiers.js';
import {paMarriedOfficialFixture}from '../fixtures/pa-married-official-review.js';
const cases=[
 {mode:'J',name:'whole',owners:[['joint','80000','2456','2456','0','0']]},
 {mode:'M',name:'whole',owners:[['primary','50000','1535','1535','0','0'],['spouse','30000','921','921','0','0']]},
 {mode:'J',name:'cents',owners:[['joint','80001','2457','2456','0','1']]},
 {mode:'M',name:'cents',owners:[['primary','50000','1535','1535','0','0'],['spouse','30000','921','921','0','0']]},
 {mode:'J',name:'shared-sp',owners:[['joint','13001','399','399','359','359']]},
 {mode:'M',name:'shared-sp',owners:[['primary','10000','307','307','276','276'],['spouse','3001','92','92','83','83']]},
]as const;
type Geometry={page:number;rect:number[]};type Kind='pa40'|'sp';
const geometry:Record<Kind,Record<string,Geometry>>={"pa40":{"1a":{"page":0,"rect":[420.923,360.584,555.391,378.375]},"1b":{"page":0,"rect":[420.923,339.598,555.391,357.389]},"1c":{"page":0,"rect":[420.543,318.125,555.391,335.917]},"2":{"page":0,"rect":[420.543,296.506,555.391,314.591]},"3":{"page":0,"rect":[420.493,274.461,554.961,291.959]},"4":{"page":0,"rect":[420.923,253.561,555.391,270.739]},"5":{"page":0,"rect":[420.924,231.37,555.391,249.775]},"6":{"page":0,"rect":[420.923,209.75,555.391,226.928]},"7":{"page":0,"rect":[420.923,188.531,555.391,206.935]},"8":{"page":0,"rect":[420.543,166.806,555.391,183.984]},"9":{"page":0,"rect":[420.164,144.901,555.391,162.693]},"10":{"page":0,"rect":[420.164,123.101,555.391,140.892]},"11":{"page":0,"rect":[420.77,101.964,555.998,120.369]},"12":{"page":1,"rect":[420.692,686.45,556.888,705.467]},"13":{"page":1,"rect":[420.692,664.729,556.888,683.748]},"14":{"page":1,"rect":[420.262,642.955,556.458,661.973]},"15":{"page":1,"rect":[420.692,621.484,556.888,640.502]},"16":{"page":1,"rect":[420.692,599.864,556.888,618.882]},"17":{"page":1,"rect":[420.692,578.012,556.888,597.031]},"18":{"page":1,"rect":[420.692,557.153,556.888,576.171]},"19b":{"page":1,"rect":[526.702,535.108,557.969,553.593]},"20":{"page":1,"rect":[301.387,513.438,436.596,531.883]},"21":{"page":1,"rect":[420.692,490.886,556.888,509.904]},"22":{"page":1,"rect":[420.692,469.764,556.888,488.783]},"23":{"page":1,"rect":[420.692,446.508,556.888,465.526]},"24":{"page":1,"rect":[420.692,425.522,556.888,444.54]},"25":{"page":1,"rect":[420.692,403.669,556.888,422.688]},"26":{"page":1,"rect":[421.105,382.32,557.301,401.339]},"27":{"page":1,"rect":[420.692,362.23,556.888,381.248]},"28":{"page":1,"rect":[421.175,340.371,557.371,358.776]},"29":{"page":1,"rect":[420.692,317.309,556.888,336.327]},"30":{"page":1,"rect":[420.692,295.645,556.888,314.663]},"31":{"page":1,"rect":[420.692,274.364,556.888,293.383]}},"sp":{"A1":{"page":1,"rect":[69.6653,588.694,145.275,600.28]},"A2":{"page":1,"rect":[69.6653,578.307,145.275,589.893]},"A3":{"page":1,"rect":[69.6653,566.962,145.275,578.548]},"A4":{"page":1,"rect":[69.6653,555.987,145.275,567.573]},"A5":{"page":1,"rect":[69.6653,545.401,145.275,556.987]},"A6":{"page":1,"rect":[69.6653,534.644,145.275,546.23]},"A7":{"page":1,"rect":[69.6653,524.059,145.275,535.645]},"A8":{"page":1,"rect":[69.6653,513.693,145.275,525.279]},"A9":{"page":1,"rect":[69.6653,502.718,145.275,514.304]},"A10":{"page":1,"rect":[69.6653,491.742,145.275,503.328]},"B1":{"page":1,"rect":[393.953,589.128,468.953,600.714]},"B2":{"page":1,"rect":[393.953,577.762,468.953,589.348]},"B3":{"page":1,"rect":[393.953,567.396,468.953,578.982]},"B4":{"page":1,"rect":[393.953,556.421,468.953,568.007]},"B5":{"page":1,"rect":[393.953,545.835,468.953,557.421]},"B6":{"page":1,"rect":[393.953,535.078,468.953,546.664]},"B7":{"page":1,"rect":[393.953,524.493,468.953,536.079]},"B8":{"page":1,"rect":[393.953,514.127,468.953,525.713]},"B9":{"page":1,"rect":[393.953,503.152,468.953,514.738]},"B10":{"page":1,"rect":[393.953,492.176,468.953,503.762]},"C1":{"page":1,"rect":[480.149,589.128,555.76,600.714]},"C2":{"page":1,"rect":[480.149,577.762,555.76,589.348]},"C3":{"page":1,"rect":[480.149,567.396,555.76,578.982]},"C4":{"page":1,"rect":[480.149,556.421,555.76,568.007]},"C5":{"page":1,"rect":[480.149,545.835,555.76,557.421]},"C6":{"page":1,"rect":[480.149,535.078,555.76,546.664]},"C7":{"page":1,"rect":[480.149,524.493,555.76,536.079]},"C8":{"page":1,"rect":[480.149,514.127,555.76,525.713]},"C9":{"page":1,"rect":[480.149,503.152,555.76,514.738]},"C10":{"page":1,"rect":[480.759,492.176,555.76,503.762]},"A11":{"page":1,"rect":[69.6653,480.738,145.275,493.821]},"BC11":{"page":1,"rect":[474.052,470.943,555.76,482.529]},"J12":{"page":1,"rect":[67.3973,431.939,143.008,443.525]},"J13":{"page":1,"rect":[67.3973,421.194,143.008,432.779]},"J14":{"page":1,"rect":[67.3973,410.119,143.008,421.705]},"J15":{"page":1,"rect":[94.1565,395.925,131.962,407.511]},"J16":{"page":1,"rect":[67.3973,378.211,143.008,389.797]},"M12":{"page":1,"rect":[471.785,431.939,553.492,443.525]},"M13":{"page":1,"rect":[471.785,421.194,553.492,432.779]},"M14":{"page":1,"rect":[471.785,410.609,553.492,422.195]},"M15":{"page":1,"rect":[506.049,393.486,543.855,407.511]},"M16":{"page":1,"rect":[471.785,378.211,553.492,389.797]}}};
const readSaved=String.raw`
import sys,json,re
from pypdf import PdfReader
from pypdf.generic import IndirectObject,DictionaryObject,ArrayObject,StreamObject,ContentStream
r=PdfReader(sys.argv[1],strict=True);assert len(r.pages)==2;assert not r.get_fields();assert '/AcroForm' not in r.trailer['/Root'];positions=json.loads(sys.argv[2]);seen=set();strings=[]
def walk(x):
 if isinstance(x,IndirectObject):
  key=(x.idnum,x.generation)
  if key in seen:return
  seen.add(key);v=x.get_object();assert v is not None,('unresolved',key);walk(v);return
 if isinstance(x,DictionaryObject):
  assert str(x.get('/Subtype',''))!='/Widget'
  for k,v in x.items():
   assert str(k) not in ['/JS','/JavaScript','/AA','/OpenAction'];walk(v)
  if isinstance(x,StreamObject):strings.append(x.get_data().decode('latin1','ignore'))
 elif isinstance(x,(list,ArrayObject)):
  for v in x:walk(v)
 elif isinstance(x,str):strings.append(x)
walk(r.trailer)
for gen,entries in r.xref.items():
 if gen!=65535:
  for oid in entries:
   if oid:walk(IndirectObject(oid,gen,r))
for oid in r.xref_objStm:walk(IndirectObject(oid,0,r))
texts=[p.extract_text() or '' for p in r.pages]
for t in texts:assert t.count('FOR REVIEW ONLY - NOT FOR FILING')==1
alltext='\n'.join(texts+strings)
for token in ['900-70-0411','900700411','900-70-0412','900700412','91-0000411','910000411','91-0000412','910000412','Fictional native complete married household sources']:
 assert token not in alltext,('private',token)
values={name:'' for name in positions}
def mul(a,b):return (a[0]*b[0]+a[1]*b[2],a[0]*b[1]+a[1]*b[3],a[2]*b[0]+a[3]*b[2],a[2]*b[1]+a[3]*b[3],a[4]*b[0]+a[5]*b[2]+b[4],a[4]*b[1]+a[5]*b[3]+b[5])
def bounds(box,m):
 x0,y0,x1,y1=map(float,box);pts=[(x*m[0]+y*m[2]+m[4],x*m[1]+y*m[3]+m[5])for x,y in [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]]
 return min(x for x,y in pts),min(y for x,y in pts),max(x for x,y in pts),max(y for x,y in pts)
for pi,page in enumerate(r.pages):
 def forms(content,resources,matrix,depth=0):
  assert depth<20;stack=[]
  for args,op in ContentStream(content,r).operations:
   if op==b'q':stack.append(matrix)
   elif op==b'Q':matrix=stack.pop()
   elif op==b'cm':matrix=mul(tuple(map(float,args)),matrix)
   elif op==b'Do':
    obj=resources['/XObject'][args[0]].get_object()
    if obj.get('/Subtype')!='/Form':continue
    actual=mul(tuple(map(float,obj.get('/Matrix',[1,0,0,1,0,0]))),matrix);left,bottom,right,top=bounds(obj['/BBox'],actual);matches=[]
    for name,pos in positions.items():
     x0,y0,x1,y1=pos['rect']
     if pos['page']==pi and left>=min(x0,x1)-.25 and right<=max(x0,x1)+.25 and bottom>=min(y0,y1)-.25 and top<=max(y0,y1)+.25:matches.append(name)
    if matches:
     text=re.sub(r'\s+','',''.join(page.extract_xform_text(obj)))
     if text:
      assert len(matches)==1,('ambiguous',matches);values[matches[0]]+=text
    else:forms(obj,obj.get('/Resources',resources),actual,depth+1)
 forms(page['/Contents'],page['/Resources'],(1,0,0,1,0,0))
print(json.dumps({'cells':values,'texts':texts,'objects':len(seen)}))
`;

const federalForms=[['f1040-filled.pdf',2],['f1040s1-filled.pdf',2],['f1040s2-filled.pdf',2],['f1040s3-filled.pdf',1],['f1040sc-filled.pdf',2],['f1040sd-filled.pdf',2]]as const;
type ActualOptions=FillReturnOptions&{paMarriedReview?:PreparedPAMarriedReturnReview};
function required<T>(value:T|undefined):T{if(value===undefined)throw Error('Actual fictional source required');return value;}
async function output(name:string){const retained=process.env.TAX_ENGINE_PA_MARRIED_DISPATCH_ARTIFACT_DIR;const path=retained?join(retained,name):await mkdtemp(join(tmpdir(),'pa-married-dispatch-'));await mkdir(path,{recursive:true});return{path,clean:async()=>{if(!retained)await rm(path,{recursive:true,force:true});}};}
function saved(path:string,positions:Record<string,Geometry>){return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',readSaved,path,JSON.stringify(positions)],{encoding:'utf8'}))as{cells:Record<string,string>;texts:string[];objects:number};}
it('PA married review baseline actual six original sources are already qualified privately',()=>{for(const row of cases){const f=paMarriedOfficialFixture(row.mode,row.name);expect(()=>preparePAMarriedReturnReview(f.input)).not.toThrow();expect(f.married.returns.map(v=>[v.accountHolder,v.pa40.compensation.toFixed(0),v.pa40.stateWithholding.toFixed(0),v.pa40.taxLiability.toFixed(0),v.scheduleSP.taxForgivenessCredit.toFixed(0),v.refundDisposition.refund.toFixed(0)])).toEqual(row.owners);expect(f.married.readiness.filingEligible).toBe(false);}});
it.each(cases)('PA married public review dispatch actual owned pages $mode $name',async row=>{
 const f=paMarriedOfficialFixture(row.mode,row.name),before=JSON.stringify(f),token=preparePAMarriedReturnReview(f.input),dir=await output(row.mode+'-'+row.name);
 try{const options:ActualOptions={purpose:'review',blankFormsDir:join(process.cwd(),'forms/blank'),outputDir:dir.path,flatten:true,useObjectStreams:false,pageOnlyTemporaryMerge:true,paMarriedReview:token,eicReview:hasEicReviewSources(f.input)?prepareEicReview(f.input):undefined};
 const result=await fillReturn(redactReviewIdentifiers(f.input),redactReviewIdentifiers(f.result),options),names=result.filledForms.map(path=>basename(path));
 expect(names.filter(n=>!n.startsWith('pa-'))).toEqual(federalForms.map(([name])=>name));
 const actualFederalPages=JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3',['-c',"import sys,json;from pypdf import PdfReader;print(json.dumps([len(PdfReader(path,strict=True).pages)for path in sys.argv[1:]]))",...federalForms.map(([name])=>join(dir.path,name))],{encoding:'utf8'}))as number[];expect(actualFederalPages).toEqual(federalForms.map(([,pages])=>pages));
 expect(names.filter(n=>n==='f1040-filled.pdf')).toHaveLength(1);expect(names.filter(n=>n.startsWith('pa-'))).toEqual(row.owners.flatMap(owner=>['pa-'+owner[0]+'-40-review.pdf',...(owner[4]!=='0'?['pa-'+owner[0]+'-sp-review.pdf']:[])]));expect(names).not.toContain('pa-40-filled.pdf');
 const federal=saved(join(dir.path,'f1040-filled.pdf'),{});expect(federal.objects).toBeGreaterThan(0);expect(federal.texts.join(' ')).not.toContain('originalTaxpayer');
 for(const[owner,wages,wh,tax,credit,refund]of row.owners){const actual=saved(join(dir.path,'pa-'+owner+'-40-review.pdf'),geometry.pa40);for(const[key,value]of Object.entries({'1a':wages,'1c':wages,'9':wages,'11':wages,'12':tax,'13':wh,'25':'0','27':'','29':refund,'30':refund,'31':'0','21':credit==='0'?'':credit}))expect(actual.cells[key],owner+' PA40 '+key).toBe(value);
 if(row.mode==='J'&&row.name==='cents')expect(actual.texts.join(' ')).toContain('PA does not issue refunds of $1 or less');
 if(credit!=='0'){const sp=saved(join(dir.path,'pa-'+owner+'-sp-review.pdf'),geometry.sp);for(const[key,value]of Object.entries({'12':tax,'13':'0','14':tax,'15':'0.90','16':credit}))expect(sp.cells[row.mode+key]).toBe(value);expect(sp.cells[row.mode==='J'?'A11':'BC11']).toBe('13001');}}
 expect(JSON.stringify(f)).toBe(before);for(const file of result.filledForms)expect((await readFile(file)).length).toBeGreaterThan(1000);
 }finally{await dir.clean();}
});
const invalid=['missing-token','forged-token','copied-token','equal-money-employer','owner-name','filing-mode','owner-cash','owner-order','election','stripped-input','stripped-result','legacy-ordinary-context','legacy-working-context']as const;
it.each(invalid)('PA married public review rejects before IO %s',async kind=>{
 const f=paMarriedOfficialFixture('M','shared-sp'),token=preparePAMarriedReturnReview(f.input),dir=await mkdtemp(join(tmpdir(),'pa-married-denial-')),destination=join(dir,'must-not-exist');
 const options:ActualOptions={blankFormsDir:'/missing-married-source-templates',outputDir:destination,paMarriedReview:token,eicReview:hasEicReviewSources(f.input)?prepareEicReview(f.input):undefined};
 if(kind==='missing-token')delete options.paMarriedReview;if(kind==='forged-token')options.paMarriedReview={}as PreparedPAMarriedReturnReview;if(kind==='copied-token')options.paMarriedReview={...token};
 if(kind==='equal-money-employer')required(f.input.w2s[0]).employer.name+=' actual new source';if(kind==='owner-name')f.input.taxpayer.primary.firstName+=' actual identity';if(kind==='filing-mode')f.sources.filingMode='J';
 if(kind==='owner-cash'){const owner=required(f.married.returns[0]);owner.pa40.stateWithholding=owner.pa40.stateWithholding.plus(1);}if(kind==='owner-order')f.married.returns.reverse();if(kind==='election')required(f.sources.dispositions[0]).refundRequested='1';if(kind==='stripped-input')delete f.input.paMarriedOrdinarySources;
 const result=kind==='stripped-result'?{...f.result,stateReturns:{}}:f.result;
 if(kind==='legacy-ordinary-context')options.paOrdinaryReview={}as NonNullable<FillReturnOptions['paOrdinaryReview']>;if(kind==='legacy-working-context')options.paWorkingCreditReview={}as NonNullable<FillReturnOptions['paWorkingCreditReview']>;
 try{let error:unknown;try{await fillReturn(redactReviewIdentifiers(f.input),redactReviewIdentifiers(result),options);}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(error).not.toBeInstanceOf(TypeError);expect(String(error)).toMatch(/source|prepared|context|packet|original|married|result/i);expect(String(error)).not.toMatch(/ENOENT|no such file/i);expect(await readdir(destination).catch(()=>[])).toEqual([]);}finally{await rm(dir,{recursive:true,force:true});}
});
it.each(['2026','filing']as const)('PA married public review retains mapping and filing denial %s',async kind=>{const f=paMarriedOfficialFixture('J','whole'),token=preparePAMarriedReturnReview(f.input);if(kind==='2026'){f.input.taxpayer.taxYear=2026;f.result.taxYear=2026;}const options:ActualOptions={purpose:kind==='filing'?'filing':'review',blankFormsDir:'/missing-married-source-templates',outputDir:'/not-an-output-married',paMarriedReview:token};await expect(fillReturn(f.input,f.result,options)).rejects.toThrow(/filing|2026|mapping/i);});
