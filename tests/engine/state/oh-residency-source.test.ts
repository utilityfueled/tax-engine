/** Spec: spec/state/oh-input-adapter.yaml#actual-owner-residency-nrc-source */
import { it, expect } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { prepareOhioResidencyReview, resolveOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { OhioResidencyFactsSchema } from '@/models/ohio-residency.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { ohioResidencyFacts, ohioResidencyOwner } from '../../fixtures/oh-residency.js';
function packet() { const input = structuredClone(simpleW2Fixture); input.w2s = [{ ...input.w2s![0]!, accountHolder: 'primary', taxYear: 2025, wages: '100000', socialSecurityWages: '100000', medicareWages: '100000', federalWithheld: '0', state: 'OH', stateWages: '20000', stateTaxWithheld: '0', localTaxWithheld: '0' }]; const facts = { ...ohioResidencyFacts(), originalFederalSources: structuredClone(input) }; Object.assign(facts.owners[0]!.amounts.wages, { federalAmount: '100000', nonresidentOhioAmount: '20000' }); return { input, facts }; }
it('sources canonical actual owner amounts without Ohio wage-only AGI', () => { const { input, facts } = packet(); const federal = calculateFederalTax(input); const adapted = buildOhioResidentReturnInput(input, federal, { residency: facts }); expect(adapted.federalAgi.toString()).toBe('100000'); const actual = calculateOhioResidentReturn(adapted); expect(actual.nonresidentCreditResult!.line19.toFixed(4)).toBe('0.8000'); expect(actual.nonresidentCreditResult!.line20.toFixed()).toBe('1858'); expect(actual.it1040.line10_taxAfterCredits.toFixed()).toBe('465'); });
it.each(['legacyCredit', 'unknownOwner', 'wrongOwnerAmount', 'sameMoneyChangedEmployer', 'unconfirmed', 'businessSource', 'staleFederal', 'schoolDistrictWithholding', 'ignoredOhioAddition', 'ignoredOhioDeduction'])('rejects canonical NRC source contradiction %s', kind => { const { input, facts } = packet(); if (kind === 'unknownOwner')
    delete input.w2s![0]!.accountHolder; if (kind === 'wrongOwnerAmount')
    facts.owners[0]!.amounts.wages.federalAmount = '99999'; if (kind === 'sameMoneyChangedEmployer')
    input.w2s![0]!.employer.name = 'Different original employer'; if (kind === 'unconfirmed')
    (facts as unknown as {sourceFactsConfirmed:boolean}).sourceFactsConfirmed = false; if (kind === 'businessSource')
    input.form1099Nec = [{ payer: 'Actual different business payer', nonemployeeCompensation: '1', federalWithheld: '0', accountHolder: 'primary' } as never]; if (kind === 'schoolDistrictWithholding')
    input.w2s![0]!.localTaxWithheld = '10'; const federal = calculateFederalTax(input); if (kind === 'staleFederal')
    federal.agi = federal.agi.plus(1); expect(() => buildOhioResidentReturnInput(input, federal, { residency: facts, ...(kind === 'legacyCredit' ? { nonresidentCredit: '1' } : {}), ...(kind === 'ignoredOhioAddition' ? { otherAdditions: '100' } : {}), ...(kind === 'ignoredOhioDeduction' ? { otherDeductions: '100' } : {}) })).toThrow(); });
it('rejects a nonzero bare legacy NRC scalar without source packet', () => { const { input } = packet(); const federal = calculateFederalTax(input); expect(() => buildOhioResidentReturnInput(input, federal, { nonresidentCredit: '1' })).toThrow(); });
it('binds original current calculation before permitted review redaction', () => { const { input, facts } = packet(); const actual = { ...input, ohioResidency: facts }; const federal = calculateFederalTax(actual); const token = prepareOhioResidencyReview(actual); expect(resolveOhioResidencyReview(redactReviewIdentifiers(actual), federal, token).taxpayer.primary.ssn).toBe(input.taxpayer.primary.ssn); expect(() => resolveOhioResidencyReview(redactReviewIdentifiers(actual), { ...federal, agi: federal.agi.plus(1) }, token)).toThrow(); const changed = structuredClone(actual); changed.w2s![0]!.employer.name = 'Changed same-dollar source'; expect(() => resolveOhioResidencyReview(changed, federal, token)).toThrow(); });
it('does not silently discard actual district/local withholding on a fullresident source packet', () => { const { input, facts } = packet(); facts.owners[0]!.status = 'full_year_resident'; facts.owners[0]!.periods[0]!.domicileState = 'OH'; Object.assign(facts.owners[0]!.amounts.wages, { residentAmount: '100000', nonresidentOhioAmount: '0' }); input.w2s![0]!.localTaxWithheld = '10'; facts.originalFederalSources = structuredClone(input); expect(() => buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts })).toThrow(); });
it('rejects claimed adjustment originals that contradict the current zero adjustment record', () => { const { input, facts } = packet(); facts.owners[0]!.stateAdditions = [{ line: '13', fullAmount: '100', ohioAmount: '0', sourceReference: 'Contradictory claimed addition original' }] as never; expect(() => buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts })).toThrow(); });

it.each(['scalar','rows'])('rejects unqualified resident-credit source on fullresident packet %s',kind=>{const {input,facts}=packet();facts.owners[0]!.status='full_year_resident';facts.owners[0]!.periods[0]!.domicileState='OH';Object.assign(facts.owners[0]!.amounts.wages,{residentAmount:'100000',nonresidentOhioAmount:'0'});facts.originalFederalSources=structuredClone(input);expect(()=>buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts,...(kind==='scalar'?{residentCredit:'1'}:{otherStateTaxes:[{stateCode:'VA',doubleTaxedIncome:'10000',taxPaid:'100'}]})})).toThrow();});

it.each([['part_year_resident','1394','929'],['full_year_resident','0','2323']] as const)('reconciles actual canonical %s income-tax worksheet', (status,credit,remaining)=>{const {input,facts}=packet();const owner=facts.owners[0]!;owner.status=status;owner.periods=status==='full_year_resident'?[{from:'2025-01-01',to:'2025-12-31',domicileState:'OH'}]:[{from:'2025-01-01',to:'2025-06-30',domicileState:'VA'},{from:'2025-07-01',to:'2025-12-31',domicileState:'OH'}];Object.assign(owner.amounts.wages,{residentAmount:status==='full_year_resident'?'100000':'30000',nonresidentOhioAmount:status==='full_year_resident'?'0':'10000'});input.w2s![0]!.stateWages=status==='full_year_resident'?'100000':'40000';facts.originalFederalSources=structuredClone(input);const result=calculateOhioResidentReturn(buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts}));expect(result.nonresidentCreditResult!.line20.toFixed()).toBe(credit);expect(result.it1040.line10_taxAfterCredits.toFixed()).toBe(remaining);});

const unemploymentForm = {
    payer: 'Synthetic unemployment agency', payerTin: '12-3456789', accountHolder: 'primary',
    sourceId: 'synthetic-gov-01', accountReference: 'Synthetic complete statement', taxYear: 2025,
    sourceFormRevision: '2024-03', sourceFactsConfirmed: true, actualReceiptConfirmed: true,
    additionalWorksheetRequired: false, programType: 'government-unemployment', unemploymentCompensation: '1000',
    federalWithheld: '0', stateOrLocalTaxRefund: '0', rtaaPayments: '0', taxableGrants: '0',
    agriculturePayments: '0', marketGain: '0', tradeOrBusinessRefund: false, currentYearRepaid: '0',
    priorYearRepaid: '0', unrecoveredAfterTaxContributions: '0', stateTaxReporting: 'none', stateWithheld: '0',
};
const unemploymentPayment = {
    originalSourceId: unemploymentForm.sourceId, sourceReference: 'Synthetic original payment record',
    allPaymentsIncludedConfirmed: true as const, paidOrAccruedOn: '2025-07-01', amount: '1000.00',
};
const unemploymentPaymentSchedule = {
    originalSourceId: unemploymentForm.sourceId,
    allPaymentsIncludedConfirmed: true,
    payments: [
        { sourceReference: 'Synthetic June original receipt', paidOrAccruedOn: '2025-06-30', amount: '400' },
        { sourceReference: 'Synthetic July original receipt', paidOrAccruedOn: '2025-07-01', amount: '600' },
    ],
} as const;
function unemploymentPacket(status: 'part_year_resident' | 'nonresident', residentAmount: string, originals: unknown[] = [unemploymentForm]) {
    const baseline = packet().input;
    const [wage] = baseline.w2s;
    if (wage) wage.stateWages = status === 'nonresident' ? '20000' : '40000';
    const input = TaxYearInputSchema.parse({ ...baseline, form1099G: originals });
    const owner = ohioResidencyOwner('primary', status);
    Object.assign(owner.amounts.wages, {
        federalAmount: '100000', residentAmount: status === 'nonresident' ? '0' : '30000',
        nonresidentOhioAmount: status === 'nonresident' ? '20000' : '10000',
    });
    Object.assign(owner.amounts.unemployment, { federalAmount: unemploymentForm.unemploymentCompensation, residentAmount });
    const facts = { ...ohioResidencyFacts(), owners: [owner], originalFederalSources: structuredClone(input) };
    return { input, owner, facts };
}

it('allocates one actual Ohio NRC unemployment payment by domicile date', () => {
    const cases = [
        { status: 'part_year_resident', day: '2025-07-01', ohio: '1000', line17: '41000', ratio: '0.5940', credit: '1396', tax: '955' },
        { status: 'part_year_resident', day: '2025-06-30', ohio: '0', line17: '40000', ratio: '0.6039', credit: '1420', tax: '931' },
        { status: 'nonresident', day: undefined, ohio: '0', line17: '20000', ratio: '0.8019', credit: '1885', tax: '466' },
        { status: 'nonresident', day: '2025-07-01', ohio: '0', line17: '20000', ratio: '0.8019', credit: '1885', tax: '466' },
    ] as const;
    for (const example of cases) {
        const { input, facts } = unemploymentPacket(example.status, example.ohio);
        const residency = example.day ? {
            ...facts, unemploymentPaymentSource: { ...unemploymentPayment, paidOrAccruedOn: example.day },
        } : facts;
        const canonical = TaxYearInputSchema.parse(JSON.parse(JSON.stringify({ ...input, ohioResidency: residency })));
        const federal = calculateFederalTax(canonical);
        const state = calculateOhioResidentReturn(buildOhioResidentReturnInput(canonical, federal));
        expect(federal.otherIncome.toFixed()).toBe('1000');
        expect(state.it1040.line3_ohioAgi.toFixed()).toBe('101000');
        expect(state.nonresidentCreditResult?.line12.toFixed()).toBe(example.ohio);
        expect(state.nonresidentCreditResult?.line13.toFixed()).toBe('0');
        expect(state.nonresidentCreditResult?.line17.toFixed()).toBe(example.line17);
        expect(state.nonresidentCreditResult?.line19.toFixed(4)).toBe(example.ratio);
        expect(state.nonresidentCreditResult?.line20.toFixed()).toBe(example.credit);
        expect(state.it1040.line10_taxAfterCredits.toFixed()).toBe(example.tax);
    }
});

it('allocates multiple receipts of the same original Form 1099-G across a domicile change', () => {
    const partYear = unemploymentPacket('part_year_resident', '600');
    const nonresident = unemploymentPacket('nonresident', '0');
    for (const [fixture, residentAmount, nrcIncome, ratio, credit, tax] of [
        [partYear, '600', '40600', '0.5980', '1406', '945'],
        [nonresident, '0', '20000', '0.8019', '1885', '466'],
    ] as const) {
        const { input, facts } = fixture;
        const canonical = TaxYearInputSchema.parse(JSON.parse(JSON.stringify({
            ...input, ohioResidency: { ...facts, unemploymentPaymentSchedule },
        })));
        const federal = calculateFederalTax(canonical);
        const state = calculateOhioResidentReturn(buildOhioResidentReturnInput(canonical, federal));

        expect(federal.otherIncome.toFixed()).toBe('1000');
        expect(state.it1040.line3_ohioAgi.toFixed()).toBe('101000');
        expect(state.nonresidentCreditResult?.line12.toFixed()).toBe(residentAmount);
        expect(state.nonresidentCreditResult?.line13.toFixed()).toBe('0');
        expect(state.nonresidentCreditResult?.line17.toFixed()).toBe(nrcIncome);
        expect(state.nonresidentCreditResult?.line19.toFixed(4)).toBe(ratio);
        expect(state.nonresidentCreditResult?.line20.toFixed()).toBe(credit);
        expect(state.it1040.line10_taxAfterCredits.toFixed()).toBe(tax);
    }
});

it('requires a complete unique payment schedule linked to the same Form 1099-G', () => {
    const { input, facts } = unemploymentPacket('part_year_resident', '600');
    const federal = calculateFederalTax(input);
    const [june, july] = unemploymentPaymentSchedule.payments;
    for (const payment of [
        { ...unemploymentPaymentSchedule, allPaymentsIncludedConfirmed: false },
        { ...unemploymentPaymentSchedule, payments: [june] },
    ]) {
        expect(OhioResidencyFactsSchema.safeParse({ ...facts, unemploymentPaymentSchedule: payment }).success).toBe(false);
    }
    for (const payment of [
        { ...unemploymentPaymentSchedule, originalSourceId: 'wrong statement' },
        { ...unemploymentPaymentSchedule, payments: [june, { ...july, amount: '599' }] },
        { ...unemploymentPaymentSchedule, payments: [june, { ...july, amount: '600.25' }] },
        { ...unemploymentPaymentSchedule, payments: [{ ...june, amount: '0' }, { ...july, amount: '1000' }] },
        { ...unemploymentPaymentSchedule, payments: [june, { ...july, sourceReference: june.sourceReference }] },
        { ...unemploymentPaymentSchedule, payments: [june, { ...july, paidOrAccruedOn: '2025-06-31' }] },
        { ...unemploymentPaymentSchedule, payments: [june, { ...july, paidOrAccruedOn: '2025-06-30' }] },
    ]) {
        const residency = { ...facts, unemploymentPaymentSchedule: payment };
        expect(() => buildOhioResidentReturnInput(input, federal, { residency })).toThrow(/unemployment/i);
    }
    const ambiguous = { ...facts, unemploymentPaymentSchedule, unemploymentPaymentSource: unemploymentPayment };
    expect(() => buildOhioResidentReturnInput(input, federal, { residency: ambiguous })).toThrow(/unemployment/i);
});

it('rejects unmatched Ohio NRC unemployment payment evidence or allocations', () => {
    const { input, owner, facts } = unemploymentPacket('part_year_resident', '1000');
    const federal = calculateFederalTax(input);
    const adapt = (proof?: typeof unemploymentPayment) => {
        const residency = { ...facts, ...(proof ? { unemploymentPaymentSource: proof } : {}) };
        return buildOhioResidentReturnInput(input, federal, { residency });
    };
    expect(() => adapt()).toThrow(/actual complete.*unemployment payment/i);
    for (const proof of [
        { ...unemploymentPayment, originalSourceId: 'different-statement' },
        { ...unemploymentPayment, amount: '999.99' },
        { ...unemploymentPayment, paidOrAccruedOn: '2026-07-01' },
        { ...unemploymentPayment, paidOrAccruedOn: '2025-02-29' },
        { ...unemploymentPayment, paidOrAccruedOn: '2025-06-30' },
    ]) expect(() => adapt(proof)).toThrow(/unemployment/i);

    owner.amounts.unemployment.federalAmount = '999.99';
    expect(() => adapt(unemploymentPayment)).toThrow(/unemployment/i);
    owner.amounts.unemployment.federalAmount = '1000';
    owner.amounts.unemployment.nonresidentOhioAmount = '1';
    expect(() => adapt(unemploymentPayment)).toThrow(/unemployment/i);
    const outside = unemploymentPacket('nonresident', '1000');
    expect(() => buildOhioResidentReturnInput(outside.input, calculateFederalTax(outside.input), { residency: outside.facts }))
        .toThrow(/unemployment/i);
    const unlinked = unemploymentPacket('part_year_resident', '1000', []);
    const unlinkedFacts = { ...unlinked.facts, unemploymentPaymentSource: unemploymentPayment };
    expect(() => buildOhioResidentReturnInput(unlinked.input, calculateFederalTax(unlinked.input), { residency: unlinkedFacts }))
        .toThrow(/unemployment/i);
});

it('preserves school district admission before unsupported unemployment evidence', () => {
    const { input, owner, facts } = unemploymentPacket('nonresident', '0');
    owner.status = 'full_year_resident';
    owner.periods[0] = { from: '2025-01-01', to: '2025-12-31', domicileState: 'OH' };
    const residency = {
        ...facts, schoolDistrictStatus: 'actual_district_sources_required' as const,
        unemploymentPaymentSource: unemploymentPayment,
    };
    expect(() => buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency }))
        .toThrow(/actual school district residency sources/i);
});

it('holds ambiguous Ohio NRC unemployment originals for separate methods', () => {
    for (const originals of [
        [unemploymentForm, unemploymentForm],
        [unemploymentForm, { ...unemploymentForm, sourceId: 'synthetic-second', accountReference: 'Separate statement' }],
        [{ ...unemploymentForm, accountHolder: 'spouse' }],
        [{ ...unemploymentForm, taxYear: 2026 }],
        [{ ...unemploymentForm, programType: 'private-or-union' }],
        [{ ...unemploymentForm, unemploymentCompensation: '1000.01' }],
        [{ ...unemploymentForm, rtaaPayments: '1' }],
        [{ ...unemploymentForm, currentYearRepaid: '1', unemploymentReceivedBeforeRepayment: '1001',
            box1IncludesCurrentYearRepayment: false, repaymentSourceReference: 'Actual repayment' }],
    ]) {
        const { input, facts } = unemploymentPacket('nonresident', '0', originals);
        expect(() => buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts }))
            .toThrow(/unemployment|Form1099G/i);
    }
});

it.each(['IN','KY','MI','PA','WV'])('requires actual reciprocal-period wage exemption source for%s',state=>{const {input,facts}=packet();facts.owners[0]!.periods[0]!.domicileState=state;expect(()=>buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts})).toThrow();});

it.each(['nonresident','full_year_resident'] as const)('binds actual private owner identity on%s packets before permitted render redaction',status=>{const {input,facts}=packet();if(status==='full_year_resident'){facts.owners[0]!.status=status;facts.owners[0]!.periods[0]!.domicileState='OH';Object.assign(facts.owners[0]!.amounts.wages,{residentAmount:'100000',nonresidentOhioAmount:'0'});}input.taxpayer.primary.ssn='900-70-0311';expect(()=>buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts})).toThrow();});


it('changes the digest-only current-original commitment after an equal-money actual owner replacement', () => {
  const { input, facts } = packet();
  const before = buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts });
  const changed = structuredClone(input);
  changed.taxpayer.primary.ssn = '900-70-0322';
  const changedFacts = structuredClone(facts);
  changedFacts.originalFederalSources = structuredClone(changed);
  const after = buildOhioResidentReturnInput(changed, calculateFederalTax(changed), { residency: changedFacts });
  expect(before.residencySourceDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(after.residencySourceDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(after.residencySourceDigest).not.toBe(before.residencySourceDigest);
  expect(JSON.stringify(calculateOhioResidentReturn(after).lines)).not.toContain('900-70-0322');
});
