import type {
  ProviderDirectIdentifier,
  ProviderDirectIdentifierKind,
  ReturnWorkspaceRecord
} from "@tax-engine/contracts";
import type { TaxYearInput } from "../../../src/models/inputs";

const workspaceSlugPattern = /(?:^|[^a-z0-9])(?:workspace|return)[-_]([a-z]+(?:[._-][a-z]+)+)(?=$|[^a-z0-9])/gi;
const filenameNamePattern = /(?:^|[^a-z0-9])([a-z]+(?:[._-][a-z]+)+)(?=[._-](?:\d{3}[-_]?\d{2}[-_]?\d{4}|\d{9}))(?=$|[^a-z0-9])/gi;
const emailPattern = /\b([A-Z0-9._%+-]+)@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const personNameContextPatterns = [
  /(?:Uploaded by|Call|Contact|Reach|Verify)\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g,
  /Mail(?: [^.\n]*?)? to\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g,
  /\b([A-Z][a-z]+(?: [A-Z][a-z]+)+)\s+(?:confirmed|answered|matches|uses)\b/g,
  /\bdependent\s+([A-Z][a-z]+(?: [A-Z][a-z]+)+)\b/g
] as const;
const organizationContextPatterns = [
  /\b([A-Z][A-Z&'.-]+(?:\s+[A-Z][A-Z&'.-]+){0,5}\s+(?:LLC|INC|CORP|CORPORATION|COMPANY|CO|GROUP|BANK|HOLDINGS|PARTNERS|PARTNERSHIP|ASSOCIATES|SERVICES|TECHNOLOGIES|SYSTEMS|CAPITAL|ADVISORS|CONSULTING))\b/g,
  /\b([A-Z][a-zA-Z&'.-]+(?:\s+[A-Z][a-zA-Z&'.-]+){0,5}\s+(?:LLC|Inc|Corp|Corporation|Company|Group|Bank|Holdings|Partners|Partnership|Associates|Services|Technologies|Systems|Capital|Advisors|Consulting))\b/g
] as const;
const ignoredNameTokens = new Set([
  "and",
  "at",
  "bank",
  "basis",
  "benefits",
  "broker",
  "call",
  "capital",
  "contact",
  "copy",
  "dependent",
  "details",
  "div",
  "doc",
  "document",
  "engine",
  "end",
  "export",
  "fixture",
  "form",
  "from",
  "follow",
  "int",
  "interview",
  "irs",
  "local",
  "mail",
  "mock",
  "note",
  "pdf",
  "provider",
  "question",
  "request",
  "return",
  "review",
  "sample",
  "scan",
  "statement",
  "statement",
  "summary",
  "summary",
  "tax",
  "training",
  "upload",
  "uploaded",
  "workspace",
  "w2",
  "wage",
  "year"
]);
const businessNameHintTokens = new Set([
  "advisors",
  "associates",
  "bank",
  "capital",
  "company",
  "consulting",
  "corp",
  "corporation",
  "group",
  "holdings",
  "inc",
  "llc",
  "partners",
  "services",
  "systems",
  "technologies"
]);
const documentMarkerTokens = new Set([
  "1095",
  "1098",
  "1099",
  "1099b",
  "1099div",
  "1099int",
  "1099nec",
  "1099oid",
  "1099r",
  "1099sa",
  "1095a",
  "1098e",
  "pdf",
  "w2"
]);

function normalizeIdentifier(kind: ProviderDirectIdentifierKind, value: string) {
  const trimmed = value.trim();

  switch (kind) {
    case "person-name":
      return trimmed.toLowerCase().replace(/[\s_-]+/g, " ").replace(/[^\p{L}\p{N} ]/gu, "");
    case "ssn":
    case "phone":
    case "postal-code":
      return trimmed.replace(/\D+/g, "");
    case "email":
      return trimmed.toLowerCase();
    default:
      return trimmed.toLowerCase().replace(/\s+/g, " ");
  }
}

function appendIdentifier(
  identifiers: ProviderDirectIdentifier[],
  dedupeKeys: Set<string>,
  kind: ProviderDirectIdentifierKind,
  value: string | undefined
) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return;
  }

  const dedupeKey = `${kind}:${normalizeIdentifier(kind, trimmed)}`;

  if (dedupeKeys.has(dedupeKey)) {
    return;
  }

  dedupeKeys.add(dedupeKey);
  identifiers.push({ kind, value: trimmed });
}

function appendPersonIdentifiers(
  identifiers: ProviderDirectIdentifier[],
  dedupeKeys: Set<string>,
  person: {
    firstName: string;
    lastName: string;
    ssn: string;
    dateOfBirth: string;
  }
) {
  appendIdentifier(
    identifiers,
    dedupeKeys,
    "person-name",
    `${person.firstName} ${person.lastName}`
  );
  appendIdentifier(identifiers, dedupeKeys, "ssn", person.ssn);
  appendIdentifier(identifiers, dedupeKeys, "date-of-birth", person.dateOfBirth);
}

function toTitleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}

function formatSlugNameCandidate(value: string) {
  const tokens = value
    .split(/[._-]+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => /^[a-z]{2,}$/.test(token) && !ignoredNameTokens.has(token));

  if (tokens.length < 2 || tokens.length > 4) {
    return null;
  }

  return tokens.map((token) => toTitleCase(token)).join(" ");
}

function formatContextNameCandidate(value: string) {
  const tokens = value
    .trim()
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);

  while (tokens.length > 0) {
    const firstToken = tokens[0];

    if (!firstToken || !ignoredNameTokens.has(firstToken.toLowerCase())) {
      break;
    }

    tokens.shift();
  }

  if (tokens.length < 2 || tokens.length > 4) {
    return null;
  }

  if (!tokens.every((token) => /^[A-Z][a-z]+$/.test(token))) {
    return null;
  }

  return tokens.join(" ");
}

function formatOrganizationCandidate(value: string) {
  const candidate = value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}&'. -]/gu, "")
    .trim();

  if (!candidate) {
    return null;
  }

  const tokens = candidate
    .split(/\s+/)
    .map((token) => token.replace(/[^A-Za-z&'.-]/g, ""))
    .filter(Boolean);

  if (tokens.length === 0 || tokens.length > 6) {
    return null;
  }

  return tokens.join(" ");
}

function formatDocumentIdentifierCandidate(value: string) {
  const cleaned = value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  const rawTokens = cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const filteredTokens = rawTokens.filter((token) => {
    const normalized = token.toLowerCase();

    if (/^\d+$/.test(token)) {
      return false;
    }

    if (ignoredNameTokens.has(normalized) || documentMarkerTokens.has(normalized)) {
      return false;
    }

    if (normalized.startsWith("1099") || normalized.startsWith("1095") || normalized.startsWith("1098")) {
      return false;
    }

    return /[a-z]/i.test(token);
  });

  if (filteredTokens.length === 0 || filteredTokens.length > 4) {
    return null;
  }

  const looksBusinessLike = filteredTokens.length === 1
    || filteredTokens.some((token) => businessNameHintTokens.has(token.toLowerCase()));

  if (!looksBusinessLike) {
    return null;
  }

  return filteredTokens
    .map((token) => toTitleCase(token))
    .join(" ");
}

function collectWorkspaceStrings(value: unknown, seen = new Set<object>()): string[] {
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
    return value.flatMap((entry) => collectWorkspaceStrings(entry, seen));
  }

  return Object.values(value).flatMap((entry) => collectWorkspaceStrings(entry, seen));
}

function appendWorkspaceNameCandidates(
  identifiers: ProviderDirectIdentifier[],
  dedupeKeys: Set<string>,
  value: string
) {
  for (const pattern of [workspaceSlugPattern, filenameNamePattern]) {
    pattern.lastIndex = 0;

    for (const match of value.matchAll(pattern)) {
      const candidate = formatSlugNameCandidate(match[1] ?? "");

      if (candidate) {
        appendIdentifier(identifiers, dedupeKeys, "person-name", candidate);
      }
    }
  }

  emailPattern.lastIndex = 0;

  for (const match of value.matchAll(emailPattern)) {
    const candidate = formatSlugNameCandidate(match[1] ?? "");

    if (candidate) {
      appendIdentifier(identifiers, dedupeKeys, "person-name", candidate);
    }
  }

  for (const pattern of personNameContextPatterns) {
    pattern.lastIndex = 0;

    for (const match of value.matchAll(pattern)) {
      const candidate = formatContextNameCandidate(match[1] ?? "");

      if (candidate) {
        appendIdentifier(identifiers, dedupeKeys, "person-name", candidate);
      }
    }
  }

  for (const pattern of organizationContextPatterns) {
    pattern.lastIndex = 0;

    for (const match of value.matchAll(pattern)) {
      const candidate = formatOrganizationCandidate(match[1] ?? "");

      if (candidate) {
        appendIdentifier(identifiers, dedupeKeys, "other", candidate);
      }
    }
  }

  if (/\.(?:pdf|png|jpe?g)\b/i.test(value) || /\b(?:w-?2|1095|1098|1099|statement|summary|invoice)\b/i.test(value)) {
    const candidate = formatDocumentIdentifierCandidate(value);

    if (candidate) {
      appendIdentifier(identifiers, dedupeKeys, "other", candidate);
    }
  }
}

export function collectProviderDirectIdentifiersFromTaxInput(
  input: TaxYearInput
): ProviderDirectIdentifier[] {
  const identifiers: ProviderDirectIdentifier[] = [];
  const dedupeKeys = new Set<string>();

  appendPersonIdentifiers(identifiers, dedupeKeys, input.taxpayer.primary);

  if (input.taxpayer.spouse) {
    appendPersonIdentifiers(identifiers, dedupeKeys, input.taxpayer.spouse);
  }

  for (const dependent of input.taxpayer.dependents) {
    appendPersonIdentifiers(identifiers, dedupeKeys, dependent);
  }

  const street = input.taxpayer.address.street.trim();
  const apt = input.taxpayer.address.apt?.trim();

  appendIdentifier(identifiers, dedupeKeys, "street-address", street);

  if (apt) {
    appendIdentifier(identifiers, dedupeKeys, "street-address", `${street} ${apt}`);
    appendIdentifier(identifiers, dedupeKeys, "street-address", `${street}, ${apt}`);
  }

  appendIdentifier(identifiers, dedupeKeys, "postal-code", input.taxpayer.address.zip);

  return identifiers;
}

export function collectProviderDirectIdentifiersFromWorkspace(
  workspace: ReturnWorkspaceRecord
): ProviderDirectIdentifier[] {
  const identifiers: ProviderDirectIdentifier[] = [];
  const dedupeKeys = new Set<string>();

  for (const value of collectWorkspaceStrings(workspace)) {
    appendWorkspaceNameCandidates(identifiers, dedupeKeys, value);
  }

  return identifiers;
}
