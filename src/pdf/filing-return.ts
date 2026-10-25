import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { TaxYearInputSchema } from "@/models/inputs.js";
import { getRulePack } from "@/models/rule-pack-metadata.js";
import { calculateFederalTax } from "@/engine/federal.js";
import { QUALIFIED_FILING_SCENARIOS } from "./filing-registry.js";
import { REVIEW_PDF_NOTICE } from "./export-policy.js";

export interface FilingReturnDownload {
  readonly purpose: "filing";
  readonly taxYear: number;
  readonly scenarioId: string;
  readonly ruleVersion: string;
  readonly formRevisions: readonly { id: string; revision: string; sha256: string }[];
  readonly contents: Uint8Array;
}

/** Complete-data filing lane, separate from redacted review PDFs and backups.
 * All gates precede output. The public registry is currently empty; this cannot
 * enable filing until independently reviewed release entries are committed.
 * templatesRoot is a trusted operator/library path, never a request parameter.
 */
export async function buildFilingReturn(
  rawInput: unknown,
  scenarioId: string,
  templatesRoot: string,
): Promise<FilingReturnDownload> {
  if (!Object.hasOwn(QUALIFIED_FILING_SCENARIOS, scenarioId)) {
    throw new Error("Filing exports are unavailable for this scenario until independent qualification and release approval are complete.");
  }
  const scenario = QUALIFIED_FILING_SCENARIOS[scenarioId];
  const input = TaxYearInputSchema.parse(rawInput);
  const year = input.taxpayer.taxYear;
  const rule = getRulePack(year);
  if (scenario.id !== scenarioId || scenario.taxYear !== year || rule.taxYear !== year || rule.ruleVersion !== scenario.ruleVersion
    || !rule.filingQualified || rule.calculationStatus === "incomplete" || rule.reviewStatus === "independent-review-pending"
    || !scenario.independentTaxReview.trim()
    || !scenario.independentSecurityReview.trim() || !scenario.releaseApproval.trim()) {
    throw new Error("Filing qualification does not match the current year, rules or required approvals.");
  }
  // This per-scenario validator must require actual facts; parsing defaults alone
  // do not establish completeness. No redaction is applied to this input.
  scenario.validateCompleteInput(input);
  const result = calculateFederalTax(input);
  if (result.taxYear !== year) throw new Error("Filing calculation and input years must match.");
  const ids = scenario.selectForms(input, result);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new Error("Filing packet requires a complete, unique attachment list.");
  }
  const selected = ids.map(id => {
    if (!Object.hasOwn(scenario.forms, id)) throw new Error("A required filing form is not qualified.");
    const form = scenario.forms[id];
    if (form.id !== id || form.taxYear !== year || !/^[a-z0-9][a-z0-9._-]*\.pdf$/i.test(form.filename)
      || !/^[a-f0-9]{64}$/.test(form.sha256) || !form.finalRevision.trim()
      || !form.independentMappingReview.trim() || !/^https:\/\//.test(form.officialSource)) {
      throw new Error("A required final form revision or mapping review is invalid.");
    }
    return form;
  });
  // Verify every exact template revision before invoking any renderer.
  const templates: Uint8Array[] = [];
  for (const form of selected) {
    const bytes = await readFile(join(templatesRoot, String(year), form.filename));
    if (createHash("sha256").update(bytes).digest("hex") !== form.sha256) {
      throw new Error("A filing template changed and must be independently requalified.");
    }
    templates.push(bytes);
  }
  const packet = await PDFDocument.create();
  for (const [index, form] of selected.entries()) {
    const doc = await form.render(input, result, templates[index]);
    if (doc.getSubject() === REVIEW_PDF_NOTICE || doc.getPageCount() === 0) {
      throw new Error("A review or empty document cannot be included in a filing export.");
    }
    doc.getForm().flatten();
    for (const page of await packet.copyPages(doc, doc.getPageIndices())) packet.addPage(page);
  }
  packet.setTitle(`Tax return ${year}`);
  packet.setSubject(`Filing export: ${scenario.id}; rules ${scenario.ruleVersion}`);
  return {
    purpose: "filing", taxYear: year, scenarioId, ruleVersion: rule.ruleVersion,
    formRevisions: selected.map(form => ({ id: form.id, revision: form.finalRevision, sha256: form.sha256 })),
    contents: await packet.save(),
  };
}
