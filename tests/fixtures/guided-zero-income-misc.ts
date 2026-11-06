import {emptyStateReturnData,type StateReturnData} from '@/lib/guided-interview-flow';
import {completeW2Entry,startCompleteInterview} from '../guided-interview/complete-facts';

/** Every source/recipient/receipt here is independently fictional, never a UI default. */
export function fictionalMiscOriginal(state='PA') {
 return {
  sourceId:'Fictional-zero-income-MISC-2025-A',accountReference:'Fictional private source account A',sourceTaxYear:'2025',sourceFormRevision:'2025-04',
  payer:'Separate actual payer',payerTin:'98-7654321',accountHolder:'primary' as 'primary'|'spouse'|'',
  recipientFirstName:'Jordan',recipientLastName:'Example',recipientSsn:'111-22-3333',
  rents:'0',royalties:'0',otherIncome:'0',federalWithheld:'0',fishingBoatProceeds:'0',medicalPayments:'0',substitutePayments:'0',cropInsurance:'0',grossAttorneyProceeds:'0',fishPurchasedForResale:'0',section409ADeferrals:'0',nonqualifiedDeferredComp:'0',stateIncome:'0',stateWithheld:'0.20',
  stateTaxReporting:'single' as 'single'|'none'|'multiple'|'',state,payerStateId:'actual-misc-state-id',
  directSales:false as boolean|null,fatcaFilingRequirement:false as boolean|null,
  legacyAndNewerCompensationAbsentConfirmed:true as boolean|null,
  currentOriginalConfirmed:true as boolean|null,corrected:false as boolean|null,void:false as boolean|null,allOriginalBoxesKnownConfirmed:true as boolean|null,
  remittance:{sourceReference:'Fictional payer remittance statement A',confirmationNumber:'Fictional remittance A',sourceTaxYear:'2025',state,payerTin:'98-7654321',accountReference:'Fictional private source account A',recipientSsn:'111-22-3333',paidDate:'2026-01-15',sourceAsOfDate:'2026-03-01',amountPaid:'0.20',actuallyRemittedConfirmed:true as boolean|null,notRefundedByPayerConfirmed:true as boolean|null},
  sourceFactsConfirmed:null as boolean|null,confirmedOriginal:undefined as Record<string,unknown>|undefined,
 };
}
export type FictionalMiscDraft=ReturnType<typeof fictionalMiscOriginal>;
/** Independently supplied known fictional original snapshot, not a production default. */
export function confirmFictionalMisc(row:FictionalMiscDraft):FictionalMiscDraft {
 const {sourceFactsConfirmed:_confirmation,confirmedOriginal:_snapshot,...original}=row;
 return {...row,sourceFactsConfirmed:true,confirmedOriginal:structuredClone(original)};
}
export function fictionalMiscFlow(rows=[confirmFictionalMisc(fictionalMiscOriginal())]) {
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'PA'});
 state.sectionData['income-w2']={entries:[{...completeW2Entry,wages:'60000',federalWithheld:'0',socialSecurityWages:'60000',medicareWages:'60000',stateTaxReporting:'single',state:'PA',stateWages:'60000',stateWithheld:'2000'}]};
 state.sectionData['state-return']={...emptyStateReturnData,...{zeroIncomeMiscSources:rows}};
 return state;
}
export function miscRows(state:ReturnType<typeof fictionalMiscFlow>):FictionalMiscDraft[]{
 return (state.sectionData['state-return'] as StateReturnData&{zeroIncomeMiscSources:FictionalMiscDraft[]}).zeroIncomeMiscSources;
}
