/** Explicit fictional ordinary account originals. No production-derived expected tax. */
import {ohio2026OrdinaryFixture, rebindOhio2026Ordinary} from './oh-2026-ordinary-return.js';
type Status = 'full_year_resident' | 'part_year_resident' | 'nonresident';
export function ohio2026ActualBalanceFixture(status: Status = 'full_year_resident', withholding = '432', paid = '500') {
  const ohioWages = status === 'full_year_resident' ? '50000' : status === 'part_year_resident' ? '30000' : '10000';
  const p = ohio2026OrdinaryFixture(status, '50000', ohioWages);
  const w2 = p.input.w2s[0];
  if (!w2?.stateLocalSources?.originalW2 || !p.input.ohioPayments) throw new Error('Explicit fictional current originals required');
  w2.stateTaxWithheld = withholding;
  w2.stateLocalSources.stateRows[0].withheld = withholding;
  w2.stateLocalSources.originalW2.stateTaxWithheld = withholding;
  const person = p.input.taxpayer.primary;
  p.input.ohioPayments.currentTiming = {kind:'filed',filedDate:'2027-04-15',asOfDate:'2027-04-15'};
  p.input.ohioPayments.remainingTaxPayment = {status:'actual_payment',sourceReference:'PRIVATE-ACTUAL-2026-BALANCE-RECEIPT',sourceFactsConfirmed:true,date:'2027-04-15',amountAppliedToTax:paid,accountHolder:'primary',original:{accountName:person.firstName+' '+person.lastName,accountSsn:person.ssn,taxYear:2026,returnType:'it1040',kind:'balance',date:'2027-04-15',amount:paid,confirmationNumber:'PRIVATE-OH-2026-PAID-ONCE'}};
  rebindOhio2026Ordinary(p);
  return p;
}
