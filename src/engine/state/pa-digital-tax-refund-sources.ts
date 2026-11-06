/** Source replay only; spec/state/pa-digital-tax-refund-sources.yaml. */
import Decimal from 'decimal.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { PADigitalTaxRefundSourcesSchema } from '@/models/pa-digital-tax-refund-sources.js';
import { PAOrdinaryReturnFactsSchema } from '@/models/pa-ordinary-return-facts.js';
import { calculateForm1099DASources } from '@/engine/forms/form-1099-da-sources.js';
import { Form1099DASchema, type TaxYearInput } from '@/models/inputs.js';
import type { CalculatedLine } from '@/models/outputs.js';
import { snapshotPAOrdinaryReturnOriginals, calculatePAOrdinaryReturnFacts } from './pa-ordinary-return-facts.js';
import { calculatePAResidencySources } from './pa-residency-sources.js';
import { ordinarySourcePrecision, publicOrdinaryMoney, publicOrdinaryLines } from './pa-ordinary-source-precision.js';
import { AuditTrail } from '@/utils/audit.js';
const fail = (message: string): never => { throw new Error('PA actual VA digital tax refund sources: ' + message); };
const ref = (value: string): void => { if (!value.trim()) fail('complete actual original reference or identifier required'); };
const identity = (value: string) => value.trim().replace(/\s+/g, ' ').toUpperCase();
const ssn = (value: string) => value.replace(/\D/g, '');
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + stable(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
function date(value: string): void {
  const parsed = new Date(value + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('actual original date is missing or invalid');
}
export interface PADigitalTaxRefundSourcesResult {
  actualVAWithholding: Decimal; actualReceivedRefund: Decimal; actualNetTaxPaid: Decimal; paResidentCredit: Decimal;
  coveredOriginalIndices: number[]; sourceCommitment: string; filingEligible: false; lines: CalculatedLine[];
}
/** Only actual full-refund evidence is admitted. No VA tax is computed and no PA credit is awarded. */
export function calculatePADigitalTaxRefundSources(input: TaxYearInput, rawFacts: unknown, raw: unknown): PADigitalTaxRefundSourcesResult {
  const Money = Decimal.clone({ precision: ordinarySourcePrecision(input, rawFacts, raw), rounding: Decimal.ROUND_HALF_UP });
  const money = (value: unknown): Decimal => {
    if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) return fail('actual nonnegative original amount is missing or invalid');
    const amount = new Money(value); if (!amount.isFinite()) return fail('actual original amount must be finite'); return amount;
  };
  const source = PADigitalTaxRefundSourcesSchema.parse(raw), facts = PAOrdinaryReturnFactsSchema.parse(rawFacts), year = input.taxpayer.taxYear, t = input.taxpayer.primary;
  if (year !== 2025 || source.sourceTaxYear !== year || source.sourceFactsConfirmed !== true || source.allVAIncomeTaxOriginalsReviewedConfirmed !== true || source.noOtherVAIncomeCreditsPaymentsOrAssessmentsConfirmed !== true) fail('complete actual2025 original review required; other VA income/credits/payments/assessments need another method');
  if (input.taxpayer.filingStatus !== 'single' || input.taxpayer.spouse || stable(source.owner) !== stable({ firstName: t.firstName, lastName: t.lastName, ssn: t.ssn })) fail('actual single primary owner does not match the complete current originals');
  ref(source.sourceReference); date(source.completeThroughDate);
  if (source.completeThroughDate !== facts.timing.asOfDate) fail('actual refund account must be complete through the current ordinary asof date');
  if (stable(source.originalFederalSources) !== stable(snapshotPAOrdinaryReturnOriginals(input)) || stable(source.originalPAResidencySources) !== stable(input.paResidencySources) || stable(source.originalPAFacts) !== stable(facts)) fail('retained actual federal/residency/ordinary source snapshot is stale; explicit reconfirmation required');
  const residency = calculatePAResidencySources(input, input.paResidencySources);
  if (residency.residencyStatus !== 'resident') fail('actual full-year PA resident digital source method required');
  calculatePAOrdinaryReturnFacts(input, facts);
  const checkIdentity = (record: { sourceTaxYear: number | null; accountName: string; accountSsn: string; state: string; sourceReference: string }): void => {
    ref(record.sourceReference);
    if (record.sourceTaxYear !== year || record.state !== 'VA' || identity(record.accountName) !== identity(t.firstName + ' ' + t.lastName) || ssn(record.accountSsn) !== ssn(t.ssn)) fail('actual original owner/year/VA jurisdiction does not match');
  };
  const expected: number[] = [], actual = calculateForm1099DASources(input);
  for (const row of actual.stateWithholding) {
    if (row.state === 'PA' || !money(row.stateWithheld).gt(0)) continue;
    const index = row.statementIndex, current = input.form1099DA[index];
    const parsed = Form1099DASchema.parse(current);
    if (stable(parsed) !== stable(current)) fail('current digital original is not canonical');
    if (row.state !== 'VA' || current.stateTaxReporting !== 'single' || current.taxYear !== year || current.accountHolder !== 'primary' || expected.includes(index)) fail('only current single-row primary2025 VA digital originals have this actual full-refund method');
    expected.push(index);
  }
  if (!expected.length || source.statements.length !== expected.length) fail('every positive current VA digital withholding original must be covered exactly once');
  const seen = new Set<number>(), confirmations = new Set<string>(); let gross = new Money(0);
  for (const row of source.statements) {
    ref(row.sourceReference); const index = row.originalIndex;
    if (index === null) return fail('actual current original index is unknown, duplicate or unsupported');
    if (!expected.includes(index) || seen.has(index) || row.sourceFactsConfirmed !== true) fail('actual current original index is unknown, duplicate or unsupported');
    seen.add(index); const current = input.form1099DA[index];
    if (stable(row.originalStatement) !== stable(current)) fail('actual private digital original is stale');
    const receipt = row.withholdingOriginal; checkIdentity(receipt); date(receipt.date); ref(receipt.confirmationNumber);
    if (receipt.date < '2025-01-01' || receipt.date > '2025-12-31' || receipt.date > source.completeThroughDate || confirmations.has(identity(receipt.confirmationNumber))) fail('actual remittance date or unique original receipt is invalid');
    confirmations.add(identity(receipt.confirmationNumber)); const paid = money(receipt.amount);
    if (!paid.gt(0) || !paid.eq(money(current.stateWithheld))) fail('actual original remittance must equal exact current VA statement withholding');
    gross = gross.plus(paid);
  }
  const filed = source.filedReturn; checkIdentity(filed); ref(filed.returnId); date(filed.filedOn);
  if (filed.returnKind !== 'original' || filed.filingStatus !== 'single' || filed.residency !== 'nonresident' || filed.filedOn <= '2025-12-31' || filed.filedOn > source.completeThroughDate || filed.allIncomeAndAdjustmentsReviewedConfirmed !== true || filed.noOtherPaymentsCreditsOffsetsOrTransfersConfirmed !== true || !money(filed.finalTax).isZero()) fail('actual original complete filed VA nonresident return with final tax0 and no other payments/credits is required');
  const printed = gross.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  for (const value of [filed.reportedWithholding, filed.totalPayments, filed.overpayment, filed.refundRequested]) if (!money(value).isInteger() || !money(value).eq(printed)) fail('actual filed VA reported whole-dollar amounts must reconcile exact original withholding separately');
  const application = source.specialWrittenApplication, award = source.agencyAward;
  if (gross.lt(1) && !application) fail('actual sub-dollar refund requires its special written taxpayer application');
  if (application) {
    checkIdentity(application); ref(application.applicationId); date(application.submittedOn);
    if (application.actuallySubmittedConfirmed !== true || application.submittedOn < filed.filedOn || application.submittedOn > source.completeThroughDate || !money(application.amountRequested).eq(gross)) fail('actual special written application date, amount and submission must reconcile');
  }
  checkIdentity(award); ref(award.awardId); date(award.issuedOn);
  if (award.actualAgencyDeterminationConfirmed !== true || award.issuedOn < filed.filedOn || award.issuedOn > source.completeThroughDate || !money(award.finalTaxDetermined).isZero() || !money(award.refundAwarded).eq(gross) || (application && (award.applicationId !== application.applicationId || award.issuedOn < application.submittedOn))) fail('actual matching final zero-tax agency refund determination required');
  const refund = source.refund; checkIdentity(refund); ref(refund.confirmationNumber); date(refund.postedOn); date(refund.receivedOn);
  const received = money(refund.amount);
  if (refund.actuallyReceivedConfirmed !== true || refund.postedOn < award.issuedOn || refund.receivedOn < refund.postedOn || refund.receivedOn > source.completeThroughDate || !received.eq(gross)) fail('actual full refund must be posted and received by asof with exact original cents');
  const account = source.account; checkIdentity(account); date(account.completeThroughDate);
  if (account.completeThroughDate !== source.completeThroughDate || account.allPaymentsRefundsTransfersOffsetsAndAdjustmentsReviewedConfirmed !== true || account.noAmendmentAssessmentOrPendingAdjustmentConfirmed !== true || !money(account.netTaxPaymentsReported).isZero() || !money(account.unpaidTaxReported).isZero() || !money(account.overpaymentOutstandingReported).isZero() || !gross.minus(received).isZero()) fail('actual complete final account must reconcile zero net paid, unpaid and outstanding amounts');
  const commitment = bytesToHex(sha256(new TextEncoder().encode(stable({ version: 'pa-va-digital-refund-originals-v1', source, originals: snapshotPAOrdinaryReturnOriginals(input), residency: input.paResidencySources, facts }))));
  const zero = new Decimal(0), audit = new AuditTrail();
  audit.record('PA-Digital-Tax-Refund-Sources', 'source', 'Private original refund source commitment', zero, 'SHA256 binds privately retained current original return, remittance, application, award and received-refund records', { sourceCommitment: commitment });
  audit.record('PA-Digital-Tax-Refund-Sources', 'withholding', 'Actual VA original digital withholding', publicOrdinaryMoney(gross), 'Exact original remittances, never added to PA withholding');
  audit.record('PA-Digital-Tax-Refund-Sources', 'refund', 'Actual received full VA refund', publicOrdinaryMoney(received), 'Actual posted and received agency refund, not a pending request');
  audit.record('PA-Digital-Tax-Refund-Sources', 'credit', 'PA resident credit on actually refunded tax', zero, '61 PA Code111.4(b): no PA credit for actually refunded overpayment');
  return { actualVAWithholding: publicOrdinaryMoney(gross), actualReceivedRefund: publicOrdinaryMoney(received), actualNetTaxPaid: zero, paResidentCredit: zero, coveredOriginalIndices: [...seen].sort((a, b) => a - b), sourceCommitment: commitment, filingEligible: false, lines: publicOrdinaryLines(audit.getLines()) };
}
