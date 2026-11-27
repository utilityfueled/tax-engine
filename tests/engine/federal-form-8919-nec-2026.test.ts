// Spec: spec/federal/form-8919-nec-sources.yaml. The isolated calculation does not open the 2026 rule pack.
import { expect, it, vi } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("@/models/constants.js", async importOriginal => {
  const original = await importOriginal<typeof import("@/models/constants.js")>();
  const { FEDERAL_2026_CONSTANTS } = await import("@/models/federal-2026-indexed.js");
  return { ...original, getConstants: (year: number) => year === 2026 ? FEDERAL_2026_CONSTANTS : original.getConstants(year) };
});

const statementReference = "Synthetic private compensation original 26601";

function fixture(verified: boolean) {
  return TaxYearInputSchema.parse({
    ...simpleW2Fixture,
    taxpayer: {
      ...simpleW2Fixture.taxpayer, taxYear: 2026,
      primary: { ...simpleW2Fixture.taxpayer.primary, employmentValidSsnIssuedByDueDate: true },
    },
    w2s: [{ ...simpleW2Fixture.w2s[0], taxYear: 2026, accountHolder: "primary", socialSecurityTips: "0" }],
    form1099Nec: [{
      taxYear: 2026, payer: "Fictional Second Employer", payerTin: "10-2345678", accountHolder: "primary",
      nonemployeeCompensation: "1000", qualifiedOvertimeCompensation: "200", federalWithheld: "100",
      originalForForm8919: {
        statementReference, recipientTin: simpleW2Fixture.taxpayer.primary.ssn,
        currentOriginalNoCorrectionsOrVoidsConfirmed: true,
        noDirectSalesOrParachutePaymentConfirmed: true,
      },
    }],
    form8919: {
      accountHolder: "primary", wagesNotReportedOnW2: "1000",
      reasonANecSource: verified ? {
        necSourceId: "form1099Nec:0", sourceTaxYear: 2026, statementReference,
        employerEin: "10-2345678", employerName: "Fictional Second Employer",
        determinationReference: "Synthetic private IRS determination 26601", determinationDate: "2026-11-01",
        determinationReceivedDate: "2026-11-02",
        employeeDeterminationConfirmed: true, allCompensationEmployeeWagesConfirmed: true,
        noEmployeeFicaWithheldConfirmed: true, receivedInsteadOfW2Confirmed: true,
      } : undefined,
    },
    schedule1A: {
      sourceTaxYear: 2026, sourceReference: "Synthetic verified Schedule 1-A source inventory", sourceFactsConfirmed: true,
      allSourcesIncluded: true, primarySsnEligible: true, excludedPuertoRicoIncome: "0", form4563Exclusion: "0",
      employeeTips: [], businessTips: [], vehicleLoans: [], seniorOwners: [],
      overtime: [{
        owner: "primary", qualifiedPremium: "200", reportedCompensation: "1000", requiredByFlsa: true,
        compensationSourceId: "form1099Nec:0", reportingSourceReference: statementReference,
      }],
    },
  });
}

it("carries the original NEC as Form 8919 wages and deducts qualified overtime once", () => {
  const input = fixture(true);
  const result = calculateFederalTax(input);
  const line = (form: string, id: string) => result.allLines.find(row => row.form === form && row.line === id)?.value.toFixed();
  expect(result.totalIncome.toFixed()).toBe("86000");
  expect(result.agi.toFixed()).toBe("86000");
  expect(result.taxableIncome.toFixed()).toBe("69700");
  expect(line("1040", "1g")).toBe("1000");
  expect(result.form8919?.line13.toFixed()).toBe("77");
  expect(result.selfEmploymentTax.toFixed()).toBe("0");
  expect(result.otherIncome.toFixed()).toBe("0");
  expect(result.schedule1A?.overtimeDeduction.toFixed()).toBe("200");
  expect(line("1040", "25b")).toBe("100");
  expect(JSON.stringify(result.allLines)).not.toContain(statementReference);
});

it("holds an original 2026 NEC overlap without a verified Form 8919 link", () => {
  expect(() => calculateFederalTax(fixture(false))).toThrow(/Form 8919.*1099-NEC/i);
});

it("holds a determination until its observed date", () => {
  const input = fixture(true);
  expect(() => calculateFederalTax(input, { asOfDate: "2026-11-01" })).toThrow(/Form 8919.*determination.*as-of date/i);
  expect(calculateFederalTax(input, { asOfDate: "2026-11-02" }).form8919?.line6.toFixed()).toBe("1000");
});
