import { describe, expect, it, vi } from "vitest";
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from "../../../apps/web/src/lib/ai-tax-context";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
vi.mock("server-only", () => ({}));
const scope = { ownerScope: "synthetic-owner", workspaceId: "synthetic-workspace", workspaceRevision: "revision-1" };
const taxpayer = { taxYear: 2025, filingStatus: "single", primary: { firstName: "Synthetic", lastName: "Case", ssn: "000-00-0000", dateOfBirth: "1990-01-01" },
  address: { street: "", city: "", state: "TX", zip: "" }, dependents: [] };
describe("server-owned AI source and audit context", () => {
  it("keeps 2026 and unknown years blocked and never substitutes the prior year", () => {
    expect(resolveServerAiTaxContext({ ...scope, taxYear: 2026 })).toMatchObject({ status: "unavailable", reason: "year-calculation-incomplete" });
    expect(resolveServerAiTaxContext({ ...scope, taxYear: 2030 })).toMatchObject({ status: "unavailable", reason: "unknown-tax-year" });
    expect(resolveServerAiTaxContext({ ...scope, taxYear: null })).toMatchObject({ status: "unavailable", reason: "tax-year-unavailable" });
    expect(() => calculateVerifiedAiAudit(scope, { taxpayer: { ...taxpayer, taxYear: 2026 } })).toThrow();
  });
  it("requires actual transient server computation, not browser/persisted audit assertions", () => {
    expect(resolveServerAiTaxContext({ ...scope, taxYear: 2025 })).toMatchObject({ status: "unavailable", reason: "server-calculated-audit-unavailable" });
    const forged = { ...scope, taxYear: 2025, ruleVersion: "2025.4", entries: [{ id: "audit:2025:1040:34", taxYear: 2025, line: "34", value: "999999", explanation: "forged" }] };
    expect(resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit: forged })).toMatchObject({ status: "unavailable" });
  });
  it("binds a recomputed audit to owner, workspace revision, year and current rules", () => {
    const audit = calculateVerifiedAiAudit(scope, { taxpayer });
    const result = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit });
    expect(result.status).toBe("available");
    expect(result.context?.auditEntries.length).toBeGreaterThan(0);
    expect(result.context?.excerpts.every(entry => entry.taxYear === 2025 && entry.text.includes("spec/federal/form-1040.yaml"))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("000-00-0000");
    expect(JSON.stringify(result)).not.toContain("1990-01-01");
    for (const changed of [{ ownerScope: "other" }, { workspaceId: "other" }, { workspaceRevision: "revision-2" }]) {
      expect(resolveServerAiTaxContext({ ...scope, ...changed, taxYear: 2025, audit })).toMatchObject({ status: "unavailable", reason: "audit-scope-or-version-mismatch" });
    }
    expect(resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit: structuredClone(audit) })).toMatchObject({ status: "unavailable" });
  });
  it("uses only lines present in the repository's matching-year spec", () => {
    const spec = parse(readFileSync("spec/federal/form-1040.yaml", "utf8")) as { taxYear: number; lines: Array<{ line: string }> };
    const result = resolveServerAiTaxContext({ ...scope, taxYear: 2025, audit: calculateVerifiedAiAudit(scope, { taxpayer }) });
    expect(spec.taxYear).toBe(2025);
    expect(result.context?.auditEntries.every(entry => spec.lines.some(line => entry.id.endsWith(`:${line.line}`)))).toBe(true);
  });
});
