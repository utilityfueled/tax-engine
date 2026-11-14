import { simpleW2Fixture } from './simple-w2.js';

export function investmentElectionFixture() {
  const source=(reference:string,qd:string,elected:string,interest:string)=>({sourceTaxYear:2025,sourceReference:reference,sourceFactsConfirmed:true,
    investmentInterestExpense:interest,priorYearDisallowed:'0',grossInvestmentIncome:qd,qualifiedDividendsIncluded:qd,
    netGainFromInvestmentProperty:'0',netCapitalGainFromInvestmentProperty:'0',electedPreferentialIncome:elected,electedNetCapitalGain:'0',investmentExpenses:'0'});
  const qd=['500','1002','20000','40000'], elected=['0','1','500','1000'], interest=elected;
  const other=['5000','8333','12834','19000'], totals=['5000','8334','13334','20000'];
  const ends=['2025-03-31','2025-05-31','2025-08-31','2025-12-31'];
  const agi=['40000','91667.75','140000','200000'];
  return {...structuredClone(simpleW2Fixture),w2s:[{...simpleW2Fixture.w2s[0],wages:'160000',federalWithheld:'0',socialSecurityWages:'160000',medicareWages:'160000'}],
    form1099Div:[{payer:'Fictional Election Fund',ordinaryDividends:'40000',qualifiedDividends:'40000',totalCapitalGainDistributions:'0'}],
    scheduleA:{realEstateTaxes:'19000'},form4952:source('fictional-annual4952-2025','40000','1000','1000'),
    form2210:{calendarYearTaxpayer:true,residentReturn:true,farmerOrFisher:false,disasterReliefClaimed:false,waiverRequested:false,withholdingMethod:'equal-installments',priorYearTaxStatus:'no-return',calculationMethod:'annualized',ordinaryPreferentialPeriodsConfirmed:true,
      annualizedIncomePeriods:agi.map((adjustedGrossIncome,i)=>({adjustedGrossIncome,itemizedDeductions:totals[i],qbiDeduction:'0',qualifiedDividends:qd[i],netCapitalGain:'0',netProfitFromSelfEmployment:'0',socialSecurityWages:'0',otherTaxes:'0',credits:'0'})),
      investmentElectionSources:{sourceTaxYear:2025,sourceReference:'fictional-period-source-2025',sourceFactsConfirmed:true,allPeriodsCompleteConfirmed:true,electionValidConfirmed:true,otherInvestmentIncomePresent:false,
        accountHolder:'primary',taxpayerFirstName:'Jane',taxpayerLastName:'Doe',taxpayerSsnLast4:'6789',annualForm4952SourceReference:'fictional-annual4952-2025',
        periods:ends.map((periodEnd,i)=>({periodEnd,form4952:source('fictional-period4952-'+i,qd[i]!,elected[i]!,interest[i]!),otherItemizedDeductions:other[i]}))}}};
}
