// Spec: spec/state/guided-misc-main-integration.yaml. Existing main APIs only.
import {expect,it} from 'vitest';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {calculateStateLocalIncomeTaxDeduction} from '@/engine/forms/state-local-income-tax-deduction';
import {confirmZeroIncomeMiscSource} from '@/lib/guided-zero-income-misc-sources';
import {completeTreasuryRouting} from '../fixtures/guided-state-routing-complete';
import {guidedPARetirementSourceFixture} from '../fixtures/guided-pa-bridge-complete';
import {fictionalMiscOriginal} from '../fixtures/guided-zero-income-misc';
import {guidedPARoyaltyComplete,guidedPARoyaltyLegacyBControl} from '../fixtures/guided-pa-royalty-complete';
function itemized(state:ReturnType<typeof completeTreasuryRouting>['state']){state.sectionData.deductions={method:'itemized',medicalExpenses:'0',stateLocalTaxes:'0',nonW2IncomeTaxesDeductedElsewhere:'0',realEstateTaxes:'0',personalPropertyTaxes:'0',mortgageInterest:'0',mortgageEntries:[],charitableContributions:'0',donationEntries:[],casualtyLosses:'0',otherItemized:'0',investmentInterestExpense:'0',gamblingWinnings:'0',gamblingLosses:'0',gamblingExpenses:'0'};return state;}
it.each(['PA','OH']as const)('current main finite MISC preview uses actual canonical sources %s',code=>{
 const state=completeTreasuryRouting(code,true,true).state,before=structuredClone(state),preview=computeGuidedPreview(state);
 expect(preview?.state).not.toBeNull();expect(preview?.state).toMatchObject({stateWithholding:'2000',stateTax:code==='PA'?'1842':'1217',stateRefund:code==='PA'?'158':'783',stateAmountOwed:'0'});expect(state).toEqual(before);
});
it.each(['PA','OH']as const)('current main itemized MISC claim contributes no second payment %s',code=>{
 const state=itemized(completeTreasuryRouting(code,true,true).state),before=structuredClone(state),raw=buildTaxInputFromGuidedData(state);
 expect(raw).not.toBeNull();if(!raw)throw Error('Actual current federal originals required');const input=TaxYearInputSchema.parse(raw),worksheet=calculateStateLocalIncomeTaxDeduction(input);
 expect(input.form1099Misc[0].stateWithheld).toBe('0.20');expect(worksheet.nonW2Withholding.toFixed()).toBe('0.3');expect(worksheet.statePaymentsInYear.toFixed()).toBe('0.3');expect(worksheet.additionalPayments.toFixed()).toBe('0');expect(worksheet.total.toFixed(2)).toBe('2000.60');expect(state).toEqual(before);
});
it('current main mixed R and MISC originals survive earlier bridge validation',()=>{
 const state=itemized(guidedPARetirementSourceFixture().state),data=state.sectionData['state-return'];if(!data)throw Error('Existing complete actual pension packet required');const original=fictionalMiscOriginal('PA');Object.assign(original,{recipientFirstName:'Jane',recipientLastName:'Doe'});data.zeroIncomeMiscSources=[confirmZeroIncomeMiscSource(original,2025,'single')];data.additionalStateWithholdingEntries=[...(data.additionalStateWithholdingEntries??[]),{payer:original.payer,documentType:'1099-MISC',state:'PA',taxYear:'2025',amount:'0.20'}];data.additionalStateWithholding='500.20';
 const before=structuredClone(state),raw=buildTaxInputFromGuidedData(state);expect(raw).not.toBeNull();if(!raw)throw Error('Actual existing original bridge must retain both source types');const input=TaxYearInputSchema.parse(raw),worksheet=calculateStateLocalIncomeTaxDeduction(input);
 expect(input.form1099R[0].stateWithheld).toBe('500');expect(input.form1099Misc[0].stateWithheld).toBe('0.20');expect(worksheet.additionalPayments.toFixed()).toBe('0');expect(worksheet.total.toFixed(2)).toBe('2500.20');expect(data.additionalStateWithholding).toBe('500.20');expect(state).toEqual(before);
});
it.each([false,true])('current main documented royalty history remains unchanged %s',corrected=>{
 const fixture=guidedPARoyaltyComplete('workspace',corrected),before=structuredClone(fixture.state),preview=computeGuidedPreview(fixture.state);
 expect(preview?.agi).toBe(corrected?'210900.5':'211000.5');expect(preview?.state?.stateTax).toBe(corrected?'6475':'6478');expect(fixture.refund.filedReturn.reportedWithholding).toBe('80');expect(fixture.refund.refund.amount).toBe('80.20');expect(fixture.state).toEqual(before);
});
it('current main unknown royalty history stays unknown',()=>{
 const fixture=guidedPARoyaltyLegacyBControl('workspace'),before=structuredClone(fixture.state),preview=computeGuidedPreview(fixture.state);expect(preview?.agi).toBe('211000.5');expect(preview?.state).toBeNull();expect(fixture.state).toEqual(before);
});
