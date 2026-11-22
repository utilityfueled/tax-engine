import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { stripVTControlCharacters } from 'node:util';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MAX_ERRORS = 16, MAX_MESSAGE = 4096, MAX_STACK = 16384, MAX_FRAMES = 32;
const own = (object, key) => {
  if (!object || typeof object !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
};

function errors(result) {
  const primary = own(result, 'error'), others = own(result, 'errors');
  if (others === undefined) return primary === undefined ? [] : [primary];
  const count = own(others, 'length');
  if (!Array.isArray(others) || !Number.isSafeInteger(count) || count < 0 || count + Number(primary !== undefined) > MAX_ERRORS) return null;
  const records = primary === undefined ? [] : [primary];
  for (let i = 0; i < count; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(others, String(i));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    records.push(descriptor.value);
  }
  return records;
}

function category(error) {
  const name = own(error, 'name'), message = own(error, 'message');
  if (name !== undefined && (typeof name !== 'string' || name.length > 64)) return 'unknown';
  if (message !== undefined && (typeof message !== 'string' || message.length > MAX_MESSAGE)) return 'unknown';
  if (name === 'TimeoutError') return 'timeout';
  if (name === 'AssertionError') return 'assertion';
  if (typeof message !== 'string') return 'unknown';
  const text = stripVTControlCharacters(message);
  if (/^(?:Error: )?Test timeout of [0-9]+ms exceeded(?:\.|$)/u.test(text)) return 'timeout';
  if (/^(?:Error: )?expect\(/u.test(text) || /^AssertionError(?::| \[)/u.test(text)) return 'assertion';
  // Playwright failOnStatusCode emits this fixed first line. A status mentioned
  // in an assertion or arbitrary prose is not evidence of an HTTP failure.
  const http = /^(?:Error: )?apiRequestContext\.(?:get|post|put|patch|delete|head|fetch): ([45][0-9]{2}) ([^\r\n]+)(?:\r?\n|$)/u.exec(text);
  return http && STATUS_CODES[http[1]] === http[2] ? 'http' : 'unknown';
}

function verifiedLocation(location, sources) {
  const supplied = own(location, 'file'), line = own(location, 'line'), column = own(location, 'column');
  if (typeof supplied !== 'string' || supplied.length > 1024 || !Number.isSafeInteger(line) || !Number.isSafeInteger(column) || line < 1 || column < 1) return null;
  // Only an absolute path inside this exact checkout can be relativized. No
  // suffix matching, URLs, foreign absolute roots, or path normalization hints.
  if (supplied.includes('\\') || supplied.split('/').some(part => part === '.' || part === '..')) return null;
  const file = path.isAbsolute(supplied) ? path.relative(ROOT, supplied) : supplied;
  if (!/^(?:apps\/web\/tests|tests)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:[cm]?js|tsx?)$/u.test(file)) return null;
  if (!sources.has(file)) {
    try {
      const absolute = path.join(ROOT, file), stat = lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024 || realpathSync(absolute) !== path.join(realpathSync(ROOT), file)) return null;
      sources.set(file, readFileSync(absolute, 'utf8').split('\n'));
    } catch { return null; }
  }
  const lines = sources.get(file);
  return line <= lines.length && column <= lines[line - 1].length + 1 ? { file, line, column } : null;
}

function stackLocation(error, sources) {
  const stack = own(error, 'stack');
  if (typeof stack !== 'string' || stack.length > MAX_STACK) return null;
  // Do not inspect the error-message line or unbounded extra frames.
  for (const frame of stack.split('\n').slice(1, MAX_FRAMES + 1)) {
    if (frame.length > 1024) continue;
    const match = /^\s*at (?:[^()\r\n]+ \()?([^()\r\n]+):([1-9][0-9]{0,6}):([1-9][0-9]{0,5})\)?$/u.exec(frame);
    if (!match) continue;
    const location = verifiedLocation({ file: match[1], line: Number(match[2]), column: Number(match[3]) }, sources);
    if (location) return location;
  }
  return null;
}

/** Only fixed enums and source-verified coordinates escape this projection.
 * The first primary error is authoritative for its category; formatted reporter
 * errors are a fallback, never a reason to erase a primary assertion clue.
 */
export function failureClue(result, sources = new Map()) {
  const fallback = { category: own(result, 'status') === 'timedOut' ? 'timeout' : 'unknown', location: null };
  try {
    const records = errors(result);
    if (!records) return fallback;
    const fixedCategory = fallback.category === 'timeout' ? 'timeout' : category(records[0]);
    let location = verifiedLocation(own(result, 'errorLocation'), sources);
    for (const error of records) {
      location ??= verifiedLocation(own(error, 'location'), sources) ?? stackLocation(error, sources);
      if (location) break;
    }
    return { category: fixedCategory, location };
  } catch { return fallback; }
}
