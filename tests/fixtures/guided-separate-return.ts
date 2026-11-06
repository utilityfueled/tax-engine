import type { PremiumTaxCreditData } from '@/lib/guided-premium-tax-credit-facts';
import { actualSharedPolicyData } from './guided-shared-policy';
/** Synthetic records for a policy shared with a spouse on a separate return. */
export function actualSeparateReturnData(exception: boolean): PremiumTaxCreditData {
 const data = actualSharedPolicyData(), policy = data.sharedPolicyAllocations!.policies[0]!;
 data.marriedFilingSeparatelyExceptionConfirmed = exception;
 for (const original of [data.policies[0]!, policy.original!]) original.coveredIndividuals![1] = { ...original.coveredIndividuals![1]!, name: 'Taylor Example', ssn: '222-33-4444' };
 policy.coveredFamilyAssignments[1]!.ssn = '222-33-4444';
 Object.assign(policy, { otherTaxpayerName: 'Taylor Example', otherTaxpayerSsn: '222-33-4444', situation: 'married_separate', noCurrentYearMarriageOrDivorceConfirmed: null, originalSlcspCorrectConfirmed: null, agreementConfirmed: null, agreementReference: '',
  monthlyAllocations: policy.monthlyAllocations.map(row => ({ ...row, fraction: '' })),
  separateReturn: { sourceReference: 'Synthetic separate-return records', marriedAtYearEndConfirmed: true, onlySpouseTaxFamiliesConfirmed: true,
   ownCoverageFamilySlcsp: Array.from({ length: 12 }, (_, i) => ({ month: String(i + 1), slcsp: exception ? '420' : '' })) } });
 data.monthlyReconciliation = data.monthlyReconciliation.map(row => ({ ...row, enrolleePremium: exception ? '500' : '0', slcsp: exception ? '420' : '0', advancePremiumTaxCredit: '250' }));
 return data;
}
