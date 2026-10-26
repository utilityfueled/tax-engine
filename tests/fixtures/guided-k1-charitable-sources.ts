import type { K1CharitableSourcesData } from '@/lib/guided-k1-charitable-data';
import { actualGuidedK1Sources } from './guided-k1-qbi-sources';

/** Explicit fictional original statements and attachments, never application defaults. */
export function actualGuidedK1Charity(): K1CharitableSourcesData {
  return { sourceTaxYear: '2025', sourceReference: 'Fictional complete K1 charitable attachments', sourceFactsConfirmed: true,
    allK1CharitableSourcesIncluded: true, statements: [{ link: 'independent', originalSourceReference: 'Fictional original K1',
      allUnlistedAmountsZeroConfirmed: true, domesticContinuingNonPtpConfirmed: true,
      original: { taxYear: '2025', partnershipName: 'Fictional Giving Partners', partnershipEIN: '98-7654321', entityType: 'partnership', accountHolder: 'primary',
        ordinaryIncome: '0', interestIncome: '0', ordinaryDividends: '0', qualifiedDividends: '0', netShortTermCapitalGain: '0', netLongTermCapitalGain: '0',
        charitableCash: '0', charitableCapitalGain30: '150.00', charitableCapitalGain20: '0', beginningBasis: '30.00',
        taxExemptInterest: '0', otherTaxExemptIncome: '0', nondeductibleExpenses: '0', distributions: '0', federalIncomeTaxWithheld: '0',
        section199AQBI: '0', section199AW2Wages: '0', section199AUBIA: '0', section199AIsSST: false, isPassiveActivity: false, qbiMateriallyParticipated: true,
        selfEmploymentFactsConfirmed: true, selfEmploymentIncomeType: 'nonfarm', selfEmploymentEarnings: '0', selfEmploymentNetEarningsAfterAdjustments: '0',
        priorSuspendedLosses: { charitable: '0' }, form6198: { activityName: 'Fictional Giving Partners', ordinaryIncome: '0', gainLossFromDispositions: '0',
          otherIncomeGains: '0', otherDeductionsLosses: '0', adjustedBasisAtEffectiveDate: '0', priorYearAmountAtRisk: '20000', currentYearIncreases: '0', currentYearDecreases: '0' } },
      sameRegularAmtTreatmentConfirmed: true,
      basis: { sourceTaxYear: '2025', statementYearStart: '2025-01-01', statementYearEnd: '2025-12-31', sourceReference: 'Fictional original basis worksheet', sourceFactsConfirmed: true,
        entityName: 'Fictional Giving Partners', entityEIN: '98-7654321', entityType: 'partnership', accountHolder: 'primary', recipientName: 'Jordan Example', recipientTaxpayerIdLast4: '3333',
        basisFactsConfirmed: true, noOtherBasisChangesConfirmed: true, cashDistributionsOnlyConfirmed: true, priorBasisHistoryComplete: true,
        currentContributions: [{ sourceId: 'original-gift-1', category: 'capital_gain_30', contributionDate: '2025-06-01', contributionShare: '150.00', adjustedBasisShare: '50.00', sourceReference: 'Fictional allocated gift statement' }], priorBasisSuspensions: [] },
      receipts: [{ basisSourceId: 'original-gift-1', originalBox: '13', originalCode: 'E', recipientName: 'Fictional Public Charity', recipientCategory: 'fifty-percent', qualifiedOrganization: true,
        donorAdvisedFund: false, supportingOrganization: false, contributionDate: '2025-06-01', sourceReference: 'Fictional original receipt', propertyType: 'appreciated_stock', acquisitionDate: '2023-01-01', fairMarketValueShare: '150.00', qualifiedAppreciatedStock: true }],
      atRisk: { sourceTaxYear: '2025', sourceReference: 'Fictional complete activity worksheet', sourceFactsConfirmed: true, simplifiedMethodEligible: true, allActivityDeductionsIncluded: true,
        computation: 'subsequent_year', adjustedBasisAtEffectiveDate: '0', priorYearAmountAtRisk: '20000', currentYearIncreases: '0', currentYearDecreases: '0',
        priorLossHistory: { sourceTaxYear: '2024', sourceReference: 'Fictional known-empty prior at-risk history', sourceFactsConfirmed: true, vintages: [] } },
    }] };
}

/** One fictional original K-1 shared by charitable and qualified-loss records. */
export function actualGuidedLinkedK1Charity() {
  const charity = actualGuidedK1Charity(), qualifiedLoss = actualGuidedK1Sources();
  const q = qualifiedLoss.activities?.[0], s = charity.statements?.[0];
  if (!q?.statement || !q.basis || !q.atRisk || !s?.original?.form6198 || !s.basis?.currentContributions?.[0] || !s.receipts?.[0] || !s.atRisk) throw new Error('Missing fictional linked source');
  Object.assign(q, { allOtherAmountsZeroConfirmed: false, allOtherNonCharitableAmountsZeroConfirmed: true });
  Object.assign(q.statement, { ordinaryIncome: '-10000.00', section199AQBI: '-10000.00', selfEmploymentEarnings: '-10000.00' });
  q.basis.beginningBasis = '10000.00'; q.atRisk.priorYearAmountAtRisk = '20000';
  Object.assign(s, { link: 'qbi', qbiSourceId: 'scheduleK1:0' });
  Object.assign(s.original, { partnershipName: q.entityName, partnershipEIN: q.entityEIN, ordinaryIncome: '-10000.00', section199AQBI: '-10000.00', beginningBasis: '10000.00',
    charitableCash: '10000.00', charitableCapitalGain30: '0', selfEmploymentEarnings: '-10000.00', selfEmploymentNetEarningsAfterAdjustments: '-5000.00' });
  s.original.form6198.activityName = q.entityName; s.original.form6198.ordinaryIncome = '-5000.00';
  Object.assign(s.basis, { entityName: q.entityName, entityEIN: q.entityEIN });
  Object.assign(s.basis.currentContributions[0], { category: 'cash_60', contributionShare: '10000.00', adjustedBasisShare: '10000.00' });
  s.receipts[0].originalCode = 'A';
  return { charity, qualifiedLoss };
}
