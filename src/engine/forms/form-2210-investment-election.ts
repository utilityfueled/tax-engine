/** Actual ordinary ScheduleAI election sources. Spec: form-2210-investment-election.yaml. */
import Decimal from 'decimal.js';
import type { TaxYearInput, Form4952Input } from '@/models/inputs.js';
import { calculateForm4952, type Form4952Result } from './form-4952.js';

export interface Form2210InvestmentElectionContext {
  periods: { electedQualifiedDividends: Decimal; electedNetCapitalGain: Decimal }[];
}
const SOURCE_AMOUNTS=['investmentInterestExpense','priorYearDisallowed','grossInvestmentIncome','qualifiedDividendsIncluded','netGainFromInvestmentProperty','netCapitalGainFromInvestmentProperty','electedPreferentialIncome','investmentExpenses','electedNetCapitalGain'] as const;
const ENDS=['2025-03-31','2025-05-31','2025-08-31','2025-12-31'];
const fail=():never=>{throw new Error('Form2210 investment-election method requires complete actual ordinary period and annual source reconciliation');};
const value=(raw:string|undefined):Decimal=>{if(raw===undefined||!/^\d+(?:\.\d+)?$/.test(raw))return fail();const n=new Decimal(raw);return n.isFinite()?n:fail();};
const name=(raw:string|undefined)=>raw?.trim().toLocaleLowerCase('en-US');
function original(source:Form4952Input|undefined,year:number):{source:Form4952Input;result:Form4952Result} {
  if(!source||source.sourceTaxYear!==year||source.sourceFactsConfirmed!==true||source.sourceFactsComplete!==true||!source.sourceReference?.trim()||source.childIncomeSources!==undefined)return fail();
  for(const key of SOURCE_AMOUNTS)if(!value(source[key]).isInteger())return fail();
  if(!value(source.priorYearDisallowed).isZero()||!value(source.investmentExpenses).isZero())return fail();
  const result=calculateForm4952(source,year);
  if(!result.sourceFactsVerified||!result.line7.isZero()||!result.line8.eq(result.line1)||!result.line4d.eq(result.line4e)||result.line4a.lt(result.line4b))return fail();
  return {source,result};
}
/** Does not mutate original sources or return their private names/references. */
export function calculateForm2210InvestmentElectionSources(input:TaxYearInput,annual:Form4952Result|undefined,context:{qualifiedDividends:Decimal;netCapitalGain:Decimal;grossInvestmentIncome:Decimal;itemizedDeductions:Decimal|undefined;ordinaryCohort:boolean}):Form2210InvestmentElectionContext|undefined {
  const facts=input.form2210;
  if(facts===undefined||facts.investmentElectionSources===undefined)return undefined;
  const packet=facts.investmentElectionSources;
  const year=input.taxpayer.taxYear;
  const primary=input.taxpayer.primary;
  const firstName=name(primary.firstName),lastName=name(primary.lastName);
  const sourceFirstName=name(packet.taxpayerFirstName),sourceLastName=name(packet.taxpayerLastName);
  // Validate the original complete identifier before comparing its suffix.
  // Stripping arbitrary characters would let partial or malformed facts bind.
  const canonicalSsn=primary.ssn;
  if(!firstName||!lastName||!sourceFirstName||!sourceLastName
    ||!/^(?:\d{9}|\d{3}-\d{2}-\d{4})$/.test(canonicalSsn)
    ||typeof packet.taxpayerSsnLast4!=='string'||!/^\d{4}$/.test(packet.taxpayerSsnLast4))return fail();
  if(year!==2025||input.taxpayer.filingStatus!=='single'||packet.sourceTaxYear!==year||!packet.sourceReference?.trim()||packet.sourceFactsConfirmed!==true||packet.allPeriodsCompleteConfirmed!==true||packet.electionValidConfirmed!==true||packet.otherInvestmentIncomePresent!==false||packet.accountHolder!=='primary'
    ||sourceFirstName!==firstName||sourceLastName!==lastName||packet.taxpayerSsnLast4!==canonicalSsn.replace(/-/g,'').slice(-4)
    ||facts.calculationMethod!=='annualized'||facts.ordinaryPreferentialPeriodsConfirmed!==true||facts.specialRatePeriodsConfirmed===true||!context.ordinaryCohort||context.itemizedDeductions===undefined||!annual||annual.line4g.lte(0)||annual.line8.lte(0)
    ||input.scheduleK1.length!==0||input.scheduleK1Form1041.length!==0||input.form8814.length!==0||packet.periods?.length!==4||facts.annualizedIncomePeriods?.length!==4)return fail();
  const full=original(input.form4952,year);
  if(packet.annualForm4952SourceReference?.trim()!==full.source.sourceReference?.trim()||!full.result.line8.eq(annual.line8)||!full.result.electedNetCapitalGain.eq(annual.electedNetCapitalGain)||!full.result.electedQualifiedDividends.eq(annual.electedQualifiedDividends)
    ||!value(full.source.qualifiedDividendsIncluded).eq(context.qualifiedDividends)||!value(full.source.netCapitalGainFromInvestmentProperty).eq(context.netCapitalGain)||!value(full.source.grossInvestmentIncome).eq(context.grossInvestmentIncome))return fail();
  const references=new Set<string>();
  const periods=packet.periods.map((row,index)=>{
    if(row.periodEnd!==ENDS[index])return fail();
    const period=facts.annualizedIncomePeriods![index];if(!period)return fail();
    const current=original(row.form4952,year),ref=current.source.sourceReference!.trim();
    if(references.has(ref)||ref===full.source.sourceReference!.trim())return fail();references.add(ref);
    const qd=value(period.qualifiedDividends),gain=value(period.netCapitalGain);
    if(!value(current.source.qualifiedDividendsIncluded).eq(qd)||!value(current.source.netCapitalGainFromInvestmentProperty).eq(gain)||current.result.electedQualifiedDividends.gt(qd)||current.result.electedNetCapitalGain.gt(gain)
      ||!current.result.line8.plus(value(row.otherItemizedDeductions)).eq(value(period.itemizedDeductions)))return fail();
    if(index===3){
      for(const key of SOURCE_AMOUNTS)if(!value(current.source[key]).eq(value(full.source[key])))return fail();
      if(!current.result.line8.eq(annual.line8)||!current.result.line8.plus(value(row.otherItemizedDeductions)).eq(context.itemizedDeductions!))return fail();
    }
    return {electedQualifiedDividends:current.result.electedQualifiedDividends,electedNetCapitalGain:current.result.electedNetCapitalGain};
  });
  return {periods};
}
