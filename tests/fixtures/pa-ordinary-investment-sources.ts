/** Explicit fictional actual source originals. No production field defaults or engine-derived oracles. */
import {Form1099DivSchema,TaxYearInputSchema} from '@/models/inputs';
import {snapshotPAOrdinaryReturnOriginals} from '@/engine/state/pa-ordinary-return-facts';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import type {GuidedFlowState} from '@/lib/guided-interview-flow';
import {confirmGuidedPAResidencySources} from '@/lib/guided-pa-residency-facts';
import {confirmGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {paOrdinaryReturnFixture} from './pa-ordinary-return';
export interface ActualDividendRow {
 originalIndex:number|null;sourceTaxYear:number|null;sourceReference:string;sourceFactsConfirmed:boolean|null;
 original?:Record<string,unknown>;ordinaryPersonalDividendIncomeConfirmed:boolean|null;
 capitalDistributionsFromRegulatedInvestmentCompanyConfirmed:boolean|null;
 noOtherPADividendAdjustmentsConfirmed:boolean|null;currentUncorrectedNonvoidOriginalConfirmed:boolean|null;allOriginalBoxesKnownConfirmed:boolean|null;
 credits:Array<{sourceReference:string;creditedOn:string;ordinaryDividends:string;capitalGainDistributions:string}>;
}
export function paOrdinaryInvestmentFixture(status:'resident'|'part_year'|'nonresident'='resident'){
 const f=paOrdinaryReturnFixture(status);
 const original=Form1099DivSchema.parse({taxYear:2025,payer:'Fictional ordinary regulated investment fund',payerTin:'12-3456790',accountReference:'fictional-personal-investment-1',accountHolder:'primary',ordinaryDividends:'2000',qualifiedDividends:'0',totalCapitalGainDistributions:'500',section1250Gain:'0',section1202Gain:'0',collectiblesGain:'0',nondividendDistributions:'0',federalWithheld:'0',section199ADividends:'0',foreignTaxPaid:'0',foreignCountry:'',exemptInterestDividends:'0',specifiedPrivateActivityBondInterest:'0',paExemptInterestDividendAllocation:'0',stateWithheld:'0',state:'PA'});
 f.input.form1099Div=[original];
 const dividends:ActualDividendRow[]=[{originalIndex:0,sourceTaxYear:2025,sourceReference:'Fictional complete original fund annual statement',sourceFactsConfirmed:true,original:structuredClone(original),ordinaryPersonalDividendIncomeConfirmed:true,capitalDistributionsFromRegulatedInvestmentCompanyConfirmed:true,noOtherPADividendAdjustmentsConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,credits:[{sourceReference:'Fictional March dividend and fund distribution',creditedOn:'2025-03-31',ordinaryDividends:'1000',capitalGainDistributions:'200'},{sourceReference:'Fictional September dividend and fund distribution',creditedOn:'2025-09-30',ordinaryDividends:'1000',capitalGainDistributions:'300'}]}];
 const residency={...f.input.paResidencySources,dividends};f.input.paResidencySources=residency;
 const due={resident:'76',part_year:'40',nonresident:'0'}[status];
 f.facts.timing.remainingTaxPayment=due==='0'?{status:'no_remaining_tax',sourceReference:'Fictional withholding pays current principal'}:{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:due,sourceReference:'Fictional explicit planned April15 principal payment'};
 rebindInvestmentFixture(f);
 return {...f,residency};
}
/** Fixture-author explicit source confirmation after intentionally changing fictional originals. Never read-path behavior. */
export function rebindInvestmentFixture(f:ReturnType<typeof paOrdinaryReturnFixture>){f.facts.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);f.sources.originalFederalSources=snapshotPAOrdinaryReturnOriginals(f.input);}
export function fractionalInvestmentFixture(){
 const f=paOrdinaryInvestmentFixture('part_year'),b=f.input.form1099Int[0],d=f.input.form1099Div[0];
 b.interestIncome='0.98';f.residency.interest[0].original=structuredClone(b);f.residency.interest[0].credits=[{sourceReference:'Fictional nonresident49cent bank credit',creditedOn:'2025-06-30',amount:'0.49'},{sourceReference:'Fictional resident49cent bank credit',creditedOn:'2025-07-01',amount:'0.49'}];
 d.ordinaryDividends='0.98';d.totalCapitalGainDistributions='0.98';f.residency.dividends[0].original=structuredClone(d);f.residency.dividends[0].credits=[{sourceReference:'Fictional nonresident49cent dividend and gain distribution',creditedOn:'2025-06-30',ordinaryDividends:'0.49',capitalGainDistributions:'0.49'},{sourceReference:'Fictional resident49cent dividend and gain distribution',creditedOn:'2025-07-01',ordinaryDividends:'0.49',capitalGainDistributions:'0.49'}];
 f.facts.timing.remainingTaxPayment={status:'no_remaining_tax',sourceReference:'Fictional complete799withholding exceeds798tax'};f.facts.disposition={kind:'allocation',sourceReference:'Fictional explicit1dollar refund election',refundRequested:'1',nextYearCreditRequested:'0',donations:[]};rebindInvestmentFixture(f);return f;
}

/** Preserve old positive source dollars; supplement with explicitly fictional complete supporting statements. */
export function completeLegacyPAInvestmentPacket(state:GuidedFlowState,kind:'wages'|'sp'|'interest'|'dividends'){
 const stateCopy=structuredClone(state),raw=buildTaxInputFromGuidedData(stateCopy);if(!raw)throw Error('Actual legacy positive federal originals missing');const input=TaxYearInputSchema.parse(raw),f=paOrdinaryReturnFixture('resident');
 const residency={...f.input.paResidencySources,
  wages:input.w2s.map((w,index)=>({...f.input.paResidencySources.wages[0],originalIndex:index,sourceReference:'Fictional full-year original employer payroll statement '+index,original:structuredClone(w),payroll:[{sourceReference:'Fictional actual full-year PA payroll source '+index,paidOn:'2025-12-31',serviceFrom:'2025-01-01',serviceThrough:'2025-12-31',grossCompensation:w.wages,paServicesCompensation:w.wages,outsidePAServicesCompensation:'0'}]})),
  interest:input.form1099Int.map((b,index)=>({...f.input.paResidencySources.interest[0],originalIndex:index,sourceReference:'Fictional complete original personal bank statement '+index,original:structuredClone(b),credits:[{sourceReference:'Fictional actual December31 personal bank credit '+index,creditedOn:'2025-12-31',amount:b.interestIncome}]})),
  dividends:input.form1099Div.map((d,index):ActualDividendRow=>({originalIndex:index,sourceTaxYear:2025,sourceReference:'Fictional complete original personal fund statement '+index,sourceFactsConfirmed:true,original:structuredClone(d),ordinaryPersonalDividendIncomeConfirmed:true,capitalDistributionsFromRegulatedInvestmentCompanyConfirmed:true,noOtherPADividendAdjustmentsConfirmed:true,currentUncorrectedNonvoidOriginalConfirmed:true,allOriginalBoxesKnownConfirmed:true,credits:[{sourceReference:'Fictional actual December31 ordinary and regulated fund credit '+index,creditedOn:'2025-12-31',ordinaryDividends:d.ordinaryDividends,capitalGainDistributions:d.totalCapitalGainDistributions}]})),
 };
 const confirmed=confirmGuidedPAResidencySources(input,residency),current={...input,paResidencySources:confirmed};
 const due={wages:'0',sp:'0',interest:'92',dividends:'76'}[kind];
 f.facts.timing.remainingTaxPayment=due==='0'?{status:'no_remaining_tax',sourceReference:'Fictional complete actual PA withholding and SP settles principal'}:{status:'expected_payment',date:'2026-04-15',amountAppliedToTax:due,sourceReference:'Fictional explicit actual April15 remaining principal election'};
 if(kind==='sp')f.facts.disposition={kind:'allocation',sourceReference:'Fictional explicit actual184paperrefund election',refundRequested:'184',nextYearCreditRequested:'0',donations:[]};
 // New explicitly fictional current-owner-specific no-payment history; the Avery source remains retained in evidence.
 // These fixture facts are supplied here, never defaults or read-path owner refresh in product code.
 const taxpayer=current.taxpayer.primary;
 const completionSources={...f.sources,otherStateTaxes:{...f.sources.otherStateTaxes,jurisdictions:f.sources.otherStateTaxes.jurisdictions.map(history=>({...history,sourceTaxYear:current.taxpayer.taxYear,accountName:taxpayer.firstName+' '+taxpayer.lastName,accountSsn:taxpayer.ssn}))}};
 const facts=confirmGuidedPAOrdinaryReturnFacts(current,f.facts),completion=confirmGuidedPAOrdinaryReturnCompletionSources(current,completionSources);
 stateCopy.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',paResidencySources:confirmed,paOrdinaryReturnFacts:facts,paOrdinaryReturnCompletionSources:completion};return stateCopy;
}
