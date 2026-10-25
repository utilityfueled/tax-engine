import type { ForeignTaxElectionData } from '@/lib/guided-foreign-tax-election';
import { foreignTaxOrdinaryCreditFixture } from './foreign-tax-ordinary-credit.js';

export function guidedOrdinaryCreditFixture() {
  const input = foreignTaxOrdinaryCreditFixture(), annual = input.foreignTaxElection, source = annual?.creditWithForm1116;
  if (!annual || !source || !source.amt) throw new Error('Missing explicit synthetic ordinary sources');
  const facts: ForeignTaxElectionData = { ...annual, taxYear: '2025', creditWithForm1116: {
    ...source, sourceTaxYear: '2025', adjustedThroughTaxYear: '2024', carryovers: [], amtCarryovers: [],
    amt: { ...source.amt, firstPost1997CreditClaimTaxYear: '2025' },
    amtCarryback: { taxYear: '2024', election: 'form1116_credit', sourceFactsConfirmed: true, allPriorUseIncludedConfirmed: true,
      sourceReference: 'Actual prior zero-capacity AMT return', limitation: '0', currentTaxes: '0', priorCarryoversUsed: '0' },
  } };
  const investment = { interestEntries: [{ ...input.form1099Int[0], accountHolder: 'primary' as const,
    stateTaxReporting: 'none' as const, state: '', stateWithheld: '0', privateActivityBondInterest: '0',
    marketDiscount: '0', bondPremium: '0', treasuryBondPremium: '0', taxExemptBondPremium: '0' }], dividendEntries: [], brokerageEntries: [] };
  return { facts, investment };
}
