// Spec: spec/federal/form-8863-2026.yaml
import { describe, it, expect } from "vitest";
import { EducationExpensesSchema } from "@/models/inputs.js";
describe("2026 education identification facts", () => {
  it("retains explicit SSN eligibility and institution EIN", () => {
    const facts = EducationExpensesSchema.parse({ primarySsnEligible: true, spouseSsnEligible: false, aocStudents: [{ name: "Test", qualifiedExpenses: "4000", studentSsnEligible: false, institutionEin: "12-3456789" }] });
    expect(facts).toMatchObject({ primarySsnEligible: true, spouseSsnEligible: false, aocStudents: [{ studentSsnEligible: false, institutionEin: "12-3456789" }] });
  });
  it("preserves omitted identification as unknown", () => {
    expect(EducationExpensesSchema.parse({ aocStudents: [{ name: "Test", qualifiedExpenses: "4000" }] })).not.toHaveProperty("primarySsnEligible");
  });
  it("rejects malformed supplied institution identity", () => {
    expect(EducationExpensesSchema.safeParse({ aocStudents: [{ name: "Test", qualifiedExpenses: "4000", institutionEin: "invalid" }] }).success).toBe(false);
  });
});
