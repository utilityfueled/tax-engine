import { describe, expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { k1PassiveCapitalFixture } from '../fixtures/k1-passive-capital.js';
import { charitableStatement } from '../fixtures/k1-charitable-return.js';
import { requireRiskSource } from '../fixtures/k1-charitable-at-risk.js';
import { calculateScheduleE } from '@/engine/schedules/schedule-e.js';
import { calculateK1OrdinarySelfEmployment } from '@/engine/forms/k1-ordinary-self-employment.js';
import { k1PriorCharitableRiskFixture } from '../fixtures/k1-prior-charitable-at-risk.js';
import { roundDollar } from '@/utils/decimal.js';

describe('canonical actual passive capital (spec/federal/k1-passive-capital-sources.yaml)', () => {
    it('rejects unmatched prior sources', () => {
        // Spec: K1 Passive Capital Sources, canonical-complete-source.
        for (const amount of ['0', '1000']) {
            const input = k1PassiveCapitalFixture();
            requireRiskSource(input.priorYear).suspendedPassiveLosses.push({ partnershipName: 'Unrepresented actual prior activity', amount });
            expect(() => calculateFederalTax(input)).toThrow(/every|prior|source|capital/i);
        }
    });
    it('rejects contradictory business classification', () => {
        // Spec: K1 Passive Capital Sources, canonical-business-source.
        const input = k1PassiveCapitalFixture();
        requireRiskSource(input.qbiLossSources).form461Classification = { method: 'ordinary_k1_only', sourceTaxYear: 2025,
            sourceReference: 'Conflicting supplied capital classification', sourceFactsConfirmed: true, allNonEmployeeBusinessSourcesIncluded: true,
            capitalIncomeIsNonbusiness: true, otherBusinessIncome: '0', otherBusinessDeductions: '0' };
        expect(() => calculateFederalTax(input)).toThrow(/capital|classification|business/i);
    });
    it('routes actual passive capital through PartIX once and preserves the portfolio distinction', () => {
        const passive = calculateFederalTax(k1PassiveCapitalFixture()), portfolio = calculateFederalTax(k1PassiveCapitalFixture('portfolio'));
        expect(passive.agi.toString()).toBe('100000'); expect(passive.capitalGainLoss.toString()).toBe('0');
        expect(portfolio.agi.toString()).toBe('97000'); expect(portfolio.capitalGainLoss.toString()).toBe('-3000');
        expect(requireRiskSource(passive.scheduleA).cashCharitable.toString()).toBe('10000');
        expect(passive.allLines.filter(row => row.form === 'Form 8582 Part IX').map(row => [row.line, row.value.toString()])).toContainEqual(['long_term_capital-1', '10000']);
        expect(passive.allLines.find(row => row.form === 'Form 8582 Part IX' && row.line === 'ordinary-1')?.value.toString()).toBe('20000');
        expect(portfolio.allLines.find(row => row.form === 'Form 8582 Part IX' && row.line === 'long_term_capital-1')?.value.toString()).toBe('0');
    });
    it('uses actual own capital income without combining the short and long term reporting groups', () => {
        const result = calculateFederalTax(k1PassiveCapitalFixture('passive_activity', '0'));
        expect(result.agi.toDecimalPlaces(8).toString()).toBe('100000');
        expect(result.capitalGainLoss.toDecimalPlaces(8).toString()).toBe('6666.66666667');
        expect(roundDollar(result.capitalGainLoss).toString()).toBe('6667');
        const ordinary = result.allLines.find(row => row.form === 'Form 8582 Part IX' && row.line === 'ordinary-1');
        const long = result.allLines.find(row => row.form === 'Form 8582 Part IX' && row.line === 'long_term_capital-1');
        expect(ordinary?.value.toDecimalPlaces(2).toString()).toBe('6666.67');
        expect(long?.value.toDecimalPlaces(2).toString()).toBe('3333.33');
    });
    it('retains independent prior passive capital balances outside ordinary QBI history', () => {
        const original = k1PassiveCapitalFixture('passive_activity', '0');
        requireRiskSource(requireRiskSource(charitableStatement(original).capitalCharacter).priorPassiveCapital).shortTermLoss = '8000';
        requireRiskSource(original.priorYear).suspendedPassiveLosses[0].amount = '8000';
        const result = calculateFederalTax(original);
        expect(result.agi.toDecimalPlaces(8).toString()).toBe('100000');
        expect(result.capitalGainLoss.toDecimalPlaces(8).toString()).toBe('1333.33333333');
        expect(roundDollar(result.capitalGainLoss).toString()).toBe('1333');
        expect(result.allLines.find(row => row.form === 'Form 8582 Part IX' && row.line === 'short_term_capital-1')?.value.toString()).toBe('8000');
        expect(result.allLines.find(row => row.form === 'Form 8582 Part IX' && row.line === 'ordinary-1')?.value.toDecimalPlaces(2).toString()).toBe('1333.33');
    });
    it('keeps capital outside ordinary QBI self employment and investment transfers', () => {
        const input = k1PassiveCapitalFixture('passive_activity', '0'), k = input.scheduleK1[0];
        const q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
        delete k.selfEmploymentNetEarningsAfterAdjustments;
        delete requireRiskSource(q.statement).selfEmploymentNetEarningsAfterAdjustments;
        Object.assign(k, { selfEmploymentEarnings: '-40000' });
        Object.assign(requireRiskSource(q.statement), { selfEmploymentEarnings: '-40000' });
        q.selfEmploymentTreatment = { sourceTaxYear: 2025, sourceReference: 'Fictional actual partner worksheet', sourceFactsConfirmed: true,
            method: 'ordinary_current', noOtherPartnerAdjustmentsConfirmed: true,
            priorLossHistory: { sourceTaxYear: 2024, sourceReference: 'Fictional independently empty partner history', sourceFactsConfirmed: true, amount: '0' } };
        expect(calculateK1OrdinarySelfEmployment(input, calculateScheduleE(input)).scheduleK1[0].selfEmploymentNetEarningsAfterAdjustments).toBe('-6666.666666666666667');
        const result = calculateFederalTax(input);
        expect(result.carryforwards.qbiLossCarryforward.toString()).toBe('6667');
        expect(result.carryforwards.qbiSuspendedLosses?.find(row => row.limitation === '469')?.vintages.map(row => row.remainingLoss.toString())).toEqual(['33333']);
        expect(result.carryforwards.k1PassiveByCharacter?.[0].longTermCapital.toDecimalPlaces(8).toString()).toBe('16666.66666667');
        const high = k1PassiveCapitalFixture('passive_activity', '60000'); high.w2s[0].wages = '250000';
        const r = calculateFederalTax(high);
        expect(r.agi.toString()).toBe('267000');
        expect(requireRiskSource(r.form8960).netInvestmentIncome.toString()).toBe('17000');
        expect(requireRiskSource(r.form8960).niitTax.toString()).toBe('646');
        expect(r.allLines.find(row => row.form === 'Form 8960' && row.line === '4c')?.value.toString()).toBe('20000');
        expect(r.allLines.find(row => row.form === 'EIC Investment Income Worksheet' && row.line === '13')?.value.toString()).toBe('20000');
    });
    it('retains current activity net and exact character balances before destination rounding', () => {
        const input = k1PassiveCapitalFixture('passive_activity', '0'), r = calculateFederalTax(input);
        const row = requireRiskSource(r.form8582).activityRows[0];
        expect(row.sourceCurrentIncome.toString()).toBe('0'); expect(row.sourceCurrentLoss.toString()).toBe('-50000');
        expect(requireRiskSource(r.form8582).allowedLoss.toString()).toBe('0');
        expect(r.carryforwards.k1PassiveByCharacter?.[0].ordinary.toDecimalPlaces(8).toString()).toBe('33333.33333333');
        expect(r.carryforwards.k1PassiveByCharacter?.[0].longTermCapital.toDecimalPlaces(8).toString()).toBe('16666.66666667');
        const distinctForms = k1PassiveCapitalFixture('passive_activity', '0'), k = distinctForms.scheduleK1[0];
        const q = requireRiskSource(requireRiskSource(distinctForms.qbiLossSources).activities)[0];
        Object.assign(k, { ordinaryIncome: '10000', section199AQBI: '10000', netShortTermCapitalGain: '-40000', netLongTermCapitalGain: '20000' });
        Object.assign(requireRiskSource(q.statement), { ordinaryIncome: '10000', section199AQBI: '10000' });
        Object.assign(requireRiskSource(k.form6198), { ordinaryIncome: '10000', gainLossFromDispositions: '-20000' });
        const character = requireRiskSource(charitableStatement(distinctForms).capitalCharacter);
        requireRiskSource(character.currentShortTerm).originalAmount = '-40000';
        requireRiskSource(character.currentLongTerm).originalAmount = '20000';
        const separate = calculateFederalTax(distinctForms), separateRow = requireRiskSource(separate.form8582).activityRows[0];
        expect(separateRow.sourceCurrentIncome.toString()).toBe('10000');
        expect(separateRow.sourceCurrentLoss.toString()).toBe('-20000');
        expect(separate.allLines.find(line => line.form === 'Form 8582 Part IX' && line.line === 'short_term_capital-1')?.value.toString()).toBe('30000');
        expect(separate.carryforwards.k1PassiveByCharacter?.[0].shortTermCapital.toString()).toBe('10000');
        expect(separate.capitalGainLoss.toString()).toBe('-3000');
        expect(separate.agi.toString()).toBe('107000');
    });
    it('uses each original prior risk capital record once before passive allocation', () => {
        const input = k1PassiveCapitalFixture(), source = charitableStatement(input), risk = requireRiskSource(source.atRisk);
        const history = structuredClone(requireRiskSource(requireRiskSource(charitableStatement(k1PriorCharitableRiskFixture()).atRisk).priorLossHistory));
        history.vintages = [{ taxYear: 2024, amount: '10000' }];
        requireRiskSource(history.characterSources).records = [{ sourceId: 'actual-prior-capital', taxYear: 2024, character: 'long_term_capital',
            sourceReference: 'Fictional actual original long term deduction', basisLimitationAlreadyAppliedConfirmed: true,
            originalPostBasisDeduction: '15000', originalDisallowedAmount: '10000', useHistory: [] }];
        risk.priorLossHistory = history;
        requireRiskSource(input.scheduleK1[0].form6198).gainLossFromDispositions = '-20000';
        requireRiskSource(source.capitalCharacter).priorAtRiskCapital = [{ sourceId: 'actual-prior-capital', character: 'passive_activity', sourceReference: 'Actual original activity character' }];
        const before = JSON.stringify(input), r = calculateFederalTax(input);
        expect(r.agi.toDecimalPlaces(8).toString()).toBe('100000');
        expect(r.capitalGainLoss.toDecimalPlaces(8).toString()).toBe('-2857.14285714');
        expect(roundDollar(r.capitalGainLoss).toString()).toBe('-2857');
        expect(r.carryforwards.k1PassiveByCharacter?.[0].ordinary.toDecimalPlaces(8).toString()).toBe('22857.14285714');
        expect(r.carryforwards.k1PassiveByCharacter?.[0].longTermCapital.toDecimalPlaces(8).toString()).toBe('17142.85714286');
        expect(r.carryforwards.k1AtRiskByCharacter?.find(row => row.taxYear === 2024)?.priorRecords?.[0].allowed.toString()).toBe('10000');
        expect(r.carryforwards.qbiLossCarryforward.toString()).toBe('17143'); expect(JSON.stringify(input)).toBe(before);
    });
    it('preserves distinct basis risk and passive character suspensions', () => {
        for (const basisBinding of [false, true]) {
            const input = k1PassiveCapitalFixture(), k = input.scheduleK1[0], source = charitableStatement(input);
            const q = requireRiskSource(requireRiskSource(input.qbiLossSources).activities)[0];
            if (basisBinding) {
                k.beginningBasis = '25000'; requireRiskSource(q.basis).beginningBasis = '25000';
                Object.assign(requireRiskSource(k.form6198), { ordinaryIncome: '-20000', gainLossFromDispositions: '0', otherDeductionsLosses: '0' });
            } else {
                requireRiskSource(k.form6198).priorYearAmountAtRisk = '25000';
                requireRiskSource(source.atRisk).priorYearAmountAtRisk = '25000'; requireRiskSource(q.atRisk).priorYearAmountAtRisk = '25000';
            }
            const r = calculateFederalTax(input);
            expect(r.agi.toString()).toBe('100000'); expect(r.capitalGainLoss.toString()).toBe('0');
            expect(requireRiskSource(r.scheduleA).cashCharitable.toString()).toBe(basisBinding ? '5000' : '10000');
            // Independent source-only Decimal20/ROUND_HALF_UP stage literals retain the
            // exact25-place assertion. Multiplication before division rounds the
            // ordinary469 numerator116666666.666666666665 upward at the20-digit tie.
            const passive = requireRiskSource(r.carryforwards.k1PassiveByCharacter?.[0]);
            expect(passive.ordinary.toFixed(25)).toBe(basisBinding ? '0.0000000000000000000000000' : '3333.3333333333333334000000000');
            expect(passive.longTermCapital.toFixed(25)).toBe(basisBinding ? '0.0000000000000000000000000' : '1666.6666666666666667000000000');
            const basis = requireRiskSource(requireRiskSource(r.scheduleE).partnerships[0].basisResult);
            expect(basis.suspendedLossCarryforward.charitable.toString()).toBe(basisBinding ? '5000' : '0');
            const risk = requireRiskSource(r.carryforwards.k1AtRiskByCharacter?.[0]);
            expect(risk.charitable[0].suspended.toString()).toBe('0');
            expect(risk.ordinary.toFixed(25)).toBe(basisBinding ? '0.0000000000000000000000000' : '16666.6666666666666670000000000');
            expect(risk.longTermCapital.toFixed(25)).toBe(basisBinding ? '0.0000000000000000000000000' : '8333.3333333333333333000000000');
        }
    });
});
