import {describe,it,expect} from "vitest";
import {Form1095ASchema,Form8962Schema,TaxYearInputSchema} from "@/models/inputs.js";
import {simpleW2Fixture} from "../fixtures/simple-w2.js";
// Spec: spec/federal/2026/ptc-source-facts.yaml
const month={month:1,enrolleePremium:"500",slcsp:"450",advancePremiumTaxCredit:"300",coverageEligible:true,incomeBasedSepEnrollment:false};
describe("Premium tax credit source facts",()=>{
 it("preserves PTC household facts and unknown optional qualifications",()=>{
  const facts={taxFamilySize:3,fplRegion:"alaska",taxpayerModifiedAGI:"-100",requiredFilingDependentsModifiedAGI:"0",householdFactsConfirmed:true,canBeClaimedAsDependent:false,belowPovertyException:"none",coverageFactsConfirmed:true,allocationRequired:false,alternativeMarriageCalculationElected:false,selfEmployedHealthInsuranceCoordinationRequired:false,qsehraAffected:false,lawfulPresenceReconciliationRequired:false,monthlyReconciliation:[month]};
  const parsed=TaxYearInputSchema.parse({...simpleW2Fixture,form8962:facts});
  expect(parsed.form8962).toEqual(facts);
  expect(Form8962Schema.parse({}).taxpayerModifiedAGI).toBeUndefined();
  expect(Form8962Schema.parse({}).canBeClaimedAsDependent).toBeUndefined();
  expect(Form8962Schema.parse({}).marriedFilingSeparatelyExceptionConfirmed).toBeUndefined();
  expect(Form8962Schema.safeParse({taxpayerModifiedAGI:"NaN"}).success).toBe(false);
 });
 it("preserves monthly PTC amounts and rejects duplicate reconciliation months",()=>{
  const actual={...month,qsehraAffordable:false,qsehraMonthlyPermittedBenefit:"50.25"};
  expect(Form8962Schema.parse({monthlyReconciliation:[actual]}).monthlyReconciliation?.[0]).toEqual(actual);
  expect(Form8962Schema.safeParse({monthlyReconciliation:[month,month]}).success).toBe(false);
  expect(Form8962Schema.safeParse({monthlyReconciliation:[{...month,slcsp:"-1"}]}).success).toBe(false);
  expect(Form8962Schema.safeParse({monthlyReconciliation:[{...month,coverageEligible:undefined}]}).success).toBe(false);
 });
 it("preserves independent zero-reported enrollment premium payment facts", () => {
  const payment = { amountPaid: "499.88", paidByUnextendedReturnDueDate: false };
  for (const evidence of [payment, { amountPaid: "499.88" }, { paidByUnextendedReturnDueDate: false }]) {
   const actual = { ...month, zeroReportedPremiumPayment: evidence };
   expect(Form8962Schema.parse({ monthlyReconciliation: [actual] }).monthlyReconciliation?.[0]).toEqual(actual);
  }
  expect(Form8962Schema.safeParse({ monthlyReconciliation: [{ ...month, zeroReportedPremiumPayment: { ...payment, amountPaid: "-1" } }] }).success).toBe(false);
 });
 it("derives statement completeness before defaults and rejects duplicate source months",()=>{
  const statement={taxYear:2026,marketplace:"Actual marketplace",policyNumber:"POLICY1",monthlyPremiums:[month]};
  expect(Form1095ASchema.parse(statement).sourceFactsComplete).toBe(true);
  const missing=Form1095ASchema.parse({...statement,sourceFactsComplete:true,monthlyPremiums:[{...month,advancePremiumTaxCredit:undefined}]});
  expect(missing.sourceFactsComplete).toBe(false);
  expect(missing.monthlyPremiums[0].advancePremiumTaxCredit).toBe("0");
  expect(Form1095ASchema.parse(missing).sourceFactsComplete).toBe(false);
  expect(Form1095ASchema.parse({...statement,taxYear:undefined}).sourceFactsComplete).toBe(false);
  expect(Form1095ASchema.parse({...statement,policyNumber:""}).sourceFactsComplete).toBe(false);
  expect(Form1095ASchema.safeParse({...statement,monthlyPremiums:[month,month]}).success).toBe(false);
  expect(Form1095ASchema.safeParse({...statement,monthlyPremiums:[]}).success).toBe(false);
 });
 it("preserves actual statement status and leaves omitted status unknown", () => {
  const statement = {taxYear: 2026, marketplace: "Actual marketplace", policyNumber: "POLICY1", monthlyPremiums: [month]};
  for (const statementStatus of ["original", "corrected", "voided"]) {
   expect(Form1095ASchema.parse({...statement, statementStatus})).toMatchObject({statementStatus, monthlyPremiums: [{advancePremiumTaxCredit: "300"}]});
  }
  expect(Form1095ASchema.parse(statement).statementStatus).toBeUndefined();
  expect(Form1095ASchema.parse({...statement, statementStatus: "voided", monthlyPremiums: []})).toMatchObject({sourceFactsComplete: false, statementStatus: "voided", monthlyPremiums: []});
  expect(Form1095ASchema.safeParse({...statement, statementStatus: "unrecognized"}).success).toBe(false);
 });
});
