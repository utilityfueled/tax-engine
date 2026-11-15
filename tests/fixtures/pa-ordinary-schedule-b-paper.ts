/** Literal fictional originals for the finite single-primary resident paper cohort. */
import {calculateFederalTax} from '@/engine/federal.js';
import {calculatePAOrdinaryReturn} from '@/engine/state/pa-ordinary-return.js';
import {paOrdinaryInvestmentFixture,rebindInvestmentFixture} from './pa-ordinary-investment-sources.js';
export function paOrdinaryScheduleBPaperFixture(kind:'ordinary'|'cents'|'no-adjustment'='ordinary',status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryInvestmentFixture(status);
 if(kind!=='ordinary'){
  const row=f.input.form1099Div[0],original=f.residency.dividends[0];
  row.ordinaryDividends=kind==='cents'?'2000.49':'2000';row.totalCapitalGainDistributions=kind==='cents'?'500.50':'0';
  original.original=structuredClone(row);original.credits=[{sourceReference:'Fictional actual first fund credit',creditedOn:'2025-03-31',ordinaryDividends:kind==='cents'?'1000.49':'1000',capitalGainDistributions:kind==='cents'?'200.50':'0'},{sourceReference:'Fictional actual second fund credit',creditedOn:'2025-09-30',ordinaryDividends:'1000',capitalGainDistributions:kind==='cents'?'300':'0'}];
  if(kind==='no-adjustment'&&status==='resident')f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'61',sourceReference:'Fictional literal1600tax less1539withholding'};
  rebindInvestmentFixture(f);
 }
 Object.assign(f.input,{paOrdinaryReturnFacts:f.facts,paOrdinaryReturnCompletionSources:f.sources});
 const ordinary=calculatePAOrdinaryReturn(f.input,f.facts,f.sources),result=calculateFederalTax(f.input);result.stateReturns={pennsylvania:ordinary};return {...f,ordinary,result};
}
