// Spec: spec/federal/rrta-tip-payroll.yaml.
import { it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { calculateUnreportedTipPayroll } from '@/engine/forms/unreported-tip-payroll.js';
import { calculateForm8959 } from '@/engine/forms/form-8959.js';
import { getConstants } from '@/models/constants.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { rrtaTipInput } from '../../fixtures/rrta-tip-payroll.js';
it('admits actual RRTA compensation with nonrailroad unreported tips', () => {
    for (const year of [2025, 2026]) {
        const input = rrtaTipInput(year), before = structuredClone(input);
        const result = calculateUnreportedTipPayroll(input, year === 2025 ? getConstants(year) : FEDERAL_2026_CONSTANTS);
        expect(result.singular?.line8.toFixed()).toBe('120000');
        expect(result.singular?.line11.toFixed()).toBe('62');
        expect(result.singular?.line12.toFixed()).toBe('15');
        expect(result.tax.toFixed()).toBe('77');
        expect(input).toEqual(before);
    }
});
it('uses separate RRTA Medicare threshold and actual withholding', () => {
    const input = rrtaTipInput(2025, '230000', '0', '270'), result = calculateForm8959(input, new Decimal(0), 'single', getConstants(2025));
    expect(result.lines.find(x => x.line === '14')?.value.toFixed()).toBe('230000');
    expect(result.lines.find(x => x.line === '17')?.value.toFixed()).toBe('270');
    expect(result.lines.find(x => x.line === '7')?.value.toFixed()).toBe('0');
    expect(result.totalEarnings.toFixed()).toBe('231000');
    expect(result.excessOverThreshold.toFixed()).toBe('30000');
    expect(result.additionalMedicareTax.toFixed()).toBe('270');
    expect(result.withholdingCredit.toFixed()).toBe('270');
});
import { type TaxYearInput } from '@/models/inputs.js';
function need<T>(value: T | undefined | null): T {
    if (value == null)
        throw Error('Missing original fixture');
    return value;
}
it('requires exact original RRTA and tip records before payroll', () => {
    const changes: Array<(x: TaxYearInput) => void> = [
        x => {
            x.taxpayer.primary.lastName = 'Changed';
        }, x => {
            need(x.w2s[0]).wages = '100000.00';
        }, x => {
            need(need(x.form4137).sourceFacts).sourceReference = 'Samecash changed tip original';
        },
        x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).tier1MedicareCompensation = undefined;
        }, x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).additionalMedicareTaxWithheld = undefined;
        },
        x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).tier1SocialSecurityCompensation = '99999';
        }, x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).originalW2 = {};
        },
        x => {
            need(x.rrtaPayrollSources).originalTipForms = [];
        }, x => {
            need(x.rrtaPayrollSources).sourceFactsConfirmed = undefined;
        }, x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).sourceTaxYear = 2026;
        },
    ];
    for (const mutate of changes) {
        const x = rrtaTipInput();
        mutate(x);
        const before = structuredClone(x);
        expect(() => calculateUnreportedTipPayroll(x, getConstants(2025))).toThrow();
        expect(x).toEqual(before);
    }
});
it('retains unsupported payroll and unknown-source denials', () => {
    const missing = rrtaTipInput();
    delete missing.rrtaPayrollSources;
    expect(() => calculateUnreportedTipPayroll(missing, getConstants(2025))).toThrow(/RRTA/);
    const excess = rrtaTipInput(2025, '170000', '20000');
    expect(() => calculateUnreportedTipPayroll(excess, getConstants(2025))).toThrow(/excess/);
    const covered = rrtaTipInput();
    need(need(need(need(covered.form4137).sourceFacts).employers)[0]).railroadRetirementCovered = true;
    need(covered.rrtaPayrollSources).originalTipForms = [{
            owner: 'primary', original: structuredClone(covered.form4137)
        }];
    expect(() => calculateUnreportedTipPayroll(covered, getConstants(2025))).toThrow(/RRTA|railroad/);
    for (const field of ['noEmployeeRepresentativeCompensationConfirmed', 'noCorrectionsConfirmed', 'noOtherRRTATaxAdjustmentsConfirmed'] as const) {
        const x = rrtaTipInput();
        delete need(x.rrtaPayrollSources)[field];
        expect(() => calculateUnreportedTipPayroll(x, getConstants(2025))).toThrow();
    }
    const dependent = rrtaTipInput();
    dependent.taxpayer.dependents = [{
            firstName: 'Child', lastName: 'Fictional', ssn: '111-22-3333', dateOfBirth: '2015-01-01', relationship: 'child', monthsLivedWithYou: 12, qualifiesForCTC: true, qualifiesForODC: false, qualifiesForEIC: false
        }];
    expect(() => calculateUnreportedTipPayroll(dependent, getConstants(2025))).toThrow();
    const missingZero = rrtaTipInput();
    delete need(missingZero.w2s[0]).socialSecurityTips;
    need(need(need(missingZero.rrtaPayrollSources).sources)[0]).originalW2 = structuredClone(missingZero.w2s[0]);
    expect(() => calculateUnreportedTipPayroll(missingZero, getConstants(2025))).toThrow(/unknown/);
});
it('requires known absence of self-employment and rejects supplied positive SE earnings', () => {
    const x = rrtaTipInput();
    expect(() => calculateForm8959(x, new Decimal('1000'), 'single', getConstants(2025))).toThrow(/self.employment/i);
});
it('requires explicit known no-self-employment sources before tip integration', () => {
    const x = rrtaTipInput();
    const packet = need(x.rrtaPayrollSources);
    Reflect.deleteProperty(packet, 'noSelfEmploymentIncomeConfirmed');
    expect(() => calculateUnreportedTipPayroll(x, getConstants(2025))).toThrow(/eligibility|self.employment/i);
});
it('keeps documented zero withholding distinct from unknown compensation', () => {
    const x = rrtaTipInput(2025, '230000', '0', '0'), r = calculateForm8959(x, new Decimal(0), 'single', getConstants(2025));
    expect(r.additionalMedicareTax.toFixed()).toBe('270');
    expect(r.withholdingCredit.toFixed()).toBe('0');
    expect(r.lines.find(l => l.line === '23')?.value.toFixed()).toBe('0');
});
it('uses actual annual SocialSecurity wage-base boundaries independently of Medicare', () => {
    for (const [year, base] of [[2025, '176100'], [2026, '184500']] as const) {
        for (const [below, ss] of [['0', '0'], ['100', '6']] as const) {
            const rail = new Decimal(base).minus(below).toFixed(), x = rrtaTipInput(year, rail, '0');
            const r = calculateUnreportedTipPayroll(x, year === 2025 ? getConstants(year) : FEDERAL_2026_CONSTANTS);
            expect(r.singular?.line11.toFixed()).toBe(ss);
            expect(r.singular?.line12.toFixed()).toBe('15');
        }
    }
});
it('rejects duplicate, wrong-owner and contradictory compensation inventories', () => {
    const changes: Array<(x: TaxYearInput) => void> = [
        x => {
            need(need(x.rrtaPayrollSources).sources).push(structuredClone(need(need(need(x.rrtaPayrollSources).sources)[0])));
        },
        x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).owner = 'spouse';
        },
        x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).tier1MedicareCompensation = '100001';
        },
        x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).w2SourceId = 'formW2:01';
        },
        x => {
            need(need(need(x.rrtaPayrollSources).sources)[0]).additionalMedicareTaxWithheld = '-1';
        },
        x => {
            need(x.w2s[0]).medicareWages = '1';
            need(need(need(x.rrtaPayrollSources).sources)[0]).originalW2 = structuredClone(x.w2s[0]);
        },
    ];
    for (const mutate of changes) {
        const x = rrtaTipInput();
        mutate(x);
        const before = structuredClone(x);
        expect(() => calculateUnreportedTipPayroll(x, getConstants(2025))).toThrow();
        expect(x).toEqual(before);
    }
});
it('retains ordinary nonRRTA line22 withholding equivalence', () => {
    const x = rrtaTipInput();
    delete x.rrtaPayrollSources;
    delete x.form4137;
    delete x.schedule1A;
    x.w2s = [{
            ...need(x.w2s[1]), wages: '230000', socialSecurityWages: '176100', socialSecurityWithheld: '10918.20', medicareWages: '230000', medicareWithheld: '3605'
        }];
    const r = calculateForm8959(x, new Decimal(0), 'single', getConstants(2025));
    expect(r.additionalMedicareTax.toFixed()).toBe('270');
    expect(r.withholdingCredit.toFixed()).toBe('270');
    expect(r.lines.find(l => l.line === '22')?.value.eq(r.withholdingCredit)).toBe(true);
    expect(r.lines.some(l => l.line === '23')).toBe(false);
});
it('sums two actual joint-owner RRTA sources at the separate joint threshold', () => {
    const x = rrtaTipInput(2025, '150000', '20000', '225'), other = rrtaTipInput(2025, '150000', '20000', '225');
    x.taxpayer.filingStatus = 'married_filing_jointly';
    x.taxpayer.spouse = {
        ...x.taxpayer.primary, firstName: 'John', ssn: '987-65-4321'
    };
    const spouseW2s = other.w2s.map(w => ({
        ...w, accountHolder: 'spouse' as const
    }));
    x.w2s.push(...spouseW2s);
    const spouseTip = need(other.form4137);
    spouseTip.accountHolder = 'spouse';
    need(need(need(spouseTip.sourceFacts).employers)[0]).w2SourceIds = ['formW2:3'];
    x.form4137ByOwner = {
        primary: need(x.form4137), spouse: spouseTip
    };
    delete x.form4137;
    delete x.schedule1A;
    const packet = need(x.rrtaPayrollSources), row = structuredClone(need(need(packet.sources)[0]));
    row.sourceId = 'spouse-railroad';
    row.w2SourceId = 'formW2:2';
    row.owner = 'spouse';
    row.originalW2 = structuredClone(x.w2s[2]);
    need(packet.sources).push(row);
    packet.originalTaxpayer = structuredClone(x.taxpayer);
    packet.originalTipForms = [{
            owner: 'primary', original: structuredClone(x.form4137ByOwner.primary)
        }, {
            owner: 'spouse', original: structuredClone(spouseTip)
        }];
    const before = structuredClone(x), r = calculateForm8959(x, new Decimal(0), 'married_filing_jointly', getConstants(2025));
    expect(r.lines.find(l => l.line === '14')?.value.toFixed()).toBe('300000');
    expect(r.lines.find(l => l.line === '17')?.value.toFixed()).toBe('450');
    expect(r.withholdingCredit.toFixed()).toBe('450');
    expect(calculateUnreportedTipPayroll(x, getConstants(2025)).tax.toFixed()).toBe('154');
    expect(x).toEqual(before);
});
it('never substitutes the SocialSecurity RRTA source for Medicare compensation', () => {
    const input = rrtaTipInput(2025, '230000', '0', '270');
    const packet = need(input.rrtaPayrollSources);
    need(need(packet.sources)[0]).tier1SocialSecurityCompensation = '150000';
    need(need(input.form4137).sourceFacts).railroadRetirementCompensation = '150000';
    packet.originalTipForms = [{ owner: 'primary', original: structuredClone(input.form4137) }];
    const payroll = calculateUnreportedTipPayroll(input, getConstants(2025));
    const medicare = calculateForm8959(input, new Decimal(0), 'single', getConstants(2025));
    expect(payroll.singular?.line8.toFixed()).toBe('150000');
    expect(payroll.tax.toFixed()).toBe('77');
    expect(medicare.lines.find(line => line.line === '14')?.value.toFixed()).toBe('230000');
    expect(medicare.additionalMedicareTax.toFixed()).toBe('270');
});
