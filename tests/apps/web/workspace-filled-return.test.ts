import { afterEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type {
  ReturnWorkspaceRecord,
  SeededReturnSummary,
  WorkspaceDocumentRecord,
  WorkspaceReturnSummary,
} from "@tax-engine/contracts";
import { buildWorkspaceStructuredFacts } from "@tax-engine/engine";
import { POST } from "../../../apps/web/src/app/api/workspace/filled-return/route";
import { buildWorkspaceFilledReturnDownload } from "../../../apps/web/src/lib/workspace-filled-return";
import type { GuidedFlowState } from "../../../apps/web/src/lib/guided-interview-flow";
import { buildTaxInputFromGuidedData } from "../../../apps/web/src/lib/guided-interview-bridge";
import { TaxYearInputSchema } from "../../../src/models/inputs";
import { calculateFederalTax } from "../../../src/engine/federal";
import * as federalEngine from "../../../src/engine/federal";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
});

function createDocument(
  overrides: Partial<WorkspaceDocumentRecord> = {}
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
  overrides: Partial<SeededReturnSummary> = {}
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
    interviewQuestions: [
      {
        id: "wages",
        factId: "wages",
        prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Final W-2 confirmed.",
        sourceDocumentIds: ["doc-w2"],
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "answered",
        answeredAt: "2026-03-13T00:00:00.000Z",
        answerText: "Federal withholding confirmed.",
        sourceDocumentIds: ["doc-w2"],
      },
    ],
    interviewQueue: [],
    nextQuestionId: null,
    reviewNotes: [],
    ...overrides,
  };
}

function createReturnSummary(
  overrides: Partial<WorkspaceReturnSummary> = {}
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

function createNeedsReviewSummary(
  overrides: Partial<WorkspaceReturnSummary> = {}
): WorkspaceReturnSummary {
  return createReturnSummary({
    status: "needs-review",
    ...overrides,
  });
}

function createWorkspace(): ReturnWorkspaceRecord {
  const documents = [createDocument()];
  const seededReturn = createSeededReturn();

  return {
    id: "workspace-northwind-review",
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

async function extractPdfText(contents: Uint8Array) {
  const outputPath = join(tmpdir(), `workspace-filled-return-${Date.now()}-${Math.random()}.pdf`);

  await writeFile(outputPath, contents);

  try {
    const pdfTextScan = await vi.importActual<typeof import("node:child_process")>("node:child_process");
    return pdfTextScan.execFileSync(process.env.TAX_ENGINE_PDF_TEST_PYTHON ?? "python3", ["-c", `
from pypdf import PdfReader
reader = PdfReader(r"${outputPath}")
print("\\n".join((page.extract_text() or "") for page in reader.pages))
`], {
      encoding: "utf8",
    });
  } finally {
    await rm(outputPath, { force: true });
  }
}

async function assertPacketParity(
  download: Awaited<ReturnType<typeof buildWorkspaceFilledReturnDownload>>,
  {
    expectedForms = [],
    suppressedForms = [],
    expectedText = [],
  }: {
    expectedForms?: string[];
    suppressedForms?: string[];
    expectedText?: string[];
  }
) {
  const pdfText = await extractPdfText(download.contents);

  for (const form of expectedForms) {
    expect(download.includedForms).toContain(form);
  }

  for (const form of suppressedForms) {
    expect(download.includedForms).not.toContain(form);
  }

  for (const text of expectedText) {
    expect(pdfText).toContain(text);
  }
}

function createNeedsReviewWorkspace(): ReturnWorkspaceRecord {
  return {
    ...createWorkspace(),
    returnSummary: createNeedsReviewSummary(),
  };
}

function createGuidedFlowState(): GuidedFlowState {
  return {
    taxYear: 2025,
    phase: "complete",
    segmentation: {
      filingStatus: "single",
      incomeTypes: ["w2-wages"],
      lifeEvents: [],
      stateCode: null,
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
        standardDeductionFacts: { primaryBlind: false, primaryCanBeClaimedAsDependent: false, primaryDeceased: false, dualStatusAlien: false, nonresidentAlien: false, shortTaxYear: false },
        dateOfBirth: "1990-02-15",
        usResidencyMonths: "12",
        stateResidency: "full-year",
        firstName: "Jordan",
        lastName: "Northwind",
        ssn: "111-22-3333",
        addressLine1: "123 Main St",
        addressLine2: "",
        city: "Chicago",
        state: "IL",
        zip: "60601",
        dependentCount: "0",
        dependents: [],
      },
      "income-w2": {
        entries: [
          {
            employerName: "Northwind Labs",
            accountHolder: "primary",
            stateTaxReporting: "single",
            state: "IL",
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
    },
  };
}

function createGuidedFlowStateWithEnergyCredit(): GuidedFlowState {
  return {
    ...createGuidedFlowState(),
    sectionData: {
      ...createGuidedFlowState().sectionData,
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
          solarElectricCost: "12000",
          residenceEligibilityConfirmed: true,
          cleanEnergyProperties: [{ category: "solar_electric", qualifiedCost: "12000", installationCompletedDate: "2025-06-01", qualificationConfirmed: true }],
          solarWaterHeatingCost: "",
          insulationCost: "",
          exteriorDoorsWindowsCost: "",
          roofCost: "",
          energyEfficientHvacCost: "",
          waterHeaterHeatPumpCost: "",
        },
      },
    },
  };
}

function createGuidedFlowStateWithOhioStateSelection(): GuidedFlowState {
  const base = createGuidedFlowState();

  return {
    ...base,
    segmentation: {
      ...base.segmentation,
      stateCode: "OH",
    },
    sectionData: {
      ...base.sectionData,
      "income-w2": { entries: base.sectionData["income-w2"]!.entries.map(entry => ({ ...entry, state: "OH" })) },
      "personal-info": {
        ...base.sectionData["personal-info"],
        state: "OH",
      },
    },
  };
}

function createGuidedFlowStateWithUnderpayment(): GuidedFlowState {
  const base = createGuidedFlowState();

  return {
    ...base,
    sectionData: {
      ...base.sectionData,
      "income-w2": {
        entries: [
          {
            employerName: "Northwind Labs",
            accountHolder: "primary",
            stateTaxReporting: "single",
            state: "IL",
            employerEin: "12-3456789",
            wages: "180000",
            federalWithheld: "8000",
            socialSecurityWages: "176100",
            socialSecurityWithheld: "10918.20",
            medicareWages: "180000",
            medicareWithheld: "2610",
            stateWages: "180000",
            stateWithheld: "0",
            aiSuggestedFields: {},
          },
        ],
      },
    },
  };
}

describe("workspace filled return download", () => {
  it("rejects missing facts and mismatched years instead of falling back to a preview", async () => {
    const valid = createGuidedFlowState();
    await expect(buildWorkspaceFilledReturnDownload(createWorkspace(), { ...valid, taxYear: null })).rejects.toThrow(/year/);
    await expect(buildWorkspaceFilledReturnDownload(createWorkspace(), { ...valid, taxYear: 2026 })).rejects.toThrow(/year/);
    await expect(buildWorkspaceFilledReturnDownload(createWorkspace(), { ...valid, sectionData: { ...valid.sectionData,
      "personal-info": { ...valid.sectionData["personal-info"]!, dateOfBirth: "" },
    } })).rejects.toThrow(/taxpayer facts/);
  });
  it("builds a merged filled-PDF download from a ready workspace", async () => {
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), createGuidedFlowState());
    const pdf = await PDFDocument.load(download.contents);
    const pdfText = await extractPdfText(download.contents);

    expect(download.fileName).toBe("workspace-northwind-review-2025-review-return.pdf");
    expect(download.includedForms).toContain("f1040-filled.pdf");
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdfText).toContain("EXPERIMENTAL TAX RETURN REFERENCE");
    expect(pdfText).toContain("SUMMARY OF THIS REVIEW PACKET");
    expect(pdfText.match(/FOR REVIEW ONLY - NOT FOR FILING/g)).toHaveLength(pdf.getPageCount());
    expect(pdfText).not.toContain("123-45-6789");
  });

  it("serves the merged PDF through the app route", async () => {
    const response = await POST(new Request("http://localhost/api/workspace/filled-return", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace: createWorkspace(),
        guidedFlowState: createGuidedFlowState(),
      }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("review-return.pdf");
    expect(response.headers.get("x-tax-engine-export-purpose")).toBe("review");
    expect(response.headers.get("cache-control")).toBe("no-store, private");

    const pdf = await PDFDocument.load(new Uint8Array(await response.arrayBuffer()));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
  });

  it("rejects the legacy workspace-only payload without actual taxpayer facts", async () => {
    const response = await POST(new Request("http://localhost/api/workspace/filled-return", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(createWorkspace()),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/taxpayer facts/);
  });

  it("rejects an explicit filing export request", async () => {
    const response = await POST(new Request("http://localhost/api/workspace/filled-return", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspace: createWorkspace(), guidedFlowState: createGuidedFlowState(), purpose: "filing" }),
    }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not qualified/);
  });

  it("allows localhost filled-return downloads for local-browser workspaces during hosted development", async () => {
    vi.stubEnv("TAX_ENGINE_DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("NODE_ENV", "development");

    const response = await POST(new Request("http://localhost/api/workspace/filled-return", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workspace: createWorkspace({ storageMode: "local-browser" }),
        guidedFlowState: createGuidedFlowState(),
      }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("includes Form 5695 when guided energy credits are present", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithEnergyCredit()
    );

    expect(download.includedForms).toContain("f5695-filled.pdf");
  });

  it("allows a draft filled return PDF when guided data exists but the workspace still needs review", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createNeedsReviewWorkspace(),
      createGuidedFlowState()
    );

    expect(download.includedForms).toContain("f1040-filled.pdf");
  });

  it("redacts SSNs from the generated PDF packet", async () => {
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), createGuidedFlowState());
    const commandResult = await extractPdfText(download.contents);

    expect(commandResult).not.toContain("111223333");
    expect(commandResult).not.toContain("000000000");
  });

  it("calculates education using complete identity before redacting every student page", async () => {
    const calculate = vi.spyOn(federalEngine, "calculateFederalTax");
    const state = createGuidedFlowState();
    const credits = state.sectionData.credits!;
    credits.education = {
      aocStudents: [{
        name: "Jordan Northwind", studentTaxId: "111-22-3333", studentRole: "primary", qualifiedExpenses: "4000", priorYearsClaimed: "0",
        institutionEin: "12-3456789", institutionEligible: true, expensesEligibilityConfirmed: true, form1098TRequirementMet: true, studentTinEligible: true,
        completedFirstFourYearsBeforeYear: false, enrolledAtLeastHalfTime: true, pursuingDegreeOrCredential: true, felonyDrugConviction: false,
        institutions: [{ name: "Synthetic College", address: "1 Campus Drive, Chicago IL 60601", ein: "12-3456789", receivedCurrentYear1098T: true, receivedPriorYear1098TWithBox7: false }],
      }], llcStudents: [], llcExpenses: "0", possessionIncomeExclusion: "0", primaryTinEligible: true,
      canBeClaimedAsDependent: false, claimedAsDependent: false, nonresidentAlien: false, aocBanInEffect: false, form8862Required: false,
    };
    const original = JSON.stringify(state);
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), state);
    expect(calculate.mock.lastCall?.[0].taxpayer.primary.ssn).toBe("111-22-3333");
    calculate.mockRestore();
    expect(download.includedForms).toContain("f8863-filled.pdf");
    const text = await extractPdfText(download.contents);
    expect(text).toContain("Synthetic College");
    expect(text).toContain("2500");
    expect(text.replace(/\s|-/g, "")).not.toContain("111223333");
    expect(JSON.stringify(state)).toBe(original);
  });

  it("does not include a blank Schedule E for a simple wage-only return", async () => {
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), createGuidedFlowState());

    await assertPacketParity(download, {
      suppressedForms: ["f1040se-filled.pdf"],
    });
  });

  it("does not auto-attach Form 2210 even when the engine computes an estimated tax penalty and keeps business-rule validation disclosed as not-validated", async () => {
    const guidedFlowState = createGuidedFlowStateWithUnderpayment();
    const taxInput = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(guidedFlowState));

    expect(taxInput).not.toBeNull();
    expect(calculateFederalTax(taxInput).estimatedTaxPenalty.gt(0)).toBe(true);

    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), guidedFlowState);
    await assertPacketParity(download, {
      suppressedForms: ["f2210-filled.pdf"],
      expectedText: [
        "E-file and business-rule validation: not-validated.",
        "Form 2210 is still suppressed from the draft packet even when an estimated tax penalty is present.",
      ],
    });
  });

  it("includes Ohio reference packet forms and disclosures when Ohio is selected", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      createGuidedFlowStateWithOhioStateSelection()
    );
    await assertPacketParity(download, {
      expectedForms: [
        "oh-it-1040-reference.pdf",
        "oh-schedule-of-withholding-reference.pdf",
      ],
      expectedText: [
        "Ohio packet output is currently generated as reference-summary pages",
        "Packet completeness status: partial.",
      ],
    });
  });
  it("does not turn another state's W-2 withholding into an Ohio payment", async () => {
    const state = createGuidedFlowStateWithOhioStateSelection();
    state.sectionData["income-w2"]!.entries[0].state = "IL";
    const download = await buildWorkspaceFilledReturnDownload(createWorkspace(), state);
    expect(download.includedForms).toContain("oh-it-1040-reference.pdf");
    expect(download.includedForms).not.toContain("oh-schedule-of-withholding-reference.pdf");
  });
});
