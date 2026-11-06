/** Completed original nonrental capital/ordinary passive worksheet. */
import type { ScheduleEResult } from '@/engine/schedules/schedule-e.js';
import { calculateK1CharitableReturnSources } from './k1-charitable-return-sources.js';
import { validateK1QbiLossSources, type K1QbiLossSourceInput } from './k1-qbi-loss-sources.js';
import { calculateK1PassiveDistributionSources } from './k1-passive-distribution-sources.js';
import { calculateForm8582 } from './form-8582.js';
import { calculateForm8582CharacterAllocation, type PassiveCharacterGroup } from './form-8582-character-allocation.js';
import { AuditTrail } from '@/utils/audit.js';
import { d, sum, zeroFloor } from '@/utils/decimal.js';

export function calculateK1PassiveCapitalSources(input: K1QbiLossSourceInput, scheduleE: ScheduleEResult) {
    if (!input.k1CharitableSources?.statements?.some(row => row.capitalCharacter !== undefined)) return undefined;
    const originals = calculateK1CharitableReturnSources(input), sources = validateK1QbiLossSources(input);
    if (!originals || sources.length !== input.scheduleK1.length || scheduleE.partnerships.length !== sources.length
        || scheduleE.rentalProperties.length > 0 || input.rentalProperties?.length)
        throw new Error('K1 passive capital requires every actual ordinary nonrental source and prior history');
    const knownNames = new Set(input.scheduleK1.map(row => row.partnershipName));
    if (input.priorYear?.suspendedPassiveLosses?.some(row => !knownNames.has(row.partnershipName)))
        throw new Error('K1 passive capital requires every actual prior activity source');
    const distribution = calculateK1PassiveDistributionSources(input, scheduleE), audit = new AuditTrail();
    const rawRows = sources.filter(source => input.scheduleK1[source.k1Index].isPassiveActivity).map(source => {
        const k = input.scheduleK1[source.k1Index], entry = scheduleE.partnerships[source.k1Index];
        if (!entry || entry.name !== k.partnershipName || entry.ein !== k.partnershipEIN || !entry.isPassive
            || entry.isRentalRealEstate || entry.isPubliclyTradedPartnership || entry.ptpFullyDisposedInTaxableTransaction
            || !entry.ptpDispositionGainOrLoss.isZero() || !entry.rawNetAmount.eq(source.ordinaryIncome))
            throw new Error('K1 passive capital requires the matching original-index continuing nonrental activity');
        const charitable = originals.statements.find(row => row.k1Index === source.k1Index), character = charitable?.capitalCharacter;
        let passiveShortTerm = d(0), passiveLongTerm = d(0), portfolioShortTerm = d(0), portfolioLongTerm = d(0);
        if (character && charitable) {
            const risk = charitable.atRiskAllocation;
            const currentShort = charitable.shortTermAmount.plus(risk?.currentShortTermSuspended ?? 0);
            const currentLong = charitable.longTermAmount.plus(risk?.currentLongTermSuspended ?? 0);
            if (character.currentShortTerm === 'passive_activity') passiveShortTerm = currentShort;
            else portfolioShortTerm = currentShort;
            if (character.currentLongTerm === 'passive_activity') passiveLongTerm = currentLong;
            else portfolioLongTerm = currentLong;
            for (const row of risk?.prior ?? []) {
                if (row.character === 'short_term_capital') {
                    if (character.priorAtRisk[row.sourceId] === 'passive_activity') passiveShortTerm = passiveShortTerm.minus(row.allowed);
                    else portfolioShortTerm = portfolioShortTerm.minus(row.allowed);
                } else if (row.character === 'long_term_capital') {
                    if (character.priorAtRisk[row.sourceId] === 'passive_activity') passiveLongTerm = passiveLongTerm.minus(row.allowed);
                    else portfolioLongTerm = portfolioLongTerm.minus(row.allowed);
                }
            }
            if (!sum(passiveShortTerm, portfolioShortTerm).eq(risk?.shortTermAmount ?? charitable.shortTermAmount)
                || !sum(passiveLongTerm, portfolioLongTerm).eq(risk?.longTermAmount ?? charitable.longTermAmount))
                throw new Error('K1 passive capital original character must conserve the completed basis and risk result');
        }
        const distributionGain = charitable?.distributionGain?.passiveActivity ? charitable.distributionGain : undefined;
        if (distributionGain?.holdingPeriod === 'short') passiveShortTerm = passiveShortTerm.plus(distributionGain.gain);
        else if (distributionGain) passiveLongTerm = passiveLongTerm.plus(distributionGain.gain);
        const originalGroups: PassiveCharacterGroup[] = [
            { character: 'ordinary', currentIncome: zeroFloor(entry.netAmount), currentDeduction: zeroFloor(entry.netAmount.negated()), priorDeduction: source.priorPassiveLoss },
            { character: 'short_term_capital', currentIncome: zeroFloor(passiveShortTerm), currentDeduction: zeroFloor(passiveShortTerm.negated()), priorDeduction: character?.priorShortTermLoss ?? d(0) },
            { character: 'long_term_capital', currentIncome: zeroFloor(passiveLongTerm), currentDeduction: zeroFloor(passiveLongTerm.negated()), priorDeduction: character?.priorLongTermLoss ?? d(0) },
        ];
        // Part V separates net amounts on different reporting forms. Part IX
        // additionally preserves each capital reporting part. Neither stage
        // changes original cents to reconcile separately rounded form lines.
        const groups = originalGroups;
        const capitalNet = passiveShortTerm.plus(passiveLongTerm);
        const hasPassiveCapital = character?.currentShortTerm === 'passive_activity' || character?.currentLongTerm === 'passive_activity'
            || Object.values(character?.priorAtRisk ?? {}).includes('passive_activity')
            || (character?.priorShortTermLoss.gt(0) ?? false) || (character?.priorLongTermLoss.gt(0) ?? false);
        return { k1Index: source.k1Index, accountHolder: source.accountHolder, name: entry.name, hasCapitalSource: character !== undefined, hasPassiveCapital, groups, originalGroups,
            portfolioShortTerm, portfolioLongTerm, distributionGain,
            currentIncome: zeroFloor(entry.netAmount).plus(zeroFloor(capitalNet)),
            currentLoss: zeroFloor(entry.netAmount.negated()).plus(zeroFloor(capitalNet.negated())).negated(),
            priorLoss: sum(...groups.map(row => row.priorDeduction)) };
    });
    const activities = rawRows.map(row => ({ name: row.name, reportingFormAndLine: row.hasCapitalSource ? 'Schedule E line 28; Schedule D lines 5 and 12' : 'Schedule E, line 28',
        income: row.currentIncome, loss: row.currentLoss, isRentalRealEstate: false, isActiveParticipant: false }));
    const priorYearSuspendedLosses = rawRows.map(row => ({ name: row.name, amount: row.priorLoss }));
    const passive = calculateForm8582({ scope: 'ordinary_nonrental_part_i', preserveSourcePrecision: true,
        filingStatus: input.taxpayer.filingStatus, activities, priorYearSuspendedLosses });
    const rows = rawRows.map((row, passiveIndex) => {
        const allocation = passive.activityAllocations.find(item => item.sourceIndex === passiveIndex);
        const byCharacter = calculateForm8582CharacterAllocation({ activityName: row.name, groups: row.groups, unallowedLoss: allocation?.suspendedLoss ?? d(0) });
        const reported = byCharacter.groups;
        const ordinary = reported.find(item => item.character === 'ordinary');
        const short = reported.find(item => item.character === 'short_term_capital');
        const long = reported.find(item => item.character === 'long_term_capital');
        if (!ordinary || !short || !long) throw new Error('K1 passive capital requires all independently known reporting groups');
        if (row.hasCapitalSource) audit.merge(byCharacter.lines.map(line => ({ ...line, line: `${line.line}-${row.k1Index + 1}` })));
        const shortTermAmount = sum(row.portfolioShortTerm, short.currentIncome).minus(short.allowedDeduction)
            .minus(row.distributionGain?.holdingPeriod === 'short' ? row.distributionGain.gain : 0);
        const longTermAmount = sum(row.portfolioLongTerm, long.currentIncome).minus(long.allowedDeduction)
            .minus(row.distributionGain?.holdingPeriod === 'long' ? row.distributionGain.gain : 0);
        return { ...row, passiveIndex, byCharacter, reportedGroups: reported, ordinaryAllowedLoss: ordinary.allowedDeduction,
            ordinaryIncome: ordinary.currentIncome, ordinaryNet: ordinary.currentIncome.minus(ordinary.allowedDeduction),
            ordinarySuspended: ordinary.suspendedDeduction, shortTermSuspended: short.suspendedDeduction, longTermSuspended: long.suspendedDeduction,
            shortTermAmount, longTermAmount };
    });
    const ordinaryNet = sum(...rows.map(row => row.ordinaryNet));
    const ordinaryTransferExclusion = passive.passiveIncome.minus(passive.allowedLoss).minus(ordinaryNet);
    return { rows, activities, priorYearSuspendedLosses, passive, ordinaryNet, ordinaryTransferExclusion,
        scheduleESupplementalIncome: sum(scheduleE.totalNonpassiveIncome, scheduleE.totalNonpassiveLoss, ordinaryNet),
        distribution, lines: audit.getLines() };
}
export type K1PassiveCapitalResult = NonNullable<ReturnType<typeof calculateK1PassiveCapitalSources>>;
