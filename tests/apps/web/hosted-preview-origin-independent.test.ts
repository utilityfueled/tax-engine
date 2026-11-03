// Spec: spec/federal/hosted-preview-origin-independent.yaml; actual middleware, syntheticonly.
import {afterEach,describe,expect,it,vi} from 'vitest';
import {createRequire} from 'node:module';
import {resolveHostedAppBaseUrl,shouldPreferLocalWorkspaceDraft,shouldAllowLoopbackLocalWorkspaceResume,shouldAllowLoopbackLocalWorkspaceApiAccess,shouldAllowLoopbackLocalAiAccess} from '../../../apps/web/src/lib/hosted-runtime-safety';
import {getHostedAuthConfig} from '../../../apps/web/src/lib/hosted-auth';
import {middleware} from '../../../apps/web/src/middleware';
const requireWeb=createRequire(new URL('../../../apps/web/package.json',import.meta.url));
const {NextRequest}=requireWeb('next/server') as {NextRequest:new(request:Request)=>Parameters<typeof middleware>[0]};
const host='tax-engine-synthetic-r3-utility-fueled-llc.vercel.app';
const origin='https://'+host;
const env={TAX_ENGINE_DEPLOYMENT_MODE:'hosted',NODE_ENV:'production',VERCEL_ENV:'preview',VERCEL_URL:host,TAX_ENGINE_APP_URL:'https://vivalatax.com',BETTER_AUTH_SECRET:'synthetic-only-independent-origin-test-123456789',TAX_ENGINE_STAGING_DATABASE_DATABASE_URL:'postgresql://synthetic:synthetic@localhost/staging'};
afterEach(()=>vi.unstubAllEnvs());
function install(patch:Record<string,string|undefined>={}){for(const [key,value] of Object.entries({...env,BETTER_AUTH_TRUSTED_ORIGINS:undefined,...patch}))vi.stubEnv(key,value);}
function request(method:string,requestOrigin:string,headers:Record<string,string>={}){return new NextRequest(new Request(origin+'/api/hosted/workspaces',{method,headers:{origin:requestOrigin,...headers}}));}
describe('independent hosted preview origin boundary',()=>{
 it.each(['preview.vercel.app.','preview\t.vercel.app','preview\r.vercel.app','preview\0.vercel.app','préview.vercel.app','preview。vercel.app','127.0.0.1.vercel.app/','a'.repeat(64)+'.vercel.app'])('rejects additional ambiguous or malformed generated hostnames: %s',value=>{expect(resolveHostedAppBaseUrl({...env,VERCEL_URL:value}).blocked).toBe(true);});
 it('normalizes ASCII hostname case without accepting URL syntax',()=>{expect(resolveHostedAppBaseUrl({...env,VERCEL_URL:host.toUpperCase()}).appBaseUrl).toBe(origin);expect(resolveHostedAppBaseUrl({...env,VERCEL_URL:'a'.repeat(63)+'.vercel.app'}).blocked).toBe(false);});
 it.each(['https://other-project.vercel.app','https://vivalatax.com','https://'+host+'.attacker.test'])('rejects foreign browser origins despite trusted-looking forwarded headers: %s',foreign=>{install();const response=middleware(request('POST',foreign,{host,'x-forwarded-host':host,forwarded:'host='+host+';proto=https'}));expect(response.status).toBe(403);expect(response.headers.get('vary')).toBe('Origin');expect(response.headers.get('access-control-allow-origin')).toBeNull();});
 it('allows only the selected real preflight origin despite spoofed transport headers',()=>{install();const response=middleware(request('OPTIONS',origin,{host:'attacker.test','x-forwarded-host':'attacker.test',forwarded:'host=attacker.test;proto=http'}));expect(response.status).toBe(204);expect(response.headers.get('access-control-allow-origin')).toBe(origin);expect(response.headers.get('access-control-allow-credentials')).toBe('true');expect(response.headers.get('vary')).toBe('Origin');});
 it('does not use request headers to recover missing deployment hostname',()=>{install({VERCEL_URL:undefined});const response=middleware(request('POST',origin,{host,'x-forwarded-host':host}));expect(getHostedAuthConfig().blocked).toBe(true);expect(response.status).toBe(403);expect(response.headers.get('access-control-allow-origin')).toBeNull();});
 it('never prefers a local draft for an exact hosted preview',()=>{for(const mode of ['production','development'])expect.soft(shouldPreferLocalWorkspaceDraft({...env,NODE_ENV:mode,TAX_ENGINE_APP_URL:'http://localhost:3000'})).toBe(false);});
 it('never enables loopback resume or API access for an exact hosted preview',()=>{for(const mode of ['production','development']){const e={...env,NODE_ENV:mode,TAX_ENGINE_APP_URL:'http://localhost:3000'};expect.soft(shouldAllowLoopbackLocalWorkspaceResume(e,'localhost')).toBe(false);expect.soft(shouldAllowLoopbackLocalWorkspaceApiAccess(e,'127.0.0.1','local-browser')).toBe(false);expect.soft(shouldAllowLoopbackLocalAiAccess(e,'localhost','local-browser')).toBe(false);}});
 it('never admits a loopback browser origin for an exact hosted preview',()=>{for(const mode of ['production','development']){install({NODE_ENV:mode,TAX_ENGINE_APP_URL:'http://localhost:3000'});const response=middleware(request('POST','http://localhost:3000',{host,'x-forwarded-host':'localhost:3000'}));expect.soft(response.status).toBe(403);expect.soft(response.headers.get('access-control-allow-origin')).toBeNull();}});
});
