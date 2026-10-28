import type { TaxYearInput } from '@/models/inputs';
import { priorPropertyNonitemizedInput, priorPropertySources } from './k1-prior-property-nonitemized';
import { releaseFixtureSource as required } from './charitable-k1-basis-release-nol';
import { charitableNolOriginsInput } from './charitable-nol-origins';

type Prior = NonNullable<NonNullable<ReturnType<typeof priorPropertySources>['basis']>['priorBasisSuspensions']>[number];
export type AdmissionSource = {
  sourceReference?: string; sourceFactsConfirmed?: boolean;
  records?: Array<{ taxYear?: number; basisWorksheetReference?: string; charitableWorksheetReference?: string;
    recipientName?: string; recipientTaxpayerIdLast4?: string; entityEIN?: string; entityType?: 'partnership' | 's_corporation';
    regularCarryoverSourceIds?: string[]; alternativeCarryoverSourceIds?: string[] }>;
};
export function firstAdmissionOriginal(input: TaxYearInput): Prior & { section170AdmissionSources?: AdmissionSource } {
  return required(required(priorPropertySources(input).basis).priorBasisSuspensions)[0];
}
/** Fictional actual annual originals. No first-entry year, current allowance, or closing carry input. */
export function firstAdmissionInput(options: {
  capacity?: string; sCorp?: boolean; category?: 'C' | 'D'; income?: string;
  election?: TaxYearInput['deductionElection']; earlierCarry?: boolean; oldNol?: boolean;
} = {}): TaxYearInput {
  const input = priorPropertyNonitemizedInput({ capacity: options.capacity, sCorp: options.sCorp,
    election: options.election === 'nonitemized' ? 'nonitemized' : 'standard' });
  input.deductionElection = options.election ?? 'standard';
  if (options.income !== undefined) input.w2s[0].wages = options.income;
  const source = priorPropertySources(input), basis = required(source.basis), row = firstAdmissionOriginal(input);
  if (options.category === 'D') {
    row.category = 'capital_gain_20';
    Object.assign(required(source.receipts)[0], { originalCode: 'F', recipientCategory: 'private-nonoperating', qualifiedAppreciatedStock: true });
  }
  row.section170AdmissionSources = {
    sourceReference: 'Fictional complete original annual basis and section170 worksheet ledger', sourceFactsConfirmed: true,
    records: required(row.basisUseHistory).map(history => ({ taxYear: history.taxYear,
      basisWorksheetReference: `Fictional filed ${history.taxYear} basis worksheet for original2018 property`,
      charitableWorksheetReference: `Fictional filed ${history.taxYear} section170 original worksheet`,
      recipientName: basis.recipientName, recipientTaxpayerIdLast4: basis.recipientTaxpayerIdLast4,
      entityEIN: basis.entityEIN, entityType: basis.entityType,
      regularCarryoverSourceIds: [],
    })),
  };
  if (options.oldNol || options.earlierCarry) {
    input.netOperatingLoss = structuredClone(required(charitableNolOriginsInput({ year: 2026 }).netOperatingLoss));
    if (!options.oldNol) {
      input.netOperatingLoss.vintages = [];
      required(input.netOperatingLoss.alternativeTax).vintages = [];
    }
    for (const entry of required(row.section170AdmissionSources.records)) entry.alternativeCarryoverSourceIds = [];
  }
  if (options.earlierCarry) {
    for (const entry of required(row.basisUseHistory)) entry.basisAllowed = entry.taxYear === 2024 ? '20000' : '0';
    const alternative = required(required(required(input.netOperatingLoss).alternativeTax).charitableCarryoverHistory);
    for (const [system, originalExcess, opening] of [['regular', '7000', '5000'], ['alternative', '6000', '4000']] as const) {
      const packet = system === 'regular' ? required(input.charitableCarryoverSources) : required(alternative.alternativeCarryoverSources);
      packet.vintages = [{ sourceId: `${system}-original2018-admitted2024`, contributionYear: 2024,
        sourceReference: `Fictional ${system} original2024 section170 basis-admission worksheet`, category: 'capital_gain_30', medium: 'noncash',
        originalExcess, originNolReduction: '0', openingCarryforward: opening, adjustedThroughTaxYear: 2025,
        allHistoryIncluded: true, ordinaryPercentageMethodConfirmed: true,
        history: [{ taxYear: 2025, treatedAsPaid: '2000', nolReduction: '0', sourceReference: `Fictional filed2025 ${system} use worksheet` }] }];
      const annual = required(row.section170AdmissionSources.records).find(entry => entry.taxYear === 2024)!;
      annual[system === 'regular' ? 'regularCarryoverSourceIds' : 'alternativeCarryoverSourceIds'] = [packet.vintages[0].sourceId!];
    }
    alternative.priorRegularCarryovers = [{ taxYear: 2024, category: 'capital_gain_30', amount: '5000', sourceReference: 'Fictional regular summary of original history' }];
    alternative.priorAlternativeCarryovers = [{ taxYear: 2024, category: 'capital_gain_30', amount: '4000', sourceReference: 'Fictional alternative summary of original history' }];
  }
  return input;
}
