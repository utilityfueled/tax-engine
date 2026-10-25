import Decimal from "decimal.js";
import type {
  SeededFactId,
  WorkspaceDocumentCoverage,
  WorkspaceDocumentDetectedFactRecord,
  WorkspaceDocumentKind,
  WorkspaceStructuredFactMachineValue1099BTransaction,
  WorkspaceStructuredFactMachineValue1099DivSummary,
  WorkspaceStructuredFactMachineValue1099IntSummary,
  WorkspaceStructuredFactMachineValueW2Summary,
} from "@tax-engine/contracts";

export interface ParsedUploadedDocument {
  taxYear?: number | null;
  kind: WorkspaceDocumentKind;
  coverage: WorkspaceDocumentCoverage;
  label: string;
  notes: string;
  seededFactIds: SeededFactId[];
  detectedFacts: WorkspaceDocumentDetectedFactRecord[];
}

export interface PreparedUploadableFile {
  name: string;
  size: number;
  detectedDocument?: ParsedUploadedDocument | null;
}

interface ExtractedTextItem {
  str?: string;
  transform?: number[];
}

let pdfJsPromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
      if (typeof window !== "undefined") {
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url),
          { type: "module" },
        );
      }
      return pdfjs;
    });
  }

  return pdfJsPromise;
}

function groupPageText(items: ExtractedTextItem[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();

  for (const item of items) {
    const text = typeof item.str === "string" ? item.str.trim() : "";

    if (!text) {
      continue;
    }

    const [x = 0, y = 0] = Array.isArray(item.transform)
      ? [item.transform[4] ?? 0, item.transform[5] ?? 0]
      : [0, 0];
    const rowKey = Math.round(y);
    const row = rows.get(rowKey) ?? [];

    row.push({ x, text });
    rows.set(rowKey, row);
  }

  return [...rows.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, row]) => row.sort((left, right) => left.x - right.x).map((entry) => entry.text).join(" "))
    .join("\n");
}

export async function extractPdfTextFromFile(file: File) {
  const pdfjs = await loadPdfJs();
  const buffer = await file.arrayBuffer();
  const data = new Uint8Array(buffer);
  const task = pdfjs.getDocument({ data, useWorkerFetch: false });
  try {
    const pdf = await task.promise;
    const pageTexts: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pageTexts.push(groupPageText(textContent.items as ExtractedTextItem[]));
      page.cleanup();
    }
    return pageTexts.join("\n\n");
  } finally {
    await task.destroy();
  }
}

function normalizeParsingText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u2019/g, "'")
    .replace(/\u2018/g, "'")
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n");
}

function buildLogicalLines(text: string) {
  const rawLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const logicalLines: string[] = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const currentLine = rawLines[index] ?? "";
    const nextLine = rawLines[index + 1] ?? "";

    if (/^\d{1,2}[a-z]?$/i.test(currentLine) && /^[A-Za-z]/.test(nextLine)) {
      logicalLines.push(`${currentLine} ${nextLine}`);
      index += 1;
      continue;
    }

    logicalLines.push(currentLine);
  }

  return logicalLines;
}

function normalizeAmount(value: string) {
  const normalized = value.replace(/[,\s]/g, "").trim();

  return /^\d+(\.\d{2})?$/.test(normalized) ? normalized : null;
}

function formatAmountLabel(value: string) {
  const amount = new Decimal(value);
  if (!amount.isFinite()) return value;
  const [whole, cents] = amount.toFixed(2, Decimal.ROUND_HALF_UP).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
}

function dedupeSeededFactIds(entries: SeededFactId[]) {
  return [...new Set(entries)];
}

function toIsoDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);

  if (!match) {
    return value;
  }

  const [, month, day, year] = match;
  return `20${year}-${month}-${day}`;
}

function extractAccountNumber(text: string) {
  return text.match(/Account Number[:\s]+(\d{4}-\d{4})/i)?.[1] ?? null;
}

function extractAmountByPatterns(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const amount = normalizeAmount(match?.[1] ?? "");

    if (amount) {
      return amount;
    }
  }

  return null;
}

function buildReviewedDocument(
  label: string,
  notes: string,
): ParsedUploadedDocument {
  return {
    kind: "unknown",
    coverage: "reviewed",
    label,
    notes,
    seededFactIds: [],
    detectedFacts: [],
  };
}

function pickMostFrequentAmount(candidates: string[]) {
  if (candidates.length === 0) {
    return null;
  }

  const counts = new Map<string, number>();

  for (const candidate of candidates) {
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }

      return new Decimal(right[0]).comparedTo(left[0]);
    })[0]?.[0] ?? null;
}

function pickLargestAmount(amounts: string[]) {
  if (amounts.length === 0) {
    return null;
  }

  return [...amounts].sort((left, right) => new Decimal(right).comparedTo(left))[0] ?? null;
}

function pickSmallestAmount(amounts: string[]) {
  if (amounts.length === 0) {
    return null;
  }

  return [...amounts].sort((left, right) => new Decimal(left).comparedTo(right))[0] ?? null;
}

function collectAmountsNearLabel(
  text: string,
  labelPattern: RegExp,
  nextLabelPatterns: RegExp[],
  {
    windowLength = 240,
    pickCandidate,
  }: {
    windowLength?: number;
    pickCandidate: (amounts: string[]) => string | null;
  }
) {
  const matches = Array.from(text.matchAll(new RegExp(labelPattern.source, `${labelPattern.flags.includes("g") ? labelPattern.flags : `${labelPattern.flags}g`}`)));
  const candidates: string[] = [];

  for (const match of matches) {
    const start = match.index ?? 0;
    const matchEnd = start + match[0].length;
    let segmentEnd = Math.min(text.length, matchEnd + windowLength);

    for (const pattern of nextLabelPatterns) {
      const nextMatch = pattern.exec(text.slice(matchEnd));

      if (!nextMatch || nextMatch.index === undefined) {
        continue;
      }

      const candidateEnd = matchEnd + nextMatch.index;

      if (candidateEnd > matchEnd && candidateEnd < segmentEnd) {
        segmentEnd = candidateEnd;
      }
    }

    const segment = text.slice(matchEnd, segmentEnd);
    const amounts = [...segment.matchAll(/\b\d[\d,]*\.\d{2}\b/g)]
      .map((entry) => normalizeAmount(entry[0]))
      .filter((entry): entry is string => entry !== null);
    const candidate = pickCandidate(amounts);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return pickMostFrequentAmount(candidates);
}

function extractEmployerName(lines: string[]) {
  const startIndex = lines.findIndex((line) => /Employer'?s name, address, and ZIP code/i.test(line));

  if (startIndex === -1) {
    return null;
  }

  for (let index = startIndex + 1; index < Math.min(lines.length, startIndex + 6); index += 1) {
    const line = lines[index]?.trim();

    if (!line || /^Batch\b/i.test(line) || /^\d+\./.test(line)) {
      continue;
    }

    if (/\d/.test(line) && !/[A-Za-z]/.test(line)) {
      continue;
    }

    return line;
  }

  return null;
}

function extractEmployerEin(text: string) {
  const employerSectionMatch = text.match(/Employer'?s FED ID number([\s\S]{0,120})/i);
  const employerSection = employerSectionMatch?.[1] ?? text;
  const einCandidates = [...employerSection.matchAll(/\b\d{2}-\d{7}\b/g)]
    .map((entry) => entry[0])
    .filter((entry) => !entry.includes("XX"));

  if (einCandidates.length > 0) {
    return einCandidates[0] ?? null;
  }

  return [...text.matchAll(/\b\d{2}-\d{7}\b/g)]
    .map((entry) => entry[0])
    .find((entry) => !entry.includes("XX")) ?? null;
}

function collectAmountsFromLinesAfterLabel(
  lines: string[],
  labelPattern: RegExp,
  nextLabelPatterns: RegExp[],
  maxLookahead = 8,
) {
  const matches: string[][] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (!labelPattern.test(line)) {
      continue;
    }

    const amounts: string[] = [];

    for (
      let lookahead = index + 1;
      lookahead < lines.length && lookahead <= index + maxLookahead;
      lookahead += 1
    ) {
      const candidateLine = lines[lookahead] ?? "";

      if (nextLabelPatterns.some((pattern) => pattern.test(candidateLine))) {
        break;
      }

      const amount = normalizeAmount(candidateLine);

      if (amount) {
        amounts.push(amount);
      }
    }

    if (amounts.length > 0) {
      matches.push(amounts);
    }
  }

  return matches;
}

function pickFirstLineAmount(
  lines: string[],
  labelPattern: RegExp,
  nextLabelPatterns: RegExp[],
  maxLookahead = 8,
) {
  const matches = collectAmountsFromLinesAfterLabel(lines, labelPattern, nextLabelPatterns, maxLookahead);

  for (const amounts of matches) {
    const amount = amounts[0];

    if (amount) {
      return amount;
    }
  }

  return null;
}

function pickLastLineAmount(
  lines: string[],
  labelPattern: RegExp,
  nextLabelPatterns: RegExp[],
  maxLookahead = 8,
) {
  const matches = collectAmountsFromLinesAfterLabel(lines, labelPattern, nextLabelPatterns, maxLookahead);

  for (const amounts of matches) {
    const amount = amounts[amounts.length - 1];

    if (amount) {
      return amount;
    }
  }

  return null;
}

function pickSmallestLineAmount(
  lines: string[],
  labelPattern: RegExp,
  nextLabelPatterns: RegExp[],
  maxLookahead = 8,
) {
  const matches = collectAmountsFromLinesAfterLabel(lines, labelPattern, nextLabelPatterns, maxLookahead);

  for (const amounts of matches) {
    const amount = pickSmallestAmount(amounts);

    if (amount) {
      return amount;
    }
  }

  return null;
}

function parseW2Box1Wages(text: string) {
  const reportedW2Wages = collectAmountsNearLabel(
    text,
    /Reported W-2 Wages/i,
    [/Employer'?s FED ID number/i, /1\s+Wages, tips, other comp\./i],
    {
      pickCandidate: (amounts) => {
        if (amounts.length === 0) {
          return null;
        }

        return pickMostFrequentAmount(amounts);
      },
    }
  );

  if (reportedW2Wages) {
    return reportedW2Wages;
  }

  return collectAmountsNearLabel(
    text,
    /Wages, tips, other comp\./i,
    [/2 Federal income tax withheld/i, /3\s+Social security wages/i],
    {
      pickCandidate: (amounts) => {
        if (amounts.length === 0) {
          return null;
        }

        return pickLargestAmount(amounts);
      },
    }
  );
}

function parseW2Box2FederalWithholding(text: string, wages: string | null) {
  return collectAmountsNearLabel(
    text,
    /2 Federal income tax withheld/i,
    [/4 Social security tax withheld/i, /3\s+Social security wages/i],
    {
      pickCandidate: (amounts) => {
        if (amounts.length === 0) {
          return null;
        }

        if (wages) {
          const filtered = amounts.filter((amount) => amount !== wages);

          if (filtered.length > 0) {
            return filtered[filtered.length - 1] ?? null;
          }
        }

        return amounts[amounts.length - 1] ?? null;
      },
    }
  );
}

export function parseUploadedW2Text(text: string, fileName = ""): ParsedUploadedDocument | null {
  const normalizedText = normalizeParsingText(text);
  const signalText = `${fileName}\n${normalizedText}`;

  if (
    !/w-?2\b/i.test(signalText)
    || !/Federal income tax withheld/i.test(normalizedText)
    || !/Wages, tips, other comp\./i.test(normalizedText)
  ) {
    return null;
  }

  const lines = buildLogicalLines(normalizedText);
  const employerName = extractEmployerName(lines) ?? "";
  const employerEin = extractEmployerEin(normalizedText) ?? "";
  const wages = parseW2Box1Wages(normalizedText);
  const federalWithheld = parseW2Box2FederalWithholding(normalizedText, wages);
  const parsedSocialSecurityWages = pickFirstLineAmount(
    lines,
    /^3\s+Social security wages$/i,
    [/^4\s+Social security tax withheld$/i, /^5\s+Medicare wages(?: and tips)?$/i]
  );
  const socialSecurityWithheld = pickLastLineAmount(
    lines,
    /^4\s+Social security tax withheld$/i,
    [/^5\s+Medicare wages(?: and tips)?$/i, /^6\s+Medicare tax withheld$/i]
  );
  const medicareWages = pickFirstLineAmount(
    lines,
    /^5\s+Medicare wages(?: and tips)?$/i,
    [/^6\s+Medicare tax withheld$/i, /^7\s+Social security tips$/i, /^8\s+Allocated tips$/i]
  );
  const medicareWithheld = pickLastLineAmount(
    lines,
    /^6\s+Medicare tax withheld$/i,
    [/^7\s+Social security tips$/i, /^8\s+Allocated tips$/i, /^10\s+Dependent care benefits$/i]
  );
  const stateWages = collectAmountsNearLabel(
    normalizedText,
    /16\s+State wages, tips, etc\./i,
    [/17\s+State income tax/i, /18\s+Local wages, tips, etc\./i],
    {
      windowLength: 160,
      pickCandidate: (amounts) => pickLargestAmount(amounts),
    }
  ) ?? pickFirstLineAmount(
    lines,
    /16\s+State wages, tips, etc\./i,
    [/^17\s+State income tax$/i, /^18\s+Local wages, tips, etc\./i],
    10,
  );
  const stateWithheld = collectAmountsNearLabel(
    normalizedText,
    /(?:17\s+)?State income tax/i,
    [/18\s+Local wages, tips, etc\./i, /19\s+Local income tax/i, /20\s+Locality name/i],
    {
      windowLength: 160,
      pickCandidate: (amounts) => pickSmallestAmount(amounts),
    }
  ) ?? pickSmallestLineAmount(
    lines,
    /^17\s+State income tax$/i,
    [/^19\s+Local income tax$/i, /^20\s+Locality name$/i],
    10,
  );
  const socialSecurityWages = parsedSocialSecurityWages;
  const sourceStates = [...new Set([...normalizedText.matchAll(/^15[ \t]+State(?:[ \t]+Employer['’]?s state ID(?: no\.?| number))?(?:[ \t]+16[^\n]*)?[ \t]*:?[ \t]*(?:\n[ \t]*)?([A-Z]{2})(?=[ \t]|$)/gm)].map((match) => match[1]))];
  const sourceState = sourceStates.length === 1 ? sourceStates[0] : undefined;

  if (!wages || !federalWithheld) {
    return null;
  }

  const machineValue: WorkspaceStructuredFactMachineValueW2Summary = {
    entryKind: "w2-summary",
    employerName,
    employerEin,
    wages,
    federalWithheld,
    ...(socialSecurityWages ? { socialSecurityWages } : {}),
    ...(socialSecurityWithheld ? { socialSecurityWithheld } : {}),
    ...(medicareWages ? { medicareWages } : {}),
    ...(medicareWithheld ? { medicareWithheld } : {}),
    ...(stateWages ? { stateWages } : {}),
    ...(stateWithheld ? { stateWithheld } : {}),
    ...(sourceState ? { state: sourceState, stateTaxReporting: "single" as const } : sourceStates.length > 1 ? { stateTaxReporting: "multiple" as const } : {}),
  };

  return {
    kind: "w2",
    taxYear: extractExplicitDocumentTaxYear(normalizedText),
    coverage: employerName && employerEin && socialSecurityWages !== null && socialSecurityWithheld !== null && medicareWages !== null && medicareWithheld !== null && sourceState && stateWages !== null && stateWithheld !== null ? "supported" : "partially-supported",
    label: employerName ? `${employerName} W-2` : "Form W-2 upload",
    notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
    seededFactIds: ["wages", "withholding"],
    detectedFacts: [
      {
        idSuffix: "parsed-w2-summary",
        factId: "wages",
        label: "Wages",
        value: `Parsed uploaded W-2: ${employerName || "payer identity unconfirmed"} box 1 wages $${formatAmountLabel(wages)} and box 2 federal withholding $${formatAmountLabel(federalWithheld)}.`,
        confidence: "high",
        machineValue,
      },
      {
        idSuffix: "parsed-w2-withholding",
        factId: "withholding",
        label: "Federal withholding",
        value: `Parsed uploaded W-2 withholding: box 2 federal income tax withheld $${formatAmountLabel(federalWithheld)}.`,
        confidence: "high",
      },
    ],
  };
}

function sourcePayer(text: string): string {
  const names = [...text.matchAll(/^(?:Payer(?:'s)?(?: name)?|Broker(?:'s)?(?: name)?):[ \t]*([^\n]+)$/gim)].map((match) => (match[1] ?? "").trim());
  const distinct = [...new Set(names)];
  return distinct.length === 1 ? (distinct[0] ?? "") : "";
}

function sourceFormCount(text: string, form: string): number {
  return [...text.matchAll(new RegExp(`\\bForm\\s+${form}\\b`, "gi"))].length;
}

/** A missing box cannot borrow a later box's amount. Conflicting copies remain unknown. */
function sourceBoxAmount(text: string, boxLabel: string): string | undefined {
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*${boxLabel}\\s*\\$?\\s*([\\d,]+\\.\\d{2})(?!\\d)`, "gi");
  const amounts = [...text.matchAll(pattern)].map((match) => normalizeAmount(match[1] ?? "")).filter((amount): amount is string => amount !== null);
  const distinct = [...new Set(amounts)];
  return distinct.length === 1 ? distinct[0] : undefined;
}

function sourceFormSection(text: string, form: string): string {
  const header = new RegExp(`\\bForm\\s+${form}\\b`, "i").exec(text);
  if (!header) return "";
  const section = text.slice(header.index + header[0].length);
  const nextHeader = /\bForm\s+1099-[A-Z]+\b/i.exec(section);
  return nextHeader ? section.slice(0, nextHeader.index) : section;
}

function knownSourceAmounts(values: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

function interestSourceFacts(text: string, payer: string): WorkspaceStructuredFactMachineValue1099IntSummary | null {
  const interestIncome = sourceBoxAmount(text, "1\\s+Interest Income");
  if (interestIncome === undefined) return null;
  return { entryKind: "1099-int-summary", sourceFactsVersion: 2, payer, interestIncome, ...knownSourceAmounts({
    earlyWithdrawalPenalty: sourceBoxAmount(text, "2\\s+Early [Ww]ithdrawal [Pp]enalty"),
    federalWithheld: sourceBoxAmount(text, "4\\s+Federal Income Tax Withheld"),
    usSavingsBondInterest: sourceBoxAmount(text, "3\\s+Interest on U\\.S\\. Savings Bonds and Treasury Obligations"),
    taxExemptInterest: sourceBoxAmount(text, "8\\s+Tax[- ]Exempt Interest"),
  }) };
}

function completeInterestSource(entry: WorkspaceStructuredFactMachineValue1099IntSummary): boolean {
  return Boolean(entry.payer) && [entry.earlyWithdrawalPenalty, entry.federalWithheld, entry.usSavingsBondInterest, entry.taxExemptInterest].every((value) => value !== undefined);
}

function parseUploadedComposite1099Text(text: string, fileName = ""): ParsedUploadedDocument | null {
  const normalizedText = normalizeParsingText(text);
  if (!/1099 composite/i.test(`${fileName}\n${normalizedText}`)) return null;
  const payer = sourcePayer(normalizedText);
  const accountNumber = extractAccountNumber(normalizedText);
  const label = `${payer || "Uploaded brokerage"}${accountNumber ? ` ending in ${accountNumber.slice(-4)}` : ""}`;
  const interest = interestSourceFacts(sourceFormSection(normalizedText, "1099-INT"), payer);
  const dividendsText = sourceFormSection(normalizedText, "1099-DIV");
  const ordinaryDividends = sourceBoxAmount(dividendsText, "1a\\s+Total Ordinary Dividends");
  const dividendAmounts = knownSourceAmounts({
    qualifiedDividends: sourceBoxAmount(dividendsText, "1b\\s+Qualified Dividends"),
    capitalGainDistributions: sourceBoxAmount(dividendsText, "2a\\s+Total Capital Gain Distributions"),
    federalWithheld: sourceBoxAmount(dividendsText, "4\\s+Federal Income Tax Withheld"),
    section199ADividends: sourceBoxAmount(dividendsText, "5\\s+Section 199A Dividends"),
    foreignTaxPaid: sourceBoxAmount(dividendsText, "7\\s+Foreign Tax Paid"),
  });
  const totals = sourceFormSection(normalizedText, "1099-B").match(/Total Short-Term \(Cost basis is reported to the IRS\)\s*\$\s*([\d,]+\.\d{2})\s*\$\s*([\d,]+\.\d{2})/i);
  const proceeds = totals ? normalizeAmount(totals[1]) : null;
  const basis = totals ? normalizeAmount(totals[2]) : null;
  const detectedFacts: WorkspaceDocumentDetectedFactRecord[] = [];
  const seededFactIds: SeededFactId[] = [];
  if (interest) {
    seededFactIds.push("taxable-interest");
    detectedFacts.push({ idSuffix: "parsed-composite-interest", factId: "taxable-interest", label: "Taxable interest", value: `Parsed uploaded composite statement: taxable interest $${formatAmountLabel(interest.interestIncome)}. Missing boxes require confirmation.`, confidence: "high", machineValue: interest });
  }
  if (ordinaryDividends !== undefined) {
    const machineValue: WorkspaceStructuredFactMachineValue1099DivSummary = { entryKind: "1099-div-summary", sourceFactsVersion: 2, payer, ordinaryDividends, ...dividendAmounts };
    seededFactIds.push("ordinary-dividends");
    detectedFacts.push({ idSuffix: "parsed-composite-dividends", factId: "ordinary-dividends", label: "Ordinary dividends", value: `Parsed uploaded composite statement: ordinary dividends $${formatAmountLabel(ordinaryDividends)}. Missing dividend boxes require confirmation.`, confidence: "high", machineValue });
    for (const [field, factId, title] of [["qualifiedDividends", "qualified-dividends", "Qualified dividends"], ["capitalGainDistributions", "capital-gain-distributions", "Capital gain distributions"]] as const) {
      if (dividendAmounts[field] === undefined) continue;
      seededFactIds.push(factId);
      detectedFacts.push({ idSuffix: `parsed-composite-${factId}`, factId, label: title, value: `${title} $${formatAmountLabel(dividendAmounts[field])} from the actual dividend section.`, confidence: "high" });
    }
  }
  if (proceeds !== null && basis !== null) {
    seededFactIds.push("broker-proceeds", "cost-basis-review");
    detectedFacts.push({ idSuffix: "parsed-composite-short-term-summary", factId: "broker-proceeds", label: "Broker sale proceeds", value: `Parsed short-term covered summary: proceeds $${formatAmountLabel(proceeds)} and basis $${formatAmountLabel(basis)}. Actual dates and adjustments remain unconfirmed.`, confidence: "high", machineValue: {
      entryKind: "1099-b-transaction", sourceFactsVersion: 2, description: `${label} short-term covered summary`, dateAcquired: "", dateSold: "", proceeds, costBasis: basis, basisReportedToIRS: true, holdingPeriod: "short",
    } });
    detectedFacts.push({ idSuffix: "parsed-composite-cost-basis-review", factId: "cost-basis-review", label: "Cost basis review", value: "The summary reports short-term basis to the IRS; actual transaction dates, adjustments and wash-sale facts require confirmation.", confidence: "high" });
  }
  if (!detectedFacts.length) return null;
  // Repeated form headings may be duplicate copies or separate statements. A
  // single extracted section cannot establish which, or a complete total.
  const unambiguousSections = ["1099-INT", "1099-DIV", "1099-B"].every((form) => sourceFormCount(normalizedText, form) <= 1);
  const complete = unambiguousSections && !proceeds && (!sourceFormCount(normalizedText, "1099-INT") || (interest !== null && completeInterestSource(interest))) && (!sourceFormCount(normalizedText, "1099-DIV") || (ordinaryDividends !== undefined && payer !== "" && Object.keys(dividendAmounts).length === 5));
  return { kind: proceeds !== null ? "1099-b" : ordinaryDividends !== undefined ? "1099-div" : "1099-int", coverage: complete ? "supported" : "partially-supported", label: `${label} composite tax statement`, notes: "Parsed only explicitly labeled source fields; missing boxes, payer identity and transaction details require confirmation.", seededFactIds: dedupeSeededFactIds(seededFactIds), detectedFacts };
}

function parseUploaded1099IntText(text: string, fileName = ""): ParsedUploadedDocument | null {
  const normalizedText = normalizeParsingText(text);
  const signalText = `${fileName}\n${normalizedText}`;
  if (!/1099-?int\b/i.test(signalText) || /1099 composite/i.test(signalText)) return null;
  const machineValue = interestSourceFacts(normalizedText, sourcePayer(normalizedText));
  if (!machineValue) return null;
  return { kind: "1099-int", coverage: completeInterestSource(machineValue) && sourceFormCount(normalizedText, "1099-INT") <= 1 ? "supported" : "partially-supported", label: `${machineValue.payer || "Uploaded"} 1099-INT`, notes: "Parsed actual labeled interest boxes; missing payer identity or boxes require confirmation.", seededFactIds: ["taxable-interest"], detectedFacts: [{ idSuffix: "parsed-1099-int-summary", factId: "taxable-interest", label: "Taxable interest", value: `Parsed uploaded 1099-INT: taxable interest $${formatAmountLabel(machineValue.interestIncome)}.`, confidence: "high", machineValue }] };
}

function parseUploaded1099DAText(text: string, fileName = ""): ParsedUploadedDocument | null {
  const normalizedText = normalizeParsingText(text);
  const signalText = `${fileName}\n${normalizedText}`;

  if (!/1099-?da\b/i.test(signalText)) {
    return null;
  }

  const assetMatch = normalizedText.match(/\b([A-Z0-9]{2,10})\s*\/\s*([A-Z0-9]{4,})\b/);
  const assetName = assetMatch?.[1] ?? "";
  const longTerm = /\bLong[- ]Term Transactions\b/i.test(normalizedText);
  const shortTerm = /\bShort[- ]Term Transactions\b/i.test(normalizedText);
  const holdingPeriod = longTerm !== shortTerm ? (longTerm ? "long" : "short") : undefined;
  const notReported = /cost basis (?:is|was) not reported to the IRS/i.test(normalizedText);
  const reported = /cost basis (?:is|was) reported to the IRS/i.test(normalizedText);
  const basisReportedToIRS = reported !== notReported ? reported : undefined;
  const rowPattern = /(\d{2}\/\d{2}\/\d{2})\s+[0-9.]+\s+([0-9]+\.[0-9]{2})\s+(\d{2}\/\d{2}\/\d{2})\s+([0-9]+\.[0-9]{2})\s+(-?[0-9]+\.[0-9]{2})/g;
  const detectedFacts: WorkspaceDocumentDetectedFactRecord[] = [];
  const transactions = [...normalizedText.matchAll(rowPattern)];

  for (const [index, match] of transactions.entries()) {
    const rowAsset = [...normalizedText.slice(0, match.index).matchAll(/\b([A-Z0-9]{2,10})\s*\/\s*([A-Z0-9]{4,})\b/g)].at(-1)?.[1] ?? "";
    const dateSold = toIsoDate(match[1] ?? "");
    const proceeds = normalizeAmount(match[2] ?? "");
    const dateAcquired = toIsoDate(match[3] ?? "");
    const costBasis = normalizeAmount(match[4] ?? "");

    if (!proceeds || !costBasis || !dateSold || !dateAcquired) {
      continue;
    }

    const machineValue: WorkspaceStructuredFactMachineValue1099BTransaction = {
      entryKind: "1099-b-transaction",
      sourceFactsVersion: 2,
      description: rowAsset,
      dateAcquired,
      dateSold,
      proceeds,
      costBasis,
      ...(basisReportedToIRS === undefined ? {} : { basisReportedToIRS }),
      ...(holdingPeriod === undefined ? {} : { holdingPeriod }),
      digitalAsset: true,
    };

    detectedFacts.push({
      idSuffix: `parsed-1099-da-transaction-${index + 1}`,
      factId: "broker-proceeds",
      label: "Digital asset sale",
      value: `Parsed uploaded 1099-DA: ${assetName} sold ${dateSold} for $${formatAmountLabel(proceeds)} with basis $${formatAmountLabel(costBasis)}.`,
      confidence: "high",
      machineValue,
    });
  }

  if (detectedFacts.length === 0) {
    const summaryProceeds = extractAmountByPatterns(normalizedText, [
      /Coinbase\s+Long\s+\$\s*([\d,]+\.\d{2})\s+\$\s*[\d,]+\.\d{2}\s+-?\$?\s*[\d,]+\.\d{2}/i,
      /Total¹?\s+\$\s*([\d,]+\.\d{2})\s+\$\s*[\d,]+\.\d{2}\s+-?\$?\s*[\d,]+\.\d{2}/i,
    ]);
    const summaryBasis = extractAmountByPatterns(normalizedText, [
      /Coinbase\s+Long\s+\$\s*[\d,]+\.\d{2}\s+\$\s*([\d,]+\.\d{2})\s+-?\$?\s*[\d,]+\.\d{2}/i,
      /Total¹?\s+\$\s*[\d,]+\.\d{2}\s+\$\s*([\d,]+\.\d{2})\s+-?\$?\s*[\d,]+\.\d{2}/i,
    ]);

    if (!summaryProceeds || !summaryBasis) {
      return null;
    }

    detectedFacts.push({
      idSuffix: "parsed-1099-da-summary",
      factId: "broker-proceeds",
      label: "Digital asset sale",
      value: `Parsed uploaded 1099-DA summary: proceeds $${formatAmountLabel(summaryProceeds)} and basis $${formatAmountLabel(summaryBasis)}.`,
      confidence: "high",
      machineValue: {
        entryKind: "1099-b-transaction",
        sourceFactsVersion: 2,
        description: assetName,
        dateAcquired: "",
        dateSold: "", // Unknown summary sale dates must not become year-end dates.
        proceeds: summaryProceeds,
        costBasis: summaryBasis,
        ...(basisReportedToIRS === undefined ? {} : { basisReportedToIRS }),
        ...(holdingPeriod === undefined ? {} : { holdingPeriod }),
        digitalAsset: true,
      },
    });
  }

  detectedFacts.push({
    idSuffix: "parsed-1099-da-cost-basis-review",
    factId: "cost-basis-review",
    label: "Cost basis review",
    value: "Confirm actual basis reporting, holding period, adjustments and wash-sale treatment from the source transaction records.",
    confidence: "high",
  });

  return {
    kind: "1099-da",
    coverage: "partially-supported",
    label: "Uploaded 1099-DA",
    notes: "Parsed digital asset rows or totals. Summary-only amounts require actual transaction dates and review before calculation.",
    seededFactIds: ["broker-proceeds", "cost-basis-review"],
    detectedFacts,
  };
}

export function extractExplicitDocumentTaxYear(text: string): number | null {
  const years = new Set<number>();
  for (const pattern of [/\b(?:tax\s+year|(?:for\s+)?calendar\s+year)\s*[:-]?\s*(20\d{2})\b/gi, /\b(20\d{2})\s+(?:Form\s+)?(?:W-?2|1099-[A-Z]+|1098-[A-Z]+|1095-[A-Z]+)\b/gi]) {
    for (const match of text.matchAll(pattern)) years.add(Number(match[1]));
  }
  return years.size === 1 ? [...years][0] : null;
}

export function parseUploadedDocumentText(text: string, fileName = ""): ParsedUploadedDocument | null {
  const normalizedText = normalizeParsingText(text);
  const signalText = `${fileName}\n${normalizedText}`;

  const parsed = parseUploadedW2Text(normalizedText, fileName)
    ?? parseUploadedComposite1099Text(normalizedText, fileName)
    ?? parseUploaded1099IntText(normalizedText, fileName)
    ?? parseUploaded1099DAText(normalizedText, fileName)
    ?? (/1095.?c/i.test(signalText)
      ? buildReviewedDocument(
          "Form 1095-C reviewed",
          "Employer health-coverage statements were reviewed. Form 1095-C does not create a deterministic federal tax input for this return and no additional engine mapping is required."
        )
      : null)
    ?? ((/amex/i.test(signalText) && /year.?end summary/i.test(signalText))
      ? buildReviewedDocument(
          "Amex year-end summary reviewed",
          "Card year-end summaries were reviewed as bookkeeping support only. Viva still requires Schedule C expenses to be confirmed explicitly in the guided self-employment flow."
        )
      : null)
    ?? ((/capital one/i.test(signalText) && /year.?end summary/i.test(signalText))
      ? buildReviewedDocument(
          "Capital One year-end summary reviewed",
          "Bank year-end summaries were reviewed as supplemental records only. The actual 1099-INT should be used for deterministic interest income."
        )
      : null);
  return parsed ? { ...parsed, taxYear: extractExplicitDocumentTaxYear(normalizedText) } : null;
}

export async function prepareUploadableFiles(files: File[]): Promise<PreparedUploadableFile[]> {
  if (files.length === 0) {
    return [];
  }

  const detections = await Promise.all(files.map((file) => detectUploadedDocumentFromFile(file)));

  return files.map((file, index) => ({
    name: file.name,
    size: file.size,
    detectedDocument: detections[index] ?? null,
  }));
}

export async function detectUploadedDocumentFromFile(
  file: File,
): Promise<ParsedUploadedDocument | null> {
  const looksLikePdf = /\.pdf$/i.test(file.name) || /pdf/i.test(file.type || "");
  const looksLikeImage = /^image\//i.test(file.type || "");

  if (!looksLikePdf && !looksLikeImage) {
    return null;
  }

  if (looksLikeImage) {
    return {
      kind: "unknown",
      coverage: "unsupported",
      label: "Unclassified image upload",
      notes: "Image uploads stay local until we have a fully local OCR and redaction flow.",
      seededFactIds: [],
      detectedFacts: [],
    };
  }

  try {
    const extractedText = await extractPdfTextFromFile(file);
    return parseUploadedDocumentText(extractedText, file.name);
  } catch {
    return null;
  }
}
