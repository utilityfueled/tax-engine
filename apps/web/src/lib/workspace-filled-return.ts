import {assertNoPAMarriedPaperExport,isPAMarriedOrdinaryReturnResult} from '@/engine/state/pa-return-result';
import {calculatePAMarriedOrdinaryReturn} from '@/engine/state/pa-married-ordinary-return';
import {preparePAMarriedReturnReview} from '@/pdf/pa-married-return-review-context';
import { prepareOhioResidencyReview } from "@/engine/state/oh-residency-source.js";
import {preparePARoyaltyReview} from "@/pdf/pa-royalty-review-context.js";
import { preparePAWorkingCreditReview } from "@/pdf/pa-working-credit-review-context.js";
import { hasInKindEducationReviewSources, prepareEducationReview } from "@/pdf/education-review-context.js";
import { hasSavingsBondReviewSources, prepareSavingsBondReview } from "@/pdf/savings-bond-review-context.js";
import { buildGuidedOhioOverlay, buildGuidedStateOriginals } from "./guided-state-engine-inputs";
import "server-only";
import Decimal from "decimal.js";

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ReturnWorkspaceRecord } from "@tax-engine/contracts";
import {
  TaxYearInputSchema,
  type TaxYearInput,
} from "@/models/inputs.js";
import { supportedStates } from "@/lib/guided-interview-flow";
import { calculateFederalTax } from "@/engine/federal.js";
import { calculatePAOrdinaryReturn } from "@/engine/state/pa-ordinary-return.js";
import { preparePAOrdinaryReturnReview, isPAOrdinaryReturnResult } from "@/pdf/pa-ordinary-return-review-context.js";
import { fillReturn } from "@/pdf/fill-return.js";
import { redactReviewIdentifiers } from "@/pdf/redact-review-identifiers.js";
import { prepareForm8949Review } from "@/pdf/form-8949-review-context.js";
import { prepareCodNolReview } from "@/pdf/cod-nol-review-context.js";
import { prepareNolFilingUnitReview, requiresNolFilingUnitReview } from "@/pdf/nol-filing-unit-review-context.js";
import { prepareCharitableReview, requiresCharitableNolReview, requiresCharitableFilingHistoryReview } from "@/pdf/charitable-review-context.js";
import { hasHistoricalAdoptionSources, prepareAdoptionReview } from "@/pdf/adoption-review-context.js";
import { hasScheduleEReviewSources, prepareScheduleEReview } from "@/pdf/schedule-e-review-context.js";
import { prepareQbiLossReview } from "@/pdf/qbi-loss-review-context.js";
import { hasEicReviewSources, prepareEicReview } from "@/pdf/eic-review-context.js";
import { hasPremiumTaxCreditReviewSources, preparePremiumTaxCreditReview } from "@/pdf/premium-tax-credit-review-context.js";
import { fillOhioReferenceForms } from "@/pdf/fill-oh-reference-forms.js";
import { loadPdfDocumentQuietly } from "@/pdf/pdf-utils.js";
import { assertPdfExportAllowed, markReviewPdf, REVIEW_PDF_NOTICE } from "@/pdf/export-policy.js";
import {
  buildTaxInputFromGuidedData,
} from "@/lib/guided-interview-bridge";
import type { GuidedFlowState } from "@/lib/guided-interview-flow";
import { assessReturnReadiness } from "@/utils/return-readiness.js";

export interface WorkspaceFilledReturnDownload {
  fileName: string;
  contents: Uint8Array;
  includedForms: string[];
}

export interface WorkspaceFilledReturnSource {
  mode: "guided-interview" | "workspace-preview";
}

const LETTER_PAGE_WIDTH = 612;
const LETTER_PAGE_HEIGHT = 792;
const PAGE_MARGIN = 42;
const STATE_PACKET_PDF_CODES = new Set(["IL", "NJ", "NY", "OH", "PA"]);
const NO_INCOME_TAX_STATES = new Set([
  "AK",
  "FL",
  "NV",
  "NH",
  "SD",
  "TN",
  "TX",
  "WA",
  "WY",
]);
const STATE_NAME_FALLBACKS = new Map<string, string>(
  supportedStates.map((state) => [state.code, state.name] as const)
);
const FORM_LABELS: Record<string, string> = {
  "f1040-filled.pdf": "Form 1040",
  "f8997-reference-filled.pdf": "Form 8997 Reference",
  "f1040s1-filled.pdf": "Schedule 1",
  "f1040s2-filled.pdf": "Schedule 2",
  "f1040s3-filled.pdf": "Schedule 3",
  "f1040sa-filled.pdf": "Schedule A",
  "f1040sb-filled.pdf": "Schedule B",
  "f1040sc-filled.pdf": "Schedule C",
  "f1040sd-filled.pdf": "Schedule D",
  "f1040se-filled.pdf": "Schedule E",
  "f1040sf-filled.pdf": "Schedule F",
  "f1040sj-filled.pdf": "Schedule J",
  "f1040sse-filled.pdf": "Schedule SE",
  "f1040s8-filled.pdf": "Schedule 8812",
  "f1040sei-filled.pdf": "Schedule EIC",
  "f2210-filled.pdf": "Form 2210",
  "f2441-filled.pdf": "Form 2441",
  "f4684-filled.pdf": "Form 4684",
  "f4797-filled.pdf": "Form 4797",
  "f4952-filled.pdf": "Form 4952",
  "f5329-filled.pdf": "Form 5329",
  "f5695-filled.pdf": "Form 5695",
  "f6251-filled.pdf": "Form 6251",
  "f8582-filled.pdf": "Form 8582",
  "f8606-filled.pdf": "Form 8606",
  "f8880-filled.pdf": "Form 8880",
  "f8889-filled.pdf": "Form 8889",
  "f8949-filled.pdf": "Form 8949",
  "f8959-filled.pdf": "Form 8959",
  "f8960-filled.pdf": "Form 8960",
  "f8995-filled.pdf": "Form 8995",
  "qbi-loss-reference-filled.pdf": "QBI loss sources and carryforwards",
  "oh-it-1040-reference.pdf": "Ohio IT 1040 (reference summary)",
  "oh-schedule-adjustments-reference.pdf": "Ohio Schedule of Adjustments (reference summary)",
  "oh-it-bus-reference.pdf": "Ohio Schedule of Business Income (reference summary)",
  "oh-schedule-of-withholding-reference.pdf": "Ohio Schedule of Withholding (reference summary)",
  "oh-schedule-credits-reference.pdf": "Ohio Schedule of Credits (reference summary)",
  "oh-resident-credit-reference.pdf": "Ohio Resident Credit (reference summary)",
  "oh-it-sd-2210-reference.pdf": "Ohio IT/SD 2210 (reference summary)",
  "oh-sd-100-reference.pdf": "Ohio SD 100 (reference summary)",
  "il-1040-filled.pdf": "Illinois IL-1040",
  "nj-1040-filled.pdf": "New Jersey NJ-1040",
  "ny-it201-filled.pdf": "New York IT-201",
  "pa-40-filled.pdf": "Pennsylvania PA-40",
  "pa-joint-40-review.pdf": "Joint Pennsylvania PA-40",
  "pa-joint-sp-review.pdf": "Joint Pennsylvania Schedule SP",
  "pa-primary-40-review.pdf": "Primary Pennsylvania PA-40",
  "pa-primary-sp-review.pdf": "Primary Pennsylvania Schedule SP",
  "pa-spouse-40-review.pdf": "Spouse Pennsylvania PA-40",
  "pa-spouse-sp-review.pdf": "Spouse Pennsylvania Schedule SP",
  "pa-schedule-a-reference.pdf": "Pennsylvania Schedule A (reference summary)",
  "pa-schedule-b-reference.pdf": "Pennsylvania Schedule B (reference summary)",
  "pa-schedule-c-reference.pdf": "Pennsylvania Schedule C (reference summary)",
  "pa-schedule-f-reference.pdf": "Pennsylvania Schedule F (reference summary)",
  "pa-schedule-j-reference.pdf": "Pennsylvania Schedule J (reference summary)",
  "pa-schedule-nrh-reference.pdf": "Pennsylvania Schedule NRH (reference summary)",
  "pa-schedule-sp-reference.pdf": "Pennsylvania Schedule SP (reference summary)",
  "pa-schedule-t-reference.pdf": "Pennsylvania Schedule T (reference summary)",
  "pa-schedule-dc-reference.pdf": "Pennsylvania Schedule DC (reference summary)",
  "pa-schedule-g-l-reference.pdf": "Pennsylvania Schedule G-L (reference summary)",
  "pa-local-eit-reference.pdf": "Pennsylvania local EIT (reference summary)",
};

interface PacketSummary {
  headline: string;
  compiledBullets: string[];
  missingBullets: string[];
}

function sanitizeFileToken(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "return";
}

async function resolveBlankFormsDir() {
  const candidates = [
    join(process.cwd(), "forms", "blank"),
    join(process.cwd(), "..", "forms", "blank"),
    join(process.cwd(), "..", "..", "forms", "blank"),
  ];

  for (const candidate of candidates) {
    try {
      await stat(join(candidate, "2025", "f1040.pdf"));
      return candidate;
    } catch {
      // Try the next possible workspace root.
    }
  }

  throw new Error("Could not locate the blank PDF form templates.");
}

async function mergePdfFiles(pdfPaths: string[]) {
  const merged = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const bytes = await readFile(pdfPath);
    const source = await loadPdfDocumentQuietly(bytes);
    await markReviewPdf(source);
    const pages = await merged.copyPages(source, source.getPageIndices());

    for (const page of pages) {
      merged.addPage(page);
    }
  }

  merged.setSubject(REVIEW_PDF_NOTICE);
  return merged.save();
}

function formatCurrencyWholeDollars(value: Decimal) {
  const rounded = value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const digits = rounded.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${rounded.isNegative() ? "-" : ""}$${digits}`;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const [firstWord, ...restWords] = words;
  const lines: string[] = [];
  let currentLine = firstWord ?? "";

  for (const word of restWords) {
    const candidate = `${currentLine} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  lines.push(currentLine);
  return lines;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  {
    font,
    size,
    x,
    y,
    maxWidth,
    lineHeight = size * 1.25,
    color = rgb(0.1, 0.1, 0.1),
  }: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    maxWidth: number;
    lineHeight?: number;
    color?: ReturnType<typeof rgb>;
  },
) {
  const lines = wrapText(text, font, size, maxWidth);
  let cursorY = y;

  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cursorY,
      font,
      size,
      color,
    });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function drawBulletList(
  page: PDFPage,
  bullets: string[],
  {
    font,
    size,
    x,
    y,
    maxWidth,
    nextPage,
    freshBodyY,
    bulletGap = 14,
    bulletColor = rgb(0.13, 0.13, 0.13),
  }: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    maxWidth: number;
    nextPage: () => { page: PDFPage; y: number };
    freshBodyY: number;
    bulletGap?: number;
    bulletColor?: ReturnType<typeof rgb>;
  },
) {
  let activePage = page;
  let cursorY = y;
  const lineHeight = size * 1.35;
  const continuePage = () => {
    const continued = nextPage();
    activePage = continued.page;
    cursorY = continued.y;
  };

  for (const bullet of bullets) {
    const lines = wrapText(bullet, font, size, maxWidth - bulletGap);
    const lastLineOffset = lineHeight * (lines.length - 1);
    // Keep a whole bullet together when it fits a fresh page. Only a bullet
    // longer than a fresh body is split, at its existing wrapped line breaks.
    if (cursorY - lastLineOffset < PAGE_MARGIN
      && freshBodyY - lastLineOffset >= PAGE_MARGIN) {
      continuePage();
    }
    let needsBullet = true;
    for (const line of lines) {
      if (cursorY < PAGE_MARGIN) {
        continuePage();
        needsBullet = true;
      }
      if (needsBullet) {
        activePage.drawText("•", {
          x, y: cursorY, font, size, color: bulletColor,
        });
        needsBullet = false;
      }
      activePage.drawText(line, {
        x: x + bulletGap,
        y: cursorY,
        font,
        size,
        color: bulletColor,
      });
      cursorY -= lineHeight;
    }
    cursorY -= 6;
  }

  return { page: activePage, y: cursorY };
}

function resolveStateCode(
  workspace: ReturnWorkspaceRecord,
  taxInput: TaxYearInput,
  guidedFlowState?: GuidedFlowState | null,
) {
  const stateCode = guidedFlowState ? guidedFlowState.segmentation.stateCode : taxInput.taxpayer.address.state ?? null;
  if (!stateCode) {
    return null;
  }

  return stateCode.trim().toUpperCase();
}

function resolveStateName(stateCode: string) {
  try {
    const displayNames = new Intl.DisplayNames(["en-US"], { type: "region" });
    const resolvedName = displayNames.of(stateCode);
    if (resolvedName && resolvedName !== stateCode) {
      return resolvedName;
    }

    return STATE_NAME_FALLBACKS.get(stateCode) ?? stateCode;
  } catch {
    return STATE_NAME_FALLBACKS.get(stateCode) ?? stateCode;
  }
}

function formatIncludedForms(includedForms: string[]) {
  const labels = includedForms.map((form) => FORM_LABELS[form] ?? form.replace(/-filled\.pdf$/i, ""));
  if (labels.length <= 6) {
    return labels.join(", ");
  }

  return `${labels.slice(0, 6).join(", ")}, and ${labels.length - 6} more`;
}

function buildPacketSummary(
  workspace: ReturnWorkspaceRecord,
  taxInput: TaxYearInput,
  result: ReturnType<typeof calculateFederalTax>,
  includedForms: string[],
  source: WorkspaceFilledReturnSource,
  guidedFlowState?: GuidedFlowState | null,
): PacketSummary {
  const missingChecklistItems = workspace.checklist
    .filter((item) => item.status !== "ready")
    .map((item) => item.label);
  const stateCode = resolveStateCode(workspace, taxInput, guidedFlowState);
  const stateName = stateCode ? resolveStateName(stateCode) : null;
  const includedStateForm = includedForms.some((form) => {
    const prefix = form.split("-")[0]?.toUpperCase() ?? "";
    return STATE_PACKET_PDF_CODES.has(prefix);
  });
  const isSelectedStatePacketUnsupported =
    stateCode !== null
    && !NO_INCOME_TAX_STATES.has(stateCode)
    && !includedStateForm;
  const compiledBullets = [
    `Built from ${
      source.mode === "guided-interview"
        ? "guided interview answers"
        : "workspace preview facts"
    } for tax year ${taxInput.taxpayer.taxYear}.`,
    `This packet includes ${includedForms.length} filled form${includedForms.length === 1 ? "" : "s"}: ${formatIncludedForms(includedForms)}.`,
    `Documents reviewed for this workspace: ${workspace.documents.length}; manual-review uploads still open: ${workspace.summary.pendingReviewDocuments}.`,
    result.refund.gt(0)
      ? `Current federal estimate shows a refund of ${formatCurrencyWholeDollars(result.refund)}.`
      : result.amountOwed.gt(0)
        ? `Current federal estimate shows a balance due of ${formatCurrencyWholeDollars(result.amountOwed)}.`
        : "Current federal estimate is effectively balanced with no refund or balance due.",
    "Social Security numbers are intentionally redacted from this PDF packet.",
  ];
  const missingBullets: string[] = [
    "This software is experimental and not a substitute for a preparer review, filing software validation, or legal/tax advice.",
    "Verify every line, schedule, payment, withholding amount, and filing obligation before relying on this packet.",
  ];

  if(isPAMarriedOrdinaryReturnResult(result.stateReturns?.pennsylvania)){
    compiledBullets.push(`Owned Pennsylvania review pages: ${formatIncludedForms(includedForms.filter(form=>/^pa-(joint|primary|spouse)-(40|sp)-review\.pdf$/.test(form)))}.`);
    compiledBullets.push(result.stateReturns.pennsylvania.filingMode==='M'
      ?'The two owned Pennsylvania returns keep each person’s tax, payments and requested refund separate. The federal return is one actual household.'
      :'The owned joint Pennsylvania review uses the same actual federal household.');
    missingBullets.push('Filing and separate local returns remain unqualified. Review each actual owned PA40 and Schedule SP page with its original source documents.');
  }

  if (isSelectedStatePacketUnsupported && stateName) {
    missingBullets.push(
      `No filled ${stateName} state forms are included in this packet. Treat any state output as incomplete reference material until it is verified separately.`
    );
  }

  if (workspace.summary.interviewQuestionsRemaining > 0) {
    missingBullets.push(
      `${workspace.summary.interviewQuestionsRemaining} interview question${workspace.summary.interviewQuestionsRemaining === 1 ? "" : "s"} still remain unanswered.`
    );
  }

  for (const checklistLabel of missingChecklistItems.slice(0, 4)) {
    missingBullets.push(`Checklist item still not ready: ${checklistLabel}.`);
  }

  for (const reviewNote of workspace.seededReturn.reviewNotes.slice(0, 4)) {
    missingBullets.push(reviewNote);
  }

  if (source.mode === "workspace-preview") {
    missingBullets.push(
      "This packet was built from workspace preview facts instead of a completed guided interview, so some filing details may still be missing."
    );
  }

  if (result.form2210?.waiver) {
    missingBullets.push(`This return requests an estimated tax penalty waiver. The IRS decides, and may bill the penalty. Attach ${result.form2210.farmerMethod ? "Form 2210-F" : "Form 2210"} and your statement.`);
  }

  if (result.form2210?.scheduleAi && result.form2210.requiresForm2210) {
    missingBullets.push("This return uses the annualized income method, so Form 2210 with Schedule AI must be filed with it even when the penalty is zero. Neither is attached to this draft.");
  }

  if (result.form2210?.farmerMethod && result.form2210.requiresForm2210 && !result.form2210.waiver) {
    missingBullets.push("Form 2210-F must be filed with this return because the joint filing status changed. It is not attached to this draft.");
  }

  if (result.estimatedTaxPenalty.gt(0)) {
    missingBullets.push(
      `The return currently includes an estimated tax penalty of ${formatCurrencyWholeDollars(result.estimatedTaxPenalty)}, but ${result.form2210?.farmerMethod ? "Form 2210-F" : "Form 2210"} is not auto-attached to this draft packet.`
    );
  }

  return {
    headline: "SUMMARY OF THIS REVIEW PACKET",
    compiledBullets,
    missingBullets,
  };
}

function attachPennsylvaniaReturn(
  taxInput: TaxYearInput,
  result: ReturnType<typeof calculateFederalTax>,
  stateCode: string | null,
) {
  if (stateCode !== "PA") return result;
  if(taxInput.paMarriedOrdinarySources!==undefined){
    return {...result,stateReturns:{...(result.stateReturns??{}),
      pennsylvania:calculatePAMarriedOrdinaryReturn(taxInput,taxInput.paMarriedOrdinarySources)}};
  }
  assertNoPAMarriedPaperExport(taxInput,result.stateReturns?.pennsylvania);
  return {...result,stateReturns:{...(result.stateReturns??{}),
    pennsylvania:calculatePAOrdinaryReturn(taxInput,taxInput.paOrdinaryReturnFacts,taxInput.paOrdinaryReturnCompletionSources)}};
}

async function buildReturnSummaryCoverPage(summary: PacketSummary) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const warningColor = rgb(0.62, 0.19, 0.14);
  const borderColor = rgb(0.16, 0.16, 0.16);
  const lightPanel = rgb(0.98, 0.95, 0.88);
  const sectionPage = (continued: boolean, section: string, color: ReturnType<typeof rgb>) => {
    const page = doc.addPage([LETTER_PAGE_WIDTH, LETTER_PAGE_HEIGHT]);
    let y = LETTER_PAGE_HEIGHT - PAGE_MARGIN;
    const warningPanelHeight = 142;
    const warningPanelBottom = y - warningPanelHeight;

    page.drawRectangle({
      x: PAGE_MARGIN,
      y: warningPanelBottom,
      width: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2,
      height: warningPanelHeight,
      color: lightPanel,
      borderColor,
      borderWidth: 2,
    });

    y = drawWrappedText(page, "EXPERIMENTAL TAX RETURN REFERENCE", {
      font: bold,
      size: 20,
      x: PAGE_MARGIN + 16,
      y: y - 30,
      maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 32,
      lineHeight: 24,
      color: warningColor,
    });
    y = drawWrappedText(page, "DO NOT SUBMIT AS-IS", {
      font: bold,
      size: 18,
      x: PAGE_MARGIN + 16,
      y: y - 8,
      maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 32,
      lineHeight: 22,
      color: borderColor,
    });
    y = drawWrappedText(
      page,
      "This packet is an experimental reference copy only. It may omit required filing forms, elections, adjustments, or supporting schedules.",
      {
        font: regular,
        size: 10.5,
        x: PAGE_MARGIN + 16,
        y: y - 12,
        maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 32,
        lineHeight: 14,
        color: borderColor,
      }
    );
    drawWrappedText(
      page,
      "Review every page independently before relying on any value in this packet.",
      {
        font: regular,
        size: 10.5,
        x: PAGE_MARGIN + 16,
        y: y - 6,
        maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 32,
        lineHeight: 14,
        color: borderColor,
      }
    );

    y = warningPanelBottom - 24;
    y = drawWrappedText(page, continued ? `${summary.headline} (CONTINUED)` : summary.headline, {
      font: bold,
      size: 15,
      x: PAGE_MARGIN,
      y,
      maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 18,
      color: borderColor,
    });
    y = drawWrappedText(
      page,
      "The summary below is generated from structured return data and should be treated as a starting point for review, not a filing certification.",
      {
        font: regular,
        size: 10.5,
        x: PAGE_MARGIN,
        y: y - 6,
        maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 14,
        color: borderColor,
      }
    );

    y -= 18;
    y = drawWrappedText(page, section, {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y,
      maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
      color,
    });
    return { page, y: y - 8 };
  };
  const first = sectionPage(false, "What was compiled", borderColor);
  const compiled = drawBulletList(first.page, summary.compiledBullets, {
    font: regular,
    size: 10.5,
    x: PAGE_MARGIN + 2,
    y: first.y,
    maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 2,
    freshBodyY: first.y,
    nextPage: () => sectionPage(true, "What was compiled", borderColor),
  });

  let missingPage = compiled.page;
  let missingY = compiled.y - 8;
  const firstMissingLines = wrapText(summary.missingBullets[0] ?? "", regular, 10.5,
    LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 2 - 14);
  // A section heading stays with its first whole bullet when that bullet fits
  // a fresh body; an overlong first bullet still keeps at least its first line.
  const firstMissingOffset = Math.min(10.5 * 1.35 * (firstMissingLines.length - 1),
    first.y - PAGE_MARGIN);
  if (missingY - 16 - 8 - firstMissingOffset < PAGE_MARGIN) {
    const continued = sectionPage(true, "What may be missing or still needs review", warningColor);
    missingPage = continued.page;
    missingY = continued.y;
  } else {
    missingY = drawWrappedText(missingPage, "What may be missing or still needs review", {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y: missingY,
      maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
      color: warningColor,
    }) - 8;
  }
  drawBulletList(missingPage, summary.missingBullets, {
    font: regular,
    size: 10.5,
    x: PAGE_MARGIN + 2,
    y: missingY,
    maxWidth: LETTER_PAGE_WIDTH - PAGE_MARGIN * 2 - 2,
    bulletColor: borderColor,
    freshBodyY: first.y,
    nextPage: () => sectionPage(true, "What may be missing or still needs review", warningColor),
  });

  return doc.save();
}

function buildTaxInputFromGuidedInterview(guidedFlowState: GuidedFlowState | null | undefined) {
  if (!guidedFlowState) {
    return null;
  }

  const stateSources=guidedFlowState.sectionData["state-return"];
  const marriedSources=stateSources?.paMarriedOrdinarySources!==undefined;
  if(guidedFlowState.segmentation.stateCode==="PA"&&!marriedSources&&(!stateSources?.paOrdinaryReturnFacts||!stateSources?.paOrdinaryReturnCompletionSources)){
    throw new Error("Complete the actual Pennsylvania ordinary and completion source packets before exporting a review PDF.");
  }
  const rawInput = buildTaxInputFromGuidedData(guidedFlowState);

  if (!rawInput) {
    return null;
  }

  return buildGuidedStateOriginals(TaxYearInputSchema.parse(rawInput), guidedFlowState);
}

function resolveFilledReturnTaxInput(
  workspace: ReturnWorkspaceRecord,
  guidedFlowState?: GuidedFlowState | null
) {
  if (!guidedFlowState) throw new Error("Complete the required taxpayer facts in the guided interview before exporting a review PDF.");
  if (guidedFlowState.taxYear == null || guidedFlowState.taxYear !== workspace.returnSummary.targetTaxYear) {
    throw new Error("Confirm the interview year and make it agree with the workspace before exporting.");
  }
  const guidedTaxInput = buildTaxInputFromGuidedInterview(guidedFlowState);
  if (!guidedTaxInput) throw new Error("Complete the required taxpayer facts before exporting.");

  if (guidedTaxInput) {
    return {
      source: { mode: "guided-interview" } satisfies WorkspaceFilledReturnSource,
      taxInput: guidedTaxInput,
    };
  }


}

export async function buildWorkspaceFilledReturnDownload(
  workspace: ReturnWorkspaceRecord,
  guidedFlowState?: GuidedFlowState | null
): Promise<WorkspaceFilledReturnDownload> {
  assertPdfExportAllowed(workspace.returnSummary.targetTaxYear ?? 0, workspace.returnSummary.targetTaxYear ?? 0);
  const resolved = resolveFilledReturnTaxInput(workspace, guidedFlowState);

  if (!resolved) {
    throw new Error("Could not build the structured return input from this workspace.");
  }

  const stateCode = resolveStateCode(workspace, resolved.taxInput, guidedFlowState);
  const completeResult = attachPennsylvaniaReturn(
    resolved.taxInput,
    calculateFederalTax(resolved.taxInput),
    stateCode,
  );
  // Identity participates in household matching and state worksheets. Keep it
  // intact through calculation, then redact only copies passed to renderers.
  const capitalGainReview = prepareForm8949Review(resolved.taxInput);
  const codNolReview = resolved.taxInput.form982NolSources ? prepareCodNolReview(resolved.taxInput) : undefined;
  const nolFilingUnitReview = requiresNolFilingUnitReview(resolved.taxInput, completeResult) ? prepareNolFilingUnitReview(resolved.taxInput) : undefined;
  const charitableReview = resolved.taxInput.charitableCarryoverSources || resolved.taxInput.k1CharitableSources || requiresCharitableNolReview(resolved.taxInput, completeResult) || requiresCharitableFilingHistoryReview(resolved.taxInput, completeResult)
    ? prepareCharitableReview(resolved.taxInput) : undefined;
  const adoptionReview = hasHistoricalAdoptionSources(resolved.taxInput) ? prepareAdoptionReview(resolved.taxInput) : undefined;
  const scheduleEReview = hasScheduleEReviewSources(resolved.taxInput) ? prepareScheduleEReview(resolved.taxInput) : undefined;
  const paMarriedReview=isPAMarriedOrdinaryReturnResult(completeResult.stateReturns?.pennsylvania)
    ?preparePAMarriedReturnReview(resolved.taxInput):undefined;
  const paRoyaltyReview = !paMarriedReview && resolved.taxInput.royaltyPropertySources && completeResult.stateReturns?.pennsylvania ? preparePARoyaltyReview(resolved.taxInput) : undefined;
  const paOrdinaryReview=completeResult.stateReturns?.pennsylvania&&isPAOrdinaryReturnResult(completeResult.stateReturns.pennsylvania)
    ? preparePAOrdinaryReturnReview(resolved.taxInput):undefined;
  const paWorkingCreditReview = completeResult.stateReturns?.pennsylvania && !paMarriedReview && !paOrdinaryReview && !resolved.taxInput.paNonresidentReturn
    ? preparePAWorkingCreditReview(resolved.taxInput) : undefined;
  const qbiLossReview = resolved.taxInput.qbiLossSources ? prepareQbiLossReview(resolved.taxInput) : undefined;
  const eicReview = hasEicReviewSources(resolved.taxInput) ? prepareEicReview(resolved.taxInput) : undefined;
  const premiumTaxCreditReview = hasPremiumTaxCreditReviewSources(resolved.taxInput) ? preparePremiumTaxCreditReview(resolved.taxInput) : undefined;
  const educationReview = hasInKindEducationReviewSources(resolved.taxInput) ? prepareEducationReview(resolved.taxInput) : undefined;
  const savingsBondReview = hasSavingsBondReviewSources(resolved.taxInput) ? prepareSavingsBondReview(resolved.taxInput) : undefined;
  const ohioOriginalReview = stateCode === "OH" ? prepareOhioResidencyReview(resolved.taxInput) : undefined;
  const ohioSourceOverlay = stateCode === "OH" ? buildGuidedOhioOverlay(resolved.taxInput, guidedFlowState, completeResult.taxExemptInterest) : undefined;
  const redactedTaxInput = redactReviewIdentifiers(resolved.taxInput);
  const result = redactReviewIdentifiers(completeResult);
  const blankFormsDir = await resolveBlankFormsDir();
  const tempRoot = await mkdtemp(join(tmpdir(), "tax-engine-filled-return-"));
  const outputDir = join(tempRoot, "filled");

  try {
    await mkdir(outputDir, { recursive: true });
    const fillResult = await fillReturn(redactedTaxInput, result, {
      capitalGainReview,
      codNolReview,
      charitableReview,
      nolFilingUnitReview,
      adoptionReview,
      qbiLossReview,
      scheduleEReview,
      paRoyaltyReview,
      paWorkingCreditReview,
      paOrdinaryReview,
      paMarriedReview,
      eicReview,
      premiumTaxCreditReview,
      educationReview,
      savingsBondReview,
      blankFormsDir,
      outputDir,
      flatten: true,
      // These files are read once for the final compressed download, then removed.
      useObjectStreams: false,
      pageOnlyTemporaryMerge: true,
    });
    const filledForms = [...fillResult.filledForms];

    if (stateCode === "OH") {
      const ohioReferencePacket = await fillOhioReferenceForms(
        redactedTaxInput,
        result,
        outputDir,
        ohioSourceOverlay,
        ohioOriginalReview,
        blankFormsDir,
      );
      filledForms.push(...ohioReferencePacket.filledForms);
    }

    const includedForms = filledForms.map((path) => basename(path));
    const packetSummary = buildPacketSummary(
      workspace,
      redactedTaxInput,
      result,
      includedForms,
      resolved.source,
      guidedFlowState,
    );
    const readiness = assessReturnReadiness({
      taxInput: redactedTaxInput,
      federalResult: result,
      includedForms,
      stateCode,
    });
    packetSummary.compiledBullets.push(
      `Packet completeness status: ${readiness.packetCompleteness}.`,
      `Line calculation status: ${readiness.lineCompleteness}.`,
      `E-file and business-rule validation: ${readiness.businessRuleValidation}.`,
    );
    packetSummary.missingBullets.push(...readiness.findings);
    const coverPagePdf = await buildReturnSummaryCoverPage(packetSummary);
    const coverPagePath = join(outputDir, "00-experimental-summary-cover.pdf");
    await writeFile(coverPagePath, coverPagePdf);
    const mergedPdf = await mergePdfFiles([coverPagePath, ...filledForms]);
    const yearToken = workspace.returnSummary.targetTaxYear?.toString() ?? "draft";

    return {
      fileName: `${sanitizeFileToken(workspace.id)}-${yearToken}-review-return.pdf`,
      contents: mergedPdf,
      includedForms,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
