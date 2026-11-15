import { required } from '../../fixtures/foreign-tax-k3-ordinary';
import { requireForeignTaxK3Ordinary } from '@/engine/forms/foreign-tax-k3-ordinary';
import { buildForm1116ReferenceSummary } from '@/pdf/fill-form-1116';
// Spec: spec/federal/foreign-tax-k3-ordinary.yaml, canonical/boundaries.
import { expect, it } from 'vitest';
import { calculateFederalTax } from '@/engine/federal';
import { TaxYearInputSchema } from '@/models/inputs';
import { foreignTaxK3OrdinaryFixture } from '../../fixtures/foreign-tax-k3-ordinary';
it('admits qualified K3 originals into independent regular and AMT limits', () => {
    const input = foreignTaxK3OrdinaryFixture(), before = JSON.stringify(input), result = calculateFederalTax(input);
    expect(TaxYearInputSchema.safeParse(input).success).toBe(true);
    expect(result.agi.toFixed()).toBe('100000');
    expect(result.taxableIncome.toFixed()).toBe('84250');
    expect(result.ordinaryTax.toFixed()).toBe('13455');
    expect(result.foreignTaxCredit.toFixed()).toBe('900');
    expect(result.foreignTaxOrdinaryCredit?.amt.creditAllowed.toFixed()).toBe('619');
    expect(result.foreignTaxOrdinaryCredit?.amt.currentCarryforward.toFixed()).toBe('281');
    expect(result.form6251?.tentativeMinimumTax.toFixed()).toBe('2475');
    expect(result.form6251?.amt.toFixed()).toBe('0');
    expect(result.totalTax.toFixed()).toBe('12555');
    expect(input.w2s[0].federalWithheld).toBe('12000');
    expect(result.totalPayments.toFixed()).toBe('12000');
    expect(result.estimatedTaxPenalty.toFixed()).toBe('0');
    expect(input?.form2210).toBeUndefined();
    expect(input?.priorYear).toBeUndefined();
    expect(result.form2210.sourceFactsVerified).toBe(false);
    expect(result.form2210.safeHarborMet).toBe(true);
    expect(result.form2210.safeHarborReason).toBe('Tax shown minus withholding < $1,000');
    expect(result.amountOwed.toFixed()).toBe('555');
    expect(result.refund.toFixed()).toBe('0');
    expect(JSON.stringify(input)).toBe(before);
});
it('rejects incomplete conflicting or unsupported original facts without mutation', () => {
    const edits: Array<(input: ReturnType<typeof foreignTaxK3OrdinaryFixture>) => void> = [i => { i.scheduleK1[0].accountHolder = 'spouse'; }, i => { i.scheduleK1[0].taxYear = 2024; }, i => { i.scheduleK1[0].entityType = 's_corporation'; }, i => { i.scheduleK1[0].ordinaryIncome = '1'; }, i => { i.scheduleK1[0].ordinaryDividends = '1'; }, i => { i.scheduleK1[0].amtOtherItems = '1'; }, i => { i.scheduleK1[0].isPubliclyTradedPartnership = true; }, i => { i.scheduleK1[0].beginningBasis = '0'; i.scheduleK1[0].interestIncome = '0'; i.scheduleK1[0].foreignSourceIncome = '0'; }, i => { i.scheduleK1[0].partnershipEIN = '98-7654321'; }, i => { i.scheduleK1.push(structuredClone(i.scheduleK1[0])); }, i => { required(required(required(i.foreignTaxElection).creditWithForm1116).incomeSources)[0].foreignCountry = 'US'; }];
    for (const edit of edits) {
        const input = foreignTaxK3OrdinaryFixture();
        edit(input);
        const before = JSON.stringify(input);
        expect(() => calculateFederalTax(input)).toThrow();
        expect(JSON.stringify(input)).toBe(before);
    }
});
it('requires each actual qualified original amount confirmation and paid USD record', () => {
    const fields = ['foreignDeductions', 'foreignInterestExpense', 'otherExpenses', 'taxReduction', 'redeterminationAmount'] as const;
    const flags = ['domesticContinuingNonPtpConfirmed', 'portfolioIncomeOnlyConfirmed', 'allOtherK1AmountsZeroConfirmed', 'noOtherBasisChangesConfirmed', 'priorBasisSuspensionsZeroConfirmed', 'priorAtRiskSuspensionsZeroConfirmed', 'priorPassiveSuspensionsZeroConfirmed', 'sourceFactsConfirmed', 'calendarYearPartnershipConfirmed', 'usdReportedPaidTaxesConfirmed'] as const;
    for (const field of fields)
        for (const value of [undefined, '0.01', '-0.01', '']) {
            const input = foreignTaxK3OrdinaryFixture();
            required(required(required(required(input.foreignTaxElection).creditWithForm1116).incomeSources)[0].qualifiedPartnership)[field] = value;
            expect(() => calculateFederalTax(input)).toThrow();
        }
    for (const field of flags)
        for (const value of [undefined, false]) {
            const input = foreignTaxK3OrdinaryFixture();
            required(required(required(required(input.foreignTaxElection).creditWithForm1116).incomeSources)[0].qualifiedPartnership)[field] = value;
            expect(() => calculateFederalTax(input)).toThrow();
        }
    for (const payments of [undefined, [], [{ date: '2024-09-15', amountUsd: '900' }], [{ date: '2025-02-30', amountUsd: '900' }], [{ date: '2025-09-15', amountUsd: '899.99' }]]) {
        const input = foreignTaxK3OrdinaryFixture();
        required(required(required(required(input.foreignTaxElection).creditWithForm1116).incomeSources)[0].qualifiedPartnership).entityPaidTaxPayments = payments;
        expect(() => calculateFederalTax(input)).toThrow();
    }
    const unknown = foreignTaxK3OrdinaryFixture();
    Object.assign(required(required(required(unknown.foreignTaxElection).creditWithForm1116).incomeSources)[0].qualifiedPartnership, { guessedRate: '1' });
    expect(() => calculateFederalTax(unknown)).toThrow();
    expect(TaxYearInputSchema.safeParse(unknown).success).toBe(false);
});
it('preserves exact cent basis boundary and separate current credit records with private originals excluded', () => {
    const input = foreignTaxK3OrdinaryFixture(), source = required(required(required(input.foreignTaxElection).creditWithForm1116).incomeSources)[0], original = input.scheduleK1[0];
    Object.assign(original, { interestIncome: '100', foreignSourceIncome: '100', foreignTaxPaid: '100.01', beginningBasis: '0.01' });
    source.reportedIncome = '100';
    source.foreignIncome = '100';
    required(required(input.foreignTaxElection).sources)[0].reportedTaxAmount = '100.01';
    required(required(source.qualifiedPartnership).entityPaidTaxPayments)[0].amountUsd = '100.01';
    expect(requireForeignTaxK3Ordinary(input, source)).toBe(original);
    original.beginningBasis = '0';
    expect(() => requireForeignTaxK3Ordinary(input, source)).toThrow(/basis/i);
    const positive = foreignTaxK3OrdinaryFixture(), result = calculateFederalTax(positive), summary = JSON.stringify(buildForm1116ReferenceSummary(result));
    for (const marker of ['Fictional Ordinary LP', '123456789', 'Private', 'Canada', '2025-09-15'])
        expect(summary).not.toContain(marker);
    expect(result.carryforwards.amtForeignTaxCreditCarryforwardByCategory?.passive?.[0].amount.toFixed()).toBe('281');
});
it('reopens the canonical review record without exposing original K3 identity or promoting filing', async () => {
    const { fillReturn } = await import('@/pdf/fill-return');
    const { FORM_1116_REFERENCE_FILENAME } = await import('@/pdf/fill-form-1116');
    const { mkdtemp, readFile, rm } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');
    const { execFileSync } = await import('../../helpers/file-stdin-exec');
    const input = foreignTaxK3OrdinaryFixture(), result = calculateFederalTax(input), directory = await mkdtemp(join(tmpdir(), 'k3-ordinary-review-'));
    try {
        const { filledForms } = await fillReturn(input, result, { blankFormsDir: 'forms/blank', outputDir: directory });
        const file = filledForms.find(path => path.endsWith(FORM_1116_REFERENCE_FILENAME));
        expect(file).toBeDefined();
        const pages = JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? 'python3', ['-c', "import io,sys,json;from pypdf import PdfReader;print(json.dumps([p.extract_text() or '' for p in PdfReader(io.BytesIO(sys.stdin.buffer.read())).pages]))"], { input: await readFile(required(file)), encoding: 'utf8' })) as string[];
        const text = pages.join(' ');
        expect(text).toContain('Ordinary Foreign Tax Credit Review Record');
        expect(text).toContain('Value: 900');
        expect(text).toContain('Value: 619');
        expect(text).toContain('Value: 281');
        const { REVIEW_PDF_NOTICE } = await import('@/pdf/export-policy');
        for (const page of pages)
            expect(page.split(REVIEW_PDF_NOTICE)).toHaveLength(2);
        for (const marker of ['Fictional Ordinary LP', '12-3456789', 'Private', 'Canada', '2025-09-15'])
            expect(text).not.toContain(marker);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
});
