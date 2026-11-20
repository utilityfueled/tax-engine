// Spec: spec/federal/guided-input.yaml, nec-document-source-boundary
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { parseUploadedDocumentText, prepareUploadableFiles } from "@/lib/uploaded-document-detection";
import { collectNecSuggestions } from "@/lib/workspace-assistant";
import { createWorkspaceRecord, ingestFiles, ingestFilesIntoWorkspace } from "@/lib/workspace-storage";

const source = `Tax Year 2025\nForm 1099-NEC\nPayer: Actual design client\nPayer's TIN: 12-3456789\n1 Nonemployee compensation $ 9007199254740993.01`;

describe("actual NEC document source", () => {
  // Spec: spec/federal/guided-input.yaml#nec-document-identity.
  it("requires an actual NEC heading and compensation box in normal PDF uploads", async () => {
    const coverLines = [
      "CAUTION: THIS COPY IS FOR INFORMATIONAL PURPOSES",
      "The April 2025 revision of Form 1099-NEC reports calendar year 2025.",
      "The December 2026 revision of Form 1099-NEC reports calendar year 2026.",
    ];
    const pdf = async (fileName: string, ...pages: string[][]) => {
      const document = await PDFDocument.create();
      const font = await document.embedFont(StandardFonts.Helvetica);
      for (const lines of pages) {
        const page = document.addPage();
        lines.forEach((line, index) => page.drawText(line, { x: 36, y: 770 - 20 * index, size: 10, font }));
      }
      return new File([new Uint8Array(await document.save())], fileName, { type: "application/pdf" });
    };
    const [studentLoan, retirement, publication, genuine, priorYear] = await prepareUploadableFiles(await Promise.all([
      pdf("unlabeled-loan.pdf", coverLines, ["Form 1098-E", "Student Loan Interest Statement"]),
      pdf("unlabeled-distribution.pdf", coverLines, ["Form 1099-R", "1 Gross distribution $ 20.00"]),
      pdf("overview-1099-NEC.pdf", ["Publication 915", "Tax forms include 1099-R, 1099-MISC, and 1099-NEC."]),
      pdf("unlabeled-compensation.pdf", coverLines, ["2026 Form 1099-NEC", "Payer: Actual design client", "1a Nonemployee compensation $ 9007199254740993.01", "4 Federal income tax withheld $ 0.00"]),
      pdf("prior-year-original.pdf", ["Form 1099-NEC", "PAYER'S TIN RECIPIENT'S TIN 1 Nonemployee compensation"]),
    ]));

    for (const upload of [studentLoan, retirement, publication]) {
      if (!upload) throw new Error("Expected prepared PDF upload");
      expect(upload.detectedDocument).toBeNull();
      const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord("unrelated-source"), [upload]);
      expect(workspace.documents[0]).toMatchObject({ kind: "unknown", seededFactIds: [], detectedFacts: [] });
    }
    expect(genuine?.detectedDocument).toMatchObject({ kind: "1099-nec", coverage: "partially-supported" });
    expect(genuine?.detectedDocument?.detectedFacts[0]?.machineValue).toMatchObject({ nonemployeeCompensation: "9007199254740993.01", federalWithheld: "0.00" });
    expect(priorYear?.detectedDocument).toMatchObject({ kind: "1099-nec", coverage: "partially-supported", detectedFacts: [] });

    const fixture = ingestFilesIntoWorkspace(createWorkspaceRecord("registered-nec-sample"), [{ name: "irs-1099-nec-2025.pdf", size: 23 }]);
    expect(fixture.documents[0]).toMatchObject({ kind: "1099-nec", taxYear: 2025, matchedFixtureId: "irs-1099-nec-2025" });
  });

  it("keeps absent source withholding ownership and state facts unknown", () => {
    const parsed = parseUploadedDocumentText(source, "client.pdf");
    expect(parsed).toMatchObject({ kind: "1099-nec", taxYear: 2025, coverage: "partially-supported" });
    const value = parsed?.detectedFacts[0].machineValue;
    expect(value).toMatchObject({ entryKind: "1099-nec-summary", sourceFactsVersion: 2, payer: "Actual design client", payerTin: "12-3456789", nonemployeeCompensation: "9007199254740993.01" });
    for (const field of ["federalWithheld", "accountHolder", "state", "stateTaxReporting", "stateIncome", "stateWithheld"]) expect(value).not.toHaveProperty(field);
  });
  it("preserves actual zero withholding and labeled source-state amounts", () => {
    const parsed = parseUploadedDocumentText(`${source}\n4 Federal income tax withheld $ 0.00\n5 State tax withheld $ 0.10\n6 State/Payer's state no.\nPA 12345678\n7 State income $ 0.20`);
    expect(parsed?.detectedFacts[0].machineValue).toMatchObject({ federalWithheld: "0.00", stateTaxReporting: "single", state: "PA", stateWithheld: "0.10", stateIncome: "0.20" });
    expect(parsed?.coverage).toBe("partially-supported");
  });
  it("retains unknown conflicting boxes and refuses to combine separate forms", () => {
    const conflicting = parseUploadedDocumentText(`${source}\n4 Federal income tax withheld $ 0.00\n4 Federal income tax withheld $ 1.00`);
    expect(conflicting?.detectedFacts[0].machineValue).not.toHaveProperty("federalWithheld");
    const multiple = parseUploadedDocumentText(`${source}\n${source.replace("Actual design client", "Other client")}`);
    expect(multiple).toMatchObject({ kind: "1099-nec", coverage: "partially-supported", detectedFacts: [] });
  });
  it("makes actual source suggestions available for explicit guided confirmation", () => {
    const parsed = parseUploadedDocumentText(`${source}\n4 Federal income tax withheld $ 0.00`);
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const workspace = ingestFiles(storage, createWorkspaceRecord("actual-nec").id, [{ name: "client.pdf", size: 120, detectedDocument: parsed }]);
    const suggestions = collectNecSuggestions(workspace.documents, workspace.structuredFacts);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].summary).toMatchObject({ payer: "Actual design client", nonemployeeCompensation: "9007199254740993.01", federalWithheld: "0.00" });
    expect(workspace.enginePreview).toBeNull();
  });
  it("does not borrow payer identity or a compensation amount from other source boxes", () => {
    const missing = parseUploadedDocumentText("Form 1099-NEC\n1 Nonemployee compensation\n4 Federal income tax withheld $ 0.00");
    expect(missing?.detectedFacts).toEqual([]);
    const absentPayer = parseUploadedDocumentText("Form 1099-NEC\n1 Nonemployee compensation $ 0.00");
    expect(absentPayer?.detectedFacts[0].machineValue).toMatchObject({ payer: "", nonemployeeCompensation: "0.00" });
    expect(absentPayer?.taxYear).toBeNull();
  });
  it("marks multiple source states without combining conflicting state amounts", () => {
    const parsed = parseUploadedDocumentText(`${source}\n5 State tax withheld $ 1.00\n6 State/Payer's state no.\nPA 12345678\n5 State tax withheld $ 2.00\n6 State/Payer's state no.\nNY 87654321`);
    expect(parsed?.detectedFacts[0].machineValue).toMatchObject({ stateTaxReporting: "multiple" });
    expect(parsed?.detectedFacts[0].machineValue).not.toHaveProperty("state");
    expect(parsed?.detectedFacts[0].machineValue).not.toHaveProperty("stateWithheld");
  });
});
