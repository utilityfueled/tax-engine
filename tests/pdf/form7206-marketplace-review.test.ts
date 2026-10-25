// Spec: spec/federal/form-7206-pdf.yaml; final2025 Form7206 and Pub974 Steps3-4.
import Decimal from "decimal.js";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { fillForm7206, FORM_7206_FIELDS } from "@/pdf/fill-form-7206.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { assertForm7206ReviewSource } from "@/pdf/mappings/2025/fill-form-7206.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { marketplaceHealthInput } from "../fixtures/marketplace-health.js";

const blank = "forms/blank/2025/f7206.pdf";
function actual2025(noCredit = false) {
  const input = marketplaceHealthInput();
  input.taxpayer.taxYear = 2025;
  input.form7206!.sourceTaxYear = 2025;
  input.form7206!.persons![0].attainedAgeAtYearEnd = 35;
  for (const policy of input.form1095A) {
    policy.taxYear = 2025;
    for (const month of policy.monthlyPremiums) { month.slcsp = "500"; if (noCredit) month.advancePremiumTaxCredit = "0"; }
  }
  for (const month of input.form8962!.monthlyReconciliation!) { month.slcsp = "500"; if (noCredit) month.advancePremiumTaxCredit = "0"; }
  for (const payment of input.form7206!.plans![0].payments!) {
    payment.coverageTaxYear = 2025; payment.datePaid = payment.datePaid!.replace("2026-", "2025-");
    if (noCredit) {
      payment.ownerOrBusinessPaid = "500"; payment.advancePremiumTaxCredit = "0";
      for (const person of payment.personAmounts!) { person.amountPaid = "500"; person.advancePremiumTaxCredit = "0"; }
    }
  }
  if (noCredit) input.scheduleC!.grossReceipts = "5000";
  return input;
}
function inspect(bytes: Uint8Array): { pages: string[]; fields: Record<string, string>; widgets: { name: string; value: string; appearance: boolean }[] } {
  // Reopen a saved artifact; an EOF-dependent stdin pipe can hang the synchronous
  // subprocess before Vitest can enforce its timeout on macOS.
  const directory = mkdtempSync(join(tmpdir(), "tax-marketplace-pdf-"));
  const path = join(directory, "review.pdf");
  try {
    writeFileSync(path, bytes);
    return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
from pypdf import PdfReader
import json,sys
r=PdfReader(sys.argv[1]);widgets=[]
for page in r.pages:
 for ref in page.get('/Annots',[]):
  widget=ref.get_object()
  if widget.get('/Subtype')!='/Widget':continue
  node=widget;names=[];value=None
  while node:
   if node.get('/T'):names.insert(0,str(node.get('/T')))
   if value is None and '/V' in node:value=str(node.get('/V'))
   parent=node.get('/Parent');node=parent.get_object() if parent else None
  appearance=widget.get('/AP',{}).get('/N')
  widgets.append({'name':'.'.join(names),'value':value or '', 'appearance':bool(appearance and appearance.get_object().get_data())})
fields={k:str(v.get('/V','')) for k,v in r.get_fields().items() if v.get('/FT')=='/Tx'}
print(json.dumps({'pages':[p.extract_text() or '' for p in r.pages],'fields':fields,'widgets':widgets}))
`, path], { encoding: "utf8", timeout: 5000 }));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it("keeps nonspecified physical lines separate from the actual Pub974 return deduction", async () => {
  const input = actual2025(), result = calculateFederalTax(input);
  // Independent published-form arithmetic: profit50000 - SEhalf3533 =46467;
  // W16=2400, X25=975, X30=3375; Step2PTC3656; finalhealth2344/PTC3494.
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe("2344");
  const doc = await fillForm7206(input, result, blank, "scheduleC", "primary");
  const saved = inspect(await doc.save()), content = saved.pages.join(" ");
  expect(saved.fields[FORM_7206_FIELDS.line1]).toBe("0");
  expect(saved.fields[FORM_7206_FIELDS.line14]).toBe("0");
  expect(content).toContain("NONSPECIFIED PREMIUMS");
  expect(content).toContain("Pub974 Worksheet W line 16: $2400");
  expect(content).toContain("Pub974 Worksheet X line 25: $975");
  expect(content).toContain("Pub974 Worksheet X line 21: 286%");
  expect(content).toContain("Step 2 credit: $3656");
  expect(content).toContain("Final Form 8962 credit: $3494");
  expect(content).toContain("Return-level Schedule 1 line 17 transfer: $2344");
  expect(content).toContain("form1095A:0");
  expect(content).toContain("actual advance credit $300");
  expect(content).not.toContain("This business transfers $0 to Schedule 1");
  expect(content).toContain("not a separate deduction for this business");
  expect(content).toContain("displayed to cents");
  expect(content).toContain("Pub974 Simplified line 9: $2344");
  expect(content).not.toContain("2343.999999");
  for (const page of saved.pages) expect(page).toContain("FOR REVIEW ONLY - NOT FOR FILING");
});

it("uses the final ordinary worksheet after an actual no-credit result", async () => {
  const input = actual2025(true), result = calculateFederalTax(input);
  // SE707/half354 leaves4646 business income; final ordinary health4646, PTC0.
  expect(result.marketplaceHealthInsurance!.method).toBe("ordinary-no-ptc-2025");
  const doc = await fillForm7206(input, result, blank, "scheduleC", "primary");
  const saved = inspect(await doc.save()), content = saved.pages.join(" ");
  expect(saved.fields[FORM_7206_FIELDS.line1]).toBe("6000");
  expect(saved.fields[FORM_7206_FIELDS.line14]).toBe("4646");
  expect(content).toContain("FINAL ORDINARY NO-CREDIT METHOD");
  expect(content).toContain("Interim attempted coordination");
  expect(content).toContain("Final Form 8962 credit: $0");
  expect(content).toContain("Return-level Schedule 1 line 17 transfer: $4646");
});

it("rejects altered Marketplace sources methods and missing or conflicting audits", async () => {
  const mutations: ((input: ReturnType<typeof actual2025>, result: ReturnType<typeof calculateFederalTax>) => void)[] = [
    input => { input.form7206!.plans![0].payments![0].personAmounts![0].advancePremiumTaxCredit = "301"; },
    input => { input.form1095A[0].monthlyPremiums[0].advancePremiumTaxCredit = "301"; },
    (_, result) => { result.form7206!.marketplaceHandling = "ordinary-no-ptc"; },
    (_, result) => { result.marketplaceHealthInsurance!.finalCredit = new Decimal(3495); },
    (_, result) => { result.marketplaceHealthInsurance!.lines = result.marketplaceHealthInsurance!.lines.filter(row => row.form !== "Pub974 Simplified" || row.line !== "11"); },
    (_, result) => { result.marketplaceHealthInsurance!.lines.push(result.marketplaceHealthInsurance!.lines[0]); },
    (_, result) => { result.marketplaceHealthInsurance!.historicalLimit!.lines[0].value = new Decimal(1); },
    (_, result) => { result.allLines = result.allLines.filter(row => row.form !== "Pub974 Worksheet X" || row.line !== "25"); },
    (_, result) => { result.marketplaceHealthInsurance!.businesses.push(result.marketplaceHealthInsurance!.businesses[0]); },
    (_, result) => { result.form7206!.deductionToSchedule1 = new Decimal(2345); },
  ];
  for (const mutate of mutations) {
    const input = actual2025(), result = calculateFederalTax(input); mutate(input, result);
    await expect(fillForm7206(input, result, blank, "scheduleC", "primary")).rejects.toThrow(/source|audit|reconcil|method|credit|deduction|advance/i);
  }
});

it("attaches the complete reviewed Marketplace packet with cleared identifiers", async () => {
  const input = actual2025(), result = calculateFederalTax(input); input.taxpayer.primary.ssn = "";
  const outputDir = await mkdtemp(join(tmpdir(), "tax-engine-marketplace-review-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank", outputDir, flatten: false });
    const files = packet.filledForms.filter(path => /form-7206-/.test(path));
    expect(files).toHaveLength(1); expect(packet.filledForms.some(path => /se-health-insurance/.test(path))).toBe(false);
    const bytes = await readFile(files[0]), saved = inspect(bytes);
    expect(saved.fields[FORM_7206_FIELDS.ssn]).toBe("");
    expect(saved.pages.join(" ")).not.toMatch(/123.?45.?6789/);
    expect(Object.keys(saved.fields)).toHaveLength(16); expect(saved.widgets).toHaveLength(16);
    for (const widget of saved.widgets) { expect(widget.value).toBe(saved.fields[widget.name]); expect(widget.appearance).toBe(true); }
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(16);
    for (const page of saved.pages) expect(page).toContain("FOR REVIEW ONLY - NOT FOR FILING");
    await expect(fillForm7206({ ...input, taxpayer: { ...input.taxpayer, taxYear: 2026 } }, { ...result, taxYear: 2026 }, "/missing", "scheduleC", "primary")).rejects.toThrow(/mapping/i);
  } finally { await rm(outputDir, { recursive: true, force: true }); }
});

it("retains original premium cents with the printed whole-dollar full credit", async () => {
  const input = actual2025(); input.scheduleC!.grossReceipts = "20000";
  for (const policy of input.form1095A) for (const month of policy.monthlyPremiums) month.enrolleePremium = "499.99";
  for (const month of input.form8962!.monthlyReconciliation!) month.enrolleePremium = "499.99";
  for (const payment of input.form7206!.plans![0].payments!) {
    payment.grossPremium = "499.99"; payment.ownerOrBusinessPaid = "199.99";
    for (const person of payment.personAmounts!) person.amountPaid = "199.99";
  }
  const result = calculateFederalTax(input);
  // Profit20000-SEhalf1413=18587;123%FPL has no required contribution.
  // Actual5999.88 annual enrollment prints6000; no health deduction remains.
  expect(result.form8962!.ptcAllowed.toFixed()).toBe("6000");
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe("0");
  const doc = await fillForm7206(input, result, blank, "scheduleC", "primary");
  const content = inspect(await doc.save()).pages.join(" ");
  expect(content).toContain("original premium $499.99");
  expect(content).toContain("Pub974 Worksheet W line 1: $5999.88");
  expect(content).toContain("Final Form 8962 credit: $6000");
  expect(input.form7206!.plans![0].payments![0].grossPremium).toBe("499.99");
});

it("keeps separate business sources under one combined transfer", async () => {
  const base = actual2025(), plan = base.form7206!.plans![0];
  const input = TaxYearInputSchema.parse({ ...base,
    scheduleC: { accountHolder: "primary", grossReceipts: "25000", qbiMateriallyParticipated: true },
    scheduleF: { accountHolder: "primary", principalCropOrActivity: "Synthetic farm", salesOfProductsRaised: "25000", qbiMateriallyParticipated: true },
    form1095A: [0, 1].map(index => ({ ...base.form1095A[0], policyNumber: `ACTUAL-${index}`, monthlyPremiums: base.form1095A[0].monthlyPremiums.filter(row => index === 0 ? row.month <= 6 : row.month > 6) })),
    form7206: { ...base.form7206, plans: [0, 1].map(index => ({ ...plan, planId: `actual-${index}`, businessSourceId: index === 0 ? "scheduleC" : "scheduleF", marketplacePolicySourceIds: [`form1095A:${index}`],
      months: plan.months!.filter(row => index === 0 ? row.month! <= 6 : row.month! > 6), payments: plan.payments!.filter(row => index === 0 ? row.coverageMonth! <= 6 : row.coverageMonth! > 6) })) },
    qbiDeductionAllocations: { sourceFactsConfirmed: true, rows: ["scheduleC", "scheduleF"].map(sourceId => ({ sourceId, accountHolder: "primary", deductibleSelfEmploymentTax: "1766.5", selfEmployedHealthInsurance: "1170", selfEmployedRetirementPlans: "0" })) },
  });
  const result = calculateFederalTax(input);
  // Actual partial policies use monthly PTC:286%FPL contribution2344/12
  // rounds195, so12*(500-195)=3660; combined health6000-3660=2340.
  expect(result.marketplaceHealthInsurance!.step2Credit.toFixed()).toBe("3660");
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe("2340");
  for (const sourceId of ["scheduleC", "scheduleF"]) {
    const doc = await fillForm7206(input, result, blank, sourceId, "primary"), saved = inspect(await doc.save()), content = saved.pages.join(" ");
    expect(saved.fields[FORM_7206_FIELDS.line14]).toBe("0");
    expect(content).toContain(`Pub974 Simplified ${sourceId} line 1: $3000`);
    expect(content).toContain("Return-level Schedule 1 line 17 transfer: $2340");
    expect(content).toContain("not a separate deduction for this business");
  }
});

it("preserves actual ordered IRA and loan worksheets in the review appendix", async () => {
  const source = actual2025(); source.scheduleC!.grossReceipts = "94000";
  for (const policy of source.form1095A) for (const month of policy.monthlyPremiums) Object.assign(month, { enrolleePremium: "1000", slcsp: "1000", advancePremiumTaxCredit: "500" });
  for (const month of source.form8962!.monthlyReconciliation!) Object.assign(month, { enrolleePremium: "1000", slcsp: "1000", advancePremiumTaxCredit: "500" });
  for (const payment of source.form7206!.plans![0].payments!) {
    Object.assign(payment, { grossPremium: "1000", ownerOrBusinessPaid: "500", advancePremiumTaxCredit: "500" });
    for (const person of payment.personAmounts!) Object.assign(person, { amountPaid: "500", advancePremiumTaxCredit: "500" });
  }
  const input = TaxYearInputSchema.parse({ ...source,
    iraDeductionWorksheet: { primaryContributions: "7000", primaryIsActiveParticipant: true, primaryCompensation: "87359", primarySection501c18Contributions: "0", primaryRothContributions: "0", sourceFactsConfirmed: true },
    studentLoanInterestFacts: { sourceTaxYear: 2025, sourceFactsConfirmed: true, primaryClaimedAsDependent: false, puertoRicoIncomeExclusion: "0", americanSamoaIncomeExclusion: "0",
      loans: [{ sourceId: "loan1", borrowerId: "borrower1", accountHolder: "primary", lender: "Synthetic lender", sourceKind: "lender_statement", loanOriginationDate: "2010-08-01", interestPaid: "1500", additionalInterestPaid: "0", paymentsInTaxYearConfirmed: true,
        legallyObligated: true, solelyQualifiedEducationExpenses: true, eligibleInstitutionAtOrigination: true, enrolledAtLeastHalfTime: true, pursuingCredential: true, studentRelationshipAtOrigination: "self", expensesWithinReasonablePeriod: true,
        relatedLender: false, employerPlanLoan: false, employerAssistanceExcluded: "0", otherTaxFreeAssistance: "0", interestDeductibleElsewhere: "0", qtpTaxFreeEarningsUsedForInterest: "0", reductionsDistinctConfirmed: true, educationExpenseIds: [] }] },
  });
  const result = calculateFederalTax(input);
  // Ordered source case: initial health6406 -> IRA MAGI80953/deduction5640;
  // then loan1500, final health5799 and PTC5674. Final AGI74420 is not IRA MAGI.
  expect(result.iraDeductionWorksheet!.magi.toFixed()).toBe("80953");
  expect(result.schedule1!.seHealthInsurance.toFixed()).toBe("5799");
  const doc = await fillForm7206(input, result, blank, "scheduleC", "primary"), content = inspect(await doc.save()).pages.join(" ");
  expect(content).toContain("Pub974 Worksheet Y line 2: $5640");
  expect(content).toContain("Pub974 Worksheet Z 1 line 2: $1500");
  expect(content).toContain("Pub974 Ordered Deductions ira: $5640");
  expect(content).toContain("Final Form 8962 credit: $5674");
  expect(content).toContain("Return-level Schedule 1 line 17 transfer: $5799");
  result.allLines.push(result.allLines.find(row => row.form === "Pub974 Ordered Deductions" && row.line === "ira")!);
  await expect(fillForm7206(input, result, blank, "scheduleC", "primary")).rejects.toThrow(/ordered.*audit|duplicat/i);
});

it("rejects stale business and payroll context instead of trusting persisted amounts", () => {
  const changedC = actual2025(), cResult = calculateFederalTax(changedC);
  expect(cResult.form7206!.businesses[0].netIncome!.toFixed()).toBe("50000");
  changedC.scheduleC!.grossReceipts = "50001";
  expect(() => assertForm7206ReviewSource(changedC, cResult)).toThrow(/source|reconcil|income|audit/i);

  const nec = TaxYearInputSchema.parse({ ...actual2025(), scheduleC: { accountHolder: "primary", qbiMateriallyParticipated: true },
    form1099Nec: [{ payer: "Actual client", payerEin: "12-3456789", nonemployeeCompensation: "50000", accountHolder: "primary" }] });
  const necResult = calculateFederalTax(nec);
  expect(necResult.form7206!.businesses[0].netIncome!.toFixed()).toBe("50000");
  nec.form1099Nec[0].nonemployeeCompensation = "50001";
  expect(() => assertForm7206ReviewSource(nec, necResult)).toThrow(/source|reconcil|income|audit/i);

  const unbound = actual2025(), unboundResult = calculateFederalTax(unbound);
  unbound.scheduleF = TaxYearInputSchema.parse({ ...unbound, scheduleF: { accountHolder: "primary", salesOfProductsRaised: "10000" } }).scheduleF;
  expect(() => assertForm7206ReviewSource(unbound, unboundResult)).toThrow(/source|reconcil|income|audit/i);

  const payroll = TaxYearInputSchema.parse({ ...actual2025(), w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", wages: "10000", socialSecurityWages: "160000", socialSecurityTips: "0" }] });
  const payrollResult = calculateFederalTax(payroll);
  payroll.w2s[0].socialSecurityWages = "170000";
  expect(() => assertForm7206ReviewSource(payroll, payrollResult)).toThrow(/source|reconcil|income|audit/i);

  const duplicated = actual2025(), duplicateResult = calculateFederalTax(duplicated);
  duplicateResult.scheduleSE!.perTaxpayer.push(duplicateResult.scheduleSE!.perTaxpayer[0]);
  expect(() => assertForm7206ReviewSource(duplicated, duplicateResult)).toThrow(/source|duplicat|reconcil/i);
});
