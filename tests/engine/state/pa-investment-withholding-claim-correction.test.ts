// Spec: state/pa-ordinary-brokerage-sources.yaml, settled-NY-separate-claim-correction.
// Explicit fictional agency records; no actual user facts or NY filing method inferred.
import {expect,it} from 'vitest';
import {calculatePAInvestmentWithholdingAccount} from '@/engine/state/pa-investment-withholding-account';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {currentInvestmentOriginals,settledNYInvestmentAccount,unsupportedFiledReturnNYInvestmentAccount,incompleteInvestmentWithholdingState,confirmFictionalInvestmentStateSources} from '../../fixtures/pa-ordinary-brokerage-sources';
const asOf='2026-04-15';
it('actual NY erroneous-payment claim settles principal without a form withholding credit',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),before=structuredClone({input,packet});
 expect(packet.filedReturn.withholdingReported).toBe('0');expect(packet.filedReturn.refundRequested).toBe('0');
 const result=calculatePAInvestmentWithholdingAccount(input,[packet],asOf);
 expect(result[0].grossWithholding.toFixed()).toBe('400');expect(result[0].receivedRefunds.toFixed()).toBe('400');expect(result[0].netTaxPayments.toFixed()).toBe('0');expect(result[0].residentCredit.toFixed()).toBe('0');expect({input,packet}).toEqual(before);
});
it('actual NY erroneous-payment claim rejects the preserved unsupported IT203 B credit premise',()=>{
 const input=currentInvestmentOriginals(),old=unsupportedFiledReturnNYInvestmentAccount(input);
 expect(old.filedReturn.withholdingReported).toBe('400');expect(old.filedReturn.refundRequested).toBe('400');
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[old],asOf)).toThrow();
});
it.each(['missing','unsubmitted','wrong_return','wrong_principal','missing_payment','before_return'] as const)('actual NY erroneous-payment claim requires actual linked written claim %s',kind=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input);
 if(kind==='missing')Reflect.deleteProperty(packet,'erroneousPaymentClaim');
 if(kind==='unsubmitted')Reflect.set(packet.erroneousPaymentClaim,'actualWrittenClaimSubmittedConfirmed',null);
 if(kind==='wrong_return')packet.erroneousPaymentClaim.returnId='different-return';
 if(kind==='wrong_principal')packet.erroneousPaymentClaim.amountClaimed='399';
 if(kind==='missing_payment')packet.erroneousPaymentClaim.paymentConfirmationNumbers=[];
 if(kind==='before_return')packet.erroneousPaymentClaim.submittedOn='2026-01-31';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],asOf)).toThrow();
});
it.each(['missing','pending','no_certificate','no_comptroller','blank_certificate_reference','wrong_claim','wrong_principal','before_claim','future','positive_liability'] as const)('actual NY erroneous-payment claim requires issued agency allowance %s',kind=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input);
 if(kind==='missing')Reflect.deleteProperty(packet,'agencyDetermination');
 if(kind==='pending')packet.agencyDetermination.disposition='pending';
 if(kind==='no_certificate')Reflect.set(packet.agencyDetermination,'actualCommissionerCertificationConfirmed',null);
 if(kind==='no_comptroller')Reflect.set(packet.agencyDetermination,'actualComptrollerApprovalConfirmed',null);
 if(kind==='blank_certificate_reference')packet.agencyDetermination.commissionerCertificateReference='';
 if(kind==='wrong_claim')packet.agencyDetermination.claimId='other-claim';
 if(kind==='wrong_principal')packet.agencyDetermination.refundPrincipalAuthorized='399';
 if(kind==='before_claim')packet.agencyDetermination.issuedOn='2026-02-04';
 if(kind==='future')packet.agencyDetermination.issuedOn='2026-04-16';
 if(kind==='positive_liability')packet.agencyDetermination.taxLiabilityDetermined='1';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],asOf)).toThrow();
});
it.each(['unknown_interest','unconfirmed_allocation','wrong_principal','total_mismatch','wrong_determination','before_determination'] as const)('actual NY erroneous-payment claim requires received principal allocation %s',kind=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),receipt=packet.refunds[0];
 if(kind==='unknown_interest')Reflect.deleteProperty(receipt,'interestAmount');
 if(kind==='unconfirmed_allocation')Reflect.set(receipt,'actualPrincipalInterestAllocationConfirmed',null);
 if(kind==='wrong_principal')receipt.principalAmount='399';
 if(kind==='total_mismatch')receipt.amount='405';
 if(kind==='wrong_determination')receipt.determinationId='other-determination';
 if(kind==='before_determination')receipt.date='2026-02-19';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],asOf)).toThrow();
});
it('actual NY erroneous-payment claim separates actual refund interest from principal tax settlement',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input);packet.refunds[0].amount='405';packet.refunds[0].interestAmount='5';
 const result=calculatePAInvestmentWithholdingAccount(input,[packet],asOf);expect(result[0].grossWithholding.toFixed()).toBe('400');expect(result[0].receivedRefunds.toFixed()).toBe('400');expect(result[0].netTaxPayments.toFixed()).toBe('0');expect(result[0].residentCredit.toFixed()).toBe('0');
});
it('actual NY erroneous-payment claim never permits a separate claim to authorize a B return credit',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input);packet.filedReturn.withholdingReported='400';packet.filedReturn.refundRequested='400';
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],asOf)).toThrow();
});
it('actual NY separately allowed claim preserves full ordinary PA composition and original payments',()=>{
 const state=incompleteInvestmentWithholdingState();confirmFictionalInvestmentStateSources(state,'NY');
 const actual=state.sectionData['state-return'];if(!actual?.paResidencySources?.brokerageSources)throw Error('Explicit fictional source packet missing');
 const account=actual.paResidencySources.brokerageSources.settledNYAccounts[0];expect(account.filedReturn.withholdingReported).toBe('0');expect(account.filedReturn.refundRequested).toBe('0');
 const input={...currentInvestmentOriginals(state),paResidencySources:actual.paResidencySources},before=structuredClone(input),result=calculatePAOrdinaryReturn(input,actual.paOrdinaryReturnFacts,actual.paOrdinaryReturnCompletionSources);
 expect(result.pa40.stateWithholding.toFixed()).toBe('0');expect(result.pa40.residentCredit.toFixed()).toBe('0');expect(result.pa40.taxLiability.toFixed()).toBe('0');expect(computeGuidedPreview(state)?.state?.stateWithholding).toBe('0');expect(result.readiness.filingEligible).toBe(false);expect(input).toEqual(before);
});

it('actual NY claim rejects duplicate principal receipts despite semantic ID formatting',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input),original=packet.refunds[0];
 packet.refunds=[{...original,confirmationNumber:'fictional actual allocated principal receipt',amount:'200',principalAmount:'200'}, {...original,confirmationNumber:' FICTIONAL   ACTUAL ALLOCATED PRINCIPAL RECEIPT ',amount:'200',principalAmount:'200'}];
 expect(()=>calculatePAInvestmentWithholdingAccount(input,[packet],asOf)).toThrow(/duplicat.*receipt|receipt.*duplicat/i);
});

it('actual NY claim preserves optional absent R collection without inventing originals',()=>{
 const input=currentInvestmentOriginals(),packet=settledNYInvestmentAccount(input);Reflect.deleteProperty(input,'form1099R');const before=structuredClone(input);
 const result=calculatePAInvestmentWithholdingAccount(input,[packet],asOf);expect(result[0].grossWithholding.toFixed()).toBe('400');expect(input).toEqual(before);expect(Object.hasOwn(input,'form1099R')).toBe(false);
});
