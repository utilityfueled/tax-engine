import { investmentElectionFixture } from './form-2210-investment-election.js';
export function investmentHouseholdFixture() {
 const x=investmentElectionFixture();
 const primary={firstName:'Jane',lastName:'Doe',ssn:'123-45-6789'};
 const spouse={firstName:'PrivateMfjSpouseName',lastName:'Spouse',ssn:'234-56-7890'};
 const dividend={...x.form1099Div[0],taxYear:2025,payerTin:'12-3456789',accountReference:'PRIVATE-PRIMARY-ACCOUNT-A',accountHolder:'primary' as const};
 const totals=['10000','16000','26500','41000'];
 const qd=['500','1000','20000','40000'],elected=['0','0','500','1000'],other=['10000','16000','26000','40000'],agi=['50000','100000','120000','200000'];
 const household={sourceTaxYear:2025,sourceReference:'PRIVATE-JOINT-HOUSEHOLD-2025',sourceFactsConfirmed:true,jointReturnConfirmed:true,marriedAtYearEndConfirmed:true,bothSpousesAliveAllYearConfirmed:true,bothSpousesUsResidentsAllYearConfirmed:true,
   primary,spouse,marriageSourceReference:'PRIVATE-ACTUAL-MARRIAGE-ORIGINAL',primaryDomicile:{state:'MA',startDate:'2025-01-01',endDate:'2025-12-31',sourceReference:'PRIVATE-PRIMARY-DOMICILE'},spouseDomicile:{state:'MA',startDate:'2025-01-01',endDate:'2025-12-31',sourceReference:'PRIVATE-SPOUSE-DOMICILE'},
   spouseInvestmentIncome:'0',spouseInvestmentInterestExpense:'0',spousePriorDisallowedInterest:'0',spouseOtherInvestmentExpenses:'0',spouseInvestmentSourcesNoneConfirmed:true,spouseSourceReference:'PRIVATE-SPOUSE-COMPLETE-NONE',
   allInvestmentSourcesIncludedConfirmed:true,primarySoleInvestmentOwnershipConfirmed:true,propertyNeverCommunityOwnedConfirmed:true,ownershipSourceReference:'PRIVATE-PRIMARY-OWNERSHIP-HISTORY',
   dividendSources:[{recipient:{...primary},sourceIndex:0,sourceTaxYear:2025,sourceReference:'PRIVATE-DIVIDEND-ORIGINAL-A',payerName:dividend.payer,payerTin:dividend.payerTin,accountReference:dividend.accountReference,accountHolder:'primary' as const,ordinaryDividends:'40000',qualifiedDividends:'40000',totalCapitalGainDistributions:'0',otherReportedAmountsZeroConfirmed:true}]};
 return {...x,taxpayer:{...x.taxpayer,filingStatus:'married_filing_jointly' as const,spouse:{...spouse,dateOfBirth:'1991-01-01'},address:{...x.taxpayer.address,state:'MA',city:'Boston',zip:'02108'}},
  w2s:x.w2s.map(w=>({...w,taxYear:2025,accountHolder:'primary' as const,medicareWithheld:'2320',socialSecurityWithheld:'9920'})),form1099Div:[dividend],scheduleA:{realEstateTaxes:'40000'},
  form4952:{...x.form4952,sourceFactsComplete:true},form2210:{...x.form2210,bothSpousesSelfEmployed:false,
   annualizedIncomePeriods:x.form2210.annualizedIncomePeriods.map((p,i)=>({...p,adjustedGrossIncome:agi[i],itemizedDeductions:totals[i],qualifiedDividends:qd[i]})),
   investmentElectionSources:{...x.form2210.investmentElectionSources,household,
    periods:x.form2210.investmentElectionSources.periods.map((p,i)=>({...p,otherItemizedDeductions:other[i],form4952:{...p.form4952,sourceFactsComplete:true,grossInvestmentIncome:qd[i],qualifiedDividendsIncluded:qd[i],electedPreferentialIncome:elected[i],investmentInterestExpense:elected[i]}}))}}};
}
