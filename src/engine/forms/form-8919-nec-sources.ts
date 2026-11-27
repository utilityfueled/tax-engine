/** Original Reason A wage source reconciliation. Spec: spec/federal/form-8919.yaml. */
import { Form1099NecSchema, Form8919Schema, type TaxYearInput } from "@/models/inputs.js";
import { isActualDate } from "@/utils/civil-date.js";
import { d } from "@/utils/decimal.js";

export interface Form8919NecSource {
  wageNecIndex: number;
  statementReference: string;
}

interface ReconciledForm8919NecSources {
  businessInput: TaxYearInput;
  form8919NecSource?: Form8919NecSource;
}

function issuerEin(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!/^(\d{9}|\d{2}-\d{7})$/.test(text)) return undefined;
  const digits = text.replace("-", "");
  return digits === "000000000" ? undefined : digits;
}

function recipientTin(value: string | undefined) {
  const text = value?.trim() ?? "";
  if (!/^(\d{9}|\d{3}-\d{2}-\d{4})$/.test(text)) return undefined;
  const digits = text.replaceAll("-", "");
  return digits === "000000000" ? undefined : digits;
}

const normalizedName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
const exactMoney = /^\d{1,12}(?:\.\d{1,2})?$/;

/** Keep the original input for information reporting and use businessInput for income attribution. */
export function reconcileForm8919NecSources(input: TaxYearInput, asOfDate: string): ReconciledForm8919NecSources {
  const form = input.form8919;
  const year = input.taxpayer.taxYear;
  const joint = input.taxpayer.filingStatus === "married_filing_jointly";
  const primaryTin = recipientTin(input.taxpayer.primary.ssn);
  const spouseTin = recipientTin(input.taxpayer.spouse?.ssn);
  const twoDocumentedOwners = joint && primaryTin !== undefined && spouseTin !== undefined && primaryTin !== spouseTin;

  if (form?.reasonANecSource === undefined) {
    const potentiallyOverlaps = (owner: NonNullable<TaxYearInput["form8919"]>["accountHolder"]) =>
      !twoDocumentedOwners || owner === undefined || form?.accountHolder === undefined || owner === form.accountHolder;
    if (input.form1099Nec.some(source => source.originalForForm8919 !== undefined)
      || (year === 2026 && form && d(form.wagesNotReportedOnW2).gt(0)
        && input.form1099Nec.some(source => potentiallyOverlaps(source.accountHolder) && d(source.nonemployeeCompensation).gt(0)))) {
      throw new Error("Form 8919 and original Form 1099-NEC wage overlap requires a verified Reason A link.");
    }
    return { businessInput: input };
  }

  const parsed = Form8919Schema.safeParse(form);
  const proof = parsed.data?.reasonANecSource;
  if (!parsed.success || !proof || year !== 2026 || proof.sourceTaxYear !== year
    || proof.determinationDate.startsWith("0000-") || typeof asOfDate !== "string" || !isActualDate(asOfDate)
    || proof.determinationDate > proof.determinationReceivedDate || proof.determinationReceivedDate > asOfDate
    || proof.employeeDeterminationConfirmed !== true || proof.allCompensationEmployeeWagesConfirmed !== true
    || proof.noEmployeeFicaWithheldConfirmed !== true || proof.receivedInsteadOfW2Confirmed !== true) {
    throw new Error("Form 8919 requires the received IRS Reason A determination and confirmed 2026 employee wage facts.");
  }
  if (input.form1099Nec.length !== 1 || proof.necSourceId !== "form1099Nec:0") {
    throw new Error("Form 8919 Reason A wages require one matching current original Form 1099-NEC.");
  }
  const statement = Form1099NecSchema.safeParse(input.form1099Nec[0]);
  if (!statement.success) throw new Error("Form 8919 requires the actual original Form 1099-NEC fields.");
  const source = statement.data;
  const original = source.originalForForm8919;
  if (source.taxYear !== year || !original || original.currentOriginalNoCorrectionsOrVoidsConfirmed !== true
    || proof.statementReference !== original.statementReference) {
    throw new Error("Form 8919 requires the same confirmed current original Form 1099-NEC statement reference.");
  }
  if (original.noDirectSalesOrParachutePaymentConfirmed !== true) {
    throw new Error("Form 8919 Reason A wages require confirmation the original has no direct sales or excess golden parachute payments.");
  }

  const owner = parsed.data.accountHolder;
  const ownerTin = owner === "spouse" ? spouseTin : primaryTin;
  if (!owner || owner !== source.accountHolder || !ownerTin || (joint && !twoDocumentedOwners)
    || (owner === "spouse" && !twoDocumentedOwners) || recipientTin(original.recipientTin) !== ownerTin) {
    throw new Error("Form 8919 and original Form 1099-NEC must match the actual return owner and recipient TIN.");
  }

  const ein = issuerEin(proof.employerEin);
  if (!ein || ein !== issuerEin(source.payerTin) || normalizedName(proof.employerName) !== normalizedName(source.payer)) {
    throw new Error("Form 8919 and original Form 1099-NEC must match the documented firm name and employer EIN.");
  }
  if (input.w2s.some(w2 => {
    const currentEin = issuerEin(w2.employer.ein);
    return !currentEin || currentEin === ein;
  })) {
    throw new Error("Form 8919 Reason A wages here require documented W-2 EINs from firms other than the linked employer.");
  }

  const wages = source.nonemployeeCompensation;
  if (!exactMoney.test(wages) || !exactMoney.test(parsed.data.wagesNotReportedOnW2)
    || !d(wages).gt(0) || !d(wages).eq(parsed.data.wagesNotReportedOnW2)) {
    throw new Error("Form 8919 line 6 must match the full positive Form 1099-NEC Box 1a wage amount exactly.");
  }
  if (!exactMoney.test(source.federalWithheld) || d(source.federalWithheld).gt(wages)) {
    throw new Error("Form 8919 requires actual nonnegative Form 1099-NEC Box 4 withholding within the wage amount.");
  }
  if (source.qualifiedOvertimeCompensation !== undefined && d(source.qualifiedOvertimeCompensation).gt(wages)) {
    throw new Error("Form 8919 original Form 1099-NEC Box 1d overtime cannot exceed Box 1a wages.");
  }
  if (!d(source.cashTips).isZero() || source.treasuryTippedOccupationCodes?.length
    || input.form4137 || input.form4137ByOwner?.primary || input.form4137ByOwner?.spouse) {
    throw new Error("Form 8919 Reason A wages with tip reporting require separate source reconciliation.");
  }
  if (source.state?.trim() || !d(source.stateWithheld).isZero() || !d(source.stateIncome).isZero()
    || input.stateReturns?.illinois
    || input.ohioResidency || input.ohioPayments || input.ohioReturnHeaderSources || input.ohioSchoolDistrict
    || input.paResidencySources || input.paReciprocitySources || input.paOrdinaryReturnFacts
    || input.paMarriedOrdinarySources || input.paOrdinaryReturnCompletionSources
    || input.paResidentReturn || input.paNonresidentReturn) {
    throw new Error("Form 8919 Reason A wages with state-source reporting require separate reconciliation.");
  }
  if (input.taxpayer.stateResidency !== undefined && proof.federalOnlyConfirmed !== true) {
    throw new Error("Form 8919 Reason A wages with a residency answer require explicit federal-only confirmation.");
  }
  if (input.scheduleC || input.scheduleF || input.form1099Misc.length || input.form1099K.length
    || input.scheduleK1.length || input.scheduleK1Form1041.length || input.rentalProperties.length || input.cryptoIncome
    || input.form172 || input.netOperatingLoss || input.form461 || input.qbiLossSources || input.form2555
    || input.rrtaPayrollSources || parsed.data.rrtaCompensationSubjectToSocialSecurityTax !== undefined
    || parsed.data.socialSecurityWagesAndTipsAlreadyReported !== undefined
    || input.schedule1A?.businessTips?.length) {
    throw new Error("Form 8919 Reason A wages with business or other unallocated payroll sources require separate reconciliation.");
  }
  return {
    businessInput: { ...input, form1099Nec: [] },
    form8919NecSource: { wageNecIndex: 0, statementReference: original.statementReference },
  };
}
