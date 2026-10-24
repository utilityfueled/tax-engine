/**
 * Spec: spec/state/pa-nonresident-orchestrator.yaml
 */

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
import { calculatePANonresidentReturn } from "@/engine/state/pa-nonresident-orchestrator.js";
import { TaxYearInputSchema } from "../../../src/models/inputs";
import { buildWorkspaceFilledReturnDownload } from "../../../apps/web/src/lib/workspace-filled-return";
import { buildTaxInputFromGuidedData } from "../../../apps/web/src/lib/guided-interview-bridge";
import type { GuidedFlowState } from "../../../apps/web/src/lib/guided-interview-flow";

vi.mock("server-only", () => ({}));
vi.mock("../../../apps/web/src/lib/guided-interview-bridge", () => ({
  buildTaxInputFromGuidedData: vi.fn(),
}));
vi.mock("@/engine/state/pa-orchestrator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine/state/pa-orchestrator.js")>();
  return {
    ...actual,
    calculatePAReturn: vi.fn(() => {
      throw new Error(
        "Resident Pennsylvania orchestrator should stay suppressed for paNonresidentReturn packets",
      );
    }),
  };
});
vi.mock("@/engine/state/pa-nonresident-orchestrator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine/state/pa-nonresident-orchestrator.js")>();
  return {
    ...actual,
    calculatePANonresidentReturn: vi.fn(actual.calculatePANonresidentReturn),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(buildTaxInputFromGuidedData).mockReset();
  vi.mocked(calculatePANonresidentReturn).mockClear();
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
        answerText: "Nonresident wage statement confirmed.",
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
    id: "workspace-pennsylvania-nonresident-packet",
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

function createGuidedFlowStateWithPennsylvaniaSelection(): GuidedFlowState {
  return {
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
        firstName: "Taylor",
        lastName: "Northwind",
        ssn: "111-22-3333",
        addressLine1: "123 Main St",
        addressLine2: "",
        city: "Newark",
        state: "NJ",
        zip: "07102",
        dependentCount: "0",
        dependents: [],
      },
      "income-w2": { entries: [] },
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

async function extractPdfText(contents: Uint8Array) {
  const outputPath = join(tmpdir(), `workspace-pennsylvania-nonresident-packet-${Date.now()}-${Math.random()}.pdf`);

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

describe("Pennsylvania nonresident workspace packet disclosure", () => {
  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania PA-40 packet for a nonresident return and keeps the business-rule disclosure honest", async () => {
    vi.mocked(buildTaxInputFromGuidedData).mockReturnValue(
      TaxYearInputSchema.parse({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: {
            firstName: "Taylor",
            lastName: "Northwind",
            ssn: "111-22-3333",
            dateOfBirth: "1990-01-01",
          },
          address: {
            street: "123 Main St",
            city: "Newark",
            state: "NJ",
            zip: "07102",
          },
          dependents: [],
        },
        w2s: [
          {
            employer: {
              name: "Northwind Labs",
              ein: "12-3456789",
            },
            wages: "75000",
            federalWithheld: "8200",
            socialSecurityWages: "75000",
            socialSecurityWithheld: "4650",
            medicareWages: "75000",
            medicareWithheld: "1087.50",
            state: "NJ",
            stateWages: "75000",
            stateTaxWithheld: "2500",
          },
        ],
        form1099Nec: [],
        form1099Int: [],
        form1099Div: [],
        form1099B: [],
        form1099R: [],
        form1099G: [],
        formW2G: [],
        form1099K: [],
        form1099Misc: [],
        paNonresidentReturn: {
          residencyStatus: "nonresident",
          paTaxableCompensation: "50000",
          estimatedPayments: "400",
        },
      }),
    );

    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaSelection(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(calculatePANonresidentReturn).toHaveBeenCalledTimes(1);
    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(pdfText).toContain("Packet completeness status: supported.");
    expect(pdfText).toContain("E-file and business-rule validation: not-validated.");
    expect(pdfText).not.toContain(
      "No filled Pennsylvania state forms are included in this packet.",
    );
  });

  it("buildWorkspaceFilledReturnDownload includes the Pennsylvania Schedule NRH reference summary for nonresident apportionment and marks the packet partial", async () => {
    vi.mocked(buildTaxInputFromGuidedData).mockReturnValue(
      TaxYearInputSchema.parse({
        taxpayer: {
          taxYear: 2025,
          filingStatus: "single",
          primary: {
            firstName: "Taylor",
            lastName: "Northwind",
            ssn: "111-22-3333",
            dateOfBirth: "1990-01-01",
          },
          address: {
            street: "123 Main St",
            city: "Newark",
            state: "NJ",
            zip: "07102",
          },
          dependents: [],
        },
        w2s: [
          {
            employer: {
              name: "Northwind Labs",
              ein: "12-3456789",
            },
            wages: "75000",
            federalWithheld: "8200",
            socialSecurityWages: "75000",
            socialSecurityWithheld: "4650",
            medicareWages: "75000",
            medicareWithheld: "1087.50",
            state: "NJ",
            stateWages: "75000",
            stateTaxWithheld: "2500",
          },
        ],
        form1099Nec: [],
        form1099Int: [],
        form1099Div: [],
        form1099B: [],
        form1099R: [],
        form1099G: [],
        formW2G: [],
        form1099K: [],
        form1099Misc: [],
        paNonresidentReturn: {
          residencyStatus: "nonresident",
          scheduleNRH: {
            compensation: {
              method: "working_days",
              grossCompensation: "75000",
              totalDaysForEmployer: 260,
              nonworkingDays: 10,
              daysWorkedInPennsylvania: 90,
              unreimbursedEmployeeBusinessExpenses: "1000",
            },
          },
        },
      }),
    );

    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithPennsylvaniaSelection(),
    );
    const pdfText = await extractPdfText(download.contents);

    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-nrh-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain(
      "Pennsylvania Schedule NRH is included as a reference summary, not an official PA Schedule NRH filing copy.",
    );
  });
});
