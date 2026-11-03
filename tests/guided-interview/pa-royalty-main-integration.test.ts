// Spec: state/pa-royalty-main-integration.yaml. Existing production consumers only.
import {expect,it} from 'vitest';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {guidedPARoyaltyComplete,guidedPARoyaltyLegacyBControl} from '../fixtures/guided-pa-royalty-complete';
it.each([false,true])('current main replays separately documented royalty history %s',corrected=>{
 const f=guidedPARoyaltyComplete('workspace',corrected),before=JSON.stringify(f.state),r=computeGuidedPreview(f.state);
 expect(r?.agi).toBe(corrected?'210900.5':'211000.5');
 expect(r?.state?.stateTax).toBe(corrected?'6475':'6478');expect(r?.state?.stateWithholding).toBe('0');
 expect(f.refund.filedReturn.reportedWithholding).toBe('80');expect(f.refund.refund.amount).toBe('80.20');expect(JSON.stringify(f.state)).toBe(before);
});
it('current main keeps undocumented history unknown',()=>{
 const f=guidedPARoyaltyLegacyBControl('workspace'),before=JSON.stringify(f.state),r=computeGuidedPreview(f.state);
 expect(r?.agi).toBe('211000.5');expect(r?.state).toBeNull();expect(JSON.stringify(f.state)).toBe(before);
});
