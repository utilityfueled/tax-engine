// Spec: spec/browser/new212-host-pdf-timing.yaml
import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {environment} from '../../scripts/run-browser-tests.mjs';
describe('NEW212 optional host PDF timing',()=>{
 it('forwards only exact opt-in without opening other environment scope',()=>{
  for(const value of [undefined,'','0','true',' 1','1 ','private']){const e=environment({TAX_ENGINE_TEST_NEW212_TIMING:value});expect(e).not.toHaveProperty('TAX_ENGINE_TEST_NEW212_TIMING');}
  const e=environment({TAX_ENGINE_TEST_NEW212_TIMING:'1',TAX_ENGINE_PDF_TEST_PYTHON:'/fixed/python',PATH:'/fixed/path',OPENAI_API_KEY:'private',DATABASE_URL:'private',NODE_OPTIONS:'--inspect',TAX_BROWSER_CPU_DIAGNOSTICS:'1',TAX_BROWSER_CPU_OUTPUT:'/private',PLAYWRIGHT_BASE_URL:'https://foreign.invalid'});
  expect(e.TAX_ENGINE_TEST_NEW212_TIMING).toBe('1');expect(e.TAX_ENGINE_PDF_TEST_PYTHON).toBe('/fixed/python');
  for(const key of ['OPENAI_API_KEY','DATABASE_URL','NODE_OPTIONS','TAX_BROWSER_CPU_DIAGNOSTICS','TAX_BROWSER_CPU_OUTPUT','PLAYWRIGHT_BASE_URL'])expect(e).not.toHaveProperty(key);
 });
 it('propagates the same fixed opt-in through both actual runner constructions',async()=>{
  const cpu=await readFile(new URL('../../scripts/browser-cpu-diagnostics/runner.mjs',import.meta.url),'utf8');
  const ordinary=await readFile(new URL('../../scripts/run-browser-tests.mjs',import.meta.url),'utf8');
  const cpuExpression=cpu.match(/const childEnv = (\{ \.\.\.environment\(env\), PLAYWRIGHT_BASE_URL: ORIGIN \});/u)?.[1];
  const profileExpression=cpu.match(/const profilerEnv = (\{ \.\.\.childEnv, TAX_BROWSER_CPU_DIAGNOSTICS: '1', TAX_BROWSER_CPU_OUTPUT: profileDirectory, TAX_BROWSER_CPU_INVENTORY: inventoryFile \});/u)?.[1];
  const normalExpression=ordinary.match(/const env = (\{ \.\.\.environment\(parentEnv\), PLAYWRIGHT_BASE_URL: external \? 'http:\/\/127\.0\.0\.1:3109' : 'http:\/\/127\.0\.0\.1:3099' \});/u)?.[1];
  expect(cpuExpression).toBeTruthy();expect(profileExpression).toBeTruthy();expect(normalExpression).toBeTruthy();
  for(const flag of [undefined,'0','1','true']){
   const parent={TAX_ENGINE_TEST_NEW212_TIMING:flag,OPENAI_API_KEY:'private'};
   const child=Function('environment','env','ORIGIN','return '+cpuExpression)(environment,parent,'http://127.0.0.1:3109');
   const profile=Function('childEnv','profileDirectory','inventoryFile','return '+profileExpression)(child,'/fixed/profile','/fixed/inventory');
   const normal=Function('environment','parentEnv','external','return '+normalExpression)(environment,parent,true);
   for(const e of [child,profile,normal]){expect(e.TAX_ENGINE_TEST_NEW212_TIMING).toBe(flag==='1'?'1':undefined);expect(e).not.toHaveProperty('OPENAI_API_KEY');}
  }
 });
});
