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
import { loadGuidedFlowState, saveGuidedFlowState, updateSectionData } from "@/lib/guided-interview-flow";
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

function fixture2026() {
    const state = fixture();
    state.taxYear = 2026;
    const data = required(state.sectionData["income-unemployment"]);
    const collection = required(data.refundRecoveries);
    collection.sourceTaxYear = "2026";
    const oldForm = required(data.entries)[0];
    Object.assign(oldForm, { sourceTaxYear: "2026", sourceFormRevision: "2026-12", familyLeaveBenefits: "0", stateOrLocalTaxRefund: "100" });
    const newForm = structuredClone(oldForm);
    newForm.accountReference = "FixtureOnly 2025 liability";
    newForm.refundTaxYear = "2025";
    newForm.stateOrLocalTaxRefund = "400";
    const oldBasis = required(oldForm.refundPaymentBasis);
    oldBasis.receivedDate = "2026-09-20";
    required(oldBasis.payments).pop();
    const newBasis = required(newForm.refundPaymentBasis);
    newBasis.sourceReference = "FixtureOnly separate complete 2025 ledger";
    newBasis.receivedDate = "2026-09-21";
    const payments = required(newBasis.payments);
    for (const payment of payments) {
        payment.sourceReference += " second ledger";
        payment.datePaid = (payment.currentYearStatePaymentConfirmed ? "2026" : "2025") + required(payment.datePaid).slice(4);
    }
    required(required(state.sectionData["state-return"]).stateEstimatedPayments)[0].date = "2026-01-15";
    required(data.entries).push(newForm);
    const years = required(collection.years);
    years[0].priorYearStateLocalTaxesPaid = "3000";
    years[0].priorYearSaltDeduction = "3000";
    years[0].priorYearOtherItemizedDeductions = "17000";
    years.push({
        ...years[0], priorTaxYear: "2025", sourceReference: "Actual synthetic 2025 federal return and Schedule A",
        priorYearStandardDeduction: "15750", priorYearSaltMagi: "60000",
    });
    return { state, collection, years, payments };
}

it("reopens 2026 receipts with separate 2024 and 2025 deduction histories", () => {
    const { state, collection } = fixture2026();
    Object.assign(collection, captureGuidedRefundRecoverySources(state), { sourceFactsConfirmed: true });
    const values = new Map<string, string>();
    const storage: Storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: key => { values.delete(key); },
        clear: () => values.clear(),
        key: index => [...values.keys()][index] ?? null,
        get length() { return values.size; },
    };
    expect(saveGuidedFlowState(storage, "2026-refund", state)).toBe(true);
    const restored = required(loadGuidedFlowState(storage, "2026-refund"));
    expect(restored.sectionData["income-unemployment"]?.refundRecoveries).toEqual(collection);
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(restored));
    expect(input.taxableStateRefundRecoveries?.sourceTaxYear).toBe(2026);
    expect(input.taxableStateRefundRecoveries?.years.map(year => year.priorTaxYear)).toEqual([2024, 2025]);
    const result = calculateTaxableStateRefundRecoveries(input);
    expect(result.taxableRefund.toFixed()).toBe("400");
    expect(result.currentYearRefund.toFixed()).toBe("100");
    expect(calculateStateLocalIncomeTaxDeduction(input).total.toFixed()).toBe("900");
    expect(input.form1099G?.[1]?.refundPaymentBasis?.payments?.[3]?.currentYearPayment)
        .toEqual({ collection: "estimatedTaxPayments", index: 0 });
});

it("holds missing stale and conflicting 2026 source facts", () => {
    const { state, collection, years } = fixture2026();
    Object.assign(collection, captureGuidedRefundRecoverySources(state), { sourceFactsConfirmed: true });
    years[1].priorYearSaltMagi = "60001";
    expect(buildTaxInputFromGuidedData(state)).toBeNull();
    for (const invalidate of [
        ({ years }: ReturnType<typeof fixture2026>) => { delete years[1].priorYearSaltMagi; },
        ({ years }: ReturnType<typeof fixture2026>) => { years.pop(); },
        ({ years }: ReturnType<typeof fixture2026>) => { years[1].priorTaxYear = "2024"; },
        ({ collection }: ReturnType<typeof fixture2026>) => { collection.sourceTaxYear = "2025"; },
    ]) {
        const draft = fixture2026();
        invalidate(draft);
        Object.assign(draft.collection, captureGuidedRefundRecoverySources(draft.state), { sourceFactsConfirmed: true });
        expect(buildTaxInputFromGuidedData(draft.state)).toBeNull();
    }
    const mismatched = fixture2026();
    mismatched.payments[3].currentYearStatePaymentConfirmed = false;
    expect(() => captureGuidedRefundRecoverySources(mismatched.state)).toThrow(/payment years/);
    const older = fixture2026();
    required(older.state.sectionData["personal-info"]).dateOfBirth = "1962-01-01";
    expect(() => captureGuidedRefundRecoverySources(older.state)).toThrow(/under.?65/);
});

function required<T>(value:T|null|undefined):T{if(value==null)throw new Error("Missing synthetic source");return value;}
import {buildGuidedSyntheticDocuments} from "@/lib/guided-interview-bridge";
it("keeps unconfirmed or inconsistent recovery records visibly partial",()=>{
 const s=fixture();expect(buildGuidedSyntheticDocuments(s).find(row=>row.id==="guided:1099-g")?.coverage).toBe("partially-supported");
 const accepted=confirmedFixture();expect(buildGuidedSyntheticDocuments(accepted).find(row=>row.id==="guided:1099-g")?.coverage).toBe("supported");
 const d=required(accepted.sectionData["income-unemployment"]);required(required(d.refundRecoveries).years)[0].priorYearTaxableIncome="40001";
 Object.assign(required(d.refundRecoveries),captureGuidedRefundRecoverySources(accepted),{sourceFactsConfirmed:true});expect(buildGuidedSyntheticDocuments(accepted).find(row=>row.id==="guided:1099-g")?.coverage).toBe("partially-supported");
});
