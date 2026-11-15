import {emptyForeignIncome,emptyForeignIncomeSource,foreignIncomePartIVKeys,type ForeignIncomeData,type ForeignIncomeSourceData} from '@/lib/guided-foreign-income';
import {emptyAdjustmentData} from '@/lib/guided-interview-flow';
import {completeBusinessSection,startCompleteInterview} from '../guided-interview/complete-facts';
import {mixedCapitalServicesFixture} from './form-2555-mixed-capital-services';
import {allForeignCapitalLossFixture} from './form-2555-all-foreign-capital-loss';
export function qualificationOriginals(): ForeignIncomeData {
  return { ...structuredClone(emptyForeignIncome), sourceTaxYear: "2025", sourceReference: "Original foreign pay and presence worksheet", accountHolder: "primary",
    taxpayerName: "Jordan Example", taxpayerTaxIdLast4: "3333", sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true,
    taxHomeCountry: "United Kingdom", taxHomeStartDate: "2025-01-01", taxHomeEndDate: "2025-12-31", taxHomeConfirmed: true, foreignCountriesQualify: true,
    citizenshipStatus: "us_citizen", servicesQualify: true, qualificationMethod: "physical_presence", qualificationReference: "Actual travel diary",
    testPeriodStartDate: "2025-01-01", testPeriodEndDate: "2025-12-31", testPeriodCompleted: true, qualifyingDays: "365",
    fullForeignPeriods: [{ country: "United Kingdom", startDate: "2025-01-01", endDate: "2025-12-31" }],
    electionsValidConfirmed: true, claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false,
    partIV: { ...Object.fromEntries(foreignIncomePartIVKeys.map(key => [key, "0"])), wages: "120000" } as ForeignIncomeData["partIV"],
    sources: [{ ...structuredClone(emptyForeignIncomeSource), sourceId: "formW2:0", sourceTaxYear: "2025", accountHolder: "primary", sourceReference: "Employer wage statement", payerName: "Foreign Employer", payerEin: "12-3456789", foreignEarnedIncome: "120000", priorYearIncomeReceived: "0" }],
    qualifiedHousingExpenses: "0", housingExpensesQualificationConfirmed: false, housingNoDuplicateClaimConfirmed: true,
    nontaxableGovernmentHousingAllowance: "0", deductionsAllocableToExcludedIncome: "0", foreignEarnedIncomeTaxWorksheetDisallowedDeductions: "0",
    deductionWorksheetReference: "Original zero allocable deductions worksheet", priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0",
  };
}

export type CapitalMethod='mixedCapitalServices'|'allForeignCapitalLoss';
export function guidedForeignCapitalFixture(method:CapitalMethod,year=2025){
 const canonical=method==='mixedCapitalServices'?mixedCapitalServicesFixture(year):allForeignCapitalLossFixture(year),source=canonical.form2555.sourceMapping.rows[0];
 if(!source)throw Error('Missing fictional original');
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['self-employment'],lifeEvents:['foreign-earned-income'],stateCode:null});state.taxYear=year;
 const data=qualificationOriginals();const personal=state.sectionData['personal-info'];if(!personal)throw Error('Missing household');
 Object.assign(data,{sourceTaxYear:String(year),sourceReference:canonical.form2555.sourceMapping.sourceReference,taxpayerName:`${personal.firstName} ${personal.lastName}`,taxpayerTaxIdLast4:personal.ssn.replace(/\D/g,'').slice(-4),partIV:structuredClone(canonical.form2555.partIV),businessCapitalMaterialIncomeProducing:true,deductionsAllocableToExcludedIncome:canonical.form2555.deductionsAllocableToExcludedIncome,housingExpensesQualificationConfirmed:true});
 for(const key of['taxHomeStartDate','testPeriodStartDate']as const)data[key]=`${year}-01-01`;for(const key of['taxHomeEndDate','testPeriodEndDate']as const)data[key]=`${year}-12-31`;data.taxHomeCountry=method==='mixedCapitalServices'?'Spain':'Brazil';data.fullForeignPeriods=[{country:data.taxHomeCountry,startDate:`${year}-01-01`,endDate:method==='mixedCapitalServices'?`${year}-11-30`:`${year}-12-31`}];
 const original=Reflect.get(source,method);if(!original||source.accountHolder!=='primary')throw Error('Missing original primary capital proof');
 const proof={...structuredClone(original),taxYear:String(year)};
 const row:ForeignIncomeSourceData={...structuredClone(emptyForeignIncomeSource),...structuredClone(source),mixedCapitalServices:undefined,allForeignCapitalLoss:undefined,accountHolder:source.accountHolder,sourceTaxYear:String(year)};Reflect.set(row,method,proof);data.sources=[row];
 state.sectionData['income-w2']={entries:[]};
 state.sectionData['income-self-employment']={...structuredClone(completeBusinessSection),manualGrossReceipts:canonical.scheduleC.grossReceipts,expenses:{...structuredClone(completeBusinessSection.expenses),supplies:canonical.scheduleC.expenses.supplies},businessFacts:{...structuredClone(completeBusinessSection.businessFacts),businessName:canonical.scheduleC.businessName,ein:canonical.scheduleC.ein}};
 state.sectionData.adjustments={...structuredClone(emptyAdjustmentData),foreignIncome:data};
 return{method,canonical,state,data,row,proof};
}
