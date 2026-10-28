import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs';
import { jointNolSourceFixture } from './net-operating-loss-joint-pools';

/** Fictional actual filed2021 sources, independent AMT history, and original461 character.
 * No current deduction, absorption, qualified allowance or owner closing share is entered. */
export function jointEblNolSourceFixture(wages = '200000'): TaxYearInput {
  const raw = jointNolSourceFixture();
  raw.w2s[0]!.wages = wages;
  raw.netOperatingLoss.vintages[0]!.originKind = 'excess_business_loss';
  raw.netOperatingLoss.vintages[0]!.section1411OriginalLoss = '0';
  raw.netOperatingLoss.vintages[1]!.section1411OriginalLoss = '10000';
  const original = raw.netOperatingLoss.vintages[0]!;
  return TaxYearInputSchema.parse({ ...raw,
    priorYear: { qbiLossCarryforward: '0', activeQbiLossCarryforward: '0' },
    qbiLossSources: { sourceTaxYear: 2025, sourceReference: 'Actual qualified original461 packet',
      sourceFactsConfirmed: true, allK1ActivitiesIncluded: true, activities: [],
      priorQbiCarry: { sourceTaxYear: 2024, sourceReference: 'Filed2024 Form8995 line16 and ordinary carry records',
        sourceFactsConfirmed: true, returnSourceId: 'joint2024', formKind: 'form_8995_line_16',
        primaryName: 'Jane Doe', primaryTaxpayerIdLast4: '6789', spouseName: 'Alex Rowe', spouseTaxpayerIdLast4: '4321',
        lossCarryforward: '0', activeLossCarryforward: '0', activeSourceReference: 'Filed2024 ordinary carry character record' },
      allExcessBusinessLossHistoriesIncluded: true,
      excessBusinessLossHistories: [{ nolSourceId: original.sourceId, sourceTaxYear: 2024,
        sourceReference: 'Filed2024 qualified461 carry', sourceFactsConfirmed: true,
        accountHolder: 'primary', recipientName: 'Jane Doe', recipientTaxpayerIdLast4: '6789',
        activityName: 'Original qualified business', activityEIN: '12-3456789',
        limitationSourceReference: 'Filed2021 Form461 and qualified character', materiallyParticipatedInCurrentYear: false,
        originalNol: structuredClone(original), originalQualifiedLoss: '30000',
        qualifiedOpeningCarryforward: '25000', allHistoryIncluded: true,
        history: original.history.map(row => ({ taxYear: row.taxYear,
          qualifiedNolAbsorption: row.taxYear === 2022 ? '5000' : '0',
          qualifiedAttributeReduction: '0', sourceReference: `Filed qualified carry ${row.taxYear}` })) }],
    },
  });
}

export function zeroOrdinaryJointEblNolSourceFixture(wages = '50000'): TaxYearInput {
  const input = jointEblNolSourceFixture(wages), ordinary = input.netOperatingLoss!.vintages![1]!;
  // A real positive2021 loss fully absorbed in2022; zero is the actual incoming balance.
  ordinary.openingCarryforward = '0';
  for (const row of ordinary.history!) {
    const used = row.taxYear === 2022 ? '40000' : '0';
    row.nolUsed = used;
    for (const use of row.filingUnitUses!) {
      use.claimedDeduction = used; use.modifiedAbsorption = used;
      for (const owner of use.owners!) { owner.claimedDeduction = used; owner.modifiedAbsorption = used; }
    }
  }
  return input;
}

export function differentYearJointEblNolSourceFixture(): TaxYearInput {
  const input = jointEblNolSourceFixture('100000'), ordinary = input.netOperatingLoss!.vintages![1]!;
  ordinary.sourceId = 'alex-loss2023'; ordinary.lossTaxYear = 2023; ordinary.sourceReference = 'Filed2023 ordinary loss';
  ordinary.filingUnitOrigin!.returnSourceId = 'alex2023';
  ordinary.history = [{ taxYear: 2024, nolUsed: '5000', attributeReduction: '0', sourceReference: 'Filed Alex2024 carry',
    filingUnitUses: [{ returnSourceId: 'joint2024', sourceReference: 'Filed Alex2024 use', sourceFactsConfirmed: true,
      allOriginOwnersIncluded: true, allOtherNolSourcesIncluded: true, claimedDeduction: '5000', modifiedAbsorption: '5000',
      attributeReduction: '0', owners: [{ personId: 'alex', claimedDeduction: '5000', modifiedAbsorption: '5000', attributeReduction: '0' }] }] }];
  return input;
}

export function independentJointEblAlternativeFixture(): TaxYearInput {
  const input = jointEblNolSourceFixture(), alternative = input.netOperatingLoss!.alternativeTax!;
  alternative.vintages = structuredClone(input.netOperatingLoss!.vintages!);
  for (const [index, originalLoss, opening, used] of [[0, '30000', '25000', '5000'], [1, '10000', '10000', '0']] as const) {
    const row = alternative.vintages[index]!;
    row.sourceId = `amt-${row.sourceId}`; row.originalLoss = originalLoss; row.openingCarryforward = opening;
    row.section1411OriginalLoss = '0'; row.filingUnitOrigin!.originalReturnLoss = originalLoss;
    row.filingUnitOrigin!.separateComputations![0]!.netOperatingLoss = originalLoss;
    const year = row.history![0]!; year.nolUsed = used;
    const actual = year.filingUnitUses![0]!;
    actual.claimedDeduction = used; actual.modifiedAbsorption = used;
    actual.owners![0]!.claimedDeduction = used; actual.owners![0]!.modifiedAbsorption = used;
  }
  return input;
}
