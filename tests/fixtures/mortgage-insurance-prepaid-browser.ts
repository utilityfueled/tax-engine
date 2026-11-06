import { guidedMortgagePrepaidFixture } from './guided-mortgage-insurance-prepaid';
import { startCompleteInterview } from '../guided-interview/complete-facts';

/** Explicit fictional records. No target originals or calculations in setup. */
export const mortgagePrepaidBrowserAnswers = [
  ['Do current or prepaid mortgage insurance premiums need evaluation for this year?', 'true'],
  ['Mortgage insurance contract issue date', '2026-05-15'],
  ['Mortgage insurance allocation tax year', '2026'],
  ['Is the insurance provided by VA, FHA, RHS or qualifying private mortgage insurance?', 'true'],
  ['Is the insurance for qualifying acquisition debt?', 'true'],
  ['Is the insured debt on a qualified residence?', 'true'],
  ['Actual mortgage insurance allocation method', 'current-original-prepaid'],
  ['Original premium policy and payment record reference', 'fictional-pmi-browser-original-policy-paid-receipt'],
  ['Actual original mortgage insurance provider', 'private'],
  ['Actual original prepaid premium paid', '9240'],
  ['Actual original premium payment method', 'cash'],
  ['Actual original premium payment date', '2026-05-15'],
  ['Actual date this insurance was obtained', '2026-05-15'],
  ['Actual stated mortgage term in whole months', '180'],
  ['Do these original records include every prepaid premium for this policy?', 'true'],
  ['Do actual records establish qualifying private mortgage insurance under the Homeowners Protection Act?', 'true'],
  ['Do actual premium records establish allocation to periods beyond this year end?', 'true'],
  ['Was this original mortgage still outstanding at year end?', 'true'],
  ['Was this mortgage satisfied at any time during the year?', 'false'],
  ['Was this mortgage refinanced?', 'false'],
  ['Were any of these premiums refunded?', 'false'],
  ['Was this insurance cancelled?', 'false'],
  ['Did another borrower pay any of this original premium?', 'false'],
  ['Were there any other premium payments or prior premium histories for this policy?', 'false'],
] as const;
export const mortgagePrepaidBrowserEditedReference = 'fictional-pmi-browser-same-cash-new-original-receipt';
export const mortgagePrepaidBrowserPrivateMarkers = ['fictional-pmi-browser-', '111-22-3333', '111223333', '9240', '9,240', 'prepaidPremiumPaid'] as const;
export function mortgagePrepaidBrowserFixture() {
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: [], lifeEvents: ['bought-home'], stateCode: null });
  // The existing top-level year selector, not a test-only unlock, selects2026.
  state.taxYear = 2025;
  const data = guidedMortgagePrepaidFixture();
  const entry = data.mortgageEntries?.[0];
  if (!entry || !data.mortgageWorksheet) throw new Error('Missing explicit fictional ordinary mortgage source');
  delete entry.insurancePrepaid;
  delete entry.insuranceAllocationMethod;
  delete entry.insuranceContractIssueDate;
  delete entry.insuranceAllocationTaxYear;
  delete entry.insuranceQualifiedProvider;
  delete entry.insuranceAcquisitionDebt;
  delete entry.insuranceQualifiedResidence;
  delete entry.insurancePremiumsAllocableToYear;
  entry.hasMortgageInsuranceAllocation = null;
  entry.accountReference = 'fictional-pmi-browser-ordinary-loan';
  entry.balanceSourceReference = 'fictional-pmi-browser-ordinary-annual-balance';
  data.mortgageWorksheet.sourceReference = 'fictional-pmi-browser-ordinary-home-debt-records';
  state.sectionData.deductions = data;
  return state;
}
