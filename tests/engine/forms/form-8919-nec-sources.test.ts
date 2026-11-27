// Spec: spec/federal/form-8919.yaml, 2026 Reason A original NEC sources.
import { describe, expect, it } from "vitest";
import { reconcileForm8919NecSources } from "@/engine/forms/form-8919-nec-sources.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { calculateScheduleC } from "@/engine/schedules/schedule-c.js";
import { simpleW2Fixture } from "../../fixtures/simple-w2.js";

const payer = "Synthetic wage firm";
const issuerEin = "12-0000034";
const statementReference = "Synthetic original statement";
const observationDate = "2027-03-01";

function sourceInput() {
  return {
    ...simpleW2Fixture,
    taxpayer: { ...simpleW2Fixture.taxpayer, taxYear: 2026 },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary" as const }],
    form1099Nec: [{
      payer, payerTin: issuerEin, accountHolder: "primary" as const, taxYear: 2026,
      nonemployeeCompensation: "3000.25", qualifiedOvertimeCompensation: "200.50", federalWithheld: "31.50",
      originalForForm8919: {
        statementReference, recipientTin: simpleW2Fixture.taxpayer.primary.ssn,
        currentOriginalNoCorrectionsOrVoidsConfirmed: true,
        noDirectSalesOrParachutePaymentConfirmed: true,
      },
    }],
    form8919: {
      accountHolder: "primary" as const, wagesNotReportedOnW2: "3000.25",
      reasonANecSource: {
        necSourceId: "form1099Nec:0", sourceTaxYear: 2026, statementReference,
        employerEin: issuerEin, employerName: payer,
        determinationReference: "Synthetic IRS worker determination", determinationDate: "2026-05-12",
        determinationReceivedDate: "2026-05-16",
        employeeDeterminationConfirmed: true, allCompensationEmployeeWagesConfirmed: true,
        noEmployeeFicaWithheldConfirmed: true, receivedInsteadOfW2Confirmed: true,
      },
    },
  };
}

describe("2026 original Form 1099-NEC linked to Reason A wages", () => {
  it("retains the original statement and IRS classification source facts on canonical input", () => {
    const original = sourceInput();
    const input = TaxYearInputSchema.parse(original);
    expect(input.form8919).toMatchObject({ reasonANecSource: original.form8919.reasonANecSource });
    expect(input.form1099Nec[0]).toMatchObject({ originalForForm8919: original.form1099Nec[0].originalForForm8919 });
  });

  it("filters only the documented original from the business calculation input", () => {
    const input = TaxYearInputSchema.parse(sourceInput());
    const result = reconcileForm8919NecSources(input, observationDate);

    expect(result.form8919NecSource).toEqual({ wageNecIndex: 0, statementReference });
    expect(result.businessInput.form8919).toBe(input.form8919);
    expect(result.businessInput.w2s).toBe(input.w2s);
    expect(result.businessInput.form1099Nec).toEqual([]);
    expect(calculateScheduleC(result.businessInput).grossReceipts.toFixed()).toBe("0");
    expect(input.form1099Nec[0]).toMatchObject({
      nonemployeeCompensation: "3000.25", qualifiedOvertimeCompensation: "200.50", federalWithheld: "31.50",
    });
  });

  it("accepts a received employee determination after the compensation year", () => {
    const data = sourceInput();
    data.form8919.reasonANecSource.determinationDate = "2027-02-27";
    data.form8919.reasonANecSource.determinationReceivedDate = "2027-02-28";
    const input = TaxYearInputSchema.parse(data);
    expect(reconcileForm8919NecSources(input, observationDate).businessInput.form1099Nec).toHaveLength(0);
    expect(() => reconcileForm8919NecSources(input, "2027-02-27")).toThrow(/received IRS Reason A determination/);
    expect(() => reconcileForm8919NecSources(input, "2027-02-30")).toThrow(/received IRS Reason A determination/);
    data.form8919.reasonANecSource.determinationReceivedDate = "2027-02-26";
    expect(() => reconcileForm8919NecSources(TaxYearInputSchema.parse(data), observationDate)).toThrow(/received IRS Reason A determination/);
    data.form8919.reasonANecSource.determinationDate = "2026-02-29";
    expect(TaxYearInputSchema.safeParse(data).success).toBe(false);
  });

  it("binds a joint filer to the spouse's actual original recipient TIN", () => {
    const input = TaxYearInputSchema.parse(sourceInput());
    input.taxpayer.filingStatus = "married_filing_jointly";
    input.taxpayer.spouse = { firstName: "Synthetic", lastName: "Spouse", dateOfBirth: "1990-01-01", ssn: "999-12-3456" };
    input.form8919!.accountHolder = "spouse";
    input.form1099Nec[0].accountHolder = "spouse";
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/return owner and recipient TIN/);
    input.form1099Nec[0].originalForForm8919!.recipientTin = "999123456";
    expect(reconcileForm8919NecSources(input, observationDate).businessInput.form1099Nec).toHaveLength(0);
    input.form8919!.accountHolder = "primary";
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/return owner and recipient TIN/);
    input.form8919!.accountHolder = "spouse";
    delete input.taxpayer.spouse;
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/return owner and recipient TIN/);
  });

  it("preserves 2025 and separate-owner current business inputs without a link", () => {
    const data = sourceInput();
    const input = TaxYearInputSchema.parse(data);
    delete input.form8919!.reasonANecSource;
    delete input.form1099Nec[0].originalForForm8919;
    input.taxpayer.taxYear = 2025;
    input.form1099Nec[0].taxYear = 2025;
    expect(reconcileForm8919NecSources(input, observationDate).businessInput).toBe(input);
    input.taxpayer.taxYear = 2026;
    input.form1099Nec[0].taxYear = 2026;
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/verified Reason A link/);
    input.taxpayer.filingStatus = "married_filing_jointly";
    input.taxpayer.spouse = { firstName: "Synthetic", lastName: "Spouse", dateOfBirth: "1990-01-01", ssn: "999-12-3456" };
    input.form1099Nec[0].accountHolder = "spouse";
    expect(reconcileForm8919NecSources(input, observationDate).businessInput).toBe(input);
    delete input.form1099Nec[0].accountHolder;
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/verified Reason A link/);
  });

  it("rejects mismatched firm, statement, amount or original status", () => {
    const edits = [
      ["payerTin", "98-7654321", /employer EIN/],
      ["payer", "Another firm", /firm name/],
      ["nonemployeeCompensation", "3000.24", /full positive Form 1099-NEC Box 1a/],
      ["qualifiedOvertimeCompensation", "3000.26", /Box 1d overtime cannot exceed Box 1a/],
      ["cashTips", "1", /tip reporting/],
      ["stateIncome", "3000.25", /state-source reporting/],
      ["federalWithheld", "-1", /Box 4 withholding/],
      ["taxYear", 2025, /same confirmed current original/],
    ] as const;
    for (const [key, value, expected] of edits) {
      const data = sourceInput();
      const input = TaxYearInputSchema.parse({ ...data, form1099Nec: [{ ...data.form1099Nec[0], [key]: value }] });
      expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(expected);
    }

    const input = TaxYearInputSchema.parse(sourceInput());
    input.form8919!.reasonANecSource!.statementReference = "Unmatched original reference";
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/same confirmed current original/);
    input.form8919!.reasonANecSource!.statementReference = statementReference;
    input.form1099Nec[0].originalForForm8919!.currentOriginalNoCorrectionsOrVoidsConfirmed = false;
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/same confirmed current original/);
  });

  it("holds duplicate originals, a same-firm W-2, and separate business receipts", () => {
    const input = TaxYearInputSchema.parse(sourceInput());
    input.form1099Nec.push({ ...input.form1099Nec[0] });
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/one matching current original/);
    input.form1099Nec.pop();
    const firstEmployer = input.w2s[0].employer;
    input.w2s[0].employer = { ...firstEmployer, ein: "120000034" };
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/W-2 EINs from firms other than/);
    input.w2s[0].employer = firstEmployer;
    input.scheduleC = TaxYearInputSchema.parse({ ...sourceInput(), scheduleC: { grossReceipts: "3000.25" } }).scheduleC;
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/business or other unallocated payroll sources/);
  });

  it("requires the original to rule out reported direct sales or parachute payments", () => {
    const data = sourceInput();
    data.form1099Nec[0].originalForForm8919.noDirectSalesOrParachutePaymentConfirmed = false;
    const input = TaxYearInputSchema.parse(data);
    expect(() => reconcileForm8919NecSources(input, observationDate)).toThrow(/direct sales or excess golden parachute payments/);
  });
});
