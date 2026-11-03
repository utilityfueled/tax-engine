/** Actual fictional original household; literal paper expectations predate products. */
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {paMarriedNativePublicFixture,type NativeMarriedCase} from './pa-married-native-public.js';
export function paMarriedOfficialFixture(mode:'J'|'M'='M',name:NativeMarriedCase='whole'){
 const f=paMarriedNativePublicFixture(mode,name);
 f.input.paMarriedOrdinarySources=f.sources;
 const federal=calculateFederalTax(f.input),married=calculatePAMarriedOrdinaryReturn(f.input,f.sources);
 return {...f,married,result:{...federal,stateReturns:{pennsylvania:married}}};
}
export const PA_MARRIED_PAPER_ORACLES=[
 {mode:'J',name:'whole',returns:[{owner:'joint',wages:'80000',withholding:'2456',tax:'2456',eligibility:'80000',credit:'0',refund:'0'}]},
 {mode:'M',name:'whole',returns:[{owner:'primary',wages:'50000',withholding:'1535',tax:'1535',eligibility:'80000',credit:'0',refund:'0'},{owner:'spouse',wages:'30000',withholding:'921',tax:'921',eligibility:'80000',credit:'0',refund:'0'}]},
 {mode:'J',name:'cents',returns:[{owner:'joint',wages:'80001',withholding:'2457',tax:'2456',eligibility:'80001',credit:'0',refund:'1'}]},
 {mode:'M',name:'cents',returns:[{owner:'primary',wages:'50000',withholding:'1535',tax:'1535',eligibility:'80000',credit:'0',refund:'0'},{owner:'spouse',wages:'30000',withholding:'921',tax:'921',eligibility:'80000',credit:'0',refund:'0'}]},
 {mode:'J',name:'shared-sp',returns:[{owner:'joint',wages:'13001',withholding:'399',tax:'399',eligibility:'13001',credit:'359',refund:'359'}]},
 {mode:'M',name:'shared-sp',returns:[{owner:'primary',wages:'10000',withholding:'307',tax:'307',eligibility:'13001',credit:'276',refund:'276'},{owner:'spouse',wages:'3001',withholding:'92',tax:'92',eligibility:'13001',credit:'83',refund:'83'}]},
] as const;
