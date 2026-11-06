import { afterEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";
import {resolveOhioResidencyReview} from "@/engine/state/oh-residency-source";
import {buildOhioResidentReturnInput,extractOhioWithholding} from "@/engine/state/oh-input-adapter";
import {buildOhioPaymentSource} from "@/engine/state/oh-payment-source";
import {confirmCurrentOhioWorkspaceOriginals} from "../../fixtures/oh-workspace-actual-originals";
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
import { completePersonalInfo, completeW2Entry, completeInterestSource, completeDividendSource, completeBrokerageSource, completeRetirementSource, startCompleteInterview } from "../../guided-interview/complete-facts";

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
  // Explicit complete fictional source facts replace the old incomplete interview shell.
  const state = startCompleteInterview({filingStatus:"single",incomeTypes:["w2-wages"],lifeEvents:[],stateCode:"OH"});
  state.phase = "complete";
  state.sectionData["personal-info"] = {...completePersonalInfo,dateOfBirth:"1990-02-15",usResidencyMonths:"12",stateResidency:"full-year",firstName:"Jordan",lastName:"Northwind",ssn:"111-22-3333",addressLine1:"123 Main St",addressLine2:"",city:"Columbus",state:"OH",zip:"43215",dependentCount:"0",dependents:[]};
  state.sectionData["income-w2"] = {entries:[{...completeW2Entry,sourceTaxYear:"2025",stateTaxReporting:"single",state:"OH",employerName:"Northwind Labs",employerEin:"12-3456789",wages:"75000",federalWithheld:"8200",socialSecurityWages:"75000",socialSecurityWithheld:"4650",medicareWages:"75000",medicareWithheld:"1087.50",stateWages:"75000",stateWithheld:"3750",aiSuggestedFields:{}}]};
  state.sectionData["state-return"] = {additionalStateWithholding:"",stateEstimatedPayments:[]};
  return state;
}

function addActualRetirement(state:GuidedFlowState,payer:string,amount:string){
  const deductions=state.sectionData.deductions;if(!deductions)throw Error("Explicit synthetic deduction facts missing");
  deductions.nonW2IncomeTaxesDeductedElsewhere="0";
  if(!state.segmentation.incomeTypes.includes("retirement"))state.segmentation.incomeTypes.push("retirement");
  state.sectionData["income-retirement"]={entries:[{...completeRetirementSource,payer,stateTaxReporting:"single",state:"OH",stateWithheld:amount,stateDistribution:"1000"}]};
}
function rawSourceWithholding(input:Parameters<typeof resolveOhioResidencyReview>[0]){
  return extractOhioWithholding(input.w2s,input.formW2G,input.form1099G,input.form1099K,input.form1099R,input.form1099Nec,input.form1099Misc,input.form1099Int,input.form1099Div,input.form1099B,input.form1099OID);
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
  // Specs: spec/state/oh-input-adapter.yaml, spec/state/oh-schedule-of-withholding.yaml.
  it("includes actual investment withholding before additional payment overlays", async () => {
    const guidedState = createGuidedFlowStateWithOhioStateSelection();
    guidedState.segmentation.incomeTypes.push("investments");
    const deductions=guidedState.sectionData.deductions;if(!deductions)throw Error("Explicit deduction facts missing");
    deductions.nonW2IncomeTaxesDeductedElsewhere = "0";
    guidedState.sectionData["income-investments"] = {
      interestEntries: [{ ...completeInterestSource, interestIncome: "100", stateTaxReporting: "single", state: "OH", stateWithheld: "0.10" }],
      dividendEntries: [{ ...completeDividendSource, ordinaryDividends: "100", stateTaxReporting: "single", state: "OH", stateWithheld: "0.20" }],
      brokerageEntries: [{ ...completeBrokerageSource, stateTaxReporting: "single", state: "OH", stateWithheld: "0.30" }],
    };
    addActualRetirement(guidedState,"Other pension","0.4");
    confirmCurrentOhioWorkspaceOriginals(guidedState);
    const packet = vi.spyOn(ohioReferenceForms, "fillOhioReferenceForms").mockResolvedValue({ filledForms: [] });
    try {
      await buildWorkspaceFilledReturnDownload(createWorkspace(), guidedState);
      const call=packet.mock.calls[0];if(!call)throw Error("Actual Ohio packet call missing");
      const original=resolveOhioResidencyReview(call[0],call[1],call[4]);
      expect(original.form1099R[0]?.stateWithheld).toBe("0.4");
      expect(original.form1099Int[0]?.stateWithheld).toBe("0.10");
      expect(original.form1099Div[0]?.stateWithheld).toBe("0.20");
      expect(original.form1099B[0]?.stateWithheld).toBe("0.30");
      expect(rawSourceWithholding(original).toString()).toBe("3751");
      expect(new Decimal(buildOhioResidentReturnInput(original,call[1]).ohioWithholding??0).toString()).toBe("3751");
      expect(call[3]).toEqual({});
    } finally { packet.mockRestore(); }
  });

  // Spec: spec/federal/guided-input.yaml, state-payment-sources
  it("passes exact classified state amounts to the review packet overlay", async () => {
    const guidedState = createGuidedFlowStateWithOhioStateSelection();
    guidedState.segmentation.incomeTypes.push("investments");
    guidedState.sectionData["income-investments"]={interestEntries:[{...completeInterestSource,payer:"Example Bank",stateTaxReporting:"single",state:"OH",stateWithheld:"0.2"}],dividendEntries:[],brokerageEntries:[]};
    addActualRetirement(guidedState,"Example Pension","0.1");
    // Each actual receipt respects the existing15-digit source-field bound.
    // The original giant Apr15 amount remains pinned as an aggregate, without binary conversion.
    const receipts=[...Array.from({length:9},()=>({date:"2025-04-15",amount:"999999999999999"})),{date:"2025-04-15",amount:"7199254741002.01"},{date:"2025-06-15",amount:"0.09"}];
    guidedState.sectionData["state-return"]={additionalStateWithholding:"",stateEstimatedPayments:receipts.map(r=>({state:"OH",...r}))};
    confirmCurrentOhioWorkspaceOriginals(guidedState,receipts);
    const packet = vi.spyOn(ohioReferenceForms, "fillOhioReferenceForms").mockResolvedValue({ filledForms: [] });
    try {
      await buildWorkspaceFilledReturnDownload(createWorkspace(), guidedState);
      const call=packet.mock.calls[0];if(!call)throw Error("Actual Ohio packet call missing");
      const original=resolveOhioResidencyReview(call[0],call[1],call[4]);
      expect(original.form1099R[0]?.stateWithheld).toBe("0.1");expect(original.form1099Int[0]?.stateWithheld).toBe("0.2");
      expect(rawSourceWithholding(original).toString()).toBe("3750.3");
      const facts=original.ohioPayments;if(!facts)throw Error("Actual canonical receipt packet missing");
      expect(facts.paymentRows.filter(r=>r.date==="2025-04-15").reduce((sum,r)=>sum.plus(r.amount),new Decimal(0)).toFixed()).toBe("9007199254740993.01");
      expect(buildOhioPaymentSource(original,facts).estimatedPayments.toFixed()).toBe("9007199254740993.1");
      const adapted=buildOhioResidentReturnInput(original,call[1]);
      expect(new Decimal(adapted.ohioWithholding??0).toString()).toBe("3750");
      expect(new Decimal(adapted.estimatedPayments??0).toString()).toBe("9007199254740993");
      expect(facts.paymentRows).toHaveLength(11);expect(guidedState.sectionData["state-return"]?.stateEstimatedPayments).toHaveLength(11);
      expect(call[3]).toEqual({});
    } finally { packet.mockRestore(); }
  });

  // Spec: spec/federal/guided-input.yaml, state-payment-sources
  it("blocks review export when legacy state withholding lacks actual source facts", async () => {
    const guidedState = createGuidedFlowStateWithOhioStateSelection();
    guidedState.sectionData["state-return"] = { additionalStateWithholding: "100", stateEstimatedPayments: [] };
    await expect(buildWorkspaceFilledReturnDownload(createWorkspace(), guidedState)).rejects.toThrow("Complete the required taxpayer facts");
  });

  it.each(["0.4","0.3"])('retains unsupported saved additional %s as a conflict rather than a second credit',async amount=>{
    const guidedState=confirmCurrentOhioWorkspaceOriginals(createGuidedFlowStateWithOhioStateSelection());
    const data=guidedState.sectionData["state-return"];if(!data)throw Error("Actual state source facts missing");
    data.additionalStateWithholding=amount;
    data.additionalStateWithholdingEntries=amount==="0.4"?[{payer:"Other pension",documentType:"1099-R",state:"OH",taxYear:"2025",amount:"0.4"}]:[{payer:"Example Pension",documentType:"1099-R",state:"OH",taxYear:"2025",amount:"0.1"},{payer:"Example Bank",documentType:"1099-INT",state:"OH",taxYear:"2025",amount:"0.2"}];
    await expect(buildWorkspaceFilledReturnDownload(createWorkspace(),guidedState)).rejects.toThrow(/actual|original|canonical|withholding/i);
    expect(data.additionalStateWithholding).toBe(amount);
  });

  it("buildWorkspaceFilledReturnDownload keeps Ohio packet disclosures honest when only reference-summary state forms are attached", async () => {
    const download = await buildWorkspaceFilledReturnDownload(
      createWorkspace(),
      confirmCurrentOhioWorkspaceOriginals(createGuidedFlowStateWithOhioStateSelection()),
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
