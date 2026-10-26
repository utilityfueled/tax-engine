import { actualGuidedNolSources } from './guided-net-operating-loss';
import { actualGuidedCharitableCarryover } from './guided-charitable-carryover';
/** Fictional original records shared by unit and production-browser controls. */
export function priorCharitableGuideSources(alternativeAmount = '10000') {
    const regular = actualGuidedCharitableCarryover();
    Object.assign(required(regular.vintages)[0], { sourceId: 'synthetic-regular-2024', contributionYear: '2024', sourceReference: 'Synthetic 2024 contribution worksheet', category: 'capital_gain_30', medium: 'noncash',
        originalExcess: '50000', originNolReduction: '0', openingCarryforward: '50000', history: [] });
    const alternative = structuredClone(regular);
    Object.assign(alternative, { sourceReference: 'Synthetic independent AMT charitable worksheet' });
    Object.assign(required(alternative.vintages)[0], { sourceId: 'synthetic-alternative-2024', originalExcess: alternativeAmount, openingCarryforward: alternativeAmount });
    if (alternativeAmount === '0')
        alternative.vintages = [];
    const loss = structuredClone(actualGuidedNolSources);
    Object.assign(required(loss.vintages)[0], { originalLoss: '100000', openingCarryforward: '100000', section1411OriginalLoss: '0', history: [] });
    required(loss.alternativeTax).vintages = [];
    required(loss.alternativeTax).charitableCarryoverHistory = { sourceTaxYear: '2024', sourceReference: 'Synthetic independent prior charity worksheets',
        sourceFactsConfirmed: true, allCarryoversIncluded: true, alternativeCarryoverSources: alternative,
        priorRegularCarryovers: [{ taxYear: '2024', category: 'capital_gain_30', amount: '50000', sourceReference: 'Synthetic legacy regular summary' }],
        priorAlternativeCarryovers: alternativeAmount === '0' ? [] : [{ taxYear: '2024', category: 'capital_gain_30', amount: alternativeAmount, sourceReference: 'Synthetic legacy AMT summary' }] };
    return { regular, loss };
}

function required<T>(value: T): NonNullable<T> {
  if (value === undefined || value === null) throw new Error("Missing fictional source or expected calculation");
  return value;
}
