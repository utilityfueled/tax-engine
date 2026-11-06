/** Spec: state/pa-orchestrator.yaml#wptc-private-review-context */
import { fictionalEmptyEicHistory } from "../fixtures/eic-disallowance.js";
import {describe,it,expect,vi,afterEach} from "vitest";
import Decimal from "decimal.js";
import type {TaxYearInput} from "@/models/inputs.js";
import type {TaxReturnResult} from "@/models/outputs.js";
import {calculateFederalTax} from "@/engine/federal.js";
import {calculatePAReturn} from "@/engine/state/pa-orchestrator.js";
import {preparePAWorkingCreditReview,assertPAWorkingCreditReview} from "@/pdf/pa-working-credit-review-context.js";
import {redactReviewIdentifiers} from "@/pdf/redact-review-identifiers.js";
import {fillPA40} from "@/pdf/fill-pa-40.js";
import * as pdfUtils from "@/pdf/pdf-utils.js";

function original():TaxYearInput {
  const input:TaxYearInput = {taxpayer:{taxYear:2025,filingStatus:"head_of_household",stateResidency:"full-year",
    primary:{firstName:"Avery",lastName:"Source",ssn:"900-70-0311",dateOfBirth:"1990-01-01",usResidencyMonths:12,employmentValidSsnIssuedByDueDate:true},
    address:{street:"1 Test Lane",city:"Harrisburg",state:"PA",zip:"17101"},
    dependents:[{firstName:"Casey",lastName:"Source",ssn:"900-70-0313",relationship:"child",dateOfBirth:"2017-06-01",monthsLivedWithYou:12,qualifiesForCTC:true,ctcSsnEligible:true,qualifiesForODC:false,qualifiesForEIC:true}]},
    w2s:[{taxYear:2025,accountHolder:"primary",employer:{name:"Source Employer",ein:"99-1234567"},wages:"19000",federalWithheld:"0",stateWages:"19000",stateTaxWithheld:"583",state:"PA"}],
    eic:{claimantEligibility:{sourceTaxYear:2025,sourceReference:"private-actual-claimant-worksheet",sourceFactsConfirmed:true,primaryNonresidentAlienDuringYear:false,primaryQualifyingChildOfAnotherTaxpayer:false},primaryIsFullTimeStudent:false},
    form1099Int:[],form1099Div:[],form1099B:[],form1099Nec:[],form1099Misc:[],form1099G:[],formW2G:[],form1099K:[],form1099C:[],scheduleK1:[],form1098:[],form1095A:[],donations:[],rentalProperties:[],savingsBondRedemptions:[],form6252:[],form8814:[],homeSales:[]};
  // Actual explicitly fictional complete no-denial/no-allowance source records.
  input.eic!.disallowanceSources=fictionalEmptyEicHistory(input.taxpayer);
  return input;
}
function saved(input=original()):TaxReturnResult {return {...calculateFederalTax(input),stateReturns:{pennsylvania:calculatePAReturn(input)}};}
const fill=fillPA40 as unknown as (input:TaxYearInput,result:TaxReturnResult,path:string,token?:unknown)=>Promise<unknown>;
afterEach(()=>vi.restoreAllMocks());

describe("PA WPTC original context",()=>{
 it("PA WPTC review binds fresh actual sources and the processing reference",()=>{
  const input=original(),result=saved(input),token=preparePAWorkingCreditReview(input);
  expect(()=>assertPAWorkingCreditReview(input,result,token)).not.toThrow();
  expect(()=>assertPAWorkingCreditReview(redactReviewIdentifiers(input),result,token)).not.toThrow();
  expect(result.stateReturns!.pennsylvania!.pa40.refundableCredits.toFixed()).toBe("0");
  const altered=original();altered.w2s[0]!.employer.name="Changed equal-dollar original";
  expect(()=>assertPAWorkingCreditReview(redactReviewIdentifiers(altered),result,token)).toThrow(/original|source|stale/i);
  expect(()=>assertPAWorkingCreditReview(redactReviewIdentifiers(altered),result,preparePAWorkingCreditReview(altered))).toThrow(/source|retained|commitment|reconcile/i);
  expect(()=>assertPAWorkingCreditReview(redactReviewIdentifiers(input),result,{} as never)).toThrow(/prepared|context/i);
 });
 it("PA WPTC rejects stripped and stale saved credit sources before template IO",async()=>{
  const input=original(),result=saved(input),token=preparePAWorkingCreditReview(input);
  const spy=vi.spyOn(pdfUtils,"loadReviewTemplate").mockRejectedValue(new Error("unexpected template IO"));
  const state=result.stateReturns!.pennsylvania!;
  for(const field of ["workingPennsylvaniansTaxCredit","workingCreditSourceCommitment","workingCreditProcessing"]){
   const changed={...result,stateReturns:{pennsylvania:{...state}}};
   delete (changed.stateReturns.pennsylvania as unknown as Record<string,unknown>)[field];
   await expect(fill(redactReviewIdentifiers(input),changed,"missing-pa-template.pdf",token)).rejects.toThrow(/source|credit|commitment|processing|reconcile/i);
   expect(spy).not.toHaveBeenCalled();
  }
  const stripped={...result,stateReturns:{pennsylvania:{...state}}};
  for(const field of ["workingPennsylvaniansTaxCredit","workingCreditSourceCommitment","workingCreditProcessing"])delete (stripped.stateReturns.pennsylvania as unknown as Record<string,unknown>)[field];
  await expect(fill(input,stripped,"missing-pa-template.pdf")).rejects.toThrow(/source|credit|commitment|processing|reconcile/i);
  expect(spy).not.toHaveBeenCalled();
  const forged={...result,stateReturns:{pennsylvania:{...state,pa40:{...state.pa40,refundableCredits:new Decimal("433")}}}};
  await expect(fill(redactReviewIdentifiers(input),forged,"missing-pa-template.pdf",token)).rejects.toThrow(/paper|unprinted|credit|reconcile/i);
  expect(spy).not.toHaveBeenCalled();
 });
 it("PA WPTC context validates source credit without qualifying unrelated payment overlays",()=>{
  const input=original(),result=saved(input),token=preparePAWorkingCreditReview(input);
  result.stateReturns!.pennsylvania=calculatePAReturn(input,{estimatedPayments:new Decimal("100")});
  // Actual existing guide payment overlay remains a distinct source path.
  expect(()=>assertPAWorkingCreditReview(redactReviewIdentifiers(input),result,token)).not.toThrow();
  const state=result.stateReturns!.pennsylvania!;
  state.workingPennsylvaniansTaxCredit!.credit=new Decimal("434");
  expect(()=>assertPAWorkingCreditReview(redactReviewIdentifiers(input),result,token)).toThrow(/source|credit|reconcile/i);
 });
});

// Spec: state/pa-orchestrator.yaml#wptc-partial-source-rejection
it("PA WPTC rejects actual originals stripped into partial mapping shape",async()=>{
  const input=original(),result=saved(input);
  delete input.eic;
  delete (input as unknown as Record<string,unknown>).form1099B;
  const state=result.stateReturns!.pennsylvania! as unknown as Record<string,unknown>;
  for(const field of ["workingPennsylvaniansTaxCredit","workingCreditSourceCommitment","workingCreditProcessing"])delete state[field];
  const spy=vi.spyOn(pdfUtils,"loadReviewTemplate").mockRejectedValue(new Error("unexpected template IO"));
  await expect(fill(input,result,"missing-pa-template.pdf")).rejects.toThrow(/actual|source|complete|canonical|original/i);
  expect(spy).not.toHaveBeenCalled();
});
