import { guidedSharedMarketplaceHealthRecords } from './guided-shared-marketplace-health-records';
import { actualNoAdvanceAllocationData } from './guided-no-advance-allocation';

/** Fictional actual enrollment/benchmark and independent original payment records. */
export function guidedSharedHealthOtherAllocationRecords(method:'default'|'no-advance') {
  const records=guidedSharedMarketplaceHealthRecords();
  if(method==='default') {
    const policy=records.coverage.sharedPolicyAllocations!.policies[0]!;
    policy.agreementConfirmed=false;policy.agreementReference='';policy.monthlyAllocations.forEach(row=>{row.fraction='';});
    policy.defaultAllocation={sourceReference:'Original enrollment application',enrollingTaxpayerSsn:'111-22-3333',allCoveredPeopleEnrolledByTaxpayerConfirmed:true};
  } else {
    records.coverage=actualNoAdvanceAllocationData();records.coverage.selfEmployedHealthInsuranceCoordinationRequired=true;
    records.coverage.sharedPolicyAllocations!.policies[0]!.noAdvanceAllocation!.monthlyBenchmarks.forEach(row=>{row.thisReturnSlcsp='1000';row.otherReturnSlcsp='500';});
    records.coverage.monthlyReconciliation.forEach(row=>{row.slcsp='1000';});
    for(const payment of records.health.plans[0]!.payments) {
      payment.grossPremium='1500';payment.ownerOrBusinessPaid='1000';payment.otherPersonPaid='500';payment.advancePremiumTaxCredit='0';
      payment.personAmounts[0]!.amountPaid='1000';payment.personAmounts.forEach(person=>{person.advancePremiumTaxCredit='0';});
    }
  }
  return records;
}
