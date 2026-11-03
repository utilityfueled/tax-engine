import type { TaxYearInput } from '@/models/inputs';
import { PAOrdinaryReturnFactsSchema } from '@/models/pa-ordinary-return-facts';
import { PADigitalTaxRefundSourcesSchema, type PADigitalTaxRefundSources } from '@/models/pa-digital-tax-refund-sources';
import { calculatePADigitalTaxRefundSources } from '@/engine/state/pa-digital-tax-refund-sources';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
type Application=NonNullable<PADigitalTaxRefundSources['specialWrittenApplication']>;
export type GuidedPADigitalTaxRefundSources=Omit<PADigitalTaxRefundSources,'specialWrittenApplication'>&{specialApplicationStatus:'unknown'|'none'|'reported';specialWrittenApplication:Application};
const fail=(message:string):never=>{throw new Error('Actual VA refund source collection: '+message);};
const originalIdentity=()=>({sourceTaxYear:null,accountName:'',accountSsn:'',state:'',sourceReference:''});
export function emptyPADigitalRefundApplication():Application{return{...originalIdentity(),applicationId:'',submittedOn:'',amountRequested:'',actuallySubmittedConfirmed:null};}
export function emptyPADigitalRefundStatement():PADigitalTaxRefundSources['statements'][number]{return{originalIndex:null,sourceReference:'',sourceFactsConfirmed:null,withholdingOriginal:{...originalIdentity(),date:'',amount:'',confirmationNumber:''}};}
/** Retained blank draft. No source year, jurisdiction, amount, owner or answer is inferred. */
export function emptyGuidedPADigitalTaxRefundSources():GuidedPADigitalTaxRefundSources{return{
 sourceTaxYear:null,sourceReference:'',sourceFactsConfirmed:null,completeThroughDate:'',owner:{firstName:'',lastName:'',ssn:''},
 allVAIncomeTaxOriginalsReviewedConfirmed:null,noOtherVAIncomeCreditsPaymentsOrAssessmentsConfirmed:null,statements:[],
 filedReturn:{...originalIdentity(),returnId:'',returnKind:'',filingStatus:'',residency:'',filedOn:'',allIncomeAndAdjustmentsReviewedConfirmed:null,finalTax:'',reportedWithholding:'',totalPayments:'',overpayment:'',refundRequested:'',noOtherPaymentsCreditsOffsetsOrTransfersConfirmed:null},
 specialApplicationStatus:'unknown',specialWrittenApplication:emptyPADigitalRefundApplication(),
 agencyAward:{...originalIdentity(),awardId:'',issuedOn:'',applicationId:'',finalTaxDetermined:'',refundAwarded:'',actualAgencyDeterminationConfirmed:null},
 refund:{...originalIdentity(),postedOn:'',receivedOn:'',amount:'',confirmationNumber:'',actuallyReceivedConfirmed:null},
 account:{...originalIdentity(),completeThroughDate:'',allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed:null,noAmendmentAssessmentOrPendingAdjustmentConfirmed:null,netTaxPaymentsReported:'',unpaidTaxReported:'',overpaymentOutstandingReported:''},
};}
/** Every source edit invalidates child confirmation, while retaining private actual records. */
export function updateGuidedPADigitalTaxRefundSources(data:GuidedPADigitalTaxRefundSources,patch:Partial<GuidedPADigitalTaxRefundSources>):GuidedPADigitalTaxRefundSources{return{...data,...patch,sourceFactsConfirmed:null};}
function stable(value:unknown):string{if(Array.isArray(value))return '['+value.map(stable).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stable(v)).join(',')+'}';return JSON.stringify(value)??'null';}
/** Copies retained canonical facts only; never validates, confirms or refreshes originals. */
export function draftGuidedPADigitalTaxRefundSources(packet:PADigitalTaxRefundSources):GuidedPADigitalTaxRefundSources{const source=PADigitalTaxRefundSourcesSchema.parse(packet);return{...structuredClone(source),specialApplicationStatus:source.specialWrittenApplication?'reported':source.sourceFactsConfirmed===true?'none':'unknown',specialWrittenApplication:source.specialWrittenApplication?structuredClone(source.specialWrittenApplication):emptyPADigitalRefundApplication()};}
function canonical(raw:unknown):PADigitalTaxRefundSources{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.hasOwn(raw,'specialApplicationStatus'))return PADigitalTaxRefundSourcesSchema.parse(raw);
 const{specialApplicationStatus,...rest}=raw as Record<string,unknown>;
 if(specialApplicationStatus!=='none'&&specialApplicationStatus!=='reported')return fail('review whether an actual special written application exists; unknown is not none');
 if(specialApplicationStatus==='none'&&stable(rest.specialWrittenApplication)!==stable(emptyPADigitalRefundApplication()))return fail('reconcile retained actual special application records before choosing none; records have not been erased');
 return PADigitalTaxRefundSourcesSchema.parse({...rest,specialWrittenApplication:specialApplicationStatus==='none'?null:rest.specialWrittenApplication});
}
/** Only an explicit source action may bind fresh private original snapshots.
 * Actual agency/return/receipt facts are validated, never refreshed or invented.
 */
export function confirmGuidedPADigitalTaxRefundSources(input: TaxYearInput, facts: unknown, raw: unknown): PADigitalTaxRefundSources {
  const source = canonical(raw), actualFacts = PAOrdinaryReturnFactsSchema.parse(facts), t = input.taxpayer.primary;
  if(raw&&typeof raw==='object'&&Object.hasOwn(raw,'specialApplicationStatus')&&stable(source.owner)!==stable({firstName:t.firstName,lastName:t.lastName,ssn:t.ssn}))return fail('select the actual current primary owner from the original refund records before confirmation');
  const candidate: PADigitalTaxRefundSources = { ...source, sourceFactsConfirmed: true,
    owner: { firstName: t.firstName, lastName: t.lastName, ssn: t.ssn }, originalFederalSources: snapshotPAOrdinaryReturnOriginals(input),
    originalPAResidencySources: structuredClone(input.paResidencySources), originalPAFacts: structuredClone(actualFacts),
    statements: source.statements.map(row => ({ ...row, originalStatement: row.originalIndex === null ? undefined : structuredClone(input.form1099DA[row.originalIndex]) })),
  };
  calculatePADigitalTaxRefundSources(input, facts, candidate); return candidate;
}
/** Reads replay the exact private packet and never confirm or replace it. */
export function buildGuidedPADigitalTaxRefundSources(input: TaxYearInput, facts: unknown, raw: unknown): PADigitalTaxRefundSources {
  const source = canonical(raw); calculatePADigitalTaxRefundSources(input, facts, source); return source;
}
/** A retained web draft can be stripped only after proving its exact current confirmed pair. */
export function assertGuidedPADigitalTaxRefundPair(input:TaxYearInput,facts:unknown,raw:unknown,packet:unknown):GuidedPADigitalTaxRefundSources{
 if(!raw||typeof raw!=='object'||!Object.hasOwn(raw,'specialApplicationStatus'))return fail('retain the explicit special written application choice in the current draft');
 const source=canonical(raw),confirmed=PADigitalTaxRefundSourcesSchema.parse(packet);
 if(source.sourceFactsConfirmed!==true||confirmed.sourceFactsConfirmed!==true||stable(source)!==stable(confirmed))return fail('confirm actual matching refund draft and original packet after the last edit');
 buildGuidedPADigitalTaxRefundSources(input,facts,confirmed);return draftGuidedPADigitalTaxRefundSources(source);
}
