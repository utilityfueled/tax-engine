// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import React, { act, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReturnWorkspaceScreen } from "@/components/return-workspace-screen";
import { initialFlowState, saveGuidedFlowState } from "@/lib/guided-interview-flow";
import { parseUploadedDocumentText, prepareUploadableFiles } from "@/lib/uploaded-document-detection";
import { deleteCachedWorkspaceDocumentFiles, storeNewWorkspaceDocumentFiles } from "@/lib/workspace-document-file-cache";
import { ensureWorkspace, getWorkspace, ingestFiles } from "@/lib/workspace-storage";
import { mountGuidedPanel } from "./guided-panel-dom";

vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("@/lib/uploaded-document-detection", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/uploaded-document-detection")>(),
  prepareUploadableFiles: vi.fn(),
}));
vi.mock("@/lib/workspace-document-file-cache", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/workspace-document-file-cache")>(),
  deleteCachedWorkspaceDocumentFiles: vi.fn(async () => {}),
  storeNewWorkspaceDocumentFiles: vi.fn(async () => {}),
}));

const nec = "2026 Form 1099-NEC\nPayer's name: Fictional Client\n1 Nonemployee compensation\n3210.00\n4 Federal income tax withheld\n12.00";
const wages = "2026 W-2\nEmployer's name, address, and ZIP code\nFICTIONAL EMPLOYER\nEmployer's FED ID number\n04-3097449\n1 Wages, tips, other comp.\n42000.00\n2 Federal income tax withheld\n3100.00";
const priorWagesName = "prior-wages.pdf";
const priorWages = wages.replace("2026", "2025");
const pdfText = new Map([
  ["client-nec.pdf", nec],
  ["employer-wages.pdf", wages],
  [priorWagesName, priorWages],
  ["training-guide.pdf", "Publication 4491\nVITA/TCE Training Guide\n2026 RETURNS\n" + nec],
  ["conflicting-years.pdf", nec + "\nTax year 2025"],
  ["blank-nec.pdf", "2026 Form 1099-NEC\n1 Nonemployee compensation\n4 Federal income tax withheld"],
]);

function prepareFiles(files: File[]) {
  return files.map(({ name, size }) => ({ name, size, detectedDocument: parseUploadedDocumentText(pdfText.get(name) ?? "", name) }));
}

function savePriorWages(id: string) {
  ingestFiles(localStorage, id, prepareFiles([new File([priorWages], priorWagesName)]));
}

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(deleteCachedWorkspaceDocumentFiles).mockClear();
  vi.mocked(storeNewWorkspaceDocumentFiles).mockClear();
  vi.mocked(prepareUploadableFiles).mockImplementation(async files => prepareFiles(files));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function upload(container: HTMLElement, selector: string, ...names: string[]) {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error("Upload input is missing");
  const files = names.map(name => new File(["synthetic PDF"], name, { type: "application/pdf" }));
  Object.defineProperty(input, "files", { value: files, configurable: true });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
  return files;
}

// Spec: spec/federal/workspace-guided-year.yaml#guided-2026-original-uploads.
it("saves a matching original only for the selected guided facts-only year", async () => {
  const id = "synthetic-guided-originals";
  ensureWorkspace(localStorage, id);
  const panel = await mountGuidedPanel(<ReturnWorkspaceScreen workspaceId={id} deploymentMode="self-host" />);
  try {
    const uploadOriginals = (...names: string[]) => upload(panel.container, ".guided-doc-upload-input", ...names);
    const status = () => panel.container.querySelector(".guided-doc-helper-status")?.textContent;
    await panel.change("Tax year for this interview", "2025");
    await uploadOriginals("client-nec.pdf");
    expect(status()).toContain("can't drive a 2025 return");
    expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();

    await panel.change("Tax year for this interview", "2026");
    for (const name of ["fw2--2026.pdf", "training-guide.pdf", "blank-nec.pdf"]) {
      await uploadOriginals(name);
      expect(status()).toContain("can't drive a 2025 return");
    }
    expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();
    expect(getWorkspace(localStorage, id)?.documents).toEqual([]);

    const originals = await uploadOriginals("client-nec.pdf", "employer-wages.pdf");
    expect(status()).toContain("2 docs stored locally");
    expect(vi.mocked(storeNewWorkspaceDocumentFiles).mock.calls[0]).toEqual([
      id, originals.map(file => expect.objectContaining({ file })),
    ]);
    const saved = getWorkspace(localStorage, id);
    if (!saved) throw new Error("Saved workspace is missing");
    expect(saved.documents).toMatchObject([
      { kind: "1099-nec", taxYear: 2026, matchedFixtureId: null },
      { kind: "w2", taxYear: 2026, matchedFixtureId: null },
    ]);
    expect(saved.enginePreview).toBeNull();
    expect(saved.returnSummary.blockers.map(({ id }) => id)).toContain("unsupported-tax-year");
    expect(panel.container.textContent).toContain("The 2026 rules and filing forms are not yet qualified.");

    await uploadOriginals("conflicting-years.pdf");
    expect(getWorkspace(localStorage, id)?.documents.at(-1)).toMatchObject({ kind: "1099-nec", taxYear: null, matchedFixtureId: null });
  } finally {
    await panel.dispose();
  }
});

it.each([
  ["1098-e", "f1098e.pdf", "Box 1: $1,800.25"],
  ["1099-r", "f1099r.pdf", "Box 2a: $0.00"],
] as const)("keeps a %s original in the selected 2026 guided review only", async (kind, name, notes) => {
  const id = `synthetic-${kind}-review`;
  ensureWorkspace(localStorage, id);
  const panel = await mountGuidedPanel(<ReturnWorkspaceScreen workspaceId={id} deploymentMode="self-host" />);
  vi.mocked(prepareUploadableFiles).mockImplementation(async files => prepareFiles(files).map(file => file.name === name ? ({
    ...file,
    detectedDocument: { kind, coverage: "needs-review", taxYear: 2026, label: `Form ${kind.toUpperCase()} Copy B`, notes, seededFactIds: [], detectedFacts: [] },
  }) : file));
  try {
    const uploadOriginals = (...names: string[]) => upload(panel.container, ".guided-doc-upload-input", ...names);
    const uploadMessage = () => panel.container.querySelector(".guided-doc-helper-status")?.textContent;
    await panel.change("Tax year for this interview", "2025");
    await uploadOriginals(name);
    expect(uploadMessage()).toContain("Select tax year 2026");
    expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();
    expect(getWorkspace(localStorage, id)?.documents).toEqual([]);

    await panel.change("Tax year for this interview", "2026");
    await uploadOriginals(name, priorWagesName);
    expect(uploadMessage()).toContain("An original is for a different tax year");
    expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();

    const originals = await uploadOriginals(name);
    expect(vi.mocked(storeNewWorkspaceDocumentFiles).mock.calls[0]).toEqual([
      id, [expect.objectContaining({ file: originals[0] })],
    ]);
    const saved = getWorkspace(localStorage, id);
    expect(saved?.documents).toMatchObject([{ kind, taxYear: 2026, matchedFixtureId: null, notes, seededFactIds: [] }]);
    expect(panel.container.querySelector(".guided-doc-helper-result")?.textContent).toContain(notes);
    expect(saved?.enginePreview).toBeNull();
    expect(saved?.returnSummary.blockers.map(({ id }) => id)).toContain("unsupported-tax-year");
  } finally {
    await panel.dispose();
  }
});

it("keeps a 2026 original gated in the advanced help dock and conflicting 2025 workspace", async () => {
  const id = "synthetic-prior-year-original";
  savePriorWages(id);
  saveGuidedFlowState(localStorage, id, { ...initialFlowState, taxYear: 2026 });
  localStorage.setItem(`tax-engine:guided-mode:${id}`, "false");
  const panel = await mountGuidedPanel(<ReturnWorkspaceScreen workspaceId={id} deploymentMode="self-host" />);
  try {
    await panel.click("Need help?");
    await upload(panel.container, ".return-help-panel .guided-doc-upload-input", "client-nec.pdf");
    expect(panel.container.querySelector(".return-help-document-status")?.textContent).toContain("can't drive a 2025 return");
    await panel.click("Hide help");

    await panel.click("Start guided interview");
    expect(panel.control("Tax year for this interview").value).toBe("2026");
    await upload(panel.container, ".guided-doc-upload-input", "client-nec.pdf");
    expect(panel.container.querySelector(".guided-doc-helper-status")?.textContent).toContain("An original is for a different tax year");
    expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();
    expect(getWorkspace(localStorage, id)?.documents.map(({ taxYear }) => taxYear)).toEqual([2025]);
  } finally {
    await panel.dispose();
  }
});

it("uses the live 2026 selection after reopening a 2025 draft with no originals", async () => {
  const id = "synthetic-year-selection";
  ensureWorkspace(localStorage, id);
  saveGuidedFlowState(localStorage, id, { ...initialFlowState, taxYear: 2025 });
  const panel = await mountGuidedPanel(<ReturnWorkspaceScreen workspaceId={id} deploymentMode="self-host" />);
  try {
    expect(panel.control("Tax year for this interview").value).toBe("2025");
    await panel.change("Tax year for this interview", "2026");
    await upload(panel.container, ".guided-doc-upload-input", "client-nec.pdf");
    expect(getWorkspace(localStorage, id)?.documents.map(({ taxYear }) => taxYear)).toEqual([2026]);
    expect(storeNewWorkspaceDocumentFiles).toHaveBeenCalledTimes(1);
  } finally {
    await panel.dispose();
  }
});

it.each(["before parsing", "during parsing", "during original byte storage"])(
  "does not merge a 2026 guided upload with a new 2025 original (%s)", async timing => {
    const id = "synthetic-year-race";
    ensureWorkspace(localStorage, id);
    const panel = await mountGuidedPanel(<ReturnWorkspaceScreen workspaceId={id} deploymentMode="self-host" />);
    try {
      await panel.change("Tax year for this interview", "2026");
      if (timing === "before parsing") savePriorWages(id);
      if (timing === "during parsing") {
        vi.mocked(prepareUploadableFiles).mockImplementationOnce(async files => {
          await Promise.resolve();
          savePriorWages(id);
          return prepareFiles(files);
        });
      }
      if (timing === "during original byte storage") {
        vi.mocked(storeNewWorkspaceDocumentFiles).mockImplementationOnce(async () => savePriorWages(id));
      }
      await upload(panel.container, ".guided-doc-upload-input", "client-nec.pdf");
      expect(getWorkspace(localStorage, id)?.documents.map(({ taxYear }) => taxYear)).toEqual([2025]);
      if (timing === "during original byte storage") {
        const newDocument = vi.mocked(storeNewWorkspaceDocumentFiles).mock.calls[0]?.[1][0];
        expect(newDocument?.documentId).toBeDefined();
        expect(deleteCachedWorkspaceDocumentFiles).toHaveBeenCalledWith(id, [newDocument?.documentId]);
      } else {
        expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();
      }
    } finally {
      await panel.dispose();
    }
  },
);

it("rejects a conflicting original in the same guided upload batch before writes", async () => {
  const id = "synthetic-mixed-batch";
  ensureWorkspace(localStorage, id);
  const panel = await mountGuidedPanel(<ReturnWorkspaceScreen workspaceId={id} deploymentMode="self-host" />);
  try {
    await panel.change("Tax year for this interview", "2026");
    await upload(panel.container, ".guided-doc-upload-input", "client-nec.pdf", priorWagesName);
    expect(getWorkspace(localStorage, id)?.documents).toEqual([]);
    expect(storeNewWorkspaceDocumentFiles).not.toHaveBeenCalled();
  } finally {
    await panel.dispose();
  }
});
