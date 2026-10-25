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
import { completePersonalInfo, completeW2Entry, completeInterestEntry, completeDividendEntry, completeNecSource, completeBusinessSection, completeBusinessExpenses } from "../../guided-interview/complete-facts";

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
    id: "workspace-pennsylvania-packet",
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

function createGuidedFlowStateWithPennsylvaniaStateSelection(): GuidedFlowState {
  return {
    taxYear: 2025,
    phase: "complete",
    segmentation: {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: "PA",
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
        city: "Philadelphia",
        state: "PA",
        zip: "19103",
        dependentCount: "0",
        dependents: [],
      },
      "income-w2": {
        entries: [
          {
            ...completeW2Entry,
            stateTaxReporting: "single",
            state: "PA",
            employerName: "Northwind Labs",
            employerEin: "12-3456789",
            wages: "75000",
            federalWithheld: "8200",
            socialSecurityWages: "75000",
            socialSecurityWithheld: "4650",
            medicareWages: "75000",
            medicareWithheld: "1087.50",
            stateWages: "75000",
            stateWithheld: "2303",
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
    },
  };
}

function createGuidedFlowStateWithPennsylvaniaTaxForgiveness(): GuidedFlowState {
  return {
    ...createGuidedFlowStateWithPennsylvaniaStateSelection(),
    sectionData: {
      ...createGuidedFlowStateWithPennsylvaniaStateSelection().sectionData,
      "income-w2": {
        entries: [
          {
            ...completeW2Entry,
            stateTaxReporting: "single",
            state: "PA",
            employerName: "Northwind Labs",
            employerEin: "12-3456789",
            wages: "6000",
            federalWithheld: "450",
            socialSecurityWages: "6000",
            socialSecurityWithheld: "372",
            medicareWages: "6000",
            medicareWithheld: "87",
            stateWages: "6000",
            stateWithheld: "184",
            aiSuggestedFields: {},
          },
        ],
      },
    },
  };
}

function createGuidedFlowStateWithPennsylvaniaScheduleAInterest(): GuidedFlowState {
  return {
    taxYear: 2025,
    phase: "complete",
    segmentation: {
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: "PA",
    },
    currentSectionIndex: 0,
    completedSections: [
      "personal-info",
      "income-w2",
      "income-investments",
      "deductions",
      "credits",
      "payments",
      "review",
    ],
    sectionData: {
      ...createGuidedFlowStateWithPennsylvaniaStateSelection().sectionData,
      "income-investments": {
        interestEntries: [
          {
            ...completeInterestEntry,
            payer: "Keystone Bank",
            interestIncome: "3000",
            federalWithheld: "0",
          },
        ],
        dividendEntries: [],
        brokerageEntries: [],
      },
    },
  };
}

function createGuidedFlowStateWithPennsylvaniaScheduleBDividends(): GuidedFlowState {
  return {
    taxYear: 2025,
    phase: "complete",
    segmentation: {
      filingStatus: "single",
      incomeTypes: ["w2-wages", "investments"],
      lifeEvents: [],
      stateCode: "PA",
    },
    currentSectionIndex: 0,
    completedSections: [
      "personal-info",
      "income-w2",
      "income-investments",
      "deductions",
      "credits",
      "payments",
      "review",
    ],
    sectionData: {
      ...createGuidedFlowStateWithPennsylvaniaStateSelection().sectionData,
      "income-investments": {
        interestEntries: [],
        dividendEntries: [
          {
            ...completeDividendEntry,
            payer: "Keystone Brokerage",
            ordinaryDividends: "2000",
            qualifiedDividends: "0",
            capitalGainDistributions: "500",
            federalWithheld: "0",
            section199ADividends: "0",
            foreignTaxPaid: "0",
          },
        ],
        brokerageEntries: [],
      },
    },
  };
}

function createGuidedFlowStateWithPennsylvaniaScheduleCBusiness(): GuidedFlowState {
  return {
    taxYear: 2025,
    phase: "complete",
    segmentation: {
      filingStatus: "single",
      incomeTypes: ["w2-wages", "self-employment"],
      lifeEvents: ["started-business"],
      stateCode: "PA",
    },
    currentSectionIndex: 0,
    completedSections: [
      "personal-info",
      "income-w2",
      "income-self-employment",
      "deductions",
      "credits",
      "payments",
      "review",
    ],
    sectionData: {
      ...createGuidedFlowStateWithPennsylvaniaStateSelection().sectionData,
      "income-self-employment": {
        ...completeBusinessSection,
        necEntries: [
          {
            ...completeNecSource,
            payerName: "Northwind Design Studio",
            payerTin: "12-3456789",
            nonemployeeCompensation: "18000",
            federalWithheld: "0",
          },
        ],
        manualGrossReceipts: "0",
        expenses: {
          ...completeBusinessExpenses,
          advertising: "250",
          carAndTruck: "0",
          insurance: "0",
          officeExpense: "600",
          supplies: "500",
          travel: "300",
          meals: "200",
          utilities: "150",
          otherExpenses: "800",
        },
      },
    },
  };
}

async function extractPdfText(contents: Uint8Array) {
  const outputPath = join(tmpdir(), `workspace-pennsylvania-packet-${Date.now()}-${Math.random()}.pdf`);

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

describe("Pennsylvania workspace packet disclosure", () => {
  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania PA-40 packet and keeps the business-rule disclosure honest", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaStateSelection(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(pdfText).toContain("Packet completeness status: supported.");
    expect(pdfText).toContain("E-file and business-rule validation: not-validated.");
    expect(pdfText).not.toContain(
      "No filled Pennsylvania state forms are included in this packet.",
    );
  });

  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania Schedule SP reference summary and marks the packet partial", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaTaxForgiveness(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-sp-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain(
      "Pennsylvania Schedule SP is included as a reference summary, not an official PA Schedule SP filing copy.",
    );
  });

  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania Schedule A reference summary and marks the packet partial", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaScheduleAInterest(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-a-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain(
      "Pennsylvania Schedule A is included as a reference summary, not an official PA-40 Schedule A filing copy.",
    );
  });

  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania Schedule B reference summary and marks the packet partial", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaScheduleBDividends(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-b-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain(
      "Pennsylvania Schedule B is included as a reference summary, not an official PA-40 Schedule B filing copy.",
    );
  });

  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania Schedule C reference summary and marks the packet partial", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaScheduleCBusiness(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-c-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain(
      "Pennsylvania Schedule C is included as a reference summary, not an official PA-40 Schedule C filing copy.",
    );
  });
});
