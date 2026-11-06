import { describe, expect, it } from 'vitest';
import { calculateIraBasisSources } from '@/engine/forms/ira-basis-sources.js';
import { calculateForm8606 } from '@/engine/forms/form-8606.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { ordinaryIraFacts as ordinary, ordinaryIraBasisFixture as fixture } from '../../fixtures/ira-basis.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';

// Spec: spec/federal/ira-basis-sources.yaml. Independently calculated ordinary
// owner controls: primary ratio.333 → tax668/basis667; spouse.2 → tax1600/basis1600.
const run = (input: unknown) => calculateIraBasisSources(TaxYearInputSchema.parse(input));

describe('Actual ordinary IRA basis sources', () => {
  it('binds separate owners and aggregates exact original account and distribution cents', () => {
    const input = fixture();
    input.iraBasisSources.owners[0].accounts[0].yearEndValue = '1000.24';
    input.iraBasisSources.owners[0].accounts.push({ ...input.iraBasisSources.owners[0].accounts[0],
      accountId: 'primary-two', accountReference: 'primary-other-private-account', yearEndValue: '1002.25' });
    input.form1099R[0].grossDistribution = '500.24'; input.iraBasisSources.distributions[0].grossDistribution = '500.24';
    input.form1099R.push({ ...input.form1099R[0], accountReference: 'primary-other-private-account', grossDistribution: '501.25' });
    input.iraBasisSources.distributions.push({ ...input.iraBasisSources.distributions[0], sourceId: 'form1099R:2',
      accountId: 'primary-two', accountReference: 'primary-other-private-account', grossDistribution: '501.25' });
    const result = run(input)!;
    expect(result.form8606ByOwner.primary?.yearEndValue).toBe('2002.49');
    expect(result.form8606ByOwner.primary?.traditionalDistributions).toBe('1001.49');
    const primary = calculateForm8606(result.form8606ByOwner.primary!);
    const spouse = calculateForm8606(result.form8606ByOwner.spouse!);
    expect(primary.taxableTraditionalDistributions.toFixed()).toBe('668'); expect(primary.line14.toFixed()).toBe('667');
    expect(spouse.taxableTraditionalDistributions.toFixed()).toBe('1600'); expect(spouse.line14.toFixed()).toBe('1600');
    const adjusted = fixture(); adjusted.iraBasisSources.owners[0].basisHistory.line15cWorksheetAdjustment = '1000';
    expect(run(adjusted)?.form8606ByOwner.primary?.priorYearBasis).toBe('2000');
  });

  it('rejects stale missing duplicate or conflicting original distribution sources', () => {
    const edits: ((input: ReturnType<typeof fixture>) => void)[] = [
      input => { input.form1099R[0].taxYear = 2026; },
      input => { delete input.form1099R[0].taxYear; },
      input => { input.form1099R[0].grossDistribution = '1001.50'; },
      input => { input.form1099R[0].payerTin = '98-7654321'; },
      input => { input.form1099R[0].accountReference = 'edited-account'; },
      input => { delete input.form1099R[0].accountHolder; },
      input => { input.form1099R[0].taxableAmount = '123'; },
      input => { input.form1099R[0].taxableAmountNotDetermined = false; },
      input => { input.iraBasisSources.distributions.pop(); },
      input => { input.iraBasisSources.distributions.push({ ...input.iraBasisSources.distributions[0] }); },
      input => { input.iraBasisSources.distributions[0].accountId = 'spouse-one'; },
      input => { input.iraBasisSources.distributions[0].taxYear = 2026; },
    ];
    for (const edit of edits) { const input = fixture(); edit(input); expect(() => run(input)).toThrow(); }
    const known = fixture(); known.form1099R[0].taxableAmount = '900';
    known.iraBasisSources.distributions[0] = { ...known.iraBasisSources.distributions[0], taxableAmount: '900' };
    expect(run(known)?.form8606ByOwner.primary?.traditionalDistributions).toBe('1001.49');
  });

  it('rejects incomplete household account and prior-basis histories', () => {
    const edits: ((input: ReturnType<typeof fixture>) => void)[] = [
      input => { input.iraBasisSources.sourceFactsConfirmed = false; },
      input => { input.iraBasisSources.allIraOwnersAndAccountsIncluded = false; },
      input => { input.iraBasisSources.allDistributionsIncluded = false; },
      input => { input.iraBasisSources.owners[0].identity.firstName = 'Other'; },
      input => { input.taxpayer.primary.ssn = ''; },
      input => { input.taxpayer.primary.dateOfBirth = '1960-02-30'; },
      input => { input.iraBasisSources.owners[0].basisHistory.taxYear = 2025; },
      input => { input.iraBasisSources.owners[0].basisHistory.taxYear = 2000; },
      input => { input.iraBasisSources.owners[0].basisHistory.mostRecentFormConfirmed = false; },
      input => { input.iraBasisSources.owners[0].basisHistory.basisChangesSinceThatReturn = true; },
      input => { input.iraBasisSources.owners[0].basisHistory.taxYear = 2023; input.iraBasisSources.owners[0].basisHistory.line15cWorksheetAdjustment = '1'; },
      input => { input.iraBasisSources.owners[0].accounts[0].yearEndValue = ''; },
      input => { input.iraBasisSources.owners[0].accounts[0].yearEndValue = '-1'; },
      input => { input.iraBasisSources.owners[0].accounts[0].taxYear = 2026; },
      input => { input.iraBasisSources.owners[0].accounts.push({ ...input.iraBasisSources.owners[0].accounts[0] }); },
      input => { input.iraBasisSources.owners.push({ ...input.iraBasisSources.owners[0] }); },
    ];
    for (const edit of edits) { const input = fixture(); edit(input); expect(() => run(input)).toThrow(); }
    const zero = fixture(); zero.iraBasisSources.owners[0].accounts[0].yearEndValue = '0';
    expect(run(zero)?.form8606ByOwner.primary?.yearEndValue).toBe('0');
    const unknown = fixture(); delete (unknown.iraBasisSources.owners[0].ordinaryFacts as Partial<typeof ordinary>).qcdPresent;
    expect(() => run(unknown)).toThrow();
  });

  it('requires separate methods for advanced or contradictory retirement facts', () => {
    for (const key of Object.keys(ordinary) as (keyof typeof ordinary)[]) {
      const input = fixture(); input.iraBasisSources.owners[0].ordinaryFacts[key] = true; expect(() => run(input)).toThrow();
    }
    for (const extra of [
      { form8606: { yearEndValue: '0' } }, { form8606ByOwner: { primary: { yearEndValue: '0' } } },
      { iraDeductionWorksheet: { primaryContributions: '1', primaryIsActiveParticipant: false } },
      { adjustments: { iraDeduction: '1' } }, { adjustments: { seRetirementContributions: '1' } },
      { form8889: { coverageType: 'self', qualifiedFundingDistribution: '1' } },
    ]) expect(() => run({ ...fixture(), ...extra })).toThrow();
    for (const field of ['rothConversionAmount', 'qualifiedCharitableDistribution'] as const) {
      const input = fixture(); input.form1099R[0][field] = '1'; expect(() => run(input)).toThrow();
    }
    const returned = fixture(); returned.form1099R[0].returnedContributionByDueDate = true; expect(() => run(returned)).toThrow();
  });

  it('preserves input records and keeps private identity out of the public audit', () => {
    const input = fixture(); const before = structuredClone(input); const result = run(input)!;
    expect(input).toEqual(before);
    const audit = JSON.stringify(result.lines);
    for (const secret of ['123-45-6789', '6789', '12-3456789', 'primary-private-account', 'Jane', 'Custodian']) expect(audit).not.toContain(secret);
    expect(result.lines.length).toBeGreaterThan(0);
    expect(calculateIraBasisSources(TaxYearInputSchema.parse(simpleW2Fixture))).toBeUndefined();
  });

  it('preserves confirmed zero basis and exact current and prior source years', () => {
    const input = fixture();
    const zero = { ...input, iraBasisSources: { ...input.iraBasisSources, owners: [
      { ...input.iraBasisSources.owners[0], basisHistory: { method: 'confirmed_zero', sourceReference: 'complete actual zero-basis history',
        allPriorRecordsReviewed: true, basisChangesSinceThatReturn: false } }, input.iraBasisSources.owners[1],
    ] } };
    expect(run(zero)?.form8606ByOwner.primary?.priorYearBasis).toBe('0');
    expect(() => run({ ...zero, iraBasisSources: { ...zero.iraBasisSources, owners: [{ ...zero.iraBasisSources.owners[0], basisHistory: undefined }] } })).toThrow();
    input.taxpayer.taxYear = 2026; input.iraBasisSources.taxYear = 2026;
    input.form1099R.forEach(form => { form.taxYear = 2026; form.trumpAccount = false; form.excessContributionEarnings = '0'; });
    input.iraBasisSources.distributions.forEach(form => { form.taxYear = 2026; });
    input.iraBasisSources.owners.forEach(owner => { owner.basisHistory.taxYear = 2025; owner.accounts.forEach(account => { account.taxYear = 2026; }); });
    expect(run(input)?.form8606ByOwner.primary?.priorYearBasis).toBe('1000');
    expect(input.iraBasisSources.owners[0].basisHistory.taxYear).toBe(2025);
    const duplicate = fixture(); duplicate.form1099R.push({ ...duplicate.form1099R[0] });
    duplicate.iraBasisSources.distributions.push({ ...duplicate.iraBasisSources.distributions[0], sourceId: 'form1099R:2' });
    expect(() => run(duplicate)).toThrow(/account/);
  });

  it('requires actual2026 additional source boxes and a consistent ordinary distribution age', () => {
    const input = fixture();
    input.taxpayer.taxYear = 2026; input.iraBasisSources.taxYear = 2026;
    input.form1099R.forEach(form => { form.taxYear = 2026; form.trumpAccount = false; form.excessContributionEarnings = '0'; });
    input.iraBasisSources.distributions.forEach(form => { form.taxYear = 2026; });
    input.iraBasisSources.owners.forEach(owner => { owner.accounts.forEach(account => { account.taxYear = 2026; }); });
    expect(run(input)?.form8606ByOwner.primary?.priorYearBasis).toBe('1000');
    for (const edit of [
      (value: typeof input) => { delete value.form1099R[0].trumpAccount; },
      (value: typeof input) => { value.form1099R[0].trumpAccount = true; },
      (value: typeof input) => { delete value.form1099R[0].excessContributionEarnings; },
      (value: typeof input) => { value.form1099R[0].excessContributionEarnings = '1'; },
    ]) { const value = structuredClone(input); edit(value); expect(() => run(value)).toThrow(/2026/); }
    expect(TaxYearInputSchema.parse(input).form1099R?.[0]).toMatchObject({ trumpAccount: false, excessContributionEarnings: '0' });
    const younger = fixture();
    younger.taxpayer.primary.dateOfBirth = '1966-07-01'; younger.iraBasisSources.owners[0].identity.dateOfBirth = '1966-07-01';
    expect(() => run(younger)).toThrow(/age/);
    younger.taxpayer.primary.dateOfBirth = '1966-06-30'; younger.iraBasisSources.owners[0].identity.dateOfBirth = '1966-06-30';
    expect(run(younger)?.form8606ByOwner.primary?.priorYearBasis).toBe('1000');
  });
});
