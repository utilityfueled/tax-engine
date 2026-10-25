import { describe, expect, it, vi } from "vitest";
import { safeParseJsonBody, safeReadTextBody } from "../../../apps/web/src/lib/safe-body-parser";

function streamedRequest(body: ReadableStream<Uint8Array>, signal?: AbortSignal, headers: Record<string, string> = {}) {
  return new Request("https://tax.example/api/upload", { method: "POST", body, signal, duplex: "half", headers } as RequestInit);
}

describe("bounded request body lifecycle", () => {
  it("cancels an oversized stream instead of leaving the source open", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(9)); }, cancel });
    const result = await safeReadTextBody(streamedRequest(body), 8);
    expect(result).toMatchObject({ ok: false, status: 413 }); expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
  });
  it("cancels a stalled stream at its deadline and releases the reader", async () => {
    const cancel = vi.fn(); const body = new ReadableStream<Uint8Array>({ cancel });
    const result = await safeReadTextBody(streamedRequest(body), 1024, 10);
    expect(result).toMatchObject({ ok: false, status: 400 }); expect(cancel).toHaveBeenCalledOnce();
    await Promise.resolve(); expect(body.locked).toBe(false);
  });
  it("cancels a pending source when the caller disconnects", async () => {
    const cancel = vi.fn(); const controller = new AbortController(); const body = new ReadableStream<Uint8Array>({ cancel });
    const pending = safeReadTextBody(streamedRequest(body, controller.signal), 1024, 100);
    controller.abort(new Error("Private disconnect reason"));
    const result = await pending;
    expect(result).toMatchObject({ ok: false, status: 499 }); expect(JSON.stringify(result)).not.toContain("Private");
    expect(cancel).toHaveBeenCalledOnce(); expect(body.locked).toBe(false);
  });
  it("rejects an already disconnected request without consuming its source", async () => {
    const controller = new AbortController(); controller.abort(); const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(source) { source.enqueue(new TextEncoder().encode("{}")); source.close(); }, cancel });
    const result = await safeReadTextBody(streamedRequest(body, controller.signal), 1024);
    expect(result).toMatchObject({ ok: false, status: 499 }); expect(body.locked).toBe(false);
  });
  it("uses UTF-8 bytes at the limit and decodes split multibyte characters", async () => {
    const bytes = new TextEncoder().encode('"é"');
    function source() { return new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }); }
    expect(await safeReadTextBody(streamedRequest(source()), 4)).toEqual({ ok: true, text: '"é"' });
    expect(await safeReadTextBody(streamedRequest(source()), 3)).toMatchObject({ ok: false, status: 413 });
  });
  it("contains source exceptions without echoing private data", async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("Private taxpayer text")); } });
    const result = await safeReadTextBody(streamedRequest(body), 1024);
    expect(result).toEqual({ ok: false, error: "Failed to read request body.", status: 400 }); expect(body.locked).toBe(false);
  });
  it.each(["application/json-private", "application/jsonp", "application/json text/plain"])("rejects a lookalike media type %s", async contentType => {
    const response = await safeParseJsonBody(new Request("https://tax.example/api/upload", { method: "POST", body: "{}", headers: { "content-type": contentType } }));
    expect(response).toMatchObject({ ok: false, status: 415 });
  });
});
