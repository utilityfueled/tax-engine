// Specs: spec/federal/schedule-1-a-return.yaml and spec/federal/schedule-1-a.yaml.
import { expect, it, vi } from "vitest";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

// Draft constants are injected only for current-law integration tests. The
// production2026 rule pack remains incomplete and unavailable.
vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

function cardTipInput() {
  const year = 2026;
  const businessName = "Independent rideshare";
  return {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", socialSecurityTips: "0", federalWithheld: "18000" }],
    form1099K: [{ taxYear: year, accountHolder: "primary", pse: "Rideshare platform", grossAmount: "24000", cashTips: "1200",
      treasuryTippedOccupationCodes: ["802"], incomeType: "business", cardNotPresent: "24000", federalWithheld: "0", stateWithheld: "0",
      cardTipStatementEvidence: { statementReference: "2026 rideshare Form 1099-K", cardNotPresent: "24000",
        federalWithheld: "0", noStateReportingConfirmed: true },
    }],
    scheduleC: { accountHolder: "primary", businessName, principalBusinessActivity: "Independent rideshare", grossReceipts: "24000", qbiMateriallyParticipated: true },
    schedule1A: { sourceTaxYear: year, sourceReference: "Complete original tip worksheet", sourceFactsConfirmed: true, allSourcesIncluded: true,
      primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", seniorOwners: [], employeeTips: [], overtime: [], vehicleLoans: [],
      businessTips: [{ owner: "primary", occupationCode: "802", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true,
        businessName, businessSourceId: "scheduleC", qualifiedReportedTips: "1000", reportedTipSources: [{ sourceId: "form1099K:0", qualifiedTips: "1000" }],
        form1099KProof: { statementReference: "2026 rideshare Form 1099-K", receiptLedgerReference: "2026 rideshare receipt ledger",
          solePaymentCohortConfirmed: true, scheduleCBusinessReceiptsConfirmed: true, qualifiedTipsReconciledConfirmed: true },
      }],
    },
  };
}

it("reports the 2026 draft Form 1040 deduction transfers without changing their amounts", () => {
  const input = TaxYearInputSchema.parse({ ...cardTipInput(), donations: [{
    organization: "Fictional public charity", type: "cash", amount: "250", dateOfDonation: "2026-05-15",
    qualifiedOrganization: true, isPrivateFoundation: false, recipientCategory: "fifty-percent" as const, supportingOrganization: false, donorAdvisedFund: false,
  }] });
  const result = calculateFederalTax(input);
  const returnLines = result.allLines.filter(row => row.form === "1040");
  const deductionLines = returnLines.filter(row => ["12e", "12f", "13a", "13b"].includes(row.line));
  expect(Object.fromEntries(deductionLines.map(row => [row.line, row.value.toFixed()]))).toEqual({
    "12e": "16100", "12f": "250", "13a": "1000", "13b": "4261",
  });
  expect(deductionLines).toHaveLength(4);
  expect(returnLines.some(row => ["12", "13", "nonitemizer-charity"].includes(row.line))).toBe(false);
  expect(returnLines.find(row => row.line === "13a")?.formula).toContain("Schedule 1-A line 44");
  const total = returnLines.find(row => row.line === "14");
  expect(total?.value.toFixed()).toBe("21611");
  expect(total?.formula).toBe("Line 12e + Line 12f + Line 13a + Line 13b");
  expect(result.schedule1A?.totalDeduction.toFixed()).toBe("1000");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("4261");
  expect(result.taxableIncome.toFixed()).toBe("85693");
});

it("deducts qualified card tips from one reconciled 2026 Form 1099-K without adding income", () => {
  const input = cardTipInput();
  const baseline = calculateFederalTax(TaxYearInputSchema.parse({ ...input, schedule1A: undefined }));
  const result = calculateFederalTax(TaxYearInputSchema.parse(JSON.parse(JSON.stringify(input))));
  // $24,000 × .9235 yields $22,164; rounded SE tax $2,748 + $643 = $3,391.
  // Half rounds to $1,696, so AGI is $85,000 + $24,000 - $1,696 = $107,304.
  // The $1,000 ledger amount is the qualified subset of $1,200 in Box 1c.
  // QBI falls from $22,304 to $21,304 and its 20% deduction falls by $200.
  expect(result.agi.toFixed()).toBe("107304");
  expect(result.agi.eq(baseline.agi)).toBe(true);
  expect(result.scheduleC?.grossReceipts.toFixed()).toBe("24000");
  expect(result.allLines.find(line => line.form === "Sched SE" && line.line === "12")?.value.toFixed()).toBe("3391");
  expect(result.allLines.find(line => line.form === "1040" && line.line === "13a")?.value.toFixed()).toBe("1000");
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("1000");
  expect(result.allLines.find(line => line.line === "business-report:form1099K:0")?.value.toFixed()).toBe("1000");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("4261");
  expect(baseline.form8995?.qbiDeduction.toFixed()).toBe("4461");
  expect(baseline.taxableIncome.minus(result.taxableIncome).toFixed()).toBe("800");
});

it("binds Form 1099-K to the actual principal activity when the Schedule C trade name is blank", () => {
  const input = cardTipInput();
  input.scheduleC.businessName = "";
  const parsed = TaxYearInputSchema.parse(input);
  const result = calculateFederalTax(parsed);
  expect(parsed.scheduleC?.businessName).toBe("");
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("1000");
  input.schedule1A.businessTips[0].businessName = "Other activity";
  expect(() => calculateFederalTax(TaxYearInputSchema.parse(input))).toThrow(/actual business identity/i);
});

it("retains actual Form 1099-K Box 4 withholding when claiming qualified tips", () => {
  const input = cardTipInput();
  const statement = input.form1099K[0];
  statement.federalWithheld = "123.00";
  statement.cardTipStatementEvidence.federalWithheld = "123.00";
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.allLines.find(line => line.form === "1040" && line.line === "25b")?.value.toFixed()).toBe("123");
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("1000");
});

it("uses the applicable net income limit and accepts an explicitly reported zero", () => {
  const input = cardTipInput();
  const netLimited = calculateFederalTax(TaxYearInputSchema.parse({ ...input, scheduleC: { ...input.scheduleC, expenses: { supplies: "23500" } } }));
  // $500 Schedule C profit minus $35 (half of $57 + $13 SE tax) gives $465.
  expect(netLimited.schedule1A?.tipsDeduction.toFixed()).toBe("465");
  expect(netLimited.form8995?.qbiDeduction.toFixed() ?? "0").toBe("0");
  input.form1099K[0].cashTips = "0";
  input.schedule1A.businessTips[0].qualifiedReportedTips = "0";
  input.schedule1A.businessTips[0].reportedTipSources[0].qualifiedTips = "0";
  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("0");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("4461");
});

it("applies the overall tips cap before excluding the allowable card tips from QBI", () => {
  const input = cardTipInput();
  input.w2s[0].federalWithheld = "30000";
  input.form1099K[0].grossAmount = "50000";
  input.form1099K[0].cashTips = "30000";
  input.scheduleC.grossReceipts = "50000";
  input.schedule1A.businessTips[0].qualifiedReportedTips = "30000";
  input.schedule1A.businessTips[0].reportedTipSources[0].qualifiedTips = "30000";

  const result = calculateFederalTax(TaxYearInputSchema.parse(input));
  // $50,000 profit minus $3,533 deduction for half of SE tax and $25,000
  // allowable tips gives $21,467 in QBI, for a $4,293 QBI deduction.
  expect(result.agi.toFixed()).toBe("131467");
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("25000");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("4293");
});

it("holds unverified or conflicting 2026 Form 1099-K tip sources", () => {
  const input = cardTipInput();
  const statement = input.form1099K[0];
  const row = input.schedule1A.businessTips[0];
  const withStatement = (patch: Partial<typeof statement>) => ({ ...input, form1099K: [{ ...statement, ...patch }] });
  const withBusinessTip = (patch: Partial<typeof row>) => ({ ...input, schedule1A: { ...input.schedule1A, businessTips: [{ ...row, ...patch }] } });
  const cases = [
    [withStatement({ taxYear: undefined }), /year|owner/i],
    [withStatement({ taxYear: 2025 }), /year/i],
    [withStatement({ accountHolder: "spouse" }), /owner/i],
    [withStatement({ pse: "  " }), /filer/i],
    [withStatement({ incomeType: "other" }), /business/i],
    [withStatement({ grossAmount: "23999.99" }), /gross receipts/i],
    [withStatement({ cashTips: undefined }), /Box 1c/i],
    [withStatement({ cashTips: "24000.01" }), /Box 1c/i],
    [withStatement({ cashTips: "999.99" }), /qualified.*Box 1c/i],
    [withStatement({ treasuryTippedOccupationCodes: undefined }), /Box 1d/i],
    [withStatement({ treasuryTippedOccupationCodes: ["804"] }), /Box 1d/i],
    [withStatement({ treasuryTippedOccupationCodes: ["802", "000"] }), /Box 1d/i],
    [withStatement({ cardTipStatementEvidence: undefined }), /statement evidence/i],
    [withStatement({ cardNotPresent: "23999.99" }), /actual Box 1b/i],
    [withStatement({ federalWithheld: "0.01" }), /actual Box 4/i],
    [withStatement({ stateWithheld: "0.01" }), /non-W2 income taxes.*unknown/i],
    [{ ...input, form1099K: [{ ...statement, state: "PA" }] }, /state reporting/i],
    [withBusinessTip({ form1099KProof: { ...row.form1099KProof, statementReference: "Different original statement" } }), /statement reference/i],
    [withBusinessTip({ form1099KProof: undefined }), /proof|confirmation/i],
    [withBusinessTip({ form1099KProof: { ...row.form1099KProof, qualifiedTipsReconciledConfirmed: false } }), /true/i],
    [withBusinessTip({ qualifiedReportedTips: "999.99" }), /allocations do not reconcile/i],
    [withBusinessTip({ reportedTipSources: [{ ...row.reportedTipSources[0], sourceId: "form1099K:00" }] }), /source index/i],
    [withBusinessTip({ reportedTipSources: [{ ...row.reportedTipSources[0], sourceId: "form1099K:1" }] }), /year|owner/i],
    [withBusinessTip({ reportedTipSources: [...row.reportedTipSources, ...row.reportedTipSources] }), /one|sole/i],
    [{ ...input, form1099K: [statement, statement] }, /one|sole/i],
    [{ ...input, form1099Nec: [{ taxYear: 2026, accountHolder: "primary", payer: "Rideshare platform", nonemployeeCompensation: "1000" }] }, /NEC.*MISC/i],
    [{ ...input, form1099Misc: [{ taxYear: 2026, accountHolder: "primary", payer: "Rideshare platform", otherIncome: "1000" }] }, /NEC.*MISC/i],
  ] as const;
  for (const [raw, expectedError] of cases) {
    expect(() => calculateFederalTax(TaxYearInputSchema.parse(raw))).toThrow(expectedError);
  }
});

it("deducts actual business tips once from taxable income and QBI without changing AGI or SE tax", () => {
  for (const year of [2025, 2026]) {
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: year, primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true } },
    w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", socialSecurityTips: "0" }],
    form1099Nec: [{ taxYear: year, accountHolder: "primary", payer: "Actual service platform", nonemployeeCompensation: "10000", cashTips: "1000", treasuryTippedOccupationCodes: ["102"] }],
    scheduleC: { accountHolder: "primary", businessName: "Actual service", grossReceipts: "10000", qbiMateriallyParticipated: true },
  });
  const baseline = calculateFederalTax(input);
  const actual = TaxYearInputSchema.parse({ ...input, schedule1A: {
    sourceTaxYear: year, sourceReference: "Actual platform tip ledger", sourceFactsConfirmed: true, allSourcesIncluded: true,
    primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0", seniorOwners: [], employeeTips: [], overtime: [], vehicleLoans: [],
    businessTips: [{ owner: "primary", occupationCode: "102", eligibleOccupation: true, voluntaryCashTips: true, lawfulActivity: true, meetsSstbRuleOrTransition: true,
      businessName: "Actual service", businessSourceId: "scheduleC", qualifiedReportedTips: "1000", reportedTipSources: [{ sourceId: "form1099Nec:0", qualifiedTips: "1000" }] }],
  } });
  const result = calculateFederalTax(actual);
  // SE: round(10,000*.9235)=9,235; round(*.124)=1,145, round(*.029)=268;
  // half of1,413 rounds707. NetQBI9,293 minus allowabletips1,000 =8,293.
  expect(result.agi.eq(baseline.agi)).toBe(true);
  expect(result.allLines.find(line => line.form === "Sched SE" && line.line === "12")?.value.toFixed()).toBe("1413");
  expect(result.totalWithholding.eq(baseline.totalWithholding)).toBe(true);
  expect(result.schedule1A?.tipsDeduction.toFixed()).toBe("1000");
  expect(result.form8995?.qbiDeduction.toFixed()).toBe("1659");
  expect(baseline.form8995?.qbiDeduction.toFixed()).toBe("1859");
  expect(baseline.taxableIncome.minus(result.taxableIncome).toFixed()).toBe("800");
  }
});
