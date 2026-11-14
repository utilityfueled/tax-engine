const personNameContextPatterns = [
  /(?:Uploaded by|Call|Contact|Reach|Verify)\s+[A-Z][a-z]+ [A-Z][a-z]+\b/,
  /\b[A-Z][a-z]+ [A-Z][a-z]+\s+(?:confirmed|answered|matches|uses)\b/,
  /\bdependent\s+[A-Z][a-z]+ [A-Z][a-z]+\b/i,
  /\b(?:account holder|card member|recipient name|taxpayer name|spouse name|prepared for)(?:[\t ]+|[\t ]*:[\t ]*|\r?\n)\p{L}/iu
] as const;
const mailContextTokens = /Mail(?= )| to(?=\s+[A-Z][a-z]+ [A-Z][a-z]+\b)|[.\n]/g;
const workspaceSlugPattern = /(?:^|[^a-z0-9])(?:workspace|return)[-_]([a-z]+(?:[._-][a-z]+)+)(?=$|[^a-z0-9])/gi;
const ssnPattern = /(?<!\d)(?:\d{3}[-_.\s]?\d{2}[-_.\s]?\d{4})(?!\d)/;
const einPattern = /(?<!\d)\d{2}[-_.\s]?\d{7}(?!\d)/;
const dobValuePattern = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})`;
const ignoredNameTokens = new Set([
  "draft",
  "engine",
  "export",
  "fixture",
  "form",
  "interview",
  "provider",
  "redacted",
  "request",
  "return",
  "review",
  "sample",
  "summary",
  "tax",
  "upload",
  "workspace"
]);
/** Luhn checksum validation for credit/debit card numbers. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Credit/debit card number pattern: 13–19 digits optionally separated by
 * spaces, dashes, or dots in groups. We extract digit-only form and verify
 * with Luhn to reduce false positives.
 */
const creditCardGrouped = /(?<!\d)(\d{4}[-\s.]?\d{4}[-\s.]?\d{4}[-\s.]?\d{1,7})(?!\d)/g;
const creditCardKeyword = /(?:card|visa|mastercard|amex|discover|cc|credit|debit)[\s#:]*(?<!\d)(\d[\d\s.-]{11,22}\d)(?!\d)/gi;

function containsCreditCardNumber(value: string): boolean {
  for (const pattern of [creditCardGrouped, creditCardKeyword]) {
    pattern.lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
      const digits = (match[1] ?? "").replace(/[\s.-]/g, "");
      if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) {
        return true;
      }
    }
  }
  return false;
}

const unsafeDirectIdentifierPatterns = [
  ssnPattern,
  einPattern,
  /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\d)/,
  /\b\d{1,6}\s+(?:[A-Z0-9.'#-]+\s){0,5}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl|Plaza|Pkwy|Parkway|Terrace|Ter)\b(?:\s+(?:Apt|Apartment|Unit|Suite|Ste)\.?\s*[A-Z0-9-]+)?/i,
  /(?:\b[A-Z]{2}\s+|\bZIP[:\s]+)\d{5}(?:-\d{4})?\b/,
  new RegExp(String.raw`(?:\bDOB\b|\bdate of birth\b|\bbirth date\b)[:\s]+${dobValuePattern}\b`, "i"),
  /(?:\brouting\b|\bABA\b|\bRTN\b)[\s#:]*(?<!\d)\d{9}(?!\d)/i,
  /(?:\baccount\b|\bacct\b)[\s#:]*(?<!\d)\d{6,17}(?!\d)/i
];
const emailLocalTokens = /[A-Z0-9._%+-]+|@/gi;
const emailDomainPattern = /[A-Z0-9.-]+\.[A-Z]{2,}\b/iy;
const asciiWord = /\w/;

function isLikelyPersonNameSlug(value: string) {
  const tokens = value
    .split(/[._-]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  return tokens.length >= 2
    && tokens.length <= 4
    && tokens.every((token) => /^[a-z]{2,}$/.test(token) && !ignoredNameTokens.has(token));
}

function containsMailRecipient(value: string) {
  if (!value.includes("Mail ")) return false;
  let mailInSentence = false;
  // Replacing the unbounded optional text between "Mail" and " to" with
  // a forward scan preserves its period/LF boundary and permits later cues.
  for (const [token] of value.matchAll(mailContextTokens)) {
    if (token === "Mail") mailInSentence = true;
    else if (token === " to") {
      if (mailInSentence) return true;
    } else mailInSentence = false;
  }
  return false;
}

function containsEmail(value: string) {
  if (!value.includes("@")) return false;
  let localEnd = -1;
  for (const match of value.matchAll(emailLocalTokens)) {
    const [token] = match;
    if (token === "@") {
      if (localEnd !== match.index) continue;
      emailDomainPattern.lastIndex = match.index + 1;
      if (emailDomainPattern.test(value)) return true;
    } else if (asciiWord.test(token)) {
      // A maximal local token with an ASCII word character contains the
      // original word boundary, even when preceded by allowed punctuation.
      localEnd = match.index + token.length;
    }
  }
  return false;
}

function containsUnsafePersonName(value: string) {
  workspaceSlugPattern.lastIndex = 0;

  for (const match of value.matchAll(workspaceSlugPattern)) {
    if (isLikelyPersonNameSlug(match[1] ?? "")) {
      return true;
    }
  }

  return personNameContextPatterns.some(pattern => pattern.test(value)) || containsMailRecipient(value);
}

function containsUnsafeText(value: string) {
  return containsEmail(value)
    || unsafeDirectIdentifierPatterns.some(pattern => pattern.test(value))
    || containsCreditCardNumber(value)
    || containsUnsafePersonName(value);
}

// A byte-bounded JSON caller cannot exceed either allowance. Keep independent
// protection for in-process callers, which can pass arbitrary object graphs.
const maxScanSize = 1024 * 1024;

export function containsUnsafeDirectIdentifier(value: unknown) {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  let remainingEntries = maxScanSize;
  let remainingText = maxScanSize;

  function scanText(text: string) {
    remainingText -= text.length;
    return remainingText < 0 || containsUnsafeText(text);
  }

  try {
    while (pending.length > 0) {
      const current = pending.pop();
      if (typeof current === "string") {
        if (scanText(current)) return true;
        continue;
      }
      if (current === null || typeof current !== "object" || seen.has(current)) continue;
      seen.add(current);

      const keys = Object.keys(current);
      remainingEntries -= keys.length;
      if (remainingEntries < 0) return true;
      const arrayLength = Array.isArray(current) ? current.length : 0;
      for (const key of keys) {
        // Array indices are storage positions rather than input text.
        const arrayIndex = Number(key);
        const isArrayIndex = arrayIndex >= 0 && arrayIndex < arrayLength
          && Number.isInteger(arrayIndex) && String(arrayIndex) === key;
        if (!isArrayIndex && scanText(key)) return true;
        const property = Object.getOwnPropertyDescriptor(current, key);
        if (!property || !Object.hasOwn(property, "value")) return true;
        pending.push(property.value);
      }
    }
    return false;
  } catch {
    // Accessors, proxies and unsupported objects must never grant admission via
    // a partially inspected payload.
    return true;
  }
}
