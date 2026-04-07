import { describe, expect, it } from "vitest";
import { officialSampleDocumentFixtures, supportMatrix } from "@tax-engine/contracts";
import {
  answerInterviewQuestion,
  clearWorkspace,
  deleteWorkspace,
  ensureWorkspace,
  getFutureYearSampleUploadMessage,
  getWorkspace,
  ingestFiles,
  listWorkspaces,
  reopenInterviewQuestion,
  removeDocument,
  refreshWorkspaceEnginePreview
} from "../../../apps/web/src/lib/workspace-storage";

function createMemoryStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    get length() {
      return values.size;
    }
  };
}

describe("workspace storage", () => {
  it("blocks future-year official sample uploads with an actionable message", () => {
    expect(getFutureYearSampleUploadMessage([
      { name: "irs-w2-2026.pdf", size: 10 }
    ])).toBe(
      "2026 Form W-2 (official info-copy PDF) is an official sample document for tax year 2026, so it can't drive a 2025 return yet. Upload a 2025 tax document instead."
    );
  });

  it("allows current filing-season sample uploads to proceed", () => {
    expect(getFutureYearSampleUploadMessage([
      { name: "fw2--2025.pdf", size: 10 }
    ])).toBeNull();
  });

  it("reads missing workspaces without creating empty drafts", () => {
    const storage = createMemoryStorage();

    expect(getWorkspace(storage, "missing-draft")).toBeNull();
    expect(listWorkspaces(storage)).toEqual([]);
  });

  it("classifies seeded fixtures by both workspace ids and official IRS PDF basenames", () => {
    const storage = createMemoryStorage();
    const workspaceId = "alias-coverage";
    const coverageByKind = new Map(supportMatrix.map((entry) => [entry.kind, entry.coverage]));
    const supportedFixtureIds = new Set(["irs-1099-nec-2025"]);
    const expectedSupported = officialSampleDocumentFixtures
      .filter((fixture) => supportedFixtureIds.has(fixture.id) || coverageByKind.get(fixture.kind) === "supported")
      .length * 2;
    const files = officialSampleDocumentFixtures.flatMap((fixture, index) => [
      { name: `${fixture.id}.pdf`, size: index + 1 },
      { name: `${fixture.aliases.at(-1)}.pdf`, size: 100 + index }
    ]);

    const workspace = ingestFiles(storage, workspaceId, files);

    expect(workspace.summary.totalDocuments).toBe(files.length);
    expect(workspace.summary.officialFixtureMatches).toBe(files.length);
    expect(workspace.summary.supportedDocuments).toBe(expectedSupported);
    expect(workspace.summary.pendingReviewDocuments).toBe(files.length - expectedSupported);
    expect(workspace.seededReturn.status).toBe("needs-review");
    expect(workspace.seededReturn.taxYearHints).toEqual([2026, 2025]);
    expect(workspace.seededReturn.facts.map((fact) => fact.id)).toEqual([
      "wages",
      "withholding",
      "taxable-interest",
      "ordinary-dividends",
      "qualified-dividends",
      "capital-gain-distributions",
      "government-payments-review",
      "retirement-distribution-review",
      "social-security-benefits-review",
      "hsa-distribution-review",
      "student-loan-interest-review",
      "premium-tax-credit-review",
      "nonemployee-compensation",
      "schedule-c-expense-review",
      "broker-proceeds",
      "cost-basis-review"
    ]);
    expect(workspace.seededReturn.reviewNotes).toContain(
      "Publication 4491, VITA/TCE Training Guide still needs manual review before facts can be trusted."
    );
    expect(workspace.seededReturn.reviewNotes).toContain(
      "Publication 4491-X (Rev. 1-2026) still needs manual review before facts can be trusted."
    );

    for (const fixture of officialSampleDocumentFixtures) {
      const matchedDocuments = workspace.documents.filter((document) => document.matchedFixtureId === fixture.id);

      expect(matchedDocuments).toHaveLength(2);
      expect(matchedDocuments.every((document) => document.label === fixture.title)).toBe(true);
    }
  });

  it("seeds a traceable interview summary from supported uploads", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "supported-summary", [
      { name: "fw2.pdf", size: 10 },
      { name: "f1099div.pdf", size: 11 }
    ]);

    expect(workspace.summary.interviewQuestionsRemaining).toBe(5);
    expect(workspace.seededReturn.status).toBe("ready-for-interview");
    expect(workspace.seededReturn.taxYearHints).toEqual([2026, 2025]);
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "ordinary-dividends",
        label: "Ordinary dividends",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      },
      {
        id: "qualified-dividends",
        label: "Qualified dividends",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      },
      {
        id: "capital-gain-distributions",
        label: "Capital gain distributions",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      }
    ]);
    expect(workspace.seededReturn.interviewQueue).toEqual([
      "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
      "Confirm federal and state withholding amounts from each wage statement.",
      "Confirm whether all dividend statements are included for the year.",
      "Confirm qualified dividend amounts and whether any foreign tax was paid.",
      "Confirm whether capital gain distributions or reinvested dividends need basis review."
    ]);
    expect(workspace.documents[0]?.seededFactIds).toEqual(["wages", "withholding"]);
    expect(workspace.documents[1]?.seededFactIds).toEqual([
      "ordinary-dividends",
      "qualified-dividends",
      "capital-gain-distributions"
    ]);
  });

  it("stores parsed W-2 uploads as supported document facts", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "parsed-w2", [
      {
        name: "2025 Northwind W2.pdf",
        size: 42,
        detectedDocument: {
          kind: "w2",
          coverage: "supported",
          label: "NORTHWIND FABRICATION LLC W-2",
          notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
          seededFactIds: ["wages", "withholding"],
          detectedFacts: [
            {
              idSuffix: "parsed-w2-summary",
              factId: "wages",
              label: "Wages",
              value: "Parsed uploaded W-2: NORTHWIND FABRICATION LLC box 1 wages $107,175.28 and box 2 federal withholding $15,251.46.",
              confidence: "high",
              machineValue: {
                entryKind: "w2-summary",
                employerName: "NORTHWIND FABRICATION LLC",
                employerEin: "04-3097449",
                wages: "107175.28",
                federalWithheld: "15251.46",
                socialSecurityWages: "107175.28",
                socialSecurityWithheld: "6644.87",
                medicareWages: "107175.28",
                medicareWithheld: "1554.04",
                stateWages: "107175.28",
                stateWithheld: "2962.12"
              }
            },
            {
              idSuffix: "parsed-w2-withholding",
              factId: "withholding",
              label: "Federal withholding",
              value: "Parsed uploaded W-2 withholding: box 2 federal income tax withheld $15,251.46.",
              confidence: "high"
            }
          ]
        }
      }
    ]);

    expect(workspace.summary.totalDocuments).toBe(1);
    expect(workspace.summary.supportedDocuments).toBe(1);
    expect(workspace.summary.pendingReviewDocuments).toBe(0);
    expect(workspace.documents[0]).toMatchObject({
      kind: "w2",
      coverage: "supported",
      matchedFixtureId: null,
      seededFactIds: ["wages", "withholding"],
      detectedFacts: [
        {
          idSuffix: "parsed-w2-summary",
          factId: "wages"
        },
        {
          idSuffix: "parsed-w2-withholding",
          factId: "withholding"
        }
      ]
    });
    expect(workspace.structuredFacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.stringContaining("parsed-w2-summary"),
          kind: "document-detected",
          sourceType: "upload",
          confidence: "high",
          machineValue: {
            entryKind: "w2-summary",
            employerName: "NORTHWIND FABRICATION LLC",
            employerEin: "04-3097449",
            wages: "107175.28",
            federalWithheld: "15251.46",
            socialSecurityWages: "107175.28",
            socialSecurityWithheld: "6644.87",
            medicareWages: "107175.28",
            medicareWithheld: "1554.04",
            stateWages: "107175.28",
            stateWithheld: "2962.12"
          }
        })
      ])
    );
  });

  it("deduplicates repeated real-upload W-2 documents by file identity", () => {
    const storage = createMemoryStorage();

    const firstWorkspace = ingestFiles(storage, "dedupe-parsed-w2", [
      {
        name: "2025 Northwind W2.pdf",
        size: 42,
        detectedDocument: {
          kind: "w2",
          coverage: "supported",
          label: "NORTHWIND FABRICATION LLC W-2",
          notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
          seededFactIds: ["wages", "withholding"],
          detectedFacts: [
            {
              idSuffix: "parsed-w2-summary",
              factId: "wages",
              label: "Wages",
              value: "Parsed uploaded W-2: NORTHWIND FABRICATION LLC box 1 wages $107,175.28 and box 2 federal withholding $15,251.46.",
              confidence: "high",
              machineValue: {
                entryKind: "w2-summary",
                employerName: "NORTHWIND FABRICATION LLC",
                employerEin: "04-3097449",
                wages: "107175.28",
                federalWithheld: "15251.46"
              }
            }
          ]
        }
      }
    ]);

    const refreshedWorkspace = ingestFiles(storage, "dedupe-parsed-w2", [
      {
        name: "2025 Northwind W2.pdf",
        size: 42,
        detectedDocument: {
          kind: "w2",
          coverage: "supported",
          label: "NORTHWIND FABRICATION LLC W-2",
          notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
          seededFactIds: ["wages", "withholding"],
          detectedFacts: [
            {
              idSuffix: "parsed-w2-summary",
              factId: "wages",
              label: "Wages",
              value: "Parsed uploaded W-2: NORTHWIND FABRICATION LLC box 1 wages $107,175.28 and box 2 federal withholding $15,251.46.",
              confidence: "high",
              machineValue: {
                entryKind: "w2-summary",
                employerName: "NORTHWIND FABRICATION LLC",
                employerEin: "04-3097449",
                wages: "107175.28",
                federalWithheld: "15251.46",
                socialSecurityWages: "107175.28",
                socialSecurityWithheld: "6644.87",
                medicareWages: "107175.28",
                medicareWithheld: "1554.04",
                stateWages: "107175.28",
                stateWithheld: "2962.12"
              }
            }
          ]
        }
      }
    ]);

    expect(firstWorkspace.summary.totalDocuments).toBe(1);
    expect(refreshedWorkspace.summary.totalDocuments).toBe(1);
    expect(refreshedWorkspace.documents).toHaveLength(1);
    expect(refreshedWorkspace.documents[0]?.detectedFacts[0]?.machineValue).toMatchObject({
      entryKind: "w2-summary",
      socialSecurityWages: "107175.28",
      socialSecurityWithheld: "6644.87",
      medicareWages: "107175.28",
      medicareWithheld: "1554.04",
      stateWages: "107175.28",
      stateWithheld: "2962.12"
    });
  });

  it("does not keep AI-reviewed unsupported uploads in needs-review once supported facts are fully answered", () => {
    const storage = createMemoryStorage();
    const workspaceId = "reviewed-upload-ready";

    ingestFiles(storage, workspaceId, [
      { name: "f1099b--2025.pdf", size: 12 },
      {
        name: "brokerage-cover-letter.pdf",
        size: 88,
        detectedDocument: {
          kind: "unknown",
          coverage: "reviewed",
          label: "Brokerage packet cover letter",
          notes: "Brokerage packet. AI reviewed the upload and suggested no additional tax action. Next step: keep this attached for your records.",
          seededFactIds: [],
          detectedFacts: []
        }
      }
    ]);

    answerInterviewQuestion(
      storage,
      workspaceId,
      "broker-proceeds",
      "All broker proceeds belong on Form 8949."
    );
    const workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "cost-basis-review",
      "Basis reporting and holding periods are confirmed."
    );

    expect(workspace.summary.pendingReviewDocuments).toBe(0);
    expect(workspace.seededReturn.reviewNotes).toEqual([]);
    expect(workspace.returnSummary.status).toBe("ready-to-recompute");
    expect(workspace.returnSummary.blockers).toEqual([]);
    expect(workspace.documents.find((document) => document.name === "brokerage-cover-letter.pdf")?.coverage).toBe("reviewed");
  });

  it("classifies Form 1098-E uploads into a student-loan-interest interview item", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "student-loan-interest", [
      { name: "f1098e.pdf", size: 21 }
    ]);

    expect(workspace.summary.totalDocuments).toBe(1);
    expect(workspace.summary.supportedDocuments).toBe(1);
    expect(workspace.summary.interviewQuestionsRemaining).toBe(1);
    expect(workspace.seededReturn.taxYearHints).toEqual([2025]);
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "student-loan-interest-review",
        label: "Student loan interest review",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1098-e-2025:f1098e.pdf:21"]
      }
    ]);
    expect(workspace.seededReturn.interviewQuestions).toEqual([
      {
        id: "student-loan-interest-review",
        factId: "student-loan-interest-review",
        prompt: "Confirm student loan interest reported on Form 1098-E, whether any capitalized interest is already included, and whether any additional below-threshold interest still needs manual entry.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1098-e-2025:f1098e.pdf:21"]
      }
    ]);
    expect(workspace.returnSummary.items).toEqual([
      {
        id: "student-loan-interest",
        label: "Student loan interest",
        status: "needs-answer",
        engineTargets: ["Form 1098-E", "Schedule 1 Line 21", "Form 1040 Line 10"],
        relatedFactIds: ["student-loan-interest-review"],
        sourceDocumentIds: ["irs-1098-e-2025:f1098e.pdf:21"],
        answeredFactCount: 0,
        factCount: 1
      }
    ]);
  });

  it("classifies Form 1095-A uploads into a premium-tax-credit interview item", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "premium-tax-credit", [
      { name: "f1095a.pdf", size: 23 }
    ]);

    expect(workspace.summary.totalDocuments).toBe(1);
    expect(workspace.summary.supportedDocuments).toBe(1);
    expect(workspace.summary.interviewQuestionsRemaining).toBe(1);
    expect(workspace.seededReturn.taxYearHints).toEqual([2025]);
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "premium-tax-credit-review",
        label: "Marketplace coverage and premium tax credit review",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1095-a-2025:f1095a.pdf:23"]
      }
    ]);
    expect(workspace.seededReturn.interviewQuestions).toEqual([
      {
        id: "premium-tax-credit-review",
        factId: "premium-tax-credit-review",
        prompt: "Confirm Form 1095-A marketplace premiums, SLCSP amounts, advance premium tax credit, and whether any allocation or corrected-form follow-up is still needed.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1095-a-2025:f1095a.pdf:23"]
      }
    ]);
    expect(workspace.returnSummary.items).toEqual([
      {
        id: "premium-tax-credit",
        label: "Marketplace coverage and premium tax credit",
        status: "needs-answer",
        engineTargets: ["Form 1095-A", "Form 8962", "Schedule 2 Line 2", "Schedule 3 Line 10"],
        relatedFactIds: ["premium-tax-credit-review"],
        sourceDocumentIds: ["irs-1095-a-2025:f1095a.pdf:23"],
        answeredFactCount: 0,
        factCount: 1
      }
    ]);
  });

  it("classifies Form 1099-G uploads into a government-payments interview item", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "government-payments", [
      { name: "f1099g.pdf", size: 22 }
    ]);

    expect(workspace.summary.totalDocuments).toBe(1);
    expect(workspace.summary.supportedDocuments).toBe(1);
    expect(workspace.summary.interviewQuestionsRemaining).toBe(1);
    expect(workspace.seededReturn.taxYearHints).toEqual([2025]);
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "government-payments-review",
        label: "Government payments review",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-g-2025:f1099g.pdf:22"]
      }
    ]);
    expect(workspace.seededReturn.interviewQuestions).toEqual([
      {
        id: "government-payments-review",
        factId: "government-payments-review",
        prompt: "Confirm unemployment compensation, any state or local income tax refund amounts, withholding, and whether prior-year itemized deductions make any refund taxable.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-g-2025:f1099g.pdf:22"]
      }
    ]);
    expect(workspace.returnSummary.items).toEqual([
      {
        id: "government-payments",
        label: "Government payments",
        status: "needs-answer",
        engineTargets: ["Form 1099-G", "Taxable Refund Worksheet", "Schedule 1 Lines 1 and 7", "Form 1040 Lines 8 and 25d"],
        relatedFactIds: ["government-payments-review"],
        sourceDocumentIds: ["irs-1099-g-2025:f1099g.pdf:22"],
        answeredFactCount: 0,
        factCount: 1
      }
    ]);
  });

  it("classifies official 1099-R uploads for deterministic retirement-distribution follow-up", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "retirement-1099r", [
      { name: "f1099r.pdf", size: 14 }
    ]);

    expect(workspace.documents[0]).toMatchObject({
      matchedFixtureId: "irs-1099-r-2025",
      kind: "1099-r",
      coverage: "supported",
      seededFactIds: ["retirement-distribution-review"]
    });
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "retirement-distribution-review",
        label: "Retirement distribution review",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: [workspace.documents[0]!.id]
      }
    ]);
  });

  it("classifies official 1099-SA uploads for deterministic HSA-distribution follow-up", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "hsa-1099sa", [
      { name: "f1099sa.pdf", size: 15 }
    ]);

    expect(workspace.documents[0]).toMatchObject({
      matchedFixtureId: "irs-1099-sa-2025",
      kind: "1099-sa",
      coverage: "supported",
      seededFactIds: ["hsa-distribution-review"]
    });
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "hsa-distribution-review",
        label: "HSA distribution review",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: [workspace.documents[0]!.id]
      }
    ]);
  });

  it("classifies official SSA-1099 uploads for deterministic Social Security follow-up", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "social-security-ssa1099", [
      { name: "ssa1099.pdf", size: 16 }
    ]);

    expect(workspace.documents[0]).toMatchObject({
      matchedFixtureId: "irs-ssa-1099-2025",
      kind: "ssa-1099",
      coverage: "supported",
      seededFactIds: ["social-security-benefits-review"]
    });
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "social-security-benefits-review",
        label: "Social Security benefits review",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: [workspace.documents[0]!.id]
      }
    ]);
  });

  it("seeds capital gains interview prompts from supported 1099-B uploads", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "broker-sales", [
      { name: "f1099b--2025.pdf", size: 12 }
    ]);

    expect(workspace.summary).toEqual({
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 2
    });
    expect(workspace.seededReturn).toEqual({
      status: "ready-for-interview",
      taxYearHints: [2025],
      facts: [
        {
          id: "broker-proceeds",
          label: "Broker sale proceeds",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"]
        },
        {
          id: "cost-basis-review",
          label: "Cost basis and adjustments review",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"]
        }
      ],
      interviewQuestions: [
        {
          id: "broker-proceeds",
          factId: "broker-proceeds",
          prompt: "Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"]
        },
        {
          id: "cost-basis-review",
          factId: "cost-basis-review",
          prompt: "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"]
        }
      ],
      interviewQueue: [
        "Confirm whether every broker sale belongs on Form 8949 and whether any statements are missing.",
        "Confirm basis reporting, wash sale adjustments, and holding periods from each Form 1099-B."
      ],
      nextQuestionId: "broker-proceeds",
      reviewNotes: []
    });
    expect(workspace.documents[0]?.matchedFixtureId).toBe("irs-1099-b-2025");
    expect(workspace.documents[0]?.coverage).toBe("supported");
    expect(workspace.documents[0]?.seededFactIds).toEqual([
      "broker-proceeds",
      "cost-basis-review"
    ]);
    expect(workspace.returnSummary).toEqual({
      status: "awaiting-interview",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 0,
      totalFactCount: 2,
      readyItemCount: 0,
      itemCount: 1,
      blockers: [
        {
          id: "needs-answer:capital-gains",
          message: "Capital gains and basis review still has 2 unanswered interview confirmation(s).",
          relatedFactIds: ["broker-proceeds", "cost-basis-review"],
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"]
        }
      ],
      items: [
        {
          id: "capital-gains",
          label: "Capital gains and basis review",
          status: "needs-answer",
          engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
          relatedFactIds: ["broker-proceeds", "cost-basis-review"],
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"],
          answeredFactCount: 0,
          factCount: 2
        }
      ]
    });
    expect(workspace.enginePreview).toBeNull();
  });

  it("classifies official 1099-NEC uploads for deterministic simple Schedule C follow-up", () => {
    const storage = createMemoryStorage();

    const workspace = ingestFiles(storage, "self-employment", [
      { name: "f1099nec.pdf", size: 13 }
    ]);

    expect(workspace.summary).toEqual({
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 2
    });
    expect(workspace.seededReturn).toEqual({
      status: "ready-for-interview",
      taxYearHints: [2025],
      facts: [
        {
          id: "nonemployee-compensation",
          label: "1099-NEC income classification",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"]
        },
        {
          id: "schedule-c-expense-review",
          label: "Schedule C expense review",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"]
        }
      ],
      interviewQuestions: [
        {
          id: "nonemployee-compensation",
          factId: "nonemployee-compensation",
          prompt: "Confirm whether each Form 1099-NEC amount belongs on Schedule C and whether any payments should be reclassified or excluded.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"]
        },
        {
          id: "schedule-c-expense-review",
          factId: "schedule-c-expense-review",
          prompt: "Confirm the business expenses, mileage, and home office records needed to compute Schedule C net profit.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"]
        }
      ],
      interviewQueue: [
        "Confirm whether each Form 1099-NEC amount belongs on Schedule C and whether any payments should be reclassified or excluded.",
        "Confirm the business expenses, mileage, and home office records needed to compute Schedule C net profit."
      ],
      nextQuestionId: "nonemployee-compensation",
      reviewNotes: []
    });
    expect(workspace.documents[0]).toMatchObject({
      matchedFixtureId: "irs-1099-nec-2025",
      coverage: "supported",
      kind: "1099-nec",
      label: "Form 1099-NEC (Rev. April 2025)",
      seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"]
    });
    expect(workspace.returnSummary.status).toBe("awaiting-interview");
    expect(workspace.returnSummary.blockers).toContainEqual({
      id: "needs-answer:schedule-c-income",
      message: "Schedule C income and expenses still has 2 unanswered interview confirmation(s).",
      relatedFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
      sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"]
    });
    expect(workspace.checklist.find((item) => item.id === "coverage")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "interview")?.status).toBe("needs-input");
  });

  it("promotes answered 1099-NEC fixture prompts into a deterministic Schedule C recompute preview", async () => {
    const storage = createMemoryStorage();
    const workspaceId = "self-employment-ready";

    ingestFiles(storage, workspaceId, [{ name: "f1099nec.pdf", size: 13 }]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "nonemployee-compensation",
      "All nonemployee compensation belongs on Schedule C."
    );
    let workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "schedule-c-expense-review",
      "No business expenses or home office deduction apply to this fixture."
    );
    workspace = await refreshWorkspaceEnginePreview(workspace);

    expect(workspace.returnSummary).toEqual({
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
          id: "schedule-c-income",
          label: "Schedule C income and expenses",
          status: "ready",
          engineTargets: ["Schedule C", "Schedule SE", "Schedule 1 Line 3"],
          relatedFactIds: ["nonemployee-compensation", "schedule-c-expense-review"],
          sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"],
          answeredFactCount: 2,
          factCount: 2
        }
      ]
    });
    expect(workspace.enginePreview).toMatchObject({
      mode: "engine-recompute",
      taxYear: 2025,
      sourceDocumentIds: ["irs-1099-nec-2025:f1099nec.pdf:13"],
      sourceFixtureIds: ["irs-1099-nec-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived facts captured in the workspace ledger.",
        "The confirmed 2025 Form 1099-NEC upload contributes $18,000 of Schedule C gross receipts with no withholding.",
        "This simple Schedule C preview assumes zero business expenses and no home office deduction unless a later fact model captures them explicitly."
      ],
      metrics: {
        totalIncome: "18000",
        totalPayments: "182"
      }
    });
    expect(workspace.enginePreview?.highlightedLines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "Sched C:31",
        value: "18000"
      }),
      expect.objectContaining({
        id: "Sched 1:3",
        value: "18000"
      })
    ]));
    expect(workspace.checklist.find((item) => item.id === "coverage")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "interview")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "review")?.status).toBe("ready");
  });

  it("promotes fully confirmed supported 2025 facts into a ready-to-recompute return summary", async () => {
    const storage = createMemoryStorage();
    const workspaceId = "return-summary-ready";

    ingestFiles(storage, workspaceId, [{ name: "f1099b--2025.pdf", size: 12 }]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "broker-proceeds",
      "All broker proceeds belong on Form 8949."
    );
    let workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "cost-basis-review",
      "Basis reporting and holding periods are confirmed."
    );
    workspace = await refreshWorkspaceEnginePreview(workspace);

    expect(workspace.returnSummary).toEqual({
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
          id: "capital-gains",
          label: "Capital gains and basis review",
          status: "ready",
          engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
          relatedFactIds: ["broker-proceeds", "cost-basis-review"],
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"],
          answeredFactCount: 2,
          factCount: 2
        }
      ]
    });
    expect(workspace.enginePreview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      filingState: "TX",
      sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"],
      sourceFixtureIds: ["irs-1099-b-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived transaction facts captured in the workspace ledger.",
        "The confirmed 2025 Form 1099-B upload contributes 2 capital-gains transaction fact(s) with no withholding or carryforwards.",
        "This preview only runs after the related capital-gains facts are fully confirmed in the interview loop."
      ],
      metrics: {
        totalIncome: "55000",
        agi: "55000",
        taxableIncome: "39250",
        totalTax: "1534",
        totalPayments: "0",
        refund: "0",
        amountOwed: "1534"
      },
      highlightedLines: expect.arrayContaining([
        {
          id: "1040:24",
          form: "1040",
          line: "24",
          label: "Total tax",
          value: "1534",
          formula: expect.stringContaining("Line 22"),
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:37",
          form: "1040",
          line: "37",
          label: "Amount you owe",
          value: "1534",
          formula: "Total tax - Total payments (if positive)",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        }
      ])
    });
  });

  it("promotes confirmed 1099-INT and 1099-DIV fixture facts into a deterministic 2025 investment-income recompute", async () => {
    const storage = createMemoryStorage();
    const workspaceId = "investment-income-ready";

    ingestFiles(storage, workspaceId, [
      { name: "f1099int.pdf", size: 11 },
      { name: "f1099div.pdf", size: 11 }
    ]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "taxable-interest",
      "Confirmed taxable interest with no tax-exempt interest or early withdrawal penalty."
    );
    answerInterviewQuestion(
      storage,
      workspaceId,
      "ordinary-dividends",
      "All dividend statements are included for the year."
    );
    answerInterviewQuestion(
      storage,
      workspaceId,
      "qualified-dividends",
      "Qualified dividends are correct and no foreign tax was paid."
    );
    let workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "capital-gain-distributions",
      "Capital gain distributions are final and no basis review is needed."
    );
    workspace = await refreshWorkspaceEnginePreview(workspace);

    expect(workspace.summary).toEqual({
      totalDocuments: 2,
      officialFixtureMatches: 2,
      supportedDocuments: 2,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 0
    });
    expect(workspace.returnSummary).toEqual({
      status: "ready-to-recompute",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 4,
      totalFactCount: 4,
      readyItemCount: 2,
      itemCount: 2,
      blockers: [],
      items: [
        {
          id: "interest-income",
          label: "Interest income",
          status: "ready",
          engineTargets: ["Schedule B Part I", "Form 1040 Line 2b"],
          relatedFactIds: ["taxable-interest"],
          sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"],
          answeredFactCount: 1,
          factCount: 1
        },
        {
          id: "dividend-income",
          label: "Dividend income",
          status: "ready",
          engineTargets: ["Schedule B Part II", "Form 1040 Lines 3a and 3b"],
          relatedFactIds: ["ordinary-dividends", "qualified-dividends", "capital-gain-distributions"],
          sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"],
          answeredFactCount: 3,
          factCount: 3
        }
      ]
    });
    expect(workspace.enginePreview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      filingState: "TX",
      sourceDocumentIds: [
        "irs-1099-int-2024:f1099int.pdf:11",
        "irs-1099-div-2024:f1099div.pdf:11"
      ],
      sourceFixtureIds: ["irs-1099-int-2024", "irs-1099-div-2024"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived facts captured in the workspace ledger.",
        "The confirmed 2025 Form 1099-INT upload contributes $20,000 of taxable interest with no withholding and no early-withdrawal penalty.",
        "The confirmed 2025 Form 1099-DIV upload contributes $4,000 of ordinary dividends, including $3,000 of qualified dividends, plus $1,000 of capital gain distributions."
      ],
      metrics: {
        totalIncome: "25000",
        agi: "25000",
        taxableIncome: "9250",
        totalTax: "525",
        totalPayments: "0",
        refund: "0",
        amountOwed: "525"
      },
      highlightedLines: expect.arrayContaining([
        {
          id: "1040:2b",
          form: "1040",
          line: "2b",
          label: "Taxable interest",
          value: "20000",
          formula: "Schedule B Line 4",
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer"
          ]
        },
        {
          id: "1040:3a",
          form: "1040",
          line: "3a",
          label: "Qualified dividends",
          value: "3000",
          formula: "Sum 1099-DIV Box 1b + K-1 Box 6b + K-1 1041 Box 2b + Form 8814 Line 9",
          sourceFactIds: [
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:3b",
          form: "1040",
          line: "3b",
          label: "Ordinary dividends",
          value: "4000",
          formula: "Schedule B Part II total",
          sourceFactIds: [
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "Sched D:15",
          form: "Sched D",
          line: "15",
          label: "Net long-term capital gain/loss",
          value: "1000",
          formula: "Form 8949 Part II + K-1 Box 9a + K-1 1041 Box 4a + K-1 1041 Box 11D + Form 4797 Line 9 + 1099-DIV Box 2a + prior LT carryforward - §1202 exclusion + home sale gain + Form 6781 long-term + Form 6252 long-term",
          sourceFactIds: [
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:7",
          form: "1040",
          line: "7",
          label: "Capital gain or loss",
          value: "1000",
          formula: "Schedule D Line 21",
          sourceFactIds: [
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:11",
          form: "1040",
          line: "11",
          label: "Adjusted gross income",
          value: "25000",
          formula: "Line 9 - Line 10",
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer",
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:15",
          form: "1040",
          line: "15",
          label: "Taxable income",
          value: "9250",
          formula: "AGI - total deductions",
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer",
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:24",
          form: "1040",
          line: "24",
          label: "Total tax",
          value: "525",
          formula: expect.stringContaining("Line 22"),
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer",
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:33",
          form: "1040",
          line: "33",
          label: "Total payments",
          value: "0",
          formula: "Withholding + estimated + EIC + ACTC + refundable credits",
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer",
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:34",
          form: "1040",
          line: "34",
          label: "Overpayment (refund)",
          value: "0",
          formula: "Total payments - Total tax (if positive)",
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer",
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        },
        {
          id: "1040:37",
          form: "1040",
          line: "37",
          label: "Amount you owe",
          value: "525",
          formula: "Total tax - Total payments (if positive)",
          sourceFactIds: [
            "taxable-interest:document-detected",
            "taxable-interest:fixture-interest-income",
            "taxable-interest:interview-answer",
            "ordinary-dividends:document-detected",
            "ordinary-dividends:fixture-dividend-income",
            "ordinary-dividends:interview-answer",
            "qualified-dividends:document-detected",
            "qualified-dividends:fixture-qualified-dividends",
            "qualified-dividends:interview-answer",
            "capital-gain-distributions:document-detected",
            "capital-gain-distributions:fixture-capital-gain-distributions",
            "capital-gain-distributions:interview-answer"
          ]
        }
      ])
    });
    expect(workspace.checklist.find((item) => item.id === "coverage")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "interview")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "review")?.status).toBe("ready");
  });

  it("keeps deterministic capital-gains recomputes working when multiple supported 1099-B uploads feed one workspace item", async () => {
    const storage = createMemoryStorage();
    const workspaceId = "return-summary-ready-multi-doc";

    ingestFiles(storage, workspaceId, [
      { name: "f1099b--2025.pdf", size: 12 },
      { name: "f1099b--2025.pdf", size: 18 }
    ]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "broker-proceeds",
      "All broker proceeds belong on Form 8949."
    );
    let workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "cost-basis-review",
      "Basis reporting and holding periods are confirmed."
    );
    workspace = await refreshWorkspaceEnginePreview(workspace);

    expect(workspace.returnSummary.status).toBe("ready-to-recompute");
    expect(workspace.returnSummary.items).toEqual([
      {
        id: "capital-gains",
        label: "Capital gains and basis review",
        status: "ready",
        engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
        relatedFactIds: ["broker-proceeds", "cost-basis-review"],
        sourceDocumentIds: [
          "irs-1099-b-2025:f1099b--2025.pdf:12",
          "irs-1099-b-2025:f1099b--2025.pdf:18"
        ],
        answeredFactCount: 2,
        factCount: 2
      }
    ]);
    expect(workspace.enginePreview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      filingState: "TX",
      sourceDocumentIds: [
        "irs-1099-b-2025:f1099b--2025.pdf:12",
        "irs-1099-b-2025:f1099b--2025.pdf:18"
      ],
      sourceFixtureIds: ["irs-1099-b-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived transaction facts captured in the workspace ledger.",
        "The confirmed 2025 Form 1099-B uploads contribute 4 capital-gains transaction fact(s) with no withholding or carryforwards.",
        "This preview only runs after the related capital-gains facts are fully confirmed in the interview loop."
      ],
      metrics: {
        totalIncome: "110000",
        agi: "110000",
        taxableIncome: "94250",
        totalTax: "12458",
        totalPayments: "0",
        refund: "0",
        amountOwed: "12458"
      },
      highlightedLines: expect.arrayContaining([
        {
          id: "Sched D:7",
          form: "Sched D",
          line: "7",
          label: "Net short-term capital gain/loss",
          value: "60000",
          formula: "Form 8949 Part I + K-1 Box 8 + K-1 1041 Box 3 + K-1 1041 Box 11C + prior ST carryforward + Form 6781 short-term + Form 6252 short-term",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "Sched D:15",
          form: "Sched D",
          line: "15",
          label: "Net long-term capital gain/loss",
          value: "50000",
          formula: "Form 8949 Part II + K-1 Box 9a + K-1 1041 Box 4a + K-1 1041 Box 11D + Form 4797 Line 9 + 1099-DIV Box 2a + prior LT carryforward - §1202 exclusion + home sale gain + Form 6781 long-term + Form 6252 long-term",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:24",
          form: "1040",
          line: "24",
          label: "Total tax",
          value: "12458",
          formula: expect.stringContaining("Line 22"),
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        },
        {
          id: "1040:37",
          form: "1040",
          line: "37",
          label: "Amount you owe",
          value: "12458",
          formula: "Total tax - Total payments (if positive)",
          sourceFactIds: [
            "broker-proceeds:document-detected",
            "broker-proceeds:fixture-long-term-sale",
            "broker-proceeds:fixture-short-term-sale",
            "broker-proceeds:interview-answer",
            "cost-basis-review:document-detected",
            "cost-basis-review:interview-answer"
          ]
        }
      ])
    });
  });

  it("keeps fully confirmed future-year facts in review until the engine supports that tax year", () => {
    const storage = createMemoryStorage();
    const workspaceId = "future-year-review";

    ingestFiles(storage, workspaceId, [{ name: "fw2.pdf", size: 10 }]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "wages",
      "Employer confirmed the final W-2 is complete."
    );
    const workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "withholding",
      "Federal withholding matches the taxpayer copy."
    );

    expect(workspace.returnSummary).toEqual({
      status: "needs-review",
      targetTaxYear: 2026,
      taxYearState: "single",
      answeredFactCount: 2,
      totalFactCount: 2,
      readyItemCount: 1,
      itemCount: 1,
      blockers: [
        {
          id: "unsupported-tax-year",
          message: "Tax year 2026 is not available for deterministic recompute yet. Latest supported engine year: 2025.",
          relatedFactIds: [],
          sourceDocumentIds: []
        }
      ],
      items: [
        {
          id: "wages-and-withholding",
          label: "Wages and withholding",
          status: "ready",
          engineTargets: ["Form 1040 Lines 1 and 25a"],
          relatedFactIds: ["wages", "withholding"],
          sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
          answeredFactCount: 2,
          factCount: 2
        }
      ]
    });
  });

  it("promotes a supported 2025 W-2 upload into deterministic recompute after interview confirmation", async () => {
    const storage = createMemoryStorage();
    const workspaceId = "supported-w2-ready";

    ingestFiles(storage, workspaceId, [{ name: "fw2--2025.pdf", size: 10 }]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "wages",
      "Employer confirmed the final W-2 is complete."
    );
    let workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "withholding",
      "Federal withholding matches the taxpayer copy."
    );
    workspace = await refreshWorkspaceEnginePreview(workspace);

    expect(workspace.returnSummary).toEqual({
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
          sourceDocumentIds: ["irs-w2-2025:fw2--2025.pdf:10"],
          answeredFactCount: 2,
          factCount: 2
        }
      ]
    });
    expect(workspace.enginePreview).toMatchObject({
      mode: "engine-recompute",
      title: "Deterministic engine recompute preview",
      taxYear: 2025,
      filingStatus: "single",
      filingState: "TX",
      sourceDocumentIds: ["irs-w2-2025:fw2--2025.pdf:10"],
      sourceFixtureIds: ["irs-w2-2025"],
      assumptions: [
        "Uploaded PDFs are not parsed yet; this engine run uses fixture-derived facts captured in the workspace ledger.",
        "The confirmed 2025 Form W-2 upload contributes $52,000 of wages and $5,000 of federal withholding."
      ],
      metrics: {
        totalIncome: "52000",
        agi: "52000",
        taxableIncome: "36250",
        totalTax: "4112",
        totalPayments: "5000",
        refund: "888",
        amountOwed: "0"
      },
      highlightedLines: expect.arrayContaining([
        expect.objectContaining({
          id: "1040:1",
          value: "52000",
          sourceFactIds: [
            "wages:document-detected",
            "wages:fixture-wages",
            "wages:interview-answer",
            "withholding:document-detected",
            "withholding:fixture-withholding",
            "withholding:interview-answer"
          ]
        }),
        expect.objectContaining({
          id: "1040:33",
          value: "5000",
          sourceFactIds: [
            "wages:document-detected",
            "wages:fixture-wages",
            "wages:interview-answer",
            "withholding:document-detected",
            "withholding:fixture-withholding",
            "withholding:interview-answer"
          ]
        }),
        expect.objectContaining({
          id: "1040:34",
          value: "888",
          sourceFactIds: [
            "wages:document-detected",
            "wages:fixture-wages",
            "wages:interview-answer",
            "withholding:document-detected",
            "withholding:fixture-withholding",
            "withholding:interview-answer"
          ]
        })
      ])
    });
    expect(workspace.checklist.find((item) => item.id === "coverage")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "interview")?.status).toBe("ready");
    expect(workspace.checklist.find((item) => item.id === "review")?.status).toBe("ready");
  });

  it("keeps mixed supported and unsupported uploads out of deterministic recompute", () => {
    const storage = createMemoryStorage();
    const workspaceId = "mixed-coverage-review";

    ingestFiles(storage, workspaceId, [
      { name: "f1099b--2025.pdf", size: 12 },
      { name: "broker-export.pdf", size: 2048 }
    ]);
    answerInterviewQuestion(
      storage,
      workspaceId,
      "broker-proceeds",
      "All broker proceeds belong on Form 8949."
    );
    const workspace = answerInterviewQuestion(
      storage,
      workspaceId,
      "cost-basis-review",
      "Basis reporting and holding periods are confirmed."
    );

    expect(workspace.seededReturn.status).toBe("needs-review");
    expect(workspace.seededReturn.reviewNotes).toContain(
      "Unclassified upload still needs manual review before facts can be trusted."
    );
    expect(workspace.returnSummary).toEqual({
      status: "needs-review",
      targetTaxYear: 2025,
      taxYearState: "single",
      answeredFactCount: 2,
      totalFactCount: 2,
      readyItemCount: 1,
      itemCount: 1,
      blockers: [
        {
          id: "needs-review:unmapped-documents",
          message: "1 uploaded document still needs manual coverage review before deterministic recompute can run.",
          relatedFactIds: [],
          sourceDocumentIds: ["unknown:broker-export.pdf:2048"]
        }
      ],
      items: [
        {
          id: "capital-gains",
          label: "Capital gains and basis review",
          status: "ready",
          engineTargets: ["Form 8949", "Schedule D", "Form 1040 Line 7"],
          relatedFactIds: ["broker-proceeds", "cost-basis-review"],
          sourceDocumentIds: ["irs-1099-b-2025:f1099b--2025.pdf:12"],
          answeredFactCount: 2,
          factCount: 2
        }
      ]
    });
    expect(workspace.enginePreview).toBeNull();
    expect(workspace.checklist.find((item) => item.id === "coverage")?.status).toBe("blocked");
  });

  it("marks unknown uploads unsupported and clears the local workspace deterministically", () => {
    const storage = createMemoryStorage();
    const workspaceId = "unknown-upload";

    const workspace = ingestFiles(storage, workspaceId, [{ name: "broker-export.pdf", size: 2048 }]);

    expect(workspace.documents).toHaveLength(1);
    expect(workspace.documents[0]?.coverage).toBe("unsupported");
    expect(workspace.documents[0]?.matchedFixtureId).toBeNull();
    expect(workspace.documents[0]?.seededFactIds).toEqual([]);
    expect(workspace.summary.pendingReviewDocuments).toBe(1);
    expect(workspace.summary.interviewQuestionsRemaining).toBe(0);
    expect(workspace.seededReturn.status).toBe("needs-review");
    expect(workspace.seededReturn.reviewNotes).toEqual([
      "Unclassified upload still needs manual review before facts can be trusted.",
      "Unknown uploads stay metadata-only until a parser or manual mapping is added."
    ]);
    expect(workspace.checklist.find((item) => item.id === "coverage")?.status).toBe("blocked");
    expect(workspace.checklist.find((item) => item.id === "interview")?.status).toBe("blocked");

    const clearedWorkspace = clearWorkspace(storage, workspaceId);

    expect(clearedWorkspace.summary.totalDocuments).toBe(0);
    expect(clearedWorkspace.documents).toEqual([]);
    expect(clearedWorkspace.seededReturn).toEqual({
      status: "empty",
      taxYearHints: [],
      facts: [],
      interviewQuestions: [],
      interviewQueue: [],
      nextQuestionId: null,
      reviewNotes: []
    });
    expect(ensureWorkspace(storage, workspaceId)).toEqual(clearedWorkspace);
  });

  it("removes a single uploaded document and recomputes the seeded summary", () => {
    const storage = createMemoryStorage();

    const uploadedWorkspace = ingestFiles(storage, "remove-one", [
      { name: "fw2.pdf", size: 10 },
      { name: "f1099int.pdf", size: 11 }
    ]);

    const retainedDocumentId = uploadedWorkspace.documents[0]?.id;
    const removedDocumentId = uploadedWorkspace.documents[1]?.id;

    expect(retainedDocumentId).toBeTruthy();
    expect(removedDocumentId).toBeTruthy();

    const nextWorkspace = removeDocument(storage, "remove-one", removedDocumentId as string);

    expect(nextWorkspace.documents.map((document) => document.id)).toEqual([retainedDocumentId]);
    expect(nextWorkspace.summary).toEqual({
      totalDocuments: 1,
      officialFixtureMatches: 1,
      supportedDocuments: 1,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 2
    });
    expect(nextWorkspace.seededReturn).toEqual({
      status: "ready-for-interview",
      taxYearHints: [2026],
      facts: [
        {
          id: "wages",
          label: "Wages",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: [retainedDocumentId as string]
        },
        {
          id: "withholding",
          label: "Federal withholding",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: [retainedDocumentId as string]
        }
      ],
      interviewQuestions: [
        {
          id: "wages",
          factId: "wages",
          prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: [retainedDocumentId as string]
        },
        {
          id: "withholding",
          factId: "withholding",
          prompt: "Confirm federal and state withholding amounts from each wage statement.",
          status: "pending",
          answeredAt: null,
          answerText: null,
          sourceDocumentIds: [retainedDocumentId as string]
        }
      ],
      interviewQueue: [
        "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        "Confirm federal and state withholding amounts from each wage statement."
      ],
      nextQuestionId: "wages",
      reviewNotes: []
    });
    expect(nextWorkspace.checklist.find((item) => item.id === "coverage")?.status).toBe("ready");
    expect(nextWorkspace.checklist.find((item) => item.id === "interview")?.status).toBe("needs-input");
    expect(ensureWorkspace(storage, "remove-one")).toEqual(nextWorkspace);
  });

  it("assigns unique ids to duplicate uploads and removes only the selected copy", () => {
    const storage = createMemoryStorage();

    const uploadedWorkspace = ingestFiles(storage, "duplicate-uploads", [
      { name: "fw2.pdf", size: 10 },
      { name: "fw2.pdf", size: 10 }
    ]);

    expect(uploadedWorkspace.summary).toEqual({
      totalDocuments: 2,
      officialFixtureMatches: 2,
      supportedDocuments: 2,
      pendingReviewDocuments: 0,
      interviewQuestionsRemaining: 2
    });
    expect(uploadedWorkspace.documents).toHaveLength(2);
    expect(uploadedWorkspace.documents[0]?.id).toBe("irs-w2-2026:fw2.pdf:10");
    expect(uploadedWorkspace.documents[1]?.id).toBe("irs-w2-2026:fw2.pdf:10#2");
    expect(uploadedWorkspace.documents.map((document) => document.id)).toEqual([
      "irs-w2-2026:fw2.pdf:10",
      "irs-w2-2026:fw2.pdf:10#2"
    ]);
    expect(uploadedWorkspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10", "irs-w2-2026:fw2.pdf:10#2"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10", "irs-w2-2026:fw2.pdf:10#2"]
      }
    ]);

    const nextWorkspace = removeDocument(storage, "duplicate-uploads", "irs-w2-2026:fw2.pdf:10");

    expect(nextWorkspace.documents.map((document) => document.id)).toEqual(["irs-w2-2026:fw2.pdf:10#2"]);
    expect(nextWorkspace.summary.totalDocuments).toBe(1);
    expect(nextWorkspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10#2"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10#2"]
      }
    ]);
    expect(ensureWorkspace(storage, "duplicate-uploads")).toEqual(nextWorkspace);
  });

  it("rehydrates legacy duplicate document ids into stable unique ids", () => {
    const storage = createMemoryStorage();

    storage.setItem("tax-engine.return-workspaces.v1", JSON.stringify({
      workspaces: {
        legacy: {
          id: "legacy",
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
          storageMode: "local-browser",
          documents: [
            {
              id: "irs-w2-2026:fw2.pdf:10",
              name: "fw2.pdf",
              size: 10,
              uploadedAt: "2026-03-11T00:00:00.000Z",
              kind: "w2",
              coverage: "supported",
              label: "2026 Form W-2 (official info-copy PDF)",
              notes: "Legacy document",
              matchedFixtureId: "irs-w2-2026",
              seededFactIds: ["wages", "withholding"]
            },
            {
              id: "irs-w2-2026:fw2.pdf:10",
              name: "fw2.pdf",
              size: 10,
              uploadedAt: "2026-03-11T00:01:00.000Z",
              kind: "w2",
              coverage: "supported",
              label: "2026 Form W-2 (official info-copy PDF)",
              notes: "Legacy duplicate document",
              matchedFixtureId: "irs-w2-2026",
              seededFactIds: ["wages", "withholding"]
            }
          ],
          summary: {
            totalDocuments: 2,
            officialFixtureMatches: 2,
            supportedDocuments: 2,
            pendingReviewDocuments: 0,
            interviewQuestionsRemaining: 2
          },
          seededReturn: {
            status: "ready-for-interview",
            taxYearHints: [2026],
            facts: [],
            interviewQuestions: [],
            interviewQueue: [],
            nextQuestionId: null,
            reviewNotes: []
          },
          checklist: []
        }
      }
    }));

    const workspace = ensureWorkspace(storage, "legacy");

    expect(workspace.documents.map((document) => document.id)).toEqual([
      "irs-w2-2026:fw2.pdf:10",
      "irs-w2-2026:fw2.pdf:10#2"
    ]);
    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10", "irs-w2-2026:fw2.pdf:10#2"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10", "irs-w2-2026:fw2.pdf:10#2"]
      }
    ]);
  });

  it("rehydrates legacy answered facts when interview question records are missing", () => {
    const storage = createMemoryStorage();

    storage.setItem("tax-engine.return-workspaces.v1", JSON.stringify({
      workspaces: {
        "legacy-answers": {
          id: "legacy-answers",
          createdAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:00.000Z",
          storageMode: "local-browser",
          documents: [
            {
              id: "irs-w2-2026:fw2.pdf:10",
              name: "fw2.pdf",
              size: 10,
              uploadedAt: "2026-03-11T00:00:00.000Z",
              kind: "w2",
              coverage: "supported",
              label: "2026 Form W-2 (official info-copy PDF)",
              notes: "Legacy document",
              matchedFixtureId: "irs-w2-2026",
              seededFactIds: ["wages", "withholding"]
            }
          ],
          summary: {
            totalDocuments: 1,
            officialFixtureMatches: 1,
            supportedDocuments: 1,
            pendingReviewDocuments: 0,
            interviewQuestionsRemaining: 1
          },
          seededReturn: {
            status: "ready-for-interview",
            taxYearHints: [2026],
            facts: [
              {
                id: "wages",
                label: "Wages",
                status: "answered",
                answeredAt: "2026-03-11T00:05:00.000Z",
                answerText: "Legacy filer confirmed the final W-2 is complete.",
                sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
              },
              {
                id: "withholding",
                label: "Federal withholding",
                status: "pending",
                answeredAt: null,
                answerText: null,
                sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
              }
            ],
            interviewQuestions: [],
            interviewQueue: [],
            nextQuestionId: null,
            reviewNotes: []
          },
          checklist: []
        }
      }
    }));

    const workspace = ensureWorkspace(storage, "legacy-answers");

    expect(workspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "answered",
        answeredAt: "2026-03-11T00:05:00.000Z",
        answerText: "Legacy filer confirmed the final W-2 is complete.",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      }
    ]);
    expect(workspace.seededReturn.interviewQuestions).toEqual([
      {
        id: "wages",
        factId: "wages",
        prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        status: "answered",
        answeredAt: "2026-03-11T00:05:00.000Z",
        answerText: "Legacy filer confirmed the final W-2 is complete.",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      }
    ]);
    expect(workspace.structuredFacts).toContainEqual({
      id: "wages:interview-answer",
      factId: "wages",
      label: "Wages",
      kind: "interview-answer",
      value: "Legacy filer confirmed the final W-2 is complete.",
      sourceType: "user-answer",
      confidence: "high",
      sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
      questionId: "wages",
      updatedAt: "2026-03-11T00:05:00.000Z"
    });
    expect(workspace.summary.interviewQuestionsRemaining).toBe(1);
  });

  it("keeps an immutable local audit trail for uploads and interview confirmations", () => {
    const storage = createMemoryStorage();
    const workspaceId = "audit-trail";
    const wageAnswer = "Employer confirmed the final W-2 is correct and no corrected form is pending.";

    const createdWorkspace = ensureWorkspace(storage, workspaceId);

    expect(createdWorkspace.auditTrail).toEqual([
      {
        id: expect.stringMatching(/^workspace-created:/),
        occurredAt: expect.any(String),
        kind: "workspace-created",
        message: "Return created.",
        documentIds: [],
        questionId: null,
        answerText: null
      }
    ]);

    const uploadedWorkspace = ingestFiles(storage, workspaceId, [
      { name: "fw2.pdf", size: 10 },
      { name: "f1099int.pdf", size: 11 }
    ]);

    expect(uploadedWorkspace.auditTrail[1]).toEqual({
      id: expect.stringMatching(/^documents-ingested:/),
      occurredAt: expect.any(String),
      kind: "documents-ingested",
      message: "Stored 2 document(s) in local browser storage.",
      documentIds: [
        "irs-w2-2026:fw2.pdf:10",
        "irs-1099-int-2024:f1099int.pdf:11"
      ],
      questionId: null,
      answerText: null
    });

    const answeredWorkspace = answerInterviewQuestion(storage, workspaceId, "wages", wageAnswer);

    expect(answeredWorkspace.auditTrail[2]).toEqual({
      id: expect.stringMatching(/^interview-answered:/),
      occurredAt: expect.any(String),
      kind: "interview-answered",
      message: "Saved answer for Wages.",
      documentIds: ["irs-w2-2026:fw2.pdf:10"],
      questionId: "wages",
      answerText: wageAnswer
    });

    const reopenedWorkspace = reopenInterviewQuestion(storage, workspaceId, "wages");

    expect(reopenedWorkspace.auditTrail[3]).toEqual({
      id: expect.stringMatching(/^interview-reopened:/),
      occurredAt: expect.any(String),
      kind: "interview-reopened",
      message: "Reopened question for Wages.",
      documentIds: ["irs-w2-2026:fw2.pdf:10"],
      questionId: "wages",
      answerText: null
    });

    const clearedWorkspace = clearWorkspace(storage, workspaceId);

    expect(clearedWorkspace.documents).toEqual([]);
    expect(clearedWorkspace.auditTrail.map((event) => event.kind)).toEqual([
      "workspace-created",
      "documents-ingested",
      "interview-answered",
      "interview-reopened",
      "workspace-cleared"
    ]);
    expect(clearedWorkspace.auditTrail[2]?.answerText).toBe(wageAnswer);
    expect(clearedWorkspace.auditTrail[4]).toEqual({
      id: expect.stringMatching(/^workspace-cleared:/),
      occurredAt: expect.any(String),
      kind: "workspace-cleared",
      message: "Reset local return and removed 2 document(s).",
      documentIds: [
        "irs-w2-2026:fw2.pdf:10",
        "irs-1099-int-2024:f1099int.pdf:11"
      ],
      questionId: null,
      answerText: null
    });
  });

  it("persists answered interview questions across reloads and lets the loop be reopened", () => {
    const storage = createMemoryStorage();
    const wageAnswer = "Employer confirmed the final W-2 includes no corrected boxes or dependent care benefits.";

    ingestFiles(storage, "interview-loop", [
      { name: "fw2.pdf", size: 10 },
      { name: "f1099int.pdf", size: 11 }
    ]);

    const answeredWorkspace = answerInterviewQuestion(storage, "interview-loop", "wages", wageAnswer);

    expect(answeredWorkspace.summary.interviewQuestionsRemaining).toBe(2);
    expect(answeredWorkspace.structuredFacts).toEqual([
      {
        id: "wages:document-detected",
        factId: "wages",
        label: "Wages",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "wages:fixture-wages",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Official fixture wages: Form W-2 box 1 wages $52,000 and box 2 federal withholding $5,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String),
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Official fixture employer",
          employerEin: "12-3456789",
          wages: "52000",
          federalWithheld: "5000"
        }
      },
      {
        id: "wages:interview-answer",
        factId: "wages",
        label: "Wages",
        kind: "interview-answer",
        value: wageAnswer,
        sourceType: "user-answer",
        confidence: "high",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: "wages",
        updatedAt: expect.any(String)
      },
      {
        id: "withholding:document-detected",
        factId: "withholding",
        label: "Federal withholding",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "withholding:fixture-withholding",
        factId: "withholding",
        label: "Federal withholding",
        kind: "fixture-derived",
        value: "Official fixture withholding: Form W-2 box 2 federal income tax withheld $5,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "taxable-interest:document-detected",
        factId: "taxable-interest",
        label: "Taxable interest",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "taxable-interest:fixture-interest-income",
        factId: "taxable-interest",
        label: "Taxable interest",
        kind: "fixture-derived",
        value: "Official fixture taxable interest: box 1 interest income $20,000 with no withholding or penalty.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"],
        questionId: null,
        updatedAt: expect.any(String),
        machineValue: {
          entryKind: "1099-int-summary",
          payer: "Official fixture savings bank",
          interestIncome: "20000",
          earlyWithdrawalPenalty: "0",
          federalWithheld: "0",
          taxExemptInterest: "0",
          usSavingsBondInterest: "0"
        }
      }
    ]);
    expect(answeredWorkspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "answered",
        answeredAt: expect.any(String),
        answerText: wageAnswer,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "taxable-interest",
        label: "Taxable interest",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"]
      }
    ]);
    expect(answeredWorkspace.seededReturn.interviewQuestions).toEqual([
      {
        id: "wages",
        factId: "wages",
        prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        status: "answered",
        answeredAt: expect.any(String),
        answerText: wageAnswer,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "taxable-interest",
        factId: "taxable-interest",
        prompt: "Confirm whether any tax-exempt interest or early withdrawal penalties also apply.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"]
      }
    ]);
    expect(answeredWorkspace.seededReturn.interviewQueue).toEqual([
      "Confirm federal and state withholding amounts from each wage statement.",
      "Confirm whether any tax-exempt interest or early withdrawal penalties also apply."
    ]);
    expect(ensureWorkspace(storage, "interview-loop")).toEqual(answeredWorkspace);

    const reopenedWorkspace = reopenInterviewQuestion(storage, "interview-loop", "wages");

    expect(reopenedWorkspace.summary.interviewQuestionsRemaining).toBe(3);
    expect(reopenedWorkspace.structuredFacts).toEqual([
      {
        id: "wages:document-detected",
        factId: "wages",
        label: "Wages",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "wages:fixture-wages",
        factId: "wages",
        label: "Wages",
        kind: "fixture-derived",
        value: "Official fixture wages: Form W-2 box 1 wages $52,000 and box 2 federal withholding $5,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String),
        machineValue: {
          entryKind: "w2-summary",
          employerName: "Official fixture employer",
          employerEin: "12-3456789",
          wages: "52000",
          federalWithheld: "5000"
        }
      },
      {
        id: "withholding:document-detected",
        factId: "withholding",
        label: "Federal withholding",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "withholding:fixture-withholding",
        factId: "withholding",
        label: "Federal withholding",
        kind: "fixture-derived",
        value: "Official fixture withholding: Form W-2 box 2 federal income tax withheld $5,000.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "taxable-interest:document-detected",
        factId: "taxable-interest",
        label: "Taxable interest",
        kind: "document-detected",
        value: "Detected from 1 uploaded document(s).",
        sourceType: "upload",
        confidence: "low",
        sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"],
        questionId: null,
        updatedAt: expect.any(String)
      },
      {
        id: "taxable-interest:fixture-interest-income",
        factId: "taxable-interest",
        label: "Taxable interest",
        kind: "fixture-derived",
        value: "Official fixture taxable interest: box 1 interest income $20,000 with no withholding or penalty.",
        sourceType: "official-fixture",
        confidence: "high",
        sourceDocumentIds: ["irs-1099-int-2024:f1099int.pdf:11"],
        questionId: null,
        updatedAt: expect.any(String),
        machineValue: {
          entryKind: "1099-int-summary",
          payer: "Official fixture savings bank",
          interestIncome: "20000",
          earlyWithdrawalPenalty: "0",
          federalWithheld: "0",
          taxExemptInterest: "0",
          usSavingsBondInterest: "0"
        }
      }
    ]);
    expect(reopenedWorkspace.seededReturn.interviewQuestions[0]).toEqual({
      id: "wages",
      factId: "wages",
      prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
      status: "pending",
      answeredAt: null,
      answerText: null,
      sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
    });
    expect(reopenedWorkspace.seededReturn.interviewQueue).toEqual([
      "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
      "Confirm federal and state withholding amounts from each wage statement.",
      "Confirm whether any tax-exempt interest or early withdrawal penalties also apply."
    ]);
  });

  it("preserves answered interview state when later uploads add new prompts", () => {
    const storage = createMemoryStorage();
    const withholdingAnswer = "Federal withholding matches the taxpayer copy and there is no state withholding to add.";

    ingestFiles(storage, "preserve-answers", [{ name: "fw2.pdf", size: 10 }]);
    answerInterviewQuestion(storage, "preserve-answers", "withholding", withholdingAnswer);

    const nextWorkspace = ingestFiles(storage, "preserve-answers", [{ name: "f1099div.pdf", size: 11 }]);

    expect(nextWorkspace.summary.interviewQuestionsRemaining).toBe(4);
    expect(nextWorkspace.seededReturn.facts).toEqual([
      {
        id: "wages",
        label: "Wages",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        label: "Federal withholding",
        status: "answered",
        answeredAt: expect.any(String),
        answerText: withholdingAnswer,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "ordinary-dividends",
        label: "Ordinary dividends",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      },
      {
        id: "qualified-dividends",
        label: "Qualified dividends",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      },
      {
        id: "capital-gain-distributions",
        label: "Capital gain distributions",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      }
    ]);
    expect(nextWorkspace.seededReturn.interviewQuestions).toEqual([
      {
        id: "wages",
        factId: "wages",
        prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "withholding",
        factId: "withholding",
        prompt: "Confirm federal and state withholding amounts from each wage statement.",
        status: "answered",
        answeredAt: expect.any(String),
        answerText: withholdingAnswer,
        sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
      },
      {
        id: "ordinary-dividends",
        factId: "ordinary-dividends",
        prompt: "Confirm whether all dividend statements are included for the year.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      },
      {
        id: "qualified-dividends",
        factId: "qualified-dividends",
        prompt: "Confirm qualified dividend amounts and whether any foreign tax was paid.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      },
      {
        id: "capital-gain-distributions",
        factId: "capital-gain-distributions",
        prompt: "Confirm whether capital gain distributions or reinvested dividends need basis review.",
        status: "pending",
        answeredAt: null,
        answerText: null,
        sourceDocumentIds: ["irs-1099-div-2024:f1099div.pdf:11"]
      }
    ]);
    expect(nextWorkspace.checklist.find((item) => item.id === "interview")?.status).toBe("needs-input");
    expect(ensureWorkspace(storage, "preserve-answers")).toEqual(nextWorkspace);
  });

  it("requires trimmed answer notes to persist and keeps them on unrelated updates", () => {
    const storage = createMemoryStorage();

    ingestFiles(storage, "answer-notes", [{ name: "fw2.pdf", size: 10 }]);

    const unchangedWorkspace = answerInterviewQuestion(storage, "answer-notes", "wages", "   ");

    expect(unchangedWorkspace.summary.interviewQuestionsRemaining).toBe(2);
    expect(unchangedWorkspace.seededReturn.interviewQuestions[0]).toEqual({
      id: "wages",
      factId: "wages",
      prompt: "Confirm whether every W-2 is final and whether any boxes require follow-up questions.",
      status: "pending",
      answeredAt: null,
      answerText: null,
      sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
    });

    const answeredWorkspace = answerInterviewQuestion(
      storage,
      "answer-notes",
      "wages",
      "Verified the employer issued the final W-2 and no corrected copy is expected."
    );

    expect(answeredWorkspace.summary.interviewQuestionsRemaining).toBe(1);
    expect(answeredWorkspace.seededReturn.facts[0]).toEqual({
      id: "wages",
      label: "Wages",
      status: "answered",
      answeredAt: expect.any(String),
      answerText: "Verified the employer issued the final W-2 and no corrected copy is expected.",
      sourceDocumentIds: ["irs-w2-2026:fw2.pdf:10"]
    });
    expect(answeredWorkspace.seededReturn.interviewQuestions[0]?.answerText).toBe(
      "Verified the employer issued the final W-2 and no corrected copy is expected."
    );

    const refreshedWorkspace = ingestFiles(storage, "answer-notes", [{ name: "f1099int.pdf", size: 11 }]);

    expect(refreshedWorkspace.seededReturn.facts[0]?.status).toBe("answered");
    expect(refreshedWorkspace.seededReturn.facts[0]?.answerText).toBe(
      "Verified the employer issued the final W-2 and no corrected copy is expected."
    );
    expect(refreshedWorkspace.seededReturn.interviewQuestions[0]?.status).toBe("answered");
    expect(refreshedWorkspace.seededReturn.interviewQuestions[0]?.answerText).toBe(
      "Verified the employer issued the final W-2 and no corrected copy is expected."
    );
    expect(refreshedWorkspace.summary.interviewQuestionsRemaining).toBe(2);
  });

  it("lists and deletes saved local workspaces without disturbing other drafts", () => {
    const storage = createMemoryStorage();

    ingestFiles(storage, "resume-me", [{ name: "fw2.pdf", size: 10 }]);
    ensureWorkspace(storage, "empty-draft");

    const listedWorkspaces = listWorkspaces(storage);

    expect(listedWorkspaces).toHaveLength(2);
    expect(listedWorkspaces.map((workspace) => workspace.id).sort()).toEqual([
      "empty-draft",
      "resume-me"
    ]);

    const remainingWorkspaces = deleteWorkspace(storage, "empty-draft");

    expect(remainingWorkspaces.map((workspace) => workspace.id)).toEqual(["resume-me"]);
    expect(ensureWorkspace(storage, "resume-me").summary.totalDocuments).toBe(1);
    expect(deleteWorkspace(storage, "missing-id").map((workspace) => workspace.id)).toEqual(["resume-me"]);
  });
});
