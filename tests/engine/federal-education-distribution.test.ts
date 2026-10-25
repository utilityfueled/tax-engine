// Spec: spec/federal/education-distribution-return.yaml
import { describe, expect, it, vi } from "vitest";
// Inject draft constants only for these isolated law tests; production gates stay closed.
vi.mock("@/models/constants.js",async(importOriginal)=>{
  const original=await importOriginal<typeof import("@/models/constants.js")>();
  const {FEDERAL_2026_CONSTANTS}=await import("@/models/federal-2026-indexed.js");
  return {...original,getConstants:(year:number)=>year===2026?FEDERAL_2026_CONSTANTS:original.getConstants(year)};
});
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { disqualifiedEducationSource, disqualifiedEducationSummary } from "../fixtures/education-disqualification-source.js";
const statement=(year=2026,overrides:Record<string,unknown>={})=>({sourceId:"q1",accountId:"account1",beneficiaryId:"student1",recipientOwner:"primary",taxYear:year,payerName:"Synthetic plan",accountType:"529",grossDistribution:"5300",earnings:"950",basis:"4350",isTrusteeToTrustee:false,isQtpToRoth:false,recipientNotBeneficiary:false,sourceFactsConfirmed:true,transfer:{kind:"none"},...overrides});
const expense=(year=2026,overrides:Record<string,unknown>={})=>({id:"e1",beneficiaryId:"student1",category:"postsecondary_tuition",paidDate:`${year}-08-15`,amount:"8300",refundedAmount:"0",taxFreeAssistance:"3100",educationCreditAmount:"4000",otherTaxBenefitAmount:"0",qualificationConfirmed:true,...overrides});
const facts=(year=2026,overrides:Record<string,unknown>={})=>({taxYear:year,sourceFactsConfirmed:true,allDistributionsReconciled:true,beneficiaries:[{id:"student1",name:"Jane Doe",studentTaxId:"123456789",outsideK12QualifiedDistributions:"0"}],expenses:[expense(year)],allocations:[{expenseId:"e1",sourceId:"q1",amount:"1200",creditAmount:"4000"}],loanBorrowers:[],coverdellAccounts:[],penaltyExceptions:[],...overrides});
const student={name:"Jane Doe",studentTaxId:"123456789",studentRole:"primary",qualifiedExpenses:"4000",studentSsnEligible:true,studentTinEligible:true,institutionEligible:true,expensesEligibilityConfirmed:true,form1098TRequirementMet:true,institutionEin:"123456789",priorYearsClaimed:0,completedFirstFourYearsBeforeYear:false,enrolledAtLeastHalfTime:true,pursuingDegreeOrCredential:true,felonyDrugConviction:false};
const education={primarySsnEligible:true,primaryTinEligible:true,claimedAsDependent:false,nonresidentAlien:false,aocBanInEffect:false,form8862Required:false,possessionIncomeExclusion:"0",aocStudents:[student],llcExpenses:"0"};
const raw=(year=2026)=>({...simpleW2Fixture,taxpayer:{...simpleW2Fixture.taxpayer,taxYear:year},w2s:[{...simpleW2Fixture.w2s[0],wages:"50000",socialSecurityWages:"50000",socialSecurityWithheld:"3100",socialSecurityTips:"0",medicareWages:"50000",medicareWithheld:"725",box12:[]}],form1099Q:[statement(year)],qualifiedEducationExpenses:{sourceFacts:facts(year)},educationExpenses:education});
const calculate=(value:unknown)=>calculateFederalTax(TaxYearInputSchema.parse(value));
describe("Federal education distribution source integration",()=>{
  it("routes bounded whole-account disqualification once for actual recipients",()=>{
    for (const year of [2025,2026]) {
      const input={...raw(year),educationExpenses:undefined,form1099Q:[disqualifiedEducationSource({taxYear:year,prohibitedTransactionDate:`${year}-06-01`})],qualifiedEducationExpenses:disqualifiedEducationSummary({taxYear:year})};
      const result=calculate(input);
      expect(result.form1099Q?.taxableEarnings.toFixed()).toBe("300");
      expect(result.form1099Q?.netPenalty.toFixed()).toBe("30");
      expect(result.agi.toFixed()).toBe("50300");
      expect(result.allLines.filter(line=>line.form==="Sched 1"&&line.line==="8z")).toHaveLength(1);
      expect(result.allLines.find(line=>line.form==="Sched 1"&&line.line==="8z")?.value.toFixed()).toBe("300");
      expect(result.allLines.find(line=>line.form==="Form5329 education"&&line.line==="primary:primary:8")?.value.toFixed()).toBe("30");
      const other=calculate({...input,form1099Q:[{...input.form1099Q[0],recipientOwner:"other",recipientId:"actual-beneficiary"}]});
      expect(other.agi.toFixed()).toBe("50000");
      expect(other.form1099Q?.netPenalty.isZero()).toBe(true);
    }
  });
  it("uses actual return year for the2026 K12 cap and preserves unknown sources",()=>{
    const input={...raw(),educationExpenses:undefined,form1099Q:[statement(2026,{grossDistribution:"20000",earnings:"4000",basis:"16000"})],qualifiedEducationExpenses:{sourceFacts:facts(2026,{expenses:[expense(2026,{category:"k12_tuition",amount:"20000",taxFreeAssistance:"0",educationCreditAmount:"0"})],allocations:[{expenseId:"e1",sourceId:"q1",amount:"20000",creditAmount:"0"}]})}};
    const result=calculate(input);
    expect(result.form1099Q?.taxYear).toBe(2026);expect(result.form1099Q?.adjustedQEE.toString()).toBe("20000");expect(result.form1099Q?.taxableEarnings.toString()).toBe("0");
    expect(()=>calculate({...input,qualifiedEducationExpenses:undefined})).toThrow(/source|actual/i);
  });
  it("routes the published credit-coordination example once for actual return recipients",()=>{
    const result=calculate({...raw(),form1099Q:[statement(),statement(2026,{sourceId:"q2",accountId:"account2",recipientOwner:"other",recipientId:"external-student",grossDistribution:"1000",earnings:"200",basis:"800"})]});
    expect(result.form1099Q?.taxableEarnings.toString()).toBe("735");expect(result.otherIncome.toString()).toBe("735");expect(result.agi.toString()).toBe("50735");
    expect(result.form1099Q?.netPenalty.toString()).toBe("2");expect(result.form1099Q?.perRecipient.find(item=>item.owner==="other")?.taxableEarnings.toString()).toBe("200");
    expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("2500");expect(result.form8863?.totalRefundable.toString()).toBe("1000");
    expect(result.allLines.filter(line=>line.form==="Sched 1"&&line.line==="8z").at(-1)?.value.toString()).toBe("735");
    expect(()=>calculate({...raw(),form1099Q:[statement(2026,{recipientOwner:"spouse"})]})).toThrow(/spouse|joint/i);
  });
  it("rejects a source credit allocation without an actual claimed student",()=>{
    expect(()=>calculate({...raw(2025),educationExpenses:undefined})).toThrow(/credit.*student|student.*credit/i);
  });
  it("rejects a taxed allocation when the actual linked credit is zero",()=>{
    const input=raw(2025);
    expect(()=>calculate({...input,w2s:[{...input.w2s[0],wages:"100000",federalWithheld:"25000"}]})).toThrow(/allocation.*credit|credit.*allocation/i);
    expect(()=>calculate({...input,w2s:[{...input.w2s[0],wages:"1000"}],educationExpenses:{...education,aocStudents:[],llcExpenses:"4000",llcStudents:[{...student,courseEligibilityConfirmed:true}]}})).toThrow(/allocation.*credit|credit.*allocation/i);
  });
  it("validates an outside recipient's credit allocation without moving their income onto this return",()=>{
    const input={...raw(2025),form1099Q:[statement(2025,{recipientOwner:"other",recipientId:"external-account-owner",recipientNotBeneficiary:true})]};
    expect(()=>calculate({...input,w2s:[{...input.w2s[0],wages:"100000",federalWithheld:"25000"}]})).toThrow(/allocation.*credit|credit.*allocation/i);
    const result=calculate(input);
    expect(result.form1099Q?.creditAllocations[0]?.taxableEarningsCausedByCredit.toString()).toBe("717");
    expect(result.form1099Q?.perRecipient.find(item=>item.owner==="other")?.taxableEarnings.toString()).toBe("735");
    expect(result.form1099Q?.taxableEarnings.toString()).toBe("0");
    expect(result.form1099Q?.netPenalty.toString()).toBe("0");
    expect(result.otherIncome.toString()).toBe("0");
    expect(result.agi.toString()).toBe("50000");
    expect(result.form8863?.aocAfterPhaseOut.toString()).toBe("2500");
  });
  it("does not use another LLC student to validate an ineligible allocation",()=>{
    expect(()=>calculate({...raw(2025),educationExpenses:{...education,aocStudents:[],llcExpenses:"6000",llcStudents:[{...student,courseEligibilityConfirmed:false},{...student,name:"Other student",studentTaxId:"111223333",studentRole:"dependent",qualifiedExpenses:"2000",courseEligibilityConfirmed:true}]}})).toThrow(/allocation.*credit|credit.*allocation/i);
  });
  it("refuses ambiguous legacy PartII totals alongside actual education sources",()=>{
    expect(()=>calculate({...raw(2025),form5329:{educationAccountDistributionsIncludedInIncome:"735",educationAccountDistributionsExcepted:"717"}})).toThrow(/education.*source|source.*education/i);
    const knownZero=calculate({...raw(2025),form5329:{educationAccountDistributionsIncludedInIncome:"0",educationAccountDistributionsExcepted:"0"}});
    expect(knownZero.form1099Q?.netPenalty.toString()).toBe("2");
  });
  it("requires actual loan sources when529 excluded earnings overlap a loan-interest claim",()=>{
    const source=facts(2025,{expenses:[expense(2025,{category:"student_loan",amount:"10000",taxFreeAssistance:"0",educationCreditAmount:"0",borrowerId:"borrower1",beneficiaryOrSibling:true,studentLoanInterestAmount:"1000",studentLoanInterestDeducted:"800"})],allocations:[{expenseId:"e1",sourceId:"q1",amount:"10000",creditAmount:"0",loanInterestAmount:"1000"}],loanBorrowers:[{id:"borrower1",owner:"primary",priorQualifiedDistributions:"0",otherCurrentQualifiedDistributions:"0"}]});
    expect(()=>calculate({...raw(2025),educationExpenses:undefined,adjustments:{studentLoanInterest:"1000"},form1099Q:[statement(2025,{grossDistribution:"10000",earnings:"2000",basis:"8000"})],qualifiedEducationExpenses:{sourceFacts:source}})).toThrow(/loan.*source|source.*loan/i);
  });
});
