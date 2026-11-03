/** Explicit fictional original records pinned before calculation outputs; never application defaults. */
import {BusinessExpensesSchema,Form1099NecSchema,ScheduleCInputSchema,TaxYearInputSchema,type TaxYearInput} from '@/models/inputs';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import type {GuidedFlowState} from '@/lib/guided-interview-flow';
import {paOrdinaryReturnFixture} from './pa-ordinary-return';
export const businessExpenseCategories=Object.keys(BusinessExpensesSchema.shape);
export const businessExpenseDollars={advertising:'250',officeExpense:'600',supplies:'500',travel:'300',meals:'200',utilities:'150',otherExpenses:'800'};
export function fictionalBusinessSources(input:TaxYearInput){
 const owner=input.taxpayer.primary,y=input.taxpayer.taxYear,c=input.scheduleC;if(!c)throw Error('Actual business original required for fictional supplemental source');
 const categories=Object.fromEntries(businessExpenseCategories.map(category=>[category,{status:category in businessExpenseDollars?'receipts':'known_none',sourceReference:'Fictional complete actual '+category+' expense review'}]));
 return {sourceTaxYear:y,sourceReference:'Fictional complete current commercial-enterprise separate books',sourceFactsConfirmed:true,
  owner:{accountHolder:'primary',originalTaxpayer:{firstName:owner.firstName,lastName:owner.lastName,ssn:owner.ssn}},
  businessIdentity:{name:'Fictional independent design service',activity:'Independent design services',businessCode:'541430',einStatus:'not_issued',ein:'',sourceReference:'Fictional actual proprietor registration and business records'},
  originalScheduleC:structuredClone(c),necOriginals:input.form1099Nec.map((original,originalIndex)=>({originalIndex,sourceTaxYear:y,sourceReference:'Fictional complete current annual client original '+originalIndex,sourceFactsConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,original:structuredClone(original)})),
  commercialEnterpriseConfirmed:true,cashMethodConsistentConfirmed:true,allIncomeAndExpenseSourcesCompleteConfirmed:true,noInventoryCOGSConfirmed:true,noOtherBusinessIncomeConfirmed:true,noHomeOfficeOrOtherAdjustmentsConfirmed:true,
  allocation:{method:'separate_books',sourceReference:'Fictional actual independent-center books including all liabilities',separateBooksCompleteConfirmed:true,independentProfitCentersConfirmed:true,noIntercenterTransfersConfirmed:true,freeOutsidePurchasingConfirmed:true,noGeographicCompetitionConfirmed:true,liabilitiesCompleteConfirmed:true,
   locations:[{locationId:'NY-center',sourceReference:'Fictional actual NY independent commercial lease and service records',address:'100 Fictional Center Road, New York NY 10001',state:'NY',from:`${y}-01-01`,through:`${y}-12-31`,systematicRegularOperationsConfirmed:true},{locationId:'PA-center',sourceReference:'Fictional actual PA independent commercial lease and service records',address:'200 Fictional Center Road, Pittsburgh PA 15222',state:'PA',from:`${y}-01-01`,through:`${y}-12-31`,systematicRegularOperationsConfirmed:true}]},
  incomeReceipts:[{receiptId:'client-before',sourceReference:'Fictional original NY invoice and bank deposit',transactionReference:'Fictional-deposit-1',receivedOn:`${y}-03-31`,serviceFrom:`${y}-03-01`,serviceThrough:`${y}-03-31`,locationId:'NY-center',originalNECIndex:0,amount:'9000',invoiceNumber:'NY-INVOICE-1',invoiceDate:`${y}-03-31`,customerName:'Fictional actual client',cashbookRecordReference:''},{receiptId:'client-after',sourceReference:'Fictional original PA invoice and bank deposit',transactionReference:'Fictional-deposit-2',receivedOn:`${y}-09-30`,serviceFrom:`${y}-09-01`,serviceThrough:`${y}-09-30`,locationId:'PA-center',originalNECIndex:0,amount:'9000',invoiceNumber:'PA-INVOICE-2',invoiceDate:`${y}-09-30`,customerName:'Fictional actual client',cashbookRecordReference:''}],
  manualCashbook:{status:'known_none',sourceReference:'Fictional complete no-other-cash-receipts ledger'},customerRefunds:[] as Array<{refundId:string;receiptId:string;paidOn:string;amount:string;sourceReference:string;transactionReference:string}>,expenseCategories:categories,
  expenseReceipts:Object.entries(businessExpenseDollars).map(([category,amount],i)=>({receiptId:'expense-'+i,sourceReference:'Fictional actual '+category+' vendor receipt',transactionReference:'Fictional-cost-'+i,vendorName:'Fictional '+category+' supplier',invoiceNumber:'COST-'+i,lineReference:'1',paidOn:`${y}-10-31`,benefitFrom:`${y}-10-01`,benefitThrough:`${y}-10-31`,locationId:'PA-center',category,description:category==='otherExpenses'?'Actual current design software service subscription':'Actual current commercial business '+category,amountPaid:amount,businessAmount:amount,personalAmount:'0',allocationSourceReference:'Fictional actual business-only receipt classification',ordinaryActualReasonableNecessaryConfirmed:true,noncapitalCurrentCostConfirmed:true,notOwnerBenefitOrIncomeTaxConfirmed:true,actualCostNotPerDiemConfirmed:true,noResidentialUtilityUseConfirmed:true})),
  expenseRefunds:[] as Array<{refundId:string;receiptId:string;paidOn:string;businessAmount:string;personalAmount:string;sourceReference:string;transactionReference:string}>,
  lossHistory:{status:'not_needed',sourceReference:'Fictional actual current profitable activity',priorProfits:[] as Array<{taxYear:number;netProfit:string;accountName:string;accountSsn:string;businessActivity:string;sourceReference:string}>},
 };
}
/** Explicit fictional originals, including every known zero expense. */
export function paOrdinaryBusinessFixture(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryReturnFixture(status);f.input.form1099Nec=[Form1099NecSchema.parse({taxYear:2025,payer:'Fictional actual design client',payerTin:'12-3456789',accountHolder:'primary',nonemployeeCompensation:'18000',federalWithheld:'0',stateWithheld:'0',state:'PA',stateIncome:'9000'})];
 f.input.scheduleC=ScheduleCInputSchema.parse({accountHolder:'primary',principalBusinessActivity:'Independent design services',businessCode:'541430',accountingMethod:'cash',grossReceipts:'18000',returnsAndAllowances:'0',costOfGoodsSold:'0',otherIncome:'0',expenses:Object.fromEntries(businessExpenseCategories.map(key=>[key,key in businessExpenseDollars?businessExpenseDollars[key as keyof typeof businessExpenseDollars]:'0'])),otherExpenseDescription:'Actual current design software service subscription',allInvestmentAtRisk:true,w2WagesPaid:'0',ubiaQualifiedProperty:'0',isSST:false,qbiMateriallyParticipated:true});
 const business=fictionalBusinessSources(f.input);Object.assign(f.input.paResidencySources,{businesses:[business]});
 const due={resident:'466',part_year:'191',nonresident:'191'}[status];f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:due,sourceReference:'Fictional explicit planned April15 actual business principal payment'};rebindBusinessFixture(f);return {...f,business};
}
export function rebindBusinessFixture(f:ReturnType<typeof paOrdinaryReturnFixture>){f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);}
/** Preserve all old NEC/expense/W2 amounts; new explicitly fictional actual supporting books. */
export function completeLegacyPABusinessPacket(state:GuidedFlowState){
 const copy=structuredClone(state),raw=buildTaxInputFromGuidedData(copy);if(!raw)throw Error('Complete actual old federal originals required');const input=TaxYearInputSchema.parse(raw),f=paOrdinaryReturnFixture();
 const business=fictionalBusinessSources(input);
 // This original positive source is a full-year all-PA commercial operation; no original dollars change.
 business.allocation.locations=business.allocation.locations.filter(row=>row.state==='PA');for(const row of business.incomeReceipts)row.locationId='PA-center';
 const residency={...f.input.paResidencySources,dividends:[],businesses:[business],
  wages:input.w2s.map((original,originalIndex)=>({...f.input.paResidencySources.wages[0],originalIndex,original:structuredClone(original),sourceReference:'Fictional original complete full-year employer payroll '+originalIndex,payroll:[{sourceReference:'Fictional original full-year all-PA employee payroll '+originalIndex,paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:original.wages,paServicesCompensation:original.wages,outsidePAServicesCompensation:'0'}]})),interest:[],
 };
 const confirmed=confirmGuidedPAResidencySources(input,residency),current={...input,paResidencySources:confirmed};
 f.facts.timing.remainingTaxPayment={status:'expected_payment',date:'2026-04-15',amountAppliedToTax:'466',sourceReference:'Fictional explicit actual April15 remaining principal election'};
 const t=input.taxpayer.primary,source={...f.sources,otherStateTaxes:{...f.sources.otherStateTaxes,jurisdictions:f.sources.otherStateTaxes.jurisdictions.map(row=>({...row,sourceTaxYear:2025,accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn}))}};
 copy.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:confirmed,paOrdinaryReturnFacts:confirmGuidedPAOrdinaryReturnFacts(current,f.facts),paOrdinaryReturnCompletionSources:confirmGuidedPAOrdinaryReturnCompletionSources(current,source)};return copy;
}
