// Spec: spec/federal/form-2210-investment-election.yaml.
import { expect, it, vi } from 'vitest';
vi.mock('server-only',()=>({}));
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '../../../apps/web/src/lib/ai-tax-context';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '@/engine/federal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateForm2210ScheduleAi } from '@/engine/forms/form-2210-schedule-ai.js';
import { fillForm2210 } from '@/pdf/mappings/2025/fill-form-2210.js';
import { createWorkspaceRecord } from '../../../apps/web/src/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '../../../apps/web/src/lib/hosted-privacy';
import { investmentElectionFixture } from '../../fixtures/form-2210-investment-election.js';

const calculate=(raw:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(raw));
const evaluate=()=>calculate(investmentElectionFixture());
it('excludes the actual election before annualization and line rounding',()=>{
  const result=evaluate();
  expect(result.taxableIncome.toFixed()).toBe('180000');
  expect(result.totalTaxBeforeCredits.toFixed()).toBe('32537');
  const lines=result.form2210!.lines;
  expect(lines.find(row=>row.form==='Form 2210 Schedule AI'&&row.line==='14b')?.value.toFixed()).toBe('40655');
  expect(lines.find(row=>row.line==='14-eligible-qualified-dividends-b')?.value.toFixed()).toBe('2402.4');
  expect(lines.find(row=>row.line==='14d')?.value.toFixed()).toBe('32537');
});
it('binds actual period originals and independent annual components',()=>{
  const valid=investmentElectionFixture(),before=JSON.stringify(valid);calculate(valid);expect(JSON.stringify(valid)).toBe(before);
  const changes=[
    (x: ReturnType<typeof investmentElectionFixture>)=>{Reflect.deleteProperty(x.form2210,'investmentElectionSources');},
    (x: ReturnType<typeof investmentElectionFixture>)=>{Reflect.deleteProperty(x.form2210.investmentElectionSources.periods[1]!.form4952,'investmentInterestExpense');},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.sourceTaxYear=2024;},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].periodEnd='2025-06-30';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.sourceFactsConfirmed=false;},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.sourceReference=' ';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].otherItemizedDeductions='8334';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[3].form4952.investmentInterestExpense='999';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[3].form4952.electedPreferentialIncome='999';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.electedPreferentialIncome='1003';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.electedPreferentialIncome='-1';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.electedPreferentialIncome='1.49';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.priorYearDisallowed='1';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.investmentInterestExpense='1001';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.periods[1].form4952.investmentExpenses='1';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.annualForm4952SourceReference='another';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.taxpayerSsnLast4='6788';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.electionValidConfirmed=false;},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form4952.sourceFactsConfirmed=false;},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form4952.grossInvestmentIncome='40001';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.annualizedIncomePeriods[3].qualifiedDividends='39999';},
  ];
  for(const change of changes){const x=investmentElectionFixture();change(x);expect(()=>calculate(x)).toThrow();}
});
it('matches independent ordinary preferential worksheet boundary arithmetic',()=>{
  // Applicable ordinary worksheet has zero ordinary base: only the published
  // 48350 zero-rate and533400 fifteen-rate thresholds contribute to these literals.
  const pairs=[['0','0'],['48350','0'],['48360','2'],['533400','72758'],['533410','72760']];
  for(const [taxable,tax] of pairs){
    const raw=TaxYearInputSchema.parse(investmentElectionFixture());
    const rows=raw.form2210!.annualizedIncomePeriods!.map(row=>({...row,adjustedGrossIncome:new Decimal(taxable!).plus('15750').toFixed(),itemizedDeductions:'0',qualifiedDividends:taxable!,netCapitalGain:'0'}));
    // Column(d) tests exact printed worksheet tax; preceding actual periods can
    // differ and are not used as their own oracle.
    const result=calculateForm2210ScheduleAi({taxYear:2025,filingStatus:'single',requiredAnnualPayment:new Decimal(100000),taxAfterRefundableCredits:new Decimal(tax!),returnContext:{standardDeduction:new Decimal('15750'),agi:new Decimal(taxable!).plus('15750'),taxableIncome:new Decimal(taxable!),preferentialIncome:true,selfEmployedOwners:0,specialTaxMethod:false,ordinaryPreferentialIncome:{qualifiedDividends:new Decimal(taxable!),netCapitalGain:new Decimal(0)}},facts:{ordinaryPreferentialPeriodsConfirmed:true,annualizedIncomePeriods:rows}});
    expect(result.lines.find(row=>row.line==='14d')?.value.toFixed()).toBe(tax);
  }
});
it('preserves closed methods and private source boundaries',()=>{
  const changes=[
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.calculationMethod='regular';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.filingStatus='head_of_household';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form1099Div[0].collectiblesGain='1';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form1099Div[0].section1250Gain='1';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.otherInvestmentIncomePresent=true;},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.ordinaryPreferentialPeriodsConfirmed=false;},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.taxYear=2026;},
  ];
  for(const change of changes){const x=investmentElectionFixture();change(x);expect(()=>calculate(x)).toThrow();}
  const result=evaluate();expect(JSON.stringify(result.form2210)).not.toContain('fictional-period');
});

it('independently reconciles both actual election allocations without optimizing',()=>{
  const x=investmentElectionFixture();
  x.w2s[0]!.wages='150000';x.w2s[0]!.socialSecurityWages='150000';x.w2s[0]!.medicareWages='150000';
  x.form1099Div[0]!.totalCapitalGainDistributions='10000';
  const gains=['1000','2500','6000','10000'],electedGain=['0','0','200','500'];
  x.form4952.netGainFromInvestmentProperty='10000';x.form4952.netCapitalGainFromInvestmentProperty='10000';x.form4952.electedNetCapitalGain='500';
  x.form2210.investmentElectionSources.periods.forEach((row,i)=>{
    row.form4952.netGainFromInvestmentProperty=gains[i]!;row.form4952.netCapitalGainFromInvestmentProperty=gains[i]!;row.form4952.electedNetCapitalGain=electedGain[i]!;
    x.form2210.annualizedIncomePeriods[i]!.netCapitalGain=gains[i]!;
  });
  const result=calculate(x);expect(result.totalTaxBeforeCredits.toFixed()).toBe('31637');
  expect(result.form2210!.lines.find(row=>row.line==='14d')?.value.toFixed()).toBe('31637');
  const swapped=structuredClone(x);swapped.form2210.investmentElectionSources.periods[3]!.form4952.electedNetCapitalGain='501';
  expect(()=>calculate(swapped)).toThrow();
});
it('retains ordinary tax when the entire original preferential amount is elected',()=>{
  const x=investmentElectionFixture();
  // Actual no-foreign/no-special original QD are1000; the entire election is1000.
  x.w2s[0]!.wages='199000';x.w2s[0]!.socialSecurityWages='176100';x.w2s[0]!.medicareWages='199000';
  x.form1099Div[0]!.ordinaryDividends='1000';x.form1099Div[0]!.qualifiedDividends='1000';
  x.form4952.grossInvestmentIncome='1000';x.form4952.qualifiedDividendsIncluded='1000';
  const selected=['0','1','500','1000'];
  x.form2210.investmentElectionSources.periods.forEach((row,i)=>{
    row.form4952.grossInvestmentIncome=selected[i]!;row.form4952.qualifiedDividendsIncluded=selected[i]!;
    x.form2210.annualizedIncomePeriods[i]!.qualifiedDividends=selected[i]!;
  });
  const result=calculate(x);
  // 2025single ordinary180000:17651+76650*.24=36047.
  expect(result.totalTaxBeforeCredits.toFixed()).toBe('36047');
  expect(result.form2210!.lines.find(row=>row.line==='14d')?.value.toFixed()).toBe('36047');
  expect(result.form2210!.lines.find(row=>row.line==='14-eligible-qualified-dividends-d')?.value.toFixed()).toBe('0');
});

it('rejects every missing actual worksheet amount and top-level original fact',()=>{
  const keys=['investmentInterestExpense','priorYearDisallowed','grossInvestmentIncome','qualifiedDividendsIncluded','netGainFromInvestmentProperty','netCapitalGainFromInvestmentProperty','electedPreferentialIncome','electedNetCapitalGain','investmentExpenses'];
  for(const index of [0,1,2,3])for(const key of keys){const x=investmentElectionFixture();Reflect.deleteProperty(x.form2210.investmentElectionSources.periods[index]!.form4952,key);expect(()=>calculate(x),`period${index} missing${key}`).toThrow();}
  for(const key of ['sourceTaxYear','sourceReference','sourceFactsConfirmed','allPeriodsCompleteConfirmed','electionValidConfirmed','otherInvestmentIncomePresent','accountHolder','taxpayerFirstName','taxpayerLastName','taxpayerSsnLast4','annualForm4952SourceReference','periods']){const x=investmentElectionFixture();Reflect.deleteProperty(x.form2210.investmentElectionSources,key);expect(()=>calculate(x),`packet missing${key}`).toThrow();}
  const duplicate=investmentElectionFixture();duplicate.form2210.investmentElectionSources.periods[1]!.form4952.sourceReference=duplicate.form2210.investmentElectionSources.periods[0]!.form4952.sourceReference;expect(()=>calculate(duplicate)).toThrow();
  const noPositive=investmentElectionFixture();noPositive.form4952.electedPreferentialIncome='0';expect(()=>calculate(noPositive)).toThrow();
});
it('computes a genuine verified AI audit without forwarding new original identities',()=>{
  const x=investmentElectionFixture(),scope={ownerScope:'synthetic-owner',workspaceId:'synthetic-workspace',workspaceRevision:'synthetic-revision'};
  const audit=calculateVerifiedAiAudit(scope,x),context=resolveServerAiTaxContext({...scope,taxYear:2025,audit});
  expect(context.status).toBe('available');
  expect(audit.entries.find(row=>row.line==='15')?.value).toBe('180000');
  const serialized=JSON.stringify(context);
  for(const privateValue of ['Jane','Doe','6789','fictional-period','fictional-annual4952','fictional-period4952'])expect(serialized).not.toContain(privateValue);
});

it('recomputes the actual physical review and strips all new hosted original metadata',async()=>{
  const input=TaxYearInputSchema.parse(investmentElectionFixture()),result=calculateFederalTax(input);
  const doc=await fillForm2210(input,result,'forms/blank/2025/f2210.pdf');
  expect(doc.getForm().getTextField('topmostSubform[0].Page3[0].Part1Table[0].Line14[0].f3_54[0]').getText()).toBe('40655');
  const stale=structuredClone(input);stale.form2210!.investmentElectionSources!.periods![1]!.form4952!.sourceFactsConfirmed=false;
  await expect(fillForm2210(stale,result,'/nonexistent-template-must-not-open.pdf')).rejects.toThrow(/original|source/);
  const workspace=createWorkspaceRecord('synthetic-investment-workspace',{now:'2026-11-14T23:00:00.000Z'});
  Object.assign(workspace,{confirmedTaxInput:input,investmentElectionSources:input.form2210!.investmentElectionSources});
  const before=JSON.stringify(workspace),shell=JSON.stringify(sanitizeWorkspaceForHostedStorage(workspace));
  for(const value of ['investmentElectionSources','fictional-period','fictional-annual4952','Jane','Doe','6789'])expect(shell).not.toContain(value);
  expect(JSON.stringify(workspace)).toBe(before);
});

it('requires actual complete canonical and original owner identity',()=>{
  const changes=[
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.firstName='';x.form2210.investmentElectionSources.taxpayerFirstName='';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.lastName='  ';x.form2210.investmentElectionSources.taxpayerLastName='  ';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.ssn='';x.form2210.investmentElectionSources.taxpayerSsnLast4='';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.ssn='6789';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.ssn='1234567896789';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.ssn='abc123456789';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.ssn='123 45 6789';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.taxpayer.primary.ssn='12-345-6789';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.taxpayerSsnLast4=' 6789';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.taxpayerSsnLast4='6789 ';},
    (x: ReturnType<typeof investmentElectionFixture>)=>{x.form2210.investmentElectionSources.taxpayerFirstName='Other';},
  ];
  for(const [i,change] of changes.entries()){const x=investmentElectionFixture();change(x);expect(()=>calculate(x),`invalid original identity${i}`).toThrow();}
  for(const ssn of ['123456789','123-45-6789']){
    const x=investmentElectionFixture();x.taxpayer.primary.ssn=ssn;
    x.form2210.investmentElectionSources.taxpayerFirstName=' '+x.taxpayer.primary.firstName.toUpperCase()+' ';
    x.form2210.investmentElectionSources.taxpayerLastName=' '+x.taxpayer.primary.lastName.toUpperCase()+' ';
    const before=JSON.stringify(x);expect(calculate(x).totalTaxBeforeCredits.toFixed()).toBe('32537');expect(JSON.stringify(x)).toBe(before);
  }
});

it('retains separate numeric original gross and actual election audit entries',()=>{
  const x=investmentElectionFixture(),result=calculate(x),lines=result.form2210!.lines;
  for(const [index,column] of ['a','b','c','d'].entries()){
    const period=x.form2210.annualizedIncomePeriods[index]!,original=x.form2210.investmentElectionSources.periods[index]!.form4952;
    for(const [id,value] of [['source-qualified-dividends',period.qualifiedDividends],['source-net-capital-gain',period.netCapitalGain],['elected-qualified-dividends',original.electedPreferentialIncome],['elected-net-capital-gain',original.electedNetCapitalGain]]){
      expect(lines.find(row=>row.line===`14-${id}-${column}`)?.value.toFixed()).toBe(value);
    }
    expect(lines.find(row=>row.line===`14-qualified-dividends-${column}`)).toBeDefined();
    expect(lines.find(row=>row.line===`14-eligible-qualified-dividends-${column}`)).toBeDefined();
  }
  expect(JSON.stringify(lines)).not.toContain('fictional-');expect(JSON.stringify(lines)).not.toContain('6789');
  // An actual positive gain election must have its own amount, not total election.
  x.w2s[0]!.wages='150000';x.w2s[0]!.socialSecurityWages='150000';x.w2s[0]!.medicareWages='150000';
  x.form1099Div[0]!.totalCapitalGainDistributions='10000';
  x.form4952.netGainFromInvestmentProperty='10000';x.form4952.netCapitalGainFromInvestmentProperty='10000';x.form4952.electedNetCapitalGain='500';
  const gains=['1000','2500','6000','10000'],elected=['0','0','200','500'];
  x.form2210.investmentElectionSources.periods.forEach((row,i)=>{row.form4952.netGainFromInvestmentProperty=gains[i]!;row.form4952.netCapitalGainFromInvestmentProperty=gains[i]!;row.form4952.electedNetCapitalGain=elected[i]!;x.form2210.annualizedIncomePeriods[i]!.netCapitalGain=gains[i]!;});
  const mixed=calculate(x).form2210!.lines;
  expect(mixed.find(row=>row.line==='14-source-net-capital-gain-d')?.value.toFixed()).toBe('10000');
  expect(mixed.find(row=>row.line==='14-elected-net-capital-gain-d')?.value.toFixed()).toBe('500');
  expect(mixed.find(row=>row.line==='14-elected-qualified-dividends-d')?.value.toFixed()).toBe('500');
});
