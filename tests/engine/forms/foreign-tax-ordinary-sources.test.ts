// Spec: spec/federal/foreign-tax-ordinary-sources.yaml.
import { expect,it } from 'vitest';
import { ForeignTaxElectionSchema,TaxYearInputSchema } from '@/models/inputs.js';
import { resolveForeignTaxOrdinarySources } from '@/engine/forms/foreign-tax-ordinary-sources.js';
import { resolveForeignTaxDirectSources } from '@/engine/forms/foreign-tax-direct-sources.js';
import { foreignTaxOrdinaryCreditFixture } from '../../fixtures/foreign-tax-ordinary-credit.js';
import { foreignTaxDirectCreditFixture } from '../../fixtures/foreign-tax-direct-credit.js';
function records(input:ReturnType<typeof foreignTaxOrdinaryCreditFixture>){
  const annual=input.foreignTaxElection,facts=annual?.creditWithForm1116;
  if(!annual||!facts||!facts.incomeSources?.[0]||!annual.sources?.[0]||!facts.amt)throw new Error('Missing actual synthetic sources');
  return{annual,facts,income:facts.incomeSources[0],tax:annual.sources[0],amt:facts.amt};
}
it('preserves missing source facts and rejects supplied current tax overrides',()=>{
  const result=ForeignTaxElectionSchema.parse({election:'credit',creditWithForm1116:{}});
  expect(result.creditWithForm1116).toEqual({});
  expect(()=>resolveForeignTaxOrdinarySources(TaxYearInputSchema.parse({...foreignTaxOrdinaryCreditFixture(),foreignTaxElection:result}))).toThrow();
  expect(()=>ForeignTaxElectionSchema.parse({creditWithForm1116:{taxBeforeCredits:'1'}})).toThrow();
  const known=ForeignTaxElectionSchema.parse({creditWithForm1116:{sourceFactsConfirmed:false,carryovers:[],amtCarryovers:[]}});
  expect(known.creditWithForm1116).toEqual({sourceFactsConfirmed:false,carryovers:[],amtCarryovers:[]});
});
it('binds actual foreign portions without applying the direct election threshold',()=>{
  for(const year of[2025,2026]){
    const input=foreignTaxOrdinaryCreditFixture(year),before=JSON.stringify(input);
    const actual=resolveForeignTaxOrdinarySources(input);
    expect(actual.currentTaxExact.toFixed()).toBe('900');expect(actual.countries).toHaveLength(1);
    expect(actual.countries[0].gross.toFixed()).toBe('10000');expect(actual.countries[0].tax.toFixed()).toBe('900');
    expect(actual.passiveGroup).toBe('withholding_under_15');expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(actual.lines)).not.toMatch(/Private|Synthetic investment bank|112233445/);
    const direct={...input,foreignTaxElection:{...input.foreignTaxElection,creditWithForm1116:undefined,creditWithoutForm1116:records(input).facts}};
    expect(()=>resolveForeignTaxDirectSources(direct)).toThrow(/threshold/);
  }
});
it('rejects stale incomplete contradictory or unsupported source records',()=>{
  const edits:Array<(i:ReturnType<typeof foreignTaxOrdinaryCreditFixture>)=>void>=[
    i=>{records(i).facts.sourceTaxYear=2024;},i=>{records(i).facts.allForeignIncomeSourcesIncludedConfirmed=false;},
    i=>{records(i).facts.noForeignOrDomesticLossAccountsConfirmed=undefined;},i=>{records(i).facts.noCfcOrQbuIncomeConfirmed=false;},
    i=>{records(i).facts.incomeSources=[];},i=>{records(i).income.owner='spouse';},i=>{records(i).income.accountReference='Replaced account';},
    i=>{records(i).income.payerTin='998887777';},i=>{records(i).income.foreignCountry='France';},
    i=>{records(i).income.reportedIncome='20000.01';},i=>{records(i).income.foreignIncome='20000.01';},
    i=>{records(i).income.foreignIncome=undefined;},i=>{records(i).tax.creditEligibility=undefined;},
    i=>{records(i).amt.sourceFactsConfirmed=false;},i=>{records(i).facts.amt=undefined;},
  ];
  for(const edit of edits){const input=foreignTaxOrdinaryCreditFixture();edit(input);expect(()=>resolveForeignTaxOrdinarySources(input)).toThrow();}
});
it('keeps actual passive groups and source identities distinct',()=>{
  const input=foreignTaxOrdinaryCreditFixture(),{facts,income}=records(input);
  facts.incomeSources?.push({...income});expect(()=>resolveForeignTaxOrdinarySources(input)).toThrow(/duplicate/);
  facts.incomeSources?.pop();income.passiveGroup=undefined;expect(()=>resolveForeignTaxOrdinarySources(input)).toThrow(/group/);
  income.passiveGroup='no_foreign_tax';expect(()=>resolveForeignTaxOrdinarySources(input)).toThrow(/untaxed|group/i);
  income.passiveGroup='withholding_under_15';input.form1099Int.push({...input.form1099Int[0],foreignTaxPaid:'0',accountReference:'Other actual account'});
  facts.incomeSources?.push({...income,sourceId:'form1099Int:1',accountReference:'Other actual account',passiveGroup:'no_foreign_tax'});
  expect(()=>resolveForeignTaxOrdinarySources(input)).toThrow(/mixed|group/i);
});
it('retains independent regular and AMT histories without manufacturing prior capacity',()=>{
  const input=foreignTaxOrdinaryCreditFixture(),{facts,annual}=records(input);
  annual.noUnusedCreditCarryoversConfirmed=false;
  facts.carryovers=[{originTaxYear:2020,category:'passive',amount:'12.34',sourceReference:'Actual regular history'}];
  facts.amtCarryovers=[{originTaxYear:2021,category:'passive',amount:'5.67',sourceReference:'Actual AMT history'}];
  facts.regularCarryback={taxYear:2024,election:'form1116_credit',sourceFactsConfirmed:true,sourceReference:'Actual prior regular return',allPriorUseIncludedConfirmed:true,limitation:'200',currentTaxes:'100',priorCarryoversUsed:'20'};
  const actual=resolveForeignTaxOrdinarySources(input);
  expect(actual.carryovers[0].amount.toFixed()).toBe('12.34');expect(actual.amtCarryovers[0].amount.toFixed()).toBe('5.67');
  expect(actual.regularCarryback?.limitation?.toFixed()).toBe('200');expect(actual.amtCarryback).toBeUndefined();
  facts.amtCarryovers=undefined;expect(()=>resolveForeignTaxOrdinarySources(input)).toThrow(/ledgers|history/);
});
it('rejects domestic country labels in both actual credit methods',()=>{
  for(const country of ['US','USA','UNITED STATES','UNITED STATES OF AMERICA','PR']){
    const direct=foreignTaxDirectCreditFixture(),source=direct.foreignTaxElection?.sources?.[0];
    if(!source)throw new Error('Missing synthetic actual source');
    direct.form1099Int[0].foreignCountry=country;source.foreignCountry=country;
    expect(()=>resolveForeignTaxDirectSources(direct)).toThrow(/foreign.country|territor/i);
    const ordinary=foreignTaxOrdinaryCreditFixture(),facts=records(ordinary);
    ordinary.form1099Int[0].foreignCountry=country;facts.tax.foreignCountry=country;facts.income.foreignCountry=country;
    expect(()=>resolveForeignTaxOrdinarySources(ordinary)).toThrow(/foreign.country|territor/i);
  }
});
