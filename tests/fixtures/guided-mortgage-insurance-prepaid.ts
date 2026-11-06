/** Fictional complete inputs; never application defaults or derived expected tax outputs. */
import type { DeductionData } from '@/lib/guided-interview-flow';
import { emptyDeductionData } from '@/lib/guided-interview-flow';
import { completeMortgageSource, completeMortgageWorksheet } from '../guided-interview/complete-facts';
import { captureGuidedMortgageInsurancePrepaid, confirmGuidedMortgageInsurancePrepaid } from '@/lib/guided-mortgage-worksheet';
export function guidedMortgagePrepaidFixture(): DeductionData {
  return {...emptyDeductionData,method:'itemized',mortgageInterest:'100',mortgageWorksheet:{...completeMortgageWorksheet,sourceTaxYear:'2026'},mortgageEntries:[{
    ...completeMortgageSource,sourceTaxYear:'2026',originationDate:'2026-05-15',hasMortgageInsuranceAllocation:true,
    insuranceAllocationMethod:'current-original-prepaid',insuranceAllocationTaxYear:'2026',insuranceContractIssueDate:'2026-05-15',insuranceQualifiedProvider:true,insuranceAcquisitionDebt:true,insuranceQualifiedResidence:true,
    insurancePrepaid:{sourceReference:'fictional-private-prepaid-policy-and-paid-receipt',provider:'private',privateInsuranceMeetsHpaDefinition:true,allPremiumsIncluded:true,premiumAllocableBeyondYearEnd:true,prepaidPremiumPaid:'9240',paymentMethod:'cash',paidDate:'2026-05-15',insuranceObtainedDate:'2026-05-15',statedTermMonths:'180',mortgageOutstandingAtYearEnd:true,mortgageSatisfied:false,refinanced:false,premiumsRefunded:false,insuranceCancelled:false,otherBorrowerPayments:false,otherPremiumPayments:false},
  }]};
}
export function confirmedGuidedMortgagePrepaidFixture() {
  const data=guidedMortgagePrepaidFixture();const entry=present(present(data.mortgageEntries)[0]);
  entry.insurancePrepaid=captureGuidedMortgageInsurancePrepaid(data,0,2026,'single');
  entry.insurancePrepaid=confirmGuidedMortgageInsurancePrepaid(data,0,2026,'single');
  return data;
}

/** Missing synthetic fixture facts fail the test instead of being cast away. */
function present<T>(value:T|null|undefined):T {if(value==null)throw new Error('Missing synthetic fixture fact');return value;}
