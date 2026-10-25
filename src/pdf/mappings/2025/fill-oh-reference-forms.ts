import { assertPdfExportAllowed } from "../../export-policy.js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { TaxYearInput } from "@/models/inputs.js";
import type { CalculatedLine, TaxReturnResult } from "@/models/outputs.js";
import {
  buildOhioResidentReturnInput,
  extractOhioWithholding,
  extractQualifyingBusinessIncome,
  type OhioOverlayInput,
} from "@/engine/state/oh-input-adapter.js";
import {
  calculateOhioResidentReturn,
} from "@/engine/state/oh-return.js";
import {
  calculateOhioLumpSumDistributionCredit,
} from "@/engine/state/oh-lump-sum-distribution-credit.js";
import {
  calculateOhioScheduleOfWithholding,
} from "@/engine/state/oh-schedule-of-withholding.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export interface OhioReferencePacketResult {
  filledForms: string[];
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = words[0] ?? "";

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  lines.push(current);
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
    color = HEADER_COLOR,
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
    page.drawText(line, { x, y: cursorY, font, size, color });
    cursorY -= lineHeight;
  }

  return cursorY;
}

function formatValue(line: CalculatedLine) {
  return line.value.toString();
}

async function createReferencePdf(
  {
    title,
    subtitle,
    fileName,
    lines,
  }: {
    title: string;
    subtitle: string;
    fileName: string;
    lines: CalculatedLine[];
  },
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };

  y = drawWrappedText(page, title, {
    font: bold,
    size: 20,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 24,
  });

  y = drawWrappedText(page, "REFERENCE SUMMARY ONLY", {
    font: bold,
    size: 12,
    x: PAGE_MARGIN,
    y: y - 6,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
    color: WARNING_COLOR,
  });

  y = drawWrappedText(page, subtitle, {
    font: regular,
    size: BODY_FONT_SIZE,
    x: PAGE_MARGIN,
    y: y - 8,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 14,
  });

  y = drawWrappedText(
    page,
    "This page is a deterministic summary of computed Ohio lines for review. It is not an official filled Ohio filing form.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 10,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 16;

  for (const line of lines) {
    if (y < 90) {
      newPage();
    }

    y = drawWrappedText(page, `Line ${line.line}: ${line.description}`, {
      font: bold,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    });

    y = drawWrappedText(page, `Value: ${formatValue(line)}`, {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y = drawWrappedText(page, `Formula: ${line.formula}`, {
      font: regular,
      size: BODY_FONT_SIZE - 0.5,
      x: PAGE_MARGIN + 12,
      y: y - 2,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
      lineHeight: 13,
    });

    y -= 6;
  }

  const filePath = join(outputDir, fileName);
  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, await doc.save());
  return filePath;
}

function shouldIncludeAdjustments(
  lines: ReturnType<typeof calculateOhioResidentReturn>["scheduleOfAdjustments"],
) {
  return lines.line14_totalAdditions.gt(0) || lines.line47_totalDeductions.gt(0);
}

function shouldIncludeScheduleOfCredits(
  result: ReturnType<typeof calculateOhioResidentReturn>["scheduleOfCredits"],
) {
  return result.line40_totalNonrefundableCredits.gt(0) || result.line47_totalRefundableCredits.gt(0);
}

function getLumpSumDistributionWorksheet(
  ohioInput: ReturnType<typeof buildOhioResidentReturnInput>,
) {
  if (
    ohioInput.lumpSumDistributionCredit !== undefined
    || !ohioInput.lumpSumDistributionRecipientAges
    || ohioInput.lumpSumDistributionRecipientAges.length === 0
  ) {
    return null;
  }

  return calculateOhioLumpSumDistributionCredit({
    taxYear: ohioInput.taxYear,
    recipientAges: ohioInput.lumpSumDistributionRecipientAges,
  });
}

export async function fillOhioReferenceForms(
  taxInput: TaxYearInput,
  federalResult: TaxReturnResult,
  outputDir: string,
  overlay: OhioOverlayInput = {},
): Promise<OhioReferencePacketResult> {
  assertPdfExportAllowed(taxInput.taxpayer.taxYear, federalResult.taxYear);
  const ohioInput = buildOhioResidentReturnInput(taxInput, federalResult, overlay);
  const ohioResult = calculateOhioResidentReturn(ohioInput);
  const itBusResult = extractQualifyingBusinessIncome(
    federalResult,
    taxInput.scheduleK1 ?? [],
    overlay.otherBusinessIncome,
  );
  const withholdingResult = calculateOhioScheduleOfWithholding({
    w2s: taxInput.w2s,
    formW2Gs: taxInput.formW2G,
    form1099Gs: taxInput.form1099G,
    form1099Ks: taxInput.form1099K,
    form1099Rs: taxInput.form1099R,
    form1099Necs: taxInput.form1099Nec,
    form1099Miscs: taxInput.form1099Misc,
  });
  const lumpSumDistributionWorksheet = getLumpSumDistributionWorksheet(ohioInput);

  const filledForms: string[] = [];

  filledForms.push(
    await createReferencePdf(
      {
        title: "Ohio IT 1040",
        subtitle: "Ohio individual income tax return summary",
        fileName: "oh-it-1040-reference.pdf",
        lines: ohioResult.it1040.lines,
      },
      outputDir,
    ),
  );

  if (shouldIncludeAdjustments(ohioResult.scheduleOfAdjustments)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Adjustments",
          subtitle: "Additions and deductions to federal AGI",
          fileName: "oh-schedule-adjustments-reference.pdf",
          lines: ohioResult.scheduleOfAdjustments.lines,
        },
        outputDir,
      ),
    );
  }

  if (itBusResult.line6_totalQualifyingBusinessIncome.gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Business Income",
          subtitle: "Qualifying business income breakdown",
          fileName: "oh-it-bus-reference.pdf",
          lines: itBusResult.lines,
        },
        outputDir,
      ),
    );
  }

  const additionalWithholding = extractOhioWithholding(
    taxInput.w2s,
    taxInput.formW2G,
    taxInput.form1099G,
    taxInput.form1099K,
    taxInput.form1099R,
    taxInput.form1099Nec,
    taxInput.form1099Misc,
  );
  const totalWithholding = overlay.ohioWithholdingOverride ?? additionalWithholding;

  if (withholdingResult.line6_totalOhioWithholding.gt(0) || Number(totalWithholding) > 0) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Withholding",
          subtitle: "Ohio withholding support for IT 1040 line 14",
          fileName: "oh-schedule-of-withholding-reference.pdf",
          lines: withholdingResult.lines,
        },
        outputDir,
      ),
    );
  }

  if (shouldIncludeScheduleOfCredits(ohioResult.scheduleOfCredits)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Schedule of Credits",
          subtitle: "Nonrefundable and refundable Ohio credit summary",
          fileName: "oh-schedule-credits-reference.pdf",
          lines: ohioResult.scheduleOfCredits.lines,
        },
        outputDir,
      ),
    );
  }

  if (ohioResult.scheduleOfCredits.lumpSumRetirementWorksheet?.line6_totalCredit.gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Lump Sum Retirement Credit Worksheet",
          subtitle: "Ohio Schedule of Credits line 3 worksheet summary",
          fileName: "oh-lump-sum-retirement-credit-reference.pdf",
          lines: ohioResult.scheduleOfCredits.lumpSumRetirementWorksheet.lines,
        },
        outputDir,
      ),
    );
  }

  if (lumpSumDistributionWorksheet?.line3_totalCredit.gt(0)) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Lump Sum Distribution Credit Worksheet",
          subtitle: "Ohio Schedule of Credits line 5 worksheet summary",
          fileName: "oh-lump-sum-distribution-credit-reference.pdf",
          lines: lumpSumDistributionWorksheet.lines,
        },
        outputDir,
      ),
    );
  }

  if (ohioResult.residentCredit) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio Resident Credit",
          subtitle: "Taxes paid to other states",
          fileName: "oh-resident-credit-reference.pdf",
          lines: ohioResult.residentCredit.lines,
        },
        outputDir,
      ),
    );
  }

  if (ohioResult.itsd2210) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio IT/SD 2210",
          subtitle: "Underpayment of estimated tax summary",
          fileName: "oh-it-sd-2210-reference.pdf",
          lines: ohioResult.itsd2210.lines,
        },
        outputDir,
      ),
    );
  }

  if (ohioResult.sd100) {
    filledForms.push(
      await createReferencePdf(
        {
          title: "Ohio SD 100",
          subtitle: "School district income tax return summary",
          fileName: "oh-sd-100-reference.pdf",
          lines: ohioResult.sd100.lines,
        },
        outputDir,
      ),
    );
  }

  return { filledForms };
}
