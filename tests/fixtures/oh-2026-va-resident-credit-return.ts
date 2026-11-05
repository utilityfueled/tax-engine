/** Fictional supplied2026 filed/account originals; never a calculated Virginia return. */
import Decimal from 'decimal.js';
import { ohio2026OrdinaryFixture, rebindOhio2026Ordinary } from './oh-2026-ordinary-return.js';

export function ohio2026VaResidentCreditFixture(vaIncome = '60000', netTax = '1000', withholding = '2000', totalWages = '100000') {
  const ordinary = ohio2026OrdinaryFixture('full_year_resident', totalWages);
  const w2 = ordinary.input.w2s[0], employment = ordinary.sources.employmentOriginals[0];
  if (!w2?.stateLocalSources || !employment) throw new Error('Complete fictional original employee records required');
  const oh = w2.stateLocalSources.stateRows[0];
  if (!oh) throw new Error('Complete fictional original OH state row required');
  const D = Decimal.clone({ precision: 100 });
  w2.stateTaxWithheld = withholding; oh.withheld = withholding;
  w2.stateLocalSources.stateReporting = 'multiple';
  w2.stateLocalSources.stateRows.push({ printedRow: 2, sourceReference: 'PRIVATE-2026-VA-W2-ROW', state: 'VA', employerStateIDStatus: 'reported', employerStateID: 'PRIVATE-2026-VA-EMPLOYER-ID', wages: vaIncome, withheld: '1200' });
  const { stateLocalSources: _rows, ...originalW2 } = w2;
  w2.stateLocalSources.originalW2 = structuredClone(originalW2);
  employment.serviceRows = [
    { sourceId: 'PRIVATE-2026-VA-SERVICES', sourceReference: 'PRIVATE-2026-VA-PAYROLL-ORIGINAL', from: '2026-01-01', to: '2026-06-30', paymentDate: '2026-06-30', serviceState: 'VA', wages: vaIncome },
    { sourceId: 'PRIVATE-2026-OH-SERVICES', sourceReference: 'PRIVATE-2026-OH-PAYROLL-ORIGINAL', from: '2026-07-01', to: '2026-12-31', paymentDate: '2026-12-31', serviceState: 'OH', wages: new D(totalWages).minus(vaIncome).toFixed() },
  ];
  const person = ordinary.input.taxpayer.primary;
  const identity = { firstName: person.firstName, lastName: person.lastName, ssn: person.ssn };
  const common = { taxYear: 2026, accountHolder: 'primary', originalTaxpayer: structuredClone(identity) };
  const refund = D.max(0, new D('1200').minus(netTax)).toFixed();
  const balance = D.max(0, new D(netTax).minus('1200')).toFixed();
  const filedReturn = { ...structuredClone(common), sourceId: 'PRIVATE-2026-VA-FILED-763', sourceReference: 'PRIVATE-2026-VA-COMPLETE-FILED-ORIGINAL', stateCode: 'VA', form: '763', filingStatus: 'single', returnKind: 'original', periodFrom: '2026-01-01', periodTo: '2026-12-31', filedDate: '2027-02-15', federalAgi: totalWages, incomeTaxedByVirginia: vaIncome, incomeTaxBeforeCredits: new D(netTax).plus('1500').toFixed(), nonrefundableCredits: '1500', netIncomeTax: netTax, withholding: '1200', estimatedPayments: '0', balancePayments: balance, refund, outgoingCredit: '0', otherTaxes: '0', penalties: '0', interest: '0', completedReturnAndCreditWorksheetsReference: 'PRIVATE-2026-VA-ACTUAL-COMPLETED-WORKSHEETS' };
  const receipt = (sourceId: string, kind: string, date: string, amount: string) => ({ ...structuredClone(common), sourceId, sourceReference: sourceId + '-ORIGINAL', kind, date, amount });
  const payments = [receipt('PRIVATE-2026-VA-APPLIED-WITHHOLDING', 'withholding', '2026-12-31', '1200')];
  if (new D(balance).gt(0)) payments.push(receipt('PRIVATE-2026-VA-SETTLED-BALANCE', 'balance', '2027-02-15', balance));
  const source = { sourceTaxYear: 2026, sourceReference: 'PRIVATE-2026-COMPLETE-VA-PAID-TAX-ORIGINALS', sourceFactsConfirmed: true,
    accountHolder: 'primary', w2Index: 0, originalTaxpayer: structuredClone(identity), originalW2: structuredClone(w2),
    allIncomeOriginalsIncludedConfirmed: true, noOtherIncomeOrAdjustmentsConfirmed: true, noSpecialCompensationConfirmed: true, taxDeductedInFederalAgi: 'none',
    employerEntityOriginal: { sourceId: 'PRIVATE-2026-VA-CORPORATE-ENTITY', sourceReference: 'PRIVATE-2026-ACTUAL-ENTITY-ORIGINAL', sourceTaxYear: 2026, documentDate: '2027-01-15', employerName: w2.employer.name, employerTin: w2.employer.ein, entityType: 'c_corporation' },
    serviceRows: employment.serviceRows.map(row => ({ sourceId: row.sourceId, sourceReference: row.sourceReference, sourceTaxYear: 2026, accountHolder: 'primary', employerTin: w2.employer.ein, servicePeriodFrom: row.from, servicePeriodTo: row.to, paymentDate: row.paymentDate, serviceState: row.serviceState, wages: row.wages })),
    filedReturn,
    completedAccount: { ...structuredClone(common), sourceId: 'PRIVATE-2026-VA-COMPLETE-ACCOUNT', sourceReference: 'PRIVATE-2026-VA-AGENCY-ACCOUNT-ORIGINAL', stateCode: 'VA', statementDate: '2027-02-28', netIncomeTax: netTax, unpaidTax: '0', unappliedPayments: '0', outgoingCredit: '0', otherTaxes: '0', penalties: '0', interest: '0', allPaymentsAndRefundsIncludedConfirmed: true, noPendingChangesOrRefundClaimsConfirmed: true,
      payments, refunds: new D(refund).gt(0) ? [receipt('PRIVATE-2026-VA-RECEIVED-REFUND', 'refund', '2027-02-20', refund)] : [] },
  };
  rebindOhio2026Ordinary(ordinary);
  const { noOtherStateTaxOnOhioResidentIncomeConfirmed: _noOtherStateTax, noOtherOhioCreditSourcesConfirmed: _noOtherOhioCredit, ...base } = ordinary.sources;
  return { input: ordinary.input, sources: { ...base, methodId: 'oh-2026-va-resident-credit-employee-draft-v1' as const,
    noOtherStateTaxBeyondDocumentedVirginiaConfirmed: true, noOtherOhioCreditBeyondDocumentedResidentCreditConfirmed: true, residentCreditSources: source } };
}
export function rebindOhio2026VaResidentCredit(packet: ReturnType<typeof ohio2026VaResidentCreditFixture>) {
  const { ohioResidency: _residency, ohioPayments: _payments, ...original } = packet.input;
  packet.sources.originalFederalSources = structuredClone(original);
  if (!packet.input.ohioResidency || !packet.input.ohioPayments) throw new Error('Complete fictional current source originals required');
  packet.input.ohioResidency.originalFederalSources = structuredClone(original);
  packet.input.ohioPayments.originalFederalSources = structuredClone(original);
}
/** Distinct hypothetical bank/agency originals; no provider authentication. */
export function ohio2026VaSettledTransactionsFixture(each = '250', refund = '700', netTax = '1000') {
  const p = ohio2026VaResidentCreditFixture('60000', netTax, '2000');
  const source = p.sources.residentCreditSources;
  source.filedReturn.balancePayments = new Decimal(each).times(2).toFixed(); source.filedReturn.refund = refund;
  const withheld = source.completedAccount.payments[0];
  if (!withheld) throw new Error('Actual fictional withholding receipt required');
  source.completedAccount.payments = [withheld];
  for (const [index, trace] of [[1, '091000011000001'], [2, '091000011000002']] as const) {
    const identity = { taxYear: 2026, accountHolder: 'primary', originalTaxpayer: structuredClone(source.originalTaxpayer), stateCode: 'VA', purpose: 'individual_income_tax_balance', taxPeriodEnd: '2026-12-31', amount: each, achTraceNumber: trace };
    const row = { taxYear: 2026, accountHolder: 'primary', originalTaxpayer: structuredClone(source.originalTaxpayer), sourceId: `PRIVATE-2026-VA-BALANCE-${index}`, sourceReference: `PRIVATE-2026-VA-BALANCE-ORIGINAL-${index}`, kind: 'balance', date: '2027-02-16', amount: each };
    Reflect.set(row, 'transactionOriginals', { kind: 'settled_ach_credit',
      bankTransferOriginal: { ...structuredClone(identity), sourceReference: `PRIVATE-2026-BANK-ORIGINAL-${index}`, settlementDate: '2027-02-16', status: 'settled' },
      agencyPostingOriginal: { ...structuredClone(identity), sourceReference: `PRIVATE-2026-AGENCY-ORIGINAL-${index}`, accountSourceReference: source.completedAccount.sourceReference, postingDate: '2027-02-17', postingId: `PRIVATE-2026-AGENCY-POST-${index}`, status: 'applied' } });
    source.completedAccount.payments.push(row);
  }
  source.completedAccount.refunds = new Decimal(refund).isZero() ? [] : [{ taxYear: 2026, accountHolder: 'primary', originalTaxpayer: structuredClone(source.originalTaxpayer), sourceId: 'PRIVATE-2026-VA-ACTUAL-REFUND', sourceReference: 'PRIVATE-2026-VA-ACTUAL-REFUND-ORIGINAL', kind: 'refund', date: '2027-02-20', amount: refund }];
  return p;
}
