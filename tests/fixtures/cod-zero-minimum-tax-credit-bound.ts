import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { partialPersonalLegacyNolInput, partialPersonalLargeNolInput } from './cod-partial-personal.js';

/** Separate synthetic source completion. The earlier positive-loss originals
 * remain unchanged and continue to reject without this actual source record. */
export function withCodZeroMinimumTaxCreditBoundSources(input: TaxYearInput) {
  return TaxYearInputSchema.parse({ ...input,
    form8801: {
      priorYear: 2024, sourceFactsConfirmed: true, priorYearFilingStatus: 'single',
      priorYearForm6251Line1And2e: '0', priorYearExclusionItemAdjustments: '0', priorYearAMT: '0',
      priorYearMinimumTaxCreditNOLDeduction: '0', priorYearMinimumTaxForeignTaxCredit: '0', priorYearForm6251Line10: '0',
      unusedMinimumTaxCreditCarryforward: '0', priorYearUnallowedQualifiedElectricVehicleCredit: '0',
      priorYearFiledForm2555: false, priorYearFiledForm1040NR: false, priorYearCapitalGainsRequired: false,
    },
    form982AttributeSources: { ...input.form982AttributeSources,
      currentMinimumTaxCredit: {
        sourceReference: 'Fictional complete current adjustment and current legacy vehicle credit original records',
        sourceFactsConfirmed: true, allCurrentAdjustmentSourcesIncluded: true,
        noAdditionalDeferralItemsConfirmed: false,
        currentYearUnallowedQualifiedElectricVehicleCredit: '0',
      },
    },
  });
}
export const partialPersonalLegacyNolZeroPoolInput = () => withCodZeroMinimumTaxCreditBoundSources(partialPersonalLegacyNolInput());
export const partialPersonalLargeNolZeroPoolInput = () => withCodZeroMinimumTaxCreditBoundSources(partialPersonalLargeNolInput());
