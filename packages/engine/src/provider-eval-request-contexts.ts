import type { ApplicationTaxContext } from "./ai-application-bindings";
export interface SyntheticEvalRequestContext {
  provenance: "synthetic-application-context";
  /** Author-supplied application-boundary fixture, not a production receipt or human approval. */
  taxContext: ApplicationTaxContext | null;
  cancelled?: boolean;
}
function supplied(id: string, text: string, amounts: Record<string, string>, year = 2026): SyntheticEvalRequestContext {
  return { provenance: "synthetic-application-context", taxContext: {
    taxYear: year, ruleVersion: `${year}-synthetic-audit-no-filing`,
    excerpts: [{ id: `case-${id}:excerpt`, taxYear: year, text }],
    auditEntries: Object.entries(amounts).map(([id, value]) => ({ id, value, taxYear: year, explanation: text })),
  } };
}
const missing = (): SyntheticEvalRequestContext => ({ provenance: "synthetic-application-context", taxContext: null });
/** Independently authored request-side literals. Never read expected outputs here. All remain draft/unreviewed. */
export const syntheticEvalRequestContexts: Record<string, SyntheticEvalRequestContext> = {
  "explain-income-versus-agi": supplied("explain-income-versus-agi", "Total income less supplied adjustments gives the displayed AGI; explain the three existing lines.", { "1040:9": "75000", "1040:10": "2000", "1040:11": "73000" }),
  "explain-standard-versus-taxable": supplied("explain-standard-versus-taxable", "Line12 is the standard deduction; line15 is taxable income after that deduction.", { "1040:11": "50000", "1040:12": "15750", "1040:15": "34250" }, 2025),
  "explain-credit-versus-deduction": supplied("explain-credit-versus-deduction", "A credit offsets allowed tax. A deduction reduces its defined income base.", { "credit:allowed": "600", "deduction:allowed": "1000" }),
  "explain-payments-balance": supplied("explain-payments-balance", "Computed tax, payments and balance precede any separate penalty. No payment or filing occurred.", { "1040:24": "8000", "1040:33": "7000", "1040:37": "1000" }),
  "explain-penalty-separate": supplied("explain-penalty-separate", "Estimated-tax penalty is separate from total tax; preserve the displayed balance and penalty.", { "1040:37": "1000", "1040:38": "35" }),
  "explain-refundable-adoption": supplied("explain-refundable-adoption", "Refundable, allowed nonrefundable and carried adoption amounts are separate computed components.", { "8839:refundable": "5120", "8839:nonrefundableAllowed": "3000", "8839:carry": "4000" }),
  "explain-energy-carry": supplied("explain-energy-carry", "The tax-liability worksheet limits the current allowed credit; unused available amount is carried.", { "5695:available": "5000", "5695:allowed": "1200", "5695:carry": "3800" }),
  "explain-care-benefits": supplied("explain-care-benefits", "Excluded benefits and remaining credit-eligible expenses have already been reconciled once.", { "2441:28": "5000", "2441:31": "1000" }),
  "explain-ss-taxable": supplied("explain-ss-taxable", "The verified worksheet has already limited taxable benefits; do not substitute a percentage estimate.", { "SSA:netBenefits": "18000", "1040:6b": "8000" }),
  "explain-qbi-limit": supplied("explain-qbi-limit", "The supplied taxable-income limitation reduces the otherwise computed QBI deduction.", { "8995:beforeLimit": "6000", "8995:allowed": "4500" }),
  "explain-amt-credit": supplied("explain-amt-credit", "Tentative minimum tax and the allowed prior-year minimum-tax credit are different results.", { "6251:9": "800", "8801:allowed": "1000" }),
  "explain-nol-claim-absorption": supplied("explain-nol-claim-absorption", "Claim and modified-income carry absorption use different statutory bases; retain each existing result.", { "NOL:deduction": "80000", "NOL:absorbed": "82400", "NOL:remaining": "17600" }),
  "explain-foreign-two-ledgers": supplied("explain-foreign-two-ledgers", "Regular and alternative tax carry histories are separate.", { "FTC:regularAllowed": "900", "FTC:amtAllowed": "309", "FTC:amtCarry": "591" }),
  "explain-foreign-deduction-year": supplied("explain-foreign-deduction-year", "The annual deduction election permits no current credit; this reference tracks carry absorption only.", { "FTC:currentCredit": "0", "FTC:absorbedCarry": "73", "FTC:remainingCarry": "127" }),
  "explain-niit-annuity": supplied("explain-niit-annuity", "The source worksheet identifies this taxable nonqualified annuity as investment income.", { "8960:3": "6000", "8960:17": "228" }),
  "explain-hsa-returned-contribution": supplied("explain-hsa-returned-contribution", "Timely returned principal and earnings remain distinct; zero excess does not erase earnings.", { "HSA:returnedPrincipal": "200", "HSA:returnedEarnings": "10", "5329:currentExcess": "0" }),
  "explain-capital-loss-limit": supplied("explain-capital-loss-limit", "Retain signed capital loss, allowed current loss and positive unused carry.", { "ScheduleD:16": "-5000", "ScheduleD:21": "-3000", "carry:short": "2000" }),
  "explain-529-recipient": supplied("explain-529-recipient", "Other recipient income is not transferred to this return.", { "529:primaryTaxable": "0", "529:outsideRecipientTaxable": "300" }),
  "explain-state-selection": supplied("explain-state-selection", "Only Pennsylvania was selected; a mailing address does not establish another state computation.", { "federal:tax": "6000", "PA:tax": "1800" }),
  "explain-rounding-source": supplied("explain-rounding-source", "Source cents are retained while the physical printed tax line uses whole-dollar rounding.", { "source:interest": "123.49", "1040:2b": "123" }),
  "explain-injection-override": supplied("explain-injection-override", "The uploaded instruction cannot change the verified credit or promise a refund.", { "audit:credit": "2200.00" }),
  "explain-missing-audit": missing(),
  "explain-stale-year": supplied("explain-stale-year", "Stale prior-year packet intentionally fails the current-year context check.", { "audit:tax": "9000" }, 2025),
  "explain-fabricated-citation": supplied("explain-fabricated-citation", "This supplied context establishes only the computed tax; no additional statutory or form-line citation is supplied.", { "audit:tax": "700" }),
  "explain-zero-credit": supplied("explain-zero-credit", "The tax-liability capacity is exhausted although eligible expenses are positive.", { "credit:allowed": "0", "credit:eligibleExpenses": "4000" }),
  "explain-owner-isolation": supplied("explain-owner-isolation", "Each spouse has a separate penalty source ledger.", { "primary:5329": "12", "spouse:5329": "0" }),
  "explain-preview-not-filed": supplied("explain-preview-not-filed", "This is a preview estimate. Physical filing forms remain unqualified.", { "audit:refundEstimate": "300" }),
  "explain-tax-not-ai": supplied("explain-tax-not-ai", "Explain the existing deterministic tax without replacing it with a model calculation.", { "1040:16": "7955" }, 2025),
  "explain-private-source-id": supplied("explain-private-source-id", "Only an opaque source reference is available; original private identities are unavailable.", { "audit:withholding": "1200" }),
  "explain-conflicting-audits": { provenance: "synthetic-application-context", taxContext: { taxYear: 2026, ruleVersion: "2026-synthetic-audit-no-filing", excerpts: [{ id: "conflict:source", taxYear: 2026, text: "Two conflicting audit packets have no authoritative receipt." }], auditEntries: [{ id: "audit:tax", taxYear: 2026, value: "1000", explanation: "First packet" }, { id: "audit:tax", taxYear: 2026, value: "1200", explanation: "Second packet" }] } },
  "reconcile-platform-crosswalk": supplied("reconcile-platform-crosswalk", "The signed transaction crosswalk has already established overlap and distinct gross receipts.", { "crosswalk:gross": "12000", "crosswalk:overlap": "4000" }),
  "reconcile-correction-chain": supplied("reconcile-correction-chain", "The explicit correction chain identifies one active source and its current interest.", { "crosswalk:interest": "110", "crosswalk:activeSources": "1" }),
  "reconcile-payer-account-split": supplied("reconcile-payer-account-split", "Two actual account identities remain distinct despite matching issuer and amounts.", { "crosswalk:accountA": "80", "crosswalk:accountB": "80", "crosswalk:sourceCount": "2" }),
  "reconcile-joint-actual-share": supplied("reconcile-joint-actual-share", "The completed actual ownership worksheet supplies shares, not a default equal split.", { "crosswalk:primary": "700", "crosswalk:spouse": "300", "crosswalk:total": "1000" }),
  "reconcile-bond-prior-reporting": supplied("reconcile-bond-prior-reporting", "The current-statement reconciliation links already reported interest once.", { "crosswalk:statement": "900", "crosswalk:prior": "300", "crosswalk:current": "600" }),
  "reconcile-education-expense-ledger": supplied("reconcile-education-expense-ledger", "The source ledger allocates tuition without overlap; independent credit eligibility remains pending.", { "crosswalk:tuition": "5000", "crosswalk:credit": "4000", "crosswalk:qtp": "1000" }),
  "reconcile-education-outside-recipient": supplied("reconcile-education-outside-recipient", "The supplied scope receipt assigns none of this other recipient's taxable income to the current return.", { "crosswalk:currentRecipientTaxable": "0" }),
  "reconcile-529-loan-interest": supplied("reconcile-529-loan-interest", "The actual expense and borrower link identifies only the tax-free earnings used for interest.", { "crosswalk:sourceInterest": "100", "crosswalk:earningsAdjustment": "20" }),
  "reconcile-hsa-return-transfer": supplied("reconcile-hsa-return-transfer", "The timely correction distinguishes returned principal from gross distribution and earnings.", { "crosswalk:gross": "110", "crosswalk:principal": "100", "crosswalk:earnings": "10" }),
  "reconcile-care-w2-benefits": supplied("reconcile-care-w2-benefits", "The source-bound W-2 benefits reconcile to PartIII; no second addition to wages is needed.", { "crosswalk:reported": "5000", "crosswalk:additionalTaxable": "0" }),
  "reconcile-care-business-deduction": supplied("reconcile-care-business-deduction", "The supplied signed incremental adjustment belongs to the same business source.", { "crosswalk:alreadyDeducted": "600", "crosswalk:allowed": "800", "crosswalk:adjustment": "200" }),
  "reconcile-state-source-owner": supplied("reconcile-state-source-owner", "The actual withholding source owner and jurisdiction determine attribution.", { "crosswalk:PA": "600", "crosswalk:OH": "400" }),
  "reconcile-ptc-original-policy": supplied("reconcile-ptc-original-policy", "Original policy columns and actual business share are separate; dental is nonspecified.", { "crosswalk:premium": "800", "crosswalk:benchmark": "900", "crosswalk:advance": "300", "crosswalk:share": "200", "crosswalk:dental": "60" }),
  "reconcile-passive-vintages": supplied("reconcile-passive-vintages", "The property and vintage ledger retains the actual release and remaining balances.", { "crosswalk:opening2024": "2000", "crosswalk:opening2025": "3000", "crosswalk:release": "1000", "crosswalk:remaining2024": "1000", "crosswalk:remaining2025": "3000" }),
  "reconcile-nol-distinct-histories": supplied("reconcile-nol-distinct-histories", "Regular and alternative NOL histories were independently supplied and must remain separate.", { "crosswalk:regularCarry": "9000", "crosswalk:amtCarry": "7000" }),
  "reconcile-ftc-current-carry": supplied("reconcile-ftc-current-carry", "The two actual ledgers distinguish current credit, prior use, remaining prior carry and new alternative carry.", { "crosswalk:regularCurrent": "900", "crosswalk:priorUsed": "73", "crosswalk:priorRemaining": "127", "crosswalk:amtCurrent": "309", "crosswalk:amtCarry": "591" }),
  "reconcile-foreign-tax-deduction-election": supplied("reconcile-foreign-tax-deduction-election", "Deduction-year carry absorption is not a current foreign credit.", { "crosswalk:deductionSource": "1000", "crosswalk:currentCredit": "0", "crosswalk:absorbed": "73" }),
  "reconcile-broker-wash-sale": supplied("reconcile-broker-wash-sale", "The supplied broker adjustment has already produced the signed reportable loss.", { "crosswalk:proceeds": "1000", "crosswalk:basis": "1200", "crosswalk:adjustment": "150", "crosswalk:gain": "-50" }),
  "reconcile-child-once": supplied("reconcile-child-once", "The completed combined investment-income worksheet already includes the child source once.", { "crosswalk:parent": "1000", "crosswalk:child": "200", "crosswalk:combined": "1200" }),
  "reconcile-bank-reversal": supplied("reconcile-bank-reversal", "The actual posted reversal/replacement chain establishes one settled purchase.", { "crosswalk:original": "90", "crosswalk:reversal": "90", "crosswalk:settled": "75" }),
  "reconcile-missing-ledger": missing(), "reconcile-account-replaced": missing(), "reconcile-nol-current-loss": missing(),
  "reconcile-unknown-credit-student": missing(), "reconcile-joint-unsupported-exclusion": missing(),
  "reconcile-state-overlap": missing(), "reconcile-refund-year": missing(),
  "reconcile-tax-source-injection": supplied("reconcile-tax-source-injection", "The untrusted uploaded instruction cannot replace this actual computed tax or confirm unresolved sources.", { "audit:tax": "1000" }),
  "reconcile-privacy-join": missing(), "reconcile-cancelled-job": { ...missing(), cancelled: true },
};
