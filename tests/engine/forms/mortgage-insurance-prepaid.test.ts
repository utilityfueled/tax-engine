// Spec: spec/federal/mortgage-insurance-prepaid.yaml. Fictional original documents only.
import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { TaxYearInputSchema } from '@/models/inputs.js';
import { calculateScheduleA } from '@/engine/schedules/schedule-a.js';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed.js';
import { getConstants, type FilingStatus } from '@/models/constants.js';
import { getRulePack } from '@/models/rule-pack-metadata.js';

function originals() {
  const prepaidSources = {
    method: 'current-original-prepaid', sourceTaxYear: 2026, sourceReference: 'Fictional closing policy and paid premium receipt',
    sourceFactsConfirmed: true, allPremiumsIncluded: true, form1098SourceId: 'fictional-1098-1', mortgageLoanSourceId: 'fictional-loan-1',
    lenderName: 'Fictional lender', loanAccountReference: 'fictional-account-1', payer: 'primary', provider: 'private', privateInsuranceMeetsHpaDefinition: true,
    premiumAllocableBeyondYearEnd: true, prepaidPremiumPaid: '9240', paymentMethod: 'cash', paidDate: '2026-05-15', insuranceObtainedDate: '2026-05-15', statedTermMonths: 180,
    mortgageOutstandingAtYearEnd: true, mortgageSatisfiedDate: null, refinanced: false, premiumsRefunded: false,
    insuranceCancelled: false, otherBorrowerPayments: false, rentalOrBusinessUse: false, otherPremiumPayments: false,
  };
  const qualification: { allocationTaxYear: number; contractIssueDate: string; qualifiedProvider: boolean; acquisitionDebt: boolean; qualifiedResidence: boolean; premiumsAllocableToYear?: string; prepaidSources: typeof prepaidSources } = {
    allocationTaxYear: 2026, contractIssueDate: '2026-05-15', qualifiedProvider: true, acquisitionDebt: true, qualifiedResidence: true, prepaidSources,
  };
  return {
    taxpayer: { taxYear: 2026, filingStatus: 'single' as FilingStatus, primary: { firstName: 'Fictional', lastName: 'Taxpayer', ssn: '900-00-0001', dateOfBirth: '1980-01-01' }, address: { street: '1 Fictional', city: 'Test', state: 'TX', zip: '00000' } },
    form1098: [{ sourceId: 'fictional-1098-1', taxYear: 2026, lender: 'Fictional lender', loanAccountReference: 'fictional-account-1', mortgageOriginationDate: '2026-05-15', mortgageInterestReceived: '0', outstandingMortgagePrincipal: '100000', refundOfOverpaidInterest: '0', mortgageInsurancePremiums: '0', pointsPaid: '0', mortgageInsuranceQualification: qualification }],
    mortgageInterestWorksheet: { sourceTaxYear: 2026, sourceReference: 'Fictional complete mortgage originals', sourceFactsConfirmed: true, allHomeDebtIncluded: true,
      loans: [{ sourceId: 'fictional-loan-1', form1098SourceId: 'fictional-1098-1', lenderName: 'Fictional lender', loanAccountReference: 'fictional-account-1', accountHolder: 'primary', homeId: 'fictional-home', homeUse: 'main', qualifiedResidence: true, securedDebt: true, ownershipInterest: true, obligationToRepay: true, originationDate: '2026-05-15', loanType: 'original', acquisitionUse: true, currentYearInterestOnly: true,
        interestPaid: '0', interestPaidByOthers: '0', interestDeductedElsewhere: '0', sameYearInterestRefund: '0', nonqualifiedInterest: '0', pointsPaid: '0', pointsPaidByOthers: '0', pointsNotInterest: '0', points: { method: 'none' }, balance: { method: 'highest_balance', amount: '100000', sourceReference: 'Fictional principal source' } }], priorYearInterestRecoveries: [] },
  };
}
type Originals = ReturnType<typeof originals>;
function calculate(raw: Originals = originals(), agi = '76000') {
  const input = TaxYearInputSchema.parse(raw);
  return calculateScheduleA(input, new Decimal(agi), input.taxpayer.filingStatus, input.taxpayer.taxYear === 2026 ? FEDERAL_2026_CONSTANTS : getConstants(2025));
}
function manual(raw: Originals, amount = '880') { raw.form1098[0].mortgageInsuranceQualification.premiumsAllocableToYear = amount; }
function withoutSources(raw: Originals) { Reflect.deleteProperty(raw.form1098[0].mortgageInsuranceQualification, 'prepaidSources'); }

describe('actual original prepaid mortgage insurance source contract', () => {
  it.each([
    ['IRS Ryan arithmetic with actual May2026 originals', '9240', 180, '2026-05-15', 'cash', '880'],
    ['shorter stated24month term', '9240', 24, '2026-05-15', 'cash', '3080'],
    ['December source month', '9240', 180, '2026-12-15', 'cash', '110'],
    ['financed original premium', '9240', 180, '2026-05-15', 'financed', '880'],
    ['known zero original premium', '0', 180, '2026-05-15', 'cash', '0'],
  ])('derives literal allocation through actual canonical parsed API: %s', (_label, premium, term, date, method, expected) => {
    const raw = originals(); const source = raw.form1098[0].mortgageInsuranceQualification.prepaidSources;
    Object.assign(source, { prepaidPremiumPaid: premium, statedTermMonths: term, paidDate: date, insuranceObtainedDate: date, paymentMethod: method });
    raw.form1098[0].mortgageOriginationDate = String(date); raw.form1098[0].mortgageInsuranceQualification.contractIssueDate = String(date); raw.mortgageInterestWorksheet.loans[0].originationDate = String(date);
    const before = JSON.stringify(raw); const result = calculate(raw);
    expect(result.mortgageInsurancePremiums.toString()).toBe(expected);
    expect(result.totalItemized.toString()).toBe(expected);
    expect(JSON.stringify(raw)).toBe(before);
  });
  it('accepts actual FHA without inventing a private insurance determination', () => {
    const raw = originals(); raw.form1098[0].mortgageInsuranceQualification.prepaidSources.provider = 'fha';
    Reflect.deleteProperty(raw.form1098[0].mortgageInsuranceQualification.prepaidSources, 'privateInsuranceMeetsHpaDefinition');
    expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('880');
  });
  it('reconciles manual annual amount exactly without double counting', () => {
    const raw = originals(); manual(raw); expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('880');
    manual(raw, '879.99'); expect(() => calculate(raw)).toThrow(/reconcile|allocation/i);
    manual(raw, '880.01'); expect(() => calculate(raw)).toThrow(/reconcile|allocation/i);
  });
  it('preserves cents and actual partial AGI step', () => {
    const raw = originals(); raw.form1098[0].mortgageInsuranceQualification.prepaidSources.prepaidPremiumPaid = '5.25';
    expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('1');
    expect(calculate(originals(), '100000.01').mortgageInsurancePremiums.toString()).toBe('792');
    raw.taxpayer.filingStatus = 'married_filing_separately';
    expect(calculate(raw, '50000.01').mortgageInsurancePremiums.toString()).toBe('0');
    expect(calculate(raw, '50000').mortgageInsurancePremiums.toString()).toBe('1');
  });
  it('rounds the aggregate once across two independent original loans', () => {
    const raw = originals(); const second = originals();
    raw.form1098[0].mortgageInsuranceQualification.prepaidSources.prepaidPremiumPaid = '5.25';
    second.form1098[0].sourceId = 'fictional-1098-2'; second.form1098[0].loanAccountReference = 'fictional-account-2';
    const q = second.form1098[0].mortgageInsuranceQualification; q.prepaidSources.prepaidPremiumPaid = '5.25'; q.prepaidSources.form1098SourceId = 'fictional-1098-2'; q.prepaidSources.mortgageLoanSourceId = 'fictional-loan-2'; q.prepaidSources.loanAccountReference = 'fictional-account-2';
    const loan = second.mortgageInterestWorksheet.loans[0]; loan.sourceId = 'fictional-loan-2'; loan.form1098SourceId = 'fictional-1098-2'; loan.loanAccountReference = 'fictional-account-2'; loan.homeId = 'fictional-second-home'; loan.homeUse = 'second';
    raw.form1098.push(second.form1098[0]); raw.mortgageInterestWorksheet.loans.push(loan);
    expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('1');
  });
  it.each(['sourceReference', 'sourceTaxYear', 'form1098SourceId', 'mortgageLoanSourceId', 'lenderName', 'loanAccountReference', 'payer', 'provider', 'prepaidPremiumPaid', 'paymentMethod', 'paidDate', 'insuranceObtainedDate', 'statedTermMonths', 'mortgageOutstandingAtYearEnd', 'mortgageSatisfiedDate', 'refinanced', 'premiumsRefunded', 'insuranceCancelled', 'otherBorrowerPayments', 'rentalOrBusinessUse', 'otherPremiumPayments', 'sourceFactsConfirmed', 'allPremiumsIncluded', 'privateInsuranceMeetsHpaDefinition', 'premiumAllocableBeyondYearEnd'])(
    'does not let a supplied manual amount hide unknown source %s', key => {
      const raw = originals(); manual(raw); Reflect.deleteProperty(raw.form1098[0].mortgageInsuranceQualification.prepaidSources, key);
      expect(() => calculate(raw)).toThrow();
    });
  it.each([
    { premiumAllocableBeyondYearEnd: false }, { sourceTaxYear: 2025 }, { sourceFactsConfirmed: false }, { allPremiumsIncluded: false }, { mortgageOutstandingAtYearEnd: false }, { mortgageSatisfiedDate: '2026-11-01' },
    { refinanced: true }, { premiumsRefunded: true }, { insuranceCancelled: true }, { otherBorrowerPayments: true }, { rentalOrBusinessUse: true }, { otherPremiumPayments: true },
    { payer: 'spouse' }, { provider: 'va' }, { provider: 'rhs' }, { privateInsuranceMeetsHpaDefinition: false }, { method: 'other-method' }, { guessedAnnualAllocation: '880' },
    { prepaidPremiumPaid: '-1' }, { prepaidPremiumPaid: 'NaN' }, { prepaidPremiumPaid: 'Infinity' }, { prepaidPremiumPaid: '5.251' }, { statedTermMonths: 0 }, { statedTermMonths: -1 }, { statedTermMonths: 1.5 },
    { paidDate: '2026-02-30' }, { insuranceObtainedDate: '2026-02-30' }, { paidDate: '2025-05-15' }, { insuranceObtainedDate: '2027-01-01' },
  ])('rejects excluded or malformed original source %j', change => {
    const raw = originals(); manual(raw); Object.assign(raw.form1098[0].mortgageInsuranceQualification.prepaidSources, change);
    expect(() => calculate(raw)).toThrow();
  });
  it('rejects source and canonical parent mismatches', () => {
    const changes: Array<(raw: Originals) => void> = [
      raw => { raw.form1098[0].sourceId = 'other-form'; }, raw => { raw.form1098[0].taxYear = 2025; }, raw => { raw.form1098[0].lender = 'Other lender'; },
      raw => { raw.form1098[0].loanAccountReference = 'other-account'; }, raw => { Reflect.deleteProperty(raw.form1098[0], 'loanAccountReference'); },
      raw => { raw.mortgageInterestWorksheet.loans[0].loanAccountReference = 'other-account'; }, raw => { Reflect.deleteProperty(raw.mortgageInterestWorksheet.loans[0], 'loanAccountReference'); },
      raw => { raw.mortgageInterestWorksheet.loans[0].sourceId = 'other-loan'; }, raw => { raw.mortgageInterestWorksheet.loans[0].accountHolder = 'joint'; },
      raw => { raw.mortgageInterestWorksheet.loans[0].loanType = 'refinanced_mixed'; }, raw => { raw.mortgageInterestWorksheet.loans[0].acquisitionUse = false; },
      raw => { raw.mortgageInterestWorksheet.loans[0].qualifiedResidence = false; }, raw => { raw.mortgageInterestWorksheet.loans[0].securedDebt = false; },
      raw => { raw.mortgageInterestWorksheet.loans[0].ownershipInterest = false; }, raw => { raw.mortgageInterestWorksheet.loans[0].obligationToRepay = false; },
      raw => { raw.form1098[0].mortgageInsuranceQualification.contractIssueDate = '2026-05-14'; }, raw => { raw.mortgageInterestWorksheet.sourceFactsConfirmed = false; },
      raw => { raw.mortgageInterestWorksheet.allHomeDebtIncluded = false; }, raw => { Reflect.deleteProperty(raw, 'mortgageInterestWorksheet'); },
      raw => { raw.form1098[0].mortgageInsuranceQualification.qualifiedProvider = false; }, raw => { raw.form1098[0].mortgageInsuranceQualification.acquisitionDebt = false; },
      raw => { raw.form1098[0].mortgageInsuranceQualification.qualifiedResidence = false; },
    ];
    for (const change of changes) { const raw = originals(); manual(raw); change(raw); expect(() => calculate(raw)).toThrow(); }
  });
  it('rejects concrete parent payment and use contradictions', () => {
    for (const field of ['interestPaidByOthers', 'pointsPaidByOthers', 'interestDeductedElsewhere', 'nonqualifiedInterest'] as const) {
      const raw = originals(); manual(raw); const loan = raw.mortgageInterestWorksheet.loans[0]; loan[field] = '1';
      if (field === 'interestPaidByOthers') raw.form1098[0].mortgageInterestReceived = '1';
      if (field === 'pointsPaidByOthers') raw.form1098[0].pointsPaid = '1';
      if (field === 'interestDeductedElsewhere' || field === 'nonqualifiedInterest') { loan.interestPaid = '1'; raw.form1098[0].mortgageInterestReceived = '1'; }
      expect(() => calculate(raw)).toThrow(/source|ownership|reconcile|original/i);
    }
  });
  it('requires complete unknown and term facts even for a known zero premium', () => {
    const raw = originals(); raw.form1098[0].mortgageInsuranceQualification.prepaidSources.prepaidPremiumPaid = '0'; manual(raw, '0');
    Reflect.deleteProperty(raw.form1098[0].mortgageInsuranceQualification.prepaidSources, 'refinanced'); expect(() => calculate(raw)).toThrow();
    const short = originals(); short.form1098[0].mortgageInsuranceQualification.prepaidSources.statedTermMonths = 1; expect(() => calculate(short)).toThrow(/term|year/i);
  });
  it('requires original future-period allocation rather than inferring it from a long mortgage term', () => {
    const raw = originals(); manual(raw); Reflect.deleteProperty(raw.form1098[0].mortgageInsuranceQualification.prepaidSources, 'premiumAllocableBeyondYearEnd'); expect(() => calculate(raw)).toThrow();
  });
  it('rejects the same physical lender account under different source ids', () => {
    const raw = originals(); const second = originals();
    second.form1098[0].sourceId = 'fictional-1098-alias';
    second.form1098[0].mortgageInsuranceQualification.prepaidSources.form1098SourceId = 'fictional-1098-alias';
    second.form1098[0].mortgageInsuranceQualification.prepaidSources.mortgageLoanSourceId = 'fictional-loan-alias';
    second.mortgageInterestWorksheet.loans[0].sourceId = 'fictional-loan-alias';
    second.mortgageInterestWorksheet.loans[0].form1098SourceId = 'fictional-1098-alias';
    raw.form1098.push(second.form1098[0]); raw.mortgageInterestWorksheet.loans.push(second.mortgageInterestWorksheet.loans[0]);
    expect(() => calculate(raw)).toThrow(/duplic|unique|account/i);
  });
  it('rejects duplicate originals instead of increasing deductible allocation', () => {
    const raw = originals(); manual(raw); raw.form1098.push(structuredClone(raw.form1098[0]));
    expect(() => calculate(raw)).toThrow(/duplic|once/i);
  });
  it('preserves historical manual behavior and full2026 gate', () => {
    const raw = originals(); manual(raw, '1000'); withoutSources(raw);
    expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('1000');
    Reflect.deleteProperty(raw.form1098[0].mortgageInsuranceQualification, 'premiumsAllocableToYear'); expect(() => calculate(raw)).toThrow();
    manual(raw, '1000'); raw.taxpayer.taxYear = 2025; Reflect.deleteProperty(raw, 'mortgageInterestWorksheet'); expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('0');
    const unsupported = originals(); unsupported.taxpayer.taxYear = 2025; manual(unsupported); Reflect.deleteProperty(unsupported, 'mortgageInterestWorksheet'); expect(() => calculate(unsupported)).toThrow(/2026|year/i);
    expect(() => getConstants(2026)).toThrow(/incomplete/i); expect(getRulePack(2026).filingQualified).toBe(false);
  });
  it('rejects actual parent balances contradicting the outstanding original source', () => {
    const ended = originals(); Reflect.set(ended.mortgageInterestWorksheet.loans[0], 'balance', { method: 'first_last', firstBalance: '100000', lastBalance: '0', noAdditionalBorrowing: true, noPrepaymentOverOneMonth: true, levelPaymentsAtLeastSemiannually: true });
    expect(() => calculate(ended)).toThrow(/balance|outstanding|principal/i);
  });
  it('rejects actual highest balance below positive original Form1098 principal', () => {
    for (const highest of ['0', '99999.99']) { const raw = originals(); raw.mortgageInterestWorksheet.loans[0].balance.amount = highest; expect(() => calculate(raw)).toThrow(/balance|outstanding|principal/i); }
  });
  it('accepts actual positive final or average balances without guessing year-end values', () => {
    for (const premium of ['9240', '0']) {
      const expected = premium === '0' ? '0' : '880';
      for (const balance of [
        { method: 'first_last', firstBalance: '100000', lastBalance: '90000', noAdditionalBorrowing: true, noPrepaymentOverOneMonth: true, levelPaymentsAtLeastSemiannually: true },
        { method: 'lender_average', amount: '90000', sourceReference: 'Fictional actual lender average; not year end' },
      ]) { const raw = originals(); raw.form1098[0].mortgageInsuranceQualification.prepaidSources.prepaidPremiumPaid = premium; Reflect.set(raw.mortgageInterestWorksheet.loans[0], 'balance', balance); expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe(expected); }
    }
  });

  it('leaves the existing manual balance route unchanged', () => {
    const raw = originals(); manual(raw); withoutSources(raw);
    Reflect.set(raw.mortgageInterestWorksheet.loans[0], 'balance', { method: 'first_last', firstBalance: '100000', lastBalance: '0', noAdditionalBorrowing: true, noPrepaymentOverOneMonth: true, levelPaymentsAtLeastSemiannually: true });
    expect(calculate(raw).mortgageInsurancePremiums.toString()).toBe('880');
  });

});
