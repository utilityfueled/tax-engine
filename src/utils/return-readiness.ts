import type { TaxYearInput } from "@/models/inputs.js";
import type { TaxReturnResult } from "@/models/outputs.js";
import { shouldIncludePAScheduleEReferenceSummary } from "@/pdf/fill-pa-schedule-e.js";
import { shouldIncludePAScheduleJReferenceSummary } from "@/pdf/fill-pa-schedule-j.js";
import { shouldIncludePAScheduleNRHReferenceSummary } from "@/pdf/fill-pa-schedule-nrh.js";
import { shouldIncludePAScheduleOReferenceSummary } from "@/pdf/fill-pa-schedule-o.js";
import { shouldIncludePAScheduleFReferenceSummary } from "@/pdf/fill-pa-schedule-f.js";
import { shouldIncludePAScheduleSPReferenceSummary } from "@/pdf/fill-pa-schedule-sp.js";
import { shouldIncludePAScheduleTReferenceSummary } from "@/pdf/fill-pa-schedule-t.js";
import { shouldIncludePAScheduleUEReferenceSummary } from "@/pdf/fill-pa-schedule-ue.js";
import { shouldIncludePAScheduleDCReferenceSummary } from "@/pdf/fill-pa-schedule-dc.js";
import { shouldIncludePAScheduleGLReferenceSummary } from "@/pdf/fill-pa-schedule-g-l.js";
import { shouldIncludePAScheduleSDReferenceSummary } from "@/pdf/fill-pa-schedule-sd.js";
import { shouldIncludePAScheduleDReferenceSummary } from "@/utils/pa-schedule-d-packet.js";

export type ReturnCompletenessStatus = "supported" | "partial" | "unsupported";

export interface ReturnReadinessAssessment {
  filingQualified: false;
  packetCompleteness: ReturnCompletenessStatus;
  lineCompleteness: ReturnCompletenessStatus;
  businessRuleValidation: "validated" | "not-validated";
  findings: string[];
}

export interface AssessReturnReadinessInput {
  taxInput: TaxYearInput;
  federalResult: TaxReturnResult;
  includedForms: string[];
  stateCode?: string | null;
}

function hasIncludedForm(includedForms: string[], matcher: RegExp) {
  return includedForms.some((form) => matcher.test(form));
}

function hasPALocalEIT(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { localEIT?: unknown }
> & { localEIT: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { localEIT?: unknown }
>["localEIT"]> } {
  return !!pennsylvaniaReturn && "localEIT" in pennsylvaniaReturn && pennsylvaniaReturn.localEIT !== undefined;
}

function hasPAScheduleA(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleA?: unknown }
> & { scheduleA: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleA?: unknown }
>["scheduleA"]> } {
  return !!pennsylvaniaReturn && "scheduleA" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleA !== undefined;
}

function hasPAScheduleB(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleB?: unknown }
> & { scheduleB: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleB?: unknown }
>["scheduleB"]> } {
  return !!pennsylvaniaReturn && "scheduleB" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleB !== undefined;
}

function hasPAScheduleE(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleE?: unknown }
> & { scheduleE: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleE?: unknown }
>["scheduleE"]> } {
  return !!pennsylvaniaReturn && "scheduleE" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleE !== undefined;
}

function hasPAScheduleUE(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleUE?: unknown }
> & { scheduleUE: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleUE?: unknown }
>["scheduleUE"]> } {
  return !!pennsylvaniaReturn && "scheduleUE" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleUE !== undefined;
}

function hasPAScheduleSP(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleSP?: unknown }
> & { scheduleSP: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleSP?: unknown }
>["scheduleSP"]> } {
  return !!pennsylvaniaReturn && "scheduleSP" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleSP !== undefined;
}

function hasPAScheduleT(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleT?: unknown }
> & { scheduleT: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleT?: unknown }
>["scheduleT"]> } {
  return !!pennsylvaniaReturn && "scheduleT" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleT !== undefined;
}

function hasPAScheduleD(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleD?: unknown }
> & { scheduleD: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleD?: unknown }
>["scheduleD"]> } {
  return !!pennsylvaniaReturn && "scheduleD" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleD !== undefined;
}

function hasPAScheduleF(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleF?: unknown }
> & { scheduleF: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleF?: unknown }
>["scheduleF"]> } {
  return !!pennsylvaniaReturn && "scheduleF" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleF !== undefined;
}

function hasPAScheduleJ(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleJ?: unknown }
> & { scheduleJ: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleJ?: unknown }
>["scheduleJ"]> } {
  return !!pennsylvaniaReturn && "scheduleJ" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleJ !== undefined;
}

function hasPAScheduleNRH(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleNRH?: unknown }
> & { scheduleNRH: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleNRH?: unknown }
>["scheduleNRH"]> } {
  return !!pennsylvaniaReturn && "scheduleNRH" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleNRH !== undefined;
}

function hasPAScheduleDC(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleDC?: unknown }
> & { scheduleDC: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleDC?: unknown }
>["scheduleDC"]> } {
  return !!pennsylvaniaReturn && "scheduleDC" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleDC !== undefined;
}

function hasPAScheduleO(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleO?: unknown }
> & { scheduleO: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleO?: unknown }
>["scheduleO"]> } {
  return !!pennsylvaniaReturn && "scheduleO" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleO !== undefined;
}

function hasPAScheduleSD(
  pennsylvaniaReturn: NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"] | undefined,
): pennsylvaniaReturn is Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleSD?: unknown }
> & { scheduleSD: NonNullable<Extract<
  NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
  { scheduleSD?: unknown }
>["scheduleSD"]> } {
  return !!pennsylvaniaReturn && "scheduleSD" in pennsylvaniaReturn && pennsylvaniaReturn.scheduleSD !== undefined;
}

function shouldIncludePAScheduleAReference(
  pennsylvaniaReturn: Extract<
    NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
    { scheduleA?: unknown }
  > & { scheduleA: NonNullable<Extract<
    NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
    { scheduleA?: unknown }
  >["scheduleA"]> },
) {
  return pennsylvaniaReturn.scheduleA.line1.gt(2500)
    || [
      pennsylvaniaReturn.scheduleA.line2,
      pennsylvaniaReturn.scheduleA.line3,
      pennsylvaniaReturn.scheduleA.line5,
      pennsylvaniaReturn.scheduleA.line6,
      pennsylvaniaReturn.scheduleA.line7,
      pennsylvaniaReturn.scheduleA.line8,
      pennsylvaniaReturn.scheduleA.line11,
      pennsylvaniaReturn.scheduleA.line12,
      pennsylvaniaReturn.scheduleA.line13,
      pennsylvaniaReturn.scheduleA.line14,
      pennsylvaniaReturn.scheduleA.line15,
    ].some((line) => !line.isZero());
}

function shouldIncludePAScheduleBReference(
  pennsylvaniaReturn: Extract<
    NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
    { scheduleB?: unknown }
  > & { scheduleB: NonNullable<Extract<
    NonNullable<TaxReturnResult["stateReturns"]>["pennsylvania"],
    { scheduleB?: unknown }
  >["scheduleB"]> },
) {
  return [
    pennsylvaniaReturn.scheduleB.line2,
    pennsylvaniaReturn.scheduleB.line3,
    pennsylvaniaReturn.scheduleB.line4,
    pennsylvaniaReturn.scheduleB.line5,
    pennsylvaniaReturn.scheduleB.line7,
    pennsylvaniaReturn.scheduleB.line8,
    pennsylvaniaReturn.scheduleB.line9a,
    pennsylvaniaReturn.scheduleB.line9b,
    pennsylvaniaReturn.scheduleB.line9c,
    pennsylvaniaReturn.scheduleB.line10,
    pennsylvaniaReturn.scheduleB.line11,
  ].some((line) => !line.isZero());
}

export function assessReturnReadiness(
  input: AssessReturnReadinessInput,
): ReturnReadinessAssessment {
  const findings: string[] = [];
  const normalizedStateCode = input.stateCode?.trim().toUpperCase() ?? null;

  let packetCompleteness: ReturnCompletenessStatus = "supported";
  let lineCompleteness: ReturnCompletenessStatus = "supported";

  if (input.federalResult.estimatedTaxPenalty.gt(0)) {
    packetCompleteness = "partial";
    findings.push(
      "Form 2210 is still suppressed from the draft packet even when an estimated tax penalty is present.",
    );
  }

  if ((input.taxInput.adjustments?.estimatedTaxPayments?.length ?? 0) > 0) {
    packetCompleteness = "partial";
    findings.push(
      "Form 1040-ES vouchers are not generated for draft packets yet.",
    );
  }

  if (
    ((input.taxInput.form1099B?.some((entry) => entry.transactions.length > 0) ?? false)
      || (input.taxInput.form1099DA?.some((entry) => entry.transactions.length > 0) ?? false))
    && !hasIncludedForm(input.includedForms, /^f8949.*-filled\.pdf$/i)
  ) {
    packetCompleteness = "partial";
    lineCompleteness = "partial";
    findings.push(
      "Capital transaction detail exists, but Form 8949 detail pages are not present in the packet.",
    );
  }

  if (input.federalResult.form3800 && input.federalResult.form3800.totalCredit.gt(0)) {
    const hasForm3800Reference = hasIncludedForm(
      input.includedForms,
      /^f3800-reference-filled\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasForm3800Reference
        ? "Form 3800 is included as a reference summary, not an official filed Form 3800."
        : "Form 3800 applies, but no Form 3800 packet artifact was generated.",
    );
  }

  if (input.federalResult.carryforwards.partnerBasis.length > 0) {
    const hasPartnerBasisReference = hasIncludedForm(
      input.includedForms,
      /^partner-basis-schedule-reference-filled\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPartnerBasisReference
        ? "Partner/shareholder basis schedules are included as a reference summary, not an official filed basis attachment or Form 7203 copy."
        : "Partner/shareholder basis schedules apply, but no basis schedule packet artifact was generated.",
    );
  }

  if (normalizedStateCode === "OH") {
    const hasOhioReferenceForms = hasIncludedForm(
      input.includedForms,
      /^oh-.*-reference\.pdf$/i,
    );

    if (!hasOhioReferenceForms) {
      packetCompleteness = "unsupported";
      findings.push(
        "Ohio was selected, but no Ohio packet artifacts were generated.",
      );
    } else {
      packetCompleteness = "partial";
      findings.push(
        "Ohio packet output is currently generated as reference-summary pages, not official filled Ohio PDFs.",
      );
    }
  }

  if (
    normalizedStateCode === "PA"
    && hasPALocalEIT(input.federalResult.stateReturns?.pennsylvania)
  ) {
    const hasPALocalEITReference = hasIncludedForm(
      input.includedForms,
      /^pa-local-eit-reference\.pdf$/i,
    );

    packetCompleteness = "partial";

    findings.push(
      hasPALocalEITReference
        ? "Pennsylvania local EIT is included as a reference summary, not an official local earned income tax return."
        : "Pennsylvania local EIT applies, but no local EIT packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleA(input.federalResult.stateReturns?.pennsylvania)
  ) {
    const hasPAScheduleAReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-a-reference\.pdf$/i,
    );

    if (shouldIncludePAScheduleAReference(input.federalResult.stateReturns.pennsylvania)) {
      packetCompleteness = "partial";
      findings.push(
        hasPAScheduleAReference
          ? "Pennsylvania Schedule A is included as a reference summary, not an official PA-40 Schedule A filing copy."
          : "Pennsylvania Schedule A applies, but no Schedule A packet artifact was generated.",
      );
    }
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleB(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleBReference(input.federalResult.stateReturns.pennsylvania)
  ) {
    const hasPAScheduleBReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-b-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleBReference
        ? "Pennsylvania Schedule B is included as a reference summary, not an official PA-40 Schedule B filing copy."
        : "Pennsylvania Schedule B applies, but no Schedule B packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleE(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleEReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleE)
  ) {
    const hasPAScheduleEReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-e-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleEReference
        ? "Pennsylvania Schedule E is included as a reference summary, not an official PA Schedule E filing copy."
        : "Pennsylvania Schedule E applies, but no Schedule E packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleUE(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleUEReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleUE)
  ) {
    const hasPAScheduleUEReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-ue-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleUEReference
        ? "Pennsylvania Schedule UE is included as a reference summary, not an official PA Schedule UE filing copy."
        : "Pennsylvania Schedule UE applies, but no Schedule UE packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleSP(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleSPReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleSP)
  ) {
    const hasPAScheduleSPReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-sp-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleSPReference
        ? "Pennsylvania Schedule SP is included as a reference summary, not an official PA Schedule SP filing copy."
        : "Pennsylvania Schedule SP applies, but no Schedule SP packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleT(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleTReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleT)
  ) {
    const hasPAScheduleTReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-t-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleTReference
        ? "Pennsylvania Schedule T is included as a reference summary, not an official PA Schedule T filing copy."
        : "Pennsylvania Schedule T applies, but no Schedule T packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && input.taxInput.taxpayer.address.state.toUpperCase() === "PA"
    && input.taxInput.scheduleC
  ) {
    const hasPAScheduleCReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-c-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleCReference
        ? "Pennsylvania Schedule C is included as a reference summary, not an official PA-40 Schedule C filing copy."
        : "Pennsylvania Schedule C applies, but no Schedule C packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleF(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleFReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleF)
  ) {
    const hasPAScheduleFReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-f-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleFReference
        ? "Pennsylvania Schedule F is included as a reference summary, not an official PA-40 Schedule F filing copy."
        : "Pennsylvania Schedule F applies, but no Schedule F packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleD(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleDReferenceSummary(
      input.taxInput,
      input.federalResult.stateReturns.pennsylvania.scheduleD,
    )
  ) {
    const hasPAScheduleDReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-d-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleDReference
        ? "Pennsylvania Schedule D is included as a reference summary, not an official PA Schedule D filing copy."
        : "Pennsylvania Schedule D applies, but no Schedule D packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleJ(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleJReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleJ)
  ) {
    const hasPAScheduleJReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-j-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleJReference
        ? "Pennsylvania Schedule J is included as a reference summary, not an official PA Schedule J filing copy."
        : "Pennsylvania Schedule J applies, but no Schedule J packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && !!input.taxInput.paNonresidentReturn
    && hasPAScheduleNRH(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleNRHReferenceSummary(input.taxInput)
  ) {
    const hasPAScheduleNRHReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-nrh-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleNRHReference
        ? "Pennsylvania Schedule NRH is included as a reference summary, not an official PA Schedule NRH filing copy."
        : "Pennsylvania Schedule NRH applies, but no Schedule NRH packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && hasPAScheduleO(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleOReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleO)
  ) {
    const hasPAScheduleOReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-o-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleOReference
        ? "Pennsylvania Schedule O is included as a reference summary, not an official PA Schedule O filing copy."
        : "Pennsylvania Schedule O applies, but no Schedule O packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && !input.taxInput.paNonresidentReturn
    && hasPAScheduleDC(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleDCReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleDC)
  ) {
    const hasPAScheduleDCReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-dc-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleDCReference
        ? "Pennsylvania Schedule DC is included as a reference summary, not an official PA Schedule DC filing copy."
        : "Pennsylvania Schedule DC applies, but no Schedule DC packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && !input.taxInput.paNonresidentReturn
    && input.federalResult.stateReturns?.pennsylvania
    && shouldIncludePAScheduleGLReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleGL)
  ) {
    const hasPAScheduleGLReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-g-l-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleGLReference
        ? "Pennsylvania Schedule G-L is included as a reference summary, not an official PA Schedule G-L filing copy or the required copy of the other state's return."
        : "Pennsylvania Schedule G-L applies, but no Schedule G-L packet artifact was generated.",
    );
  }

  if (
    normalizedStateCode === "PA"
    && !input.taxInput.paNonresidentReturn
    && hasPAScheduleSD(input.federalResult.stateReturns?.pennsylvania)
    && shouldIncludePAScheduleSDReferenceSummary(input.federalResult.stateReturns.pennsylvania.scheduleSD)
  ) {
    const hasPAScheduleSDReference = hasIncludedForm(
      input.includedForms,
      /^pa-schedule-sd-reference\.pdf$/i,
    );

    packetCompleteness = "partial";
    findings.push(
      hasPAScheduleSDReference
        ? "Pennsylvania Schedule SD is included as a reference summary, not an official PA-40 SD filing copy."
        : "Pennsylvania Schedule SD applies, but no Schedule SD packet artifact was generated.",
    );
  }

  findings.push(
    "IRS MeF and state e-file business-rule validation have not been run for this packet yet.",
  );

  return {
    filingQualified: false,
    packetCompleteness,
    lineCompleteness,
    businessRuleValidation: "not-validated",
    findings,
  };
}
