import { guidedForeignTaxK3Fixture } from './guided-foreign-tax-k3';
import type { ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import type { TaxYearInput } from '@/models/inputs';
import { ScheduleK1Schema } from '@/models/inputs';
import { foreignTaxOrdinaryCreditFixture } from './foreign-tax-ordinary-credit';
/** Explicit fictional originals, never production defaults. */
export function foreignTaxK3OrdinaryFixture(): TaxYearInput {
    const input = foreignTaxOrdinaryCreditFixture();
    // Explicit fictional W2 box2 original: current tax12555 less withholding12000<1000.
    input.w2s[0].federalWithheld = '12000';
    input.form1099Int = [];
    input.form1099Div = [];
    input.scheduleK1 = [ScheduleK1Schema.parse({ taxYear: 2025, entityType: 'partnership', partnershipName: 'Fictional Ordinary LP', partnershipEIN: '12-3456789', accountHolder: 'primary', ordinaryIncome: '0', interestIncome: '20000', ordinaryDividends: '0', qualifiedDividends: '0', foreignSourceIncome: '20000', foreignTaxPaid: '900', foreignTaxCategory: 'passive', beginningBasis: '10000', priorSuspendedLosses: {}, selfEmploymentEarnings: '0', selfEmploymentNetEarningsAfterAdjustments: '0' })];
    const annual = required(input.foreignTaxElection), facts = required(annual.creditWithForm1116);
    annual.sources = [{ ...required(annual.sources)[0], sourceId: 'scheduleK1:0', payerName: 'Fictional Ordinary LP', payerTin: '12-3456789', accountReference: undefined, qualifiedPayeeStatement: 'schedule_k3', payments: undefined, sourceReference: 'Private K3 original and Canada detail' }];
    facts.incomeSources = [{ sourceId: 'scheduleK1:0', payerName: 'Fictional Ordinary LP', payerTin: '12-3456789', owner: 'primary', foreignCountry: 'Canada', reportedIncome: '20000', foreignIncome: '20000', sourceReference: 'Private K3 original and Canada detail', passiveGroup: 'withholding_under_15', qualifiedPartnership: { sourceTaxYear: 2025, calendarYearPartnershipConfirmed: true, usdReportedPaidTaxesConfirmed: true, usdPaidTaxSourceReference: 'Private PartIII section4 original USD paid tax details', entityPaidTaxPayments: [{ date: '2025-09-15', amountUsd: '900' }], originalK1Reference: 'Private original K1', qualifiedK3Reference: 'Private K3 original and Canada detail', beginningBasisSourceReference: 'Private opening basis', foreignDeductions: '0', foreignInterestExpense: '0', otherExpenses: '0', taxReduction: '0', redeterminationAmount: '0', domesticContinuingNonPtpConfirmed: true, portfolioIncomeOnlyConfirmed: true, allOtherK1AmountsZeroConfirmed: true, noOtherBasisChangesConfirmed: true, priorBasisSuspensionsZeroConfirmed: true, priorAtRiskSuspensionsZeroConfirmed: true, priorPassiveSuspensionsZeroConfirmed: true, sourceFactsConfirmed: true } } as NonNullable<typeof facts.incomeSources>[number]];
    facts.amtCarryback = { taxYear: 2024, election: 'form1116_credit', sourceFactsConfirmed: true, sourceReference: 'Private preceding AMT zero-capacity return', allPriorUseIncludedConfirmed: true, limitation: '0', currentTaxes: '0', priorCarryoversUsed: '0' };
    return input;
}
export function guidedOrdinaryK3() {
    const { state, k3 } = guidedForeignTaxK3Fixture(), canonical = foreignTaxK3OrdinaryFixture(), annual = required(canonical.foreignTaxElection);
    const original = { ...k3, calendarYearPartnershipConfirmed: true, usdReportedPaidTaxesConfirmed: true, usdPaidTaxSourceReference: 'Private PartIII section4 original USD paid tax details', entityPaidTaxPayments: [{ date: '2025-09-15', amountUsd: '900' }], partnershipName: 'Fictional Ordinary LP', interestIncome: '20000', ordinaryDividends: '0', qualifiedDividends: '0', foreignSourceIncome: '20000', foreignTaxPaid: '900', beginningBasis: '10000', originalK1Reference: 'Private original K1', qualifiedK3Reference: 'Private K3 original and Canada detail', beginningBasisSourceReference: 'Private opening basis', foreignDeductions: '0', foreignInterestExpense: '0', otherExpenses: '0', taxReduction: '0', redeterminationAmount: '0' };
    required(state.sectionData['income-w2']).entries[0] = { ...required(state.sectionData['income-w2']).entries[0], wages: '80000', federalWithheld: '12000', socialSecurityWages: '80000', socialSecurityWithheld: '4960', medicareWages: '80000', medicareWithheld: '1160' };
    state.sectionData['income-investments'] = { interestEntries: [], dividendEntries: [], brokerageEntries: [] };
    const facts = required(annual.creditWithForm1116);
    required(state.sectionData['other-taxes']).foreignTaxElection = { ...annual, taxYear: '2025', qualifiedK3Statements: [original], creditWithForm1116: { ...facts, sourceTaxYear: '2025', adjustedThroughTaxYear: '2024', amt: { ...facts.amt, firstPost1997CreditClaimTaxYear: '2025' }, amtCarryback: { ...facts.amtCarryback, taxYear: '2024' } } } as unknown as ForeignTaxElectionData;
    return { state, original };
}
/** Test-only actual fixture assertion; missing facts are errors, never defaults. */
export function required<T>(value: T | null | undefined): T { if (value === undefined || value === null)
    throw new Error("Missing explicit test fixture fact"); return value; }
