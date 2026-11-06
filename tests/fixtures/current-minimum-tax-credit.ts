import { TaxYearInputSchema } from '@/models/inputs.js';
import { actualCodAttributesInput, codAttributeRecord } from './cod-ordinary-attributes.js';

/** Complete fictional original statements. Amounts are facts, not carry overrides. */
export function currentMtcOriginalPacket(depreciation = '200000', depletion = '0') {
  return {
    sourceTaxYear: 2025, sourceReference: 'Fictional current exclusion and deferral originals',
    sourceFactsConfirmed: true, allAdjustmentSourcesIncluded: true,
    taxpayerName: 'Jane Doe', taxpayerIdLast4: '6789', filingStatus: 'single' as const,
    filedForm2555: false, filedForm1040NR: false, capitalGainsRequired: false,
    unallowedQualifiedElectricVehicleCredit: '0',
    k1Statements: [{ sourceId: 'adjustment-original-A', sourceTaxYear: 2025,
      sourceReference: 'Fictional original2025 K1 and AMT statement', sourceFactsConfirmed: true,
      entityName: 'Actual depreciation source', entityEin: '12-3456789', accountHolder: 'primary' as const,
      depreciationAdjustment: depreciation, dispositionAdjustment: '0', depletionAdjustment: depletion, otherAdjustment: '0' }],
    trustStatements: [],
    minimumTaxCreditNolHistory: {
      sourceTaxYear: 2025, sourceReference: 'Fictional independent exclusion-only NOL carryover and carryback worksheet',
      sourceFactsConfirmed: true, allCarryoversAndCarrybacksIncluded: true,
      carryoverSources: [] as unknown[], carrybackSources: [] as unknown[],
    },
    exclusionOnlyForeignHistory: {
      sourceTaxYear: 2025, sourceReference: 'Fictional independent exclusion-only foreign tax current and history worksheet',
      sourceFactsConfirmed: true, allCurrentAndHistoricalSourcesIncluded: true,
      currentSources: [] as unknown[], carryoverSources: [] as unknown[], carrybackSources: [] as unknown[],
    },
  };
}

export function actualCurrentMtcInput(options: { reversal?: boolean; priorAvailable?: '0' | '30000' | '70000'; splitPrior?: boolean; cod?: string } = {}) {
  const original = actualCodAttributesInput(options.cod ?? '300');
  original.w2s[0]!.wages = '100000'; original.w2s[0]!.federalWithheld = '60000';
  const depreciation = options.reversal ? '-200000' : '200000', depletion = options.reversal ? '200000' : '0';
  const priorAvailable = options.priorAvailable ?? '0';
  const input = TaxYearInputSchema.parse({ ...original, deductionElection: 'standard', priorYear: {},
    scheduleK1: [{ taxYear: 2025, partnershipName: 'Actual depreciation source', partnershipEIN: '12-3456789',
      accountHolder: 'primary', ordinaryIncome: '0', isPassiveActivity: false,
      amtDepreciationAdjustment: depreciation, amtAdjustedGainOrLoss: '0', amtDepletion: depletion, amtOtherItems: '0' }],
    ...(priorAvailable === '0' ? {} : { form8801: {
      priorYear: 2024, sourceFactsConfirmed: true, priorYearFilingStatus: 'single',
      priorYearForm6251Line1And2e: '0', priorYearExclusionItemAdjustments: '0', priorYearAMT: '0',
      priorYearMinimumTaxCreditNOLDeduction: '0', priorYearMinimumTaxForeignTaxCredit: '0', priorYearForm6251Line10: '0',
      unusedMinimumTaxCreditCarryforward: priorAvailable, priorYearUnallowedQualifiedElectricVehicleCredit: '0',
      priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
    } }),
  });
  // Actual current basis differs; the complete carry inventories are empty.
  input.netOperatingLoss!.alternativeTax!.regularBasisAndLossLimitsSameAsAlternativeConfirmed = false;
  const use = options.reversal && priorAvailable !== '0' ? '10361' : '0';
  if (priorAvailable !== '0') {
    input.form982AttributeSources!.regular!.records = options.splitPrior ? [
      { ...codAttributeRecord('minimum_tax_credit', '40000', use), sourceId: 'actual-origin-2022', originTaxYear: 2022,
        history: [2023, 2024].map(taxYear => ({ taxYear, used: '0', reduced: '0', expired: '0', sourceReference: `Actual filed${taxYear} original-source reconciliation` })) },
      { ...codAttributeRecord('minimum_tax_credit', '30000'), sourceId: 'actual-origin-2023', originTaxYear: 2023,
        history: [{ taxYear: 2024, used: '0', reduced: '0', expired: '0', sourceReference: 'Actual filed2024 original-source reconciliation' }] },
    ] : [codAttributeRecord('minimum_tax_credit', priorAvailable, use)];
  }
  return Object.assign(input, { form982AttributeSources: { ...input.form982AttributeSources!,
    currentMinimumTaxCredit: { sourceReference: 'Fictional complete signed current-source calculation',
      sourceFactsConfirmed: true, allCurrentAdjustmentSourcesIncluded: true,
      // This actual statement contains a deferral; the legacy zero assertion is false.
      noAdditionalDeferralItemsConfirmed: false,
      sourceYearCalculation: currentMtcOriginalPacket(depreciation, depletion) },
  } });
}

/** Isolated2026 original facts. Preserve actual2022 credit and every intervening year. */
export function actualCurrentMtc2026Input(options: { reversal?: boolean; priorAvailable?: '0' | '52000' | '52001' } = {}) {
  const prior = options.priorAvailable ?? '0';
  const input = actualCurrentMtcInput({ reversal: options.reversal, priorAvailable: prior === '0' ? '0' : '70000' });
  input.taxpayer.taxYear = 2026;
  input.scheduleK1[0]!.taxYear = 2026;
  // Actual standalone partnership statement has no Box14A or adjusted SE earnings.
  input.scheduleK1[0]!.entityType = 'partnership';
  input.scheduleK1[0]!.selfEmploymentEarnings = '0';
  input.scheduleK1[0]!.selfEmploymentNetEarningsAfterAdjustments = '0';
  input.scheduleK1[0]!.selfEmploymentIncomeType = 'nonfarm';
  input.scheduleK1[0]!.selfEmploymentFactsConfirmed = true;
  input.netOperatingLoss!.sourceTaxYear = 2026;
  const nol = input.form982NolSources!;
  nol.sourceTaxYear = 2026;
  nol.debts![0]!.sourceTaxYear = 2026;
  nol.debts![0]!.dischargeDate = '2026-10-01';
  nol.insolvency!.asOfDate = '2026-10-01';
  const attributes = input.form982AttributeSources;
  attributes.sourceTaxYear = 2026; attributes.dischargeDate = '2026-10-01';
  for (const ledger of [attributes.regular!, attributes.alternativeTax!]) {
    ledger.property!.immediatelyAfter!.asOfDate = '2026-10-01';
    ledger.property!.followingYear!.asOfDate = '2027-01-01';
  }
  const packet = attributes.currentMinimumTaxCredit.sourceYearCalculation;
  packet.sourceTaxYear = 2026; packet.k1Statements[0]!.sourceTaxYear = 2026;
  packet.k1Statements[0]!.sourceReference = 'Fictional original2026 K1 and AMT statement';
  packet.minimumTaxCreditNolHistory.sourceTaxYear = 2026;
  packet.exclusionOnlyForeignHistory.sourceTaxYear = 2026;
  if (prior !== '0') {
    input.form8801!.priorYear = 2025;
    input.form8801!.unusedMinimumTaxCreditCarryforward = prior;
    attributes.regular!.records = [{ ...codAttributeRecord('minimum_tax_credit', prior, options.reversal ? '10596' : '0'),
      sourceId: 'actual-origin-2022', originTaxYear: 2022,
      history: [2023, 2024, 2025].map(taxYear => ({ taxYear, used: '0', reduced: '0', expired: '0',
        sourceReference: `Actual filed${taxYear} original2022 reconciliation` })),
    }];
  }
  return input;
}
