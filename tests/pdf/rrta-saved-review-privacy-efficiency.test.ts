/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-bounded-per-invocation-reuse and #saved-pdf-safe-child-failure-categories. */
import {afterEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PDFDocument,PDFHexString,PDFName} from 'pdf-lib';
import {inspectSavedPrivacy,parseSavedPrivacyPhases} from '../../apps/web/tests/helpers/rrta-paper-review-fixture';
vi.mock('node:child_process',async importOriginal=>({...await importOriginal<typeof import('node:child_process')>(),spawnSync:vi.fn()}));
afterEach(()=>vi.mocked(spawnSync).mockReset());
const expected={sha256:'a'.repeat(64),bytes:100,pages:4};
const good={schemaVersion:1,status:'PASS',...expected,markersChecked:1,geometrySubstringExemptions:0,scope:'full-graph-typed-content'};
const privateSentinel='PRIVATE_ERROR_STREAM_IDENTIFIER_SENTINEL';
const child=(v:Record<string,unknown>={})=>({pid:1,output:[],stdout:JSON.stringify(good),stderr:'',status:0,signal:null,...v})as unknown as ReturnType<typeof spawnSync>;
const cases:Array<[string,ReturnType<typeof spawnSync>]>=[
 ['timeout',child({error:Object.assign(new Error(privateSentinel),{code:'ETIMEDOUT'})})],
 ['spawn',child({error:Object.assign(new Error(privateSentinel),{code:privateSentinel})})],
 ['signal',child({status:null,signal:'SIGTERM'})],['exit',child({status:2})],
 ['stderr',child({stderr:privateSentinel})],['output',child({stdout:' '.repeat(65537)})],
 ['output',child({stdout:null})],['json',child({stdout:'not-json-'+privateSentinel})],
 ['projection',child({stdout:JSON.stringify({...good,privateSentinel})})],
];
const pySource=fileURLToPath(new URL('../../apps/web/tests/helpers/rrta-paper-review-privacy.py',import.meta.url));
const python=process.env.TAX_ENGINE_PDF_TEST_PYTHON??'python3';
async function sample(foreignResource:boolean|'missing'=false,encodedMarker?:string,cycle=false){
 const doc=await PDFDocument.create();
 if(foreignResource){
  const clean=doc.context.register(doc.context.flateStream('q Q',{Type:'XObject',Subtype:'Form',BBox:[0,0,200,200],Resources:{}}));
  const bad=doc.context.register(doc.context.flateStream('BT (111111111) Tj ET',{Type:'XObject',Subtype:'Form',BBox:[0,0,200,200],Resources:{}}));
  const sharedStream=doc.context.flateStream('/Child Do',{Type:'XObject',Subtype:'Form',BBox:[0,0,200,200]}),shared=doc.context.register(sharedStream);
  if(cycle)sharedStream.dict.set(PDFName.of('Resources'),doc.context.obj({XObject:{Child:shared}}));
  for(let i=0;i<4;i++){const p=doc.addPage([200,200]);p.node.set(PDFName.of('Resources'),doc.context.obj({XObject:foreignResource==='missing'&&i===1?{Root:shared}:{Root:shared,Child:foreignResource==='missing'?clean:i===1?bad:clean}}));p.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream('/Root Do')));}
 }else for(let i=0;i<4;i++){const p=doc.addPage([200,200]);p.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(encodedMarker===undefined?'q Q':`BT ${PDFHexString.fromText(encodedMarker).toString()} Tj ET`)));}
 return Buffer.from(await doc.save({useObjectStreams:false})).toString('base64');
}
const probe=String.raw`import importlib.util,sys,json,base64
s=importlib.util.spec_from_file_location('bounded_privacy_probe',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
p=json.loads(sys.stdin.read());raw=base64.b64decode(p['pdf']);markers=p['markers'];old=m.parse_content;calls=0
def counted(data,reader):
 global calls
 calls+=1
 return old(data,reader)
m.parse_content=counted
if p.get('fallback')=='bytes':m.PARSE_CACHE_BYTES=0
if p.get('fallback')=='entries':m.PARSE_CACHE_ENTRIES=0
if 'operandLimit' in p:m.OPERAND_CACHE_ENTRIES=p['operandLimit']
operand_calls=0
def count_operand(frame,event,arg):
 global operand_calls
 if event=='call' and frame.f_code.co_name=='argscan':operand_calls+=1
if p.get('countOperands'):sys.setprofile(count_operand)
results=[]
for i in range(p['inspections']):
 try:results.append(m.inspect(raw,p.get('markerSets',[markers]*p['inspections'])[i])['status'])
 except m.Deny as e:results.append('DENY:'+str(e))
sys.setprofile(None)
out={'results':results,'parseCalls':calls}
if p.get('countOperands'):out['operandCalls']=operand_calls
print(json.dumps(out))`;
async function runProbe(data:{pdf:string;markers:string[];inspections:number;fallback?:'bytes'|'entries';countOperands?:boolean;operandLimit?:number;markerSets?:string[][]}){
 const real=await vi.importActual<typeof import('node:child_process')>('node:child_process');
 const r=real.spawnSync(python,['-I','-B','-c',probe,pySource],{input:JSON.stringify(data),encoding:'utf8',timeout:4000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'}});
 expect(r.error).toBeUndefined();expect(r.status).toBe(0);expect(r.signal).toBeNull();expect(r.stderr).toBe('');return JSON.parse(r.stdout)as{results:string[];parseCalls:number;operandCalls?:number};
}
describe('Spec guided-rrta-paper-browser bounded parser reuse and safe categories',()=>{
 it.each(cases)('classifies bounded child failure %s without raw data',(category,value)=>{
  vi.mocked(spawnSync).mockReturnValue(value);let message='';try{inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected);}catch(e){message=(e as Error).message;}
  expect(message).toBe(`Bounded saved-PDF privacy inspection failed [${category}]`);expect(message).not.toContain(privateSentinel);
  const opts=vi.mocked(spawnSync).mock.calls[0]?.[2]as{timeout:number;maxBuffer:number};expect(opts.timeout).toBe(4000);expect(opts.maxBuffer).toBe(65536);
 });
 it('classifies a thrown spawn without raw data',()=>{vi.mocked(spawnSync).mockImplementation(()=>{throw Error(privateSentinel);});expect(()=>inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected)).toThrow('Bounded saved-PDF privacy inspection failed [spawn]');});
 it('reuses only identical parser bytes within one inspection and retains full fallback',async()=>{
  const pdf=await sample(),markers=['111111111','標記','é'];
  expect(await runProbe({pdf,markers,inspections:2})).toEqual({results:['PASS','PASS'],parseCalls:2});
  for(const fallback of ['bytes','entries']as const)expect(await runProbe({pdf,markers,inspections:2,fallback})).toEqual({results:['PASS','PASS'],parseCalls:8});
 });
 it('reuses only successfully scanned immutable operands within one inspection and retains full fallback',async()=>{
  const doc=await PDFDocument.create();
  for(let i=0;i<4;i++){const page=doc.addPage([200,200]);page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(i%2===0?'q Q':'q q Q Q')));}
  const pdf=Buffer.from(await doc.save({useObjectStreams:false})).toString('base64'),data={pdf,markers:['111111111'],inspections:2,countOperands:true};
  expect(await runProbe(data)).toEqual({results:['PASS','PASS'],parseCalls:4,operandCalls:12});
  expect(await runProbe({...data,operandLimit:1})).toEqual({results:['PASS','PASS'],parseCalls:4,operandCalls:20});
  expect(await runProbe({...data,operandLimit:0})).toEqual({results:['PASS','PASS'],parseCalls:4,operandCalls:24});
  expect(await runProbe({...data,fallback:'entries'})).toEqual({results:['PASS','PASS'],parseCalls:8,operandCalls:24});
 });
 it('does not reuse an operand verdict across inspections with changed markers',async()=>{
  const r=await runProbe({pdf:await sample(false,'é'),markers:['111111111'],markerSets:[['111111111'],['é']],inspections:2,countOperands:true});
  expect(r.results).toEqual(['PASS','DENY:private-marker']);expect(r.parseCalls).toBe(2);
 });
 it.each(['é','標記','١١١١١١١١١','𝟙𝟙𝟙'])('retains encoded non-ASCII marker denial for %s',async marker=>{expect((await runProbe({pdf:await sample(false,marker),markers:[marker],inspections:1})).results).toEqual(['DENY:private-marker']);});
 it('retains cycle denial for repeated identical syntax',async()=>{expect((await runProbe({pdf:await sample(true,undefined,true),markers:['111111111'],inspections:1})).results).toEqual(['DENY:content-cycle']);});
 it('revalidates missing Do resources independently for identical parser bytes',async()=>{expect((await runProbe({pdf:await sample('missing'),markers:['111111111'],inspections:1})).results).toEqual(['DENY:Do-resource']);});
 it('revalidates each resource context despite repeated identical operator bytes',async()=>{const r=await runProbe({pdf:await sample(true),markers:['111111111'],inspections:1});expect(r.results).toEqual(['DENY:private-marker']);});
});

it('records safe phase evidence on the original timeout without forwarding raw child data',()=>{
 const info=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  const phases=JSON.stringify({v:1,seq:0,phase:'module_started',wallUs:0,cpuUs:0})+'\n';
  vi.mocked(spawnSync).mockReturnValue(child({error:Object.assign(new Error(privateSentinel),{code:'ETIMEDOUT'}),output:[null,privateSentinel,privateSentinel,phases]}));
  expect(()=>inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected)).toThrow('Bounded saved-PDF privacy inspection failed [timeout]');
  expect(info).toHaveBeenCalledOnce();const line=String(info.mock.calls[0]?.[0]);expect(line).not.toContain(privateSentinel);expect(line.startsWith('RRTA_PDF_PHASE ')).toBe(true);const record=JSON.parse(line.slice('RRTA_PDF_PHASE '.length));expect(record).toMatchObject({schemaVersion:1,status:'VALID_PREFIX',category:'timeout',phases:[{v:1,seq:0,phase:'module_started',wallUs:0,cpuUs:0}]});
  const opts=vi.mocked(spawnSync).mock.calls[0]?.[2]as{timeout:number;maxBuffer:number;stdio:string[]};expect(opts.timeout).toBe(4000);expect(opts.maxBuffer).toBe(65536);expect(opts.stdio).toEqual(['pipe','pipe','pipe','pipe']);
 }finally{info.mockRestore();}
});

/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-optional-phase-telemetry. */
const phaseNames=['module_started','imports_ready','inspection_entered','content_contexts','operand_strings','raw_graph','page_text','complete'];
const phaseRows=phaseNames.map((phase,seq)=>({v:1,seq,phase,wallUs:seq*20,cpuUs:seq*10}));
const wire=(rows:unknown[]=phaseRows)=>rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
it('accepts only complete bounded ordered diagnostic prefixes',()=>{
 for(let i=1;i<=8;i++){const rows=phaseRows.slice(0,i);expect(parseSavedPrivacyPhases(wire(rows))).toEqual(rows);expect(parseSavedPrivacyPhases(Buffer.from(wire(rows)))).toEqual(rows);}
});
it('rejects malformed telemetry wholly rather than forwarding a valid prefix',()=>{
 const[first,second]=phaseRows;if(!first||!second)throw Error('Synthetic phase fixture missing');
 const invalid:unknown[]=[undefined,null,{},Buffer.from([255]),'',wire().slice(0,-1),wire()+'truncated',wire()+'\n',' '.repeat(2049),wire([...phaseRows,first]),wire([first,first]),wire([second]),wire([{...first,extra:privateSentinel}]),wire([{...first,phase:privateSentinel}]),wire([{...first,v:2}]),wire([{...first,seq:0.5}]),wire([{...first,wallUs:-1}]),wire([{...first,cpuUs:0.5}]),wire([{...first,cpuUs:10000001}]),wire([{...first,wallUs:Infinity}]),wire([{...first,wallUs:NaN}]),wire([{...first,wallUs:2},{...second,wallUs:1}]),wire([{...first,cpuUs:2},{...second,cpuUs:1}]),wire([first])+privateSentinel+'\n',wire([{...first,phase:'é'}]),'{"v":1,"v":1,"seq":0,"phase":"module_started","wallUs":0,"cpuUs":0}\n'];
 for(const raw of invalid)expect(parseSavedPrivacyPhases(raw)).toBeNull();
});
it('keeps malformed or absent diagnostic bytes nonverdict and success silent',()=>{
 const info=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{for(const raw of [undefined,privateSentinel,wire()+'broken']){
  vi.mocked(spawnSync).mockReturnValue(child({output:[null,null,null,raw]}));expect(inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected)).toEqual(good);expect(info).not.toHaveBeenCalled();
  vi.mocked(spawnSync).mockReturnValue(child({status:2,output:[null,privateSentinel,privateSentinel,raw]}));expect(()=>inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected)).toThrow('Bounded saved-PDF privacy inspection failed [exit]');
  const line=String(info.mock.calls.at(-1)?.[0]);expect(line).not.toContain(privateSentinel);expect(JSON.parse(line.slice('RRTA_PDF_PHASE '.length))).toMatchObject({status:'UNAVAILABLE',category:'exit',phases:[]});info.mockClear();
 }}finally{info.mockRestore();}
});
it('retains child error authority even with complete valid telemetry and failed logging',()=>{
 const info=vi.spyOn(console,'info').mockImplementation(()=>{throw Error(privateSentinel);});
 try{vi.mocked(spawnSync).mockReturnValue(child({error:Object.assign(Error(privateSentinel),{code:'ENOBUFS'}),output:[null,null,null,wire()]}));expect(()=>inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected)).toThrow('Bounded saved-PDF privacy inspection failed [spawn]');}finally{info.mockRestore();}
});
it('emits only fixed phase evidence through FD3 while standalone and missing FD preserve results',async()=>{
 const real=await vi.importActual<typeof import('node:child_process')>('node:child_process'),dir=await mkdtemp(join(tmpdir(),'rrta-phase-'));
 try{const path=join(dir,'synthetic.pdf');await writeFile(path,Buffer.from(await sample(),'base64'));
  const options={input:JSON.stringify(['111111111']),encoding:'utf8' as const,timeout:4000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'}};
  const enabled=real.spawnSync(python,['-I','-B',pySource,path,'--phase-fd3'],{...options,stdio:['pipe','pipe','pipe','pipe']});expect(enabled.error).toBeUndefined();expect(enabled.status).toBe(0);expect(enabled.stderr).toBe('');
  const rows=parseSavedPrivacyPhases(enabled.output[3]);expect(rows?.map(row=>row.phase)).toEqual(phaseNames);expect(Object.keys(JSON.parse(enabled.stdout))).toHaveLength(8);expect(JSON.stringify(rows)).not.toContain('111111111');
  for(const args of [[pySource,path],[pySource,path,'--phase-fd3']]){const disabled=real.spawnSync(python,['-I','-B',...args],options);expect(disabled.error).toBeUndefined();expect(disabled.status).toBe(0);expect(disabled.stderr).toBe('');expect(JSON.parse(disabled.stdout)).toEqual(JSON.parse(enabled.stdout));}
  const noFlag=real.spawnSync(python,['-I','-B',pySource,path],{...options,stdio:['pipe','pipe','pipe','pipe']});expect(noFlag.error).toBeUndefined();expect(noFlag.status).toBe(0);expect(noFlag.output[3]).toBe('');
 }finally{await rm(dir,{recursive:true,force:true});}
});

/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-telemetry-literal-wire-grammar. */
it.each([
 ['version','{"\\u0076":"'+privateSentinel+'","v":1,"seq":0,"phase":"module_started","wallUs":0,"cpuUs":0}\n'],
 ['phase','{"v":1,"seq":0,"\\u0070hase":"'+privateSentinel+'","phase":"module_started","wallUs":0,"cpuUs":0}\n'],
])('rejects escaped duplicate diagnostic keys through the actual failure wrapper: %s',(_name,raw)=>{
 const info=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{vi.mocked(spawnSync).mockReturnValue(child({error:Object.assign(Error(privateSentinel),{code:'ETIMEDOUT'}),output:[null,privateSentinel,privateSentinel,raw]}));
  expect(()=>inspectSavedPrivacy('synthetic-unused.pdf',['111111111'],expected)).toThrow('Bounded saved-PDF privacy inspection failed [timeout]');
  expect(info).toHaveBeenCalledOnce();const line=String(info.mock.calls[0]?.[0]);expect(line).not.toContain(privateSentinel);expect(JSON.parse(line.slice('RRTA_PDF_PHASE '.length))).toMatchObject({status:'UNAVAILABLE',category:'timeout',phases:[]});expect(parseSavedPrivacyPhases(raw)).toBeNull();
 }finally{info.mockRestore();}
});
it('rejects all escaped wire spellings including an otherwise known phase enum',()=>{
 const escaped=[String.raw`{"v":1,"seq":0,"phase":"module\u005fstarted","wallUs":0,"cpuUs":0}`,String.raw`{"\u0076":1,"seq":0,"phase":"module_started","wallUs":0,"cpuUs":0}`,String.raw`{"v":1,"seq":0,"phase":"module_started","wallUs":0,"cpuUs":0,"extra":"\\"}`];
 for(const raw of escaped)expect(parseSavedPrivacyPhases(raw+'\n')).toBeNull();
});
it('retains supported ASCII spaces and safe integer values without changing numeric grammar',()=>{
 const raw=' { "v" : 1.0, "seq" : -0, "phase" : "module_started", "wallUs" : 1e2, "cpuUs" : 1.0 } \n';
 expect(parseSavedPrivacyPhases(raw)).toEqual([{v:1,seq:0,phase:'module_started',wallUs:100,cpuUs:1}]);
 for(const n of [-1,0.5,10000001,Number.MAX_SAFE_INTEGER])expect(parseSavedPrivacyPhases(wire([{...phaseRows[0],wallUs:n}]))).toBeNull();
});
