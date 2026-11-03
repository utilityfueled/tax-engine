import type {TaxYearInput} from '@/models/inputs';
import {PAOIDPendingOHAccountSchema,type PAOIDPendingOHAccount} from '@/models/pa-oid-pending-oh-account';
import {calculatePAOIDPendingOHAccount} from '@/engine/state/pa-oid-pending-oh-account';
const identity=()=>({state:'',sourceTaxYear:null,accountName:'',accountSsn:'',sourceReference:''});
/** Unknown retained originals. No year, owner, payment, filing or agency facts are inferred. */
export function emptyGuidedPAOIDPendingOHAccount():PAOIDPendingOHAccount{return{
 ...identity(),sourceFactsConfirmed:null,
 filedReturn:{...identity(),returnId:'',returnType:'',returnKind:'',filingStatus:'',residency:'',filedOn:'',allIncomeClassesAndAdjustmentsReviewedConfirmed:null,allNonpaymentCreditsAndUseTaxReviewedConfirmed:null,fullYearNonOHResidentConfirmed:null,noOHBusinessOrOtherSourceIncomeConfirmed:null,personalNonbusinessIntangiblesOnlyConfirmed:null,originalFederalSources:{},exactFederalAdjustedGrossIncome:'',reportedFederalAdjustedGrossIncome:'',ohioSourceIncome:'',finalTaxLiability:'',withholdingReported:'',refundRequested:''},
 payments:[],refunds:[],offsets:[],transfers:[],writeoffs:[],
 account:{...identity(),completeThroughDate:'',status:'',actualAgencyStatementConfirmed:null,allPaymentsRefundsOffsetsTransfersAndWriteoffsReviewedConfirmed:null,noAmendmentsAssessmentsOrOtherAdjustmentsConfirmed:null,grossTaxPaymentsReported:'',refundsActuallyReceivedReported:'',offsetsReported:'',transfersReported:'',writeoffsOrForfeituresReported:'',netTaxPaymentsReported:'',taxLiabilityReported:'',unpaidTaxReported:'',overpaymentOutstandingReported:''},
};}
/** Source edits retain all actual originals and clear the source confirmation. */
export function updateGuidedPAOIDPendingOHAccount(data:PAOIDPendingOHAccount,patch:Partial<PAOIDPendingOHAccount>):PAOIDPendingOHAccount{return{...data,...patch,sourceFactsConfirmed:null};}
/** Only this explicit action confirms the retained packet. It never replaces historical originals. */
export function confirmGuidedPAOIDPendingOHAccount(input:TaxYearInput,raw:unknown,asOf:string):PAOIDPendingOHAccount{const packet=PAOIDPendingOHAccountSchema.parse(raw),candidate={...packet,sourceFactsConfirmed:true};calculatePAOIDPendingOHAccount(input,candidate,asOf);return candidate;}
/** Reading revalidates every original, without refreshing historical snapshots or confirmations. */
export function buildGuidedPAOIDPendingOHAccount(input:TaxYearInput,raw:unknown,asOf:string):PAOIDPendingOHAccount{const packet=PAOIDPendingOHAccountSchema.parse(raw);calculatePAOIDPendingOHAccount(input,packet,asOf);return packet;}
