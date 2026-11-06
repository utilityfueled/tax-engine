import { TaxYearInputSchema } from '@/models/inputs.js';
import { d } from '@/utils/decimal.js';
import { simpleW2Fixture } from './simple-w2.js';

/** Complete fictional original policy, actual payment and marriage records. */
export function marketplaceMarriageHealthInput(year = 2025, historicalLimit = false) {
  const months = Array.from({ length: 12 }, (_, index) => index + 1);
  const primary = { ...simpleW2Fixture.taxpayer.primary, firstName: 'Avery', lastName: 'Example', ssn: '111-22-3333' };
  const spouse = { ...simpleW2Fixture.taxpayer.primary, firstName: 'Blair', lastName: 'Example', ssn: '444-55-6666' };
  const premium = '1000', benchmark = historicalLimit ? '1000' : '800', advance = historicalLimit ? '900' : '700';
  const paid = d(premium).minus(advance).toFixed();
  const original = { taxYear: year, marketplace: 'Fictional actual Marketplace', policyNumber: 'MARRIAGE-HEALTH-ORIGINAL',
    recipientName: 'Avery Example', recipientSsn: primary.ssn,
    coveredIndividuals: [{ name: 'Avery Example', ssn: primary.ssn, firstMonth: 1, lastMonth: 12 }],
    monthlyPremiums: months.map(month => ({ month, enrolleePremium: premium, slcsp: benchmark, advancePremiumTaxCredit: advance })) };
  return TaxYearInputSchema.parse({ ...structuredClone(simpleW2Fixture),
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, filingStatus: 'married_filing_jointly', primary, spouse },
    w2s: historicalLimit ? [{ ...simpleW2Fixture.w2s[0], accountHolder: 'spouse', wages: '7439', socialSecurityWages: '7439', socialSecurityTips: '0', allocatedTips: '0',
      socialSecurityWithheld: '461.218', medicareWages: '7439', medicareWithheld: '107.8655', federalWithheld: '0' }] : [],
    scheduleC: { accountHolder: 'primary', businessName: 'Fictional actual proprietor', grossReceipts: historicalLimit ? '60000' : '100000', qbiMateriallyParticipated: true },
    form2210: { calendarYearTaxpayer: true, residentReturn: true, farmerOrFisher: false, disasterReliefClaimed: false, waiverRequested: false,
      calculationMethod: 'regular', withholdingMethod: 'equal-installments', priorYearTaxStatus: 'no-tax-liability', priorYearFullYear: true,
      priorYearResidentAllYear: true, priorYearTaxComputationConfirmed: true, priorYearTaxForForm2210: '0' },
    form1095A: [original],
    form8962: { taxFamilySize: 2, fplRegion: 'contiguous', requiredFilingDependentsModifiedAGI: '0', householdFactsConfirmed: true,
      canBeClaimedAsDependent: false, belowPovertyException: 'none', coverageFactsConfirmed: true, allocationRequired: false,
      alternativeMarriageCalculationElected: true, selfEmployedHealthInsuranceCoordinationRequired: true,
      lawfulPresenceReconciliationRequired: false, qsehraAffected: false,
      monthlyReconciliation: original.monthlyPremiums.map(row => ({ ...row, coverageEligible: true, incomeBasedSepEnrollment: false })),
      marriageSources: { sourceTaxYear: year, sourceReference: 'Actual marriage and original policy records', sourceFactsConfirmed: true,
        allPoliciesIncluded: true, primaryName: 'Avery Example', primarySsn: primary.ssn, spouseName: 'Blair Example', spouseSsn: spouse.ssn,
        marriageDate: `${year}-07-15`, primaryUnmarriedOnJanuary1: true, spouseUnmarriedOnJanuary1: true, marriedToEachOtherOnDecember31: true,
        allDependentAssignmentsIncluded: true, dependents: [], policies: [{ sourceId: 'form1095A:0', sourceReference: 'Actual original Form1095A',
          original: structuredClone(original), fullMonthCoverageConfirmed: true, allCoveredIndividualsEligibleForPtcConfirmed: true }],
        benchmarks: months.filter(month => month <= 7).map(month => ({ owner: 'primary', month, slcsp: benchmark,
          sourceReference: 'Actual pre-marriage single-person benchmark', sourceFactsConfirmed: true, coveredIndividualSsns: [primary.ssn] })) } },
    form7206: { sourceTaxYear: year, sourceReference: 'Actual independent business and payment ledger', sourceFactsConfirmed: true, allPlansIncluded: true,
      persons: [{ personId: 'primary', name: 'Avery Example', householdRole: 'primary', attainedAgeAtYearEnd: year - 1990 }],
      plans: [{ planId: 'medical', policyReference: 'Actual health policy', accountHolder: 'primary', businessSourceId: 'scheduleC', businessKind: 'self_employed',
        kind: 'medical', policyHolder: 'individual', establishedUnderBusiness: true, insuranceQualificationConfirmed: true,
        marketplaceCoverage: true, premiumTaxCreditInvolved: true, marketplacePolicySourceIds: ['form1095A:0'], allCoveredPersonsInCoverageFamilyConfirmed: true,
        clergySpecialRules: false, coveredPersons: [{ personId: 'primary', relationshipToOwner: 'self' }],
        months: months.map(month => ({ month, employerSubsidizedPlanEligible: false })),
        payments: months.map(month => ({ sourceId: `original-payment-${month}`, datePaid: `${year}-${String(month).padStart(2, '0')}-01`,
          coverageTaxYear: year, coverageMonth: month, grossPremium: premium, ownerOrBusinessPaid: paid, otherPersonPaid: '0', advancePremiumTaxCredit: advance,
          personAmounts: [{ personId: 'primary', payer: 'owner_after_tax', amountPaid: paid, advancePremiumTaxCredit: advance,
            excludedPublicSafetyOfficerAmount: '0', otherTaxFreeFunding: '0' }] })) }] } });
}

/** Existing supported two-owner businesses with distinct actual recipient groups. */
export function twoOwnerMarketplaceMarriageHealthInput(year = 2025) {
  const input = marketplaceMarriageHealthInput(year);
  input.scheduleC!.grossReceipts = '60000';
  input.scheduleF = { accountHolder: 'spouse', principalCropOrActivity: 'Fictional actual farm', salesOfProductsRaised: '40000', qbiMateriallyParticipated: true };
  const sourcePlan = structuredClone(input.form7206!.plans![0]);
  input.form1095A = (['primary', 'spouse'] as const).map((owner, index) => {
    const person = input.taxpayer[owner]!;
    return { ...structuredClone(input.form1095A[0]), policyNumber: `ACTUAL-MARRIAGE-${owner}`,
      recipientName: `${person.firstName} ${person.lastName}`, recipientSsn: person.ssn,
      coveredIndividuals: [{ name: `${person.firstName} ${person.lastName}`, ssn: person.ssn, firstMonth: 1, lastMonth: 12 }],
      monthlyPremiums: input.form1095A[0].monthlyPremiums.map(row => ({ ...row, enrolleePremium: index ? '500' : '1000', slcsp: index ? '400' : '800', advancePremiumTaxCredit: index ? '450' : '900' })) };
  });
  input.form8962!.monthlyReconciliation = input.form1095A[0].monthlyPremiums.map(row => ({...row, enrolleePremium:'1500',slcsp:'1200',advancePremiumTaxCredit:'1350',coverageEligible:true,incomeBasedSepEnrollment:false}));
  input.form8962!.marriageSources!.policies = input.form1095A.map((original,index) => ({sourceId:`form1095A:${index}`,sourceReference:`Actual original policy ${index}`,original:structuredClone(original),fullMonthCoverageConfirmed:true,allCoveredIndividualsEligibleForPtcConfirmed:true}));
  input.form8962!.marriageSources!.benchmarks = (['primary','spouse'] as const).flatMap((owner,index) => input.form1095A[index].monthlyPremiums.filter(row => row.month <= 7).map(row => ({owner,month:row.month,slcsp:index?'400':'800',sourceReference:`Actual ${owner} alternative benchmark`,sourceFactsConfirmed:true,coveredIndividualSsns:[input.taxpayer[owner]!.ssn]})));
  input.form7206!.persons!.push({personId:'spouse',name:'Blair Example',householdRole:'spouse',attainedAgeAtYearEnd:year-1990});
  input.form7206!.plans = (['primary','spouse'] as const).map((owner,index) => ({...structuredClone(sourcePlan),planId:`medical-${owner}`,accountHolder:owner,businessSourceId:index?'scheduleF':'scheduleC',marketplacePolicySourceIds:[`form1095A:${index}`],coveredPersons:[{personId:owner,relationshipToOwner:'self' as const}],
    payments:sourcePlan.payments!.map(payment => ({...payment,sourceId:`${owner}-${payment.sourceId}`,grossPremium:index?'500':'1000',ownerOrBusinessPaid:index?'50':'100',advancePremiumTaxCredit:index?'450':'900',personAmounts:[{personId:owner,payer:'owner_after_tax' as const,amountPaid:index?'50':'100',advancePremiumTaxCredit:index?'450':'900',excludedPublicSafetyOfficerAmount:'0',otherTaxFreeFunding:'0'}]}))}));
  return TaxYearInputSchema.parse(input);
}

/** Explicit original zero January followed by actual February-December coverage. */
export function zeroMonthMarketplaceMarriageHealthInput() {
  const input = marketplaceMarriageHealthInput();
  const policy = input.form1095A[0];
  policy.coveredIndividuals![0].firstMonth = 2;
  Object.assign(policy.monthlyPremiums[0], { enrolleePremium: '0', slcsp: '0', advancePremiumTaxCredit: '0' });
  input.form8962!.marriageSources!.policies![0].original = structuredClone(policy);
  input.form8962!.marriageSources!.benchmarks = input.form8962!.marriageSources!.benchmarks!.filter(row => row.month !== 1);
  Object.assign(input.form8962!.monthlyReconciliation![0], { enrolleePremium: '0', slcsp: '0', advancePremiumTaxCredit: '0', coverageEligible: false });
  const plan = input.form7206!.plans![0];
  Object.assign(plan.payments![0], { grossPremium: '0', ownerOrBusinessPaid: '0', otherPersonPaid: '0', advancePremiumTaxCredit: '0' });
  Object.assign(plan.payments![0].personAmounts![0], { amountPaid: '0', advancePremiumTaxCredit: '0' });
  return input;
}
