/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-exact-name-success-reuse. */
import {expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PDFDocument,PDFName} from 'pdf-lib';
const scanner=fileURLToPath(new URL('../../apps/web/tests/helpers/rrta-paper-review-privacy.py',import.meta.url));
const python=process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3';
const probe=String.raw`import ast,importlib.util,json,sys,base64
s=importlib.util.spec_from_file_location('actual_name_verdict_test',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=json.loads(sys.stdin.read());old=m.require;checks=[];seen=set();longchecks=0
if 'capacity' in p:m.NAME_CACHE_ENTRIES=p['capacity']
def count(value,code):
 global longchecks
 f=sys._getframe(1)
 if code=='private-marker' and f.f_code.co_name=='scan_string' and type(f.f_locals['value']) is m.NameObject:
  text=f.f_locals['s'];checks.append(text);seen.add(text)
  if len(text)>512:longchecks+=1
 return old(value,code)
m.require=count
if p.get('mode')=='types':
 tree=ast.parse(open(sys.argv[1]).read());fn=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name=='scan_string');g=dict(vars(m));g.update({'markers':['PRIVATE'], 'names_scanned':set()});byte_calls=[]
 def scan_bytes(data,label,spans=()):
  byte_calls.append(label)
  if b'PRIVATE' in data:raise m.Deny('private-marker')
 g['scan_bytes']=scan_bytes;exec(compile(ast.Module(body=[fn],type_ignores=[]),sys.argv[1],'exec'),g);scan=g['scan_string'];results=[]
 def attempt(v):
  try:scan(v);results.append('PASS')
  except m.Deny:results.append('DENY')
 attempt(m.NameObject('/PRIVATE'));attempt(m.NameObject('/PRIVATE'))
 attempt(m.NameObject('/Safe'));attempt(m.NameObject('/Safe'))
 text=m.TextStringObject('/Safe');text._original_bytes=b'PRIVATE';attempt(text)
 attempt(m.ByteStringObject(b'PRIVATE'))
 class ChangingName(m.NameObject):
  def __str__(self):return '/Safe' if not getattr(self,'used',False) else '/PRIVATE'
 v=ChangingName('/Safe');attempt(v);v.used=True;attempt(v)
 for _ in range(3):attempt(m.NameObject('/'+('x'*512)))
 print(json.dumps({'results':results,'longChecks':longchecks,'textOriginalBytesChecked':'string' in byte_calls}));sys.exit(0)
raw=base64.b64decode(p['pdf']);rows=[]
for markers in p.get('markerSets',[['PRIVATE']]):
 checks.clear();seen.clear();longchecks=0
 try:status=m.inspect(raw,markers)['status']
 except m.Deny:status='DENY'
 rows.append({'status':status,'nameChecks':len(checks),'uniqueNames':len(seen),'longChecks':longchecks})
print(json.dumps(rows))`;
function run(data:Record<string,unknown>){
 const child=spawnSync(python,['-I','-B','-c',probe,scanner],{input:JSON.stringify(data),encoding:'utf8',timeout:4000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'}});
 expect(child.error).toBeUndefined();expect(child.status).toBe(0);expect(child.signal).toBeNull();expect(child.stderr).toBe('');return JSON.parse(child.stdout);
}
async function document(long=false,injection=false){
 const doc=await PDFDocument.create();
 for(let i=0;i<4;i++){const page=doc.addPage([200,200]);page.node.set(PDFName.of('RepeatedKey'),PDFName.of(injection?'PRIVATE':long?'x'.repeat(512):'RepeatedOriginal'));page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream('q Q')));}
 return Buffer.from(await doc.save({useObjectStreams:false})).toString('base64');
}
it('reuses only complete successful exact NameObject checks within one inspection',async()=>{
 const [r]=run({pdf:await document()});expect(r.status).toBe('PASS');expect(r.nameChecks).toBeGreaterThan(0);expect(r.nameChecks).toBe(r.uniqueNames);
});
it('retains zero and one-entry capacity fallbacks without rejecting valid PDF data',async()=>{
 const pdf=await document(),[normal]=run({pdf}),[zero]=run({pdf,capacity:0}),[one]=run({pdf,capacity:1});
 expect([normal.status,zero.status,one.status]).toEqual(['PASS','PASS','PASS']);expect(zero.nameChecks).toBeGreaterThan(normal.nameChecks);expect(one.nameChecks).toBeGreaterThan(normal.nameChecks);expect(one.nameChecks).toBeLessThanOrEqual(zero.nameChecks);
});
it('starts new marker closures on every inspection and preserves hidden-name injection denial',async()=>{
 const pdf=await document();const rows=run({pdf,markerSets:[['PRIVATE'],['RepeatedOriginal'],['PRIVATE']]});expect(rows.map((r:{status:string})=>r.status)).toEqual(['PASS','DENY','PASS']);expect(rows[0].nameChecks).toBe(rows[2].nameChecks);expect(run({pdf:await document(false,true)})[0].status).toBe('DENY');
});
it('preserves long-name full checks and never treats text byte or subclass values as cached names',()=>{
 const result=run({mode:'types'});expect(result.results).toEqual(['DENY','DENY','PASS','PASS','DENY','DENY','PASS','DENY','PASS','PASS','PASS']);expect(result.longChecks).toBe(3);expect(result.textOriginalBytesChecked).toBe(true);
});
it('keeps over512-character actual PDF names on the original successful full-scan path',async()=>{
 const [r]=run({pdf:await document(true)});expect(r.status).toBe('PASS');expect(r.longChecks).toBeGreaterThan(1);
});

it('does not bypass active-content keys after an equal safe NameObject value was seen',async()=>{
 const doc=await PDFDocument.create();for(let i=0;i<4;i++){const page=doc.addPage([200,200]);page.node.set(PDFName.of('RepeatedKey'),PDFName.of('OpenAction'));page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream('q Q')));}
 doc.catalog.set(PDFName.of('OpenAction'),PDFName.of('HarmlessValue'));const pdf=Buffer.from(await doc.save({useObjectStreams:false})).toString('base64');expect(run({pdf})[0].status).toBe('DENY');
});
