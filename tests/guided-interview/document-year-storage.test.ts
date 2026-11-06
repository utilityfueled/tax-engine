// Spec: spec/federal/guided-input.yaml — parsed-source-fidelity
import { describe, expect, it } from "vitest";
import { answerWorkspaceInterviewQuestion, confirmWorkspaceDocumentTaxYear, ensureWorkspace, ingestFilesIntoWorkspace, getWorkspace, saveWorkspaceSnapshot } from "@/lib/workspace-storage";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); }, clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } };
}

function uploaded(year: number | null) {
  return ingestFilesIntoWorkspace(ensureWorkspace(memoryStorage(), "year-test"), [{ name: "saved-2025-copy.pdf", size: 17, detectedDocument: { taxYear: year, kind: "w2", coverage: "supported", label: "Actual W-2", notes: "Synthetic source", seededFactIds: ["wages", "withholding"], detectedFacts: [] } }]);
}

describe("document source year persistence", () => {
  it("preserves source year and explicit unknown without taking the filename year", () => {
    const unknown = uploaded(null);
    expect(unknown.documents[0].taxYear).toBeNull();
    expect(unknown.seededReturn.taxYearHints).toEqual([]);
    const known = uploaded(2026);
    expect(known.documents[0].taxYear).toBe(2026);
    expect(known.seededReturn.taxYearHints).toEqual([2026]);
    const storage = memoryStorage();
    saveWorkspaceSnapshot(storage, known);
    expect(getWorkspace(storage, known.id)?.documents[0].taxYear).toBe(2026);
  });

  it("requires renewed source confirmation after a year correction", () => {
    let workspace = uploaded(2025);
    workspace = answerWorkspaceInterviewQuestion(workspace, "wages", "I checked the actual form.");
    workspace = confirmWorkspaceDocumentTaxYear(workspace, workspace.documents[0].id, 2026);
    expect(workspace.documents[0].taxYear).toBe(2026);
    expect(workspace.seededReturn.interviewQuestions.find((question) => question.id === "wages")?.status).toBe("pending");
    expect(workspace.enginePreview).toBeNull();
    expect(workspace.auditTrail.at(-1)?.kind).toBe("document-year-confirmed");
    expect(() => confirmWorkspaceDocumentTaxYear(workspace, workspace.documents[0].id, 2026.5)).toThrow();
    expect(confirmWorkspaceDocumentTaxYear(workspace, workspace.documents[0].id, null).documents[0].taxYear).toBeNull();
  });

  it("preserves a legacy saved return year without inventing the source year", () => {
    const legacy = uploaded(2025);
    delete legacy.documents[0].taxYear;
    const storage = memoryStorage();
    saveWorkspaceSnapshot(storage, legacy);
    const restored = getWorkspace(storage, legacy.id)!;
    expect(restored.returnSummary.targetTaxYear).toBe(2025);
    expect(restored.documents[0].taxYear).toBeUndefined();
    expect(restored.returnSummary.taxYearState).toBe("missing");
    expect(restored.enginePreview).toBeNull();
  });
});
