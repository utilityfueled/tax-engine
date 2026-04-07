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

/** Maximum time to wait for the request body to arrive before aborting. */
const BODY_READ_TIMEOUT_MS = 30_000;

/**
 * Reads a request body as text with a streaming size limit.
 *
 * When a ReadableStream body is available, reads in chunks and aborts as
 * soon as the cumulative byte count exceeds `maxBodySize` — preventing
 * memory exhaustion from oversized bodies sent without a Content-Length.
 */
async function readBodyWithSizeLimit(request: Request, maxBodySize: number): Promise<string> {
  if (!request.body) {
    // No streaming body (e.g., empty body or test mock) — fall back
    const text = await request.text();

    if (text.length > maxBodySize) {
      throw new BodyTooLargeError();
    }

    return text;
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maxBodySize) {
        throw new BodyTooLargeError();
      }

      chunks.push(decoder.decode(value, { stream: true }));
    }

    // Flush the decoder
    chunks.push(decoder.decode());
  } finally {
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

export async function safeReadTextBody(
  request: Request,
  maxBodySize: number,
  timeoutMs: number = BODY_READ_TIMEOUT_MS
): Promise<SafeTextReadOutcome> {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredSize = parseInt(contentLength, 10);

    if (!Number.isNaN(declaredSize) && declaredSize > maxBodySize) {
      return {
        ok: false,
        error: `Request body too large. Maximum allowed size is ${formatBytes(maxBodySize)}.`,
        status: 413
      };
    }
  }

  try {
    const text = await withTimeout(readBodyWithSizeLimit(request, maxBodySize), timeoutMs);
    return { ok: true, text };
  } catch (error) {
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
  }
}

/** Races a promise against a timeout. Rejects with an error if the timeout fires first. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Body read timed out.")), ms);

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
  return contentType.toLowerCase().trimStart().startsWith("application/json");
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
