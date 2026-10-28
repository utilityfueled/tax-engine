import { actualCodNolInput } from './cod-nol.js';

/** Original synthetic records, explicitly confirmed; never production defaults. */
export function emptyCodAttributeLedger() {
  return {
    sourceReference: 'Fictional complete after-current-tax attribute worksheet',
    sourceFactsConfirmed: true, allAttributesIncluded: true,
    records: [] as ReturnType<typeof codAttributeRecord>[],
    property: {
      immediatelyAfter: {
        asOfDate: '2025-10-01', sourceReference: 'Fictional immediately-after property and liability records',
        sourceFactsConfirmed: true, allPropertyAndMoneyIncluded: true, allLiabilitiesIncluded: true,
        money: '0', properties: [] as ReturnType<typeof codPropertyRecord>[],
        liabilities: [] as Array<{ sourceId: string; amount: string; sourceReference: string }>,
      },
      followingYear: {
        asOfDate: '2026-01-01', sourceReference: 'Fictional beginning-next-year property records',
        sourceFactsConfirmed: true, allPropertyIncluded: true,
        properties: [] as ReturnType<typeof codPropertyRecord>[],
        dispositions: [] as Array<{ propertyId: string; disposedDate: string; sourceReference: string; sourceFactsConfirmed: boolean }>,
      },
    },
  };
}

export function codAttributeRecord(kind: 'general_business_credit' | 'minimum_tax_credit' | 'capital_loss' | 'passive_loss' | 'passive_credit' | 'foreign_tax_credit', amount: string, use = '0') {
  return {
    sourceId: `${kind}:original`, kind, originTaxYear: 2024, originalAmount: amount,
    originalAmountMeaning: 'original_year_closing_carry' as 'original_year_closing_carry' | 'current_year_before_use',
    sourceReference: `Fictional original ${kind} worksheet`, sourceFactsConfirmed: true,
    allHistoryIncluded: true, history: [] as Array<{ taxYear: number; used: string; reduced: string; expired: string; sourceReference: string }>,
    currentYearUse: use, currentYearCarryback: '0', currentYearExpired: '0',
    currentYearUseSourceReference: 'Fictional current return use and carryback worksheet',
    term: 'short' as 'short' | 'long', activityName: 'Fictional retained passive activity',
    creditKind: 'other', foreignCategory: 'general' as 'general' | 'passive',
  };
}

export function codPropertyRecord(propertyId: string, adjustedBasis: string, category: 'other_business' | 'inventory' | 'personal' = 'personal') {
  return {
    propertyId, description: `Fictional ${propertyId}`, adjustedBasis, category,
    acquiredDate: '2024-01-01', sourceReference: `Fictional original ${propertyId} basis record`,
    sourceFactsConfirmed: true, securedDischargedDebt: false,
    priorSnapshotChangeReference: 'Fictional documented unchanged basis between the two dates',
  };
}

export function actualCodAttributesInput(amount = '5000') {
  const input = actualCodNolInput(amount);
  if (!input.netOperatingLoss?.alternativeTax) throw new Error('Missing original synthetic NOL histories');
  input.netOperatingLoss.vintages = [];
  input.netOperatingLoss.alternativeTax.vintages = [];
  if (!input.codExclusion?.insolvency || !input.form982NolSources?.insolvency) throw new Error('Missing original insolvency facts');
  input.codExclusion.insolvency = { totalAssets: '0', totalLiabilities: amount };
  input.form982NolSources.insolvency.assets = [];
  input.form982NolSources.insolvency.liabilities![0]!.amount = amount;
  return Object.assign(input, { form982AttributeSources: {
    sourceTaxYear: 2025, sourceReference: 'Fictional complete ordinary later-attribute originals',
    sourceFactsConfirmed: true, allAttributesIncluded: true,
    accountHolder: 'primary' as const, taxpayerName: 'Jane Doe', taxpayerIdLast4: '6789',
    dischargeDate: '2025-10-01', regular: emptyCodAttributeLedger(), alternativeTax: emptyCodAttributeLedger(),
    currentMinimumTaxCredit: { sourceReference: 'Actual complete current regular and AMT adjustment records',
      sourceFactsConfirmed: true, allCurrentAdjustmentSourcesIncluded: true, noAdditionalDeferralItemsConfirmed: true },
  } });
}

export function actualCodBasisCapInput() {
  const input = actualCodAttributesInput('1500');
  if (!input.codExclusion?.insolvency || !input.form982NolSources?.insolvency) throw new Error('Missing original insolvency facts');
  input.codExclusion.insolvency = { totalAssets: '4600', totalLiabilities: '7500' };
  input.form982NolSources.insolvency.assets = [
    { sourceId: 'furniture-and-jewelry', description: 'Fictional personal property FMV', amount: '4000', sourceReference: 'Actual fictional valuation before discharge' },
    { sourceId: 'actual-cash', description: 'Actual cash held before and after discharge', amount: '600', sourceReference: 'Actual unchanged cash account record' },
  ];
  input.form982NolSources.insolvency.liabilities![0]!.amount = '7500';
  for (const ledger of [input.form982AttributeSources.regular, input.form982AttributeSources.alternativeTax]) {
    ledger.property.immediatelyAfter.money = '600';
    ledger.property.immediatelyAfter.liabilities = [{ sourceId: 'remaining-student-loan', amount: '6000', sourceReference: 'Fictional remaining loan statement after discharge' }];
    ledger.property.immediatelyAfter.properties = [codPropertyRecord('furniture', '5000'), codPropertyRecord('jewelry', '500')];
    ledger.property.followingYear.properties = structuredClone(ledger.property.immediatelyAfter.properties);
  }
  return input;
}
