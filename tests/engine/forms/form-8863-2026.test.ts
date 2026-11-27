import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { calculateForm8863, type Form8863Input } from "@/engine/forms/form-8863.js";
import { EducationExpensesSchema } from "@/models/inputs.js";
const d = (v: Decimal.Value) => new Decimal(v);
// Spec: spec/federal/form-8863.yaml
const student = () => ({name:"Actual Student",studentTaxId:"111-22-3333",studentRole:"dependent" as const,qualifiedExpenses:d(4000),studentSsnEligible:true,institutionEin:"12-3456789",priorYearsClaimed:0,completedFirstFourYearsBeforeYear:false,enrolledAtLeastHalfTime:true,pursuingDegreeOrCredential:true,felonyDrugConviction:false,institutionEligible:true,expensesEligibilityConfirmed:true,form1098TRequirementMet:true});
const make = (overrides:Partial<Form8863Input>={}):Form8863Input => ({taxYear:2026,aocStudents:[student()],llcExpenses:d(0),magi:d(50000),filingStatus:"single",taxLiabilityLimit:d(10000),primarySsnEligible:true,canBeClaimedAsDependent:false,claimedAsDependent:false,nonresidentAlien:false,aocBanInEffect:false,form8862Required:false,primaryAgeAtYearEnd:40,...overrides});
describe("Form8863 actual2026 facts",()=>{
 it("rejects contradictory 2026 student SSN and timely TIN answers", () => {
  const adult = { ...student(), studentRole: "spouse" as const, studentTinEligible: false };
  const input = make({ filingStatus: "married_filing_jointly", spouseSsnEligible: true, aocStudents: [adult] });
  expect(() => calculateForm8863(input)).toThrow(/SSN.*timely TIN/i);
  expect(() => calculateForm8863({ ...input, claimedAsDependent: true })).toThrow(/SSN.*timely TIN/i);
  expect(calculateForm8863({ ...input, aocStudents: [{ ...adult, studentSsnEligible: false }] }).aocTotalTentative.toFixed()).toBe("0");
  expect(calculateForm8863({ ...input, spouseSsnEligible: false, aocStudents: [{ ...adult, studentSsnEligible: false, studentTinEligible: true }] }).aocTotalTentative.toFixed()).toBe("2500");
 });
 it("requires actual 2026 student facts and allows only one credit per student",()=>{
  expect(()=>calculateForm8863(make({aocStudents:[{...student(),enrolledAtLeastHalfTime:undefined}]}))).toThrow(/half|student facts/i);
  expect(()=>calculateForm8863(make({aocStudents:[student(),student()]}))).toThrow(/duplicate|one credit/i);
  expect(()=>calculateForm8863(make({llcStudents:[{...student(),courseEligibilityConfirmed:true}],llcExpenses:d(4000)}))).toThrow(/one credit|duplicate/i);
  expect(calculateForm8863(make({aocStudents:[{...student(),felonyDrugConviction:true}]})).aocTotalTentative.toString()).toBe("0");
  expect(calculateForm8863(make({aocStudents:[{...student(),priorYearsClaimed:4}]})).aocTotalTentative.toString()).toBe("0");
 });
 it("holds a missing EIN on a second supplied AOTC school", () => {
  const firstSchool = { name: "First College", address: "1 College Road", ein: "12-3456789", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false };
  const secondSchool = { name: "Second College", address: "2 College Road", receivedCurrentYear1098T: false, receivedPriorYear1098TWithBox7: false };
  const input = (ein?: string) => make({ aocStudents: [{ ...student(), institutions: [firstSchool, { ...secondSchool, ein }] }] });
  expect(() => calculateForm8863(input())).toThrow(/EIN/);
  expect(() => calculateForm8863(input("98-76-54321"))).toThrow(/EIN/);
  expect(calculateForm8863(input("98-7654321")).aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(() => calculateForm8863(make({ aocStudents: [{ ...student(), institutions: [], institutionEin: "12-3456789" }] }))).toThrow(/matching.*EIN/i);
  expect(() => calculateForm8863(make({ aocStudents: [{ ...student(), institutions: [firstSchool], institutionEin: "98-7654321" }] }))).toThrow(/matching.*EIN/i);
  const ineligible = make({ aocStudents: [{ ...student(), priorYearsClaimed: 4, institutions: [firstSchool, { ...secondSchool, ein: undefined }] }] });
  expect(calculateForm8863(ineligible).aocAfterPhaseOut.toFixed()).toBe("0");
  expect(calculateForm8863({ ...input(), magi: d(89999) }).aocAfterPhaseOut.toFixed()).toBe("0");
  const additionalStudent = { ...student(), studentTaxId: "222-33-4444" };
  const atRoundingBoundary = (ein?: string) => {
    const facts = input(ein);
    return { ...facts, magi: d(89999), aocStudents: [...facts.aocStudents, additionalStudent] };
  };
  expect(() => calculateForm8863(atRoundingBoundary())).toThrow(/EIN/);
  expect(calculateForm8863(atRoundingBoundary("98-7654321")).aocAfterPhaseOut.toFixed()).toBe("1");
 });
 it("validates supplied 2025 school EINs without requiring a duplicate summary", () => {
  const firstSchool = { ein: "12-3456789" };
  const make2025 = (ein?: string, institutionEin?: string) => make({ taxYear: 2025,
   requireAocPriorClaimHistory: true, aocStudents: [{ ...student(), institutionEin, institutions: [firstSchool, { ein }] }] });
  expect(() => calculateForm8863(make2025())).toThrow(/EIN/);
  expect(calculateForm8863(make2025("98-7654321")).aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(calculateForm8863(make2025("98-7654321", "987654321")).aocAfterPhaseOut.toFixed()).toBe("2500");
  expect(() => calculateForm8863(make2025("98-7654321", "90-7654321"))).toThrow(/matching.*EIN/i);
  expect(() => calculateForm8863(make2025("98-7654321", "--"))).toThrow(/matching.*EIN/i);
  expect(() => calculateForm8863(make2025("98-7654321", "98--7654321"))).toThrow(/matching.*EIN/i);
 });
 it("permits one joint spouse SSN and requires dependent student employment eligibility",()=>{
  expect(calculateForm8863(make({filingStatus:"married_filing_jointly",primarySsnEligible:false,spouseSsnEligible:true})).aocAfterPhaseOut.toString()).toBe("2500");
  expect(calculateForm8863(make({primarySsnEligible:false})).aocAfterPhaseOut.toString()).toBe("0");
  expect(calculateForm8863(make({aocStudents:[{...student(),studentSsnEligible:false}]})).aocAfterPhaseOut.toString()).toBe("0");
  expect(calculateForm8863(make({filingStatus:"married_filing_jointly",primarySsnEligible:true,spouseSsnEligible:false,aocStudents:[{...student(),studentRole:"spouse",studentSsnEligible:false,studentTinEligible:true}]})).aocAfterPhaseOut.toString()).toBe("2500");
 });
 it("uses claimant age and support facts for refundable AOC with exact half-support boundary",()=>{
  const facts={fullTimeStudent:true,earnedIncome:d(9999),totalSupport:d(20000),parentAlive:true};
  const result=calculateForm8863(make({primaryAgeAtYearEnd:23,refundableAocFacts:facts}));
  expect(result.aocRefundable.toString()).toBe("0");expect(result.aocNonrefundable.toString()).toBe("2500");
  expect(calculateForm8863(make({primaryAgeAtYearEnd:23,refundableAocFacts:{...facts,earnedIncome:d(10000)}})).aocRefundable.toString()).toBe("1000");
  expect(calculateForm8863(make({primaryAgeAtYearEnd:23,refundableAocFacts:{...facts,fullTimeStudent:false}})).aocRefundable.toString()).toBe("1000");
  expect(calculateForm8863(make({primaryAgeAtYearEnd:17,refundableAocFacts:{...facts,earnedIncome:d(30000)}})).aocRefundable.toString()).toBe("0");
  expect(calculateForm8863(make({primaryAgeAtYearEnd:17,refundableAocFacts:{...facts,parentAlive:false}})).aocRefundable.toString()).toBe("1000");
  expect(()=>calculateForm8863(make({primaryAgeAtYearEnd:23}))).toThrow(/support|refund/i);
 });
 it("requires actual LLC students and applies 2026 dependent SSN rules",()=>{
  expect(()=>calculateForm8863(make({aocStudents:[],llcExpenses:d(10000)}))).toThrow(/LLC.*student/i);
  const llc={...student(),studentTaxId:"222-33-4444",qualifiedExpenses:d(10000),courseEligibilityConfirmed:true};
  expect(calculateForm8863(make({aocStudents:[],llcStudents:[llc],llcExpenses:d(10000)})).llcAfterPhaseOut.toString()).toBe("2000");
  expect(calculateForm8863(make({aocStudents:[],llcStudents:[{...llc,studentSsnEligible:false}],llcExpenses:d(10000)})).llcAfterPhaseOut.toString()).toBe("0");
  expect(()=>calculateForm8863(make({aocStudents:[],llcStudents:[llc],llcExpenses:d(9999)}))).toThrow(/reconcil/i);
 });
 it("audits every printed calculation and applies the actual nonrefundable limit",()=>{
  const result=calculateForm8863(make({magi:d(85000),taxLiabilityLimit:d(500),llcStudents:[{...student(),studentTaxId:"222-33-4444",qualifiedExpenses:d(10000),courseEligibilityConfirmed:true}],llcExpenses:d(10000)}));
  const expected:Record<string,string>={"1":"2500","2":"90000","3":"85000","4":"5000","5":"10000","6":"0.5","7":"1250","8":"500","9":"750","10":"10000","11":"10000","12":"2000","13":"90000","14":"85000","15":"5000","16":"10000","17":"0.5","18":"1000","19":"500"};
  for(const [line,value] of Object.entries(expected)) expect(result.lines.find(l=>l.form==="Form 8863"&&l.line===line)?.value.toString(),line).toBe(value);
  expect(result.totalNonrefundable.toString()).toBe("500");expect(result.nonrefundableBeforeLimit.toString()).toBe("1750");expect(result.totalRefundable.toString()).toBe("500");
  expect(()=>calculateForm8863(make({taxLiabilityLimit:undefined}))).toThrow(/tax.*limit/i);
 });
 it("preserves actual student and claimant facts through the input schema",()=>{
  const input={...student(),qualifiedExpenses:"4000"};
  const parsed=EducationExpensesSchema.parse({canBeClaimedAsDependent:false,nonresidentAlien:false,aocBanInEffect:false,form8862Required:false,possessionIncomeExclusion:"500",aocStudents:[input],llcStudents:[{...input,studentTaxId:"222-33-4444",courseEligibilityConfirmed:true}],refundableAocFacts:{fullTimeStudent:true,earnedIncome:"10000",totalSupport:"20000",parentAlive:true}});
  expect(parsed.aocStudents[0].studentTaxId).toBe("111-22-3333");expect(parsed.llcStudents?.[0].courseEligibilityConfirmed).toBe(true);expect(parsed.refundableAocFacts?.earnedIncome).toBe("10000");expect(parsed.canBeClaimedAsDependent).toBe(false);
 });
 it("rejects negative or nonfinite amounts and known claimant ineligibility",()=>{
  expect(()=>calculateForm8863(make({llcExpenses:d(-1)}))).toThrow(/nonnegative/i);
  expect(()=>calculateForm8863(make({magi:d("NaN")}))).toThrow(/finite/i);
  expect(calculateForm8863(make({claimedAsDependent:true})).totalRefundable.toString()).toBe("0");
  expect(calculateForm8863(make({nonresidentAlien:true})).totalNonrefundable.toString()).toBe("0");
  expect(calculateForm8863(make({aocBanInEffect:true})).aocAfterPhaseOut.toString()).toBe("0");
  expect(()=>calculateForm8863(make({form8862Required:true}))).toThrow(/8862/i);
 });
 it.each(["AOTC", "LLC"])("requires the actual resident election for a positive nonresident joint %s claim", (claim) => {
  const input = make({
   filingStatus: "married_filing_jointly",
   nonresidentAlien: true,
   ...(claim === "LLC" ? {
    primarySsnEligible: false, spouseSsnEligible: true,
    aocStudents: [], llcExpenses: d(4000), llcStudents: [{ ...student(), courseEligibilityConfirmed: true }],
   } : {}),
  });
  expect(() => calculateForm8863(input)).toThrow(/actual.*joint resident election/i);
  const no = calculateForm8863({ ...input, residentJointElection: false });
  expect(no.totalNonrefundable.toFixed()).toBe("0");
  expect(no.totalRefundable.toFixed()).toBe("0");
  const yes = calculateForm8863({ ...input, residentJointElection: true });
  expect(yes.totalNonrefundable.toFixed()).toBe(claim === "LLC" ? "800" : "1500");
  expect(yes.totalRefundable.toFixed()).toBe(claim === "LLC" ? "0" : "1000");
 });
 it("preserves cases without an applicable 2026 joint resident election", () => {
  const input = make({ filingStatus: "married_filing_jointly", nonresidentAlien: true });
  for (const overrides of [
   { aocStudents: [{ ...student(), qualifiedExpenses: d(0) }] },
   { taxYear: 2025 },
   { filingStatus: "single" as const },
   { claimedAsDependent: true },
   { primarySsnEligible: false, spouseSsnEligible: false },
   { magi: d(180000) },
  ]) {
   const result = calculateForm8863({ ...input, ...overrides });
   expect(result.totalNonrefundable.toFixed()).toBe("0");
   expect(result.totalRefundable.toFixed()).toBe("0");
  }
  expect(calculateForm8863({ ...input, nonresidentAlien: false }).totalRefundable.toFixed()).toBe("1000");
 });
 it.each([
  ["completedFirstFourYearsBeforeYear",true],["enrolledAtLeastHalfTime",false],["pursuingDegreeOrCredential",false],["institutionEligible",false],["expensesEligibilityConfirmed",false],["form1098TRequirementMet",false],
 ])("denies AOC when actual %s is ineligible",(field,value)=>{
  expect(calculateForm8863(make({aocStudents:[{...student(),[field]:value}]})).aocTotalTentative.toString()).toBe("0");
 });
 it("does not apply the2026 employment-SSN restriction to a timely2025 ITIN",()=>{
  expect(calculateForm8863(make({taxYear:2025,primarySsnEligible:false,primaryTinEligible:true,aocStudents:[{...student(),studentSsnEligible:false,studentTinEligible:true}]})).aocAfterPhaseOut.toString()).toBe("2500");
  expect(calculateForm8863(make({taxYear:2025,primaryTinEligible:false})).aocAfterPhaseOut.toString()).toBe("0");
 });

 it("distinguishes an actual dependent claim and enforces timely LLC student TIN",()=>{
  const unclaimed=make({canBeClaimedAsDependent:true,claimedAsDependent:false});
  expect(calculateForm8863(unclaimed).aocAfterPhaseOut.toString()).toBe("2500");
  expect(calculateForm8863({...unclaimed,claimedAsDependent:true}).aocAfterPhaseOut.toString()).toBe("0");
  const llc={...student(),studentTinEligible:false,courseEligibilityConfirmed:true};
  expect(calculateForm8863(make({taxYear:2025,aocStudents:[],llcExpenses:d(4000),llcStudents:[llc]})).llcAfterPhaseOut.toString()).toBe("0");
 });

});
