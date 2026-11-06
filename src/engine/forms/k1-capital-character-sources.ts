/** Actual original classification; spec/federal/k1-passive-capital-sources.yaml. */
import type { ScheduleK1 } from '@/models/inputs.js';
import type { K1CapitalCharacterSources } from '@/models/k1-capital-character-sources.js';
import type { K1PriorAtRiskRecord } from './k1-prior-charitable-at-risk.js';
import { d } from '@/utils/decimal.js';

type Character = 'portfolio' | 'passive_activity';
function fail(): never { throw new Error('K1 capital character requires complete matching actual original classification and independent prior capital history'); }
const text = (value: string | undefined) => value?.trim() ? value.trim() : fail();
const normalized = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
function amount(value: string | undefined, nonnegative = false) {
    if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value) || !d(value).isFinite() || (nonnegative && d(value).lt(0))) fail();
    return d(value);
}
function actualCharacter(value: string | undefined): Character {
    if (value !== 'portfolio' && value !== 'passive_activity') fail();
    return value;
}

export function calculateK1CapitalCharacterSources(input: {
    taxYear: number;
    k1: ScheduleK1;
    source?: K1CapitalCharacterSources;
    priorAtRisk: Array<Pick<K1PriorAtRiskRecord, 'sourceId' | 'character'>>;
}) {
    const { source, k1, taxYear } = input;
    if (![2025, 2026].includes(taxYear) || k1.taxYear !== taxYear || !source || source.sourceTaxYear !== taxYear
        || source.sourceFactsConfirmed !== true || source.allCapitalItemsIncludedConfirmed !== true
        || source.ordinaryCapitalTreatmentConfirmed !== true || k1.isPassiveActivity !== true || k1.isPubliclyTradedPartnership
        || source.accountHolder !== k1.accountHolder || !['primary', 'spouse'].includes(source.accountHolder ?? '')
        || normalized(text(source.entityName)) !== normalized(k1.partnershipName)
        || !/^\d{9}$/.test(text(source.entityEIN).replaceAll('-', ''))
        || text(source.entityEIN).replaceAll('-', '') !== k1.partnershipEIN.replaceAll('-', '')) fail();
    text(source.sourceReference);
    const current = (row: K1CapitalCharacterSources['currentShortTerm'], original: string | undefined) => {
        if (!row || !amount(row.originalAmount).eq(amount(original))) fail();
        if (amount(row.originalAmount).isZero() && row.character === undefined) return undefined;
        text(row.sourceReference);
        return actualCharacter(row.character);
    };
    const currentShortTerm = current(source.currentShortTerm, k1.netShortTermCapitalGain);
    const currentLongTerm = current(source.currentLongTerm, k1.netLongTermCapitalGain);
    const capitalRecords = input.priorAtRisk.filter(row => row.character === 'short_term_capital' || row.character === 'long_term_capital');
    if (!Array.isArray(source.priorAtRiskCapital) || source.priorAtRiskCapital.length !== capitalRecords.length
        || new Set(capitalRecords.map(row => row.sourceId)).size !== capitalRecords.length) fail();
    const seen = new Set<string>();
    const priorAtRisk: Record<string, Character> = Object.fromEntries(source.priorAtRiskCapital.map(row => {
        const id = text(row.sourceId);
        if (seen.has(id) || !capitalRecords.some(item => item.sourceId === id)) fail();
        seen.add(id); text(row.sourceReference);
        return [id, actualCharacter(row.character)];
    }));
    const history = source.priorPassiveCapital;
    if (!history || history.sourceTaxYear !== taxYear - 1 || history.sourceFactsConfirmed !== true || history.sameOwnerAndActivityConfirmed !== true) fail();
    text(history.sourceReference);
    const priorShortTermLoss = amount(history.shortTermLoss, true), priorLongTermLoss = amount(history.longTermLoss, true);
    if ((currentShortTerm === 'passive_activity' || currentLongTerm === 'passive_activity'
        || Object.values(priorAtRisk).includes('passive_activity') || priorShortTermLoss.gt(0) || priorLongTermLoss.gt(0))
        && source.samePassiveActivityConfirmed !== true) fail();
    return { currentShortTerm, currentLongTerm, priorAtRisk, priorShortTermLoss, priorLongTermLoss };
}
export type K1CapitalCharacterResult = ReturnType<typeof calculateK1CapitalCharacterSources>;
