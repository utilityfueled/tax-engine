// Spec: state/pa-brokerage-identity-independent.yaml; source-first independent controls.
import {expect,it} from 'vitest';
import {calculatePAOrdinaryBrokerageSources} from '@/engine/state/pa-ordinary-brokerage-sources';
import {brokeragePacket,paOrdinaryBrokerageFixture} from '../../fixtures/pa-ordinary-brokerage-sources';
const resident={status:'resident' as const,residentPeriods:[{from:'2025-01-01',through:'2025-12-31'}]};
function twoAccounts(sameAccount:boolean){
 const f=paOrdinaryBrokerageFixture();
 f.input.form1099B[0].accountReference='Fictional actual broker account A';
 const second=structuredClone(f.input.form1099B[0]);
 second.sourceId='Fictional independently provided second annual original';
 second.accountReference=sameAccount?'Fictional actual broker account A':'Fictional actual broker account B';
 if(sameAccount)second.broker='  fictional   actual securities broker  ';
 f.input.form1099B.push(second);
 return {input:f.input,packet:brokeragePacket(f.input)};
}
it('rejects the same actual TIN/account original disguised by broker display whitespace',()=>{
 const f=twoAccounts(true);
 expect(()=>calculatePAOrdinaryBrokerageSources(f.input,f.packet,resident)).toThrow(/duplicate|same.*original/i);
});
it('retains independently supplied distinct actual accounts with matching transaction values',()=>{
 const f=twoAccounts(false);
 const result=calculatePAOrdinaryBrokerageSources(f.input,f.packet,resident);
 expect(result.rawGainOrLoss.toFixed()).toBe('2000');
 expect(result.reportedGainOrLoss.toFixed()).toBe('2000');
});
