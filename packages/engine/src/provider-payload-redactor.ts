import type {
  ProviderDirectIdentifier,
  ProviderDirectIdentifierKind,
  ProviderFacingPayloadMetadata,
  ProviderFacingPayloadRedaction
} from "@tax-engine/contracts";

export interface BuildProviderPayloadOptions {
  directIdentifiers?: ProviderDirectIdentifier[];
}

interface ExplicitIdentifierPattern {
  kind: ProviderDirectIdentifierKind;
  pattern: RegExp;
}

const ssnFallbackPattern = /(?<!\d)(?:\d{3}[-_.\s]?\d{2}[-_.\s]?\d{4})(?!\d)/g;
const einFallbackPattern = /(?<!\d)\d{2}[-_.\s]?\d{7}(?!\d)/g;
const streetAddressPattern = /\b\d{1,6}\s+(?:[A-Z0-9.'#-]+\s){0,5}(?:Street|St|Road|Rd|Avenue|Ave|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Way|Place|Pl|Plaza|Pkwy|Parkway|Terrace|Ter)\b(?:\s+(?:Apt|Apartment|Unit|Suite|Ste)\.?\s*[A-Z0-9-]+)?/gi;
const dobValuePattern = String.raw`(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})`;
const routingPattern = /(?:\brouting\b|\bABA\b|\bRTN\b)[\s#:]*(?<!\d)\d{9}(?!\d)/gi;
const bankAccountPattern = /(?:\baccount\b|\bacct\b)[\s#:]*(?<!\d)\d{6,17}(?!\d)/gi;
const dobContextPatterns = [
  new RegExp(String.raw`(?<=\bDOB\s)${dobValuePattern}\b`, "g"),
  new RegExp(String.raw`(?<=\bDOB:\s)${dobValuePattern}\b`, "g"),
  new RegExp(String.raw`(?<=\bdate of birth\s)${dobValuePattern}\b`, "gi"),
  new RegExp(String.raw`(?<=\bdate of birth:\s)${dobValuePattern}\b`, "gi"),
  new RegExp(String.raw`(?<=\bbirth date\s)${dobValuePattern}\b`, "gi"),
  new RegExp(String.raw`(?<=\bbirth date:\s)${dobValuePattern}\b`, "gi")
];
const postalCodeContextPatterns = [
  /(?<=\b[A-Z]{2}\s)\d{5}(?:-\d{4})?\b/g,
  /(?<=\bZIP\s)\d{5}(?:-\d{4})?\b/gi,
  /(?<=\bZIP:\s)\d{5}(?:-\d{4})?\b/gi
];
const organizationSuffixPattern = /\b(?:llc|inc|corp|corporation|company|co|group|bank|holdings|partners|partnership|associates|services|technologies|systems|capital|advisors|consulting)\b/i;
const corporateSuffixTrimPattern = /\b(?:llc|inc|corp|corporation|company|co|group|bank|holdings|partners|partnership|associates|services|technologies|systems|capital|advisors|consulting)\b\.?$/i;

function passesLuhn(digits: string): boolean {
  let sum = 0;
  let alternate = false;

  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);

    if (alternate) {
      value *= 2;

      if (value > 9) {
        value -= 9;
      }
    }

    sum += value;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

const creditCardGroupedPattern = /(?<!\d)(\d{4}[-\s.]?\d{4}[-\s.]?\d{4}[-\s.]?\d{1,7})(?!\d)/g;
const creditCardKeywordPattern = /(?:card|visa|mastercard|amex|discover|cc|credit|debit)[\s#:]*(?<!\d)(\d[\d\s.-]{11,22}\d)(?!\d)/gi;

const fallbackRedactionPatterns: ExplicitIdentifierPattern[] = [
  { kind: "ssn", pattern: ssnFallbackPattern },
  { kind: "other", pattern: einFallbackPattern },
  { kind: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: "phone", pattern: /(?<!\d)(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}(?!\d)/g },
  { kind: "street-address", pattern: streetAddressPattern },
  { kind: "other", pattern: routingPattern },
  { kind: "other", pattern: bankAccountPattern },
  ...postalCodeContextPatterns.map((pattern) => ({ kind: "postal-code" as const, pattern })),
  ...dobContextPatterns.map((pattern) => ({ kind: "date-of-birth" as const, pattern }))
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeDateOfBirthIdentifier(value: string) {
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}${month}${day}`;
  }

  const slashOrDashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (slashOrDashMatch) {
    const [, month, day, year] = slashOrDashMatch;
    return `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`;
  }

  return trimmed.replace(/\D+/g, "");
}

function normalizeIdentifier(kind: ProviderDirectIdentifierKind, value: string) {
  const trimmed = value.trim();

  switch (kind) {
    case "person-name":
      return trimmed.toLowerCase().replace(/[\s_-]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
    case "ssn":
    case "phone":
    case "postal-code":
      return trimmed.replace(/\D+/g, "");
    case "date-of-birth":
      return normalizeDateOfBirthIdentifier(trimmed);
    case "email":
      return trimmed.toLowerCase();
    default:
      return trimmed.toLowerCase().replace(/\s+/g, " ");
  }
}

function normalizeLooseWords(value: string) {
  return value
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripOrganizationSuffix(value: string) {
  return value.replace(corporateSuffixTrimPattern, "").trim();
}

function buildIdentifierVariants(identifier: ProviderDirectIdentifier) {
  const trimmed = identifier.value.trim();

  if (trimmed.length === 0) {
    return [];
  }

  const variants = new Set<string>([trimmed]);

  if (identifier.kind === "person-name") {
    const wordParts = trimmed
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (wordParts.length > 0) {
      variants.add(wordParts.join(" "));
      variants.add(wordParts.join("-"));
      variants.add(wordParts.join("_"));
    }
  }

  if (identifier.kind === "ssn") {
    const digitsOnly = trimmed.replace(/\D+/g, "");

    if (digitsOnly.length === 9) {
      variants.add(digitsOnly);
    }
  }

  if (identifier.kind === "street-address") {
    const normalizedWhitespace = trimmed.replace(/\s+/g, " ").trim();

    variants.add(normalizedWhitespace);
    variants.add(normalizedWhitespace.replace(/,\s*/g, ", "));

    if (normalizedWhitespace.includes(",")) {
      variants.add(normalizedWhitespace.replace(/,\s*/g, " "));
    }
  }

  if (identifier.kind === "date-of-birth") {
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const shortMonth = String(Number.parseInt(month, 10));
      const shortDay = String(Number.parseInt(day, 10));

      variants.add(`${month}/${day}/${year}`);
      variants.add(`${shortMonth}/${shortDay}/${year}`);
      variants.add(`${month}-${day}-${year}`);
      variants.add(`${shortMonth}-${shortDay}-${year}`);
    }
  }

  if (identifier.kind === "other") {
    const normalizedWords = normalizeLooseWords(trimmed);

    if (normalizedWords) {
      variants.add(normalizedWords);
      variants.add(normalizedWords.replace(/\s+/g, "-"));
      variants.add(normalizedWords.replace(/\s+/g, "_"));
    }

    if (organizationSuffixPattern.test(trimmed)) {
      const stripped = stripOrganizationSuffix(normalizedWords || trimmed);

      if (stripped) {
        variants.add(stripped);
        variants.add(stripped.replace(/\s+/g, "-"));
        variants.add(stripped.replace(/\s+/g, "_"));
      }
    }
  }

  return Array.from(variants)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
}

function buildExplicitIdentifierPatterns(directIdentifiers: ProviderDirectIdentifier[]) {
  return directIdentifiers
    .flatMap((identifier) =>
      buildIdentifierVariants(identifier).map((variant) => ({
        kind: identifier.kind,
        pattern: new RegExp(escapeRegExp(variant), "gi")
      }))
    )
    .sort((left, right) => right.pattern.source.length - left.pattern.source.length);
}

class ProviderPayloadRedactor {
  readonly redactions: ProviderFacingPayloadRedaction[] = [];
  replacementCount = 0;

  private readonly redactionTokenByKey = new Map<string, string>();
  private readonly redactionCountByKind = new Map<ProviderDirectIdentifierKind, number>();
  private readonly explicitIdentifierPatterns: ExplicitIdentifierPattern[];

  constructor(directIdentifiers: ProviderDirectIdentifier[]) {
    this.explicitIdentifierPatterns = buildExplicitIdentifierPatterns(directIdentifiers);
  }

  redactString(input: string) {
    let output = input;

    for (const { kind, pattern } of this.explicitIdentifierPatterns) {
      output = output.replace(pattern, (match) => this.getToken(kind, match));
    }

    for (const { kind, pattern } of fallbackRedactionPatterns) {
      output = output.replace(pattern, (match) => this.getToken(kind, match));
    }

    for (const pattern of [creditCardGroupedPattern, creditCardKeywordPattern]) {
      pattern.lastIndex = 0;
      output = output.replace(pattern, (match, capturedDigits: string | undefined) => {
        const digits = (capturedDigits ?? match).replace(/[\s.-]/g, "");

        if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) {
          return match;
        }

        return this.getToken("other", match);
      });
    }

    return output;
  }

  private getToken(kind: ProviderDirectIdentifierKind, rawValue: string) {
    const normalizedValue = normalizeIdentifier(kind, rawValue);
    const key = `${kind}:${normalizedValue}`;
    const existingToken = this.redactionTokenByKey.get(key);

    if (existingToken) {
      this.replacementCount += 1;
      return existingToken;
    }

    const nextCount = (this.redactionCountByKind.get(kind) ?? 0) + 1;
    const token = `[${kind}-${nextCount}]`;

    this.redactionCountByKind.set(kind, nextCount);
    this.redactionTokenByKey.set(key, token);
    this.redactions.push({ token, kind });
    this.replacementCount += 1;

    return token;
  }
}

function sanitizeProviderPayloadValue<T>(value: T, redactor: ProviderPayloadRedactor): T {
  if (typeof value === "string") {
    return redactor.redactString(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeProviderPayloadValue(item, redactor)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      sanitizeProviderPayloadValue(entryValue, redactor)
    ])
  ) as T;
}

export function redactProviderPayload<T>(
  payload: T,
  options: BuildProviderPayloadOptions = {}
): { payload: T } & ProviderFacingPayloadMetadata {
  const redactor = new ProviderPayloadRedactor(options.directIdentifiers ?? []);

  return {
    payload: sanitizeProviderPayloadValue(payload, redactor),
    redactions: redactor.redactions,
    replacementCount: redactor.replacementCount
  };
}
