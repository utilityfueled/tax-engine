/** Spec: state/oh-sd-100-guided-remaining-balance.yaml. Real canonical guided adapter controls. */
import {expect,it} from 'vitest';
import {confirmGuidedOhioSchoolDistrictFacts,buildGuidedOhioSchoolDistrictFacts} from '@/lib/guided-ohio-school-district-facts';
import {buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {calculateFederalTax} from '@/engine/federal';
import {buildOhioResidentReturnInput} from '@/engine/state/oh-input-adapter';
import {calculateOhioResidentReturn} from '@/engine/state/oh-return';
import {createWorkspaceRecord,syncGuidedFlowToWorkspace} from '@/lib/workspace-storage';
import {buildGuidedSyntheticDocuments,buildGuidedFactAnswers} from '@/lib/guided-interview-bridge';
import {sanitizeWorkspaceForHostedStorage} from '@/lib/hosted-privacy';
import {buildProviderWorkspaceRequest} from '@/lib/provider-workspace-request';
import {guidedSchoolBalanceFixture} from '../../fixtures/guided-oh-sd-100-remaining-balance';
function confirm(f:ReturnType<typeof guidedSchoolBalanceFixture>){return confirmGuidedOhioSchoolDistrictFacts(f.original,f.draft,f.data.ohioResidency,f.data.ohioPayments);}
it('confirms and replays actual string-year balance originals without a second credit',()=>{
 const f=guidedSchoolBalanceFixture(),before=structuredClone(f),d=confirm(f);f.data.ohioSchoolDistrict=d;
 const original=buildGuidedStateOriginals(f.original,f.state),result=calculateOhioResidentReturn(buildOhioResidentReturnInput(original,calculateFederalTax(original)));
 expect(original.ohioSchoolDistrict?.payments.remainingTaxPayment).toMatchObject({status:'actual_payment',original:{taxYear:2025,amount:'400'}});
 expect(result.sd100?.line18_totalAmountDue.toString()).toBe('400');expect(result.sd100?.line12_estimatedPayments.toString()).toBe('0');
 expect(result.schoolDistrictSource?.remainingTaxPayment?.outstandingTaxBalance.toString()).toBe('0');
 expect(f.original).toEqual(before.original);expect(f.draft).toEqual(before.draft);
});
it('preserves unknown and contradictory inactive payment evidence',()=>{
 for(const value of [undefined,'']){const f=guidedSchoolBalanceFixture('unpaid');Reflect.set(f.draft.payments.account,'currentOriginalReturnPaymentCredited',value);expect(()=>confirm(f)).toThrow();}
 for(const status of ['unpaid','no_remaining_tax','expected_payment']){const f=guidedSchoolBalanceFixture();f.draft.payments.remainingTaxPayment.status=status;const before=structuredClone(f.draft);expect(()=>confirm(f)).toThrow();expect(f.draft).toEqual(before);}
 for(const status of ['unpaid','expected_payment']as const){const f=guidedSchoolBalanceFixture(status),d=confirm(f);expect(buildGuidedOhioSchoolDistrictFacts(f.original,d,f.data.ohioResidency,f.data.ohioPayments).payments.account.currentOriginalReturnPaymentCredited).toBe('0');}
});
it('reopens private balance facts without promoting them into hosted projections',()=>{
 const f=guidedSchoolBalanceFixture(),d=confirm(f),saved=JSON.parse(JSON.stringify(d)),before=structuredClone(saved);
 expect(buildGuidedOhioSchoolDistrictFacts(f.original,saved,f.data.ohioResidency,f.data.ohioPayments)).toEqual(f.facts);expect(saved).toEqual(before);
 f.data.ohioSchoolDistrict=saved;
 const workspace=syncGuidedFlowToWorkspace(createWorkspaceRecord('opaque-sd-balance',{now:'2026-11-15T00:00:00.000Z'}),buildGuidedSyntheticDocuments(f.state),buildGuidedFactAnswers(f.state),f.state);
 const privateLocal=Object.assign(workspace,{guidedFlowState:f.state,ohioSchoolDistrict:f.facts});
 for(const payload of [JSON.stringify(sanitizeWorkspaceForHostedStorage(privateLocal)),JSON.stringify(buildProviderWorkspaceRequest(privateLocal,{now:'2026-11-15T00:00:00.000Z'}))]){
  for(const marker of ['PRIVATE-FICTIONAL-SD-CURRENT-RETURN-PAYMENT','PRIVATE-FICTIONAL-SD-GUIDE-BALANCE',f.original.taxpayer.primary.ssn,'currentOriginalReturnPaymentCredited','guidedFlowState'])expect(payload).not.toContain(marker);
 }
});
