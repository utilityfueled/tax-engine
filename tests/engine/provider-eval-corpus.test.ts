import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { AI_TASKS } from "../../packages/engine/src/ai-task-registry";
import { taxProviderModelEvalFixtures as cases } from "../../packages/engine/src/provider-eval-fixtures";

describe("representative draft evaluation corpus", () => {
  it("preserves distinct source boundaries and review criteria across every task", () => {
    expect(cases).toHaveLength(240);
    expect(new Set(cases.map(item => item.input)).size).toBe(240);
    expect(new Set(cases.map(item => item.reviewCriteria.join("\n"))).size).toBe(240);
    for (const task of Object.keys(AI_TASKS)) {
      const taskCases = cases.filter(item => item.task === task);
      expect(taskCases).toHaveLength(30);
      expect(taskCases.filter(item => item.split === "held-out")).toHaveLength(10);
      expect(taskCases.filter(item => item.split === "development")).toHaveLength(20);
    }
    for (const item of cases) {
      expect(item.reviewCriteria.length).toBeGreaterThan(0);
      expect(item.reviewCriteria.every(criterion => criterion.length > 30)).toBe(true);
      expect(item.sourceIds).toEqual([`${item.id}:source`]);
      expect(item.input).toContain(item.sourceIds[0]);
      expect(item.tags).toContain("individually-authored-draft");
      for (const field of Object.values(item.expected.fields)) {
        if (field.kind === "money") expect(new Decimal(field.value).isFinite()).toBe(true);
        if (field.kind === "date") expect(field.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
  it("covers concrete source and safety challenges without promoting synthetic evidence", () => {
    for (const tag of ["correction", "duplicate-identity", "missing-facts", "conflicting-sources", "explicit-zero", "year-conflict", "owner-unknown", "privacy", "prompt-injection", "engine-override", "readiness", "precision-stress"]) {
      expect(cases.some(item => item.tags.includes(tag)), tag).toBe(true);
    }
    expect(cases.every(item => item.review.status === "pending" && item.review.reviewer === null && item.review.reviewedAt === null)).toBe(true);
    expect(cases.some(item => item.expected.disposition === "abstain")).toBe(true);
    expect(cases.some(item => Object.keys(item.expected.engineValues).length > 0)).toBe(true);
    expect(cases.find(item => item.id === "case-income-large-ledger-precision")?.expected.fields.amount?.value).toBe("90071992547409.91");
    expect(cases.find(item => item.id === "case-expense-identical-two-charges")?.expected.fields.rowCount?.value).toBe("2");
    expect(cases.find(item => item.id === "case-reconcile-account-replaced")?.expected.disposition).toBe("abstain");
    expect(cases.find(item => item.id === "case-explain-foreign-deduction-year")?.expected.engineValues["FTC:currentCredit"]).toBe("0");
  });
});
