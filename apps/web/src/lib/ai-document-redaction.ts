import { containsUnsafeDirectIdentifier } from "@/lib/provider-request-privacy";

type RedactionKind =
  | "person-name"
  | "street-address"
  | "postal-code"
  | "other";

export interface RedactedAiDocumentText {
  redactedText: string;
  replacementCount: number;
}

const sensitiveHeaderPatterns: Array<{
  header: RegExp;
  leadingKind: RedactionKind;
}> = [
  { header: /employee(?:'?s)? name(?:, address, and zip code)?/i, leadingKind: "person-name" },
  { header: /employee name and address/i, leadingKind: "person-name" },
  { header: /prepared for\b/i, leadingKind: "person-name" },
  { header: /account holder\b/i, leadingKind: "person-name" },
  { header: /card member\b/i, leadingKind: "person-name" },
  { header: /member name\b/i, leadingKind: "person-name" },
  { header: /recipient name\b/i, leadingKind: "person-name" },
  { header: /taxpayer name\b/i, leadingKind: "person-name" },
  { header: /spouse name\b/i, leadingKind: "person-name" },
  { header: /employer(?:'?s)? name(?:, address, and zip code)?/i, leadingKind: "other" },
];

const streetAddressKeywords = /\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|lane|ln|drive|dr|court|ct|circle|cir|way|place|pl|parkway|pkwy|terrace|ter|suite|ste|apt|apartment|unit|fl)\b/i;
const stateZipPattern = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
const nameLinePattern = /^[\p{L}][\p{L}\p{M}'.,-]*(?: [\p{L}][\p{L}\p{M}'.,-]*){0,6}$/u;
const accountReferencePattern = /(account|card)\s*[-#:]*\s*\d{4,}/ig;
const ssnLikePattern = /(?<!\d)(?:\d{3}[-_.\s]?\d{2}[-_.\s]?\d{4})(?!\d)/g;
const einLikePattern = /(?<!\d)\d{2}[-_.\s]?\d{7}(?!\d)/g;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\d)/g;
const dobContextPattern = /(?:\bDOB\b|\bdate of birth\b|\bbirth date\b)[:\s]+(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/gi;
const zipContextPattern = /(?:\b[A-Z]{2}\s+|\bZIP[:\s]+)\d{5}(?:-\d{4})?\b/gi;
const routingPattern = /(?:\brouting\b|\bABA\b|\bRTN\b)[\s#:]*(?<!\d)\d{9}(?!\d)/gi;
const bankAccountPattern = /(?:\baccount\b|\bacct\b)[\s#:]*(?<!\d)\d{6,17}(?!\d)/gi;

function passesLuhn(digits: string) {
  let sum = 0;
  let alternate = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let numeric = Number(digits[index]);

    if (alternate) {
      numeric *= 2;
      if (numeric > 9) {
        numeric -= 9;
      }
    }

    sum += numeric;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

function redactCreditCardNumbers(text: string, replaceWithToken: (kind: RedactionKind, rawValue: string) => string) {
  return text.replace(/(?<!\d)(\d{4}[-\s.]?\d{4}[-\s.]?\d{4}[-\s.]?\d{1,7})(?!\d)/g, (match, candidate) => {
    const digits = String(candidate).replace(/[\s.-]/g, "");

    if (digits.length >= 13 && digits.length <= 19 && passesLuhn(digits)) {
      return replaceWithToken("other", match);
    }

    return match;
  });
}

function looksLikeAddressLine(line: string) {
  return streetAddressKeywords.test(line) || stateZipPattern.test(line) || /\[postal-code-\d+\]/.test(line);
}

function looksLikeNameLine(line: string) {
  const trimmed = line.trim();

  return nameLinePattern.test(trimmed);
}

export function redactTextForAiAnalysis(text: string): RedactedAiDocumentText {
  const tokenCounts = new Map<RedactionKind, number>();
  const tokenByValue = new Map<string, string>();
  let replacementCount = 0;

  function replaceWithToken(kind: RedactionKind, rawValue: string) {
    const normalized = `${kind}:${rawValue.trim().toLowerCase()}`;
    const existing = tokenByValue.get(normalized);

    if (existing) {
      replacementCount += 1;
      return existing;
    }

    const nextCount = (tokenCounts.get(kind) ?? 0) + 1;
    const token = `[${kind}-${nextCount}]`;
    tokenCounts.set(kind, nextCount);
    tokenByValue.set(normalized, token);
    replacementCount += 1;
    return token;
  }

  let redactedText = text
    .replace(ssnLikePattern, (match) => replaceWithToken("other", match))
    .replace(einLikePattern, (match) => replaceWithToken("other", match))
    .replace(emailPattern, (match) => replaceWithToken("other", match))
    .replace(phonePattern, (match) => replaceWithToken("other", match))
    .replace(dobContextPattern, (match) => replaceWithToken("other", match))
    .replace(zipContextPattern, (match) => replaceWithToken("postal-code", match))
    .replace(routingPattern, (match) => replaceWithToken("other", match))
    .replace(bankAccountPattern, (match) => replaceWithToken("other", match))
    .replace(accountReferencePattern, (match) => replaceWithToken("other", match));

  redactedText = redactCreditCardNumbers(redactedText, replaceWithToken);

  const lines = redactedText.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index] ?? "";
    const matchedHeader = sensitiveHeaderPatterns.find(({ header }) => header.test(currentLine));

    if (!matchedHeader) {
      continue;
    }

    // Labels also occur inline, with mixed case, punctuation and non-ASCII
    // names. Treat the labelled value as private rather than guessing its
    // capitalization. A token in untrusted document text is not evidence that
    // its neighbouring text was redacted by this function.
    const headerMatch = matchedHeader.header.exec(currentLine);
    if (!headerMatch) continue;
    const valueStart = headerMatch.index + headerMatch[0].length;
    const inlineValue = currentLine.slice(valueStart).replace(/^[\t :=]+/, "").trim();
    if (inlineValue) {
      lines[index] = `${currentLine.slice(0, valueStart)} ${replaceWithToken(matchedHeader.leadingKind, inlineValue)}`;
    }

    for (let lookahead = index + 1; lookahead < Math.min(lines.length, index + 5); lookahead += 1) {
      const candidateLine = lines[lookahead]?.trim() ?? "";

      if (!candidateLine) {
        break;
      }

      if (/^[a-z][.)]\s+|\b(?:wages|federal|social security|medicare|state income tax|gross pay|page|account summary)\b/i.test(candidateLine)
        || sensitiveHeaderPatterns.some(({ header }) => header.test(candidateLine))) {
        break;
      }

      if (looksLikeAddressLine(candidateLine)) {
        lines[lookahead] = replaceWithToken(
          stateZipPattern.test(candidateLine) || /\[postal-code-\d+\]/.test(candidateLine) ? "postal-code" : "street-address",
          candidateLine,
        );
        continue;
      }

      if (looksLikeNameLine(candidateLine)) {
        lines[lookahead] = replaceWithToken(matchedHeader.leadingKind, candidateLine);
        continue;
      }

      if (/^\d/.test(candidateLine) && candidateLine.length <= 6) {
        continue;
      }
    }
  }

  redactedText = lines.join("\n");

  if (containsUnsafeDirectIdentifier(redactedText)) {
    redactedText = redactedText
      .replace(/\b([A-Z][a-z]+(?: [A-Z][a-z]+){1,4})\b/g, (match) => replaceWithToken("person-name", match))
      .replace(/\b([A-Z][A-Z'.,-]+(?: [A-Z][A-Z'.,-]+){1,4})\b/g, (match) => replaceWithToken("person-name", match));
  }

  return {
    redactedText,
    replacementCount,
  };
}
