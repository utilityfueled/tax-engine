import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const ORIGINAL_SHA='c5c723994d7336d22c341e25e531a33b713bd9227891d4b6aa4553a2adec32f3';
export const CANDIDATE_SHA='6085e9871fc1bee9325df49342efe8922d44bdde14a85db899aac1357c3c5885';
const hash=value=>createHash('sha256').update(value).digest('hex');
export function derive(original){
 assert.equal(typeof original,'string');assert.equal(hash(original),ORIGINAL_SHA);
 const candidate=original
  .replace(' known={};parsed={};active=set();',
   " # Negative-only literal filters; any hit retains the original ordered scanner.\n text_absence_filter=re.compile('|'.join(re.escape(m) for m in markers))\n byte_absence_filter=re.compile(b'|'.join(re.escape(v) for v in sorted({v for variants,ascii_numeric,numeric_value in compiled for v in variants})))\n known={};parsed={};active=set();")
  .replace(' def scan_bytes(data,label,spans=()):\n',' def scan_bytes(data,label,spans=()):\n  if len(data)<=4096 and byte_absence_filter.search(data) is None:return\n')
  .replace("  require(not any(m in s for m in markers),'private-marker')","  require(text_absence_filter.search(s) is None,'private-marker')");
 assert.equal(hash(candidate),CANDIDATE_SHA);return candidate;
}
export function compoundMode(environment,event){
 const enabled=value=>{assert.ok(value===undefined||value==='false'||value==='true');return value==='true';};
 const mode=enabled(environment);assert.equal(mode,enabled(event));return mode;
}
export function helperPlan(original,work,compound){
 assert.ok(path.isAbsolute(original)&&path.isAbsolute(work));assert.equal(typeof compound,'boolean');
 const candidate=path.join(work,'compound-helper.py');assert.notEqual(candidate,original);
 return {paths:{A:original,B:compound?candidate:original},hashes:{A:ORIGINAL_SHA,B:compound?CANDIDATE_SHA:ORIGINAL_SHA}};
}
