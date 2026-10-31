import type { TaxYearInput } from '@/models/inputs.js';

type Facts = NonNullable<TaxYearInput['qofDispositionFacts']>;
type Investment = NonNullable<Facts['investments']>[number];

/** Fictional complete original QOF record. Facts are never production defaults. */
export function qofInvestment(patch: Partial<Record<keyof Investment, unknown>>): Investment {
  return { sourceId: 'qof-1', sourceReference: 'Fictional QOF subscription and annual statement records', sourceFactsConfirmed: true,
    qofEin: '98-7654321', description: 'Fictional 25% interest', investmentDate: '2021-06-30', interestType: 'corporation', gainCharacter: 'long_term',
    originalDeferredGain: '100000', remainingDeferredGain: '100000', event: 'december_31_2026', eventDate: '2026-12-31', entireInvestment: true,
    fairMarketValue: '120000', ...patch } as Investment;
}
export function qofFacts(taxYear: number, investments: Investment[], disposed = investments.some(row => row.event === 'sale_or_exchange')): Facts {
  return { sourceTaxYear: taxYear, sourceReference: 'Fictional complete investment records', sourceFactsConfirmed: true, allInvestmentsReviewed: true,
    disposedOfQofInvestment: disposed, ...(taxYear === 2026 ? { deferredGainHeldAtYearEnd: investments.some(row => row.event === 'december_31_2026') } : {}), investments };
}
