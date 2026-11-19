// Spec: spec/state/oh-2026-resident-capital-gain-draft.yaml.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { parseInput } from '@/ingest/loader.js';
import { ohio2026ResidentCapitalGainFixture as fixture, rebindOhio2026ResidentCapitalGain as rebind } from '../../fixtures/oh-2026-resident-capital-gain.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Complete fictional source row required');
  return value;
}

describe('Ohio2026 source-bound full-year resident A34 dispatcher', () => {
  it('admits normal parsed reparse and serialized source inputs with the original capital evidence', () => {
    const p = fixture();
    const originalCarryover = JSON.stringify(p.sources.carryoverOriginal);
    const originalForms = structuredClone({ w2s: p.input.w2s, form1099B: p.input.form1099B });
    for (const serialization of [false, true]) {
      const rawInput: unknown = serialization ? JSON.parse(JSON.stringify(p.input)) : p.input;
      p.input = parseInput(rawInput); rebind(p);
      expect({ w2s: p.input.w2s, form1099B: p.input.form1099B }).toEqual(originalForms);
      const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(r.sourceStatus).toBe('admitted-draft'); expect(r.incomeTax?.toFixed()).toBe('2438');
      expect(JSON.stringify(p.sources.carryoverOriginal)).toBe(originalCarryover);
      const restored: ReturnType<typeof fixture> = JSON.parse(JSON.stringify(p));
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: restored.input, sources: restored.sources }).incomeTax?.toFixed()).toBe('2438');
    }
  });

  it('holds nonzero parsed history and missing or expanded original carryover evidence', () => {
    for (const [key, value] of [
      ['foreignTaxCreditCarryforward', '1'], ['charitableCarryforward', '1'], ['generalBusinessCreditCarryforward', '1'],
      ['priorYearTax', '1'], ['priorYearAGI', '1'], ['suspendedPassiveLosses', [{ partnershipName: 'OTHER', amount: '0' }]],
      ['suspendedPTPLosses', [{ partnershipName: 'OTHER', amount: '0' }]], ['foreignTaxCreditCarryforwardByYear', [{ taxYear: 2025, amount: '0' }]],
      ['qbiAggregationElections', [{ name: 'OTHER', componentBusinessNames: [] }]], ['charitableCarryforwardByYear', [{ taxYear: 2025, amount: '0' }]],
      ['suspendedBusinessInterest', [{ partnershipName: 'OTHER', partnershipEIN: '90-0000000', amount: '0' }]],
      ['qbiLossCarryforward', '0'], ['activeQbiLossCarryforward', '0'], ['nolCarryforward', '0'], ['unknownHistory', '0'],
    ] as const) {
      const p = fixture(); p.input = parseInput(p.input);
      Object.assign(required(p.input.priorYear), { [key]: value }); rebind(p);
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }).sourceStatus).toBe('incomplete');
    }
    for (const parsed of [false, true]) {
      for (const target of ['current-capital-loss', 'original-capital-loss', 'original-extra-history']) {
        const p = fixture(); if (parsed) p.input = parseInput(p.input);
        if (target === 'current-capital-loss') delete required(p.input.priorYear).shortTermCapitalLoss;
        else if (target === 'original-capital-loss') Reflect.deleteProperty(p.sources.carryoverOriginal, 'shortTermCapitalLoss');
        else Object.assign(p.sources.carryoverOriginal, { foreignTaxCreditCarryforward: '0' });
        rebind(p);
        expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }).sourceStatus).toBe('incomplete');
      }
    }
  });

  it('rejects coherent replacement of every issuer wrapper while the original broker security is unchanged', () => {
    for (const replaceAgreement of [false, true]) {
      const p = fixture(), originalBroker = JSON.stringify(p.input.form1099B);
      const originalAgreement = JSON.stringify(p.sources.saleAgreementOriginal);
      const originalSaleReference = p.sources.equityOriginal.sourceReference;
      const replacement = { securityIdentifier: '000000AB5', issuerIdentity: 'PRIVATE-OTHER-ISSUER CORPORATION',
        entityReference: JSON.stringify(['CUSIP', '000000AB5', 'PRIVATE-OTHER-ISSUER CORPORATION']) };
      Object.assign(p.sources.equityOriginal, replacement);
      if (replaceAgreement) Object.assign(p.sources.saleAgreementOriginal, replacement);
      const q = p.sources.qualifyingCapitalGainSources;
      for (const row of [q.sale, q.recognition, q.entity, q.participation, q.ownership, ...q.payroll]) row.entityReference = replacement.entityReference;
      for (const annual of q.payroll) {
        annual.annual5747_06ACompensation = '200000';
        const worker = required(annual.recipients[0]);
        worker.compensationPaid = '200000'; worker.compensationUsedFor5747_06A = '200000';
      }
      expect(JSON.stringify(p.input.form1099B)).toBe(originalBroker);
      expect(p.sources.equityOriginal.sourceReference).toBe(originalSaleReference);
      if (!replaceAgreement) expect(JSON.stringify(p.sources.saleAgreementOriginal)).toBe(originalAgreement);
      const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(r.sourceStatus).toBe('incomplete'); expect(r.incomeTax).toBeNull(); expect(r.lines).toEqual([]);
    }
  });

  it('rejects a withholding-only open short-sale marker alongside the positive sale', () => {
    const p = fixture();
    required(p.input.form1099B[0]).withholdingOnlyOpenShortSale = {
      description: 'PRIVATE-OPEN-SHORT', openedDate: '2026-01-01', stillOpenAtYearEndConfirmed: true, otherNumberedBoxesBlankConfirmed: true,
    };
    rebind(p);
    const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(r.sourceStatus).toBe('incomplete'); expect(r.incomeTax).toBeNull(); expect(r.lines).toEqual([]);
  });

  it('requires every independently affirmative broker agreement and A34 issuer binding', () => {
    const mutations: Array<(p: ReturnType<typeof fixture>) => void> = [
      p => { required(required(p.input.form1099B[0]).transactions[0]).securityIdentifier = undefined; Reflect.deleteProperty(p.sources.equityOriginal.originalTransaction, 'securityIdentifier'); rebind(p); },
      p => { required(required(p.input.form1099B[0]).transactions[0]).issuerIdentity = undefined; Reflect.deleteProperty(p.sources.equityOriginal.originalTransaction, 'issuerIdentity'); rebind(p); },
      p => { p.sources.equityOriginal.securityIdentifier = '000000AB5'; },
      p => { p.sources.equityOriginal.issuerIdentity = 'DIFFERENT CORPORATION'; },
      p => { p.sources.saleAgreementOriginal.securityIdentifier = '000000AB5'; },
      p => { p.sources.saleAgreementOriginal.issuerIdentity = p.sources.saleAgreementOriginal.issuerIdentity.toLowerCase(); },
      p => { p.sources.saleAgreementOriginal.sourceFactsConfirmed = false; },
      p => { p.sources.saleAgreementOriginal.completeExecutedAgreementAndIssuerReconciliationConfirmed = false; },
      p => { p.sources.saleAgreementOriginal.sourceTaxYear = 2025; },
      p => { p.sources.saleAgreementOriginal.sourceReference = 'UNRELATED-ORIGINAL-AGREEMENT'; },
      p => { p.sources.saleAgreementOriginal.owner.ssn = '900-70-0999'; },
      p => { p.sources.saleAgreementOriginal.ownerReference = 'OTHER-OWNER'; },
      p => { p.sources.saleAgreementOriginal.saleReference = 'OTHER-SALE'; },
      p => { p.sources.saleAgreementOriginal.dateSold = '2026-07-16'; },
      p => { p.sources.saleAgreementOriginal.federalReportedProceeds = '450001'; },
      p => { p.sources.saleAgreementOriginal.proceedsReconciliationConfirmed = false; },
      p => { p.sources.saleAgreementOriginal.sharesTransferred = '21'; },
      p => { const q = p.sources.qualifyingCapitalGainSources; q.entity.entityReference = q.entity.entityReference.replace('PRIVATE', 'ＰＲＩＶＡＴＥ'); },
      p => { const q = p.sources.qualifyingCapitalGainSources; required(q.payroll[0]).entityReference = required(q.payroll[0]).entityReference.replace('PRIVATE', 'ＰＲＩＶＡＴＥ'); },
    ];
    for (const change of mutations) {
      const p = fixture(); change(p);
      const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(r.sourceStatus).toBe('incomplete'); expect(r.incomeTax).toBeNull(); expect(r.lines).toEqual([]);
    }
  });

  it('uses the original federal forms and classifies the material participant gain as business income', () => {
    const p = fixture();
    const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(r.sourceStatus).toBe('admitted-draft');
    expect(r.federalAgi?.toFixed()).toBe('450000');
    expect(r.capitalGain?.toFixed()).toBe('400000');
    expect(r.qualifyingCapitalGainsAndPayrollDeduction?.toFixed()).toBe('100000');
    expect(r.businessIncomeDeduction?.toFixed()).toBe('250000');
    expect(r.taxableBusinessIncome?.toFixed()).toBe('50000');
    expect(r.ohioAgi?.toFixed()).toBe('100000');
    expect(r.incomeTax?.toFixed()).toBe('2438');
  });

  it('applies the gain cap and business deduction boundary without deducting either twice', () => {
    for (const [gain, payroll, a34, bid, taxable, agi] of [
      ['200000', '100000', '100000', '100000', '0', '50000'],
      ['99999', '100000', '99999', '0', '0', '50000'],
      ['350000', '100000', '100000', '250000', '0', '50000'],
      ['350001', '100000', '100000', '250000', '1', '50001'],
      ['400000', '0', '0', '250000', '150000', '200000'],
    ]) {
      const p = fixture(gain, payroll), r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(r.qualifyingCapitalGainsAndPayrollDeduction?.toFixed()).toBe(a34);
      expect(r.businessIncomeDeduction?.toFixed()).toBe(bid);
      expect(r.taxableBusinessIncome?.toFixed()).toBe(taxable);
      expect(r.ohioAgi?.toFixed()).toBe(agi);
    }
  });

  it('preserves MAGI exemption thresholds and separate business tax', () => {
    for (const [gain, magi, exemption, tax] of [['30000', '80000', '2150', '932'], ['30001', '80001', '1900', '938'], ['400000', '450000', '1900', '2438'], ['450000', '500000', '0', '3991']]) {
      const p = fixture(gain), r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(r.modifiedAdjustedGrossIncome?.toFixed()).toBe(magi);
      expect(r.exemptions?.toFixed()).toBe(exemption);
      expect(r.incomeTax?.toFixed()).toBe(tax);
    }
  });

  it('rejects stale and contradictory owner issuer sale and federal sources', () => {
    const mutations: Array<(p: ReturnType<typeof fixture>) => void> = [
      p => { p.sources.equityOriginal.owner.ssn = '900-70-0999'; },
      p => { p.sources.equityOriginal.ownerReference = 'unrelated-owner'; },
      p => { p.sources.equityOriginal.entityReference = 'unrelated-issuer'; },
      p => { p.sources.equityOriginal.saleReference = 'unrelated-sale'; },
      p => { p.sources.equityOriginal.formSourceId = 'unrelated-statement'; },
      p => { p.sources.equityOriginal.accountReference = 'unrelated-account'; },
      p => { p.sources.equityOriginal.sourceTaxYear = 2025; },
      p => { p.sources.equityOriginal.originalTransaction.proceeds = '999999'; },
      p => { p.sources.qualifyingCapitalGainSources.sale.date = '2026-07-16'; },
      p => { p.sources.qualifyingCapitalGainSources.recognition.includedFederalAgi = '399999'; },
      p => { p.sources.qualifyingCapitalGainSources.recognition.otherwiseOhioDeductedOrExcluded = '1'; },
      p => { p.input.taxpayer.primary.lastName = 'Changed'; },
      p => { const f = p.input.form1099B[0]; if (f) f.taxYear = 2025; rebind(p); },
      p => { const f = p.input.form1099B[0]; if (f) f.accountHolder = 'spouse'; rebind(p); },
      p => { const f = required(p.input.form1099B[0]); f.transactions.push(structuredClone(required(f.transactions[0]))); rebind(p); },
      p => { p.input.form1099Int.push({ payer: 'retained', interestIncome: '0' }); rebind(p); },
    ];
    for (const change of mutations) {
      const p = fixture(); change(p);
      const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(r.sourceStatus).toBe('incomplete'); expect(r.incomeTax).toBeNull(); expect(r.lines).toEqual([]);
    }
  });

  it('rejects unresolved carryovers special gains and unsupported acquisitions', () => {
    const mutations: Array<(p: ReturnType<typeof fixture>) => void> = [
      p => { delete p.input.priorYear; rebind(p); },
      p => { if (p.input.priorYear) p.input.priorYear.shortTermCapitalLoss = '-1'; rebind(p); },
      p => { p.sources.carryoverOriginal.longTermCapitalLoss = '1'; },
      p => { p.sources.carryoverOriginal.sourceTaxYear = 2024; },
      p => { p.sources.carryoverOriginal.ownerReference = 'other-owner'; },
      p => { p.sources.carryoverOriginal.completeCapitalCarryoverWorksheetConfirmed = false; },
      p => { p.sources.equityOriginal.acquisition.acquiredAtOriginalIssue = true; },
      p => { p.sources.equityOriginal.acquisition.method = 'gift'; },
      p => { p.sources.equityOriginal.acquisition.noSection1202FOrHExceptionConfirmed = false; },
      p => { p.sources.equityOriginal.acquisition.continuousUnchangedSharesConfirmed = false; },
      p => { p.sources.equityOriginal.acquisition.date = '2026-03-01'; },
      p => { p.sources.equityOriginal.originalTransaction.adjustments = '1'; },
      p => { p.sources.equityOriginal.originalTransaction.digitalAsset = true; },
      p => {
        const ownership = p.sources.qualifyingCapitalGainSources.ownership;
        ownership.percentageOfEntireEntitySold = '0.01'; ownership.totalEntityUnits = '10000'; ownership.unitsSold = '1'; ownership.ownerUnitsBefore = '40';
        const year = required(p.sources.qualifyingCapitalGainSources.payroll[0]), row = required(year.recipients[0]);
        row.compensationPaid = '100000.01'; row.compensationUsedFor5747_06A = '100000.01'; year.annual5747_06ACompensation = '100000.01';
      },
    ];
    for (const change of mutations) {
      const p = fixture(); change(p);
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }).sourceStatus).toBe('incomplete');
    }
  });

  it('rejects incomplete household residency employment and school sources', () => {
    const mutations: Array<(p: ReturnType<typeof fixture>) => void> = [
      p => { p.sources.noTaxingSchoolDistrictResidencyConfirmed = false; },
      p => { if (p.input.ohioResidency) p.input.ohioResidency.schoolDistrictStatus = 'actual_district_sources_required'; rebind(p); },
      p => { const o = p.input.ohioResidency?.owners[0]; if (o) o.status = 'part_year_resident'; rebind(p); },
      p => { const o = p.input.ohioResidency?.owners[0]; if (o?.amounts) o.amounts.capitalGains.residentAmount = '1'; rebind(p); },
      p => { const o = p.input.ohioResidency?.owners[0]; if (o?.periods[0]) o.periods[0].to = '2026-06-30'; rebind(p); },
      p => { if (p.input.ohioResidency) p.input.ohioResidency.noBusinessIncomeConfirmed = true; rebind(p); },
      p => { p.sources.noOtherOhioCreditOrTaxSourcesConfirmed = false; },
      p => { p.sources.noOtherIncomeOrAdjustmentSourcesConfirmed = false; },
      p => { required(p.sources.employmentOriginal).entityType = 'sole_proprietor'; },
      p => { required(p.sources.employmentOriginal).employerTin = '90-9999999'; },
      p => { p.input.taxpayer.primary.dateOfBirth = '1961-12-31'; rebind(p); },
      p => { if (p.input.standardDeductionFacts) p.input.standardDeductionFacts.primaryCanBeClaimedAsDependent = true; rebind(p); },
      p => { p.input.taxpayer.filingStatus = 'head_of_household'; rebind(p); },
      p => { required(p.sources.employmentOriginal).serviceRows[0] = { ...required(required(p.sources.employmentOriginal).serviceRows[0]), from: '2026-02-01' }; },
      p => { required(p.input.w2s[0]).taxYear = 2025; rebind(p); },
      p => { required(p.input.w2s[0]).accountHolder = 'spouse'; rebind(p); },
      p => { required(p.input.w2s[0]).box12CodeG = '1000'; rebind(p); },
    ];
    for (const change of mutations) {
      const p = fixture(); change(p);
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }).sourceStatus).toBe('incomplete');
    }
    const low = fixture('400000', '100000', '49999');
    expect(calculateOhio2026ReturnDraftFromSources({ taxInput: low.input, sources: low.sources }).sourceStatus).toBe('incomplete');
  });

  it('keeps payment and filing gates closed without echoing identities or mutating inputs', () => {
    const p = fixture(), before = JSON.stringify(p);
    const r = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(r.sourceStatus).toBe('admitted-draft');
    expect(r.calculationStatus).toBe('incomplete'); expect(r.filingQualified).toBe(false); expect(r.exportAllowed).toBe(false);
    for (const key of ['payments', 'balanceDue', 'outstandingTaxBalance', 'refund', 'underpaymentPenalty', 'latePaymentInterest'] as const) expect(r[key]).toBeNull();
    expect(JSON.stringify(r)).not.toContain('PRIVATE-'); expect(JSON.stringify(r)).not.toContain('900-70-0901');
    expect(JSON.stringify(p)).toBe(before);
  });
});
