import Decimal from "decimal.js";
import type {
  SeededFactId,
  WorkspaceDocumentCoverage,
  WorkspaceDocumentDetectedFactRecord,
  WorkspaceDocumentKind,
  WorkspaceStructuredFactMachineValue1099BTransaction,
  WorkspaceStructuredFactMachineValue1099DivSummary,
  WorkspaceStructuredFactMachineValue1099IntSummary,
  WorkspaceStructuredFactMachineValue1099NecSummary,
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

function extractEmployerName(lines: string[]) {
  const names = lines.flatMap((line, index) => {
    if (!/^(?:c\s+)?Employer'?s name, address, and ZIP code$/i.test(line)) return [];
    const candidate = lines[index + 1]?.trim();
    if (!candidate || /^(?:[a-f](?:\/f)?\s+|\d{1,2}[a-z]?\s+|Employer'?s\s+.*(?:number|EIN)|Employee'?s\s+|Batch\b)/i.test(candidate)) return [];
    return [candidate];
  });
  return new Set(names).size === 1 ? names[0] : null;
}

function extractEmployerEin(text: string) {
  const candidates = [...text.matchAll(/(?:Employer'?s (?:FED ID number|identification number(?: \(EIN\))?)|\bb\s+Employer identification number(?: \(EIN\))?)[ \t]*:?[ \t]*(?:\n[ \t]*)?(\d{2}-?\d{7})(?=\s|$)/gi)].map(match => match[1]);
  const distinct = new Set(candidates.map(value => value.replace(/-/g, "")));
  return distinct.size === 1 ? candidates[0] : null;
}

/** Accept an explicit single-box value or an exact labeled two-column layout. */
function w2SourceAmount(text: string, label: string, grids: Array<{ pattern: RegExp; index: number }> = []): string | undefined {
  const pattern = new RegExp(`(?:^|\\n)[ \\t]*${label}[ \\t]*(?:\\n[ \\t]*)?\\$?[ \\t]*([\\d,]+\\.\\d{2})[ \\t]*(?=\\n|$)`, "gi");
  const values = [...text.matchAll(pattern)].map(match => match[1]);
  for (const grid of grids) values.push(...[...text.matchAll(grid.pattern)].map(match => match[grid.index]));
  const amounts = values.map(normalizeAmount).filter((value): value is string => value !== null);
  return new Set(amounts.map(value => new Decimal(value).toFixed())).size === 1 ? amounts[0] : undefined;
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
  const wageGrid = /(?:^|\n)1\s+Wages, tips, other comp\.\s+2\s+Federal income tax withheld[ \t]*\n[ \t]*([\d,]+\.\d{2})[ \t]+([\d,]+\.\d{2})[ \t]*(?=\n|$)/gi;
  const socialGrid = /(?:^|\n)(?:3\s+Social security wages\s+4\s+Social security tax withheld|3\s+4\s+Social security tax withheld[ \t]*\n[ \t]*Social security wages)[ \t]*\n[ \t]*([\d,]+\.\d{2})[ \t]+([\d,]+\.\d{2})[ \t]*(?=\n|$)/gi;
  const medicareGrid = /(?:^|\n)5\s+Medicare wages(?: and tips)?\s+6\s+Medicare tax withheld[ \t]*\n[ \t]*([\d,]+\.\d{2})[ \t]+([\d,]+\.\d{2})[ \t]*(?=\n|$)/gi;
  const wages = w2SourceAmount(normalizedText, "1\\s+Wages, tips, other comp\\.", [{ pattern: wageGrid, index: 1 }]);
  const federalWithheld = w2SourceAmount(normalizedText, "2\\s+Federal income tax withheld", [{ pattern: wageGrid, index: 2 }]);
  const socialSecurityWages = w2SourceAmount(normalizedText, "3\\s+Social security wages", [{ pattern: socialGrid, index: 1 }]);
  const socialSecurityWithheld = w2SourceAmount(normalizedText, "4\\s+Social security tax withheld", [{ pattern: socialGrid, index: 2 }]);
  const medicareWages = w2SourceAmount(normalizedText, "5\\s+Medicare wages(?: and tips)?", [{ pattern: medicareGrid, index: 1 }]);
  const medicareWithheld = w2SourceAmount(normalizedText, "6\\s+Medicare tax withheld", [{ pattern: medicareGrid, index: 2 }]);
  const socialSecurityTips = w2SourceAmount(normalizedText, "7\\s+Social security tips");
  const box10DependentCareBenefits = w2SourceAmount(normalizedText, "10\\s+Dependent care benefits");
  const stateWages = w2SourceAmount(normalizedText, "16\\s+State wages, tips, etc\\.", [{ pattern: /(?:^|\n)15\s+State Employer'?s state ID no\.?\s+16\s+State wages, tips, etc\.[ \t]*\n[ \t]*[A-Z]{2}[ \t]+[\d-]+[ \t]+([\d,]+\.\d{2})[ \t]*(?=\n|$)/gi, index: 1 }]);
  const stateWithheld = w2SourceAmount(normalizedText, "17\\s+State income tax", [{ pattern: /(?:^|\n)(?:17\s+)?State income tax\s+18\s+Local wages, tips, etc\.[ \t]*\n(?:[ \t]*17[ \t]*\n)?[ \t]*([\d,]+\.\d{2})[ \t]+([\d,]+\.\d{2})[ \t]*(?=\n|$)/gi, index: 1 }]);
  const sourceStates = [...new Set([...normalizedText.matchAll(/^15[ \t]+State(?:[ \t]+Employer['’]?s state ID(?: no\.?| number))?(?:[ \t]+16[^\n]*)?[ \t]*:?[ \t]*(?:\n[ \t]*)?([A-Z]{2})(?=[ \t]|$)/gm)].map((match) => match[1]))];
  const sourceState = sourceStates.length === 1 ? sourceStates[0] : undefined;

  if (wages === undefined && federalWithheld === undefined) {
    return null;
  }

  const machineValue: WorkspaceStructuredFactMachineValueW2Summary = {
    entryKind: "w2-summary",
    sourceFactsVersion: 2,
    employerName,
    employerEin,
    wages: wages ?? "",
    federalWithheld: federalWithheld ?? "",
    ...(socialSecurityWages ? { socialSecurityWages } : {}),
    ...(socialSecurityTips !== undefined ? { socialSecurityTips } : {}),
    ...(box10DependentCareBenefits !== undefined ? { box10DependentCareBenefits } : {}),
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
    coverage: employerName && employerEin && [wages, federalWithheld, socialSecurityWages, socialSecurityTips, box10DependentCareBenefits, socialSecurityWithheld, medicareWages, medicareWithheld, stateWages, stateWithheld].every(value => value !== undefined) && sourceState ? "supported" : "partially-supported",
    label: employerName ? `${employerName} W-2` : "Form W-2 upload",
    notes: "Parsed W-2 wage and withholding boxes from an uploaded W-2 PDF.",
    seededFactIds: ["wages", "withholding"],
    detectedFacts: [
      {
        idSuffix: "parsed-w2-summary",
        factId: "wages",
        label: "Wages",
        value: `Parsed uploaded W-2: ${employerName || "payer identity unconfirmed"} box 1 wages $${wages === undefined ? "unknown" : formatAmountLabel(wages)} and box 2 federal withholding $${federalWithheld === undefined ? "unknown" : formatAmountLabel(federalWithheld)}.`,
        confidence: "high",
        machineValue,
      },
      {
        idSuffix: "parsed-w2-withholding",
        factId: "withholding",
        label: "Federal withholding",
        value: `Parsed uploaded W-2 withholding: box 2 federal income tax withheld $${federalWithheld === undefined ? "unknown" : formatAmountLabel(federalWithheld)}.`,
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

function parseUploaded1099NecText(text: string, fileName = ""): ParsedUploadedDocument | null {
  if (!/1099[- ]?NEC\b/i.test(`${fileName}\n${text}`)) return null;
  const base = {
    kind: "1099-nec" as const,
    coverage: "partially-supported" as const,
    label: "Form 1099-NEC source review",
    notes: "Confirm the actual recipient, source boxes and separate business facts in the guided interview before calculating.",
    seededFactIds: ["nonemployee-compensation", "schedule-c-expense-review"] as SeededFactId[],
  };
  if (sourceFormCount(text, "1099-NEC") > 1) return { ...base, notes: "Multiple Forms 1099-NEC need separate source records and recipient confirmation.", detectedFacts: [] };
  const compensation = sourceBoxAmount(text, "1(?:a)?\\s+Nonemployee [Cc]ompensation");
  if (compensation === undefined) return { ...base, detectedFacts: [] };
  const payer = sourcePayer(text);
  const tins = [...new Set([...text.matchAll(/^Payer(?:'s)?\s+TIN:[ \t]*(\d{2}-?\d{7})\b/gim)].map(match => match[1]))];
  const states = [...new Set([...text.matchAll(/(?:^|\n)[ \t]*6\s+State(?:\/|\s+and\s+)Payer(?:'s)?\s+state\s+(?:no\.?|number)[ \t]*(?:\n[ \t]*)?([A-Z]{2})\b/gi)].map(match => match[1].toUpperCase()))];
  const machineValue: WorkspaceStructuredFactMachineValue1099NecSummary = {
    entryKind: "1099-nec-summary", sourceFactsVersion: 2, payer, nonemployeeCompensation: compensation,
    ...(tins.length === 1 ? { payerTin: tins[0] } : {}),
    ...knownSourceAmounts({ federalWithheld: sourceBoxAmount(text, "4\\s+Federal [Ii]ncome [Tt]ax [Ww]ithheld"), stateWithheld: sourceBoxAmount(text, "5\\s+State [Tt]ax [Ww]ithheld"), stateIncome: sourceBoxAmount(text, "7\\s+State [Ii]ncome") }),
    ...(states.length === 1 ? { state: states[0], stateTaxReporting: "single" as const } : states.length > 1 ? { stateTaxReporting: "multiple" as const } : {}),
  };
  return { ...base, label: payer ? `${payer} 1099-NEC` : base.label, detectedFacts: [{ idSuffix: "parsed-1099-nec-summary", factId: "nonemployee-compensation", label: "Nonemployee compensation source", value: `Parsed actual NEC compensation $${formatAmountLabel(compensation)}; business and recipient facts still require confirmation.`, confidence: "high", machineValue }] };
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
    ?? parseUploaded1099NecText(normalizedText, fileName)
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
