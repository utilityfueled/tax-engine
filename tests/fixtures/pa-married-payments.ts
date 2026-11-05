/** Fictional source originals fixed independently of calculated results. */
import {paMarriedOrdinaryFixture} from './pa-married-ordinary-return.js';
type Receipt={accountName:string;accountSsn:string;taxYear:number;returnType:string;kind:string;date:string;amount:string;confirmationNumber:string};
export function paMarriedPaymentsFixture(options:{primaryEstimates?:string[];primaryExtension?:string;priorCredit?:string;withholding?:string[];refunds?:string[]}={}){
 const f=paMarriedOrdinaryFixture('M',['50000','30000'],options.withholding??['1535','921']);
 const due=['2025-04-15','2025-06-16','2025-09-15','2026-01-15'];
 const accounts=f.sources.owners.map((owner,i)=>{
  const person=i===0?f.input.taxpayer.primary:f.input.taxpayer.spouse;if(!person)throw new Error('Fictional spouse original required');
  const accountName=person.firstName+' '+person.lastName,accountSsn=person.ssn;
  const values=i===0?(options.primaryEstimates??['100.25','99.25']):['80.49'];
  const receipts:Array<{sourceReference:string;intendedInstallment:number|null;original:Receipt}>=values.map((amount,j)=>({sourceReference:`Fictional ${owner.accountHolder} estimate source ${j}`,intendedInstallment:j+1,original:{accountName,accountSsn,taxYear:2025,returnType:'PA-40',kind:'estimated',date:due[j],amount,confirmationNumber:`SYNTHETIC-${i}-${j}`} as Receipt}));
  const extension=i===0?(options.primaryExtension??'75.50'):'0';
  if(extension!=='0')receipts.push({sourceReference:'Fictional actual extension original',intendedInstallment:null,original:{accountName,accountSsn,taxYear:2025,returnType:'PA-40',kind:'extension',date:'2026-04-15',amount:extension,confirmationNumber:'SYNTHETIC-EXTENSION'}});
  const credit=i===0?(options.priorCredit??'50.50'):'0';
  const priorCredit=credit==='0'?{status:'known_none',sourceReference:`Fictional ${i} known no carryover`}:{status:'actual_credit',sourceReference:'Fictional unchanged original carryover',originalPriorReturn:{accountName,accountSsn,taxYear:2024,returnType:'PA-40',filingStatus:'M',filedOn:'2025-04-15',creditElected:credit}};
  Object.assign(owner.payments,{estimatedPaymentsStatus:receipts.some(r=>r.original.kind==='estimated')?'actual_receipts':'known_none',extensionPaymentsStatus:extension==='0'?'known_none':'actual_receipts',priorCreditStatus:credit==='0'?'known_none':'actual_credit',originalReceipts:receipts.map(r=>structuredClone(r.original)),priorReturnStatus:credit==='0'?'no_return':'actual_return'});
  return {accountHolder:owner.accountHolder,sourceReference:`Fictional ${i} complete PA posted account`,originalAccount:{accountName,accountSsn,taxYear:2025,returnType:'PA-40',filingStatus:'M',accountKind:'individual',asOfDate:'2026-04-15',allPaymentsCompleteConfirmed:true,noTransfersOffsetsRefundsOrAdjustmentsConfirmed:true,receipts:receipts.map(r=>structuredClone(r.original)),availablePriorCredit:credit,priorCreditAppliedOn:credit==='0'?null:'2025-04-15'},receipts,priorCredit};
 });
 f.sources.timing.asOfDate='2026-04-15';f.sources.timing.filingExtension=accounts.some(a=>a.receipts.some(r=>r.original.kind==='extension'))?'actual_extension':'none';
 f.sources.dispositions.forEach((d,i)=>{d.refundRequested=(options.refunds??['327','80'])[i];});
 return {...f,sources:{...f.sources,owners:f.sources.owners.map(o=>({...o,payments:{...o.payments,originalReceipts:o.payments.originalReceipts as Array<Record<string,unknown>>}})),paymentSources:{sourceTaxYear:2025,sourceReference:'Fictional two unchanged posted individual accounts',sourceFactsConfirmed:true,accounts}}};
}
