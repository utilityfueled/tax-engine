import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFString } from "pdf-lib";
import type { QualifiedFilingForm, QualifiedFilingScenario } from "@/pdf/filing-registry.js";
import { buildFilingReturn } from "@/pdf/filing-return.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";
import { execFileSync } from "../helpers/file-stdin-exec.js";
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

async function syntheticAcroForm(id: string, label: string, value: string) {
  const blank = await PDFDocument.create();
  const page = blank.addPage();
  page.drawText(label, { x: 50, y: 725 });
  blank.getForm().createTextField("taxpayer-id").addToPage(page, { x: 50, y: 680, width: 250, height: 20 });
  const note = blank.context.register(blank.context.obj({
    Type: "Annot", Subtype: "Text", Rect: [40, 80, 60, 100], Contents: PDFString.of(`${label} note`),
  }));
  page.node.addAnnot(note);
  const bytes = await blank.save();
  const renderForm = vi.fn<QualifiedFilingForm["render"]>(async (_input, _result, templateBytes) => {
    const filled = await PDFDocument.load(templateBytes);
    filled.getForm().getTextField("taxpayer-id").setText(value);
    return filled;
  });
  const form: QualifiedFilingForm = {
    ...scenario().forms["1040"],
    id, filename: `${id}.pdf`, finalRevision: `synthetic-${id}-v1`,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    render: renderForm,
  };
  return { bytes, form, renderForm };
}

async function registerSyntheticPacket() {
  const cover = await syntheticAcroForm("z-cover", "Synthetic cover", "COVER-900-70-0011");
  const attachment = await syntheticAcroForm("a-attachment", "Synthetic attachment", "ATTACHMENT-900-70-0022");
  mocks.registry.synthetic = {
    ...scenario(),
    forms: { [attachment.form.id]: attachment.form, [cover.form.id]: cover.form },
    selectForms: () => [cover.form.id, attachment.form.id],
  };
  const coverPath = `/synthetic/2025/${cover.form.filename}`;
  const attachmentPath = `/synthetic/2025/${attachment.form.filename}`;
  mocks.read.mockImplementation(async (filename: string) => {
    if (filename === coverPath) return cover.bytes;
    if (filename === attachmentPath) return attachment.bytes;
    throw new Error(`Unexpected template path ${filename}`);
  });
  return { cover, attachment, coverPath, attachmentPath };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.registry)) delete mocks.registry[key];
  mocks.read.mockResolvedValue(template);
  mocks.rule.mockReturnValue({ taxYear: 2025, ruleVersion: "synthetic-test", filingQualified: true });
  mocks.calculate.mockReturnValue({ taxYear: 2025, scheduleB: { partThreeComplete: true } });
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
  it("preserves selected attachment order and visible values when flattening real AcroForms", async () => {
    const { cover, attachment, coverPath, attachmentPath } = await registerSyntheticPacket();
    const result = await buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic");
    expect(mocks.read.mock.calls).toEqual([[coverPath], [attachmentPath]]);
    expect(cover.renderForm.mock.calls.map(([, , bytes]) => bytes)).toEqual([cover.bytes]);
    expect(attachment.renderForm.mock.calls.map(([, , bytes]) => bytes)).toEqual([attachment.bytes]);
    expect(result.formRevisions).toEqual([cover.form, attachment.form].map(form => ({
      id: form.id, revision: form.finalRevision, sha256: form.sha256,
    })));

    const output = execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
import io, json, sys
from pypdf import PdfReader

packet = PdfReader(io.BytesIO(sys.stdin.buffer.read()), strict=True)
annotations = [[ref.get_object() for ref in p.get("/Annots", [])] for p in packet.pages]
print(json.dumps({
    "fields": list(packet.get_fields() or {}),
    "annotations": [[(a.get("/Subtype"), a.get("/Contents")) for a in page] for page in annotations],
    "pages": [(p.extract_text() or "").split() for p in packet.pages],
}))
`], { input: result.contents, encoding: "utf8", timeout: 5_000 });
    expect(JSON.parse(output)).toEqual({
      fields: [],
      annotations: [[["/Text", "Synthetic cover note"]], [["/Text", "Synthetic attachment note"]]],
      pages: [
        ["Synthetic", "cover", "COVER-900-70-0011"],
        ["Synthetic", "attachment", "ATTACHMENT-900-70-0022"],
      ],
    });
  });
  it("rejects a mismatched attachment pin before running either AcroForm renderer", async () => {
    const { cover, attachment, coverPath, attachmentPath } = await registerSyntheticPacket();
    mocks.read.mockResolvedValueOnce(cover.bytes).mockResolvedValueOnce(cover.bytes);

    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/requalified/);
    expect(mocks.read.mock.calls).toEqual([[coverPath], [attachmentPath]]);
    expect(cover.renderForm).not.toHaveBeenCalled();
    expect(attachment.renderForm).not.toHaveBeenCalled();
  });
  it("rejects a packet when a renderer cannot update a field appearance", async () => {
    const { cover, attachment } = await registerSyntheticPacket();
    cover.renderForm.mockImplementation(async (_input, _result, bytes) => {
      const filled = await PDFDocument.load(bytes);
      filled.getForm().getTextField("taxpayer-id").setText("🧾");
      return filled;
    });

    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/WinAnsi cannot encode/);
    expect(attachment.renderForm).not.toHaveBeenCalled();
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
  it("distinguishes omitted source statements from an explicit empty list", async () => {
    complete.mockImplementation(({ original, parsed }) => {
      expect(parsed.form1099Int).toEqual([]);
      if (!original || typeof original !== "object" || !Object.hasOwn(original, "form1099Int")
        || !Array.isArray(Reflect.get(original, "form1099Int"))) {
        throw new Error("Interest statement facts are unknown.");
      }
    });
    const { form1099Int, ...omitted } = simpleW2Fixture;
    await expect(buildFilingReturn(omitted, "synthetic", "/synthetic")).rejects.toThrow(/interest statement facts are unknown/i);
    await expect(buildFilingReturn({ ...omitted, form1099Int: undefined }, "synthetic", "/synthetic")).rejects.toThrow(/interest statement facts are unknown/i);
    expect(mocks.calculate).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
    await expect(buildFilingReturn({ ...omitted, form1099Int }, "synthetic", "/synthetic")).resolves.toMatchObject({ purpose: "filing" });
  });
  it("rejects a mismatched calculation year", async () => {
    mocks.calculate.mockReturnValue({ taxYear: 2026 });
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/years must match/);
  });
  it("rejects unresolved Schedule B applicability before selecting forms", async () => {
    const selectForms = vi.fn(() => ["1040"]);
    mocks.registry.synthetic = { ...scenario(), selectForms };
    mocks.calculate.mockReturnValue({ taxYear: 2025, scheduleB: { isRequired: false, partThreeComplete: false } });
    await expect(buildFilingReturn(simpleW2Fixture, "synthetic", "/synthetic")).rejects.toThrow(/Schedule B Part III/);
    expect(selectForms).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
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
