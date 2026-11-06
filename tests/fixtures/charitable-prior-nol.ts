import type { CharitableCategory } from '@/engine/forms/charitable-contribution-worksheet';
import type { TaxYearInput } from '@/models/inputs';
import { charitableNolInput } from './charitable-nol';
import { alternativeCharitableNolInput } from './alternative-charitable-nol';
import { syntheticPublicCashHistory } from './charitable-carryover';
/** Fictional complete original histories, not entered current allowances. */
export function priorCharitableNolInput(options: {
    category?: CharitableCategory;
    medium?: 'cash' | 'noncash';
    regular?: string;
    alternative?: string;
    contributionYear?: number;
    alternativeOnly?: boolean;
} = {}): TaxYearInput {
    const input = options.alternativeOnly ? alternativeCharitableNolInput() : charitableNolInput();
    const category = options.category ?? 'capital_gain_30', medium = options.medium ?? (category === 'cash_60' ? 'cash' : 'noncash');
    const year = options.contributionYear ?? 2024;
    const packet = (amount: string, ledger: string) => ({ ...syntheticPublicCashHistory(amount === '0' ? [] : [{ taxYear: year, amount }]),
        sourceReference: `Synthetic ${ledger} actual charity history`,
        vintages: syntheticPublicCashHistory(amount === '0' ? [] : [{ taxYear: year, amount }]).vintages.map(row => ({ ...row, category, medium,
            sourceId: `synthetic-${ledger}-${year}`, sourceReference: `Synthetic ${ledger} originating charity worksheet` })) });
    input.donations = [];
    input.deductionElection = 'itemized';
    input.charitableCarryoverSources = packet(options.regular ?? '50000', 'regular');
    const history = {
        sourceTaxYear: 2024, sourceReference: 'Synthetic independent charity histories', sourceFactsConfirmed: true, allCarryoversIncluded: true,
        priorRegularCarryovers: required(input.charitableCarryoverSources.vintages).map(row => ({ taxYear: row.contributionYear, category: row.category, amount: row.openingCarryforward, sourceReference: 'Synthetic legacy regular summary' })),
        priorAlternativeCarryovers: packet(options.alternative ?? options.regular ?? '50000', 'alternative').vintages.map(row => ({ taxYear: row.contributionYear, category: row.category, amount: row.openingCarryforward, sourceReference: 'Synthetic legacy AMT summary' })),
        alternativeCarryoverSources: packet(options.alternative ?? options.regular ?? '50000', 'alternative'),
    };
    if (!input.netOperatingLoss?.alternativeTax)
        throw new Error('Missing fictional independent NOL history');
    input.netOperatingLoss.alternativeTax.charitableCarryoverHistory = history;
    return input;
}

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}
