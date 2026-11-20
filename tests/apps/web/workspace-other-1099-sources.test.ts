import type { SeededFactId, WorkspaceDocumentDetectedFactRecord } from "@tax-engine/contracts";
import { expect, it } from "vitest";
import { parseUploadedDocumentText } from "@/lib/uploaded-document-detection";
import { WORKSPACE_STORAGE_KEY, answerInterviewQuestion, getWorkspace, ingestFiles, refreshWorkspaceEnginePreview, removeDocument } from "@/lib/workspace-storage";
import { workspaceScenarioContext } from "../../helpers/workspace-calculation-context";
import { workspaceTaxpayerFixture } from "../../helpers/workspace-taxpayer";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    get length() { return values.size; }
  };
}

const aliases = [
  { kind: "1099-div", name: "f1099div.pdf", fixture: "irs-1099-div-2024", prompt: "ordinary-dividends" },
  { kind: "1099-g", name: "f1099g.pdf", fixture: "irs-1099-g-2025", prompt: "government-payments-review" },
  { kind: "1099-oid", name: "f1099oid.pdf", fixture: "irs-1099-oid-2025", prompt: "taxable-interest" },
  { kind: "1099-sa", name: "f1099sa.pdf", fixture: "irs-1099-sa-2025", prompt: "hsa-distribution-review" }
] as const satisfies ReadonlyArray<{ kind: string; name: string; fixture: string; prompt: SeededFactId }>;

const payer = "Fictional source issuer";
const typedAmounts = {
  "1099-g": { entryKind: "1099-g-summary", payer, unemploymentCompensation: "750.23", stateLocalIncomeTaxRefund: "0.00", federalWithheld: "60.25" },
  "1099-oid": { entryKind: "1099-oid-summary", payer, originalIssueDiscount: "771.47", otherPeriodicInterest: "0.00", earlyWithdrawalPenalty: "0.00", federalWithheld: "56.50", acquisitionPremium: "0.00", treasuryOID: "0.00", bondPremium: "0.00", taxExemptBondPremium: "0.00", taxExemptOID: "0.00" },
  "1099-sa": { entryKind: "1099-sa-summary", payer, grossDistribution: "930.17", distributionCode: "1", accountType: "hsa" }
} as const satisfies Record<string, NonNullable<WorkspaceDocumentDetectedFactRecord["machineValue"]>>;

// Spec: spec/federal/workspace-other-1099-upload.yaml#manual-sample-review.
it("keeps all four sample aliases as manual review on upload and reopen", () => {
  for (const source of aliases) {
    const storage = createStorage();
    const uploaded = ingestFiles(storage, source.fixture, [{ name: source.name, size: 12 }]);
    const document = uploaded.documents[0];
    expect(document, source.name).toMatchObject({ kind: source.kind, matchedFixtureId: source.fixture });
    expect(uploaded.seededReturn.interviewQuestions, source.name)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: source.prompt, status: "pending" })]));
    expect(uploaded.structuredFacts.some(fact => fact.machineValue), source.name).toBe(false);
    for (const question of uploaded.seededReturn.interviewQuestions) {
      answerInterviewQuestion(storage, source.fixture, question.id, "Will review the original statement manually.");
    }
    const answered = getWorkspace(storage, source.fixture);
    if (!answered) throw new Error("Missing saved workspace");
    expect(answered.enginePreview, source.name).toBeNull();
    expect(answered.structuredFacts.some(fact => fact.machineValue), source.name).toBe(false);

    const oldMoney = {
      ...answered.structuredFacts[0], id: "legacy-sample-money", kind: "fixture-derived", sourceType: "official-fixture",
      machineValue: source.kind === "1099-div"
        ? { entryKind: "1099-div-summary", payer: "Old sample issuer", ordinaryDividends: "4000" }
        : typedAmounts[source.kind]
    };
    const reopenedStorage = createStorage();
    const legacyOid = source.kind === "1099-oid";
    reopenedStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
      workspaces: { [source.fixture]: {
        ...answered,
        ...(legacyOid ? {
          documents: answered.documents.map(entry => ({ ...entry, seededFactIds: [] })),
          seededReturn: { ...answered.seededReturn, facts: [], interviewQuestions: [] }
        } : {}),
        structuredFacts: [...answered.structuredFacts, oldMoney]
      } }
    }));
    const reopened = getWorkspace(reopenedStorage, source.fixture);
    expect(reopened?.structuredFacts.some(fact => fact.machineValue), source.name).toBe(false);
    expect(reopened?.seededReturn.interviewQuestions.find(question => question.id === source.prompt)?.status, source.name)
      .toBe(legacyOid ? "pending" : "answered");
    expect(reopened?.enginePreview, source.name).toBeNull();
  }
});

// Spec: spec/federal/workspace-other-1099-upload.yaml#oid-with-interest.
it("keeps one original interest record beside a blank OID alias", async () => {
  const storage = createStorage();
  const interest = parseUploadedDocumentText(
    [
      "Tax Year 2025",
      "Form 1099-INT",
      "Payer: Fictional bank",
      "1 Interest Income $ 23.45",
      "2 Early Withdrawal Penalty $ 0.00",
      "3 Interest on U.S. Savings Bonds and Treasury Obligations $ 0.00",
      "4 Federal Income Tax Withheld $ 0.00",
      "8 Tax-Exempt Interest $ 0.00"
    ].join("\n"),
    "bank-statement.pdf"
  );
  expect(interest?.detectedFacts[0]?.machineValue).toMatchObject({ interestIncome: "23.45" });
  ingestFiles(storage, "mixed-interest", [
    { name: "bank-statement.pdf", size: 12, detectedDocument: interest },
    { name: "f1099oid.pdf", size: 18 }
  ]);
  const reopened = getWorkspace(storage, "mixed-interest");
  expect(reopened?.structuredFacts.filter(fact => fact.machineValue)).toEqual([
    expect.objectContaining({
      kind: "document-detected",
      sourceDocumentIds: ["1099-int:bank-statement.pdf:12"],
      machineValue: expect.objectContaining({ entryKind: "1099-int-summary", interestIncome: "23.45" })
    })
  ]);
  expect(reopened?.seededReturn.interviewQuestions.map(question => question.id)).toEqual(["taxable-interest"]);
  expect(reopened?.enginePreview).toBeNull();

  const settled = answerInterviewQuestion(storage, "mixed-interest", "taxable-interest", "Review confirmed.");
  const taxpayer = workspaceTaxpayerFixture();
  const withBlank = await refreshWorkspaceEnginePreview(settled, taxpayer, workspaceScenarioContext(settled.structuredFacts, taxpayer));
  expect(withBlank.enginePreview).toBeNull();

  const blank = settled.documents.find(document => document.kind === "1099-oid");
  if (!blank) throw new Error("Missing manual OID sample");
  removeDocument(storage, "mixed-interest", blank.id);
  const onlyInterest = answerInterviewQuestion(storage, "mixed-interest", "taxable-interest", "Original interest confirmed.");
  const withoutBlank = await refreshWorkspaceEnginePreview(onlyInterest, taxpayer, workspaceScenarioContext(onlyInterest.structuredFacts, taxpayer));
  expect(withoutBlank.enginePreview?.metrics.totalIncome).toBe("23.45");
});

// Spec: spec/federal/workspace-other-1099-upload.yaml#typed-original.
it("preserves exact detected years and amounts under all four aliases", () => {
  for (const source of aliases) {
    const detected = source.kind === "1099-div"
      ? parseUploadedDocumentText(
        "Tax Year 2026\n1099 composite\nBroker: Fictional brokerage\nForm 1099-DIV\n1a Total Ordinary Dividends $ 170.45\n1b Qualified Dividends $ 130.10",
        source.name
      )
      : {
        kind: source.kind, coverage: "partially-supported" as const, taxYear: 2026, label: "Fictional original statement",
        notes: "Typed source values supplied independently of filename.", seededFactIds: [source.prompt],
        detectedFacts: [{ idSuffix: "typed-original", factId: source.prompt, label: "Original source values",
          value: "Fictional tax statement", confidence: "high" as const, machineValue: typedAmounts[source.kind] }]
      };
    if (!detected) throw new Error("Missing detected original");
    const expected = detected.detectedFacts.flatMap(fact => fact.machineValue ? [fact.machineValue] : []);
    expect(expected, source.name).toHaveLength(1);
    if (source.kind === "1099-div") expect(expected[0]).toMatchObject({ ordinaryDividends: "170.45", qualifiedDividends: "130.10" });
    const storage = createStorage();
    ingestFiles(storage, source.fixture, [{ name: source.name, size: 12, detectedDocument: detected }]);
    const reopened = getWorkspace(storage, source.fixture);
    expect(reopened?.documents[0], source.name).toMatchObject({
      kind: detected.kind, coverage: detected.coverage, taxYear: 2026, matchedFixtureId: null, detectedFacts: detected.detectedFacts
    });
    expect(reopened?.structuredFacts.flatMap(fact => fact.machineValue ? [fact.machineValue] : []), source.name).toEqual(expected);
    expect(reopened?.enginePreview, source.name).toBeNull();
  }
});
