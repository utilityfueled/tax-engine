// Spec: spec/federal/hosted-remote-database-tls.yaml (auth-runtime-policy-cache/auth-policy-preserved).
import { createRequire } from 'node:module';
import type { betterAuth, BetterAuthOptions } from 'better-auth';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHostedAuthForTests, getHostedAuthConfig, resetHostedAuthRuntimeCachesForTests } from '../../../apps/web/src/lib/hosted-auth';
import { getHostedServerDatabase } from '../../../apps/web/src/lib/hosted-server-db';
const require = createRequire(new URL('../../../apps/web/package.json', import.meta.url));
const {Client, Pool} = require('pg') as typeof import('../../../apps/web/node_modules/pg');
type Environment = Record<string,string|undefined>;
type Runtime = Awaited<ReturnType<typeof getHostedServerDatabase>>;
type Auth = Awaited<ReturnType<typeof createHostedAuthForTests>>;
const resources = new Set<Runtime>();
const bound = new WeakMap<object,Runtime>();
let index = 0;
function environment(mode:string, id:string, host='127.0.0.1'):Environment {
 const database=`postgresql://synthetic_auth_cache:synthetic_only@${host}/synthetic_auth_cache?application_name=${id}`;
 return {TAX_ENGINE_DEPLOYMENT_MODE:'hosted', NODE_ENV:mode==='missing'?undefined:mode==='preview'?'production':mode,
  VERCEL_ENV:mode==='preview'?'preview':undefined, VERCEL_URL:mode==='preview'?'synthetic-auth-cache.vercel.app':undefined,
  TAX_ENGINE_APP_URL:'https://synthetic-auth-cache.vercel.app',BETTER_AUTH_URL:'https://synthetic-auth-cache.vercel.app',
  BETTER_AUTH_SECRET:'synthetic_cache_secret_only_012345678901234567890123456789',DATABASE_URL:database,
  TAX_ENGINE_STAGING_DATABASE_DATABASE_URL:mode==='preview'?database:undefined};
}
function harness(){
 const byDb = new WeakMap<object,Runtime>();
 const createAuthInstance = vi.fn((options:BetterAuthOptions)=>{
  const database:unknown=options.database;
  if(!database || typeof database!=='object' || !('db' in database) || !database.db || typeof database.db!=='object')throw new Error('Actual auth options must bind the returned database');
  const runtime=byDb.get(database.db);if(!runtime)throw new Error('Auth database must be one actually returned by current database API');
  // Only auth construction is synthetic; all Pool/Client SSL parsing is the installed implementation.
  const auth={options, handler:async()=>new Response('{}')} as unknown as ReturnType<typeof betterAuth>;
  bound.set(auth,runtime);return auth;
 });
 return {createAuthInstance, dependencies:{createAuthInstance, ensureAuthSchema:vi.fn(async()=>{}),getServerDatabase:async(env:Environment)=>{
  const value=await getHostedServerDatabase(env);resources.add(value);byDb.set(value.db,value);return value;
 }}};
}
function actual(auth:Auth){const value=bound.get(auth);if(!value)throw new Error('Retained auth must expose its actual bound runtime in this independent harness');return value;}
function ssl(auth:Auth){return new Client(actual(auth).pool.options).ssl;}
function verified(auth:Auth){const value:unknown=ssl(auth);expect(value).toBeTruthy();if(value!==true){if(!value || typeof value!=='object')throw new Error('Verified TLS requires actual structured options');expect(Reflect.get(value,'rejectUnauthorized')).not.toBe(false);expect(Reflect.get(value,'checkServerIdentity')).toBeUndefined();}}
const noSockets=()=>({pool:vi.spyOn(Pool.prototype,'connect').mockImplementation(()=>{throw new Error('No pool sockets allowed');}),client:vi.spyOn(Client.prototype,'connect').mockImplementation(()=>{throw new Error('No client sockets allowed');})});
let guards:ReturnType<typeof noSockets>;
beforeAll(()=>{guards=noSockets();});
afterEach(()=>{resetHostedAuthRuntimeCachesForTests();});
afterAll(async()=>{expect(guards.pool).not.toHaveBeenCalled();expect(guards.client).not.toHaveBeenCalled();guards.pool.mockRestore();guards.client.mockRestore();await Promise.all([...resources].map(value=>value.db.destroy()));});
describe('authentication effective TLS cache binding through existing APIs',()=>{
 it.each([['development','production'],['production','development'],['development','missing'],['missing','development'],['development','preview'],['preview','development']])('binds current effective pool when %s precedes %s',async(first,second)=>{
  const id='auth-transition-'+index++,a=environment(first,id),b=environment(second,id),before=structuredClone([a,b]);const h=harness();
  const firstAuth=await createHostedAuthForTests(getHostedAuthConfig(a),a,h.dependencies);
  const secondAuth=await createHostedAuthForTests(getHostedAuthConfig(b),b,h.dependencies);
  for(const [mode,auth] of [[first,firstAuth],[second,secondAuth]] as const){if(mode==='development')expect(ssl(auth)).toBe(false);else verified(auth);}
  expect(actual(firstAuth).pool).not.toBe(actual(secondAuth).pool);expect(firstAuth).not.toBe(secondAuth);
  expect(await createHostedAuthForTests(getHostedAuthConfig(a),a,h.dependencies)).toBe(firstAuth);
  expect(await createHostedAuthForTests(getHostedAuthConfig(b),b,h.dependencies)).toBe(secondAuth);expect([a,b]).toEqual(before);
 });
 it.each(['development','production','preview'])('preserves same-environment %s auth identity and source',async(mode)=>{
  const e=environment(mode,'auth-repeat-'+index++),before=structuredClone(e),h=harness();const a=await createHostedAuthForTests(getHostedAuthConfig(e),e,h.dependencies),b=await createHostedAuthForTests(getHostedAuthConfig(e),e,h.dependencies);
  expect(a).toBe(b);if(mode==='development')expect(ssl(a)).toBe(false);else verified(a);expect(e).toEqual(before);
  expect(actual(a).pool.options).toMatchObject({max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,statement_timeout:10000,lock_timeout:3000,idle_in_transaction_session_timeout:15000,query_timeout:15000,keepAlive:true,keepAliveInitialDelayMillis:10000});
 });
 it('retains verified remote development rather than extending plaintext by environment',async()=>{
  const e=environment('development','auth-remote-'+index++,'synthetic-auth-remote.invalid'),h=harness();const a=await createHostedAuthForTests(getHostedAuthConfig(e),e,h.dependencies);verified(a);expect(h.createAuthInstance).toHaveBeenCalledOnce();
 });
});
