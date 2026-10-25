import { buildGuidedForeignTaxCarryover, type ForeignCarryoverData } from "./guided-foreign-tax-carryover";
import { buildGuidedForeignTaxDirectCredit, type ForeignDirectCreditData, type ForeignCreditKnownResidency } from './guided-foreign-tax-direct-credit';
import { ForeignTaxElectionSchema, Form1099IntSchema, Form1099DivSchema, type TaxYearInput } from '@/models/inputs.js';
import { resolveForeignTaxElection } from '@/engine/forms/foreign-tax-election.js';
import type { FilingStatus, InterestEntryData, DividendEntryData } from './guided-interview-flow';
import type { FilingStatus as EngineFilingStatus } from '@/models/constants.js';
import { isStartedInvestment, type InvestmentData } from './guided-investment-facts';
import { parseGuidedCurrency } from './guided-currency';

type EngineElection = NonNullable<TaxYearInput['foreignTaxElection']>;
export type ForeignTaxSourceData = NonNullable<EngineElection['sources']>[number];
export type ForeignTaxElectionData = Omit<EngineElection,'taxYear'|'sourceFactsConfirmed'|'deductionYearCarryover'|'creditWithoutForm1116'> & {taxYear?:string;sourceFactsConfirmed?:boolean|null;deductionYearCarryover?:ForeignCarryoverData;creditWithoutForm1116?:ForeignDirectCreditData};
const statusMap:Record<FilingStatus,EngineFilingStatus>={single:'single',mfj:'married_filing_jointly',mfs:'married_filing_separately',hoh:'head_of_household',qss:'qualifying_surviving_spouse'};
function amount(value:string|undefined,label:string) {
  if(value===undefined||!value.trim())throw new Error(`Enter the actual ${label}, including zero when established by the source.`);
  const parsed=parseGuidedCurrency(value);if(!parsed.isFinite()||parsed.lt(0))throw new Error(`The actual ${label} must be finite and nonnegative.`);return parsed.toFixed();
}
export function snapshotForeignTaxSource(entry:InterestEntryData|DividendEntryData,sourceId:string):ForeignTaxSourceData {
  return {sourceId,payerName:entry.payer,payerTin:entry.payerTin,accountReference:entry.accountReference,
    owner:entry.accountHolder==='primary'||entry.accountHolder==='spouse'?entry.accountHolder:undefined,
    foreignCountry:entry.foreignCountry,reportedTaxAmount:entry.foreignTaxPaid};
}
export function buildGuidedForeignTaxElection(data:ForeignTaxElectionData|undefined,investment:InvestmentData|undefined,year?:number|null,status?:FilingStatus|null,knownResidency?:ForeignCreditKnownResidency):TaxYearInput['foreignTaxElection'] {
  if(!data)return undefined;
  if((year!==2025&&year!==2026)||data.taxYear!==String(year)||!status)throw new Error('Match the actual annual foreign-tax election year to this return.');
  if(data.sourceFactsConfirmed!==true)throw new Error('Confirm the actual foreign-tax election and its sources after the last edit.');
  const sources=data.sources?.map(source=>({...source,
    reportedTaxAmount:amount(source.reportedTaxAmount,'statement foreign tax'),taxOnExcludedIncome:amount(source.taxOnExcludedIncome,'tax on excluded income'),
    taxDeductedElsewhere:amount(source.taxDeductedElsewhere,'tax already deducted elsewhere'),investmentAllocableAmount:amount(source.investmentAllocableAmount,'foreign investment tax allocation'),
    payments:source.payments?.map(payment=>({...payment,amountUsd:amount(payment.amountUsd,'dated USD tax payment')})),
  }));
  const actual=ForeignTaxElectionSchema.parse({...data,taxYear:year,sources,deductionYearCarryover:buildGuidedForeignTaxCarryover(data.deductionYearCarryover,investment,year,status),creditWithoutForm1116:buildGuidedForeignTaxDirectCredit(data.creditWithoutForm1116,knownResidency)});
  const form1099Int=(investment?.interestEntries??[]).filter(isStartedInvestment).map(entry=>Form1099IntSchema.parse({
    payer:entry.payer,payerTin:entry.payerTin,accountReference:entry.accountReference?.trim()||undefined,accountHolder:entry.accountHolder||undefined,
    interestIncome:amount(entry.interestIncome,'statement interest'),foreignTaxPaid:amount(entry.foreignTaxPaid,'statement foreign tax'),foreignCountry:entry.foreignCountry,
  }));
  const form1099Div=(investment?.dividendEntries??[]).filter(isStartedInvestment).map(entry=>Form1099DivSchema.parse({
    payer:entry.payer,payerTin:entry.payerTin,accountReference:entry.accountReference?.trim()||undefined,accountHolder:entry.accountHolder||undefined,
    ordinaryDividends:amount(entry.ordinaryDividends,'statement dividends'),foreignTaxPaid:amount(entry.foreignTaxPaid,'statement foreign tax'),foreignCountry:entry.foreignCountry,
  }));
  // Annual history is explicitly confirmed in this worksheet. Canonical return
  // validation also checks any saved carryovers and pass-through tax records.
  resolveForeignTaxElection({taxpayer:{taxYear:year,filingStatus:statusMap[status]},foreignTaxElection:actual,form1099Int,form1099Div,scheduleK1:[],scheduleK1Form1041:[]});
  return actual;
}
export function guidedForeignTaxFactErrors(data:ForeignTaxElectionData|undefined,investment:InvestmentData|undefined,year?:number|null,status?:FilingStatus|null,knownResidency?:ForeignCreditKnownResidency):Record<string,string> {
  try{buildGuidedForeignTaxElection(data,investment,year,status,knownResidency);return{};}catch(error){return{foreignTaxElection:error instanceof Error?error.message:'Complete the actual annual foreign-tax election and sources.'};}
}
