// Spec: spec/federal/form-2555-source-binding.yaml, actual-business-expense-allocation.
import { expect,it } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";
function source() {
  return { taxYear: 2025, accountHolder: "primary", foreignEarnedIncome: "120000", qualifyingDays: 365, totalDaysInYear: 365,
    qualifiedHousingExpenses: "0", isSelfEmployed: false, sourceFactsConfirmed: true, eligibilityConfirmed: true, electionsValidConfirmed: true,
    claimForeignEarnedIncomeExclusion: true, claimHousingExclusionOrDeduction: false, housingExpensesQualificationConfirmed: true,
    employerProvidedForeignEarnedIncome: "120000", deductionsAllocableToExcludedIncome: "0", foreignEarnedIncomeTaxWorksheetDisallowedDeductions: "0",
    priorYearHousingDeductionCarryover: "0", priorYearIncomeExclusion: "0", incomeSourceMappingConfirmed: true,
    partIV: { wages: "120000", businessPersonalServices: "0", partnershipPersonalServices: "0", noncashLodging: "0", noncashMeals: "0", noncashCar: "0", noncashOther: "0", allowanceCostOfLiving: "0", allowanceFamily: "0", allowanceEducation: "0", allowanceHomeLeave: "0", allowanceQuarters: "0", allowanceOther: "0", otherEarnedIncome: "0", section119MealsAndLodging: "0" },
    incomeSources: { foreignEmploymentIncomeIncludedOnW2: "120000", foreignEmploymentIncomeNotOnW2: "0", foreignBusinessIncomeAlreadyReported: "0", foreignPartnershipIncomeAlreadyReported: "0", otherForeignIncomeAlreadyReported: "0" },
    sourceMapping: { sourceReference: "Actual foreign-service payroll ledger", sourceFactsConfirmed: true, allSourcesIncluded: true, oneOwnerOnlyConfirmed: true,
      rows: [{ sourceId: "formW2:0", sourceTaxYear: 2025, accountHolder: "primary", sourceReference: "Original employer W2 and foreign-service allocation", payerName: "Actual Employer", payerEin: "12-3456789", foreignEarnedIncome: "120000", priorYearIncomeReceived: "0" }] } };
}
function businessReturn(foreign: string, allocable: string, patch: Record<string, unknown> = {}, wages = false) {
  const form = source(), gross = (patch.grossReceipts as string | undefined) ?? "100000";
  Object.assign(form, { foreignEarnedIncome: foreign, isSelfEmployed: true, employerProvidedForeignEarnedIncome: "0", partIV: { ...form.partIV, wages: "0", businessPersonalServices: foreign },
    incomeSources: { ...form.incomeSources, foreignEmploymentIncomeIncludedOnW2: "0", foreignBusinessIncomeAlreadyReported: foreign }, deductionsAllocableToExcludedIncome: allocable });
  form.sourceMapping.rows = [{ ...form.sourceMapping.rows[0]!, sourceId: "scheduleC", payerName: "Actual Services", payerEin: "12-3456789", foreignEarnedIncome: foreign, businessGrossReceipts: gross, businessReturnsAndAllowances: "0", businessCostOfGoodsSold: "0", businessOtherIncome: "0", capitalMaterialIncomeFactor: false } as never];
  return TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: wages ? simpleW2Fixture.w2s : [], form2555: form,
    scheduleC: { accountHolder: "primary", businessName: "Actual Services", ein: "12-3456789", grossReceipts: gross, returnsAndAllowances: "0", costOfGoodsSold: "0", otherIncome: "0", materialParticipation: true, qbiMateriallyParticipated: true, ...patch } });
}

it("preserves actual foreign expenses and pro rata mixed sources",()=>{
 const value=businessReturn("50000","31413",{grossReceipts:"200000",expenses:{supplies:"100000"}});
 Object.assign(value.form2555!.sourceMapping!.rows[0]!,{foreignBusinessExpenses:"30000",foreignBusinessExpenseSourceReference:"Actual dated foreign expense ledger",foreignBusinessExpensesConfirmed:true});
 const r=calculateFederalTax(value);
 expect(r.form2555!.netExclusion.toFixed()).toBe("18587");
 // Foreign profit is20000, not gross-proportional25000. Its SE deduction share1413 plus expenses30000 is31413.
 const tooSmall=structuredClone(value); tooSmall.form2555!.deductionsAllocableToExcludedIncome="31412";
 expect(()=>calculateFederalTax(tooSmall)).toThrow(/at least 31413/);
 value.form2555!.deductionsAllocableToExcludedIncome="31413";
 expect(calculateFederalTax(value).form2555!.netExclusion.toFixed()).toBe("18587");
});
it("rejects missing contradictory and unknown actual source records",()=>{
 const value=businessReturn("50000","50000",{grossReceipts:"200000",expenses:{supplies:"100000"}});
 expect(()=>calculateFederalTax(value)).toThrow(/actual foreign business expenses/i);
 for(const patch of [{foreignBusinessExpenses:"100001"},{foreignBusinessExpenses:"50000.01"},{foreignBusinessExpenses:"30000",foreignBusinessExpensesConfirmed:false},{foreignBusinessExpenses:"30000",foreignBusinessExpenseSourceReference:""}]){
  const v=structuredClone(value); Object.assign(v.form2555!.sourceMapping!.rows[0]!,{foreignBusinessExpenses:"30000",foreignBusinessExpenseSourceReference:"Actual ledger",foreignBusinessExpensesConfirmed:true,...patch});
  expect(()=>calculateFederalTax(v)).toThrow();
 }
 const unknown=businessReturn("100000","7065"); delete unknown.form2555!.sourceMapping!.rows[0]!.capitalMaterialIncomeFactor;
 expect(()=>calculateFederalTax(unknown)).toThrow(/capital.*unknown/i);
});
it("preserves negative line45 instead of capping actual disallowed deductions",()=>{
 const value=businessReturn("2787","3355",{grossReceipts:"200000",expenses:{supplies:"190000"}});
 Object.assign(value.form2555!.sourceMapping!.rows[0]!,{capitalMaterialIncomeFactor:true,reasonableServicesAllowance:"3000",reasonableAllowanceConfirmed:true,allBusinessIncomeForeignConfirmed:true});
 const r=calculateFederalTax(value);
 expect(r.form2555!.netExclusion.toFixed()).toBe("-568");
 expect(r.agi.toFixed()).toBe("9861");
 // Actual reported SE deduction707 times fullFEIE/FEI=707, plus2647.65 expenses =>3354.65; report3355.
 const exact=structuredClone(value);exact.form2555!.deductionsAllocableToExcludedIncome="3354.65";expect(calculateFederalTax(exact).form2555!.netExclusion.toFixed()).toBe("-568");
 const below=structuredClone(value);below.form2555!.deductionsAllocableToExcludedIncome="3354.49";expect(()=>calculateFederalTax(below)).toThrow(/at least 3355/);
 const low=structuredClone(value);low.form2555!.deductionsAllocableToExcludedIncome="2787";
 expect(()=>calculateFederalTax(low)).toThrow(/at least 3355/);
});

it("binds signed worksheet sources and rejects altered or unbound negatives",async()=>{
 const { resolveForm2555WorksheetAddback }=await import("@/engine/forms/form-2555-worksheet-source.js");
 const { calculateForm2555 }=await import("@/engine/forms/form-2555.js");
 const { getConstants }=await import("@/models/constants.js");
 const { d }=await import("@/utils/decimal.js");
 const value=businessReturn("2787","3355");
 const source=calculateForm2555(value.form2555!,getConstants(2025));
 expect(resolveForm2555WorksheetAddback(d("-568"),d(0),source).toFixed()).toBe("-568");
 expect(()=>resolveForm2555WorksheetAddback(d("-568"),d(0))).toThrow(/source/);
 expect(()=>resolveForm2555WorksheetAddback(d("-568"),d(0),{...source,sourceFactsVerified:false})).toThrow(/source/);
 expect(()=>resolveForm2555WorksheetAddback(d("-567"),d(0),source)).toThrow(/source/);
 expect(()=>resolveForm2555WorksheetAddback(d(0),d(0),source)).toThrow(/source/);
 expect(()=>resolveForm2555WorksheetAddback(d("-568"),d(0),source,2026)).toThrow(/source/);
 expect(()=>resolveForm2555WorksheetAddback(d("-568"),d(0),{...source,priorYearIncomeExclusion:d(1)})).toThrow(/source/);
 const duplicate={...source,lines:[...source.lines,source.lines.find(l=>l.form==="2555"&&l.line==="45")!]};
 expect(()=>resolveForm2555WorksheetAddback(d("-568"),d(0),duplicate)).toThrow(/source/);
});

it("copies signed source amounts into child adoption and premium-credit MAGI worksheets",async()=>{
 const {calculateForm2555}=await import("@/engine/forms/form-2555.js");const {getConstants}=await import("@/models/constants.js");const {d}=await import("@/utils/decimal.js");
 const {calculateForm8812}=await import("@/engine/forms/form-8812.js");
 const {calculateForm8839}=await import("@/engine/forms/form-8839.js");
 const {calculatePremiumTaxCreditReturn}=await import("@/engine/forms/premium-tax-credit-return.js");
 const constants=getConstants(2025),value=businessReturn("2787","3355"),source=calculateForm2555(value.form2555!,constants);
 const credit={taxYear:2025,qualifyingChildren:1,otherDependents:0,agi:d("9293"),adjustedGrossIncome:d("9861"),foreignExcludedIncome:d("-568"),puertoRicoExcludedIncome:d(0),form4563ExcludedIncome:d(0),earnedIncome:d("9293"),taxLiability:d("1000"),filingStatus:"single" as const,filesForm2555:true,form2555Source:source};
 const child=calculateForm8812(credit,constants);
 expect(child.lines.find(l=>l.line==="3")!.value.toFixed()).toBe("9293");expect(child.actc.toFixed()).toBe("0");
 expect(()=>calculateForm8812({...credit,form2555Source:undefined},constants)).toThrow(/source/);
 const adoption={taxYear:2025,filingStatus:"single" as const,agi:d("9861"),children:[],foreignEarnedIncomeExclusion:d("-568"),foreignHousingExclusion:d(0),constants:constants.adoptionCredit,form2555Source:source};
 expect(calculateForm8839(adoption).magi.toFixed()).toBe("9293");
 expect(()=>calculateForm8839({...adoption,form2555Source:undefined})).toThrow(/source/);
 const ptc={input:value,agi:d("9861"),taxExemptInterest:d(0),foreignIncomeReduction:d("-568"),foreignHousingDeduction:d(0),socialSecurityBenefitsGross:d(0),socialSecurityBenefitsTaxable:d(0),form2555Source:source};
 expect(calculatePremiumTaxCreditReturn(ptc).canonicalTaxpayerModifiedAGI.toFixed()).toBe("9293");
 expect(()=>calculatePremiumTaxCreditReturn({...ptc,form2555Source:undefined})).toThrow(/source/);
});

it("matches Publication54 Example4 signed form arithmetic",async()=>{
 const {calculateForm2555}=await import("@/engine/forms/form-2555.js");const {getConstants}=await import("@/models/constants.js");
 const value=businessReturn("77000","90713",{grossReceipts:"146000",expenses:{supplies:"172000"}});
 const result=calculateForm2555(value.form2555!,getConstants(2025));
 expect(result.totalExclusion.toFixed()).toBe("77000");expect(result.netExclusion.toFixed()).toBe("-13713");
 // This form-level example does not enable the separate loss/QBI return source method.
});


it("rejects positive foreign expenses on a zero foreign receipt source",()=>{
 const value=businessReturn("0","10",{expenses:{supplies:"10"}},true);
 const zeroBusiness=value.form2555!.sourceMapping!.rows[0]!;
 Object.assign(zeroBusiness,{foreignBusinessExpenses:"10",foreignBusinessExpenseSourceReference:"Actual business expense ledger",foreignBusinessExpensesConfirmed:true});
 value.w2s[0]!.accountHolder="primary";value.w2s[0]!.taxYear=2025;
 const wageSource=source(); wageSource.sourceMapping.rows[0]!.foreignEarnedIncome="50000";wageSource.sourceMapping.rows[0]!.payerName="Tech Corp";
 Object.assign(value.form2555!,{...wageSource,foreignEarnedIncome:"50000",employerProvidedForeignEarnedIncome:"50000",isSelfEmployed:true,partIV:{...wageSource.partIV,wages:"50000"},incomeSources:{...wageSource.incomeSources,foreignEmploymentIncomeIncludedOnW2:"50000"},sourceMapping:{...wageSource.sourceMapping,rows:[wageSource.sourceMapping.rows[0]!,zeroBusiness]}});
 expect(()=>calculateFederalTax(value)).toThrow(/foreign business expenses.*foreign.*receipts/i);
});


it("names the separate signed Form7206 business attribution method",async()=>{
 const {healthFacts}=await import("../../fixtures/form7206.js");
 const value=businessReturn("2787","3355",{grossReceipts:"200000",expenses:{supplies:"190000"}});
 Object.assign(value.form2555!.sourceMapping!.rows[0]!,{capitalMaterialIncomeFactor:true,reasonableServicesAllowance:"3000",reasonableAllowanceConfirmed:true,allBusinessIncomeForeignConfirmed:true});
 value.form7206=TaxYearInputSchema.parse({...value,form7206:healthFacts("scheduleC","100")}).form7206;
 expect(()=>calculateFederalTax(value)).toThrow(/signed Form2555.*Form7206.*separate.*method/i);
});

it("preserves signed Form2555 in an ordinary marketplace return",()=>{
 const value=businessReturn("2787","3355",{grossReceipts:"200000",expenses:{supplies:"190000"}});
 Object.assign(value.form2555!.sourceMapping!.rows[0]!,{capitalMaterialIncomeFactor:true,reasonableServicesAllowance:"3000",reasonableAllowanceConfirmed:true,allBusinessIncomeForeignConfirmed:true});
 const months=[{month:1,enrolleePremium:"500",slcsp:"700",advancePremiumTaxCredit:"0",coverageEligible:true,incomeBasedSepEnrollment:false}];
 const input=TaxYearInputSchema.parse({...value,w2s:[{...simpleW2Fixture.w2s[0],wages:"20000"}],form1095A:[{taxYear:2025,marketplace:"Actual Marketplace",policyNumber:"ACTUAL-SIGNED",monthlyPremiums:months}],
 form8962:{taxFamilySize:1,fplRegion:"contiguous",requiredFilingDependentsModifiedAGI:"0",householdFactsConfirmed:true,canBeClaimedAsDependent:false,belowPovertyException:"none",coverageFactsConfirmed:true,allocationRequired:false,alternativeMarriageCalculationElected:false,selfEmployedHealthInsuranceCoordinationRequired:false,lawfulPresenceReconciliationRequired:false,qsehraAffected:false,monthlyReconciliation:months}});
 const result=calculateFederalTax(input);
 expect(result.form2555!.netExclusion.toFixed()).toBe("-568");expect(result.agi.toFixed()).toBe("29861");expect(result.form8962!.modifiedAGI.toFixed()).toBe("29293");
});
