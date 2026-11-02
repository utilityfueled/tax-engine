/** Explicit synthetic actual state source flow plus existing review-workspace metadata. */
import type {ReturnWorkspaceRecord,SeededReturnSummary,WorkspaceDocumentRecord,WorkspaceReturnSummary} from '@tax-engine/contracts';
import {buildWorkspaceStructuredFacts} from '@tax-engine/engine';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {ohioPaymentFixture} from './oh-payments.js';
import {completeW2Entry,startCompleteInterview} from '../guided-interview/complete-facts';
export function guidedOhioSourceFlow(status:'full_year_resident'|'part_year_resident'|'nonresident'){
 const state=startCompleteInterview({filingStatus:'single',incomeTypes:['w2-wages'],lifeEvents:[],stateCode:'OH'});
 const personal=state.sectionData['personal-info'];
 if(!personal)throw new Error('Synthetic Ohio source fixture requires personal information');
 personal.stateResidency=status==='full_year_resident'?'full-year':status==='part_year_resident'?'part-year':'nonresident';
 state.sectionData['income-w2']={entries:[{...completeW2Entry,sourceTaxYear:'2025',wages:'100000',federalWithheld:'0',socialSecurityWages:'100000',socialSecurityWithheld:'6200',medicareWages:'100000',medicareWithheld:'1450',stateTaxReporting:'single',state:'OH',stateWages:status==='full_year_resident'?'100000':status==='part_year_resident'?'40000':'20000',stateWithheld:'0'}]};
 const actual=ohioPaymentFixture(status);
 state.sectionData['state-return']={stateEstimatedPayments:[],additionalStateWithholding:'',ohioResidency:{...actual.ohioResidency,taxYear:'2025'},ohioPayments:{...actual.ohioPayments,taxYear:'2025',specialFacts:{farmingFishingIncome:'known_none',militaryDisasterRelief:'known_none'}}};
 const raw=buildTaxInputFromGuidedData(state);if(!raw)throw new Error('Explicit synthetic current federal originals required');
 const original=TaxYearInputSchema.parse(raw),current=state.sectionData['state-return'];
 current.ohioResidency=confirmGuidedOhioResidencyFacts(original,current.ohioResidency);
 current.ohioPayments=confirmGuidedOhioPaymentFacts(original,current.ohioPayments);
 return state;
}
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

export function stateOriginalsReviewWorkspace(): ReturnWorkspaceRecord {
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
