/** Spec: state/pa-married-dependent-care.yaml, paper-boundary. */
import {expect,it} from 'vitest';
import {preparePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context.js';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return.js';
import {paMarriedDependentCareFixture} from '../fixtures/pa-married-dependent-care.js';
it('admits qualified no-care child paper while retaining care projection denial',()=>{
 for(const care of [false,true]){const f=paMarriedDependentCareFixture({care});expect(()=>calculatePAMarriedOrdinaryReturn(f.input,f.sources)).not.toThrow();f.input.paMarriedOrdinarySources=structuredClone(f.sources);if(care)expect(()=>preparePAMarriedReturnReview(f.input)).toThrow(/care.*paper|care.*projection/i);else expect(()=>preparePAMarriedReturnReview(f.input)).not.toThrow();}
});
