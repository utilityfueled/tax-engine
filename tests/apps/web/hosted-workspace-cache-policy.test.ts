import {beforeEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({actor:vi.fn(),entitlement:vi.fn(),rate:vi.fn()}));
vi.mock('../../../apps/web/src/lib/hosted-auth',()=>({resolveHostedWorkspaceActor:mocks.actor}));
vi.mock('../../../apps/web/src/lib/hosted-billing-db',()=>({getHostedEntitlementByOwnerId:mocks.entitlement}));
vi.mock('../../../apps/web/src/lib/rate-limit',async(importOriginal)=>({...await importOriginal<typeof import('../../../apps/web/src/lib/rate-limit')>(),checkRateLimitForEnvironment:mocks.rate}));
import {createHostedWorkspaceRouteHandlers} from '../../../apps/web/src/lib/hosted-workspace-route';
import {createInMemoryHostedWorkspaceStore,createInMemoryHostedDocumentBlobStore} from '../../../apps/web/src/lib/workspace-persistence';
import {createWorkspaceRecord} from '../../../apps/web/src/lib/workspace-storage';
import {createRateLimitStore} from '../../../apps/web/src/lib/rate-limit';
const methods=['list','get','save','delete','uploadDocument'] as const;
type Method=typeof methods[number];
const origin='https://cache.example.invalid';
const id='cache-w1';
const context={workspaceId:id};
const env={TAX_ENGINE_DEPLOYMENT_MODE:'hosted',TAX_ENGINE_APP_URL:origin};
const owner={ownerId:'cache-owner',ownerLabel:'Synthetic Cache',scopeKey:'hosted-owner:cache-owner'};
const unavailableBody={error:'The server is temporarily unavailable. Please try again later.'};
function workspace(){return createWorkspaceRecord(id,{now:'2026-11-03T20:00:00.000Z',storageMode:'hosted-postgres'});}
function fixture(){
 const store=createInMemoryHostedWorkspaceStore([{ownerId:owner.ownerId,workspace:workspace()}]);
 const blobs=createInMemoryHostedDocumentBlobStore();
 const handlers=createHostedWorkspaceRouteHandlers({env,hostedStore:store,hostedDocumentBlobStore:blobs,rateLimitStore:createRateLimitStore(),now:()=> '2026-11-03T20:00:00.000Z'});
 return {store,blobs,handlers};
}
function uploadForm(type='image/png'){
 const f=new FormData();f.set('documentId','cache-doc');
 f.set('file',new File([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],'synthetic.png',{type}));
 return f;
}
function request(method:Method){
 const url=origin+'/api/hosted/workspaces'+(method==='list'?'':'/'+id)+(method==='uploadDocument'?'/documents':'');
 if(method==='save')return new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:workspace()})});
 if(method==='uploadDocument')return new Request(url,{method:'POST',body:uploadForm()});
 return new Request(url,{method:method==='delete'?'DELETE':'GET'});
}
async function invoke(handlers:ReturnType<typeof createHostedWorkspaceRouteHandlers>,method:Method,req=request(method),ctx=context){
 return method==='list'?handlers.list(req):handlers[method](req,ctx);
}
function cache(response:Response){expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');}
beforeEach(()=>{
 vi.clearAllMocks();mocks.actor.mockResolvedValue({id:owner.ownerId,label:owner.ownerLabel});
 mocks.entitlement.mockResolvedValue({entitlement:{workspaceAccess:true}});
 mocks.rate.mockResolvedValue({allowed:true,remaining:29,retryAfterMs:null});
});
describe('hosted workspace returned response cache policy (existing APIs, synthetic dependencies)',()=>{
 it.each(methods)('keeps successful %s responses private and uncached',async method=>{
  const f=fixture();const response=await invoke(f.handlers,method);expect(response.status).toBe(200);
  const body=await response.json();expect(body.ownerScope).toEqual(owner);expect(body.availability).toBe('ready');
  if(method==='list')expect(body.workspaces).toMatchObject([{id}]);
  else if(method==='delete')expect(body).toMatchObject({workspace:null,workspaces:[]});
  else if(method==='uploadDocument')expect(body.document).toMatchObject({workspaceId:id,documentId:'cache-doc',fileName:'synthetic.png',mediaType:'image/png',size:8});
  else expect(body.workspace).toMatchObject({id,storageMode:'hosted-postgres'});
  expect(response.headers.get('content-type')).toContain('application/json');cache(response);
 });
 const denials=[
  {name:'owner-required',status:401,body:{availability:'owner-required',ownerScope:null,workspace:null,workspaces:[]}},
  {name:'plan-required',status:403,body:{error:'A hosted Starter or Plus plan is required before you can create or resume cloud returns.'}},
  {name:'self-host-disabled',status:404,body:{error:'Hosted workspace routes are disabled outside hosted deployment mode.'}},
  {name:'rate-exceeded',status:429,body:{error:'Too many requests. Please try again later.'},retry:'2'},
  {name:'rate-unavailable',status:503,body:{error:'Request protection is temporarily unavailable. Please try again later.',code:'rate-limit-unavailable'},retry:'5'},
  {name:'adapter-unavailable',status:503,body:unavailableBody},
 ] as const;
 const cases=denials.flatMap(d=>methods.map(method=>[d.name,method,d] as const));
 it.each(cases)('keeps %s for %s private without changing status body or retry headers',async(_name,method,d)=>{
  if(d.name==='owner-required')mocks.actor.mockResolvedValue(null);
  if(d.name==='plan-required')mocks.entitlement.mockResolvedValue({entitlement:{workspaceAccess:false}});
  if(d.name==='rate-exceeded')mocks.rate.mockResolvedValue({allowed:false,remaining:0,retryAfterMs:1500});
  if(d.name==='rate-unavailable')mocks.rate.mockResolvedValue({allowed:false,remaining:0,retryAfterMs:5000,unavailable:true});
  const f=fixture();const handlers=d.name==='self-host-disabled'?createHostedWorkspaceRouteHandlers({env:{TAX_ENGINE_DEPLOYMENT_MODE:'self-host'},rateLimitStore:createRateLimitStore()}):d.name==='adapter-unavailable'?createHostedWorkspaceRouteHandlers({env,rateLimitStore:createRateLimitStore(),hostedStoreFactory(){throw new Error('SYNTHETIC_PRIVATE_STORE_DETAIL');}}):f.handlers;
  const response=await invoke(handlers,method);expect(response.status).toBe(d.status);expect(await response.json()).toEqual(d.body);
  expect(response.headers.get('retry-after')).toBe('retry' in d?d.retry:null);cache(response);
 });
 it.each(methods.filter(method=>method!=='list'))('keeps %s invalid identifier private without persistence',async method=>{
  const f=fixture();const get=vi.spyOn(f.store,'get');const response=await invoke(f.handlers,method,request(method),{workspaceId:'../not-a-workspace'});
  expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'Invalid workspace identifier.'});expect(get).not.toHaveBeenCalled();cache(response);
 });
 const payloads=['save-malformed-json','save-id-mismatch','save-missing-content-type','save-declared-overlimit','save-cancelled','upload-missing-file','upload-unsupported-media','upload-declared-overlimit'] as const;
 it.each(payloads)('keeps %s validation private without changing denial',async name=>{
  const f=fixture();let req:Request;let method:Method='save';let expected=400;
  if(name==='save-malformed-json')req=new Request(origin+'/api/hosted/workspaces/'+id,{method:'POST',headers:{'content-type':'application/json'},body:'{'});
  else if(name==='save-id-mismatch')req=new Request(origin+'/api/hosted/workspaces/'+id,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:{...workspace(),id:'another-synthetic'}})});
  else if(name==='save-missing-content-type'){req=new Request(origin+'/api/hosted/workspaces/'+id,{method:'POST',body:'{}'});expected=415;}
  else if(name==='save-declared-overlimit'){req=new Request(origin+'/api/hosted/workspaces/'+id,{method:'POST',headers:{'content-type':'application/json','content-length':String(5*1024*1024+1)},body:'{}'});expected=413;}
  else if(name==='save-cancelled'){const c=new AbortController();req=new Request(origin+'/api/hosted/workspaces/'+id,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:c.signal});c.abort();expected=499;}
  else {method='uploadDocument';const data=name==='upload-missing-file'?new FormData():uploadForm(name==='upload-unsupported-media'?'text/plain':'image/png');req=new Request(origin+'/api/hosted/workspaces/'+id+'/documents',{method:'POST',body:data,headers:name==='upload-declared-overlimit'?{'content-length':String(26*1024*1024+1)}:{}});}
  const response=await invoke(f.handlers,method,req);expect(response.status).toBe(expected);const body=await response.json();const expectedErrors:Record<typeof payloads[number],string>={
   'save-malformed-json':'Invalid JSON in request body.',
   'save-id-mismatch':'Hosted workspace save payload id must match the route workspace id.',
   'save-missing-content-type':'Content-Type must be application/json.',
   'save-declared-overlimit':'Request body too large. Maximum allowed size is 5 MB.',
   'save-cancelled':'Request cancelled.',
   'upload-missing-file':'Hosted document uploads require a file payload.',
   'upload-unsupported-media':'Uploaded file type is not supported. Accepted types: PDF, PNG, JPEG, TIFF, WebP.',
   'upload-declared-overlimit':'Uploaded file exceeds the 25 MB size limit.',
  };expect(body).toEqual({error:expectedErrors[name]});cache(response);
 });
 it.each(['list','get','save','delete','uploadDocument'] as const)('keeps %s store failure private and generic',async method=>{
  const f=fixture();if(method==='uploadDocument')vi.spyOn(f.blobs,'save').mockImplementation(()=>{throw new Error('SYNTHETIC_PRIVATE_STORE_DETAIL');});
  else vi.spyOn(f.store,method==='list'?'listByOwner':method).mockRejectedValue(new Error('SYNTHETIC_PRIVATE_STORE_DETAIL'));
  const response=await invoke(f.handlers,method);expect(response.status).toBe(503);expect(await response.json()).toEqual(unavailableBody);cache(response);
 });
});
