// Spec: state/pa-ordinary-oid-consumer-precision.yaml accepted-source-chain; fixture sanity before downstream controls.
import {it,expect} from 'vitest';
import {calculatePAOrdinaryOIDSources} from '@/engine/state/pa-ordinary-oid-sources.js';
import {oidConsumerPrecisionFixture,oidHugeInteger,oidHugePlus} from '../../fixtures/pa-ordinary-oid-consumer-precision.js';
it('pins accepted explicit OID originals before consumer precision checks',()=>{
 for(const [status,selected,excluded] of [['resident',oidHugePlus('2.51'),'0'],['part_year','2.02',oidHugeInteger+'.49'],['nonresident','0',oidHugePlus('2.51')]]as const){
  const f=oidConsumerPrecisionFixture(status),periods=status==='resident'?[{from:'2025-01-01',through:'2025-12-31'}]:status==='part_year'?[{from:'2025-07-01',through:'2025-12-31'}]:[];
  const r=calculatePAOrdinaryOIDSources(f.input,f.oidAndMiscSources,periods);expect(r.taxableInterest.toFixed()).toBe(selected);expect(r.excludedNonresidentInterest.toFixed()).toBe(excluded);
 }
});
