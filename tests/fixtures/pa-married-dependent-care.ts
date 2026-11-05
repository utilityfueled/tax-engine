/** Fictional source originals authored before product; numerical oracles are independent Decimal worksheets. */
import {paMarriedOrdinaryFixture,marriedOriginals} from './pa-married-ordinary-return.js';
import {PAMarriedOrdinarySourcesSchema} from '@/models/pa-married-ordinary-sources.js';
export function paMarriedDependentCareFixture(options:{year?:number;mode?:'J'|'M';wages?:string[];withholding?:string[];care?:boolean;expenses?:string;twoChildren?:boolean;payer?:'primary'|'spouse';adult?:boolean}={}){
 const y=options.year??2025,mode=options.mode??'J',base=paMarriedOrdinaryFixture(mode,options.wages??['60000','40000'],options.withholding??['1842','1228'],'0',y),{input}=base;
 const children=Array.from({length:options.twoChildren?2:1},(_,i)=>({firstName:i?'Second':'Care',lastName:'Pennsylvania',ssn:i?'900-70-0314':'900-70-0313',dateOfBirth:options.adult?'1990-02-01':`${y-5}-02-01`,relationship:'child',monthsLivedWithYou:12,qualifiesForCTC:!options.adult,ctcSsnEligible:!options.adult,qualifiesForODC:options.adult===true,qualifiesForEIC:false}));
 input.taxpayer.dependents=children;
 const sources=PAMarriedOrdinarySourcesSchema.parse(base.sources);
 sources.dependentChildren=children.map((child,originalIndex)=>({sourceReference:`Fictional child ${originalIndex+1} birth custody federal claim records`,factsConfirmed:true,originalIndex,originalFederalDependent:structuredClone(child),relationship:'natural_child',federalReturnClaimConfirmed:true,noOtherClaimByAgreementOrDecreeConfirmed:true}));
 sources.allDependentSourcesReviewedConfirmed=true;sources.coverage.allDependentSourcesKnownNoneConfirmed=false;
 if(options.care!==false){
  const expense=options.expenses??'3000',payer=options.payer??'primary',person=payer==='primary'?input.taxpayer.primary:input.taxpayer.spouse;if(!person)throw Error('Fictional actual spouse required');
  input.dependentCare={sourceFactsConfirmed:true,receivedBenefits:false,usesDeemedIncome:false,eligibilityConfirmed:true,priorYearExpenseCredit:'0',primaryEarnedIncome:input.w2s[0].wages,spouseEarnedIncome:input.w2s[1].wages,excludedDependentCareBenefits:'0',expenses:expense,qualifyingIndividuals:children.length,
   providers:[{name:'Fictional Care Center',address:'11 Fictional Care Way, Pittsburgh PA 15201',identifierType:'tin',taxId:'98-7654321',householdEmployee:false,amountPaid:expense}],
   qualifyingPersons:children.map((child,i)=>({firstName:child.firstName,lastName:child.lastName,identifierType:'tax_id',taxId:child.ssn,over12Disabled:false,qualifyingPersonConfirmed:true,qualifiedExpenses:i?'0':expense}))};
  const ref='Fictional current original married care receipt',date=`${y}-12-15`;
  sources.coverage.allCareExpensesAndEmployerBenefitsKnownNoneConfirmed=false;
  sources.care={status:'actual_expenses',sourceReference:'Fictional complete married care and known-zero employer benefit history',allCarePaymentSourcesReviewedConfirmed:true,allEmployerBenefitsIncludedConfirmed:true,payerAssignments:[{sourceReference:ref,accountHolder:payer}],
   originalCarePayments:[{recordKind:'care_payment',sourceTaxYear:y,sourceReference:ref,documentName:'Fictional original current care receipt',issuerName:'Fictional Care Center',recipientName:person.firstName+' '+person.lastName,recipientTin:person.ssn,recordDate:date,originalAvailableConfirmed:true,methodStatus:'requires_source_method'}],
   careSources:{sourceTaxYear:y,sourceReference:'Fictional current actual care packet',sourceFactsConfirmed:true,originalDependentCare:structuredClone(input.dependentCare),payments:[{sourceReference:ref,providerIndex:0,qualifyingPersonIndex:0,paidOn:date,serviceFrom:`${y}-01-01`,serviceThrough:`${y}-12-01`,amount:expense,originalAvailableConfirmed:true,employmentRelatedConfirmed:true,notClaimedOnAnotherReturnConfirmed:true,originalReceipt:{receiptNumber:'Fictional care receipt3000',date,amount:expense,providerName:'Fictional Care Center',providerTin:'98-7654321',qualifyingPersonName:children[0].firstName+' '+children[0].lastName,qualifyingPersonTin:children[0].ssn}}]}};
  // Explicit independent election, not a production default or computed oracle.
  sources.dispositions[0].refundRequested=options.twoChildren?'1200':options.wages?.[1]==='1000'?'200':'600';
 }
 sources.originalFederalSources=marriedOriginals(input);
 return {input,sources};
}
/** Synthetic fixture authoring only: deliberately reviewed changed fictional originals. */
export function bindMarriedDependentCareFixture(f:ReturnType<typeof paMarriedDependentCareFixture>){
 if(f.sources.care?.careSources&&f.input.dependentCare)f.sources.care.careSources.originalDependentCare=structuredClone(f.input.dependentCare);
 f.sources.dependentChildren?.forEach(row=>{if(row.originalIndex!==null&&f.input.taxpayer.dependents[row.originalIndex])row.originalFederalDependent=structuredClone(f.input.taxpayer.dependents[row.originalIndex]);});
 f.sources.wages.forEach(row=>{if(row.originalIndex!==null)row.original=structuredClone(f.input.w2s[row.originalIndex]);});
 f.sources.originalFederalSources=marriedOriginals(f.input);
}
