// Spec: spec/federal/guided-tax-refund-payment-years.yaml.
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { buildGovernmentPaymentSourceRecords } from "@/lib/guided-government-payment-inputs";
import type { GuidedFlowState } from "@/lib/guided-interview-flow";
function fixture(): GuidedFlowState {
    return JSON.parse(readFileSync(new URL("../fixtures/guided-tax-refund-payment-years.json", import.meta.url), "utf8"));
}
it("hands actual mixed-payment originals to the canonical recovery API", () => {
    const state = fixture();
    const entries = state.sectionData["income-unemployment"]?.entries;
    if (!entries)
        throw new Error("Missing actual synthetic sources");
    const built = buildGovernmentPaymentSourceRecords(entries);
    expect(built[0], "the actual adapter must preserve the supplied complete payment basis")
        .toHaveProperty("refundPaymentBasis");
    expect(built[0].refundExpenseTaxYear).toBeUndefined();
});
import { buildTaxInputFromGuidedData, captureGuidedRefundRecoverySources } from "@/lib/guided-interview-bridge";
import { updateSectionData } from "@/lib/guided-interview-flow";
import { calculateTaxableStateRefundRecoveries } from "@/engine/forms/taxable-state-refund-recoveries";
import { calculateStateLocalIncomeTaxDeduction } from "@/engine/forms/state-local-income-tax-deduction";
import { TaxYearInputSchema } from "@/models/inputs";
export function confirmedFixture(): GuidedFlowState {
    const state = fixture(), data = state.sectionData["income-unemployment"];
    if (!data?.refundRecoveries)
        throw new Error("Missing fixture collection");
    Object.assign(data.refundRecoveries, captureGuidedRefundRecoverySources(state), { sourceFactsConfirmed: true });
    return state;
}
it("retains independent300 taxable and100 current with900 state payment deduction", () => {
    const state = confirmedFixture(), before = JSON.stringify(state), raw = buildTaxInputFromGuidedData(state);
    expect(raw).not.toBeNull();
    const input = TaxYearInputSchema.parse(raw), result = calculateTaxableStateRefundRecoveries(input);
    expect(result.taxableRefund.toFixed()).toBe("300");
    expect(result.currentYearRefund.toFixed()).toBe("100");
    expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe("900");
    expect(input.taxableRefundWorksheet).toBeUndefined();
    expect(input.form1099G?.[0].refundPaymentBasis?.payments?.[3].currentYearPayment).toEqual({ collection: "estimatedTaxPayments", index: 0 });
    expect(JSON.stringify(state)).toBe(before);
});
it("denies unknown conflicting and outside-cohort refund facts", () => {
    for (const mutate of [
        (s: GuidedFlowState) => { s.taxYear = 2026; },
        (s: GuidedFlowState) => { s.segmentation.filingStatus = "mfj"; },
        (s: GuidedFlowState) => { required(s.sectionData["personal-info"]).dateOfBirth = "1950-01-01"; },
        (s: GuidedFlowState) => { required(required(required(s.sectionData["income-unemployment"]).refundRecoveries).years)[0].priorYearHadAMT = undefined; },
        (s: GuidedFlowState) => { required(required(s.sectionData["income-unemployment"]).entries)[0].refundExpenseTaxYear = "2024"; },
        (s: GuidedFlowState) => { required(required(required(required(s.sectionData["income-unemployment"]).entries)[0].refundPaymentBasis).payments)[3].currentYearStatePaymentConfirmed = null; },
        (s: GuidedFlowState) => { required(s.sectionData["state-return"]).stateEstimatedPayments = []; },
    ]) {
        const s = confirmedFixture();
        mutate(s);
        expect(buildTaxInputFromGuidedData(s)).toBeNull();
    }
});
it("requires actual history and payment linkage even after fresh capture", () => {
    const changes = [
        (s: GuidedFlowState) => { required(required(required(s.sectionData["income-unemployment"]).refundRecoveries).years)[0].priorYearHadTaxCredits = undefined; },
        (s: GuidedFlowState) => { required(required(required(s.sectionData["income-unemployment"]).refundRecoveries).years)[0].priorYearPrimarySsn = "999-88-7777"; },
        (s: GuidedFlowState) => { required(required(required(s.sectionData["income-unemployment"]).refundRecoveries).years)[0].priorYearTaxableIncome = "40001"; },
        (s: GuidedFlowState) => { required(required(required(required(s.sectionData["income-unemployment"]).entries)[0].refundPaymentBasis).payments)[1].sourceReference = required(required(required(required(s.sectionData["income-unemployment"]).entries)[0].refundPaymentBasis).payments)[0].sourceReference; },
    ];
    for (const mutate of changes) {
        const s = fixture();
        mutate(s);
        const d = required(s.sectionData["income-unemployment"]);
        try {
            Object.assign(required(d.refundRecoveries), captureGuidedRefundRecoverySources(s), { sourceFactsConfirmed: true });
        }
        catch { /* Invalid documentary inputs may deny before capture. */ }
        expect(buildTaxInputFromGuidedData(s)).toBeNull();
    }
    const s = fixture();
    required(required(s.sectionData["state-return"]).stateEstimatedPayments).push({ ...required(required(s.sectionData["state-return"]).stateEstimatedPayments)[0] });
    expect(() => captureGuidedRefundRecoverySources(s)).toThrow(/uniquely/);
});
it("retains zero versus unknown and source-bound currentness", () => {
    const s = confirmedFixture(), originals = structuredClone(required(required(s.sectionData["income-unemployment"]).refundRecoveries).originalSources);
    const unchanged = updateSectionData(s, "income-unemployment", structuredClone(required(s.sectionData["income-unemployment"])));
    expect(required(required(unchanged.sectionData["income-unemployment"]).refundRecoveries).sourceFactsConfirmed).toBe(true);
    const edited = structuredClone(required(s.sectionData["income-unemployment"]));
    required(required(required(edited.entries)[0].refundPaymentBasis).payments)[0].sourceReference += " corrected";
    const next = updateSectionData(s, "income-unemployment", edited);
    expect(required(required(next.sectionData["income-unemployment"]).refundRecoveries).sourceFactsConfirmed).toBeNull();
    expect(required(required(next.sectionData["income-unemployment"]).refundRecoveries).originalSources).toEqual(originals);
    expect(buildTaxInputFromGuidedData(next)).toBeNull();
    const zero = fixture();
    required(required(zero.sectionData["income-unemployment"]).entries)[0].stateOrLocalTaxRefund = "0";
    Object.assign(required(required(zero.sectionData["income-unemployment"]).refundRecoveries), captureGuidedRefundRecoverySources(zero), { sourceFactsConfirmed: true });
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(zero));
    expect(calculateTaxableStateRefundRecoveries(input).taxableRefund.toFixed()).toBe("0");
    const unknown = fixture();
    required(required(unknown.sectionData["income-unemployment"]).entries)[0].stateOrLocalTaxRefund = "";
    expect(buildTaxInputFromGuidedData(unknown)).toBeNull();
});
it("requires actual dated basis and current under65 facts before capture", () => {
    const missing = fixture();
    delete required(required(missing.sectionData["income-unemployment"]).entries)[0].refundPaymentBasis;
    expect(() => captureGuidedRefundRecoverySources(missing)).toThrow();
    const older = fixture();
    required(older.sectionData["personal-info"]).dateOfBirth = "1960-02-15";
    expect(() => captureGuidedRefundRecoverySources(older)).toThrow(/under.?65/);
});
it("preserves the entire original inventory when nonrefund statements coexist", () => {
    const s = fixture(), data = required(s.sectionData["income-unemployment"]), other = structuredClone(required(data.entries)[0]);
    other.accountReference = "FixtureOnly separate unemployment record";
    other.stateOrLocalTaxRefund = "0";
    other.compensation = "0";
    delete other.refundPaymentBasis;
    delete other.refundTaxYear;
    required(data.entries).push(other);
    data.compensation = "0";
    Object.assign(required(data.refundRecoveries), captureGuidedRefundRecoverySources(s), { sourceFactsConfirmed: true });
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(s));
    expect(input.form1099G).toHaveLength(2);
    expect(input.taxableStateRefundRecoveries?.sourceOriginals).toHaveLength(1);
    expect(required(data.refundRecoveries).originalSources?.forms).toHaveLength(2);
    expect(calculateTaxableStateRefundRecoveries(input).taxableRefund.toFixed()).toBe("300");
});

function required<T>(value:T|null|undefined):T{if(value==null)throw new Error("Missing synthetic source");return value;}
import {buildGuidedSyntheticDocuments} from "@/lib/guided-interview-bridge";
it("keeps unconfirmed or inconsistent recovery records visibly partial",()=>{
 const s=fixture();expect(buildGuidedSyntheticDocuments(s).find(row=>row.id==="guided:1099-g")?.coverage).toBe("partially-supported");
 const accepted=confirmedFixture();expect(buildGuidedSyntheticDocuments(accepted).find(row=>row.id==="guided:1099-g")?.coverage).toBe("supported");
 const d=required(accepted.sectionData["income-unemployment"]);required(required(d.refundRecoveries).years)[0].priorYearTaxableIncome="40001";
 Object.assign(required(d.refundRecoveries),captureGuidedRefundRecoverySources(accepted),{sourceFactsConfirmed:true});expect(buildGuidedSyntheticDocuments(accepted).find(row=>row.id==="guided:1099-g")?.coverage).toBe("partially-supported");
});
