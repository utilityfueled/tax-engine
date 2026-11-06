import { TaxYearInputSchema } from '@/models/inputs.js';
import { sharedPolicyFixture } from './shared-policy.js';

/** Synthetic original statement and two independently obtained benchmarks. */
export function sharedNoAdvanceFixture() {
  const input = sharedPolicyFixture(), original = structuredClone(input.form1095A[0]);
  original.monthlyPremiums = original.monthlyPremiums.map(row => ({ ...row, enrolleePremium:'1500', slcsp:'2500', advancePremiumTaxCredit:'0' }));
  const policy = input.form8962!.sharedPolicyAllocations!.policies![0];
  return TaxYearInputSchema.parse({ ...input, form1095A:[original], form8962:{ ...input.form8962,
    monthlyReconciliation:input.form8962!.monthlyReconciliation!.map(row=>({...row,enrolleePremium:'1000',slcsp:'1200',advancePremiumTaxCredit:'0'})),
    sharedPolicyAllocations:{...input.form8962!.sharedPolicyAllocations, policies:[{...policy,
      original:structuredClone(original), situation:'no_advance_credit', originalSlcspCorrectConfirmed:false,
      agreementConfirmed:undefined,agreementReference:undefined,monthlyAllocations:undefined,
      noAdvanceAllocation:{sourceTaxYear:2025,sourceReference:'Actual separate coverage-family benchmark worksheets',sourceFactsConfirmed:true,allCoveredPeopleInCoverageFamiliesConfirmed:true,
        monthlyBenchmarks:original.monthlyPremiums.map(row=>({month:row.month,thisReturnSlcsp:'1200',otherReturnSlcsp:'600',
          thisReturnSourceReference:'Actual Jane benchmark lookup',otherReturnSourceReference:'Actual Robin benchmark lookup',
          thisReturnCoveredIndividualSsns:['123-45-6789'],otherReturnCoveredIndividualSsns:['234-56-7890']}))},
    }]},
  }});
}
