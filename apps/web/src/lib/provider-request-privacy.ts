const personNameContextPatterns = [
  /(?:Uploaded by|Call|Contact|Reach|Verify)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g,
  /Mail(?: [^.\n]*?)? to\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g,
  /\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+(?:confirmed|answered|matches|uses)\b/g,
  /\bdependent\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/gi
] as const;
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
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\d)/,
  /\b\d{1,6}\s+(?:[A-Z0-9.'#-]+\s){0,5}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl|Plaza|Pkwy|Parkway|Terrace|Ter)\b(?:\s+(?:Apt|Apartment|Unit|Suite|Ste)\.?\s*[A-Z0-9-]+)?/i,
  /(?:\b[A-Z]{2}\s+|\bZIP[:\s]+)\d{5}(?:-\d{4})?\b/,
  new RegExp(String.raw`(?:\bDOB\b|\bdate of birth\b|\bbirth date\b)[:\s]+${dobValuePattern}\b`, "i"),
  /(?:\brouting\b|\bABA\b|\bRTN\b)[\s#:]*(?<!\d)\d{9}(?!\d)/i,
  /(?:\baccount\b|\bacct\b)[\s#:]*(?<!\d)\d{6,17}(?!\d)/i
];

function collectStringValues(value: unknown, seen = new Set<object>()): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectStringValues(entry, seen));
  }

  return Object.values(value).flatMap((entry) => collectStringValues(entry, seen));
}

function isLikelyPersonNameSlug(value: string) {
  const tokens = value
    .split(/[._-]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  return tokens.length >= 2
    && tokens.length <= 4
    && tokens.every((token) => /^[a-z]{2,}$/.test(token) && !ignoredNameTokens.has(token));
}

function containsUnsafePersonName(value: string) {
  workspaceSlugPattern.lastIndex = 0;

  for (const match of value.matchAll(workspaceSlugPattern)) {
    if (isLikelyPersonNameSlug(match[1] ?? "")) {
      return true;
    }
  }

  for (const pattern of personNameContextPatterns) {
    pattern.lastIndex = 0;

    if (pattern.test(value)) {
      return true;
    }
  }

  return false;
}

export function containsUnsafeDirectIdentifier(value: unknown) {
  return collectStringValues(value).some((entry) => {
    for (const pattern of unsafeDirectIdentifierPatterns) {
      pattern.lastIndex = 0;

      if (pattern.test(entry)) {
        return true;
      }
    }

    if (containsCreditCardNumber(entry)) {
      return true;
    }

    return containsUnsafePersonName(entry);
  });
}
