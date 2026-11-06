/** Spec: spec/federal/educator-education-exclusions.yaml. Synthetic source records. */
import { describe, expect, it } from "vitest";
import { reconcileEducatorEducationExclusions } from "@/engine/forms/educator-education-exclusions.js";
import { calculateForm1099Q, type Form1099QResult } from "@/engine/forms/form-1099-q.js";
import { calculateForm8815 } from "@/engine/forms/form-8815.js";
import { EducatorExpenseSourceSchema, Form1099QSchema, Form8815Schema, QualifiedEducationExpenseSummarySchema, SavingsBondRedemptionSchema } from "@/models/inputs.js";
import { d } from "@/utils/decimal.js";

const educator = (changes: Record<string, unknown> = {}) => EducatorExpenseSourceSchema.parse({
  accountHolder: "primary", taxYear: 2026, sourceFactsConfirmed: true,
  excludedSavingsBondInterest: "0", nontaxableQualifiedTuitionProgramAmount: "0", nontaxableCoverdellEarnings: "0", ...changes,
});
function educationResult(): Form1099QResult {
  const rows = [
    { sourceId: "primary-cash", accountType: "529", recipientOwner: "primary", earnings: "200.10", basis: "799.90", grossDistribution: "1000", distributionMedium: "cash" },
    { sourceId: "spouse-cash", accountType: "529", recipientOwner: "spouse", earnings: "100.20", basis: "899.80", grossDistribution: "1000", distributionMedium: "cash" },
    { sourceId: "outside-cash", accountType: "529", recipientOwner: "other", recipientId: "outside-owner", earnings: "300.30", basis: "699.70", grossDistribution: "1000", distributionMedium: "cash" },
    { sourceId: "primary-esa", accountType: "coverdell_esa", recipientOwner: "primary", grossDistribution: "850" },
  ];
  const forms = rows.map(row => Form1099QSchema.parse({ ...row, accountId: row.sourceId, beneficiaryId: "student",
    taxYear: 2026, payerName: "Synthetic plan", isTrusteeToTrustee: false, isQtpToRoth: false,
    recipientNotBeneficiary: row.accountType !== "coverdell_esa", sourceFactsConfirmed: true, transfer: { kind: "none" } }));
  const facts = QualifiedEducationExpenseSummarySchema.parse({ sourceFacts: {
    taxYear: 2026, sourceFactsConfirmed: true, allDistributionsReconciled: true,
    beneficiaries: [{ id: "student", name: "Synthetic Student", outsideK12QualifiedDistributions: "0" }],
    expenses: rows.map(row => ({ id: `expense-${row.sourceId}`, beneficiaryId: "student", category: "postsecondary_tuition", paidDate: "2026-08-15", amount: row.grossDistribution, refundedAmount: "0", taxFreeAssistance: "0", educationCreditAmount: "0", otherTaxBenefitAmount: "0", qualificationConfirmed: true })),
    allocations: rows.map(row => ({ expenseId: `expense-${row.sourceId}`, sourceId: row.sourceId, amount: row.grossDistribution, creditAmount: "0" })),
    loanBorrowers: [], penaltyExceptions: [], coverdellAccounts: [{ accountId: "primary-esa", priorYearBasis: "1500", currentYearContributions: "0", yearEndValue: "950", outstandingRollovers: "0", rolloverBasisReceived: "0" }],
  } });
  return calculateForm1099Q(forms, facts, { taxYear: 2026 });
}
function bondResult(owners: Array<"taxpayer" | "spouse" | "taxpayer_and_spouse"> = ["taxpayer"], magi = "50000") {
  const redemptions = owners.map((registeredOwner, index) => SavingsBondRedemptionSchema.parse({ sourceId: `bond-${index + 1}`, proceeds: "10000", bondType: "paper_ee", issueDate: "2005-01-01", redemptionDate: "2026-06-15", ownerDateOfBirth: "1980-01-01", registeredOwner, ...(registeredOwner === "taxpayer_and_spouse" ? { ageTestOwner: "taxpayer" } : {}), ownershipConfirmed: true, faceValue: "16000", priorYearInterestReported: "0" }));
  const facts = Form8815Schema.parse({ sourceFactsConfirmed: true, currentStatementReconciliationConfirmed: true, priorYearInterestIncludedInCurrentStatements: "0", educationExpenses: [{ sourceId: "college", beneficiaryName: "Synthetic Student", relationship: "taxpayer", institutionName: "Synthetic College", institutionAddress: "1 College Road", expenseType: "tuition_and_required_fees", paidTaxYear: 2026, amountPaid: "20000", qualificationConfirmed: true, coordinationConfirmed: true, directInstitutionBenefits: "0", educationCreditExpenses: "0", taxFreeDistributionExpenses: "0", beneficiaryBenefits: "0" }] });
  const result = calculateForm8815(redemptions, d(magi), "married_filing_jointly", { taxYear: 2026, facts });
  return { savingsBondResult: result, savingsBondRedemptions: redemptions };
}
const base = { taxYear: 2026, filingStatus: "married_filing_jointly" as const };

describe("Educator education exclusion sources", () => {
  it("reconciles only actual recipient education earnings with exact cents", () => {
    const educationDistributions = educationResult();
    // These additional calculated source vectors exercise transfer/returned-year
    // metadata. They are not substitutes for actual source-calculation fixtures.
    const ordinary = educationDistributions.perDistribution[0];
    if (!ordinary) throw new Error("Synthetic ordinary source missing");
    educationDistributions.perDistribution.push({ ...ordinary, sourceId: "transfer", educationExpenseExcludedEarnings: d(0), transferExcludedEarnings: d("900.12") },
      { ...ordinary, sourceId: "returned", treatment: "returned_contribution", incomeTaxYear: 2025, educationExpenseExcludedEarnings: d(0) });
    const result = reconcileEducatorEducationExclusions({ ...base, educationDistributions, educatorSources: [
      educator({ nontaxableQualifiedTuitionProgramAmount: "200", nontaxableCoverdellEarnings: "142" }),
      educator({ accountHolder: "spouse", nontaxableQualifiedTuitionProgramAmount: "100" }),
    ] });
    expect(result.ownerExclusions.map(row => [row.owner, row.qtpEarnings.toString(), row.coverdellEarnings.toString()])).toEqual([["primary", "200", "142"], ["spouse", "100", "0"]]);
    expect(() => reconcileEducatorEducationExclusions({ ...base, educationDistributions, educatorSources: [educator({ nontaxableQualifiedTuitionProgramAmount: "1000", nontaxableCoverdellEarnings: "142" })] })).toThrow(/reconcile|calculated/i);
    // Final upstream exclusion is rounded on its worksheet; a source-box cent
    // amount cannot silently replace that audited amount in the reduction.
    expect(() => reconcileEducatorEducationExclusions({ ...base, educationDistributions, educatorSources: [educator({ nontaxableQualifiedTuitionProgramAmount: "200.10", nontaxableCoverdellEarnings: "142" })] })).toThrow(/reconcile|calculated/i);
  });
  it("rejects missing unverified or contradictory education reductions", () => {
    expect(reconcileEducatorEducationExclusions({ ...base, educatorSources: [educator()] }).lines).toHaveLength(3);
    expect(() => reconcileEducatorEducationExclusions({ ...base, educatorSources: [educator({ nontaxableQualifiedTuitionProgramAmount: "0.01" })] })).toThrow(/source|calculated/i);
    for (const change of [{ nontaxableCoverdellEarnings: undefined }, { nontaxableCoverdellEarnings: "-1" }, { sourceFactsConfirmed: false }, { taxYear: 2025 }, { accountHolder: undefined }]) {
      expect(() => reconcileEducatorEducationExclusions({ ...base, educatorSources: [educator(change)] })).toThrow(/actual|confirmed|year|owner|nonnegative/i);
    }
    const educationDistributions = educationResult();
    for (const change of [{ sourceFactsVerified: false }, { taxYear: 2025 }]) expect(() => reconcileEducatorEducationExclusions({ ...base, educationDistributions: { ...educationDistributions, ...change }, educatorSources: [educator()] })).toThrow(/verified|year/i);
    for (const distributionMedium of [undefined, "in_kind_prepaid_tuition"] as const) {
      const changed = { ...educationDistributions, perDistribution: educationDistributions.perDistribution.map(row => row.sourceId === "primary-cash" ? { ...row, distributionMedium } : row) };
      // Unknown medium rejects at the medium boundary. An actual supported
      // medium still cannot reconcile this incorrect declared zero reduction.
      expect(() => reconcileEducatorEducationExclusions({ ...base, educationDistributions: changed, educatorSources: [educator()] })).toThrow(distributionMedium === undefined ? /medium/i : /reconcile.*educator/i);
    }
    expect(() => reconcileEducatorEducationExclusions({ ...base, educatorSources: [educator(), educator()] })).toThrow(/duplicate/i);
    expect(() => reconcileEducatorEducationExclusions({ ...base, filingStatus: "single", educatorSources: [educator({ accountHolder: "spouse" })] })).toThrow(/joint/i);
  });
  it("binds a final bond exclusion only to its actual sole eligible owner", () => {
    const bonds = bondResult();
    expect(bonds.savingsBondResult.excludableSavingsBondInterest.toString()).toBe("2000");
    const result = reconcileEducatorEducationExclusions({ ...base, ...bonds, educatorSources: [educator({ excludedSavingsBondInterest: "2000" })] });
    expect(result.ownerExclusions[0]?.savingsBondInterest.toString()).toBe("2000");
    const spouse = reconcileEducatorEducationExclusions({ ...base, ...bondResult(["spouse"]), educatorSources: [educator()] });
    expect(spouse.ownerExclusions[0]?.savingsBondInterest.toString()).toBe("0");
    expect(spouse.ownerExclusions[1]?.savingsBondInterest.toString()).toBe("2000");
    expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, savingsBondRedemptions: [], educatorSources: [educator()] })).toThrow(/bond|source/i);
    expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, savingsBondResult: { ...bonds.savingsBondResult, sourceFactsVerified: false }, educatorSources: [educator()] })).toThrow(/verified/i);
    expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, savingsBondRedemptions: [bonds.savingsBondRedemptions[0], bonds.savingsBondRedemptions[0]], educatorSources: [educator()] })).toThrow(/duplicate/i);
  });
  it("blocks an unresolved joint bond attribution instead of accepting an invented split", () => {
    for (const owners of [["taxpayer", "spouse"], ["taxpayer_and_spouse"]] as const) {
      const bonds = bondResult([...owners], "160150");
      expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, educatorSources: [educator()] })).toThrow(/unresolved.*allocation/i);
      const unknownOverride = { ...base, ...bonds, bondAllocation: { sourceFactsConfirmed: true, primaryExclusion: "1500.10", spouseExclusion: "1499.90" }, educatorSources: [educator({ excludedSavingsBondInterest: "1500.10" })] };
      expect(() => reconcileEducatorEducationExclusions(unknownOverride)).toThrow(/unresolved.*allocation/i);
    }
    const phasedOut = bondResult(["taxpayer_and_spouse"], "200000");
    expect(reconcileEducatorEducationExclusions({ ...base, ...phasedOut, educatorSources: [educator()] }).ownerExclusions[0]?.savingsBondInterest.toString()).toBe("0");
  });
  it("refuses incomplete bond ownership and inconsistent interest worksheets", () => {
    const bonds = bondResult();
    const first = bonds.savingsBondRedemptions[0];
    if (!first) throw new Error("Synthetic bond missing");
    for (const change of [{ sourceFactsComplete: false }, { ownershipConfirmed: undefined }, { registeredOwner: undefined }, { registeredOwner: "other" as const }]) {
      expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, savingsBondRedemptions: [{ ...first, ...change }], educatorSources: [educator()] })).toThrow(/source|owner/i);
    }
    expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, savingsBondResult: { ...bonds.savingsBondResult, totalInterest: d("2001") }, educatorSources: [educator({ excludedSavingsBondInterest: "2000" })] })).toThrow(/round|interest/i);
    expect(() => reconcileEducatorEducationExclusions({ ...base, ...bonds, savingsBondResult: { ...bonds.savingsBondResult, taxYear: 2025 }, educatorSources: [educator()] })).toThrow(/year/i);
    expect(() => reconcileEducatorEducationExclusions({ ...base, savingsBondRedemptions: bonds.savingsBondRedemptions, educatorSources: [educator()] })).toThrow(/result/i);
  });
  it("records reconciled reductions without exposing source references or changing inputs", () => {
    const input = { ...base, ...bondResult(), educatorSources: [educator({ excludedSavingsBondInterest: "2000" })] };
    const before = JSON.stringify(input);
    const result = reconcileEducatorEducationExclusions(input);
    expect(result.lines.map(line => [line.line, line.value.toString()])).toEqual([["primary:bond-exclusion", "2000"], ["primary:qtp-exclusion", "0"], ["primary:coverdell-exclusion", "0"]]);
    expect(JSON.stringify(result)).not.toContain("bond-1");
    expect(result.lines.every(line => line.inputs.claimed === line.value || d(line.inputs.claimed).eq(line.value))).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  });
});
