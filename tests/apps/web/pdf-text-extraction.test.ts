import { describe, expect, it, vi } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractPdfTextFromFile, prepareUploadableFiles } from "../../../apps/web/src/lib/uploaded-document-detection";
import { createWorkspaceRecord, ingestFilesIntoWorkspace } from "../../../apps/web/src/lib/workspace-storage";
import { reconcileWorkspaceGuidedState } from "../../../apps/web/src/lib/workspace-guided-state";
import { startCompleteInterview } from "../../guided-interview/complete-facts";

vi.mock("server-only", () => ({}));

async function syntheticDocument() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage();
  first.drawText("Wages 12345.67", { x: 40, y: 700, size: 12, font });
  first.drawText("Federal withholding 890.12", { x: 40, y: 680, size: 12, font });
  pdf.addPage().drawText("Second page 2025-12-31", { x: 40, y: 700, size: 12, font });
  return new Uint8Array(await pdf.save());
}

describe("PDF.js 6 text extraction with synthetic documents", () => {
  // Spec: spec/federal/workspace-guided-year.yaml#marketplace-upload-year.
  it("keeps Marketplace PDF source years and statement designations manual through normal upload", async () => {
    // Mirror the official2026 text layout; checkbox appearances are not source text.
    for (const status of ["original", "corrected", "voided"] as const) {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const page = pdf.addPage();
      ["VOID OMB No. 1545-2232", "Health Insurance Marketplace Statement", "Form 1095-A", "CORRECTED", "Department of the Treasury 20 26"].forEach((text, index) => page.drawText(text, {x: 40, y: 780 - index * 20, size: 10, font}));
      page.drawText("Cat. No. 60703Q Form 1095-A (2026) Created 5/12/26", {x: 40, y: 40, size: 9, font});
      const form = pdf.getForm();
      for (const [name, y] of [["voided", 780], ["corrected", 720]] as const) {
        const box = form.createCheckBox(name); box.addToPage(page, {x: 20, y, width: 10, height: 10});
        if (status === name) box.check();
      }
      pdf.addPage().drawText("Form 1095-A (2026) Page 2", {x: 40, y: 780, size: 10, font});
      const file = new File([new Uint8Array(await pdf.save())], "f1095a--2025.pdf", {type: "application/pdf"});
      const prepared = await prepareUploadableFiles([file]);
      expect(prepared[0]?.detectedDocument).toMatchObject({kind: "1095-a", taxYear: 2026, coverage: "needs-review", seededFactIds: [], detectedFacts: []});
      const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(`marketplace-${status}`), prepared);
      expect(workspace.documents[0]).toMatchObject({kind: "1095-a", taxYear: 2026, coverage: "needs-review", matchedFixtureId: null, seededFactIds: [], detectedFacts: []});
      expect(workspace.structuredFacts).toEqual([]);
      expect(workspace.enginePreview).toBeNull();
      const flow = startCompleteInterview({filingStatus: "single", incomeTypes: ["w2-wages"], lifeEvents: [], stateCode: null});
      const mismatched = reconcileWorkspaceGuidedState(workspace, flow);
      expect(mismatched.returnSummary.blockers.some(row => row.id === "guided:conflicting-source-years")).toBe(true);
      flow.taxYear = 2026;
      const sameYear = reconcileWorkspaceGuidedState(workspace, flow);
      expect(sameYear.returnSummary.status).not.toBe("ready-to-recompute");
      expect(sameYear.enginePreview).toBeNull();
      expect(sameYear.documents[0]?.detectedFacts).toEqual([]);
    }
    const legacy = ingestFilesIntoWorkspace(createWorkspaceRecord("filename-only"), [{name: "f1095a--2025.pdf", size: 23}]);
    expect(legacy.documents[0]).toMatchObject({taxYear: 2025, matchedFixtureId: "irs-1095-a-2025"});
    const ambiguous = ingestFilesIntoWorkspace(createWorkspaceRecord("unknown-filename"), [{name: "f1095a.pdf", size: 23}]);
    expect(ambiguous.documents[0]).toMatchObject({taxYear: null, kind: "unknown", matchedFixtureId: null, seededFactIds: [], detectedFacts: []});
  });
  // Spec: spec/federal/workspace-guided-year.yaml#wage-nec-pdf-upload.
  it("retains actual W-2 and NEC PDF text amounts without filename demo substitution", async () => {
    for (const kind of ["w2", "1099-nec"] as const) {
      for (const state of ["blank", "filled", "conflicting"] as const) {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const page = pdf.addPage();
        const lines = kind === "w2" ? ["2026 Form W-2", "1 Wages, tips, other comp.", ...(state === "blank" ? [] : ["12345.67"]), "2 Federal income tax withheld", ...(state === "blank" ? [] : ["890.12"])] : ["2026 Form 1099-NEC", "1 Nonemployee compensation", ...(state === "blank" ? [] : ["3210.00"]), "4 Federal income tax withheld", ...(state === "blank" ? [] : ["12.00"])];
        if (state === "conflicting") lines.push("Tax year 2025");
        lines.forEach((text, index) => page.drawText(text, {x: 40, y: 780-index*20, size: 10, font}));
        const name = kind === "w2" ? "fw2--2025.pdf" : "f1099nec.pdf";
        const prepared = await prepareUploadableFiles([new File([new Uint8Array(await pdf.save())], name, {type:"application/pdf"})]);
        const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord(`pdf-${kind}-${state}`), prepared);
        const money = workspace.structuredFacts.filter(fact => fact.machineValue).map(fact => fact.machineValue);
        expect(workspace.enginePreview).toBeNull();
        if (state === "blank") {
          expect(money).toEqual([]);
          expect(workspace.seededReturn.interviewQuestions.length).toBeGreaterThan(0);
        } else {
          expect(workspace.documents[0]).toMatchObject({kind, matchedFixtureId:null, taxYear:state === "conflicting" ? null : 2026});
          expect(money).toEqual([expect.objectContaining(kind === "w2" ? {entryKind:"w2-summary",wages:"12345.67",federalWithheld:"890.12"} : {entryKind:"1099-nec-summary",nonemployeeCompensation:"3210.00",federalWithheld:"12.00"})]);
        }
      }
    }
    const unreadable = await prepareUploadableFiles([new File(["not a PDF"], "f1099nec.pdf", {type:"application/pdf"})]);
    const fallback = ingestFilesIntoWorkspace(createWorkspaceRecord("unreadable"), unreadable);
    expect(fallback.seededReturn.interviewQuestions.length).toBeGreaterThan(0);
    expect(fallback.structuredFacts.filter(fact => fact.machineValue)).toEqual([]);
  });
  it("preserves monetary/date text and page order without a provider", async () => {
    const file = new File([await syntheticDocument()], "synthetic.pdf", { type: "application/pdf" });
    const text = await extractPdfTextFromFile(file);
    expect(text).toContain("Wages 12345.67\nFederal withholding 890.12");
    expect(text).toContain("\n\nSecond page 2025-12-31");
  });

  it("rejects malformed bytes and can read the next document", async () => {
    await expect(extractPdfTextFromFile(new File(["not a PDF"], "bad.pdf"))).rejects.toThrow();
    const text = await extractPdfTextFromFile(new File([await syntheticDocument()], "next.pdf"));
    expect(text).toContain("Wages 12345.67");
  });
});
