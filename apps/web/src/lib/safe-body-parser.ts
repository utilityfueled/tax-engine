/**
 * Safe body parsing with size limits for API routes.
 *
 * Prevents memory exhaustion from arbitrarily large request bodies
 * by reading the body as text with a size limit before parsing JSON.
 */

const DEFAULT_MAX_JSON_BODY_SIZE = 1024 * 1024; // 1 MB

export interface SafeJsonParseResult<T = unknown> {
  ok: true;
  data: T;
}

export interface SafeJsonParseError {
  ok: false;
  error: string;
  status: number;
}

export type SafeJsonParseOutcome<T = unknown> = SafeJsonParseResult<T> | SafeJsonParseError;

export type SafeTextReadOutcome =
  | { ok: true; text: string }
  | SafeJsonParseError;

export type SafeBinaryReadOutcome =
  | { ok: true; bytes: Uint8Array<ArrayBuffer> }
  | SafeJsonParseError;

/** Maximum time to wait for the request body to arrive before aborting. */
const BODY_READ_TIMEOUT_MS = 30_000;

/**
 * Reads a request body as text with a streaming size limit.
 *
 * When a ReadableStream body is available, reads in chunks and aborts as
 * soon as the cumulative byte count exceeds `maxBodySize` — preventing
 * memory exhaustion from oversized bodies sent without a Content-Length.
 */
async function readBodyWithSizeLimit(request: Request, maxBodySize: number, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (!request.body) {
    // No streaming body (e.g., empty body or test mock) — fall back
    const text = await request.text();

    signal.throwIfAborted();
    if (new TextEncoder().encode(text).byteLength > maxBodySize) {
      throw new BodyTooLargeError();
    }

    return text;
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });

  try {
    while (true) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBodySize) {
        cancel();
        throw new BodyTooLargeError();
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    // Flush the decoder
    chunks.push(decoder.decode());
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }

  return chunks.join("");
}

class BodyTooLargeError extends Error {
  constructor() {
    super("Request body too large");
    this.name = "BodyTooLargeError";
  }
}

/** Binary counterpart for bounded multipart input; no text decoding occurs. */
export async function safeReadBinaryBody(
  request: Request,
  maxBodySize: number,
  timeoutMs: number = BODY_READ_TIMEOUT_MS
): Promise<SafeBinaryReadOutcome> {
  const cancelBody = () => { void request.body?.cancel().catch(() => {}); };
  if (request.signal.aborted) {
    cancelBody();
    return { ok: false, error: "Request cancelled.", status: 499 };
  }
  const declaredSize = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (declaredSize > maxBodySize) {
    cancelBody();
    return { ok: false, error: "Request body too large.", status: 413 };
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });
  const read = async (): Promise<Uint8Array<ArrayBuffer>> => {
    controller.signal.throwIfAborted();
    if (!request.body) return new Uint8Array(0);
    const reader = request.body.getReader();
    // A producer's cancel promise is untrusted. Initiate cancellation, but do
    // not await it: pending reads close immediately even if that promise hangs.
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    let bytes = new Uint8Array(Math.min(maxBodySize, 64 * 1024));
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        controller.signal.throwIfAborted();
        if (done) break;
        if (value.byteLength > maxBodySize - size) {
          cancel();
          throw new BodyTooLargeError();
        }
        const nextSize = size + value.byteLength;
        if (nextSize > bytes.byteLength) {
          const expanded = new Uint8Array(Math.min(maxBodySize, Math.max(nextSize, bytes.byteLength * 2)));
          expanded.set(bytes);
          bytes = expanded;
        }
        bytes.set(value, size);
        size = nextSize;
      }
      return bytes.slice(0, size);
    } finally {
      controller.signal.removeEventListener("abort", cancel);
      reader.releaseLock();
    }
  };
  try {
    return { ok: true, bytes: await withTimeout(read(), timeoutMs, abort) };
  } catch (error) {
    if (request.signal.aborted) return { ok: false, error: "Request cancelled.", status: 499 };
    if (error instanceof BodyTooLargeError) return { ok: false, error: "Request body too large.", status: 413 };
    return { ok: false, error: "Failed to read request body.", status: 400 };
  } finally {
    request.signal.removeEventListener("abort", abort);
  }
}

export async function safeReadTextBody(
  request: Request,
  maxBodySize: number,
  timeoutMs: number = BODY_READ_TIMEOUT_MS
): Promise<SafeTextReadOutcome> {
  if (request.signal?.aborted) {
    void request.body?.cancel().catch(() => {});
    return { ok: false, error: "Request cancelled.", status: 499 };
  }
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredSize = parseInt(contentLength, 10);

    if (!Number.isNaN(declaredSize) && declaredSize > maxBodySize) {
      void request.body?.cancel().catch(() => {});
      return {
        ok: false,
        error: `Request body too large. Maximum allowed size is ${formatBytes(maxBodySize)}.`,
        status: 413
      };
    }
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal?.addEventListener("abort", cancel, { once: true });
  try {
    const text = await withTimeout(readBodyWithSizeLimit(request, maxBodySize, controller.signal), timeoutMs, cancel);
    return { ok: true, text };
  } catch (error) {
    if (request.signal?.aborted) return { ok: false, error: "Request cancelled.", status: 499 };
    if (error instanceof BodyTooLargeError) {
      return {
        ok: false,
        error: `Request body too large. Maximum allowed size is ${formatBytes(maxBodySize)}.`,
        status: 413
      };
    }

    return {
      ok: false,
      error: "Failed to read request body.",
      status: 400
    };
  } finally {
    request.signal?.removeEventListener("abort", cancel);
  }
}

/** Races a promise against a timeout. Rejects with an error if the timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number, cancel: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { cancel(); reject(new Error("Body read timed out.")); }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  if (!contentType) {
    return false;
  }

  // Accept "application/json" and "application/json; charset=utf-8" etc.
  return contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

export async function safeParseJsonBody(
  request: Request,
  maxBodySize: number = DEFAULT_MAX_JSON_BODY_SIZE
): Promise<SafeJsonParseOutcome> {
  if (!hasJsonContentType(request)) {
    return {
      ok: false,
      error: "Content-Type must be application/json.",
      status: 415
    };
  }

  const result = await safeReadTextBody(request, maxBodySize);

  if (!result.ok) {
    return result;
  }

  try {
    return {
      ok: true,
      data: JSON.parse(result.text) as unknown
    };
  } catch {
    return {
      ok: false,
      error: "Invalid JSON in request body.",
      status: 400
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
