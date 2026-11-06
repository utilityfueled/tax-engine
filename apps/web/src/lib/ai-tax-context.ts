import "server-only";
import { calculateFederalTax } from "@/engine/federal";
import { TaxYearInputSchema } from "@/models/inputs";
import { getRulePack } from "@/models/rule-pack-metadata";
import type { VerifiedAiTaxContext } from "./ai-task-adapter";

/** These excerpts are the repository's year-specific specs, not new tax rules. */
export const AI_TAX_SOURCE_CATALOG = Object.freeze({
  2025: Object.freeze({
    specPath: "spec/federal/form-1040.yaml", sourceUrl: "https://www.irs.gov/instructions/i1040", revision: "2025 Form 1040 instructions",
    lines: Object.freeze({
      "11": "Adjusted gross income is total income minus adjustments to income.",
      "15": "Taxable income is adjusted gross income less total deductions, floored at zero.",
      "24": "Total tax combines income tax after nonrefundable credits and applicable other taxes.",
      "33": "Total payments combine federal withholding, estimated payments and refundable credits.",
      "34": "Overpayment is total payments minus total tax, floored at zero.",
      "37": "Amount owed is total tax minus total payments, floored at zero.",
    }),
  }),
  2026: Object.freeze({
    specPath: "spec/federal/rule-packs.yaml", sourceUrl: "https://www.irs.gov/irb/2025-45_IRB", revision: "Rev. Proc. 2025-32, section 4",
    lines: Object.freeze({}),
  }),
});
interface AuditScope { ownerScope: string; workspaceId: string; workspaceRevision: string }
export interface ServerVerifiedAiAudit extends AuditScope {
  readonly taxYear: number; readonly ruleVersion: string;
  readonly entries: ReadonlyArray<{ id: string; taxYear: number; value: string; explanation: string; line: string }>;
}
// JSON, browser previews and persisted assertions cannot forge a server calculation receipt.
const calculatedAudits = new WeakSet<ServerVerifiedAiAudit>();
function validScope(scope: AuditScope) { return !!scope.ownerScope.trim() && !!scope.workspaceId.trim() && !!scope.workspaceRevision.trim(); }

/** Server-only: call with a complete confirmed input within its authorized transient calculation request. */
export function calculateVerifiedAiAudit(scope: AuditScope, confirmedTaxInput: unknown): ServerVerifiedAiAudit {
  if (!validScope(scope)) throw new Error("Authenticated workspace scope and revision are required.");
  const input = TaxYearInputSchema.parse(confirmedTaxInput);
  const pack = getRulePack(input.taxpayer.taxYear);
  if (pack.calculationStatus === "incomplete") throw new Error("Year-specific federal calculation is unavailable.");
  const catalog = AI_TAX_SOURCE_CATALOG[input.taxpayer.taxYear as keyof typeof AI_TAX_SOURCE_CATALOG];
  if (!catalog || Object.keys(catalog.lines).length === 0) throw new Error("Year-specific AI tax excerpts are unavailable.");
  const result = calculateFederalTax(input);
  const entries = result.allLines.filter(line => line.form === "1040" && line.line in catalog.lines).map(line => Object.freeze({
    id: `audit:${result.taxYear}:1040:${line.line}`, taxYear: result.taxYear, line: line.line,
    value: line.value.toFixed(), explanation: line.description,
  }));
  const receipt = Object.freeze({ ...scope, taxYear: result.taxYear, ruleVersion: pack.ruleVersion, entries: Object.freeze(entries) });
  calculatedAudits.add(receipt);
  return receipt;
}

export function resolveServerAiTaxContext(input: AuditScope & { taxYear: number | null; audit?: ServerVerifiedAiAudit }):
  { status: "available"; context: VerifiedAiTaxContext } | { status: "unavailable"; reason: string; context: undefined } {
  const unavailable = (reason: string) => ({ status: "unavailable" as const, reason, context: undefined });
  if (input.taxYear === null || !Number.isSafeInteger(input.taxYear)) return unavailable("tax-year-unavailable");
  let pack;
  try { pack = getRulePack(input.taxYear); } catch { return unavailable("unknown-tax-year"); }
  if (pack.calculationStatus === "incomplete") return unavailable("year-calculation-incomplete");
  const catalog = AI_TAX_SOURCE_CATALOG[input.taxYear as keyof typeof AI_TAX_SOURCE_CATALOG];
  if (!catalog || !Object.keys(catalog.lines).length) return unavailable("year-spec-excerpts-unavailable");
  const audit = input.audit;
  if (!audit || !calculatedAudits.has(audit)) return unavailable("server-calculated-audit-unavailable");
  if (!validScope(input) || audit.ownerScope !== input.ownerScope || audit.workspaceId !== input.workspaceId
    || audit.workspaceRevision !== input.workspaceRevision || audit.taxYear !== input.taxYear || audit.ruleVersion !== pack.ruleVersion) {
    return unavailable("audit-scope-or-version-mismatch");
  }
  if (!audit.entries.length) return unavailable("matching-audit-lines-unavailable");
  return { status: "available", context: {
    taxYear: input.taxYear, ruleVersion: pack.ruleVersion,
    excerpts: audit.entries.map(entry => ({ id: `spec:${input.taxYear}:1040:${entry.line}`, taxYear: audit.taxYear,
      text: `${catalog.specPath} line ${entry.line}. ${catalog.lines[entry.line as keyof typeof catalog.lines]} Source: ${catalog.sourceUrl}, ${catalog.revision}. This calculation does not establish filing readiness.` })),
    auditEntries: audit.entries.map(({ line: _line, ...entry }) => entry),
  } };
}
