// Spec: spec/ops/sqlite-runtime-consumers.yaml
import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,URL} from 'node:url';
const url=new URL('../../scripts/sqlite-runtime-consumers.mjs',import.meta.url);
test('physical tar headers bound metadata before logical parsing',async()=>{
 const helper=fileURLToPath(new URL('../../infra/sqlite-runtime-consumers/inspect.py',import.meta.url));
 const program=String.raw`import importlib.util,io,pathlib,tarfile,tempfile
s=importlib.util.spec_from_file_location('probe',${JSON.stringify(helper)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory()as d:
 p=pathlib.Path(d)/'root.tar'
 with tarfile.open(p,'w',format=tarfile.PAX_FORMAT)as t:
  i=tarfile.TarInfo('payload');i.size=1;i.pax_headers={'comment':'x'*65537};t.addfile(i,io.BytesIO(b'x'))
 try:m.preflight_tar(p)
 except AssertionError:pass
 else:raise AssertionError('oversized PAX admitted')
 def header(kind,size):
  i=tarfile.TarInfo('metadata');i.type=kind;i.size=size;return i.tobuf()
 for raw in [header(b'L',4097)+bytes(4608)+bytes(1024),header(b'x',0)*17+bytes(1024),(header(b'g',65536)+bytes(65536)+header(b'0',0))*257+bytes(1024),header(b'0',513)+bytes(512),header(b'S',0)+bytes(1024),bytes(1024)+b'x']:
  p.write_bytes(raw)
  try:m.preflight_tar(p)
  except AssertionError:pass
  else:raise AssertionError('invalid physical archive admitted')
 with tarfile.open(p,'w',format=tarfile.PAX_FORMAT)as t:
  i=tarfile.TarInfo('payload');i.size=1;i.pax_headers={'comment':'bounded'};t.addfile(i,io.BytesIO(b'x'))
 m.preflight_tar(p)
print('physical metadata controls passed')`;
 const r=spawnSync('python3',['-I','-B','-c',program],{encoding:'utf8',timeout:5000,maxBuffer:65536});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'physical metadata controls passed');
});
test('pure ELF parser bounds dynamic and string tables',async()=>{
 const helper=fileURLToPath(new URL('../../infra/sqlite-runtime-consumers/inspect.py',import.meta.url));
 const program=String.raw`import importlib.util,pathlib,tempfile,struct
s=importlib.util.spec_from_file_location('probe',${JSON.stringify(helper)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
with tempfile.TemporaryDirectory()as d:
 p=pathlib.Path(d)/'payload'
 for bits,endian in [(64,'<'),(64,'>'),(32,'<'),(32,'>')]:
  raw=bytearray(512);ident=b'\x7fELF'+bytes([2 if bits==64 else 1,1 if endian=='<'else 2,1])+bytes(9)
  h='16sHHIQQQIHHHHHH'if bits==64 else'16sHHIIIIIHHHHHH';hs=64 if bits==64 else 52;ps=56 if bits==64 else 32;ds=16 if bits==64 else 8
  struct.pack_into(endian+h,raw,0,ident,3,62 if bits==64 else 3,1,0,hs,0,0,hs,ps,2,0,0,0)
  def ph(at,kind,offset,address,size):
   values=(kind,4,offset,address,address,size,size,1)if bits==64 else(kind,offset,address,address,size,size,4,1)
   struct.pack_into(endian+('IIQQQQQQ'if bits==64 else'IIIIIIII'),raw,at,*values)
  ph(hs,1,0,4096,len(raw));ph(hs+ps,2,192,4288,ds*5)
  strings=b'\0libsqlite3.so.0\0libprovider.so.1\0';raw[384:384+len(strings)]=strings
  def dyn(target,index,tag,value):struct.pack_into(endian+('qQ'if bits==64 else'iI'),target,192+index*ds,tag,value)
  for i,(tag,val)in enumerate([(5,4480),(10,len(strings)),(1,1),(14,strings.index(b'libprovider')),(0,0)]):dyn(raw,i,tag,val)
  p.write_bytes(raw);assert m.read_dynamic(p)=={'needed':['libsqlite3.so.0'],'soname':'libprovider.so.1'}
  bads=[raw[:hs+ps]]
  for index,tag,value in [(4,1,1),(0,5,999999),(1,10,17*1024**2),(2,1,len(strings)),(3,5,4480)]:
   bad=bytearray(raw);dyn(bad,index,tag,value);bads.append(bad)
  bad=bytearray(raw);bad[384:384+len(strings)]=b'x'*len(strings);bads.append(bad)
  for bad in bads:
   p.write_bytes(bad)
   try:m.read_dynamic(p)
   except (AssertionError,ValueError,struct.error):pass
   else:raise AssertionError('malformed ELF admitted')
source=pathlib.Path(${JSON.stringify(helper)}).read_text();assert 'subprocess'not in source
print('pure parser controls passed')`;
 const r=spawnSync('python3',['-I','-B','-c',program],{encoding:'utf8',timeout:5000,maxBuffer:65536});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'pure parser controls passed');
});
test('fixed image and source bindings',async()=>{
 const {validateBase,INDEX,PLATFORM}=await import(url);
 const compose=`image: postgres:16.16-bookworm@${INDEX}`;
 const manifest={postgres:{repository:'docker.io/library/postgres:16.16-bookworm',index:INDEX,platforms:{amd64:{digest:PLATFORM}}}};
 assert.equal(validateBase(compose,manifest),`docker.io/library/postgres@${PLATFORM}`);
 for(const value of [compose.replace('16.16','16.15'),compose+'\n'+compose,compose.replace(INDEX,'sha256:'+'0'.repeat(64))])assert.throws(()=>validateBase(value,manifest));
 assert.throws(()=>validateBase(compose,{postgres:{...manifest.postgres,platforms:{amd64:{digest:'sha256:'+'0'.repeat(64)}}}}));
});
test('never-started container contract',async()=>{
 const {validateContainer}=await import(url),image='sha256:'+'a'.repeat(64),operation='synthetic-owned';
 const value={Image:image,Config:{Labels:{'io.vivalatax.qualification.operation':operation}},State:{Status:'created',Running:false,ExitCode:0,OOMKilled:false,Error:''},HostConfig:{NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges']},Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]};
 assert.equal(validateContainer(value,image,operation),true);
 for(const mutate of [v=>v.Image='foreign',v=>v.State.Status='exited',v=>v.State.Running=true,v=>v.Config.Labels={},v=>v.HostConfig.NetworkMode='bridge',v=>v.HostConfig.CapDrop=null,v=>v.HostConfig.Privileged=true,v=>v.HostConfig.SecurityOpt=[],v=>v.Mounts.push({Type:'bind',Destination:'/foreign'})]){const copy=globalThis.structuredClone(value);mutate(copy);assert.throws(()=>validateContainer(copy,image,operation));}
});
test('bounded tar discovery preserves negative evidence',async()=>{
 const helper=fileURLToPath(new URL('../../infra/sqlite-runtime-consumers/inspect.py',import.meta.url));
 const program=String.raw`import importlib.util,io,tarfile,tempfile,pathlib,json
s=importlib.util.spec_from_file_location('probe',${JSON.stringify(helper)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
def archive(p,rows):
 with tarfile.open(p,'w')as t:
  for name,data in rows:
   i=tarfile.TarInfo(name);i.size=len(data);t.addfile(i,io.BytesIO(data))
def reader(p):
 b=p.read_bytes()
 return {'needed':['libsqlite3.so.0']if b.endswith(b'consumer')else[],'soname':'libsqlite3.so.0'if b.endswith(b'provider')else None}
with tempfile.TemporaryDirectory()as d:
 root=pathlib.Path(d);p=root/'root.tar'
 good=[('usr/lib/libsqlite3.so.0.8.6',b'\x7fELFprovider'),('usr/bin/synthetic',b'\x7fELFconsumer'),('var/lib/dpkg/info/libsqlite3-0:amd64.list',b'/usr/lib/libsqlite3.so.0.8.6\n')]
 archive(p,good);r=m.inspect_archive(p,root,reader);assert r['directConsumers'][0]['path']=='usr/bin/synthetic';assert r['providers'][0]['owners']==['libsqlite3-0:amd64'];assert r['allRuntimeUsesDiscovered']is False;assert r['runtimeCompatibilityQualified']is False
 for bad in [good+[('../outside',b'x')],good+[good[0]],good[1:]]:
  archive(p,bad)
  try:m.inspect_archive(p,root,reader)
  except (AssertionError,ValueError):pass
  else:raise AssertionError('bad archive admitted')
 archive(p,good)
 def failed(p):raise ValueError('synthetic reader failure')
 try:m.inspect_archive(p,root,failed)
 except ValueError:pass
 else:raise AssertionError('failed reader admitted')
print('bounded controls passed')`;
 const r=spawnSync('python3',['-I','-B','-c',program],{encoding:'utf8',timeout:5000,maxBuffer:65536});assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'bounded controls passed');
 const code=await readFile(url,'utf8');assert.ok(!code.includes("['start'"));assert.ok(!code.includes("['exec'"));
});
test('actual discovery method only pulls creates inspects and exports its own stopped image',async()=>{
 const {SqliteConsumerDiscovery,PLATFORM}=await import(url),temporary=await mkdtemp(join(tmpdir(),'sqlite-inert-protocol-'));
 try{
  const probe=new SqliteConsumerDiscovery(temporary,{});probe.private=join(temporary,'private');probe.evidence=join(temporary,'evidence');await mkdir(probe.private);await mkdir(probe.evidence);
  const image='sha256:'+'a'.repeat(64),calls=[];
  probe.inspect=async()=>({Id:image,Size:1048576,RepoDigests:['postgres@'+PLATFORM]});
  const state=()=>({Image:image,Config:{Labels:{'io.vivalatax.qualification.operation':probe.operation}},State:{Status:'created',Running:false,ExitCode:0,OOMKilled:false,Error:''},HostConfig:{NetworkMode:'none',ReadonlyRootfs:true,Privileged:false,CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges']},Mounts:[{Type:'tmpfs',Destination:'/var/lib/postgresql/data'}]});
  probe.docker=async(step,args)=>{calls.push(args);return args[0]==='inspect'?JSON.stringify([state()]):'';};
  probe.command=async()=>{await writeFile(join(probe.evidence,'elf-inventory.json'),JSON.stringify({status:'DISCOVERED',allRuntimeUsesDiscovered:false,runtimeCompatibilityQualified:false,temporaryPayloadsRemoved:true,archiveSha256:'b'.repeat(64),archiveBytes:4096}));};
  await probe.build();assert.deepEqual(calls.map(args=>args[0]),['pull','create','inspect','export','inspect']);
  const created=calls[1],exported=calls[3];assert.equal(created.at(-1),image);assert.equal(exported.at(-1),created[2]);assert.ok(created.includes('--read-only'));assert.equal(created[created.indexOf('--user')+1],'65534:65534');
  const binding=JSON.parse(await readFile(join(probe.evidence,'immutable-binding.json'),'utf8'));assert.equal(binding.containerStarted,false);assert.equal(binding.runtimeCompatibilityQualified,false);
 }finally{await rm(temporary,{recursive:true,force:true});}
});
