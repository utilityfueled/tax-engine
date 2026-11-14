import type { DigitalAssetEntryData } from '../../apps/web/src/lib/guided-digital-asset-facts';
import { actualGuidedDigitalAsset } from './guided-digital-asset-sources';

/** Independently supplied fictional original taxable corporate full cash sale. */
export function guidedMarketDiscountOriginal(): DigitalAssetEntryData {
  const entry = actualGuidedDigitalAsset();
  Object.assign(entry, { sourceId: 'Fictional debt statement A', sourceReference: 'Fictional original broker debt statement', accountReference: 'Debt account A' });
  Object.assign(entry.transactions![0], {
    sourceId: 'Fictional full sale A', digitalAssetCode: 'SYNTHETIC-DEBT', digitalAssetName: 'Fictional taxable corporate tokenized debt',
    dateAcquired: '2024-01-15', reportedDateAcquired: '2024-01-15', reportedDateAcquiredBlank: false,
    dateSold: '2025-06-01', proceeds: '1200.03', costBasis: '1000.01', reportedCostBasis: '1000.01', reportedCostBasisBlank: false,
    basisReportedToIRS: true, basisSource: 'broker_statement', basisSourceReference: 'Fictional original acquisition statement',
    holdingPeriod: 'long', noncoveredSecurity: true, customerProvidedAcquisitionInformation: false,
    marketDiscount: '50.005', ordinaryIncome: true, securityIdentifier: 'SYNTH00001',
    marketDiscountFacts: {
      sourceReference: 'Fictional original debt and election ledger', originalDispositionReference: 'Fictional full sale confirmation',
      issuerTaxTreatment: 'taxable_corporate', tokenizedDebtConfirmed: true, heldForInvestmentConfirmed: true,
      issueDate: '2020-01-01', maturityDate: '2030-01-01', usDollarDenominated: true, fullDisposition: true,
      ordinaryIncomeCause: 'market_discount_only', currentInclusionElectionApplies: false, allInterestAsOidElectionApplies: false,
      previouslyIncludedMarketDiscount: '0', priorPartialPrincipalPayments: '0', originalIssueDiscount: '0', acquisitionPremium: '0', bondPremium: '0',
      strippedDebt: false, contingentPaymentDebt: false, borrowedToAcquireOrCarry: false, installmentObligation: false, transferredBasis: false, reorganizationDebt: false,
      interestReconciliationReference: 'Fictional complete original interest record reconciliation', allOriginalInterestStatementsIncludedConfirmed: true,
      sameDiscountIncludedElsewhere: false, noOriginalIntStatementsConfirmed: true, noOriginalOidStatementsConfirmed: true,
    },
  });
  return entry;
}

import { startCompleteInterview } from '../guided-interview/complete-facts';
/** Actual ordinary sources are complete; no debt/election/history facts are seeded. */
export function guidedMarketDiscountState() {
  const state = startCompleteInterview({ filingStatus:'single',incomeTypes:['w2-wages','investments'],lifeEvents:[],stateCode:null });
  const original = guidedMarketDiscountOriginal();
  delete original.transactions![0].marketDiscountFacts;
  delete original.transactions![0].securityIdentifier;
  state.sectionData['income-investments'] = { interestEntries:[], dividendEntries:[], brokerageEntries:[], digitalAssetEntries:[original] };
  state.currentSectionIndex = 2;
  state.completedSections = ['personal-info','income-w2'];
  return state;
}
