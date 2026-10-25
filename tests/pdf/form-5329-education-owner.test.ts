/** Spec: spec/federal/form-5329-education-owner.yaml. Synthetic source evidence. */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { expect, it } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { fillForm5329, FORM_5329_FIELDS as F } from "@/pdf/fill-form-5329.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { hsaOwnerInput } from "../fixtures/hsa-excess-owner.js";
import { d } from "@/utils/decimal.js";

function educationInput(hsa = false, exceptPrimary = false) {
  const base = hsaOwnerInput();
  return TaxYearInputSchema.parse({ ...base, ...(hsa ? {} : { form8889ByOwner: undefined, form5329HsaByOwner: undefined }),
    form1099Q: ([["primary", "200", "800"], ["spouse", "400", "600"], ["other", "600", "400"]] as const).map(([owner, earnings, basis], index) => ({ sourceId: `q${index}`, accountId: `account${index}`, beneficiaryId: `beneficiary${index}`, recipientOwner: owner, recipientId: owner === "other" ? "outside" : undefined, taxYear: 2025, payerName: "Actual synthetic plan", accountType: "529", grossDistribution: "1000", earnings, basis, isTrusteeToTrustee: false, isQtpToRoth: false, recipientNotBeneficiary: false, sourceFactsConfirmed: true, transfer: { kind: "none" } })),
    qualifiedEducationExpenses: { sourceFacts: { taxYear: 2025, sourceFactsConfirmed: true, allDistributionsReconciled: true,
      beneficiaries: [0, 1, 2].map(index => ({ id: `beneficiary${index}`, outsideK12QualifiedDistributions: "0" })), expenses: [], allocations: [], loanBorrowers: [], coverdellAccounts: [],
      penaltyExceptions: exceptPrimary ? [{ id: "scholarship", sourceId: "q0", kind: "scholarship", qualifyingAmount: "1000", distributionAmount: "1000", eligibilityConfirmed: true }] : [],
    } },
  });
}

it("copies each education recipient audit and merges only the same owners HSA part", async () => {
  const input = educationInput(true); const result = calculateFederalTax(input);
  for (const [owner, name, ssn, income, penalty, hsaTax] of [["primary", "Jane Doe", "123456789", "200", "20", "6"], ["spouse", "Alex Doe", "987654321", "400", "40", "42"]] as const) {
    const pdf = await fillForm5329(input, result, "forms/blank/2025/f5329.pdf", owner); const form = pdf.getForm();
    expect(form.getTextField(F.name).getText()).toBe(name); expect(form.getTextField(F.ssn).getText()).toBe(ssn);
    expect(form.getTextField(F.line5).getText()).toBe(income); expect(form.getTextField(F.line8).getText()).toBe(penalty);
    expect(form.getTextField(F.line49).getText()).toBe(hsaTax);
  }
});

it("includes individual education forms once and preserves zero-tax exception filing", async () => {
  const input = educationInput(false, true); const result = calculateFederalTax(input);
  const directory = await mkdtemp(join(tmpdir(), "education-owner-packet-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank/2025", outputDir: directory });
    expect(packet.filledForms.filter(path => path.includes("f5329"))).toHaveLength(2);
    for (const owner of ["primary", "spouse"]) expect(packet.filledForms.some(path => path.endsWith(`f5329-${owner}-filled.pdf`))).toBe(true);
    const primary = await PDFDocument.load(await readFile(join(directory, "f5329-primary-filled.pdf")));
    expect(primary.getForm().getTextField(F.line5).getText()).toBe("200"); expect(primary.getForm().getTextField(F.line6).getText()).toBe("200");
    expect(primary.getForm().getTextField(F.line8).getText() ?? "").toBe("");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("rejects missing owner identity and inconsistent or unassigned education audits", async () => {
  const input = educationInput(); const result = calculateFederalTax(input);
  const tampered = { ...result, allLines: result.allLines.map(line => line.form === "Form5329 education" && line.line === "primary:primary:5" ? { ...line, value: d("999") } : line) };
  await expect(fillForm5329(input, tampered, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/audit|reconcil/i);
  await expect(fillForm5329({ ...input, taxpayer: { ...input.taxpayer, spouse: undefined } }, result, "forms/blank/2025/f5329.pdf", "spouse")).rejects.toThrow(/identity|individual/i);
  await expect(fillForm5329(input, result, "forms/blank/2025/f5329.pdf")).rejects.toThrow(/owner|individual/i);
  if (!result.form1099Q) throw new Error("Expected education result");
  const missingRecipient = { ...result, form1099Q: { ...result.form1099Q, perRecipient: result.form1099Q.perRecipient.filter(row => row.owner !== "primary") } };
  await expect(fillForm5329(input, missingRecipient, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/audit|reconcil/i);
  const duplicateRecipient = { ...result, form1099Q: { ...result.form1099Q, perRecipient: [...result.form1099Q.perRecipient, ...result.form1099Q.perRecipient] } };
  await expect(fillForm5329(input, duplicateRecipient, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/audit|reconcil/i);
  await expect(fillForm5329({ ...input, taxpayer: { ...input.taxpayer, filingStatus: "married_filing_separately" } }, result, "forms/blank/2025/f5329.pdf", "spouse")).rejects.toThrow(/ownership|joint/i);
  const legacy = calculateFederalTax(TaxYearInputSchema.parse({ ...input, form5329: { traditionalIRACurrentYearExcessContributions: "1000", traditionalIRAValueDec31: "10000" } }));
  await expect(fillForm5329(input, legacy, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/unassigned|ownership/i);
  const carryAbsorption = calculateFederalTax(TaxYearInputSchema.parse({ ...input, form5329: { traditionalIRAPriorYearExcessContributions: "1000", traditionalIRAContributionRoom: "1000", traditionalIRAValueDec31: "10000" } }));
  expect(carryAbsorption.form5329?.totalAdditionalTax.toFixed()).toBe("0");
  await expect(fillForm5329(input, carryAbsorption, "forms/blank/2025/f5329.pdf", "primary")).rejects.toThrow(/unassigned|ownership/i);
});

it("preserves the single taxpayers other parts alongside actual education income", async () => {
  const base = educationInput();
  const input = TaxYearInputSchema.parse({ ...base, taxpayer: { ...base.taxpayer, filingStatus: "single", spouse: undefined },
    form1099Q: base.form1099Q.filter(form => form.recipientOwner === "primary"),
    form5329: { traditionalIRACurrentYearExcessContributions: "1000", traditionalIRAValueDec31: "10000" } });
  const result = calculateFederalTax(input);
  const doc = await fillForm5329(input, result, "forms/blank/2025/f5329.pdf", "primary");
  expect(doc.getForm().getTextField(F.line5).getText()).toBe("200");
  expect(doc.getForm().getTextField(F.line8).getText()).toBe("20");
  expect(doc.getForm().getTextField(F.line17).getText()).toBe("60");
});

it("unions education and HSA packet owners without duplicate forms", async () => {
  const input = educationInput(true); const result = calculateFederalTax(input);
  const directory = await mkdtemp(join(tmpdir(), "education-hsa-owner-union-"));
  try {
    const packet = await fillReturn(input, result, { blankFormsDir: "forms/blank/2025", outputDir: directory });
    expect(packet.filledForms.filter(path => path.includes("f5329"))).toHaveLength(2);
    for (const [owner, income, hsaTax] of [["primary", "200", "6"], ["spouse", "400", "42"]]) {
      const doc = await PDFDocument.load(await readFile(join(directory, `f5329-${owner}-filled.pdf`)));
      expect(doc.getForm().getTextField(F.line5).getText()).toBe(income);
      expect(doc.getForm().getTextField(F.line49).getText()).toBe(hsaTax);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
