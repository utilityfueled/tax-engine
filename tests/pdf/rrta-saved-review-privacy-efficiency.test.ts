/** Spec: federal/guided-rrta-paper-browser.yaml#saved-pdf-bounded-per-invocation-reuse and #saved-pdf-safe-child-failure-categories. */
import {afterEach,describe,expect,it,vi} from 'vitest';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {PDFDocument,PDFHexString,PDFName} from 'pdf-lib';
import {inspectSavedPrivacy} from '../../apps/web/tests/helpers/rrta-paper-review-fixture';
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
results=[]
for i in range(p['inspections']):
 try:results.append(m.inspect(raw,markers)['status'])
 except m.Deny as e:results.append('DENY:'+str(e))
print(json.dumps({'results':results,'parseCalls':calls}))`;
async function runProbe(data:{pdf:string;markers:string[];inspections:number;fallback?:'bytes'|'entries'}){
 const real=await vi.importActual<typeof import('node:child_process')>('node:child_process');
 const r=real.spawnSync(python,['-I','-B','-c',probe,pySource],{input:JSON.stringify(data),encoding:'utf8',timeout:4000,maxBuffer:65536,env:{PATH:process.env.PATH??'/usr/bin:/bin'}});
 expect(r.error).toBeUndefined();expect(r.status).toBe(0);expect(r.signal).toBeNull();expect(r.stderr).toBe('');return JSON.parse(r.stdout)as{results:string[];parseCalls:number};
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
 it.each(['é','標記','١١١١١١١١١','𝟙𝟙𝟙'])('retains encoded non-ASCII marker denial for %s',async marker=>{expect((await runProbe({pdf:await sample(false,marker),markers:[marker],inspections:1})).results).toEqual(['DENY:private-marker']);});
 it('retains cycle denial for repeated identical syntax',async()=>{expect((await runProbe({pdf:await sample(true,undefined,true),markers:['111111111'],inspections:1})).results).toEqual(['DENY:content-cycle']);});
 it('revalidates missing Do resources independently for identical parser bytes',async()=>{expect((await runProbe({pdf:await sample('missing'),markers:['111111111'],inspections:1})).results).toEqual(['DENY:Do-resource']);});
 it('revalidates each resource context despite repeated identical operator bytes',async()=>{const r=await runProbe({pdf:await sample(true),markers:['111111111'],inspections:1});expect(r.results).toEqual(['DENY:private-marker']);});
});
