import { expect, it } from "vitest";
import { parseUploadedDocumentText } from "@/lib/uploaded-document-detection";
import { WORKSPACE_STORAGE_KEY, answerInterviewQuestion, getWorkspace, ingestFiles } from "@/lib/workspace-storage";
import { fictionalBrokerageSources, fictionalInterestSource } from "../../helpers/workspace-investment-sources";

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

const cases = [
  {
    name: "f1099int.pdf",
    fixtureId: "irs-1099-int-2024",
    actualText: "Tax Year 2026\nForm 1099-INT\nPayer: Fictional bank\n1 Interest Income $ 1200.15\n4 Federal Income Tax Withheld $ 0.00",
    amounts: { interestIncome: "1200.15", federalWithheld: "0.00" },
    legacy: fictionalInterestSource()
  },
  {
    name: "f1099b--2025.pdf",
    fixtureId: "irs-1099-b-2025",
    actualText: "Tax Year 2026\n1099 composite\nBroker: Fictional brokerage\nForm 1099-B\nTotal Short-Term (Cost basis is reported to the IRS) $ 1800.01 $ 1200.25",
    amounts: { proceeds: "1800.01", costBasis: "1200.25" },
    legacy: fictionalBrokerageSources()[0]
  }
];

// Spec: spec/federal/workspace-investment-upload.yaml#manual-investment-sample.
it("retains investment sample prompts and discards synthetic money on upload and reopen", () => {
  for (const source of cases) {
    const storage = createStorage();
    const id = source.fixtureId;
    if (!source.legacy) throw new Error("Missing legacy investment amount fixture");
    const uploaded = ingestFiles(storage, id, [{ name: source.name, size: 12 }]);
    expect(uploaded.documents[0]?.matchedFixtureId).toBe(id);
    expect(uploaded.seededReturn.interviewQuestions.map(question => question.id)).toContain(source.legacy.factId);
    expect(uploaded.structuredFacts.some(fact => fact.machineValue !== undefined)).toBe(false);
    for (const question of uploaded.seededReturn.interviewQuestions) {
      answerInterviewQuestion(storage, id, question.id, "Manual review still needs original source amounts.");
    }
    const answered = getWorkspace(storage, id);
    if (!answered) throw new Error("Missing saved workspace");
    expect(answered.enginePreview).toBeNull();
    expect(answered.structuredFacts.some(fact => fact.machineValue !== undefined)).toBe(false);

    const legacyFact = {
      ...answered.structuredFacts[0],
      id: "persisted-filename-derived-amount",
      kind: "fixture-derived",
      sourceType: "official-fixture",
      machineValue: source.legacy.machineValue
    };
    const legacyStorage = createStorage();
    legacyStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
      workspaces: { [id]: { ...answered, structuredFacts: [...answered.structuredFacts, legacyFact] } }
    }));
    const reopened = getWorkspace(legacyStorage, id);
    expect(reopened?.structuredFacts.some(fact => fact.machineValue !== undefined)).toBe(false);
    expect(reopened?.seededReturn.interviewQuestions.every(question => question.status === "answered")).toBe(true);
    expect(reopened?.enginePreview).toBeNull();
  }
});

// Spec: spec/federal/workspace-investment-upload.yaml#actual-investment-source.
it("preserves detected investment facts under registered sample filenames", () => {
  for (const source of cases) {
    const detected = parseUploadedDocumentText(source.actualText, source.name);
    expect(detected?.detectedFacts[0]?.machineValue).toMatchObject(source.amounts);
    const storage = createStorage();
    const uploaded = ingestFiles(storage, source.fixtureId, [{ name: source.name, size: 12, detectedDocument: detected }]);
    expect(uploaded.documents[0]).toMatchObject({
      taxYear: 2026,
      matchedFixtureId: null,
      detectedFacts: detected?.detectedFacts
    });
    const reopened = getWorkspace(storage, source.fixtureId);
    expect(reopened?.structuredFacts.filter(fact => fact.machineValue).map(fact => fact.machineValue))
      .toEqual(detected?.detectedFacts.filter(fact => fact.machineValue).map(fact => fact.machineValue));
    expect(reopened?.enginePreview).toBeNull();
  }
});
