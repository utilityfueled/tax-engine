/**
 * Spec: spec/state/pa-nonresident-orchestrator.yaml
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
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
import { calculatePAScheduleNRH } from "@/engine/state/pa-schedule-nrh";
import Decimal from "decimal.js";
import { paOrdinaryEmployeeReturnFixture } from "../../fixtures/pa-ordinary-employee-sources";
import { calculatePAOrdinaryReturn } from "@/engine/state/pa-ordinary-return";
import { confirmGuidedPAResidencySources } from "../../../apps/web/src/lib/guided-pa-residency-facts";
import { confirmGuidedPAOrdinaryReturnFacts } from "../../../apps/web/src/lib/guided-pa-ordinary-return-facts";
import { confirmGuidedPAOrdinaryReturnCompletionSources } from "../../../apps/web/src/lib/guided-pa-ordinary-return-completion";
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
        dateOfBirth: "1990-02-15",
        usResidencyMonths: "12",
        stateResidency: "full-year",
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

async function extractPdfText(contents: Uint8Array, artifactName?: string) {
  const artifactDirectory = process.env.PA_ORDINARY_EMPLOYEE_PDF_OUTPUT;
  if (artifactDirectory && artifactName) {
    await mkdir(artifactDirectory, { recursive: true });
    await writeFile(join(artifactDirectory, artifactName), contents);
  }
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


/** New explicit fictional originals, confirmed before the actual workspace read path. */
function createActualEmployeeState(f: ReturnType<typeof paOrdinaryEmployeeReturnFixture>): GuidedFlowState {
  const state = createGuidedFlowStateWithPennsylvaniaSelection();
  const residency = confirmGuidedPAResidencySources(f.input, f.residency);
  const current = { ...f.input, paResidencySources: residency };
  const facts = confirmGuidedPAOrdinaryReturnFacts(current, f.facts);
  const completion = confirmGuidedPAOrdinaryReturnCompletionSources(current, f.sources);
  state.sectionData["state-return"] = { stateEstimatedPayments: [], additionalStateWithholding: "", paResidencySources: residency, paOrdinaryReturnFacts: facts, paOrdinaryReturnCompletionSources: completion };
  return state;
}

describe("Pennsylvania nonresident workspace packet disclosure", () => {
  it("retains the original NJ75000 and2500 scalar PA50000 estimate400 case as a missing-source rejection", async () => {
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

    await expect(buildWorkspaceFilledReturnDownload(
      createWorkspace(), createGuidedFlowStateWithPennsylvaniaSelection(),
    )).rejects.toThrow(/actual|ordinary|source|complete|reciprocal/i);
    expect(calculatePANonresidentReturn).not.toHaveBeenCalled();
  });

  it("retains original NJ75000 and2500 scalar NRH260/10/90/1000 as a missing-source rejection", async () => {
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

    await expect(buildWorkspaceFilledReturnDownload(
      createWorkspace(), createGuidedFlowStateWithPennsylvaniaSelection(),
    )).rejects.toThrow(/actual|ordinary|source|complete|reciprocal/i);
    expect(calculatePANonresidentReturn).not.toHaveBeenCalled();
  });

  it("preserves the legacy direct NRH arithmetic in its explicit separate primitive boundary", () => {
    const result = calculatePAScheduleNRH({ taxYear: 2025, compensation: {
      method: "working_days", grossCompensation: new Decimal("75000"), totalDaysForEmployer: 260,
      nonworkingDays: 10, daysWorkedInPennsylvania: 90, unreimbursedEmployeeBusinessExpenses: new Decimal("1000"),
    } });
    expect(result.selectedApportionmentFraction.toFixed(6)).toBe("0.360000");
    expect(result.apportionedGrossCompensation.toFixed()).toBe("27000");
    expect(result.apportionedEmployeeBusinessExpenses.toFixed()).toBe("360");
    expect(result.netPATaxableCompensation.toFixed()).toBe("26640");
  });

  it("actual NY50000 payroll and original April15 estimate400 use the ordinary review route", async () => {
    const f = paOrdinaryEmployeeReturnFixture("nonresident", "payroll");
    const state = createActualEmployeeState(f);
    vi.mocked(buildTaxInputFromGuidedData).mockReturnValue(f.input);
    const result = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
    expect(result.pa40.compensation.toFixed()).toBe("50000");
    expect(result.pa40.estimatedPayments.toFixed()).toBe("400");
    expect(result.pa40.taxDue.toFixed()).toBe("1135");
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), state), pdfText = await extractPdfText(download.contents, "pa-nr-actual-payroll.pdf");
    expect(calculatePANonresidentReturn).not.toHaveBeenCalled();
    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).not.toContain("Packet completeness status: supported.");
    expect(pdfText).toContain("E-file and business-rule validation: not-validated.");
    expect(pdfText).not.toContain("No filled Pennsylvania state forms are included in this packet.");
  });

  it("actual NY260-calendar-day originals carry PA27000 UE360 and818 tax into partial references", async () => {
    const f = paOrdinaryEmployeeReturnFixture();
    const state = createActualEmployeeState(f);
    vi.mocked(buildTaxInputFromGuidedData).mockReturnValue(f.input);
    const result = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
    expect(result.pa40.compensation.toFixed()).toBe("27000");
    expect(result.pa40.unreimbursedExpenses.toFixed()).toBe("360");
    expect(result.pa40.netCompensation.toFixed()).toBe("26640");
    expect(result.pa40.taxLiability.toFixed()).toBe("818");
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), state), pdfText = await extractPdfText(download.contents, "pa-nr-actual-nrh.pdf");
    expect(calculatePANonresidentReturn).not.toHaveBeenCalled();
    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-nrh-reference.pdf");
    expect(download.includedForms).toContain("pa-schedule-ue-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain("Pennsylvania Schedule NRH is included as a reference summary, not an official PA Schedule NRH filing copy.");
    expect(pdfText).toContain("E-file and business-rule validation: not-validated.");
    expect(pdfText).not.toContain("No filled Pennsylvania state forms are included in this packet.");
  });


  it.each(["resident", "part_year"] as const)("actual employee %s workspace retains UE and review-only disclosure", async status => {
    const f = paOrdinaryEmployeeReturnFixture(status);
    const state = createActualEmployeeState(f);
    vi.mocked(buildTaxInputFromGuidedData).mockReturnValue(f.input);
    const result = calculatePAOrdinaryReturn(f.input, f.facts, f.sources);
    expect(result.pa40.taxLiability.toFixed()).toBe(status === "resident" ? "2272" : "818");
    expect(result.readiness.filingEligible).toBe(false);
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), state), pdfText = await extractPdfText(download.contents, `pa-${status}-actual-ue.pdf`);
    expect(calculatePANonresidentReturn).not.toHaveBeenCalled();
    expect(download.includedForms).toContain("pa-40-filled.pdf");
    expect(download.includedForms).toContain("pa-schedule-ue-reference.pdf");
    expect(pdfText).toContain("Packet completeness status: partial.");
    expect(pdfText).toContain("E-file and business-rule validation: not-validated.");
    for (const privateValue of [f.input.taxpayer.primary.ssn, "12-3456789", "Fictional Payroll Officer", "Fictional actual itemized and paid receipt 1"]) expect(pdfText).not.toContain(privateValue);
  });

});
