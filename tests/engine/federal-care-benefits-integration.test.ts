// Spec: spec/federal/form-2441-return-integration.yaml; IRS2441 printed lines.
import { describe, it, expect } from "vitest";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculateDependentCareBenefitSources } from "@/engine/forms/dependent-care-benefit-sources.js";
import { calculateForm2441Benefits } from "@/engine/forms/form-2441-benefits.js";
import { TaxYearInputSchema, type DependentCareBenefits } from "@/models/inputs.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
const employee = { sourceId: "w2:0", owner: "primary" as const, benefitsReported: "2000", alreadyIncludedInWages: "0", priorYearCarryoverUsed: "0", forfeited: "0", carriedForward: "0" };
const facts = (overrides: Partial<DependentCareBenefits> = {}): DependentCareBenefits => ({ sourceFactsConfirmed: true, exclusionEligibilityConfirmed: true, employeeBenefits: [employee], selfEmployedBenefits: [], deductionAllocations: [], planExclusionLimit: "5000", qualifiedExpensesIncurred: "5000", primaryEarnedIncome: "85000", earnedIncomeWorksheetConfirmed: true, qualifyingIndividuals: 1, qualifiedExpensesPaidForCredit: "0", creditExpenseCoordinationConfirmed: true, ...overrides });
const make = (overrides: Record<string, unknown> = {}) => TaxYearInputSchema.parse({ ...simpleW2Fixture, w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", box10DependentCareBenefits: "2000" }], dependentCareBenefits: facts(), ...overrides });
const businessFacts = (schedule: "schedule-c" | "schedule-f", alreadyDeducted: string) => {
    const sourceId = schedule === "schedule-c" ? "scheduleC" : "scheduleF";
    return facts({ employeeBenefits: [], selfEmployedBenefits: [{ sourceId, owner: "primary", schedule, benefitsReceived: "2000", priorYearCarryoverUsed: "0", alreadyDeducted }], deductionAllocations: [{ sourceId, owner: "primary", schedule, amount: "2000" }], primaryEarnedIncome: "91076" });
};
describe("Form2441 actual return benefit sources", () => {
    it("adds only additional taxable benefits and retains benefits-only results", () => {
        const r = calculateFederalTax(make({ dependentCareBenefits: facts({ qualifiedExpensesIncurred: "900" }) }));
        expect(r.form2441Benefits?.taxableBenefits.toString()).toBe("1100");
        expect(r.totalWages.toString()).toBe("86100");
        expect(r.agi.toString()).toBe("86100");
        expect(r.form2441).toBeUndefined();
        expect(r.allLines.filter(l => l.form === "Form 2441" && l.line === "26")).toHaveLength(1);
        expect(r.allLines.find(l => l.form === "1040" && l.line === "1e")?.value.toString()).toBe("1100");
        const already = calculateFederalTax(make({ w2s: [{ ...simpleW2Fixture.w2s[0], accountHolder: "primary", box10DependentCareBenefits: "6000" }], dependentCareBenefits: facts({ employeeBenefits: [{ ...employee, benefitsReported: "6000", alreadyIncludedInWages: "1000" }] }) }));
        expect(already.totalWages.toString()).toBe("85000");
        expect(already.form2441Benefits?.taxableBenefits.toString()).toBe("0");
    });
    it("rejects missing and contradictory original benefit sources", () => {
        expect(() => calculateFederalTax(make({ dependentCareBenefits: undefined }))).toThrow(/dependent-care benefit sources/);
        expect(() => calculateFederalTax(make({ dependentCareBenefits: facts({ employeeBenefits: [{ ...employee, benefitsReported: "1999" }] }) }))).toThrow(/Box10/);
        expect(() => calculateFederalTax(make({ dependentCareBenefits: facts({ employeeBenefits: [{ ...employee, sourceId: "w2:9" }] }) }))).toThrow(/W2 source/);
        expect(() => calculateFederalTax(make({ dependentCareBenefits: facts({ employeeBenefits: [] }) }))).toThrow(/unmatched/);
        const source = make();
        const result = calculateForm2441Benefits({ taxYear: 2025, filingStatus: "single", facts: source.dependentCareBenefits });
        expect(() => calculateDependentCareBenefitSources({ ...source, w2s: [{ ...source.w2s[0], accountHolder: "spouse" }] }, result)).toThrow(/owner/);
        expect(() => calculateDependentCareBenefitSources({ ...source, taxpayer: { ...source.taxpayer, taxYear: 2026 }, w2s: [{ ...source.w2s[0], box10DependentCareBenefits: undefined }] }, undefined)).toThrow(/Box10.*unknown/);
    });
    it("reconciles ScheduleC benefits before SE and QBI without double deductions", () => {
        for (const reported of ["0", "2000", "2500"]) {
            const input = make({ w2s: [], scheduleC: { accountHolder: "primary", grossReceipts: "100000", expenses: { employeeBenefitPrograms: reported } }, dependentCareBenefits: businessFacts("schedule-c", reported) });
            const r = calculateFederalTax(input);
            expect(r.scheduleC?.expenseBreakdown["Employee benefit programs"].toString()).toBe("2000");
            expect(r.scheduleC?.netProfit.toString()).toBe("98000");
            expect(r.scheduleSE?.netSEEarnings.toString()).toBe("98000");
            expect(input.scheduleC?.expenses?.employeeBenefitPrograms).toBe(reported);
        }
        expect(() => calculateFederalTax(make({ w2s: [], scheduleC: { accountHolder: "primary", grossReceipts: "100000", expenses: { employeeBenefitPrograms: "1999" } }, dependentCareBenefits: businessFacts("schedule-c", "2000") }))).toThrow(/already deducted/);
    });
    it("reconciles actual farm benefits and refuses unimplemented ScheduleE attribution", () => {
        const r = calculateFederalTax(make({ w2s: [], scheduleF: { accountHolder: "primary", salesOfProductsRaised: "100000", expenses: { employeeBenefits: "2500" } }, dependentCareBenefits: businessFacts("schedule-f", "2500") }));
        expect(r.scheduleF?.expenseBreakdown["Employee benefits"].toString()).toBe("2000");
        expect(r.scheduleF?.netFarmProfit.toString()).toBe("98000");
        expect(r.scheduleSE?.netFarmProfit.toString()).toBe("98000");
        const unsupported = facts({ employeeBenefits: [], selfEmployedBenefits: [{ sourceId: "scheduleK1:0", owner: "primary", schedule: "schedule-e", benefitsReceived: "2000", priorYearCarryoverUsed: "0", alreadyDeducted: "0" }], deductionAllocations: [{ sourceId: "scheduleK1:0", owner: "primary", schedule: "schedule-e", amount: "2000" }] });
        expect(() => calculateFederalTax(make({ w2s: [], dependentCareBenefits: unsupported }))).toThrow(/ScheduleE.*coordination/);
    });
    it("hands off net credit expenses once including actual MFS exception", () => {
        const care = { expenses: "5000", qualifyingIndividuals: 1, primaryEarnedIncome: "85000", priorYearExpenseCredit: "0", eligibilityConfirmed: true };
        const benefits = facts({ qualifiedExpensesPaidForCredit: "3000" });
        const r = calculateFederalTax(make({ dependentCare: care, dependentCareBenefits: benefits }));
        expect(r.form2441?.credit.toString()).toBe("200"); // min(3000-2000,3000)*20%.
        expect(r.form2441Benefits?.qualifyingCreditExpenses.toString()).toBe("1000");
        expect(r.allLines.filter(l => l.form === "Form 2441" && l.line === "28")).toHaveLength(1);
        const mfs = calculateFederalTax(make({ taxpayer: { ...simpleW2Fixture.taxpayer, filingStatus: "married_filing_separately" }, dependentCare: care, dependentCareBenefits: { ...benefits, spouseLivedApartLast6Months: true, paidOverHalfHomeCost: true, qualifyingPersonMainHomeOverHalfYear: true } }));
        expect(mfs.form2441?.credit.toString()).toBe("200");
    });
});
