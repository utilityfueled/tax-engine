import { Form1099IntSchema, TaxYearInputSchema } from '@/models/inputs.js';
import { simpleW2Fixture } from './simple-w2.js';
import { disqualifiedEducationSource, disqualifiedEducationSummary } from './education-disqualification-source.js';

/** Independently supplied fictional source records, never production defaults. */
export function educationPostDisqualificationInterestInput(year: 2025 | 2026 = 2025) {
  const original = Form1099IntSchema.parse({ taxYear: year, payer: 'Fictional domestic bank', payerTin: '12-3456789',
    accountReference: 'Fictional converted taxable cash account', accountHolder: 'primary', interestIncome: '100',
    earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0', federalWithheld: '0', foreignTaxPaid: '0',
    taxExemptInterest: '0', privateActivityBondInterest: '0', paDirectObligationInterest: '0', stateWithheld: '0' });
  const postDisqualificationInterestSources = {
    sourceTaxYear: year, sourceReference: 'Fictional complete January1 conversion and full-year bank ledger', sourceFactsConfirmed: true,
    sourceId: 'terminated-esa', accountId: 'esa-account', beneficiaryId: 'student',
    allPostJanuary1ActivityIncludedConfirmed: true, cashOnlyAtJanuary1Confirmed: true,
    custodianConversionDate: `${year}-01-01`, custodianConversionReference: 'Fictional actual January1 taxable deposit conversion',
    primaryBeneficiaryOwnsDepositConfirmed: true, noRetainedTrustConfirmed: true, domesticBankDepositConfirmed: true,
    openingCash: '1000', closingCash: '1100', taxableBankInterest: '100',
    otherIncome: '0', realizedGains: '0', realizedLosses: '0', contributions: '0', withdrawals: '0', transfers: '0', fees: '0',
    originalIntIndex: 0, originalInterestSnapshot: { ...original },
  };
  const form = disqualifiedEducationSource({ taxYear: year, prohibitedTransactionDate: `${year}-01-01`,
    prohibitedTransactionNoPostDisqualificationActivityConfirmed: false,
    prohibitedTransactionPostDisqualificationSourceReference: 'Fictional full-year source confirms actual ordinary bank interest',
    postDisqualificationInterestSources });
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year }, w2s: [],
    form1099Int: [original], form1099Q: [form], qualifiedEducationExpenses: disqualifiedEducationSummary({ taxYear: year,
      beneficiaries: [{ id: 'student', studentTaxId: simpleW2Fixture.taxpayer.primary.ssn, outsideK12QualifiedDistributions: '0' }] }) });
}
