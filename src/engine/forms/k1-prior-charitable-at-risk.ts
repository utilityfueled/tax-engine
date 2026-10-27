/** Actual historical deductions only; spec/federal/k1-prior-charitable-at-risk.yaml. */
import type { ScheduleK1, TaxYearInput } from '@/models/inputs.js';
import type { K1CharitableBasisSources } from '@/models/k1-charitable-basis-sources.js';
import type { K1CharitableReceiptSources } from '@/models/k1-charitable-receipt-sources.js';
import type { K1PriorCharitableAtRiskHistory } from '@/models/k1-prior-charitable-at-risk.js';
import type { CalculatedLine } from '@/models/outputs.js';
import type { K1CharitableCategory } from './k1-charitable-basis-sources.js';
import Decimal from 'decimal.js';
import { resolveCharitableRecipient } from '@/utils/charitable-recipient.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum } from '@/utils/decimal.js';

type Person = Pick<TaxYearInput['taxpayer']['primary'], 'firstName' | 'lastName' | 'ssn'>;
type Character = 'ordinary' | 'short_term_capital' | 'long_term_capital' | 'charitable';
export interface K1PriorAtRiskRecord {
    sourceId: string;
    taxYear: number;
    character: Character;
    originalPostBasisDeduction: Decimal;
    originalDisallowedAmount: Decimal;
    previouslyAllowed: Decimal;
    remaining: Decimal;
    gift?: {
        basisSourceId: string; basisOriginTaxYear: number; category: K1CharitableCategory;
        contributionShare: Decimal; adjustedBasisShare: Decimal; contributionDate: string;
        receipt: K1CharitableReceiptSources;
    };
}
export interface K1PriorAtRiskSourcesResult {
    records: K1PriorAtRiskRecord[];
    charitable: Array<K1PriorAtRiskRecord & { gift: NonNullable<K1PriorAtRiskRecord['gift']> }>;
    ordinary: Decimal; shortTerm: Decimal; longTerm: Decimal; total: Decimal;
    lines: CalculatedLine[];
}
function text(value: string | undefined, label: string): string {
    if (!value?.trim()) throw new Error(`K1 charitable prior at-risk ${label} source is unknown`);
    return value.trim();
}
function amount(value: string | undefined, label: string): Decimal {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value) || !d(value).isFinite())
        throw new Error(`K1 charitable prior at-risk ${label} requires an actual finite nonnegative source amount`);
    return d(value);
}
function normalized(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
function date(value: string | undefined): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
        throw new Error('K1 charitable prior at-risk original gift requires an actual date');
    return value;
}
function sameReceipt(left: K1CharitableReceiptSources, right: K1CharitableReceiptSources): boolean {
    const fields = ['originalBox', 'originalCode', 'recipientName', 'recipientCategory', 'qualifiedOrganization',
        'donorAdvisedFund', 'supportingOrganization', 'contributionDate', 'propertyType', 'acquisitionDate', 'qualifiedAppreciatedStock'] as const;
    return fields.every(field => left[field] === right[field])
        && (left.fairMarketValueShare === undefined || right.fairMarketValueShare === undefined
            ? left.fairMarketValueShare === right.fairMarketValueShare
            : amount(left.fairMarketValueShare, 'original FMV').eq(amount(right.fairMarketValueShare, 'original FMV')));
}

export function calculateK1PriorAtRiskSources(input: {
    taxpayer: { taxYear: number; filingStatus: TaxYearInput['taxpayer']['filingStatus']; primary: Person; spouse?: Person };
    k1: ScheduleK1;
    history?: K1PriorCharitableAtRiskHistory;
    basisSources?: Pick<K1CharitableBasisSources, 'currentContributions' | 'priorBasisSuspensions'>;
    receipts?: K1CharitableReceiptSources[];
}): K1PriorAtRiskSourcesResult {
    const { taxpayer, k1, history } = input, year = taxpayer.taxYear;
    if (![2025, 2026].includes(year) || k1.taxYear !== year || !history || history.sourceTaxYear !== year - 1
        || history.sourceFactsConfirmed !== true || !Array.isArray(history.vintages))
        throw new Error('K1 charitable prior at-risk history requires an independent confirmed preceding-year source, including none');
    text(history.sourceReference, 'history reference');
    const opening = new Map<number, Decimal>();
    for (const row of history.vintages) {
        if (!Number.isInteger(row.taxYear) || row.taxYear === undefined || row.taxYear < 1 || row.taxYear >= year || opening.has(row.taxYear))
            throw new Error('K1 charitable prior at-risk history requires unique actual prior origin years');
        opening.set(row.taxYear, amount(row.amount, 'historical opening balance'));
    }
    const total = sum(...opening.values()), sources = history.characterSources;
    if (!sources) {
        if (!total.isZero()) throw new Error('K1 charitable prior at-risk positive history requires its original character sources');
        return { records: [], charitable: [], ordinary: d(0), shortTerm: d(0), longTerm: d(0), total, lines: [] };
    }
    if (sources.sourceTaxYear !== year - 1 || sources.sourceFactsConfirmed !== true || sources.sameOwnerAndActivityConfirmed !== true
        || !Array.isArray(sources.records))
        throw new Error('K1 charitable prior at-risk character sources require confirmed actual owner and activity history');
    text(sources.sourceReference, 'character reference');
    const owner = k1.accountHolder, person = owner === 'primary' ? taxpayer.primary : owner === 'spouse' ? taxpayer.spouse : undefined;
    if (!person || (owner === 'spouse' && taxpayer.filingStatus !== 'married_filing_jointly')
        || normalized(text(sources.recipientName, 'owner name')) !== normalized(`${person.firstName} ${person.lastName}`)
        || !/^\d{9}$/.test(person.ssn.replaceAll('-', '')) || !/^\d{4}$/.test(sources.recipientTaxpayerIdLast4 ?? '')
        || person.ssn.replaceAll('-', '').slice(-4) !== sources.recipientTaxpayerIdLast4)
        throw new Error('K1 charitable prior at-risk historical owner must match the actual source owner');
    const ein = text(sources.entityEIN, 'activity EIN').replaceAll('-', '');
    if (!/^\d{9}$/.test(ein) || ein !== k1.partnershipEIN.replaceAll('-', '')
        || normalized(text(sources.entityName, 'activity name')) !== normalized(k1.partnershipName))
        throw new Error('K1 charitable prior at-risk original activity identity must match');
    const ids = new Set<string>(), actualOpenings = new Map<number, Decimal>(), audit = new AuditTrail();
    const records: K1PriorAtRiskRecord[] = sources.records.map((row, index) => {
        const sourceId = text(row.sourceId, 'record identity'), origin = row.taxYear;
        if (ids.has(sourceId)) throw new Error('K1 charitable prior at-risk history has a duplicate original record identity');
        ids.add(sourceId);
        if (!Number.isInteger(origin) || origin === undefined || origin < 1 || origin >= year)
            throw new Error('K1 charitable prior at-risk original history year is unknown or invalid');
        text(row.sourceReference, 'original deduction reference');
        if (row.basisLimitationAlreadyAppliedConfirmed !== true)
            throw new Error('K1 charitable prior at-risk historical deduction requires confirmed prior basis treatment');
        const character = row.character;
        if (!character || !['ordinary', 'short_term_capital', 'long_term_capital', 'charitable'].includes(character))
            throw new Error('K1 charitable prior at-risk original deduction character is unknown');
        const originalPostBasisDeduction = amount(row.originalPostBasisDeduction, 'original deduction after basis');
        const originalDisallowedAmount = amount(row.originalDisallowedAmount, 'original at-risk disallowance');
        if (originalDisallowedAmount.gt(originalPostBasisDeduction))
            throw new Error('K1 charitable prior at-risk original disallowance exceeds its post-basis deduction');
        if (!Array.isArray(row.useHistory) || row.useHistory.length !== year - origin - 1)
            throw new Error('K1 charitable prior at-risk history must include every subsequent through preceding year');
        const historyYears = new Set<number>();
        const previouslyAllowed = sum(...row.useHistory.map(item => {
            if (!Number.isInteger(item.taxYear) || item.taxYear === undefined || item.taxYear <= origin || item.taxYear >= year || historyYears.has(item.taxYear))
                throw new Error('K1 charitable prior at-risk history years must be actual unique consecutive years');
            historyYears.add(item.taxYear);
            return amount(item.amountAllowed, 'historical utilization');
        }));
        if (previouslyAllowed.gt(originalDisallowedAmount)) throw new Error('K1 charitable prior at-risk historical use exceeds the original suspension');
        const remaining = originalDisallowedAmount.minus(previouslyAllowed);
        let gift: K1PriorAtRiskRecord['gift'];
        if (character === 'charitable') {
            const original = row.gift, receipt = original?.receipt;
            if (!original || !receipt) throw new Error('K1 charitable prior at-risk original gift facts and receipt are unknown');
            const basisSourceId = text(original.basisSourceId, 'original gift identity'), basisOrigin = original.basisOriginTaxYear;
            if (receipt.basisSourceId !== basisSourceId || !Number.isInteger(basisOrigin) || basisOrigin === undefined || basisOrigin < 1 || basisOrigin > origin)
                throw new Error('K1 charitable prior at-risk original gift basis origin and receipt identity must reconcile');
            text(receipt.sourceReference, 'original receipt reference'); text(receipt.recipientName, 'original recipient');
            const paid = date(receipt.contributionDate), category = original.category;
            if (Number(paid.slice(0, 4)) > basisOrigin || receipt.qualifiedOrganization !== true || !receipt.recipientCategory)
                throw new Error('K1 charitable prior at-risk original gift payment and recipient qualification must reconcile');
            if (!category || !['cash_60', 'capital_gain_30', 'capital_gain_20'].includes(category))
                throw new Error('K1 charitable prior at-risk original gift category is unknown');
            const recipient = resolveCharitableRecipient(receipt), code = category === 'cash_60' ? 'A' : category === 'capital_gain_30' ? 'E' : 'F';
            if (receipt.originalBox !== (k1.entityType === 's_corporation' ? '12' : '13') || receipt.originalCode !== code
                || (code === 'F') !== (recipient.percentageCategory === 'other-thirty-percent'))
                throw new Error('K1 charitable prior at-risk original gift code and category must reconcile');
            const contributionShare = amount(original.contributionShare, 'original gift value');
            const adjustedBasisShare = category === 'cash_60' ? contributionShare : amount(original.adjustedBasisShare, 'original gift adjusted basis');
            if (adjustedBasisShare.gt(contributionShare) || (category === 'cash_60' && original.adjustedBasisShare !== undefined
                && !amount(original.adjustedBasisShare, 'original cash basis').eq(contributionShare)))
                throw new Error('K1 charitable prior at-risk original gift basis must reconcile with its supported character');
            if (category !== 'cash_60') {
                const acquired = date(receipt.acquisitionDate), anniversary = `${Number(acquired.slice(0, 4)) + 1}${acquired.slice(4)}`;
                if (receipt.propertyType !== 'appreciated_stock' || paid <= anniversary)
                    throw new Error('K1 charitable prior at-risk original capital gift requires actual stock held more than one year');
                const fmv = amount(receipt.fairMarketValueShare, 'original gift FMV');
                if (fmv.lt(adjustedBasisShare) || (recipient.privateNonoperating && typeof receipt.qualifiedAppreciatedStock !== 'boolean'))
                    throw new Error('K1 charitable prior at-risk original stock value or exception is unknown');
                const qualified = recipient.privateNonoperating && !receipt.qualifiedAppreciatedStock ? Decimal.min(fmv, adjustedBasisShare) : fmv;
                if (!qualified.eq(contributionShare)) throw new Error('K1 charitable prior at-risk original gift value must reconcile to recipient and basis facts');
            }
            if (originalPostBasisDeduction.gt(contributionShare)) throw new Error('K1 charitable prior at-risk original deduction exceeds the qualified gift');
            if (year === 2026 && remaining.gt(0))
                throw new Error('K1 charitable prior at-risk 2026 prior gift release requires its separate contribution-year and floor method');
            gift = { basisSourceId, basisOriginTaxYear: basisOrigin, category, contributionShare, adjustedBasisShare, contributionDate: paid, receipt };
        } else if (row.gift !== undefined) throw new Error('K1 charitable prior at-risk noncharitable character conflicts with original gift facts');
        actualOpenings.set(origin, (actualOpenings.get(origin) ?? d(0)).plus(remaining));
        audit.record('K1 Prior At Risk', `source-${index + 1}`, 'Original at-risk opening deduction conserved', remaining,
            'Original filed disallowance less actual subsequent annual use; no current basis deduction or entered allowance',
            { 'Original risk year': String(origin), 'Original post-basis deduction': originalPostBasisDeduction, 'Original disallowance': originalDisallowedAmount,
                'Prior actual utilization': previouslyAllowed, 'Opening at-risk deduction': remaining, Character: character });
        return { sourceId, taxYear: origin, character, originalPostBasisDeduction, originalDisallowedAmount, previouslyAllowed, remaining, gift };
    });
    for (const origin of new Set([...opening.keys(), ...actualOpenings.keys()]))
        if (!(opening.get(origin) ?? d(0)).eq(actualOpenings.get(origin) ?? d(0)))
            throw new Error('K1 charitable prior at-risk character history must reconcile exactly with every original vintage total');
    const charitable = records.filter((row): row is K1PriorAtRiskRecord & { gift: NonNullable<K1PriorAtRiskRecord['gift']> } => row.gift !== undefined);
    const originalGifts = new Map<string, typeof charitable[number]>(), riskGiftOrigins = new Set<string>();
    for (const row of charitable) {
        const gift = row.gift;
        const giftOrigin = `${gift.basisSourceId}:${row.taxYear}`;
        if (riskGiftOrigins.has(giftOrigin)) throw new Error('K1 charitable prior at-risk duplicate original gift risk-origin deduction');
        riskGiftOrigins.add(giftOrigin);
        const first = originalGifts.get(gift.basisSourceId)?.gift;
        if (first && (first.basisOriginTaxYear !== gift.basisOriginTaxYear || first.category !== gift.category
            || !first.contributionShare.eq(gift.contributionShare) || !first.adjustedBasisShare.eq(gift.adjustedBasisShare)
            || !sameReceipt(first.receipt, gift.receipt)))
            throw new Error('K1 charitable prior at-risk records conflict about the same original gift');
        originalGifts.set(gift.basisSourceId, row);
        if (sum(...charitable.filter(item => item.gift.basisSourceId === gift.basisSourceId)
            .map(item => item.originalPostBasisDeduction)).gt(gift.contributionShare))
            throw new Error('K1 charitable prior at-risk original gift deductions exceed its original qualified value');
        if (input.basisSources?.currentContributions?.some(item => item.sourceId === gift.basisSourceId))
            throw new Error('K1 charitable prior at-risk original gift cannot also be a new current basis contribution');
        const basis = input.basisSources?.priorBasisSuspensions?.find(item => item.sourceId === gift.basisSourceId);
        if (basis) {
            if (basis.originTaxYear !== gift.basisOriginTaxYear || basis.category !== gift.category
                || !amount(basis.contributionShare, 'overlapping original gift').eq(gift.contributionShare)
                || !amount(basis.category === 'cash_60' ? basis.contributionShare : basis.adjustedBasisShare, 'overlapping original basis').eq(gift.adjustedBasisShare))
                throw new Error('K1 charitable prior at-risk original gift conflicts with its separate basis history');
            const use = basis.basisUseHistory?.find(item => item.taxYear === row.taxYear);
            const available = amount(use?.basisAllowed, 'original basis use in risk-origin year')
                .plus(row.taxYear === gift.basisOriginTaxYear ? gift.contributionShare.minus(gift.adjustedBasisShare) : 0);
            const historical = sum(...charitable.filter(item => item.gift.basisSourceId === gift.basisSourceId && item.taxYear === row.taxYear).map(item => item.originalPostBasisDeduction));
            if (historical.gt(available)) throw new Error('K1 charitable prior at-risk original deductions exceed the separate historical basis allowance');
        }
        const receipt = input.receipts?.find(item => item.basisSourceId === gift.basisSourceId);
        if (receipt && !sameReceipt(receipt, gift.receipt))
            throw new Error('K1 charitable prior at-risk original receipt differs from the same gift in its basis history');
    }
    return { records, charitable, ordinary: sum(...records.filter(row => row.character === 'ordinary').map(row => row.remaining)),
        shortTerm: sum(...records.filter(row => row.character === 'short_term_capital').map(row => row.remaining)),
        longTerm: sum(...records.filter(row => row.character === 'long_term_capital').map(row => row.remaining)), total, lines: audit.getLines() };
}
