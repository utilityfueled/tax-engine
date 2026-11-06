/** Explicit fictional IRS histories for the Jordan/Taylor browser source fixtures. */
export function fictionalEicHistory2025(joint: boolean) {
  return {
    sourceTaxYear: '2025', sourceReference: 'synthetic-private-complete-eic-history', sourceFactsConfirmed: true,
    claimStatus: 'preparing', reviewedThroughDate: '2026-03-01', preparationAsOfDate: '2026-03-01',
    filers: [
      { owner: 'primary', originalTaxpayer: { firstName: 'Jordan', lastName: 'Example', ssn: '111-22-3333' },
        sourceReference: 'synthetic-private-primary-history', sourceFactsConfirmed: true, allHistoryIncluded: true, denials: [], laterAllowances: [] },
      ...(joint ? [{ owner: 'spouse', originalTaxpayer: { firstName: 'Taylor', lastName: 'Example', ssn: '222-33-4444' },
        sourceReference: 'synthetic-private-spouse-history', sourceFactsConfirmed: true, allHistoryIncluded: true, denials: [], laterAllowances: [] }] : []),
    ],
  };
}
