import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { QualifiedFilingScenario } from "@/pdf/filing-registry.js";
import { buildFilingReturn } from "@/pdf/filing-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";

// Synthetic pipeline seam only. The shipped registry stays empty and no real
// rule pack, source form or human review is qualified by this fixture.
const mocks = vi.hoisted(() => ({ registry: {} as Record<string, QualifiedFilingScenario>, read: vi.fn(), calculate: vi.fn(), rule: vi.fn() }));
vi.mock("@/pdf/filing-registry.js", () => ({ QUALIFIED_FILING_SCENARIOS: mocks.registry }));
vi.mock("node:fs/promises", () => ({ readFile: mocks.read }));
vi.mock("@/engine/federal.js", () => ({ calculateFederalTax: mocks.calculate }));
vi.mock("@/models/rule-pack-metadata.js", async importOriginal => ({
  ...await importOriginal<typeof import("@/models/rule-pack-metadata.js")>(), getRulePack: mocks.rule,
}));
const template = new Uint8Array([1, 2, 3]);
const sha256 = createHash("sha256").update(template).digest("hex");
let render: ReturnType<typeof vi.fn>;
let complete: ReturnType<typeof vi.fn>;
function scenario(): QualifiedFilingScenario { return mocks.registry.synthetic; }

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.registry)) delete mocks.registry[key];
  mocks.read.mockResolvedValue(template);
  mocks.rule.mockReturnValue({ taxYear: 2025, ruleVersion: "synthetic-test", filingQualified: true });
  mocks.calculate.mockReturnValue({ taxYear: 2025 });
  complete = vi.fn();
  render = vi.fn(async () => { const doc = await PDFDocument.create(); doc.addPage(); return doc; });
  mocks.registry.synthetic = { id: "synthetic", taxYear: 2025, ruleVersion: "synthetic-test", independentTaxReview: "synthetic test only", independentSecurityReview: "synthetic test only", releaseApproval: "synthetic test only", validateCompleteInput: complete, selectForms: () => ["1040"], forms: { "1040": { id: "1040", taxYear: 2025, filename: "synthetic.pdf", sha256, finalRevision: "synthetic test only", officialSource: "https://example.invalid/synthetic", independentMappingReview: "synthetic test only", render } } };
});

describe("complete-data filing pipeline remains distinct from review export", () => {
  it.each(["unknown", "__proto__", "constructor"])("rejects unregistered scenario %s before parsing facts or reading files", async id => {
    await expect(buildFilingReturn(null, id, "/unused")).rejects.toThrow(/unavailable/);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.calculate).not.toHaveBeenCalled();
  });
  it("passes complete identifiers to the dedicated renderer, with exact verified form revisions", async () => {
    const result = await buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic");
    expect(complete).toHaveBeenCalledOnce();
    expect(render.mock.calls[0]?.[0]?.taxpayer.primary.ssn).toBe(simpleW2Fixture.taxpayer.primary.ssn);
    expect(result).toMatchObject({ purpose: "filing", taxYear: 2025, scenarioId: "synthetic", formRevisions: [{ id: "1040", sha256 }] });
    expect((await PDFDocument.load(result.contents)).getPageCount()).toBe(1);
    expect(mocks.read).toHaveBeenCalledWith("/synthetic/2025/synthetic.pdf");
  });
  it.each(["unqualified rules", "stale version", "wrong year", "missing tax review", "missing security review", "missing approval"])("rejects %s", async reason => {
    if (reason === "unqualified rules") mocks.rule.mockReturnValue({ ruleVersion: "synthetic-test", filingQualified: false });
    if (reason === "stale version") mocks.rule.mockReturnValue({ ruleVersion: "changed", filingQualified: true });
    if (reason === "wrong year") mocks.registry.synthetic = { ...scenario(), taxYear: 2026 };
    if (reason === "missing tax review") mocks.registry.synthetic = { ...scenario(), independentTaxReview: "" };
    if (reason === "missing security review") mocks.registry.synthetic = { ...scenario(), independentSecurityReview: "" };
    if (reason === "missing approval") mocks.registry.synthetic = { ...scenario(), releaseApproval: "" };
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/qualification/);
    expect(mocks.calculate).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled();
  });
  it("rejects unknown required facts before calculation", async () => {
    complete.mockImplementation(() => { throw new Error("Required source facts are unknown"); });
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/unknown/);
    expect(mocks.calculate).not.toHaveBeenCalled();
  });
  it("rejects a mismatched calculation year", async () => {
    mocks.calculate.mockReturnValue({ taxYear: 2026 });
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/years must match/);
  });
  it.each([{ ids: [] }, { ids: ["1040", "1040"] }, { ids: ["missing"] }])("rejects incomplete or duplicate attachment lists $ids", async ({ ids }) => {
    mocks.registry.synthetic = { ...scenario(), selectForms: () => ids };
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/form|attachment/);
    expect(render).not.toHaveBeenCalled();
  });
  it.each([{ taxYear: 2026 }, { filename: "../private.pdf" }, { sha256: "unknown" }, { finalRevision: "" }, { independentMappingReview: "" }, { officialSource: "http://example.invalid" }])("rejects invalid form metadata %j", async change => {
    mocks.registry.synthetic = { ...scenario(), forms: { "1040": { ...scenario().forms["1040"], ...change } } };
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/revision|review/);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("rejects changed bytes before rendering", async () => {
    mocks.read.mockResolvedValue(new Uint8Array([4]));
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/requalified/);
    expect(render).not.toHaveBeenCalled();
  });
  it.each(["review", "empty"])("rejects a %s renderer result", async kind => {
    render.mockImplementation(async () => { const doc = await PDFDocument.create(); if (kind === "review") { doc.addPage(); doc.setSubject(REVIEW_PDF_NOTICE); } return doc; });
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/review or empty/);
  });
});
