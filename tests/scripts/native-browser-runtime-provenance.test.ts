import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const state = vi.hoisted(() => ({ collections: 0 }));
vi.mock('node:child_process', () => ({spawn: () => {state.collections++; throw Error('COLLECTION_BOUNDARY');}}));
vi.mock('node:fs/promises', async () => {
  const crypto = await import('node:crypto');
  const sourceDirs = ['src','apps/web/src','apps/web/tests','tests/fixtures','packages/engine/src','packages/contracts/src'];
  const sourceFiles = ['apps/web/playwright.config.ts','apps/web/package.json','packages/engine/package.json','packages/contracts/package.json','pnpm-lock.yaml'];
  const digest = crypto.createHash('sha256').update('x').digest('hex');
  return {
    readFile: async (p: string) => p.endsWith('browser-request-budgets.json') ? Buffer.from(JSON.stringify({sourceDirs,sourceFiles,sourceHashes:Object.fromEntries([...sourceFiles].sort().map(p => [p,digest]))})) : Buffer.from('x'),
    readdir: async () => [], realpath: async (p: string) => p, readlink: async () => {throw Error('Forbidden actual interface');}, open: async () => {throw Error('Forbidden actual interface');},
    lstat: async (p: string) => {if (/(^|\/)\.env/u.test(p)) throw Object.assign(Error('absent'),{code:'ENOENT'}); return {isFile:()=>true,isSymbolicLink:()=>false};},
    mkdir: async () => {}, writeFile: async () => {}, appendFile: async () => {},
  };
});
import { main } from '../../scripts/run-browser-tests.mjs';

const native = {PLAYWRIGHT_DISABLE_WEBSERVER:'true',PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3109',TAX_ENGINE_NATIVE_BROWSER_RUNTIME:'true',TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256:'a'.repeat(64)};
const ci = {PLAYWRIGHT_DISABLE_WEBSERVER:'true',PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3109',GITHUB_ACTIONS:'true',GITHUB_SHA:'1'.repeat(40),CANDIDATE_IMAGE_ID:`sha256:${'2'.repeat(64)}`};
async function collectOnly(env: Record<string,string | undefined>) {
  const before = state.collections;
  await expect(main(['--timeout=30000'],{root:'/synthetic/source',parentEnv:env})).rejects.toThrow('COLLECTION_BOUNDARY');
  expect(state.collections-before).toBe(1);
}
async function deny(env: Record<string,string | undefined>) {
  const before = state.collections;
  await expect(main(['--timeout=30000'],{root:'/synthetic/source',parentEnv:env})).rejects.not.toThrow('COLLECTION_BOUNDARY');
  expect(state.collections).toBe(before);
}

describe('native operational provenance — spec native-explicit', () => {
  it('admits explicit native external mode without impersonating GitHub Actions', async () => {await collectOnly(native);});
  it('requires native 30000ms without changing managed or CI CLI defaults',async()=>{
    for(const args of [[],['--timeout=90000'],['--timeout=30000','--timeout=30000']]) {
      const before=state.collections;await expect(main(args,{root:'/synthetic/source',parentEnv:native})).rejects.toThrow('30000ms');expect(state.collections).toBe(before);
    }
    await expect(main(['--timeout','30000'],{root:'/synthetic/source',parentEnv:native})).rejects.toThrow('COLLECTION_BOUNDARY');
    await expect(main([],{root:'/synthetic/source',parentEnv:{}})).rejects.toThrow('COLLECTION_BOUNDARY');
    await expect(main([],{root:'/synthetic/source',parentEnv:ci})).rejects.toThrow('COLLECTION_BOUNDARY');
  });
  it('preserves managed admission and actual CI Docker admission', async () => {await collectOnly({}); await collectOnly(ci);});
  it.each([
    {...native,GITHUB_ACTIONS:'true'}, {...native,PLAYWRIGHT_DISABLE_WEBSERVER:'false'},
    {...native,PLAYWRIGHT_BASE_URL:'http://localhost:3109'}, {...native,TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256:'x'},
    {...native,TAX_ENGINE_NATIVE_BROWSER_RUNTIME:'false'},
    {...ci,GITHUB_ACTIONS:'false'}, {...ci,CANDIDATE_IMAGE_ID:'sha256:bad'},
    {...ci,PLAYWRIGHT_BASE_URL:'http://127.0.0.1:3000'}, {PLAYWRIGHT_BASE_URL:'https://example.invalid'},
    {PLAYWRIGHT_USE_DEV_SERVER:'true'},
  ])('denies changed or ambiguous runtime admission %#', async env => {await deny(env);});
});

import { EventEmitter } from 'node:events';
import { createNativeInspector, sourceTree, relayJson } from '../../scripts/native-browser-runtime-provenance.mjs';
const digest = (algorithm: string, body: string | Buffer) => createHash(algorithm).update(body).digest('hex');
const object = (type: string, body: string) => digest('sha1',Buffer.concat([Buffer.from(`${type} ${Buffer.byteLength(body)}\0`),Buffer.from(body)]));
function fixture() {
  const op='a'.repeat(32), root=`/private/tmp/tax-ze-${op}/source`, parent=root.slice(0,-7), socket=`${parent}/api.sock`;
  const inventory=[{path:'a.txt',mode:'100644',bytes:5,oid:object('blob','hello')}];
  const tree=sourceTree(inventory), commitBody=`tree ${tree}\nauthor Engineering <engineering@example.invalid> 0 +0000\ncommitter Engineering <engineering@example.invalid> 0 +0000\n\nSynthetic test commit\n`, commit=object('commit',commitBody);
  const p={version:1,enabled:true,operation:op,commit,tree,commitBody,containerId:'c'.repeat(64),imageId:'d'.repeat(64),socket:{dev:1,ino:2,uid:501,mode:0o140600,nlink:1},inventory};
  const cfg={User:'appuser',Cmd:['node','apps/web/server.js'],Entrypoint:['docker-entrypoint.sh'],Labels:{'org.opencontainers.image.revision':commit},Env:['PORT=3000']};
  const image={Id:`sha256:${p.imageId}`,Os:'linux',Architecture:'arm64',Config:structuredClone(cfg),RootFS:{Layers:[`sha256:${'e'.repeat(64)}`]}};
  const ports={'3000/tcp':[{HostIp:'127.0.0.1',HostPort:'3109'}]};
  const container={Id:p.containerId,Image:`sha256:${p.imageId}`,Name:`/tax-ze-${op}-full`,State:{Running:true,Status:'running'},Config:{...structuredClone(cfg),Labels:{...cfg.Labels,'io.vivalatax.native-browser.operation':op},Env:[...cfg.Env,'TAX_ENGINE_DEPLOYMENT_MODE=self-host','TAX_ENGINE_APP_URL=http://127.0.0.1:3109']},HostConfig:{ReadonlyRootfs:true,Privileged:false,CapAdd:null,CapDrop:['ALL'],SecurityOpt:['no-new-privileges'],Binds:null,Tmpfs:{'/tmp':'rw,noexec,nosuid,size=64m','/app/apps/web/.next/cache':'rw,noexec,nosuid,nodev,size=64m,mode=1777'},PortBindings:structuredClone(ports)},NetworkSettings:{Ports:structuredClone(ports)},Mounts:[] as Array<{Type:string;Destination:string}>};
  let proof=Buffer.from(JSON.stringify(p)), socketInode=2, file='hello', extra=false, socketMode=0o140600, sourceMode=0o100644, sourceUid=501;
  const calls: string[]=[];
  const stat=(type: string, mode: number, ino=3, uid=501) => ({dev:1,ino,uid,mode,nlink:1,isDirectory:()=>type==='directory',isFile:()=>type==='file',isSymbolicLink:()=>type==='symlink',isSocket:()=>type==='socket'});
  const io={uid:()=>501, realpath:async(p:string)=>p,
    lstat:async(name:string)=> name===socket?stat('socket',socketMode,socketInode):name.endsWith('native-browser-provenance.json')?stat('file',0o100600,4):name.endsWith('/a.txt')?stat('file',sourceMode,5,sourceUid):stat('directory',0o40700),
    read:async(name:string,limit:number)=>{const b=name.endsWith('/a.txt')?Buffer.from(file):proof;if(b.length>limit)throw Error('bounded');return b;},
    readlink:async():Promise<string>=>{throw Error('unexpected symlink');},
    readdir:async(_name='')=>[{name:'a.txt',isDirectory:()=>false,isFile:()=>true,isSymbolicLink:()=>false},...(extra?[{name:'unexpected.txt',isDirectory:()=>false,isFile:()=>true,isSymbolicLink:()=>false}]:[])],
    get:async(_socket:string,kind:string,_id:string,_signal?:AbortSignal)=>{calls.push(kind);return kind==='containers'?container:image;},
  };
  const env={...native,TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256:digest('sha256',proof)};
  const args={root,env,signal:new AbortController().signal};
  return {p,io,args,container,image,calls,set file(v:string){file=v;},set extra(v:boolean){extra=v;},set inode(v:number){socketInode=v;},set socketMode(v:number){socketMode=v;},set sourceMode(v:number){sourceMode=v;},set sourceUid(v:number){sourceUid=v;},rebind(){proof=Buffer.from(JSON.stringify(p));env.TAX_ENGINE_NATIVE_BROWSER_PROOF_SHA256=digest('sha256',proof);}};
}

describe('native operational provenance — source-and-custody/live-runtime',()=>{
  it('independently checks complete source and socket custody before and after live inspection',async()=>{
    const f=fixture(), inspect=await createNativeInspector(f.args,f.io);
    expect(await inspect()).toMatchObject({mode:'operator-owned-native',commit:f.p.commit,imageId:`sha256:${f.p.imageId}`});
    expect(f.calls).toEqual(['containers','images']);
    expect(await inspect()).toEqual(await inspect());
    f.file='other';await expect(inspect()).rejects.toThrow('source bytes');
  });
  it.each([false,true])('checks literal tracked in-tree symlink with escape=%s',async escape=>{
    const f=fixture();f.p.inventory.push({path:'b',mode:'120000',bytes:5,oid:object('blob','a.txt')});
    f.p.tree=sourceTree(f.p.inventory);f.p.commitBody=f.p.commitBody.replace(/^tree [a-f0-9]{40}/u,`tree ${f.p.tree}`);f.p.commit=object('commit',f.p.commitBody);
    f.image.Config.Labels['org.opencontainers.image.revision']=f.p.commit;f.container.Config.Labels['org.opencontainers.image.revision']=f.p.commit;
    const before=f.io.lstat;f.io.lstat=async name=>name===f.args.root+'/b'?{dev:1,ino:9,uid:501,mode:0o120777,nlink:1,isDirectory:()=>false,isFile:()=>false,isSymbolicLink:()=>true,isSocket:()=>false}:before(name);
    const prior=f.io.readdir;f.io.readdir=async()=>[...await prior(),{name:'b',isDirectory:()=>false,isFile:()=>false,isSymbolicLink:()=>true}];
    f.io.readlink=async()=>escape?'../../foreign':'a.txt';f.io.realpath=async name=>name===f.args.root+'/b'?f.args.root+'/a.txt':name;f.rebind();
    const inspect=await createNativeInspector(f.args,f.io);if(escape)await expect(inspect()).rejects.toThrow('symlink escapes');else expect(await inspect()).toMatchObject({commit:f.p.commit});
  });
  it('accepts equivalent JSON member ordering while retaining exact values and arrays',async()=>{
    const f=fixture();f.p.socket={nlink:1,mode:0o140600,uid:501,ino:2,dev:1};
    f.container.HostConfig.PortBindings['3000/tcp'][0]={HostPort:'3109',HostIp:'127.0.0.1'};
    f.rebind();const inspect=await createNativeInspector(f.args,f.io);expect(await inspect()).toMatchObject({commit:f.p.commit});
  });
  it('requires actual container and image observations rather than the sidecar',async()=>{
    const f=fixture(),inspect=await createNativeInspector(f.args,f.io);
    f.io.get=async()=>{throw Error('offline');};await expect(inspect()).rejects.toThrow('offline');
  });
  it.each(['container-id','image-id','not-running','status','revision','image-revision','operation','name','architecture','os','user','cmd','entrypoint','read-only','privileged','cap-add','cap-drop','security','bind','port','network-port','mount','environment','duplicate-environment','layers','tmpfs-missing','tmpfs-mask','tmpfs-executable'])('denies live %s mutation',async kind=>{
    const f=fixture();
    switch(kind){
      case 'container-id':f.container.Id='0'.repeat(64);break;
      case 'image-id':f.image.Id=`sha256:${'0'.repeat(64)}`;break;
      case 'not-running':f.container.State.Running=false;break;
      case 'status':f.container.State.Status='exited';break;
      case 'revision':f.container.Config.Labels['org.opencontainers.image.revision']='0'.repeat(40);break;
      case 'image-revision':f.image.Config.Labels['org.opencontainers.image.revision']='0'.repeat(40);break;
      case 'operation':f.container.Config.Labels['io.vivalatax.native-browser.operation']='0'.repeat(32);break;
      case 'name':f.container.Name+='_other';break;
      case 'architecture':f.image.Architecture='amd64';break;
      case 'os':f.image.Os='windows';break;
      case 'user':f.container.Config.User='root';break;
      case 'cmd':f.container.Config.Cmd=['sh'];break;
      case 'entrypoint':f.container.Config.Entrypoint=['sh'];break;
      case 'read-only':f.container.HostConfig.ReadonlyRootfs=false;break;
      case 'privileged':f.container.HostConfig.Privileged=true;break;
      case 'cap-add':Object.assign(f.container.HostConfig,{CapAdd:['SYS_ADMIN']});break;
      case 'cap-drop':f.container.HostConfig.CapDrop=[];break;
      case 'security':f.container.HostConfig.SecurityOpt=[];break;
      case 'bind':Object.assign(f.container.HostConfig,{Binds:['/host:/app']});break;
      case 'port':f.container.HostConfig.PortBindings['3000/tcp'][0].HostIp='0.0.0.0';break;
      case 'network-port':f.container.NetworkSettings.Ports['3000/tcp'][0].HostPort='3108';break;
      case 'mount':f.container.Mounts=[{Type:'bind',Destination:'/app'}];break;
      case 'environment':f.container.Config.Env.push('OPENAI_API_KEY=synthetic-forbidden');break;
      case 'duplicate-environment':f.container.Config.Env.push('PORT=3000');break;
      case 'layers':f.image.RootFS.Layers=[];break;
      case 'tmpfs-missing':Object.assign(f.container.HostConfig,{Tmpfs:{}});break;
      case 'tmpfs-mask':Object.assign(f.container.HostConfig.Tmpfs,{'/app':'rw'});break;
      case 'tmpfs-executable':f.container.HostConfig.Tmpfs['/tmp']='rw,nosuid,size=64m';break;
    }
    const inspect=await createNativeInspector(f.args,f.io);await expect(inspect()).rejects.toThrow();
  });
  it.each(['inode','socket-mode','extra','mode','owner','proof','symlink-parent','late-source','late-socket','cancel'])('denies %s custody change',async kind=>{
    const f=fixture(),inspect=await createNativeInspector(f.args,f.io);
    switch(kind){
      case 'inode':f.inode=99;break;
      case 'socket-mode':f.socketMode=0o140666;break;
      case 'extra':f.extra=true;break;
      case 'mode':f.sourceMode=0o100755;break;
      case 'owner':f.sourceUid=0;break;
      case 'proof':f.p.enabled=false;f.rebind();break;
      case 'symlink-parent':f.io.realpath=async name=>name===f.args.root?'/foreign':name;break;
      case 'late-source':{const prior=f.io.get;f.io.get=async(...a)=>{const r=await prior(...a);f.file='other';return r;};break;}
      case 'late-socket':{const prior=f.io.get;f.io.get=async(...a)=>{const r=await prior(...a);f.inode=99;return r;};break;}
      case 'cancel':{const c=new AbortController();Object.assign(f.args,{signal:c.signal});const next=await createNativeInspector(f.args,f.io);c.abort();await expect(next()).rejects.toThrow('cancelled');return;}
    }
    await expect(inspect()).rejects.toThrow();
  });
  it.each(['disabled','bad-tree','bad-commit','duplicate','traversal','unbounded','unknown-key','wrong-parent','unknown-entry-key'])('denies %s operator binding',async kind=>{
    const f=fixture();switch(kind){
      case 'disabled':f.p.enabled=false;break;
      case 'bad-tree':f.p.tree='0'.repeat(40);break;
      case 'bad-commit':f.p.commit='0'.repeat(40);break;
      case 'duplicate':f.p.inventory.push({...f.p.inventory[0]});break;
      case 'traversal':f.p.inventory[0].path='../a.txt';break;
      case 'unbounded':f.p.inventory[0].bytes=65*1024*1024;break;
      case 'unknown-key':Object.assign(f.p,{url:'https://example.invalid'});break;
      case 'wrong-parent':f.p.operation='b'.repeat(32);break;
      case 'unknown-entry-key':Object.assign(f.p.inventory[0],{url:'https://example.invalid'});break;
    }f.rebind();await expect(createNativeInspector(f.args,f.io)).rejects.toThrow();
  });
  it('derives an independently known Git tree instead of accepting declared tree',()=>{
    // git hash-object of literal "hello" is independently documented here.
    expect(object('blob','hello')).toBe('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0');
    const expected=digest('sha1',Buffer.concat([Buffer.from('tree 29\0'),Buffer.from('100644 a\0'),Buffer.from('b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0','hex')]));
    expect(sourceTree([{path:'a',mode:'100644',bytes:5,oid:object('blob','hello')}])).toBe(expected);
  });
});

function transportFixture(mode='ok') {
  const requests: unknown[]=[];let destroyed=0,ended=0;const responses: EventEmitter[]=[];
  const send: NonNullable<Parameters<typeof relayJson>[4]>=(_options,callback)=>{
    requests.push(_options);const req=new EventEmitter() as EventEmitter & {destroy:()=>void;end:()=>void};
    req.destroy=()=>{destroyed++;};req.end=()=>{ended++;if(mode==='hang')return;queueMicrotask(()=>{
      const res=Object.assign(new EventEmitter(),{statusCode:mode==='redirect'?302:200,headers:mode==='length'?{'content-length':'1048577'}:{},complete:true,destroy:()=>{destroyed++;}});responses.push(res);callback(res);
      if(mode==='error')res.emit('error',Error('never expose raw details'));
      else if(mode==='oversize')res.emit('data',Buffer.alloc(1048577));
      else {res.emit('data',Buffer.from(mode==='malformed'?'bad':'{"Id":"safe"}'));res.emit('end');}
    });};return req;
  };
  return {send,requests,responses,get destroyed(){return destroyed;},get ended(){return ended;}};
}

describe('native operational provenance — fail-closed transport',()=>{
  it('aborts and bounds only fixed read-only transport routes',async()=>{
    const f=transportFixture(),c=new AbortController();
    expect(await relayJson(`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'containers','c'.repeat(64),c.signal,f.send)).toEqual({Id:'safe'});
    expect(f.requests).toEqual([{socketPath:`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,method:'GET',path:`/containers/${'c'.repeat(64)}/json`,agent:false,headers:{Accept:'application/json'}}]);expect(f.ended).toBe(1);expect(f.destroyed).toBe(2);
  });
  it.each(['redirect','length','oversize','malformed','error'])('closes bounded request on %s without raw error disclosure',async kind=>{
    const f=transportFixture(kind);await expect(relayJson(`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'images','d'.repeat(64),undefined,f.send)).rejects.toThrow('Native read-only inspection unavailable');expect(f.destroyed).toBe(2);
  });
  it('destroys an in-flight request on abort and prevents pre-aborted dispatch',async()=>{
    const f=transportFixture('hang'),c=new AbortController();const pending=relayJson(`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'images','d'.repeat(64),c.signal,f.send);c.abort();await expect(pending).rejects.toThrow('unavailable');expect(f.destroyed).toBe(1);
    await expect(relayJson(`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'images','d'.repeat(64),c.signal,f.send)).rejects.toThrow('unavailable');expect(f.requests).toHaveLength(1);
  });
  it('destroys a stalled request at the fixed deadline',async()=>{
    vi.useFakeTimers();try{const f=transportFixture('hang'),pending=relayJson(`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'images','d'.repeat(64),undefined,f.send);const denial=expect(pending).rejects.toThrow('unavailable');await vi.advanceTimersByTimeAsync(2500);await denial;expect(f.destroyed).toBe(1);}finally{vi.useRealTimers();}
  });
  it.each([
    ['/tmp/arbitrary.sock','containers','c'.repeat(64)],
    [`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'exec','c'.repeat(64)],
    [`/private/tmp/tax-ze-${'a'.repeat(32)}/api.sock`,'images','../foreign'],
  ])('rejects arbitrary routing before transport',async(socket,kind,identity)=>{const f=transportFixture();expect(()=>relayJson(socket,kind,identity,undefined,f.send)).toThrow();expect(f.requests).toHaveLength(0);});
});


function supplementalFixture(registryRows=[{id:'irs-w2-2025',downloadUrl:'https://www.irs.gov/pub/irs-prior/fw2--2025.pdf'}]) {
  const f=fixture();
  const registry=Buffer.from(JSON.stringify(registryRows));
  const records=registryRows.map(row=>({id:row.id,originUrl:row.downloadUrl,bytes:Buffer.byteLength(`%PDF-1.7\nSynthetic ${row.id}\n`),sha256:digest('sha256',`%PDF-1.7\nSynthetic ${row.id}\n`)})).sort((a,b)=>a.id<b.id?-1:1);
  const supplemental={registrySha256:digest('sha256',registry),files:records};
  f.p.inventory.push({path:'sample-documents/registry.json',mode:'100644',bytes:registry.length,oid:object('blob',registry.toString())});
  f.p.tree=sourceTree(f.p.inventory);f.p.commitBody=f.p.commitBody.replace(/^tree [a-f0-9]{40}/u,`tree ${f.p.tree}`);f.p.commit=object('commit',f.p.commitBody);
  f.image.Config.Labels['org.opencontainers.image.revision']=f.p.commit;f.container.Config.Labels['org.opencontainers.image.revision']=f.p.commit;
  Object.assign(f.p,{supplemental});
  const files=new Map<string,Buffer<ArrayBuffer>>([['a.txt',Buffer.from('hello')],['sample-documents/registry.json',registry],...registryRows.map(row=>[`sample-documents/downloads/${row.id}.pdf`,Buffer.from(`%PDF-1.7\nSynthetic ${row.id}\n`)] as [string,Buffer<ArrayBuffer>])]);
  let mode=0o100644,owner=501,links=1;
  const oldStat=f.io.lstat,oldRead=f.io.read;
  f.io.lstat=async name=>{
    if(name.startsWith(f.args.root+'/') && files.has(name.slice(f.args.root.length+1)))return {dev:1,ino:10,uid:owner,mode,nlink:links,isDirectory:()=>false,isFile:()=>true,isSymbolicLink:()=>false,isSocket:()=>false};
    return oldStat(name);
  };
  f.io.read=async(name,limit)=>{const bytes=files.get(name.slice(f.args.root.length+1));if(bytes){if(bytes.length>limit)throw Error('bounded');return bytes;}return oldRead(name,limit);};
  f.io.readdir=async(name='')=>{
    const dir=name===f.args.root?'':name.slice(f.args.root.length+1), prefix=dir?dir+'/':'';
    const children=new Map<string,boolean>();
    for(const file of files.keys())if(file.startsWith(prefix)){const tail=file.slice(prefix.length),parts=tail.split('/');children.set(parts[0],parts.length>1);}
    return [...children].map(([name,directory])=>({name,isDirectory:()=>directory,isFile:()=>!directory,isSymbolicLink:()=>false}));
  };
  f.rebind();return {f,files,supplemental,set mode(v:number){mode=v;},set owner(v:number){owner=v;},set links(v:number){links=v;}};
}

describe('native provenance — spec registered-supplemental-fixtures',()=>{
  it('admits exact registry-bound official fixtures without changing Git tree',async()=>{
    const {f}=supplementalFixture(),tree=f.p.tree;
    const inspect=await createNativeInspector(f.args,f.io);expect(await inspect()).toMatchObject({tree,commit:f.p.commit});expect(sourceTree(f.p.inventory)).toBe(tree);expect(f.calls).toEqual(['containers','images']);
  });
});


describe('native registered fixture boundaries',()=>{
  it('supports every actual tracked registry ID with exact separately bound synthetic fixture bytes',async()=>{
    const registry=JSON.parse(readFileSync('sample-documents/registry.json','utf8')) as Array<{id:string;downloadUrl:string}>;
    expect(registry).toHaveLength(15);const {f}=supplementalFixture(registry);const inspect=await createNativeInspector(f.args,f.io);expect(await inspect()).toMatchObject({tree:f.p.tree});
  });
  it.each(['absent-declaration','missing','extra','bytes','late-bytes','owner','mode','links','symlink','parent','registry','hash','origin','zero','too-large','unknown-key','unknown-record-key','traversal','duplicate','incomplete'])('denies %s fixture proof',async kind=>{
    const x=supplementalFixture(),{f}=x,leaf='sample-documents/downloads/irs-w2-2025.pdf';
    switch(kind){
      case 'absent-declaration':delete (f.p as typeof f.p & {supplemental?:unknown}).supplemental;break;
      case 'missing':x.files.delete(leaf);break;
      case 'extra':x.files.set('sample-documents/downloads/unregistered.pdf',Buffer.from('extra'));break;
      case 'bytes':x.files.set(leaf,Buffer.from('corrupted'));break;
      case 'late-bytes':{const get=f.io.get;f.io.get=async(...a)=>{const result=await get(...a);x.files.set(leaf,Buffer.from('corrupted'));return result;};break;}
      case 'owner':x.owner=0;break;
      case 'mode':x.mode=0o100666;break;
      case 'links':x.links=2;break;
      case 'symlink':{const old=f.io.lstat;f.io.lstat=async name=>{const stat=await old(name);return name.endsWith(leaf)?{...stat,isFile:()=>false,isSymbolicLink:()=>true}:stat;};break;}
      case 'parent':f.io.realpath=async name=>name.endsWith('/downloads')?'/foreign':name;break;
      case 'registry':x.files.set('sample-documents/registry.json',Buffer.from('[]'));break;
      case 'hash':x.supplemental.registrySha256='0'.repeat(64);break;
      case 'origin':x.supplemental.files[0].originUrl='https://evil.invalid/file.pdf';break;
      case 'zero':x.supplemental.files[0].bytes=0;break;
      case 'too-large':x.supplemental.files[0].bytes=16*1024*1024+1;break;
      case 'unknown-key':Object.assign(x.supplemental,{allowExtra:true});break;
      case 'unknown-record-key':Object.assign(x.supplemental.files[0],{path:'/foreign'});break;
      case 'traversal':x.supplemental.files[0].id='../foreign';break;
      case 'duplicate':x.supplemental.files.push({...x.supplemental.files[0]});break;
      case 'incomplete':x.supplemental.files=[];break;
    }
    f.rebind();await expect((async()=>{const inspect=await createNativeInspector(f.args,f.io);return inspect();})()).rejects.toThrow();
  });
});


describe('native supplemental registry and size boundaries',()=>{
  it.each(['foreign-origin','query','path','duplicate-id','count','total'])('denies %s even when operator declaration and tracked registry agree',async kind=>{
    const rows=Array.from({length:kind==='count'?33:kind==='total'?5:1},(_,n)=>({id:`irs-test-${n}`,downloadUrl:`https://www.irs.gov/pub/irs-pdf/f${n}.pdf`}));
    if(kind==='foreign-origin')rows[0].downloadUrl='https://evil.invalid/pub/irs-pdf/f0.pdf';
    if(kind==='query')rows[0].downloadUrl+='?token=not-permitted';
    if(kind==='path')rows[0].id='../escape';
    if(kind==='duplicate-id')rows.push({...rows[0]});
    const {f,supplemental}=supplementalFixture(rows);
    if(kind==='total')for(const row of supplemental.files)row.bytes=16*1024*1024;
    f.rebind();await expect(createNativeInspector(f.args,f.io)).rejects.toThrow();expect(f.calls).toEqual([]);
  });
});
