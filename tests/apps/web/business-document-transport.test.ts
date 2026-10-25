import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusinessExpenseStatements, analyzeSelfEmploymentIncomeDocuments } from "../../../apps/web/src/lib/business-expense-analysis";
import { extractPdfTextFromFile } from "../../../apps/web/src/lib/uploaded-document-detection";
vi.mock("../../../apps/web/src/lib/uploaded-document-detection", () => ({ extractPdfTextFromFile: vi.fn() }));

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe.each([
  ["expense", analyzeBusinessExpenseStatements, "/api/business-expense-analysis"],
  ["income", analyzeSelfEmploymentIncomeDocuments, "/api/self-employment-income-analysis"],
] as const)("%s document browser transport", (_kind, analyze, endpoint) => {
  it("transmits redacted text with opaque names and restores filenames only on this device", async () => {
    vi.mocked(extractPdfTextFromFile).mockResolvedValue("Account holder\nCasey Sample\nAccount Summary\n2026-01-15 COFFEE SHOP $12.34");
    const fileName = "Casey Sample 123456789 return.pdf";
    const fetchFn = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      expect(url).toBe(endpoint);
      expect(init?.body).not.toBeInstanceOf(FormData);
      const body = String(init?.body);
      for (const value of ["Casey Sample", "123456789", fileName]) expect(body).not.toContain(value);
      const document = JSON.parse(body).documents[0];
      expect(document.fileName).toMatch(/^upload-[0-9a-f-]+\.pdf$/);
      expect(document.redactedText).toContain("2026-01-15 COFFEE SHOP $12.34");
      return Response.json({ analyses: [{ id: "analysis-1", fileName: document.fileName, label: document.fileName, suggestions: [] }] });
    });
    vi.stubGlobal("fetch", fetchFn);
    const result = await analyze([new File(["synthetic"], fileName, { type: "application/pdf" })]);
    expect(result[0]).toMatchObject({ fileName, label: fileName });
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("makes no request for an empty file selection", async () => {
    const fetchFn = vi.fn(); vi.stubGlobal("fetch", fetchFn);
    expect(await analyze([])).toEqual([]);
    expect(extractPdfTextFromFile).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["invalid-type", "unreadable", "extractor-error"])("does not transmit a failed local preparation: %s", async (failure) => {
    const fetchFn = vi.fn(); vi.stubGlobal("fetch", fetchFn);
    vi.mocked(extractPdfTextFromFile).mockImplementation(async () => {
      if (failure === "extractor-error") throw new Error("Synthetic parse error");
      return "";
    });
    const file = failure === "invalid-type" ? new File(["synthetic"], "source.png", { type: "image/png" })
      : new File(["synthetic"], "source.pdf", { type: "application/pdf" });
    await expect(analyze([file])).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["unknown", "duplicate"])("rejects %s response identity instead of assigning another upload's results", async (failure) => {
    vi.mocked(extractPdfTextFromFile).mockResolvedValue("2026-01-15 COFFEE SHOP $12.34");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const document = JSON.parse(String(init?.body)).documents[0];
      const analysis = { fileName: failure === "unknown" ? "not-this-document.pdf" : document.fileName, label: "Summary", suggestions: [] };
      return Response.json({ analyses: failure === "duplicate" ? [analysis, analysis] : [analysis] });
    }));
    await expect(analyze([new File(["synthetic"], "source.pdf")])).rejects.toThrow(/matched|duplicate/i);
  });

  it.each(["json-error", "invalid-json", "empty-success"])("handles server response %s without inventing results", async (kind) => {
    vi.mocked(extractPdfTextFromFile).mockResolvedValue("2026-01-15 COFFEE SHOP $12.34");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(kind === "json-error"
      ? Response.json({ error: "Temporary synthetic outage" }, { status: 503 })
      : kind === "invalid-json" ? new Response("not json", { status: 502 }) : Response.json({ analyses: null })));
    const result = analyze([new File(["synthetic"], "source.pdf")]);
    if (kind === "empty-success") expect(await result).toEqual([]);
    else await expect(result).rejects.toThrow(kind === "json-error" ? /Temporary synthetic outage/ : /502/);
  });
});
