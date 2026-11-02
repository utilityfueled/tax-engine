// Spec: spec/federal/form-1099-da-state-rows.yaml.
import { expect,it } from 'vitest';
import { buildDigitalAssetInputs,updateDigitalAssetEntry } from '@/lib/guided-digital-asset-facts';
import { actualGuidedDigitalAsset } from '../fixtures/guided-digital-asset-sources';
import { completePersonalInfo } from './complete-facts';
it('preserves actual state rows through the guide and invalidates edits',()=>{
 const entry={...actualGuidedDigitalAsset(),stateTaxReporting:'multiple' as const,stateWithheld:undefined,
 stateWithholding:[{state:'PA',stateIdentificationNumber:'PA-original',stateWithheld:'0.10'},{state:'OH',stateIdentificationNumberBlank:true,stateWithheld:'0'}]};
 expect(buildDigitalAssetInputs([entry],'single',2025,completePersonalInfo)[0].stateWithholding).toEqual([
 {state:'PA',stateIdentificationNumber:'PA-original',stateWithheld:'0.10'},{state:'OH',stateIdentificationNumber:'',stateWithheld:'0'}]);
 expect(updateDigitalAssetEntry(entry,{stateWithholding:[entry.stateWithholding[0],{...entry.stateWithholding[1],stateWithheld:'0.20'}]}).sourceFactsConfirmed).toBeNull();
 const unknown={...entry,stateWithholding:[entry.stateWithholding[0],{state:'OH',stateWithheld:'0'}]};
 expect(()=>buildDigitalAssetInputs([unknown],'single',2025,completePersonalInfo)).toThrow();
});

it('keeps retained scalar state IDs visible to no-state validation',()=>{
 const none=actualGuidedDigitalAsset();
 expect(()=>buildDigitalAssetInputs([{...none,stateIdentificationNumber:'ORIGINAL-STATE-ID'}],'single',2025,completePersonalInfo)).toThrow(/no-state.*identif|no-state.*conflict/i);
 for(const stateIdentificationNumber of ['', '   ']) expect(buildDigitalAssetInputs([{...none,stateIdentificationNumber}],'single',2025,completePersonalInfo)[0].stateIdentificationNumber).toBe(stateIdentificationNumber);
});
