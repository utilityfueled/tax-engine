// Spec: spec/federal/taxable-state-refund-recoveries.yaml.
import { it, expect } from 'vitest';
import { calculateForm1099G } from '@/engine/forms/form-1099-g.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { refundInput, refundSource, refundPayment, refundYearFacts } from '../../fixtures/taxable-state-refund-recoveries.js';
it('allocates official Example28 original payments to300 historical and100 current', () => {
    const input = refundInput(), original = structuredClone(input);
    const result = calculateForm1099G(input.form1099G ?? [], 2025, 'single');
    expect(result.refundSources.map(x => [x.refundExpenseTaxYear, x.amount.toFixed()])).toEqual([[2024, '300'], [2025, '100']]);
    expect(input).toEqual(original);
});
it('shares same-origin capacity and keeps different-year capacities separate', () => {
    const input = refundInput(2025, [refundSource(2025, 'a', '350', [refundPayment('originalA', '2024-05-15', '4000')]), refundSource(2025, 'b', '350', [refundPayment('originalB', '2024-06-15', '4000')])], [refundYearFacts(2024, { priorYearItemizedTotal: '15000', priorYearStateLocalTaxesPaid: '8000', priorYearSaltDeduction: '8000', priorYearOtherItemizedDeductions: '7000', priorYearTaxableIncome: '45000' })]);
    const result = calculateFederalTax(input);
    expect(result.schedule1?.taxableRefunds.toFixed()).toBe('400');
    expect(result.agi.toFixed()).toBe('50400');
});
import { TaxYearInputSchema, type TaxYearInput } from '@/models/inputs.js';
import { calculateTaxableStateRefundRecoveries } from '@/engine/forms/taxable-state-refund-recoveries.js';
import { calculateStateLocalIncomeTaxDeduction } from '@/engine/forms/state-local-income-tax-deduction.js';
const recalculate = (input: TaxYearInput) => calculateTaxableStateRefundRecoveries(TaxYearInputSchema.parse(input));
function refresh(input: TaxYearInput): TaxYearInput {
    required(input.taxableStateRefundRecoveries).originalTaxpayer = structuredClone(input.taxpayer);
    required(input.taxableStateRefundRecoveries).sourceOriginals = (input.form1099G ?? []).map(form => ({ sourceId: form.sourceId, original: structuredClone(form) }));
    return input;
}
it('rejects stale originals unknown payments and unsupported prior-return eligibility', () => {
    const variants: Array<(input: TaxYearInput) => void> = [
        input => { required(required(input.form1099G)[0]).accountReference = 'samecash new statement'; },
        input => { required(required(input.form1099G)[0]).stateOrLocalTaxRefund = '400.00'; },
        input => { required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[0]).sourceReference = 'changed original reference'; },
        input => { input.taxpayer.primary.lastName = 'Changed'; },
        input => { required(required(required(input.adjustments).estimatedTaxPayments)[0]).amount = '1000.00'; },
        input => { required(input.taxableStateRefundRecoveries).sourceOriginals = []; },
        input => { required(input.taxableStateRefundRecoveries).years = []; },
        input => { required(required(input.taxableStateRefundRecoveries).years).push(structuredClone(required(required(required(input.taxableStateRefundRecoveries).years)[0]))); },
        input => { required(input.form1099G).push(structuredClone(required(required(input.form1099G)[0]))); refresh(input); },
        input => { delete required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[3]).currentYearPayment; refresh(input); },
        input => { required(required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[3]).currentYearPayment).index = 1; refresh(input); },
        input => { required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[3]).datePaid = '2025-01-16'; refresh(input); },
        input => { delete required(required(required(input.form1099G)[0]).refundPaymentBasis).payments; refresh(input); },
        input => { delete required(required(required(input.form1099G)[0]).refundPaymentBasis).allPaymentsForStateReturnIncludedConfirmed; refresh(input); },
        input => { required(required(input.form1099G)[0]).refundExpenseTaxYear = 2024; refresh(input); },
        input => { required(required(input.form1099G)[0]).tradeOrBusinessRefund = true; refresh(input); },
        input => { required(required(required(input.form1099G)[0]).refundPaymentBasis).receivedDate = '2024-09-20'; refresh(input); },
        input => { required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[0]).datePaid = '2024-02-30'; refresh(input); },
        input => { required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[0]).sourceReference = required(required(required(required(required(input.form1099G)[0]).refundPaymentBasis).payments)[1]).sourceReference; refresh(input); },
    ];
    for (const mutate of variants) {
        const input = refundInput();
        mutate(input);
        expect(() => recalculate(input)).toThrow();
    }
    const missing = refundInput();
    delete missing.taxableStateRefundRecoveries;
    expect(() => calculateFederalTax(missing)).toThrow();
    expect(() => calculateStateLocalIncomeTaxDeduction(missing)).toThrow();
    const conflicting = refundInput();
    conflicting.taxableRefundWorksheet = { priorTaxYear: 2024, priorYearItemized: true, priorYearItemizedTotal: '20000', priorYearStandardDeduction: '14600', priorYearFilingStatus: 'single', priorYearStateLocalTaxesPaid: '4000', priorYearPropertyTaxesPaid: '0', priorYearAlternativeGeneralSalesTaxDeduction: '0' };
    expect(() => recalculate(conflicting)).toThrow();
});
it('denies unknown special treatment and unreconciled historical returns', () => {
    const keys = ['priorYearHadAMT', 'priorYearHadUnusedTaxCredits', 'priorYearHadTaxCredits', 'priorYearUsedSpecialTaxComputation', 'priorYearUsedPreferentialTaxWorksheet', 'priorYearWasDependent', 'priorYearNonresidentAlien', 'priorYearHadCarryoverBenefits', 'priorYearHadOtherRecoveries', 'priorYearHadEarlierRefunds', 'priorYearBlind', 'priorYearDeceased', 'priorYearMandatoryItemization', 'communityPropertyAllocationRequired'] as const;
    for (const key of keys)
        for (const value of [undefined, true]) {
            const input = refundInput();
            required(required(required(input.taxableStateRefundRecoveries).years)[0])[key] = value;
            expect(() => recalculate(input)).toThrow();
        }
    for (const change of [{ priorTaxYear: 2023 }, { priorYearStandardDeduction: '14601' }, { priorYearSaltDeduction: '3999' }, { priorYearOtherItemizedDeductions: '15999' }, { priorYearTaxableIncome: '40001' }, { priorYearAdjustedGrossIncome: '19999', priorYearTaxableIncome: '0' }, { priorYearAlternativeGeneralSalesTaxDeduction: undefined }, { priorYearAdditionalDeductions: '1' }, { priorYearFilingStatus: 'married_filing_jointly' }, { priorYearPrimarySsn: '999-00-9999' }])
        expect(() => calculateTaxableStateRefundRecoveries(refundInput(2025, undefined, [refundYearFacts(2024, change)]))).toThrow();
    for (const birth of ['1960-01-01', '1959-12-31']) {
        const input = refundInput();
        input.taxpayer.primary.dateOfBirth = birth;
        refresh(input);
        expect(() => recalculate(input)).toThrow();
    }
});
it('retains known zero and exact cents while denying fractional allocation', () => {
    const zero = refundInput(2025, [refundSource(2025, 'zero', '0', [refundPayment('explicit zero', '2024-04-15', '0')])]);
    const result = recalculate(zero);
    expect(result.taxableRefund.toFixed()).toBe('0');
    expect(required(result.allocations[0]).amount.toFixed()).toBe('0');
    const cents = refundInput(2025, [refundSource(2025, 'cents', '0.04', [refundPayment('threecents', '2024-04-15', '0.03'), refundPayment('onecents', '2025-01-15', '0.01', { collection: 'estimatedTaxPayments', index: 0 })])]);
    required(required(required(cents.adjustments).estimatedTaxPayments)[0]).amount = '0.01';
    const exact = recalculate(cents);
    expect(exact.allocations.map(row => row.amount.toFixed())).toEqual(['0.03', '0.01']);
    expect(exact.taxableRefund.toFixed()).toBe('0.03');
    for (const [refund, payments] of [
        ['0.01', [refundPayment('one', '2024-04-15', '1'), refundPayment('two', '2025-01-15', '2', { collection: 'estimatedTaxPayments', index: 0 })]],
        ['0.001', [refundPayment('one', '2024-04-15', '1')]],
        ['1', [refundPayment('zero', '2024-04-15', '0')]],
        ['2', [refundPayment('one', '2024-04-15', '1')]],
    ] as const) {
        const input = refundInput(2025, [refundSource(2025, 'invalid', refund, [...payments])]);
        expect(() => calculateForm1099G(required(input.form1099G), 2025, 'single')).toThrow();
    }
});
it('uses actual standard sales and joint historical deduction facts', () => {
    const standard = refundInput(2025, undefined, [refundYearFacts(2024, { priorYearItemized: false, priorYearStateLocalTaxElection: undefined, priorYearItemizedTotal: '0', priorYearSaltDeduction: '0', priorYearOtherItemizedDeductions: '0', priorYearTaxableIncome: '45400' })]);
    expect(recalculate(standard).taxableRefund.toFixed()).toBe('0');
    const sales = refundInput(2025, undefined, [refundYearFacts(2024, { priorYearStateLocalTaxElection: 'sales', priorYearAlternativeGeneralSalesTaxDeduction: '2000', priorYearSaltDeduction: '2000', priorYearOtherItemizedDeductions: '18000' })]);
    expect(recalculate(sales).taxableRefund.toFixed()).toBe('0');
    const alternative = refundInput(2025, undefined, [refundYearFacts(2024, { priorYearAlternativeGeneralSalesTaxDeduction: '3900' })]);
    expect(recalculate(alternative).taxableRefund.toFixed()).toBe('100');
    const joint = refundInput();
    joint.taxpayer.filingStatus = 'married_filing_jointly';
    joint.taxpayer.spouse = { ...joint.taxpayer.primary, firstName: 'Other', ssn: '222-33-4444' };
    Object.assign(required(required(required(joint.taxableStateRefundRecoveries).years)[0]), { priorYearFilingStatus: 'married_filing_jointly', priorYearSpouseSsn: '222-33-4444', priorYearStandardDeduction: '29200', priorYearItemizedTotal: '30000', priorYearOtherItemizedDeductions: '26000', priorYearTaxableIncome: '30000' });
    refresh(joint);
    expect(recalculate(joint).taxableRefund.toFixed()).toBe('300');
    expect(required(joint.taxableStateRefundRecoveries).originalTaxpayer).toEqual(joint.taxpayer);
});

function required<T>(value:T|undefined|null):T {if(value==null)throw new Error('Test fixture requires actual value');return value;}
it('binds current extension payments and rejects cross-source duplicate payment custody',()=>{
 const extension=refundInput();required(extension.adjustments).extensionPayments=structuredClone(required(extension.adjustments).estimatedTaxPayments);required(extension.adjustments).estimatedTaxPayments=[];
 required(required(required(required(required(extension.form1099G)[0]).refundPaymentBasis).payments)[3]).currentYearPayment={collection:'extensionPayments',index:0};refresh(extension);expect(recalculate(extension).currentYearRefund.toFixed()).toBe('100');expect(calculateStateLocalIncomeTaxDeduction(extension).total.toFixed()).toBe('900');
 const duplicate=refundInput(2025,[refundSource(2025,'first','100',[refundPayment('first actual','2025-01-15','1000',{collection:'estimatedTaxPayments',index:0})]),refundSource(2025,'second','100',[refundPayment('second actual','2025-01-15','1000',{collection:'estimatedTaxPayments',index:0})])],[]);expect(()=>recalculate(duplicate)).toThrow(/more than once/);
 const missingFlag=refundInput();delete required(missingFlag.taxableStateRefundRecoveries).allRefundSourcesIncludedConfirmed;expect(()=>recalculate(missingFlag)).toThrow();
 const allowedAge=refundInput();allowedAge.taxpayer.primary.dateOfBirth='1960-01-02';refresh(allowedAge);expect(recalculate(allowedAge).taxableRefund.toFixed()).toBe('300');
});
it('reconciles actual refund aliases once and rejects reused original payment references',()=>{
 for(const aliasOnly of [true,false]){const input=refundInput();const form=required(required(input.form1099G)[0]);form.stateLocalIncomeTaxRefund='400';form.stateOrLocalTaxRefund=aliasOnly?'0':'400';refresh(input);expect(recalculate(input).taxableRefund.toFixed()).toBe('300');expect(recalculate(input).currentYearRefund.toFixed()).toBe('100');}
 const conflict=refundInput();required(required(conflict.form1099G)[0]).stateLocalIncomeTaxRefund='401';refresh(conflict);expect(()=>recalculate(conflict)).toThrow(/aliases/);
 const repeated=refundInput(2025,[refundSource(2025,'first','100',[refundPayment(' actual reused payment ','2024-01-15','1000')]),refundSource(2025,'second','100',[refundPayment('actual reused payment','2024-01-15','1000')])]);expect(()=>recalculate(repeated)).toThrow(/reuses/);
});
