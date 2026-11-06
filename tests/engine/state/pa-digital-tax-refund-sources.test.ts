// Spec: spec/state/pa-digital-tax-refund-sources.yaml
import Decimal from 'decimal.js';
import { expect, it } from 'vitest';
import { calculatePADigitalTaxRefundSources as calculate } from '@/engine/state/pa-digital-tax-refund-sources';
import { confirmGuidedPADigitalTaxRefundSources, buildGuidedPADigitalTaxRefundSources } from '@/lib/guided-pa-digital-tax-refund-sources';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
import { guidedPACompleteDigital } from '../../fixtures/guided-pa-digital-complete';
const run = (f: ReturnType<typeof guidedPACompleteDigital>) => calculate(f.input, f.facts, f.refundSources);
function rebind(f: ReturnType<typeof guidedPACompleteDigital>) {
  const digital = f.input.paResidencySources.digitalSources;
  if (!digital) throw new Error('Fictional current PA digital originals required');
  for (const row of digital.statements) if (row.originalIndex !== null) row.original = structuredClone(f.input.form1099DA[row.originalIndex]);
  f.facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(f.input);
  const packet = f.refundSources;
  packet.originalFederalSources = snapshotPAOrdinaryReturnOriginals(f.input);
  packet.originalPAResidencySources = structuredClone(f.input.paResidencySources);
  packet.originalPAFacts = structuredClone(f.facts);
  for (const row of packet.statements) row.originalStatement = structuredClone(f.input.form1099DA[row.originalIndex]);
}
function amount(f: ReturnType<typeof guidedPACompleteDigital>, exact: string, reported: string) {
  const source = f.input.form1099DA[2], row = f.refundSources.statements[0];
  if (!source || !row) throw new Error('Fictional VA digital source required');
  source.stateWithheld = exact; row.withholdingOriginal.amount = exact;
  f.refundSources.filedReturn.reportedWithholding = reported; f.refundSources.filedReturn.totalPayments = reported;
  f.refundSources.filedReturn.overpayment = reported; f.refundSources.filedReturn.refundRequested = reported;
  f.refundSources.specialWrittenApplication.amountRequested = exact;
  f.refundSources.agencyAward.refundAwarded = exact; f.refundSources.refund.amount = exact;
  rebind(f);
}
it('actual full VA refund admits no PA credit and retains original cents', () => {
  const f = guidedPACompleteDigital(), result = run(f);
  expect(result.actualVAWithholding.toFixed()).toBe('0.3'); expect(result.actualReceivedRefund.toFixed()).toBe('0.3');
  expect(result.actualNetTaxPaid.toFixed()).toBe('0'); expect(result.paResidentCredit.toFixed()).toBe('0');
  expect(result.coveredOriginalIndices).toEqual([2]); expect(result.filingEligible).toBe(false);
  expect(f.refundSources.filedReturn.reportedWithholding).toBe('0');
  expect(f.input.form1099DA[2].stateWithheld).toBe('0.30');
});
it('refund replay is read-only and public audit excludes private originals', () => {
  const f = guidedPACompleteDigital(), before = JSON.stringify(f), result = run(f);
  expect(JSON.stringify(f)).toBe(before); expect(result.sourceCommitment).toMatch(/^[a-f0-9]{64}$/);
  const audit = JSON.stringify(result.lines);
  for (const privateValue of [f.input.taxpayer.primary.ssn, f.input.taxpayer.primary.firstName, f.refundSources.sourceReference,
    f.refundSources.filedReturn.returnId, f.refundSources.refund.confirmationNumber, f.input.form1099DA[2].accountReference]) expect(audit).not.toContain(privateValue);
});
it('missing unknown or mismatched actual source facts cannot establish a refund', () => {
  for (const field of ['sourceFactsConfirmed', 'allVAIncomeTaxOriginalsReviewedConfirmed', 'noOtherVAIncomeCreditsPaymentsOrAssessmentsConfirmed']) {
    const f = guidedPACompleteDigital(); Object.assign(f.refundSources, { [field]: null }); expect(() => run(f), field).toThrow();
  }
  for (const change of ['topYear', 'topOwner', 'missingAsOf', 'filedOwner', 'filedYear', 'filedState', 'filedKind', 'filedUnknown', 'filedStatus', 'filedReview', 'otherCredits', 'positiveTax', 'unpaid', 'netPaid', 'outstanding', 'accountUnknown', 'pendingAssessment']) {
    const f = guidedPACompleteDigital(), p = f.refundSources;
    if (change === 'topYear') p.sourceTaxYear = 2026;
    if (change === 'topOwner') p.owner.ssn = '999-77-0011';
    if (change === 'missingAsOf') p.completeThroughDate = '';
    if (change === 'filedOwner') p.filedReturn.accountSsn = '999-77-0011';
    if (change === 'filedYear') p.filedReturn.sourceTaxYear = 2024;
    if (change === 'filedState') p.filedReturn.state = 'NY';
    if (change === 'filedKind') p.filedReturn.returnKind = 'amended';
    if (change === 'filedUnknown') p.filedReturn.finalTax = '';
    if (change === 'filedStatus') p.filedReturn.filingStatus = 'joint';
    if (change === 'filedReview') Object.assign(p.filedReturn, { allIncomeAndAdjustmentsReviewedConfirmed: null });
    if (change === 'otherCredits') p.filedReturn.noOtherPaymentsCreditsOffsetsOrTransfersConfirmed = false;
    if (change === 'positiveTax') p.filedReturn.finalTax = '0.01';
    if (change === 'unpaid') p.account.unpaidTaxReported = '0.01';
    if (change === 'netPaid') p.account.netTaxPaymentsReported = '0.01';
    if (change === 'outstanding') p.account.overpaymentOutstandingReported = '0.01';
    if (change === 'accountUnknown') Object.assign(p.account, { allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed: null });
    if (change === 'pendingAssessment') p.account.noAmendmentAssessmentOrPendingAdjustmentConfirmed = false;
    expect(() => run(f), change).toThrow();
  }
});
it('every actual source snapshot remains bound to current facts', () => {
  for (const change of ['federal', 'residency', 'facts', 'currentDA', 'privateDA', 'newYear', 'currentOwner']) {
    const f = guidedPACompleteDigital();
    if (change === 'federal') Object.assign(f.refundSources.originalFederalSources, { sourceCorruption: true });
    if (change === 'residency') Object.assign(f.refundSources.originalPAResidencySources, { sourceCorruption: true });
    if (change === 'facts') Object.assign(f.refundSources.originalPAFacts, { sourceCorruption: true });
    if (change === 'currentDA') f.input.form1099DA[2].accountReference = 'Changed actual source';
    if (change === 'privateDA') f.refundSources.statements[0].originalStatement.accountReference = 'Changed retained source';
    if (change === 'newYear') f.input.taxpayer.taxYear = 2026;
    if (change === 'currentOwner') f.input.taxpayer.primary.lastName = 'Changed actual owner';
    expect(() => run(f), change).toThrow();
  }
});
it('refunds must actually be received and reconcile dated originals', () => {
  for (const change of ['unreceived', 'unknownReceived', 'futureReceived', 'beforeAward', 'postedBeforeAward', 'beforeYear', 'badDate', 'unknownReference', 'wrongReceipt', 'overRefund', 'missingRefund', 'differentAsOf', 'futureFiled', 'withholdingYear', 'receiptOwner']) {
    const f = guidedPACompleteDigital(), p = f.refundSources;
    if (change === 'unreceived') p.refund.actuallyReceivedConfirmed = false;
    if (change === 'unknownReceived') p.refund.receivedOn = '';
    if (change === 'futureReceived') p.refund.receivedOn = '2026-03-02';
    if (change === 'beforeAward') p.refund.receivedOn = '2026-02-19';
    if (change === 'postedBeforeAward') p.refund.postedOn = '2026-02-19';
    if (change === 'beforeYear') p.filedReturn.filedOn = '2025-12-31';
    if (change === 'badDate') p.refund.receivedOn = '2026-02-30';
    if (change === 'unknownReference') p.refund.confirmationNumber = '';
    if (change === 'wrongReceipt') p.refund.amount = '0.29';
    if (change === 'overRefund') p.refund.amount = '0.31';
    if (change === 'missingRefund') Object.assign(p, { refund: undefined });
    if (change === 'differentAsOf') p.account.completeThroughDate = '2026-02-28';
    if (change === 'futureFiled') p.filedReturn.filedOn = '2026-03-02';
    if (change === 'withholdingYear') p.statements[0].withholdingOriginal.date = '2024-06-01';
    if (change === 'receiptOwner') p.refund.accountSsn = '999-77-0011';
    expect(() => run(f), change).toThrow();
  }
});
it('sub-dollar refund needs its actual special application and agency determination', () => {
  for (const change of ['missingApplication', 'unknownApplication', 'unknownApplicationReference', 'wrongApplication', 'lateApplication', 'applicationOwner', 'applicationYear', 'missingAward', 'unknownAward', 'wrongAward', 'awardFinalTax', 'awardLink', 'earlyAward', 'futureAward']) {
    const f = guidedPACompleteDigital(), p = f.refundSources;
    if (change === 'missingApplication') Object.assign(p, { specialWrittenApplication: null });
    if (change === 'unknownApplication') p.specialWrittenApplication.actuallySubmittedConfirmed = false;
    if (change === 'unknownApplicationReference') p.specialWrittenApplication.applicationId = '';
    if (change === 'wrongApplication') p.specialWrittenApplication.amountRequested = '0.29';
    if (change === 'lateApplication') p.specialWrittenApplication.submittedOn = '2026-02-22';
    if (change === 'applicationOwner') p.specialWrittenApplication.accountSsn = '999-77-0011';
    if (change === 'applicationYear') p.specialWrittenApplication.sourceTaxYear = 2024;
    if (change === 'missingAward') Object.assign(p, { agencyAward: null });
    if (change === 'unknownAward') p.agencyAward.actualAgencyDeterminationConfirmed = false;
    if (change === 'wrongAward') p.agencyAward.refundAwarded = '0.31';
    if (change === 'awardFinalTax') p.agencyAward.finalTaxDetermined = '0.01';
    if (change === 'awardLink') p.agencyAward.applicationId = 'Wrong linked application';
    if (change === 'earlyAward') p.agencyAward.issuedOn = '2026-02-15';
    if (change === 'futureAward') p.agencyAward.issuedOn = '2026-03-02';
    expect(() => run(f), change).toThrow();
  }
});
it('every positive VA digital withholding original is reconciled exactly once', () => {
  for (const change of ['missing', 'duplicate', 'wrongIndex', 'unknownIndex', 'wrongAmount', 'missingAmount', 'negativeAmount', 'otherState', 'rowUnknown', 'missingRowRef', 'paymentOwner', 'duplicateOtherSource', 'uncoveredMultipleSource']) {
    const f = guidedPACompleteDigital(), p = f.refundSources;
    if (change === 'missing') p.statements = [];
    if (change === 'duplicate') p.statements.push(structuredClone(p.statements[0]));
    if (change === 'wrongIndex') p.statements[0].originalIndex = 1;
    if (change === 'unknownIndex') Object.assign(p.statements[0], { originalIndex: null });
    if (change === 'wrongAmount') p.statements[0].withholdingOriginal.amount = '0.29';
    if (change === 'missingAmount') p.statements[0].withholdingOriginal.amount = '';
    if (change === 'negativeAmount') p.statements[0].withholdingOriginal.amount = '-0.30';
    if (change === 'otherState') { f.input.form1099DA[2].state = 'NY'; rebind(f); }
    if (change === 'rowUnknown') Object.assign(p.statements[0], { sourceFactsConfirmed: null });
    if (change === 'missingRowRef') p.statements[0].sourceReference = '';
    if (change === 'paymentOwner') p.statements[0].withholdingOriginal.accountSsn = '999-77-0011';
    if (change === 'duplicateOtherSource') {
      const row = structuredClone(f.input.form1099DA[2]); row.sourceId = 'Fictional uncovered second VA statement'; row.accountReference = 'Fictional uncovered account'; f.input.form1099DA.push(row);
      const digital = f.input.paResidencySources.digitalSources; if (!digital) throw new Error('Fictional actual digital sources required');
      digital.statements.push({ ...structuredClone(digital.statements[2]), originalIndex: 3, sourceReference: 'Fictional actual complete second VA original' }); rebind(f);
    }
    if (change === 'uncoveredMultipleSource') {
      const extra = structuredClone(f.input.form1099DA[0]); extra.sourceId = 'Fictional uncovered multiple-state statement'; extra.accountReference = 'Fictional multiple-state separate account';
      extra.stateTaxReporting = 'multiple'; delete extra.state; delete extra.stateWithheld; extra.stateWithholding = [{ state: 'VA', stateWithheld: '0.01' }];
      f.input.form1099DA.push(extra);
      const digital = f.input.paResidencySources.digitalSources; if (!digital) throw new Error('Fictional actual digital sources required');
      digital.statements.push({ ...structuredClone(digital.statements[0]), originalIndex: 3, sourceReference: 'Fictional complete actual multiple-state original', actualPaymentToPAConfirmed: false });
      rebind(f);
    }
    expect(() => run(f), change).toThrow();
  }
});
it('reported whole dollars never replace exact refund originals', () => {
  for (const [raw, printed] of [['0.30', '0'], ['0.50', '1'], ['1.49', '1'], ['1.50', '2']]) {
    const f = guidedPACompleteDigital(); amount(f, raw, printed); const result = run(f);
    expect(result.actualVAWithholding.toFixed()).toBe(new Decimal(raw).toFixed()); expect(result.actualReceivedRefund.toFixed()).toBe(new Decimal(raw).toFixed());
    expect(result.actualNetTaxPaid.toFixed()).toBe('0'); expect(result.paResidentCredit.toFixed()).toBe('0');
    f.refundSources.filedReturn.reportedWithholding = raw;
    expect(() => run(f)).toThrow();
  }
});
it('source precision does not discard tiny original withholding receipts', () => {
  const f = guidedPACompleteDigital(), tiny = '0.000000000000000000000000000001', sum = '0.300000000000000000000000000001';
  const extra = structuredClone(f.input.form1099DA[2]); extra.sourceId = 'Fictional second exact tiny VA original'; extra.accountReference = 'Fictional tiny separate account'; extra.stateWithheld = tiny;
  f.input.form1099DA.push(extra);
  const row = structuredClone(f.refundSources.statements[0]); row.originalIndex = 3; row.sourceReference = 'Fictional separate exact tiny VA original remittance'; row.withholdingOriginal.amount = tiny; row.withholdingOriginal.confirmationNumber = 'Fictional tiny separate original tax remittance'; f.refundSources.statements.push(row);
  const digital = f.input.paResidencySources.digitalSources; if (!digital) throw new Error('Fictional PA digital originals required');
  digital.statements.push({ ...structuredClone(digital.statements[2]), originalIndex: 3, sourceReference: 'Fictional separate tiny actual VA digital row' });
  f.refundSources.specialWrittenApplication.amountRequested = sum; f.refundSources.agencyAward.refundAwarded = sum; f.refundSources.refund.amount = sum;
  rebind(f);
  const result = run(f); expect(result.actualVAWithholding.toFixed()).toBe(sum); expect(result.actualReceivedRefund.toFixed()).toBe(sum); expect(result.actualNetTaxPaid.toFixed()).toBe('0');
});
it('explicit confirmation alone binds refund sources after an actual source edit', () => {
  const f = guidedPACompleteDigital(), old = structuredClone(f.refundSources);
  f.input.form1099DA[2].accountReference = 'Fictional actual renamed account original';
  // Separate explicit PA original confirmation represented by the fixture action.
  rebind(f); const draft = structuredClone(f.refundSources); draft.originalFederalSources = old.originalFederalSources;
  const before = JSON.stringify(draft); expect(() => buildGuidedPADigitalTaxRefundSources(f.input, f.facts, draft)).toThrow(); expect(JSON.stringify(draft)).toBe(before);
  const confirmed = confirmGuidedPADigitalTaxRefundSources(f.input, f.facts, draft);
  expect(calculate(f.input, f.facts, confirmed).actualNetTaxPaid.toFixed()).toBe('0'); expect(JSON.stringify(draft)).toBe(before);
});
