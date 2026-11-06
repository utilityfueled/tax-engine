// Spec: spec/state/pa-digital-refund-remittance-identity.yaml
import { expect, it } from 'vitest';
import { guidedPACompleteDigital } from '../../fixtures/guided-pa-digital-complete';
import { calculatePADigitalTaxRefundSources } from '@/engine/state/pa-digital-tax-refund-sources';
import { snapshotPAOrdinaryReturnOriginals } from '@/engine/state/pa-ordinary-return-facts';
/** Two distinct fictional statements, but the negative controls supply one receipt twice. */
function twoOriginalStatements() {
  const f = guidedPACompleteDigital(), extra = structuredClone(f.input.form1099DA[2]);
  extra.sourceId = 'Author separate fictional VA digital original4';
  extra.accountReference = 'Author separate fictional account4';
  for (const [index, transaction] of extra.transactions.entries()) transaction.sourceId = `Author actual fourth disposition${index}`;
  f.input.form1099DA.push(extra);
  const digital = f.input.paResidencySources.digitalSources;
  if (!digital) throw new Error('Explicit fictional actual digital source packet required');
  digital.statements.push({ ...structuredClone(digital.statements[2]), originalIndex: 3, sourceReference: 'Author actual separate fourth statement classification original' });
  const receipt = structuredClone(f.refundSources.statements[0]); receipt.originalIndex = 3;
  receipt.sourceReference = 'Author actual separate fourth statement remittance source';
  receipt.withholdingOriginal.sourceReference = 'Author actual separate retained bank receipt4';
  f.refundSources.statements.push(receipt);
  for (const key of ['reportedWithholding', 'totalPayments', 'overpayment', 'refundRequested'] as const) f.refundSources.filedReturn[key] = '1';
  f.refundSources.specialWrittenApplication.amountRequested = '0.60';
  f.refundSources.agencyAward.refundAwarded = '0.60'; f.refundSources.refund.amount = '0.60';
  for (const row of digital.statements) if (row.originalIndex !== null) row.original = structuredClone(f.input.form1099DA[row.originalIndex]);
  f.facts.originalFederalSources = snapshotPAOrdinaryReturnOriginals(f.input);
  f.refundSources.originalFederalSources = snapshotPAOrdinaryReturnOriginals(f.input);
  f.refundSources.originalPAResidencySources = structuredClone(f.input.paResidencySources);
  f.refundSources.originalPAFacts = structuredClone(f.facts);
  for (const row of f.refundSources.statements) row.originalStatement = structuredClone(f.input.form1099DA[row.originalIndex]);
  return f;
}
it.each(['case', 'outer whitespace', 'inner whitespace', 'combined'])('author semantic duplicate original remittance remains one receipt: %s', variant => {
  const f = twoOriginalStatements();
  f.refundSources.statements[0].withholdingOriginal.confirmationNumber = 'Author Receipt Same';
  f.refundSources.statements[1].withholdingOriginal.confirmationNumber = variant === 'case' ? 'AUTHOR RECEIPT SAME'
    : variant === 'outer whitespace' ? ' Author Receipt Same '
    : variant === 'inner whitespace' ? 'Author  Receipt Same' : ' AUTHOR  RECEIPT SAME ';
  const original = JSON.stringify(f);
  expect(() => calculatePADigitalTaxRefundSources(f.input, f.facts, f.refundSources)).toThrow(/unique original receipt/i);
  expect(JSON.stringify(f)).toBe(original);
  expect(f.refundSources.refund.amount).toBe('0.60');
  expect(f.refundSources.statements.map(row => row.withholdingOriginal.amount)).toEqual(['0.30', '0.30']);
});
