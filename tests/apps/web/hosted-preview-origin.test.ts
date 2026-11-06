// Spec federal/hosted-preview-origin.yaml. No actual database/provider/SMTP calls.
import {expect, it} from 'vitest';
import {resolveHostedAppBaseUrl, shouldAllowSearchIndexing, shouldPreferLocalWorkspaceDraft} from '../../../apps/web/src/lib/hosted-runtime-safety';
import {getHostedAuthConfig} from '../../../apps/web/src/lib/hosted-auth';
import {getAllowedOrigins} from '../../../apps/web/src/lib/cors';
const env = {TAX_ENGINE_DEPLOYMENT_MODE:'hosted', NODE_ENV:'production', VERCEL_ENV:'preview', VERCEL_URL:'tax-engine-synthetic-a1.example-team.vercel.app', TAX_ENGINE_APP_URL:'https://vivalatax.com', BETTER_AUTH_SECRET:'synthetic-only-auth-origin-secret-123456789', TAX_ENGINE_STAGING_DATABASE_DATABASE_URL:'postgresql://synthetic:synthetic@localhost/staging'};
const origin = 'https://tax-engine-synthetic-a1.example-team.vercel.app';
it('selects the exact server-owned deployment origin',()=>{
 const before={...env};
 expect(resolveHostedAppBaseUrl(env)).toEqual({appBaseUrl:origin,blocked:false,hasValidConfiguredUrl:true});
 expect(env).toEqual(before);
});
it.each([undefined,'','  ','https://preview.vercel.app','http://preview.vercel.app','preview.vercel.app/','preview.vercel.app/path','preview.vercel.app?x=1','preview.vercel.app#x','preview.vercel.app:443','owner@preview.vercel.app','*.vercel.app','vercel.app','preview.vercel.app.attacker.test','localhost','127.0.0.1','preview..vercel.app','-preview.vercel.app','preview-.vercel.app','preview\n.vercel.app'])('blocks invalid preview metadata without shared-origin fallback: %s',value=>{
 for(const nodeEnv of ['production','development']){
  const e={...env,NODE_ENV:nodeEnv,VERCEL_URL:value};
  expect(resolveHostedAppBaseUrl(e)).toMatchObject({blocked:true,hasValidConfiguredUrl:false});
  expect(getHostedAuthConfig(e).blocked).toBe(true);
  expect(getAllowedOrigins(e).has('https://vivalatax.com')).toBe(false);
 }
});
it('propagates exact origin without widening preview trust',()=>{
 const config=getHostedAuthConfig(env);
 expect(config.baseURL).toBe(origin);expect(config.trustedOrigins).toEqual([origin]);expect(config.blocked).toBe(false);
 expect([...getAllowedOrigins(env)]).toEqual([origin]);
 expect(getAllowedOrigins(env).has('https://other-project.vercel.app')).toBe(false);
 expect(shouldAllowSearchIndexing(env)).toBe(false);expect(shouldPreferLocalWorkspaceDraft(env)).toBe(false);
});
it.each([
 {TAX_ENGINE_DEPLOYMENT_MODE:'hosted',VERCEL_ENV:'production'},
 {TAX_ENGINE_DEPLOYMENT_MODE:'hosted',VERCEL_ENV:'development'},
 {TAX_ENGINE_DEPLOYMENT_MODE:'hosted',VERCEL_ENV:undefined},
 {TAX_ENGINE_DEPLOYMENT_MODE:'hosted',VERCEL_ENV:'PREVIEW'},
 {TAX_ENGINE_DEPLOYMENT_MODE:'self-host',VERCEL_ENV:'preview'},
])('preserves explicit URL outside exact hosted preview: %j',patch=>{
 expect(resolveHostedAppBaseUrl({...env,...patch})).toEqual({appBaseUrl:'https://vivalatax.com',blocked:false,hasValidConfiguredUrl:true});
});
