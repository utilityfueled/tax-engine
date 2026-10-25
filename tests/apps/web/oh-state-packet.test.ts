import { afterEach, describe, expect, it, vi } from "vitest";
import { rm, writeFile } from "fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "path";
import { tmpdir } from "os";
import type {
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord,
  WorkspaceReturnSummary,
} from "@tax-engine/contracts";
import { buildWorkspaceStructuredFacts } from "@tax-engine/engine";
import { buildWorkspaceFilledReturnDownload } from "../../../apps/web/src/lib/workspace-filled-return";
import type { GuidedFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import * as ohioReferenceForms from "../../../src/pdf/fill-oh-reference-forms";
import { completePersonalInfo, completeW2Entry } from "../../guided-interview/complete-facts";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord> = {},
): WorkspaceDocumentRecord {
  return {
    id: "doc-w2",
    name: "fw2--2025.pdf",
    size: 10,
    uploadedAt: "2026-03-12T00:00:00.000Z",
    kind: "w2",
    coverage: "supported",
    label: "2025 Form W-2",
    notes: "Fixture",
    matchedFixtureId: "irs-w2-2025",
    seededFactIds: ["wages", "withholding"],
    ...overrides,
  };
}

function createSeededReturn(
  overrides: Partial<SeededReturnSummary> = {},
): SeededReturnSummary {
  return {
    status: "ready-for-interview",
    taxYearHints: [2025],
    facts: [
      {
        id: "wages",
        label: "Wages",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Final W-2 confirmed.",
        sourceDocumentIds: ["doc-w2"],
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Federal withholding confirmed.",
        sourceDocumentIds: ["doc-w2"],
      },
    ],
    interviewQuestions: [],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides,
  };
}

function createReturnSummary(
  overrides: Partial<WorkspaceReturnSummary> = {},
): WorkspaceReturnSummary {
  return {
    status: "ready-to-recompute",
    targetTaxYear: 2025,
    taxYearState: "single",
    answeredFactCount: 2,
    totalFactCount: 2,
    readyItemCount: 1,
    itemCount: 1,
    blockers: [],
    items: [
      {
        id: "wages-and-withholding",
        label: "Wages and withholding",
        status: "ready",
        engineTargets: ["Form 1040 Lines 1 and 25a"],
        relatedFactIds: ["wages", "withholding"],
        sourceDocumentIds: ["doc-w2"],
        answeredFactCount: 2,
        factCount: 2,
      },
    ],
    ...overrides,
  };
}

function createWorkspace(): ReturnWorkspaceRecord {
  const documents = [createDocument()];
  const seededReturn = createSeededReturn();

  return {
    id: "workspace-ohio-reference",
    createdAt: "2026-03-12T00:00:00.000Z",
    updatedAt: "2026-03-13T00:00:00.000Z",
    storageMode: "local-browser",
    documents,
    summary: {
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 0,
    },
    seededReturn,
    structuredFacts: buildWorkspaceStructuredFacts(documents, seededReturn),
    returnSummary: createReturnSummary(),
    enginePreview: null,
    checklist: [
      { id: "documents", label: "Upload tax documents", status: "ready" },
      { id: "review", label: "Review summary and completed return", status: "ready" },
    ],
    auditTrail: [],
  };
}

function createGuidedFlowStateWithOhioStateSelection(): GuidedFlowState {
  return {
    taxYear: 2025,
    phase: "complete",
    segmentation: {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "OH",
    },
    currentSectionIndex: 0,
    completedSections: [
      "personal-info",
      "income-w2",
      "deductions",
      "credits",
      "payments",
      "review",
    ],
    sectionData: {
      "personal-info": {
        ...completePersonalInfo,
        dateOfBirth: "1990-02-15",
        usResidencyMonths: "12",
        stateResidency: "full-year",
        firstName: "Jordan",
        lastName: "Northwind",
        ssn: "111-22-3333",
        addressLine1: "123 Main St",
        addressLine2: "",
        city: "Columbus",
        state: "OH",
        zip: "43215",
        dependentCount: "0",
        dependents: [],
      },
      "income-w2": {
        entries: [
          {
            ...completeW2Entry,
            stateTaxReporting: "single",
            state: "OH",
            employerName: "Northwind Labs",
            employerEin: "12-3456789",
            wages: "75000",
            federalWithheld: "8200",
            socialSecurityWages: "75000",
            socialSecurityWithheld: "4650",
            medicareWages: "75000",
            medicareWithheld: "1087.50",
            stateWages: "75000",
            stateWithheld: "3750",
            aiSuggestedFields: {},
          },
        ],
      },
      deductions: {
        method: "standard",
        medicalExpenses: "",
        stateLocalTaxes: "",
        realEstateTaxes: "",
        mortgageInterest: "",
        charitableContributions: "",
        casualtyLosses: "",
        otherItemized: "",
      },
      credits: {
        dependentCare: {
          expenses: "",
          qualifyingIndividuals: "",
        },
        education: {
          aocStudents: [],
          llcExpenses: "",
        },
        energy: {
          solarElectricCost: "",
          solarWaterHeatingCost: "",
          insulationCost: "",
          exteriorDoorsWindowsCost: "",
          roofCost: "",
          energyEfficientHvacCost: "",
          waterHeaterHeatPumpCost: "",
        },
      },
      payments: {
        estimatedPayments: [],
        otherPayments: "",
      },
      "state-return": {
        additionalStateWithholding: "",
        stateEstimatedPayments: [],
      },
    },
  };
}

async function extractPdfText(contents: Uint8Array) {
  const outputPath = join(tmpdir(), `workspace-ohio-packet-${Date.now()}-${Math.random()}.pdf`);

  await writeFile(outputPath, contents);

  try {
    return execFileSync(
      process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3",
      [
        "-c",
        `
from pypdf import PdfReader
reader = PdfReader(r"${outputPath}")
print("\\n".join((page.extract_text() or "") for page in reader.pages))
`,
      ],
      { encoding: "utf8" },
    );
  } finally {
    await rm(outputPath, { force: true });
  }
}

describe("Ohio workspace packet disclosure", () => {
  // Spec: spec/federal/guided-input.yaml, state-payment-sources
  it("passes exact classified state amounts to the review packet overlay", async () => {
    const guidedState = createGuidedFlowStateWithOhioStateSelection();
    guidedState.sectionData["state-return"] = {
      additionalStateWithholding: "0.3",
      additionalStateWithholdingEntries: [
        { payer: "Example Pension", documentType: "1099-R", state: "OH", taxYear: "2025", amount: "0.1" },
        { payer: "Example Bank", documentType: "1099-INT", state: "OH", taxYear: "2025", amount: "0.2" },
      ],
      stateEstimatedPayments: [{ state: "OH", date: "2025-04-15", amount: "9007199254740993.01" }, { state: "OH", date: "2025-06-15", amount: "0.09" }],
    };
    const packet = vi.spyOn(ohioReferenceForms, "fillOhioReferenceForms").mockResolvedValue({ filledForms: [] });
    try {
      await buildWorkspaceFilledReturnDownload(createWorkspace(), guidedState);
      expect(packet.mock.calls[0]?.[3]).toEqual({ ohioWithholdingOverride: "3750.3", estimatedPayments: "9007199254740993.1" });
    } finally { packet.mockRestore(); }
  });

  // Spec: spec/federal/guided-input.yaml, state-payment-sources
  it("blocks review export when legacy state withholding lacks actual source facts", async () => {
    const guidedState = createGuidedFlowStateWithOhioStateSelection();
    guidedState.sectionData["state-return"] = { additionalStateWithholding: "100", stateEstimatedPayments: [] };
    await expect(buildWorkspaceFilledReturnDownload(createWorkspace(), guidedState)).rejects.toThrow("Complete the required taxpayer facts");
  });

  it("buildWorkspaceFilledReturnDownload keeps Ohio packet disclosures honest when only reference-summary state forms are attached", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithOhioStateSelection(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("oh-it-1040-reference.pdf");
    expect(download.includedForms).toContain("oh-schedule-of-withholding-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain("E-file and business-rule validation: not-validated.");
    expect(pdfText).toContain(
      "Ohio packet output is currently generated as reference-summary pages, not official filled Ohio PDFs.",
    );
  });
});
