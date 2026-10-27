import type { TaxYearInput } from '@/models/inputs.js';
import type { CharitableCarryoverData } from '@/lib/guided-charitable-carryover';

/** Fictional original filed records. No calculation or application defaults. */
export function charitableFilingUnitSources(): NonNullable<TaxYearInput['charitableCarryoverSources']> {
  return {
    sourceTaxYear: 2025, sourceReference: 'Synthetic complete original filed carry packet', sourceFactsConfirmed: true,
    allCarryoversIncluded: true, calendarYearTaxpayer: true, returnMembership: 'changed_filing_unit', membershipUnchangedConfirmed: false,
    primaryName: 'Jane Doe', primaryTaxpayerIdLast4: '6789',
    filingUnitHistory: {
      sourceReference: 'Synthetic filed return and identity timeline', sourceFactsConfirmed: true, allRelevantReturnsIncluded: true, allRelevantCarryoversIncluded: true,
      currentReturnSourceId: 'jane-2025', persons: [
        { sourceId: 'jane', name: 'Jane Doe', taxpayerIdLast4: '6789', deathStatus: 'alive_through_return_year' },
        { sourceId: 'alex', name: 'Alex Roe', taxpayerIdLast4: '4321', deathStatus: 'alive_through_return_year' },
      ], returns: [
        { sourceId: 'joint-2022', taxYear: 2022, filingStatus: 'married_filing_jointly', primaryPersonId: 'jane', spousePersonId: 'alex', sourceReference: 'Synthetic2022 joint return' },
        { sourceId: 'joint-2023', taxYear: 2023, filingStatus: 'married_filing_jointly', primaryPersonId: 'jane', spousePersonId: 'alex', sourceReference: 'Synthetic2023 joint return' },
        { sourceId: 'joint-2024', taxYear: 2024, filingStatus: 'married_filing_jointly', primaryPersonId: 'jane', spousePersonId: 'alex', sourceReference: 'Synthetic2024 joint return' },
        { sourceId: 'jane-2025', taxYear: 2025, filingStatus: 'single', primaryPersonId: 'jane', sourceReference: 'Synthetic2025 actual return' },
      ],
    }, vintages: [{
      sourceId: 'original-joint-property', contributionYear: 2022, category: 'noncash_50', medium: 'noncash',
      sourceReference: 'Synthetic original joint contribution worksheet', originalExcess: '20000', originNolReduction: '0',
      openingCarryforward: '6000', adjustedThroughTaxYear: 2024, allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
      filingUnitOrigin: { returnSourceId: 'joint-2022', separateComputations: [
        { personId: 'jane', originalExcess: '12000', originNolReduction: '0', sourceReference: 'Synthetic Jane separate original computation', ordinaryPercentageMethodConfirmed: true },
        { personId: 'alex', originalExcess: '8000', originNolReduction: '0', sourceReference: 'Synthetic Alex separate original computation', ordinaryPercentageMethodConfirmed: true },
      ] },
      history: [
        { taxYear: 2023, treatedAsPaid: '3000', nolReduction: '0', sourceReference: 'Synthetic2023 use', filingUnitUses: [{ returnSourceId: 'joint-2023', treatedAsPaid: '3000', nolReduction: '0', sourceReference: 'Synthetic2023 joint use' }] },
        { taxYear: 2024, treatedAsPaid: '7000', nolReduction: '0', sourceReference: 'Synthetic2024 use', filingUnitUses: [{ returnSourceId: 'joint-2024', treatedAsPaid: '7000', nolReduction: '0', sourceReference: 'Synthetic2024 joint use' }] },
      ],
    }],
  };
}

/** The same actual sources tied to the fictional guided taxpayer. */
export function guidedCharitableFilingUnitHistory(): CharitableCarryoverData {
  const packet = charitableFilingUnitSources();
  packet.primaryName = 'Jordan Example'; packet.primaryTaxpayerIdLast4 = '3333';
  packet.filingUnitHistory!.persons![0].name = packet.primaryName;
  packet.filingUnitHistory!.persons![0].taxpayerIdLast4 = packet.primaryTaxpayerIdLast4;
  const strings = (value: unknown): unknown => typeof value === 'number' ? String(value)
    : Array.isArray(value) ? value.map(strings)
    : value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, strings(item)])) : value;
  return strings(packet) as CharitableCarryoverData;
}
