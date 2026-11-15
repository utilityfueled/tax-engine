import { investmentElectionFixture } from './form-2210-investment-election';
import { completeW2Entry, completeDividendSource, startCompleteInterview } from '../guided-interview/complete-facts';
import { emptyPaymentData } from '../../apps/web/src/lib/guided-interview-flow';
import { emptyEstimatedTaxFacts } from '../../apps/web/src/lib/guided-estimated-tax-facts';


function required<T,>(value:T|null|undefined):T { if(value===undefined||value===null)throw Error('Complete actual synthetic fixture required');return value; }
export function guidedInvestmentElectionFixture() {
  const canonical = investmentElectionFixture();
  const worksheet = (source: typeof canonical.form4952) => ({ ...source, sourceTaxYear: String(source.sourceTaxYear), capitalGainElectionMethod: 'explicit' as const });
  const packet = { annualAmtCapitalGains:{sourceTaxYear:'2025',sourceReference:'fictional-annual-amt-gain-original',sourceFactsConfirmed:true,qualifiedDividends:'40000',netCapitalGain:'0',section1250Gain:'0',collectiblesGain:'0'}, ...canonical.form2210.investmentElectionSources, accountHolder: 'primary' as const, sourceTaxYear: '2025', periods: canonical.form2210.investmentElectionSources.periods.map(row => ({ ...row, form4952: { ...row.form4952, sourceTaxYear:String(row.form4952.sourceTaxYear) } })) };
  const facts = { ...structuredClone(emptyEstimatedTaxFacts), ...canonical.form2210, calculationMethod: 'annualized' as const, withholdingMethod:'equal-installments' as const, priorYearTaxStatus:'no-return' as const, sourceTaxYear: '2025', sourceReference: 'fictional-guided-estimated-records', sourceFactsConfirmed: true,
    allPaymentRecordsIncluded: true, earlyReturnExceptionClaimed: false, investmentElectionSources: packet,
    annualizedIncomePeriods: canonical.form2210.annualizedIncomePeriods.map(period => ({ ...period, schedule1AAdjustment: '0' })) };
  const state = startCompleteInterview({ filingStatus: 'single', incomeTypes: ['w2','investments'], lifeEvents: [], stateCode: null });
  Object.assign(required(state.sectionData['personal-info']), { firstName: 'Jane', lastName: 'Doe', ssn: '123-45-6789' });
  state.sectionData['income-w2'] = { entries: [{ ...completeW2Entry, wages:'160000',socialSecurityWages:'160000',medicareWages:'160000' }] };
  state.sectionData['income-investments'] = { interestEntries: [], brokerageEntries: [], dividendEntries: [{ ...completeDividendSource, ordinaryDividends: '40000', qualifiedDividends: '40000' }] };
  state.sectionData.deductions = { method:'itemized',medicalExpenses:'0',stateLocalTaxes:'0',realEstateTaxes:'19000',mortgageInterest:'0',charitableContributions:'0',casualtyLosses:'0',otherItemized:'1000',investmentInterestExpense:'1000', investmentInterestSources: { regular: worksheet(canonical.form4952), amt: worksheet(canonical.form4952) } };
  state.sectionData.payments = { ...structuredClone(emptyPaymentData), estimatedTaxFacts: facts };
  return { state, facts, packet, canonical };
}
