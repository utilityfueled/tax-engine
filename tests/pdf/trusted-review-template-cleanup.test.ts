/** Spec: spec/federal/pdf-trusted-review-template-cleanup.yaml. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDict, PDFDocument, PDFName, PDFRef, PDFString } from "pdf-lib";
import { expect, it, vi } from "vitest";
import { buildWorkspaceFilledReturnDownload } from "@/lib/workspace-filled-return";
import { createWorkspaceRecord } from "@/lib/workspace-storage";
import { calculateFederalTax } from "@/engine/federal.js";
import { REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import { FORM_1040_FIELDS } from "@/pdf/fill-form-1040.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { loadBlankPdf, loadReviewTemplate } from "@/pdf/pdf-utils.js";
import { guidedMarketplaceActualCashState } from "../fixtures/guided-marketplace-actual-cash.js";
import { simpleW2Fixture } from "../fixtures/simple-w2.js";

vi.mock("server-only", () => ({}));

const blankDir = "forms/blank/2025";
const blank = join(blankDir, "f1040.pdf");
const permissionsKey = PDFName.of("Perms");
const xfaKey = PDFName.of("XFA");
const signatureFlagsKey = PDFName.of("SigFlags");
const reader = fileURLToPath(new URL("./helpers/trusted-review-template-reader.py", import.meta.url));

interface ReviewArtifact {
  permissions: boolean;
  forbiddenEntries: string[];
  scriptStreams: number[];
  pages: string[];
  widgetCount: number;
  canonicalValues: Record<string, string>;
}

function inspect(path: string): ReviewArtifact {
  return JSON.parse(execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", [reader, path], {
    encoding: "utf8", timeout: 10000,
  })) as ReviewArtifact;
}

function expectClean(artifact: ReviewArtifact) {
  expect(artifact.permissions).toBe(false);
  expect(artifact.forbiddenEntries).toEqual([]);
  expect(artifact.scriptStreams).toEqual([]);
  for (const page of artifact.pages) expect(page).toContain(REVIEW_PDF_NOTICE);
}

it("scrubs official standalone review outputs and leaves the original unchanged", async () => {
  const source = inspect(blank);
  expect(source.permissions).toBe(true);
  expect(source.forbiddenEntries).toEqual(expect.arrayContaining(["/XFA", "/UR3", "/SigFlags"]));
  expect(source.scriptStreams.length).toBeGreaterThan(0);
  const sourceHash = createHash("sha256").update(await readFile(blank)).digest("hex");
  const input = simpleW2Fixture;
  const result = calculateFederalTax(input);
  const directory = await mkdtemp(join(tmpdir(), "trusted-review-standalone-"));
  try {
    for (const flatten of [false, true]) {
      const packet = await fillReturn(input, result, { blankFormsDir: blankDir, outputDir: directory, flatten });
      const path = join(directory, "f1040-filled.pdf");
      expect(packet.filledForms).toContain(path);
      const reopened = inspect(path);
      expectClean(reopened);
      expect(reopened.pages).toHaveLength(2);
      if (flatten) {
        expect(reopened.widgetCount).toBe(0);
        expect(reopened.pages.join(" ")).toContain("85000");
      } else {
        expect(reopened.widgetCount).toBe(source.widgetCount);
        expect(reopened.canonicalValues[FORM_1040_FIELDS.line1a]).toBe("85000");
      }
    }
    expect(createHash("sha256").update(await readFile(blank)).digest("hex")).toBe(sourceHash);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("preserves references shared by surviving objects and other signature structures", async () => {
  const { removeTrustedTemplateLegacyFormData } = await import("@/pdf/trusted-review-template-cleanup.js");
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();
  const field = form.createTextField("ordinary");
  field.setText("kept value");
  field.addToPage(page);
  const privatePacket = doc.context.register(doc.context.flateStream("<script>legacy</script>"));
  const sharedPacket = doc.context.register(doc.context.flateStream("shared"));
  const sharedAnchor = doc.context.register(doc.context.obj({ Shared: sharedPacket }));
  doc.catalog.set(PDFName.of("PrivateSharedAnchor"), sharedAnchor);
  const array = doc.context.register(doc.context.obj([
    PDFString.of("template"), privatePacket, PDFString.of("config"), sharedPacket,
  ]));
  form.acroForm.dict.set(xfaKey, array);

  const rights = doc.context.register(doc.context.obj({ Type: "Sig", ByteRange: [0, 5, 10, 15] }));
  const permission = doc.context.register(doc.context.obj({ UR3: rights, DocMDP: "Preserve" }));
  doc.catalog.set(permissionsKey, permission);
  form.acroForm.dict.set(signatureFlagsKey, doc.context.obj(3));
  const unsignedWidget = doc.context.register(doc.context.obj({
    Type: "Annot", Subtype: "Widget", FT: "Sig", T: PDFString.of("unsigned"), Rect: [40, 200, 60, 220], P: page.ref,
  }));
  form.acroForm.addField(unsignedWidget);
  page.node.addAnnot(unsignedWidget);
  removeTrustedTemplateLegacyFormData(doc);

  const reopened = await PDFDocument.load(await doc.save());
  expect(reopened.context.lookup(privatePacket)).toBeUndefined();
  expect(reopened.context.lookup(array)).toBeUndefined();
  expect(reopened.context.lookup(rights)).toBeUndefined();
  expect(reopened.catalog.get(permissionsKey)).toEqual(permission);
  expect(reopened.context.lookup(sharedPacket)).toBeDefined();
  expect(reopened.context.lookup(sharedAnchor, PDFDict).get(PDFName.of("Shared"))).toEqual(sharedPacket);
  expect(reopened.catalog.lookup(permissionsKey, PDFDict).get(PDFName.of("DocMDP"))).toBe(PDFName.of("Preserve"));
  expect(reopened.catalog.lookup(permissionsKey, PDFDict).get(PDFName.of("UR3"))).toBeUndefined();
  expect(reopened.catalog.getAcroForm()?.dict.get(signatureFlagsKey)?.toString()).toBe("3");
  expect(reopened.getForm().getTextField("ordinary").getText()).toBe("kept value");
  expect(reopened.getForm().getField("unsigned").ref).toEqual(unsignedWidget);
});

it("keeps the actual workspace packet clean and redacted", async () => {
  const state = guidedMarketplaceActualCashState(true);
  const workspace = createWorkspaceRecord("fictional-registered-template-review");
  workspace.returnSummary.targetTaxYear = 2025;
  const download = await buildWorkspaceFilledReturnDownload(workspace, state);
  expect(download.includedForms).toContain("f1040-filled.pdf");
  const directory = await mkdtemp(join(tmpdir(), "trusted-review-workspace-"));
  try {
    const path = join(directory, "review.pdf");
    await writeFile(path, download.contents);
    const reopened = inspect(path);
    expectClean(reopened);
    expect(reopened.widgetCount).toBe(0);
    expect(reopened.pages.join(" ")).toContain("ACTUAL CASH WITH ZERO FINAL CREDIT");
    expect(reopened.pages.join(" ")).not.toMatch(/123.?45.?6789|987.?65.?4321|234.?56.?7890/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("limits cleanup to the verified template loader", async () => {
  const unchanged = await loadBlankPdf(blank);
  expect(unchanged.catalog.get(permissionsKey)).toBeInstanceOf(PDFRef);
  expect(unchanged.catalog.getAcroForm()?.dict.has(xfaKey)).toBe(true);
  const verified = await loadReviewTemplate(blank, 2025);
  expect(verified.catalog.get(permissionsKey)).toBeUndefined();
  expect(verified.catalog.getAcroForm()?.dict.has(xfaKey)).toBe(false);

  const paBlank = join(blankDir, "pa-40.pdf");
  const paOriginal = await loadBlankPdf(paBlank);
  expect(paOriginal.catalog.get(permissionsKey)).toBeInstanceOf(PDFDict);
  expect(paOriginal.catalog.getAcroForm()?.dict.has(xfaKey)).toBe(false);
  const paReview = await loadReviewTemplate(paBlank, 2025);
  expect(paReview.catalog.get(permissionsKey)).toBeUndefined();
  expect(paReview.catalog.getAcroForm()?.dict.get(signatureFlagsKey)).toBeUndefined();
  expect(paReview.getForm().getFields().map(field => field.getName()))
    .toEqual(paOriginal.getForm().getFields().map(field => field.getName()));

  const directory = await mkdtemp(join(tmpdir(), "trusted-review-revision-"));
  try {
    const altered = join(directory, "f1040.pdf");
    await writeFile(altered, Buffer.concat([await readFile(blank), Buffer.from("\n")]));
    await expect(loadReviewTemplate(altered, 2025)).rejects.toThrow(/unreviewed template revision/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
