import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts, type PDFPage } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { prepareUploadableFiles } from "../../../apps/web/src/lib/uploaded-document-detection";
import { createWorkspaceRecord, getWorkspace, ingestFilesIntoWorkspace, saveWorkspaceSnapshot } from "../../../apps/web/src/lib/workspace-storage";

const blank = readFileSync("tests/fixtures/irs/f1099lps--2026.pdf");
const interestLines = [
  "2026 Form 1099-INT",
  "Interest Income",
  "1 Interest Income $123.45",
  "4 Federal income tax withheld $0.00",
];

async function drawText(packet: PDFDocument, page: PDFPage, lines: readonly string[], top = 715) {
  const font = await packet.embedFont(StandardFonts.Helvetica);
  lines.forEach((line, index) => page.drawText(line, { x: 50, y: top - index * 20, size: 11, font }));
}

async function addInterestPage(packet: PDFDocument, lines: readonly string[]) {
  await drawText(packet, packet.addPage([612, 792]), lines);
}

function upload(bytes: Uint8Array, name = "statements.pdf"): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

describe("uploaded Form 1099-LPS", () => {
  it("holds a mixed PDF containing the final Form 1099-LPS regardless of page order", async () => {
    const issuer = await PDFDocument.load(blank);
    for (const premiumStatementFirst of [true, false]) {
      const packet = await PDFDocument.create();
      const [policyholderCopy] = await packet.copyPages(issuer, [2]);
      if (premiumStatementFirst) packet.addPage(policyholderCopy);
      await addInterestPage(packet, interestLines);
      if (!premiumStatementFirst) packet.addPage(policyholderCopy);
      const filename = premiumStatementFirst ? "statements.pdf" : "f1099int.pdf";
      const prepared = await prepareUploadableFiles([upload(await packet.save(), filename)]);
      const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord("combined-statements"), prepared);
      expect(workspace.documents).toEqual([expect.objectContaining({
        kind: "1099-lps",
        coverage: "unsupported",
        label: "Form 1099-LPS needs review",
        taxYear: null,
        seededFactIds: [],
        detectedFacts: [],
      })]);
      expect(workspace.structuredFacts).toEqual([]);
      expect(workspace.enginePreview).toBeNull();
      const values = new Map<string, string>();
      const storage = {
        get length() { return values.size; },
        clear() { values.clear(); },
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
        key: (index: number) => [...values.keys()][index] ?? null,
      } satisfies Storage;
      saveWorkspaceSnapshot(storage, workspace);
      const reopened = getWorkspace(storage, workspace.id);
      expect(reopened?.documents).toEqual(workspace.documents.map(document => ({ ...document, blobStorageKey: null })));
      expect(reopened?.structuredFacts).toEqual([]);
      expect(reopened?.enginePreview).toBeNull();
    }
  });

  it("recognizes the final blank without assuming a calendar year or amounts", async () => {
    expect(createHash("sha256").update(blank).digest("hex")).toBe(
      "f9a691f5dd902be70f0d6194bf34d4a7e093c68bc5312f7c3443d2313d235ac8",
    );
    expect((await PDFDocument.load(blank)).getPageCount()).toBe(6);
    const [prepared] = await prepareUploadableFiles([upload(blank)]);
    expect(prepared.detectedDocument).toMatchObject({
      kind: "1099-lps",
      coverage: "unsupported",
      taxYear: null,
      label: "Form 1099-LPS needs review",
      seededFactIds: [],
      detectedFacts: [],
    });
  });

  it("holds the actual form when another panel or page stamp shares the header row", async () => {
    const issuer = await PDFDocument.load(blank);
    const headerY = 728.233;
    const stamped = await PDFDocument.create();
    const [policyholderCopy] = await stamped.copyPages(issuer, [2]);
    stamped.addPage(policyholderCopy);
    await drawText(stamped, policyholderCopy, ["Page 1 of 1"], headerY);

    const twoUp = await PDFDocument.create();
    const panel = twoUp.addPage([1224, 792]);
    panel.drawPage(await twoUp.embedPage(issuer.getPage(2)), { x: 612, y: 0 });
    await drawText(twoUp, panel, interestLines, headerY);

    const uploads = [upload(await stamped.save(), "f1099int.pdf"), upload(await twoUp.save())];
    const prepared = await prepareUploadableFiles(uploads);
    const workspace = ingestFilesIntoWorkspace(createWorkspaceRecord("same-row-statements"), prepared);
    expect(workspace.documents.map(({ kind, coverage, seededFactIds, detectedFacts }) => ({
      kind, coverage, seededFactIds, detectedFacts,
    }))).toEqual(Array.from({ length: 2 }, () => ({
      kind: "1099-lps", coverage: "unsupported", seededFactIds: [], detectedFacts: [],
    })));
  });

  it("keeps importing an interest statement when only the filename or a source note mentions Form 1099-LPS", async () => {
    const interest = await PDFDocument.create();
    await addInterestPage(interest, [...interestLines, "See your Form 1099-LPS for separate insurance information."]);
    const [prepared] = await prepareUploadableFiles([upload(await interest.save(), "f1099lps.pdf")]);
    expect(prepared.detectedDocument).toMatchObject({
      kind: "1099-int",
      detectedFacts: [expect.objectContaining({
        machineValue: expect.objectContaining({ interestIncome: "123.45" }),
      })],
    });
  });
});
