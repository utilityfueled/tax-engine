/** Disabled final 2026 Form 8919 physical candidate. Spec: spec/federal/form-8919-2026-template.yaml. */
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type { PDFDocument } from "pdf-lib";
import { calculateForm8919 } from "@/engine/forms/form-8919.js";
import { calculateUnreportedTipPayroll } from "@/engine/forms/unreported-tip-payroll.js";
import { FEDERAL_2026_CONSTANTS } from "@/models/federal-2026-indexed.js";
import type { TaxYearInput } from "@/models/inputs.js";
import { d, sum } from "@/utils/decimal.js";
import { markReviewPdf } from "../../export-policy.js";
import { loadPdfDocumentQuietly } from "../../pdf-utils.js";
import { removeTrustedTemplateLegacyFormData } from "../../trusted-review-template-cleanup.js";

export const FORM_8919_2026_CANDIDATE = Object.freeze({
  taxYear: 2026,
  sourceUrl: "https://www.irs.gov/pub/irs-pdf/f8919.pdf",
  annualSourceUrl: "https://www.irs.gov/pub/irs-prior/f8919--2026.pdf",
  sourceRevision: "Created 5/14/26",
  postedDate: "2026-11-20",
  retrievedAt: "2026-11-20T22:45:29Z",
  sha256: "b7bfa1eb7b4b1893acdcc6399103e8cc0388e4dd64c9522e586adccdba0b42dc",
  reviewStatus: "independent-review-pending",
  filingQualified: false,
  exportsEnabled: false,
});

type Owner = "primary" | "spouse";
interface Form1099Original {
  kind: "1099-misc" | "1099-nec";
  taxYear: number;
  accountHolder: Owner;
  firmIdentifier: string;
  payerName: string;
  reclassifiedWages?: string;
  reference: string;
}

type FirmReason =
  | { code: "A" | "C"; correspondenceDate: string }
  | { code: "G"; ss8FiledOn: string; irsReplyReceived: boolean }
  | { code: "H"; wagesBelongOnW2Confirmed: boolean };

interface FirmOriginal {
  name: string;
  identifier: string;
  identifierType: "ein" | "ssn";
  wages: string;
  receivedForm1099: boolean;
  originals?: readonly Form1099Original[];
  reference: string;
  reason: FirmReason;
}

interface Form8919ReviewSources {
  taxYear: number;
  accountHolder: Owner;
  confirmed: boolean;
  reviewedOn: string;
  firms: readonly FirmOriginal[];
}

const page = "topmostSubform[0].Page1[0].";
const exactCurrency = /^\d+(?:\.\d{1,2})?$/;

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function originalFirmDetails(firm: FirmOriginal, sources: Form8919ReviewSources, w2s: TaxYearInput["w2s"]) {
  const identifier = firm.identifier.trim();
  const digits = identifier.replaceAll("-", "");
  const identifierPattern = firm.identifierType === "ein" ? /^(?:\d{9}|\d{2}-\d{7})$/ : /^(?:\d{9}|\d{3}-\d{2}-\d{4})$/;
  const wagesText = firm.wages.trim();
  if (!firm.name.trim() || !firm.reference.trim() || typeof firm.receivedForm1099 !== "boolean"
    || !identifierPattern.test(identifier) || !exactCurrency.test(wagesText)) {
    throw new Error("Form 8919 requires complete original firm details and wages.");
  }
  const wages = new Decimal(wagesText);
  if (!wages.gt(0)) throw new Error("Form 8919 requires positive original wages for each firm.");
  const originals = firm.originals ?? [];
  if (firm.receivedForm1099 !== (originals.length > 0) || originals.some(original =>
    original.taxYear !== sources.taxYear || original.accountHolder !== sources.accountHolder
    || original.firmIdentifier.trim().replaceAll("-", "") !== digits || original.payerName.trim() !== firm.name.trim()
    || !original.reference.trim() || (original.kind !== "1099-misc" && original.kind !== "1099-nec"))
    || new Set(originals.map(original => original.reference.trim())).size !== originals.length) {
    throw new Error("Form 8919 requires original Form 1099 payer and receipt reconciliation.");
  }

  const reason = firm.reason;
  let correspondenceDate = "";
  switch (reason.code) {
    case "A":
    case "C": {
      const date = reason.correspondenceDate;
      if (!isDate(date) || date > sources.reviewedOn) throw new Error("Form 8919 requires the original IRS correspondence date.");
      correspondenceDate = `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
      break;
    }
    case "G":
      if (!isDate(reason.ss8FiledOn) || reason.ss8FiledOn > sources.reviewedOn || reason.irsReplyReceived !== false) {
        throw new Error("Form 8919 requires an original Form SS-8 filing record and confirmed IRS response status.");
      }
      break;
    case "H": {
      const matchedW2 = firm.identifierType === "ein" && w2s.some(w2 => w2.employer?.ein?.replaceAll("-", "") === digits);
      if (!matchedW2 || reason.wagesBelongOnW2Confirmed !== true || !firm.receivedForm1099
        || originals.some(original => !exactCurrency.test(original.reclassifiedWages ?? ""))
        || !sum(...originals.map(original => d(original.reclassifiedWages))).eq(wages)) {
        throw new Error("Form 8919 requires the original W-2 and Form 1099 wage reconciliation.");
      }
      break;
    }
    default:
      throw new Error("Form 8919 requires a reason from the original firm records.");
  }
  const printIdentifier = firm.identifierType === "ein" ? `${digits.slice(0, 2)}-${digits.slice(2)}` : "";
  return { firm, key: `${firm.identifierType}:${digits}`, printIdentifier, wages, correspondenceDate };
}

/** Build a disabled internal review projection from confirmed original firm records. */
export async function fillForm8919ReviewCandidate(
  input: TaxYearInput,
  sources: Form8919ReviewSources,
  template: Uint8Array,
): Promise<PDFDocument[]> {
  const { taxYear, sha256 } = FORM_8919_2026_CANDIDATE;
  if (input.taxpayer.taxYear !== taxYear || sources.taxYear !== taxYear) {
    throw new Error("Form 8919 review requires 2026 original and calculation records.");
  }
  const owner = input.taxpayer[sources.accountHolder];
  const joint = input.taxpayer.filingStatus === "married_filing_jointly" && input.taxpayer.spouse !== undefined;
  if (!owner || input.form8919?.accountHolder !== sources.accountHolder
    || (sources.accountHolder === "spouse" && !joint)) {
    throw new Error("Form 8919 review owner does not match the calculation.");
  }
  if (sources.confirmed !== true || !isDate(sources.reviewedOn) || sources.firms.length === 0) {
    throw new Error("Form 8919 requires the confirmed original firm list and review date.");
  }
  if (createHash("sha256").update(template).digest("hex") !== sha256) throw new Error("Unreviewed Form 8919 template revision.");

  if (input.w2s.some(w2 => w2.taxYear !== taxYear || !w2.accountHolder
    || (w2.accountHolder === "spouse" && !joint)
    || w2.socialSecurityWages === undefined || w2.socialSecurityTips === undefined
    || d(w2.socialSecurityWages).lt(0) || d(w2.socialSecurityTips).lt(0))) {
    throw new Error("Form 8919 requires verified 2026 W-2 payroll years, owners and Boxes 3 and 7.");
  }
  if (!d(input.form8919.rrtaCompensationSubjectToSocialSecurityTax).isZero()) {
    throw new Error("Form 8919 with railroad payroll requires separate review.");
  }
  const ownerW2s = input.w2s.filter(w2 => w2.accountHolder === sources.accountHolder);
  const firms = sources.firms.map(firm => originalFirmDetails(firm, sources, ownerW2s));
  if (new Set(firms.map(firm => firm.key)).size !== firms.length) throw new Error("Form 8919 requires one original record per firm.");
  const totalWages = firms.reduce((total, firm) => total.plus(firm.wages), new Decimal(0));
  if (!totalWages.eq(input.form8919.wagesNotReportedOnW2)) throw new Error("Form 8919 original wages do not match the validated wage total.");
  const actualTipPayroll = calculateUnreportedTipPayroll(input, FEDERAL_2026_CONSTANTS);
  const payroll = {
    socialSecurityWagesAndTipsAlreadyReported: sum(...ownerW2s.map(w2 => d(w2.socialSecurityWages))),
    w2SocialSecurityTipsAlreadyReported: sum(...ownerW2s.map(w2 => d(w2.socialSecurityTips))),
    form4137SocialSecurityTipsAlreadyReported: actualTipPayroll.byOwner[sources.accountHolder]?.line10,
  };
  const result = calculateForm8919({ ...input.form8919, socialSecurityWagesAndTipsAlreadyReported: undefined }, FEDERAL_2026_CONSTANTS, payroll);
  const reportedPayroll = input.form8919.socialSecurityWagesAndTipsAlreadyReported;
  if (reportedPayroll !== undefined && !result.line8.eq(reportedPayroll)) throw new Error("Form 8919 line 8 conflicts with original payroll.");
  if (!totalWages.eq(result.line6)) throw new Error("Form 8919 original wages do not match calculated line 6.");

  const docs: PDFDocument[] = [];
  for (let offset = 0; offset < firms.length; offset += 5) {
    const doc = await loadPdfDocumentQuietly(template);
    removeTrustedTemplateLegacyFormData(doc);
    const form = doc.getForm();
    form.getTextField(page + "f1_1[0]").setText(`${owner.firstName} ${owner.lastName}`);
    for (const [index, { firm, printIdentifier, wages, correspondenceDate }] of firms.slice(offset, offset + 5).entries()) {
      const prefix = `${page}Pg1Table[0].Row${index + 1}[0].`;
      const values = [firm.name.trim(), printIdentifier, firm.reason.code, correspondenceDate, wages.toFixed()];
      for (const [cell, value] of values.entries()) {
        if (value) form.getTextField(`${prefix}f1_${3 + 5 * index + cell}[0]`).setText(value);
      }
      if (firm.receivedForm1099) form.getCheckBox(`${prefix}c1_${index + 1}[0]`).check();
    }
    if (offset === 0) {
      const results = [[28, result.line6], [30, result.line8], [31, result.line9], [32, result.line10],
        [33, result.line11], [34, result.line12], [35, result.line13]] as const;
      for (const [fieldNumber, amount] of results) form.getTextField(`${page}f1_${fieldNumber}[0]`).setText(amount.toFixed());
    }
    await markReviewPdf(doc);
    docs.push(doc);
  }
  return docs;
}
