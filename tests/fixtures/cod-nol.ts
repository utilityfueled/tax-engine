import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualNolInput } from './net-operating-loss.js';

/** Complete synthetic records, never production defaults. */
export function actualCodNolInput(amount = '40000') {
  const base = actualNolInput('100000', { priorYear: {} });
  if (!base.netOperatingLoss?.vintages?.[0] || !base.netOperatingLoss.alternativeTax) throw new Error('Missing synthetic carry');
  const first = base.netOperatingLoss.vintages[0];
  base.netOperatingLoss.vintages.push({ ...first, sourceId: 'loss2022', lossTaxYear: 2022, sourceReference: 'Actual2022 original loss', history: [] });
  base.netOperatingLoss.alternativeTax.vintages = base.netOperatingLoss.vintages.map(row => structuredClone(row));
  return TaxYearInputSchema.parse({ ...base,
    form1099C: [{ creditor: 'Original creditor', amountDischarged: amount, interestIncluded: '0', debtDescription: 'Unsecured personal loan',
      personallyLiable: true, identifiableEventCode: 'F', fmvOfProperty: '0' }],
    codExclusion: { bankruptcy: false, insolvency: { totalAssets: '10000', totalLiabilities: '120000' },
      electBasisReductionFirst: false, qualifiedFarmExclusion: '0', qualifiedRealPropertyBusinessExclusion: '0' },
    form982NolSources: { sourceTaxYear: 2025, sourceReference: 'Complete original debt and insolvency worksheet', sourceFactsConfirmed: true,
      allDischargesIncluded: true, title11Case: false, communityPropertyApplies: false, electBasisReductionFirst: false,
      otherExclusionsOrExceptionsApply: false, regularAndAlternativeExclusionSameConfirmed: true,
      debts: [{ sourceId: 'form1099C:0', statementId: 'Original statement-A', sourceTaxYear: 2025, sourceReference: 'Original creditor statement',
        accountHolder: 'primary', debtorName: 'Jane Doe', debtorSsnLast4: '6789', creditor: 'Original creditor', creditorTin: '12-3456789',
        accountReference: 'Original account-A', dischargeDate: '2025-10-01', amountDischarged: amount, interestIncluded: '0',
        debtDescription: 'Unsecured personal loan', personallyLiable: true, identifiableEventCode: 'F', fmvOfProperty: '0',
        unsecuredPersonalDebtConfirmed: true, noPropertyTransferConfirmed: true, sourceFactsConfirmed: true }],
      insolvency: { asOfDate: '2025-10-01', sourceReference: 'Actual immediately-before-discharge worksheet', sourceFactsConfirmed: true,
        immediatelyBeforeDischargeConfirmed: true, allAssetsIncluded: true, exemptAndRetirementAssetsIncluded: true, allLiabilitiesIncluded: true,
        assets: [{ sourceId: 'Asset-A', description: 'Actual total assets supported by worksheet', amount: '10000', sourceReference: 'Actual asset records' }],
        liabilities: [{ sourceId: 'Liability-A', description: 'Original personal recourse loan', amount: '120000', sourceReference: 'Actual loan balance', dischargedDebtSourceId: 'form1099C:0' }] },
    },
  });
}
