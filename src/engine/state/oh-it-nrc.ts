/** Spec: state/oh-it-nrc.yaml. Official 2025 IT NRC Section I. */
import Decimal from 'decimal.js';
import { readOhioCanonicalBusinessSource, type OhioCanonicalBusinessContext } from './oh-business-source.js';
import { OhioResidencyFactsSchema, ohioNrcCategories, type OhioNrcCategory, type OhioResidencyFacts } from '@/models/ohio-residency.js';
import { AuditTrail } from '@/utils/audit.js';
import { roundDollar } from '@/utils/decimal.js';
type Money = Decimal | string | number;
export interface OhioITNRCInput {
    taxYear: number;
    filingStatus: string;
    federalAgi: Money;
    ohioAgi: Money;
    taxRemainingBeforeResidencyCredits: Money;
    residencyFacts: unknown;
    businessSource?: OhioCanonicalBusinessContext;
    expectedFederalCategories?: Partial<Record<OhioNrcCategory, Money>>;
}
function fail(message: string): never {
    throw new Error(`Ohio IT NRC actual sources: ${message}`);
}
function amount(value: Money, label: string): Decimal {
    let parsed: Decimal;
    try {
        parsed = new Decimal(value);
    } catch {
        return fail(`${label} is unknown or invalid`);
    }
    if (!parsed.isFinite()) return fail(`${label} must be finite`);
    return parsed;
}
function day(value: string): number {
    const time = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
        fail('invalid original domicile date');
    }
    return time;
}
/** Calculate only from actual owner allocations, never a credit override. */
export function calculateOhioITNRC(input: OhioITNRCInput) {
    const parsed = OhioResidencyFactsSchema.safeParse(input.residencyFacts);
    if (!parsed.success)
        fail('complete current original source facts are required');
    const facts: OhioResidencyFacts = parsed.data;
    if (facts.taxYear !== input.taxYear)
        fail('original source year changed');
    const owners = facts.owners.map(o => o.accountHolder);
    const expectedOwners = input.filingStatus === 'married_filing_jointly' ? ['primary', 'spouse'] : ['primary'];
    if (owners.length !== expectedOwners.length || new Set(owners).size !== owners.length || expectedOwners.some(o => !owners.includes(o as 'primary' | 'spouse')))
        fail('every actual return owner must occur exactly once');
    for (const owner of facts.owners) {
        const periods = [...owner.periods].sort((a, b) => a.from.localeCompare(b.from));
        let next = day(`${input.taxYear}-01-01`);
        let ohio = false, outside = false;
        for (const period of periods) {
            const from = day(period.from), to = day(period.to);
            if (from !== next || to < from || period.from.slice(0, 4) !== String(input.taxYear) || period.to.slice(0, 4) !== String(input.taxYear))
                fail('owner domicile periods must uniquely cover the full actual year');
            next = to + 86400000;
            ohio ||= period.domicileState === 'OH';
            outside ||= period.domicileState !== 'OH';
        }
        if (next !== day(`${input.taxYear + 1}-01-01`))
            fail('owner domicile timeline is incomplete');
        if ((owner.status === 'full_year_resident' && (!ohio || outside)) || (owner.status === 'nonresident' && (ohio || !outside)) || (owner.status === 'part_year_resident' && (!ohio || !outside)))
            fail('owner status contradicts actual domicile timeline');
    }
    const business = input.businessSource ? readOhioCanonicalBusinessSource(input.businessSource, facts, input.federalAgi) : undefined;
    if (facts.businessSources && !business) fail('actual canonical business context is required');
    const fullResidentOnly = facts.owners.every(o => o.status === 'full_year_resident');
    const federalAgi = amount(input.federalAgi, 'federal AGI'), line16 = amount(input.ohioAgi, 'Ohio AGI'), tax = amount(input.taxRemainingBeforeResidencyCredits, 'preceding credit remainder');
    if (tax.lt(0))
        fail('preceding credit remainder cannot be negative');
    const totals = Object.fromEntries(ohioNrcCategories.map(k => [k, new Decimal(0)])) as Record<OhioNrcCategory, Decimal>;
    const federal = { ...totals };
    let additions = new Decimal(0), deductions = new Decimal(0);
    if (!fullResidentOnly && (facts.allFederalSourcesIncludedConfirmed !== true || (business ? facts.noBusinessIncomeConfirmed !== false : facts.noBusinessIncomeConfirmed !== true)))
        fail('business Section II/III or unknown federal sources require their separate actual method');
    const timelineOnly = fullResidentOnly && facts.owners.every(o => !o.amounts);
    if (!timelineOnly) {
        for (const owner of facts.owners) {
            if (!owner.amounts)
                fail('every actual NRC source category including zero is required');
            for (const category of ohioNrcCategories) {
                const row = owner.amounts[category];
                const a = amount(row.federalAmount, category), resident = amount(row.residentAmount, category), nonresident = amount(row.nonresidentOhioAmount, category);
                if (!['capitalGains', 'rentsRoyalties', 'otherIncome'].includes(category) && (a.lt(0) || resident.lt(0) || nonresident.lt(0)))
                    fail('this source category requires nonnegative actual amounts');
                if (!['capitalGains', 'rentsRoyalties', 'otherIncome'].includes(category) && resident.plus(nonresident).gt(a))
                    fail('allocated ordinary amount exceeds actual original source');
                if (owner.status === 'full_year_resident' && (!resident.eq(a) || !nonresident.isZero()))
                    fail('full resident owner must include all qualifying original income in column B');
                if (owner.status === 'nonresident' && !resident.isZero())
                    fail('nonresident cannot have resident-period income');
                if (['interestDividends', 'pensions', 'unemployment', 'otherIncome', 'federalAdjustments'].includes(category) && !nonresident.isZero())
                    fail('Part B cannot allocate nonresident receipts');
                federal[category] = federal[category].plus(a);
                totals[category] = totals[category].plus(resident).plus(nonresident);
            }
            for (const row of owner.stateAdditions ?? []) {
                if (!['1','2','3','4','5','6','7','8','10','11'].includes(row.line))
                    fail('only actual additions1through11 excluding depreciation9 belong to Section I line7');
                additions = additions.plus(amount(row.ohioAmount, 'actual state addition'));
            }
            for (const row of owner.stateDeductions ?? []) {
                if (!['18', '19', '20', '30', '31', '37', '39', '44', '45', '46'].includes(row.line))
                    fail('this deduction is not an IT NRC line 8 source');
                deductions = deductions.plus(amount(row.ohioAmount, 'actual state deduction'));
            }
        }
        const net = (business?.worksheet.columnA ?? new Decimal(0)).plus(federal.wages).plus(federal.capitalGains).plus(federal.rentsRoyalties).plus(federal.gambling).plus(federal.interestDividends).plus(federal.pensions).plus(federal.unemployment).plus(federal.otherIncome).minus(federal.federalAdjustments);
        if (!roundDollar(net).eq(federalAgi))
            fail('source categories do not reconcile federal AGI');
        for (const category of ohioNrcCategories) {
            const expected = input.expectedFederalCategories?.[category];
            if (expected !== undefined && !roundDollar(federal[category]).eq(amount(expected, category)))
                fail(`current federal ${category} original does not reconcile`);
        }
    }
    const audit = new AuditTrail();
    const record = (line: string, label: string, value: Decimal, formula: string) => audit.record('OH-IT-NRC', line, label, value, formula);
    const line1 = record('1', 'Ohio compensation', roundDollar(totals.wages), 'Actual owner resident and Ohio-service nonresident compensation');
    const line2 = record('2', 'Ohio nonbusiness capital gain/loss', roundDollar(totals.capitalGains), 'Actual owner source allocation');
    const line3 = record('3', 'Ohio nonbusiness rent/royalty', roundDollar(totals.rentsRoyalties), 'Actual owner source allocation');
    const line4 = record('4', 'Ohio gambling', roundDollar(totals.gambling), 'Actual owner source allocation');
    const line5 = record('5', 'Ohio business income', business?.worksheet.ohioBusinessAfterDeduction ?? new Decimal(0), business ? 'Current source SectionII24 business after actual BID' : fullResidentOnly ? 'No NRC business allocation represented for full-resident-only household' : 'Confirmed ordinary nonbusiness Section I method only');
    const line6 = record('6', 'Ohio depreciation', business?.worksheet.columnB ?? new Decimal(0), business ? 'Current source SectionII22B actual depreciation' : fullResidentOnly ? 'No NRC depreciation allocation represented for full-resident-only household' : 'Confirmed no business depreciation in this method');
    const line7 = record('7', 'Actual Ohio additions', roundDollar(additions), 'Actual qualifying addition sources excluding depreciation');
    const line8 = record('8', 'Actual Ohio deductions', roundDollar(deductions), 'Actual listed qualifying deduction sources');
    const line9 = record('9', 'Part A total', line1.plus(line2).plus(line3).plus(line4).plus(line5).plus(line6).plus(line7).minus(line8), 'Sum 1 through 7 minus 8');
    const line10 = record('10', 'Resident interest/dividends', roundDollar(totals.interestDividends), 'Actual resident owner portions');
    const line11 = record('11', 'Resident pension/IRA', roundDollar(totals.pensions), 'Actual resident owner portions');
    const line12 = record('12', 'Resident unemployment', roundDollar(totals.unemployment), 'Actual resident owner portions');
    const line13 = record('13', 'Resident other income', roundDollar(totals.otherIncome), 'Actual resident owner portions');
    const line14 = record('14', 'Resident federal adjustments', roundDollar(totals.federalAdjustments), 'Actual resident owner adjustments');
    const line15 = record('15', 'Part B total', line10.plus(line11).plus(line12).plus(line13).minus(line14), '10 + 11 + 12 + 13 - 14');
    record('16', 'Actual Ohio AGI', line16, 'Current IT 1040 line 3');
    if (business && !line16.eq(business.ohioAgi)) fail('actual business deduction and Ohio AGI must reconcile current originals');
    const line17 = record('17', 'Ohio allocation', Decimal.max(0, line9.plus(line15)), 'max(0,9 + 15)');
    const line18 = record('18', 'Nonresident Ohio AGI', Decimal.max(0, line16.minus(line17)), 'max(0,16 - 17)');
    if (line16.lte(0) && tax.gt(0))
        fail('positive tax with nonpositive Ohio AGI requires a separate supported method');
    const line19 = record('19', 'Nonresident ratio', fullResidentOnly || line16.lte(0) ? new Decimal(0) : Decimal.min(1, line18.div(line16)).toDecimalPlaces(4, Decimal.ROUND_DOWN), 'min(1,18 / 16), truncate four decimal places');
    const line20 = record('20', 'Nonresident credit', Decimal.min(tax, roundDollar(tax.mul(line19))), 'RoundDollar(actual Schedule of Credits 37 * 19)');
    return { line1, line2, line3, line4, line5, line6, line7, line8, line9, line10, line11, line12, line13, line14, line15, line16, line17, line18, line19, line20, fullResidentOnly, lines: [...audit.getLines(), ...(business?.worksheet.lines ?? [])] };
}
