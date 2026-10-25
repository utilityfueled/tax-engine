import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { assertPdfExportAllowed } from "./export-policy.js";
import { REVIEW_TEMPLATES_2025 } from "./mappings/2025/template-manifest.js";

interface TemplateRevision { readonly sha256: string; readonly revisionQualification: string }
const templates: Readonly<Record<string, TemplateRevision>> = Object.freeze(Object.fromEntries(
  Object.entries(REVIEW_TEMPLATES_2025).map(([name, entry]) => [name, Object.freeze({ ...entry })]),
));

/** Exact existing review snapshots; source-revision and human filing qualification remain separate. */
export const REVIEW_TEMPLATE_PACKS = Object.freeze({
  2025: Object.freeze({ taxYear: 2025, version: "2025.2-review", reviewStatus: "legacy-review-only",
    filingQualified: false, mappingDirectory: "src/pdf/mappings/2025", templates }),
});

export function resolveReviewTemplateDirectory(root: string, taxYear: number): string {
  assertPdfExportAllowed(taxYear, taxYear);
  return basename(root) === String(taxYear) ? root : join(root, String(taxYear));
}

export function assertReviewTemplateBytes(filename: string, bytes: Uint8Array, taxYear: number): TemplateRevision {
  assertPdfExportAllowed(taxYear, taxYear);
  const revision = templates[filename];
  if (!revision) throw new Error(`No registered review template: ${filename}.`);
  if (createHash("sha256").update(bytes).digest("hex") !== revision.sha256) {
    throw new Error(`Unreviewed template revision: ${filename}. Requalify the mapping before use.`);
  }
  return revision;
}
