import type { EducationDistributionData, EducationSourceRecord } from '@/lib/guided-education-distributions';
import { confirmCoverdellBankInterest, type EducationOriginalContext } from '@/lib/guided-coverdell-bank-interest';
import type { InterestEntryData } from '@/lib/guided-interview-flow';
import { educationPostDisqualificationInterestInput } from './education-post-disqualification-interest.js';

function flat(record: object): EducationSourceRecord {
  const result: EducationSourceRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'number') result[key] = String(value);
    else if (typeof value === 'string' || typeof value === 'boolean') result[key] = value;
  }
  return result;
}
/** Complete fictional originals, never application defaults. */
export function guidedCoverdellBankInterest(year: 2025 | 2026 = 2025) {
  const canonical = educationPostDisqualificationInterestInput(year);
  const source = canonical.form1099Q?.[0], original = canonical.form1099Int?.[0];
  const facts = source?.postDisqualificationInterestSources;
  if (!source || !original || !facts) throw Error('Missing independently supplied fictional sources.');
  const interest: InterestEntryData = {
    payer: original.payer, payerTin: original.payerTin, accountReference: original.accountReference,
    sourceTaxYear: String(year), accountHolder: 'primary', stateTaxReporting: 'none',
    interestIncome: '100', federalWithheld: '0', earlyWithdrawalPenalty: '0', usSavingsBondInterest: '0',
    foreignTaxPaid: '0', foreignCountry: '', taxExemptInterest: '0', privateActivityBondInterest: '0',
    paDirectObligationInterest: '0', marketDiscount: '0', bondPremium: '0', treasuryBondPremium: '0', taxExemptBondPremium: '0',
  };
  const context: EducationOriginalContext = { interestEntries: [interest], primarySsn: canonical.taxpayer.primary.ssn };
  const data: EducationDistributionData = { taxYear: String(year), sourceFactsConfirmed: true, allDistributionsReconciled: true,
    forms: [{ fields: flat(source), transfer: { kind: 'none' }, bankInterestConversion: {
      sourceReference: facts.sourceReference, custodianConversionDate: facts.custodianConversionDate,
      custodianConversionReference: facts.custodianConversionReference, originalIntIndex: '0',
      allPostJanuary1ActivityIncludedConfirmed: true, cashOnlyAtJanuary1Confirmed: true,
      primaryBeneficiaryOwnsDepositConfirmed: true, noRetainedTrustConfirmed: true, domesticBankDepositConfirmed: true,
      openingCash: '1000', closingCash: '1100', taxableBankInterest: '100', otherIncome: '0', realizedGains: '0',
      realizedLosses: '0', contributions: '0', withdrawals: '0', transfers: '0', fees: '0',
    } }], beneficiaries: [{ id: 'student', studentTaxId: canonical.taxpayer.primary.ssn, outsideK12QualifiedDistributions: '0' }],
    expenses: [], allocations: [], loanBorrowers: [], penaltyExceptions: [], coverdellAccounts: [] };
  const statement = data.forms?.[0]; if (!statement) throw Error('Missing fictional statement.');
  statement.bankInterestConversion = confirmCoverdellBankInterest(statement, context, year, 'single');
  return { data, context, canonical, interest };
}

import { getGuidedSectionRoute } from '@/lib/guided-interview-flow';
import { emptyCreditsData } from '@/lib/guided-interview-flow';
import { startCompleteInterview } from '../guided-interview/complete-facts';
/** Only established household, original statement and original INT prerequisites.
 * The new PA allocation and every conversion answer are deliberately absent. */
export function guidedCoverdellBankInterestState() {
  const fixture = guidedCoverdellBankInterest();
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['investments'], lifeEvents: [], stateCode: null });
  const personal = state.sectionData['personal-info']; if (!personal) throw Error('Missing fictional owner');
  personal.ssn = fixture.canonical.taxpayer.primary.ssn;
  delete fixture.interest.paDirectObligationInterest;
  const statement = fixture.data.forms?.[0]; if (!statement) throw Error('Missing fictional source');
  delete statement.bankInterestConversion;
  state.sectionData['income-investments'] = { interestEntries: [fixture.interest], dividendEntries: [], brokerageEntries: [] };
  state.sectionData.credits = { ...emptyCreditsData, educationDistributions: fixture.data };
  state.currentSectionIndex = getGuidedSectionRoute(state).findIndex(section => section.id === 'income-investments');
  state.completedSections = ['personal-info'];
  return state;
}
