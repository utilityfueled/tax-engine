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
import type { TaxReturnResult } from "@/models/outputs.js";
import { d, sum } from "@/utils/decimal.js";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const PAGE_MARGIN = 40;
const BODY_FONT_SIZE = 10;
const HEADER_COLOR = rgb(0.16, 0.16, 0.16);
const WARNING_COLOR = rgb(0.62, 0.19, 0.14);

export const SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME =
  "social-security-benefits-worksheet-reference-filled.pdf";

export interface SocialSecurityBenefitsWorksheetReferenceLine {
  line: string;
  description: string;
  value: string;
  formula: string;
}

export interface SocialSecurityBenefitsWorksheetReferenceSection {
  heading: string;
  lines: SocialSecurityBenefitsWorksheetReferenceLine[];
}

export interface SocialSecurityBenefitsWorksheetReferenceSummary {
  title: string;
  warningLabel: string;
  sections: SocialSecurityBenefitsWorksheetReferenceSection[];
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

const WORKSHEET_LINE_METADATA = [
  ["line1", "1", "Total Social Security benefits", "Sum SSA-1099 Box 5 and RRB-1099 tier 1 equivalent Box 5 benefits"],
  ["line2", "2", "One-half of benefits", "Line 1 / 2"],
  ["line3", "3", "Other income included in provisional income", "Form 1040 income other than Social Security benefits"],
  ["line4", "4", "Tax-exempt interest", "Form 1040 Line 2a"],
  ["line5", "5", "Subtotal before adjustments", "Line 2 + Line 3 + Line 4"],
  ["line6", "6", "Adjustments added back for provisional income", "Supported Schedule 1 add-back categories"],
  ["line7", "7", "Provisional income", "Line 5 - Line 6"],
  ["line8", "8", "Base amount", "Single/HOH/QSS or MFS living apart threshold"],
  ["line9", "9", "Excess over base amount", "max(0, Line 7 - Line 8)"],
  ["line10", "10", "Second-tier width", "Single/HOH/QSS width"],
  ["line11", "11", "Excess over second-tier width", "max(0, Line 9 - Line 10)"],
  ["line12", "12", "Lower-tier amount subject to 50% inclusion", "min(Line 9, Line 10)"],
  ["line13", "13", "Half of the lower-tier amount", "Line 12 / 2"],
  ["line14", "14", "50% inclusion amount", "min(Line 2, Line 13)"],
  ["line15", "15", "85% of the upper-tier excess", "Line 11 x 85%"],
  ["line16", "16", "Tentative taxable benefits", "Line 14 + Line 15"],
  ["line17", "17", "Maximum taxable benefits", "Line 1 x 85%"],
  ["line18", "18", "Taxable Social Security benefits", "min(Line 16, Line 17)"],
] as const;

function shouldIncludeLumpSumSection(result: NonNullable<TaxReturnResult["socialSecurityBenefitsWorksheet"]>) {
  return result.lumpSumElectionTaxableBenefits !== undefined;
}

export function buildSocialSecurityBenefitsWorksheetReferenceSummary(
  input: TaxYearInput,
  result: TaxReturnResult,
): SocialSecurityBenefitsWorksheetReferenceSummary {
  const worksheet = result.socialSecurityBenefitsWorksheet;
  if (!worksheet) {
    throw new Error(
      "Social Security Benefits Worksheet reference summary requires result.socialSecurityBenefitsWorksheet",
    );
  }

  const ssaBenefits = sum(...(input.formSSA1099 ?? []).map((form) => d(form.netBenefits)));
  const rrbBenefits = sum(
    ...(input.formRRB1099 ?? []).map((form) => d(form.netSocialSecurityEquivalentBenefitPortion)),
  );

  const sections: SocialSecurityBenefitsWorksheetReferenceSection[] = [
    {
      heading: "Benefit inputs",
      lines: [
        {
          line: "SSA-1099",
          description: "SSA-1099 Box 5 net benefits",
          value: ssaBenefits.toString(),
          formula: "Sum of supported SSA-1099 Box 5 net benefits",
        },
        {
          line: "RRB-1099",
          description: "RRB-1099 Box 5 tier 1 equivalent benefits",
          value: rrbBenefits.toString(),
          formula: "Sum of supported RRB-1099 Box 5 tier 1 equivalent benefits",
        },
        {
          line: "1040-6a",
          description: "Form 1040 Line 6a gross benefits",
          value: result.socialSecurityBenefitsGross.toString(),
          formula: "SSA-1099 total + RRB-1099 total",
        },
      ],
    },
    {
      heading: "Social Security Benefits Worksheet",
      lines: WORKSHEET_LINE_METADATA.map(([key, line, description, formula]) => ({
        line,
        description,
        value: worksheet[key].toString(),
        formula,
      })),
    },
  ];

  if (shouldIncludeLumpSumSection(worksheet)) {
    sections.push({
      heading: "Pub. 915 lump-sum election",
      lines: [
        {
          line: "standard",
          description: "Standard worksheet taxable benefits",
          value: worksheet.standardTaxableBenefits.toString(),
          formula: "Social Security Benefits Worksheet Line 18 before the election comparison",
        },
        {
          line: "W4-21",
          description: "Pub. 915 Worksheet 4 taxable benefits",
          value: worksheet.lumpSumElectionTaxableBenefits!.toString(),
          formula: "Current-year Worksheet 4 taxable benefits plus earlier-year Worksheet 2 additions",
        },
        {
          line: "used",
          description: "Election used on Form 1040 Line 6b",
          value: worksheet.usedLumpSumElection ? "Yes" : "No",
          formula: "Election used only when it is lower than the standard worksheet amount",
        },
        ...worksheet.lumpSumElectionAdditionalBenefitsByYear.flatMap((entry) => ([
          {
            line: `W2-21 (${entry.taxYear}) refigured`,
            description: "Earlier-year refigured taxable benefits",
            value: entry.refiguredTaxableBenefits.toString(),
            formula: "Pub. 915 Worksheet 2 refigured earlier-year taxable benefits",
          },
          {
            line: `W2-21 (${entry.taxYear}) additional`,
            description: "Earlier-year additional taxable benefits",
            value: entry.additionalTaxableBenefits.toString(),
            formula: "max(0, refigured taxable benefits - previously reported taxable benefits)",
          },
        ])),
        {
          line: "1040-6b",
          description: "Form 1040 Line 6b taxable benefits",
          value: result.socialSecurityBenefitsTaxable.toString(),
          formula: "Final taxable Social Security benefits used on Form 1040 Line 6b",
        },
      ],
    });
  }

  return {
    title: "Social Security Benefits Worksheet Reference Summary",
    warningLabel: "REFERENCE SUMMARY ONLY",
    sections,
  };
}

export async function fillSocialSecurityBenefitsWorksheetReference(
  input: TaxYearInput,
  result: TaxReturnResult,
  outputDir: string,
) {
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const summary = buildSocialSecurityBenefitsWorksheetReferenceSummary(input, result);
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - PAGE_MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - PAGE_MARGIN;
  };

  y = drawWrappedText(page, summary.title, {
    font: bold,
    size: 20,
    x: PAGE_MARGIN,
    y,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 24,
  });

  y = drawWrappedText(page, summary.warningLabel, {
    font: bold,
    size: 12,
    x: PAGE_MARGIN,
    y: y - 6,
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
    color: WARNING_COLOR,
  });

  y = drawWrappedText(
    page,
    "This page summarizes the supported Social Security Benefits Worksheet outputs that drive Form 1040 Lines 6a and 6b. It is not an official IRS worksheet page.",
    {
      font: regular,
      size: BODY_FONT_SIZE,
      x: PAGE_MARGIN,
      y: y - 8,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 14,
    },
  );

  y -= 12;

  for (const section of summary.sections) {
    if (y < 120) {
      newPage();
    }

    y = drawWrappedText(page, section.heading, {
      font: bold,
      size: 13,
      x: PAGE_MARGIN,
      y,
      maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
      lineHeight: 16,
    });

    y -= 6;

    for (const line of section.lines) {
      if (y < 90) {
        newPage();
      }

      y = drawWrappedText(page, `${line.line}  ${line.description}: ${line.value}`, {
        font: bold,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
        lineHeight: 13,
      });

      y = drawWrappedText(page, `Formula: ${line.formula}`, {
        font: regular,
        size: BODY_FONT_SIZE,
        x: PAGE_MARGIN + 12,
        y,
        maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2 - 12,
        lineHeight: 13,
      });

      y -= 6;
    }
  }

  const pdfBytes = await doc.save();
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, SOCIAL_SECURITY_BENEFITS_WORKSHEET_REFERENCE_FILENAME);
  await writeFile(outputPath, pdfBytes);
  return outputPath;
}
