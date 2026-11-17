// Spec: spec/browser/rrta-python-version-comparison.yaml
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {spawnSync} from 'node:child_process';
const load=()=>import('../../scripts/rrta-python-version-comparison/run.mjs');
test('exact-public-synthetic-inputs',async()=>{
 const {validateArtifact,validateInputs,assetHost,INPUTS}=await load();
 const a={id:14372125476,name:'container-runtime-evidence',size_in_bytes:459416206,expired:false,digest:'sha256:20d8d9e49a5f355aaf5f64d205c4b6300aac2334b535c12afc0616a8b88f7676',workflow_run:{id:44169011257,head_sha:'2fccaa27f2305e2f59db43a0067e19f4c631898f',repository_id:1199090938,head_repository_id:1199090938,head_branch:'main'}};
 assert.doesNotThrow(()=>validateArtifact(a));
 for(const delta of [{expired:true},{id:1},{digest:'sha256:'+'a'.repeat(64)},{size_in_bytes:999999999},{workflow_run:{...a.workflow_run,head_sha:'a'.repeat(40)}}])assert.throws(()=>validateArtifact({...a,...delta}));
 assert.doesNotThrow(()=>validateInputs(INPUTS));
 for(const edit of [x=>x.pdfs.reverse(),x=>x.pdfs[0].member='../foreign.pdf',x=>x.pdfs[0].expected.markersChecked=17,x=>x.markers.push('foreign')]){const x=globalThis.structuredClone(INPUTS);edit(x);assert.throws(()=>validateInputs(x));}
 assert.equal(assetHost('https://productionresultssa1.blob.core.windows.net/private?synthetic=1'),true);
 for(const url of ['http://productionresultssa1.blob.core.windows.net/x','https://evil.invalid/x','https://blob.core.windows.net.evil.invalid/x','https://u:p@productionresultssa1.blob.core.windows.net/x'])assert.equal(assetHost(url),false);
});
test('fixed-version-protocol',async()=>{
 const {schedule,childOptions,validOutput,validateVersions,INPUTS}=await load();const s=schedule();
 assert.equal(s.length,104);assert.equal(s.filter(x=>x.phase==='measured').length,96);
 for(const w of [1280,390])for(let b=0;b<12;b++)assert.equal(s.filter(x=>x.width===w&&x.block===b&&x.phase==='measured').map(x=>x.branch).join(''),'ABBA');
 const options=childOptions({PATH:'/bin',OPENAI_API_KEY:'synthetic-secret',GH_TOKEN:'synthetic-token',NODE_OPTIONS:'forbidden'},'[]');
 assert.equal(options.timeout,4000);assert.equal(options.maxBuffer,65536);assert.equal(options.killSignal,'SIGTERM');assert.ok(!JSON.stringify(options).includes('synthetic-secret'));assert.ok(!JSON.stringify(options).includes('synthetic-token'));
 const x=INPUTS.pdfs[0].expected;assert.equal(validOutput(JSON.stringify(x),x),true);
 for(const value of [{...x,extra:true},{...x,geometrySubstringExemptions:20},{...x,sha256:'a'.repeat(64)},'invalid'])assert.equal(validOutput(JSON.stringify(value),x),false);
 const common={implementation:'CPython',system:'Linux',machine:'x86_64',gilDisabled:false,jitEnabled:false,pypdf:'6.10.0',packageSha256:'a'.repeat(64)},v={A:{...common,version:'3.13.18'},B:{...common,version:'3.14.10'}};
 assert.doesNotThrow(()=>validateVersions(v));
 for(const delta of [{version:'3.14.6'},{gilDisabled:true},{gilDisabled:undefined},{jitEnabled:true},{machine:'aarch64'},{pypdf:'6.10.1'},{packageSha256:'b'.repeat(64)}])assert.throws(()=>validateVersions({...v,B:{...v.B,...delta}}));
});
test('failure-and-parity-hold',async()=>{
 const {schedule,assess}=await load();const records=schedule().map(x=>({...x,wallNs:x.branch==='A'?1000000000:800000000,passed:true,timeout:false}));
 assert.equal(assess(records,true).thresholdPassedBoth,true);
 assert.equal(assess(records.slice(1),true).status,'HOLD');assert.equal(assess(records,false).status,'HOLD');
 for(const change of [{passed:false},{timeout:true}]){const r=globalThis.structuredClone(records);Object.assign(r[7],change);assert.equal(assess(r,true).status,'HOLD');}
 const slow=records.map(x=>({...x,wallNs:1000000000}));assert.equal(assess(slow,true).thresholdPassedBoth,false);
 const swapped=globalThis.structuredClone(records);[swapped[5],swapped[6]]=[swapped[6],swapped[5]];assert.equal(assess(swapped,true).status,'HOLD');
});
test('actual bounded failed child retains only a fixed projection',async()=>{
 const {childOptions,projectAttempt,INPUTS}=await load(),began=process.hrtime.bigint();
 const r=spawnSync(process.execPath,['-e','process.stdout.write("SYNTHETIC-PRIVATE-OUTPUT");setInterval(()=>{},1000)'],childOptions(process.env,''));
 const wall=Number(process.hrtime.bigint()-began),safe=projectAttempt({branch:'A'},r,wall,INPUTS.pdfs[0].expected);
 assert.equal(safe.timeout,true);assert.equal(safe.passed,false);assert.ok(wall>=3900000000&&wall<7000000000);assert.ok(!JSON.stringify(safe).includes('SYNTHETIC-PRIVATE-OUTPUT'));
});
test('original fourth pipe carries phase metadata without uploading raw records',async()=>{
 const {childOptions,projectAttempt,INPUTS}=await load();
 const r=spawnSync('python3',['-I','-B','-c','import os;os.write(3,b"SYNTHETIC-PHASE-RECORD\\n")'],childOptions(process.env,''));
 assert.equal(r.status,0);assert.equal(r.output[3],'SYNTHETIC-PHASE-RECORD\n');
 const safe=projectAttempt({branch:'A'},r,1,INPUTS.pdfs[0].expected);assert.ok(!JSON.stringify(safe).includes('SYNTHETIC-PHASE-RECORD'));
 assert.deepEqual(childOptions(process.env,'').stdio,['pipe','pipe','pipe','pipe']);
});
test('actual compiler and build metadata omit raw sysconfig command paths',async()=>{
 const {childOptions,VERSION_PROBE}=await load();
 const wrapper=String.raw`import sys,types,tempfile,pathlib,sysconfig
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d)/'__init__.py';p.write_text('# synthetic module')
 m=types.ModuleType('pypdf');m.__file__=str(p);m.__version__='6.10.0';sys.modules['pypdf']=m
 original=sysconfig.get_config_var
 sysconfig.get_config_var=lambda k:'SYNTHETIC-PRIVATE/COMMAND/PATH'if k in ['CFLAGS','CONFIG_ARGS','CPPFLAGS','LDFLAGS']else original(k)
 exec(sys.stdin.read())`;
 const r=spawnSync('python3',['-I','-B','-c',wrapper],childOptions(process.env,VERSION_PROBE));assert.equal(r.status,0);assert.equal(r.stderr,'');
 const v=JSON.parse(r.stdout);assert.equal(typeof v.compiler,'string');assert.equal(v.build.length,2);assert.equal(Object.keys(v.sysconfigFlags).length,10);assert.equal(Object.keys(v.optionHashes).length,4);assert.ok(Object.values(v.optionHashes).every(x=>/^[a-f0-9]{64}$/u.test(x)));assert.ok(!r.stdout.includes('SYNTHETIC-PRIVATE/COMMAND/PATH'));
});
test('actual ZIP extractor refuses duplicate members and foreign paths',async()=>{
 const script=String.raw`import sys,importlib.util,tempfile,pathlib,zipfile,hashlib
s=importlib.util.spec_from_file_location('exact',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
raw=b'x'*509346; member='exact/synthetic.pdf';config={'pdfs':[{'width':1280,'member':member,'expected':{'bytes':509346,'sha256':hashlib.sha256(raw).hexdigest()}}]}
with tempfile.TemporaryDirectory(prefix='rrta-extract-control-') as d:
 p=pathlib.Path(d); z=p/'input.zip'
 with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as f:f.writestr(member,raw);f.writestr('../foreign',b'not-extracted')
 m.extract(z,p,config);assert(p/'actual-1280.pdf').read_bytes()==raw;assert not(p/'foreign').exists();(p/'actual-1280.pdf').unlink()
 with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as f:f.writestr(member,raw);f.writestr(member,raw)
 try:m.extract(z,p,config);raise RuntimeError('duplicate accepted')
 except AssertionError:pass
 assert not(p/'actual-1280.pdf').exists()
print('PASS')`;
 const file=new URL('../../scripts/rrta-python-version-comparison/extract.py',import.meta.url);
 const r=spawnSync('python3',['-I','-B','-W','ignore','-c',script,file.pathname],{encoding:'utf8',timeout:4000,maxBuffer:65536});assert.equal(r.status,0);assert.equal(r.stdout.trim(),'PASS');assert.equal(r.stderr,'');
});
test('standalone-private-workspace',async()=>{
 const text=await readFile(new URL('../../.github/workflows/rrta-python-version-comparison.yml',import.meta.url),'utf8');
 for(const value of ['workflow_dispatch:','timeout-minutes: 20','timeout-minutes: 16','actions: read','retention-days: 3','github.run_id','artifacts/rrta-python-versions/*.json',"python-version: '3.13.18'","python-version: '3.14.10'"])assert.ok(text.includes(value),value);
 assert.ok(!/\n {2}(?:push|pull_request):|continue-on-error:|secrets\./u.test(text));
});
