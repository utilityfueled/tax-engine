/** Actual source reconciliation for Form2441. Spec: form-2441-return-integration.yaml. */
import Decimal from "decimal.js";
import type { TaxYearInput } from "@/models/inputs.js";
import type { Form2441BenefitsResult } from "./form-2441-benefits.js";
import { d } from "@/utils/decimal.js";
export interface DependentCareBenefitSourcesResult {
    scheduleCAdjustment: Decimal;
    scheduleFAdjustment: Decimal;
}
export function calculateDependentCareBenefitSources(input: TaxYearInput, benefits?: Form2441BenefitsResult): DependentCareBenefitSourcesResult {
    const result = { scheduleCAdjustment: d("0"), scheduleFAdjustment: d("0") };
    const strict = input.taxpayer.taxYear >= 2026 || benefits !== undefined;
    const joint = input.taxpayer.filingStatus === "married_filing_jointly";
    const owner = (actual: "primary" | "spouse" | undefined) => actual ?? (!joint ? "primary" : undefined);
    input.w2s.forEach((w2, index) => {
        if (w2.box10DependentCareBenefits === undefined) {
            if (strict)
                throw new Error("W2 Box10 dependent-care benefits are unknown");
            return;
        }
        const reported = d(w2.box10DependentCareBenefits);
        if (!reported.isFinite() || reported.lt(0))
            throw new Error("W2 Box10 dependent-care benefits must be finite and nonnegative");
        if (reported.gt(0) && !benefits)
            throw new Error("Actual positive W2 Box10 requires dependent-care benefit sources");
        if (reported.gt(0) && !benefits?.employeeSources.some(source => source.sourceId === `w2:${index}`)) {
            throw new Error("Positive W2 source Box10 has unmatched dependent-care benefits");
        }
    });
    if (!benefits)
        return result;
    if (benefits.taxYear !== input.taxpayer.taxYear)
        throw new Error("Dependent-care benefit source year does not match return");
    for (const source of benefits.employeeSources) {
        const match = /^w2:(0|[1-9]\d*)$/.exec(source.sourceId);
        const w2 = match ? input.w2s[Number(match[1])] : undefined;
        if (!w2)
            throw new Error("Dependent-care W2 source is absent or invalid");
        if (owner(w2.accountHolder) !== source.owner || (!joint && source.owner !== "primary"))
            throw new Error("Dependent-care W2 source owner does not match");
        if (w2.box10DependentCareBenefits === undefined || !d(w2.box10DependentCareBenefits).eq(source.benefitsReported))
            throw new Error("Dependent-care source amount does not reconcile with actual W2 Box10");
        if (source.alreadyIncludedInWages.gt(d(w2.wages)))
            throw new Error("Dependent-care amount already in wages exceeds actual W2 Box1");
    }
    for (const source of benefits.businessSources) {
        if (source.schedule === "schedule-e")
            throw new Error("ScheduleE dependent-care benefits require actual partner/rental SE, QBI and passive-source coordination");
        const isC = source.schedule === "schedule-c";
        const activity = isC ? input.scheduleC : input.scheduleF;
        if (source.sourceId !== (isC ? "scheduleC" : "scheduleF") || !activity)
            throw new Error("Dependent-care business source does not match an actual activity");
        if (activity.accountHolder === undefined || activity.accountHolder !== source.owner || (!joint && source.owner !== "primary"))
            throw new Error("Dependent-care business source owner does not match actual activity");
        const recorded = isC ? d(input.scheduleC?.expenses?.employeeBenefitPrograms) : d(input.scheduleF?.expenses?.employeeBenefits);
        if (!recorded.isFinite() || recorded.lt(0) || source.alreadyDeducted.gt(recorded))
            throw new Error("Dependent-care amount already deducted exceeds actual employee-benefit expense");
        const allowed = benefits.deductionAllocations.find(allocation => allocation.sourceId === source.sourceId)?.amount ?? d("0");
        const adjustment = allowed.minus(source.alreadyDeducted);
        if (isC)
            result.scheduleCAdjustment = adjustment;
        else
            result.scheduleFAdjustment = adjustment;
    }
    return result;
}
