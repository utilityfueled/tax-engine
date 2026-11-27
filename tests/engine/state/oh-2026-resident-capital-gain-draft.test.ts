// Spec: spec/state/oh-2026-resident-capital-gain-draft.yaml.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026ReturnDraftFromSources } from '@/engine/state/oh-engine.js';
import { calculateOhio2026QualifyingCapitalGainDraft } from '@/engine/state/oh-2026-qualifying-capital-gain-draft.js';
import { parseInput } from '@/ingest/loader.js';
import { ohio2026ResidentCapitalGainFixture as fixture, rebindOhio2026ResidentCapitalGain as rebind } from '../../fixtures/oh-2026-resident-capital-gain.js';

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('Complete fictional source row required');
  return value;
}

function traditionalSchoolFixture() {
  const p = fixture();
  const address = { street: '1 Fictional Source Lane', city: 'Ada', state: 'OH', zip: '45810' };
  p.input.taxpayer.address = address;
  required(p.input.ohioResidency).schoolDistrictStatus = 'actual_district_sources_required';
  rebind(p);
  return { input: p.input, sources: { ...p.sources, noTaxingSchoolDistrictResidencyConfirmed: false, traditionalSchoolSource: {
    sourceReference: 'Fictional traditional school worksheet', sourceFactsConfirmed: true,
    taxYear: 2026, roundingElection: 'whole_dollars', onlySchoolDistrictResidenceConfirmed: true,
    owner: { accountHolder: 'primary', originalTaxpayer: structuredClone(p.input.taxpayer.primary) },
    residence: { sourceReference: 'Fictional full-year residence original', originalAddress: { ...address },
      from: '2026-01-01', through: '2026-12-31', districtCode: '3301',
      finder: { sourceReference: 'Fictional Finder record', taxYear: 2026, lookupDate: '2026-12-31', originalAddress: { ...address },
        districtCode: '3301', districtName: 'Ada EVSD', rate: '0.0150', taxBase: 'traditional', officialResultMatchedConfirmed: true },
    },
  } } };
}

function ventureFixture() {
  const p = fixture();
  const transaction = required(required(p.input.form1099B[0]).transactions[0]);
  transaction.dateAcquired = '2024-01-08';
  transaction.costBasis = '500000';
  transaction.proceeds = '900000';
  p.sources.saleAgreementOriginal.federalReportedProceeds = transaction.proceeds;
  p.sources.equityOriginal.originalTransaction = structuredClone(transaction) as typeof p.sources.equityOriginal.originalTransaction;
  const { participation: _participation, payroll, ...a34Sale } = p.sources.qualifyingCapitalGainSources;
  const { ownerReference, entityReference } = a34Sale.sale;
  const parties = { ownerReference, entityReference };
  const issueReference = 'PRIVATE-EXECUTED-ISSUER-SUBSCRIPTION';
  const fundingReference = 'PRIVATE-MATCHING-SETTLED-CASH-TRANSFER';
  const settledCash = '1000000';
  const stockOwner = { owner: p.sources.equityOriginal.owner,
    issuerIdentity: p.sources.equityOriginal.issuerIdentity, securityIdentifier: p.sources.equityOriginal.securityIdentifier };
  const originalIssue = {
    ...structuredClone(stockOwner), sourceReference: issueReference, date: transaction.dateAcquired, method: 'issuer_direct_venture_cash_subscription',
    acquiredAtOriginalIssue: true, paidCash: settledCash, subscribedShares: '40',
    fundingOriginal: { ...structuredClone(stockOwner), sourceReference: fundingReference, paidOn: transaction.dateAcquired, amount: settledCash },
    continuousUnchangedSharesConfirmed: true, completeAcquisitionAndDispositionHistoryConfirmed: true,
    singleUniformLotNoFeesOtherConsiderationOrBasisAdjustmentsConfirmed: true,
    noTackedHoldingPeriodConfirmed: true, noSection1045RolloverConfirmed: true,
    noFederalAssetSaleTreatmentConfirmed: true,
  };
  rebind(p);
  return { input: p.input, sources: { ...p.sources,
    equityOriginal: { ...p.sources.equityOriginal, acquisition: originalIssue },
    ventureBusinessParticipationOriginal: { ...parties, owner: structuredClone(p.sources.equityOriginal.owner), taxYear: 2025,
      sourceReference: 'PRIVATE-2025-ANNUAL-PARTICIPATION-ASSESSMENT', activityRecordsReference: 'PRIVATE-2025-ACTUAL-WORK-LOGS',
      federalCriterion: '26-CFR-1.469-5T(a)(1)', qualifyingMinutes: 30001,
      completeCalendarYearAndQualifyingWorkReconciliationConfirmed: true },
    qualifyingCapitalGainSources: { ...a34Sale,
      ventureInvestment: { ...parties, sourceReference: issueReference, fundedAndAcquiredOn: originalIssue.date,
        agreedCashAmount: settledCash, acquiredUnits: originalIssue.subscribedShares, continuousUnchangedHoldingConfirmed: true,
        fundingOriginal: { ...parties, sourceReference: fundingReference, paidOn: originalIssue.date, amount: settledCash },
        companyAssessment: { entityReference, sourceReference: 'PRIVATE-OPERATING-COMPANY-ASSESSMENT', asOfDate: originalIssue.date,
          operatingCompanyConfirmed: true, ventureCapitalOperatingCompany: false },
        rightsOriginal: { ...parties, sourceReference: 'PRIVATE-DIRECT-MANAGEMENT-CONTRACT', effectiveFrom: originalIssue.date,
          effectiveThrough: transaction.dateSold, directContractConfirmed: true, right: 'substantial-participation',
          continuouslyInEffectThroughSaleConfirmed: true },
      },
      investmentPayroll: { entityReference, sourceReference: 'PRIVATE-INVESTMENT-PERIOD-PAYROLL', paidFrom: originalIssue.date,
        paidThrough: '2026-07-14', completePeriodCompensationConfirmed: true, noCompensationPaidOnInvestmentOrSaleDatesConfirmed: true,
        withholdingBaseReconciliationConfirmed: true, stableRecipientIdentitiesConfirmed: true, period5747_06ACompensation: '600000',
        recipients: [{ ...required(required(payroll[0]).recipients[0]), sourceReference: 'PRIVATE-DATED-PAYROLL-ORIGINAL',
          originalPayrollRowReference: 'PRIVATE-INVESTMENT-PERIOD-WORKER', compensationPaid: '600000', compensationUsedFor5747_06A: '600000' }],
      },
    },
  } };
}

describe('Ohio2026 source-bound full-year resident A34 dispatcher', () => {
  it.each(['part-year', 'nonresident'] as const)('holds a conflicting primary Ohio equity-sale residency declaration: %s', declaration => {
    const p = fixture();
    p.input.taxpayer.stateResidency = declaration;
    rebind(p);
    expect(required(required(p.input.ohioResidency).owners[0]).status).toBe('full_year_resident');
    const saved = JSON.stringify(p);
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(result).toMatchObject({ sourceStatus: 'incomplete', calculationStatus: 'incomplete', sourceCommitment: null,
      qualifyingCapitalGainsAndPayrollDeduction: null, incomeTax: null, filingQualified: false, exportAllowed: false, lines: [],
    });
    expect(result.incompleteReason).toBe('Complete current resident equity-sale originals are required; no filing or payment conclusion.');
    expect(JSON.stringify(result)).not.toContain('PRIVATE-');
    expect(JSON.stringify(p)).toBe(saved);
  });

  it('preserves the Ohio equity-sale draft with a matching or omitted residence declaration', () => {
    for (const declaration of ['full-year', undefined] as const) {
      const p = fixture();
      if (declaration !== undefined) p.input.taxpayer.stateResidency = declaration;
      rebind(p);
      const result = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(result.sourceStatus).toBe('admitted-draft');
      expect(result.qualifyingCapitalGainsAndPayrollDeduction?.toFixed()).toBe('100000');
      expect(result.incomeTax?.toFixed()).toBe('2438');
      expect(result.filingQualified).toBe(false);
    }
  });

  it('composes the issuer-direct venture sale with separately sourced Ohio business income', () => {
    const p = ventureFixture();
    const saved = JSON.stringify(p);
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(result.sourceStatus).toBe('admitted-draft');
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({ federalAgi: '450000', capitalGain: '400000',
      qualifyingCapitalGainsAndPayrollDeduction: '120000', businessIncomeDeduction: '250000', taxableBusinessIncome: '30000',
      ohioAgi: '80000', modifiedAdjustedGrossIncome: '450000', exemptions: '1900', incomeTax: '1838',
      filingQualified: false, exportAllowed: false, fullFederalReturnCalculated: false, calculationStatus: 'incomplete',
      payments: null, refund: null, balanceDue: null, outstandingTaxBalance: null, underpaymentPenalty: null, latePaymentInterest: null,
    });
    expect(JSON.stringify(result)).not.toContain('PRIVATE-');
    expect(JSON.stringify(p)).toBe(saved);
    const reopened: typeof p = JSON.parse(saved);
    expect(calculateOhio2026ReturnDraftFromSources({ taxInput: reopened.input, sources: reopened.sources })).toEqual(result);
    reopened.input = parseInput(reopened.input);
    const { ohioResidency, ...federal } = reopened.input;
    required(ohioResidency).originalFederalSources = structuredClone(federal);
    reopened.sources.originalTaxInput = structuredClone(reopened.input);
    const reparsed = calculateOhio2026ReturnDraftFromSources({ taxInput: reopened.input, sources: reopened.sources });
    expect(reparsed.sourceStatus).toBe('admitted-draft');
    expect(reparsed.incomeTax?.toFixed()).toBe('1838');
  });

  it('holds unreconciled venture issue funding basis and issuer sources', () => {
    const controls: Array<[string, (p: ReturnType<typeof ventureFixture>) => void]> = [
      ['wrong subscription reference', p => { p.sources.equityOriginal.acquisition.sourceReference = 'other-subscription'; }],
      ['wrong funding reference', p => { p.sources.equityOriginal.acquisition.fundingOriginal.sourceReference = 'other-transfer'; }],
      ['wrong subscription amount', p => { p.sources.equityOriginal.acquisition.paidCash = '1000001'; }],
      ['wrong subscription units', p => { p.sources.equityOriginal.acquisition.subscribedShares = '41'; }],
      ['wrong acquisition date on the issue original', p => { p.sources.equityOriginal.acquisition.date = '2024-01-09'; }],
      ['coherent wrong cash and basis', p => {
        const investment = p.sources.qualifyingCapitalGainSources.ventureInvestment;
        const acquisition = p.sources.equityOriginal.acquisition;
        investment.agreedCashAmount = investment.fundingOriginal.amount = acquisition.paidCash = acquisition.fundingOriginal.amount = '1010000';
      }],
      ['copied subscription issuer', p => { p.sources.equityOriginal.acquisition.issuerIdentity = 'OTHER ISSUER'; }],
      ['copied subscription security', p => { p.sources.equityOriginal.acquisition.securityIdentifier = '000000BB7'; }],
      ['copied subscription owner', p => { p.sources.equityOriginal.acquisition.owner.ssn = '111-22-4444'; }],
      ['copied funding issuer', p => { p.sources.equityOriginal.acquisition.fundingOriginal.issuerIdentity = 'OTHER ISSUER'; }],
      ['copied funding security', p => { p.sources.equityOriginal.acquisition.fundingOriginal.securityIdentifier = '000000BB7'; }],
      ['copied funding owner', p => { p.sources.equityOriginal.acquisition.fundingOriginal.owner.ssn = '111-22-4444'; }],
      ['copied funding date', p => { p.sources.equityOriginal.acquisition.fundingOriginal.paidOn = '2024-01-09'; }],
      ['copied funding amount', p => { p.sources.equityOriginal.acquisition.fundingOriginal.amount = '1000000.01'; }],
      ['no cash original', p => { Reflect.deleteProperty(p.sources.qualifyingCapitalGainSources.ventureInvestment, 'fundingOriginal'); }],
      ['no original issue', p => { p.sources.equityOriginal.acquisition.acquiredAtOriginalIssue = false; }],
      ['no tacking assessment', p => { Reflect.deleteProperty(p.sources.equityOriginal.acquisition, 'noTackedHoldingPeriodConfirmed'); }],
      ['possible rollover', p => { p.sources.equityOriginal.acquisition.noSection1045RolloverConfirmed = false; }],
      ['possible federal asset sale', p => { p.sources.equityOriginal.acquisition.noFederalAssetSaleTreatmentConfirmed = false; }],
      ['possible fees or basis adjustments', p => { p.sources.equityOriginal.acquisition.singleUniformLotNoFeesOtherConsiderationOrBasisAdjustmentsConfirmed = false; }],
      ['case-alias payroll issuer', p => { p.sources.qualifyingCapitalGainSources.investmentPayroll.entityReference = p.sources.qualifyingCapitalGainSources.investmentPayroll.entityReference.toLowerCase(); }],
      ['case-alias rights issuer', p => { p.sources.qualifyingCapitalGainSources.ventureInvestment.rightsOriginal.entityReference = p.sources.qualifyingCapitalGainSources.ventureInvestment.rightsOriginal.entityReference.toLowerCase(); }],
      ['case-alias funding issuer', p => { p.sources.qualifyingCapitalGainSources.ventureInvestment.fundingOriginal.entityReference = p.sources.qualifyingCapitalGainSources.ventureInvestment.fundingOriginal.entityReference.toLowerCase(); }],
      ['case-alias operating-company issuer', p => { p.sources.qualifyingCapitalGainSources.ventureInvestment.companyAssessment.entityReference = p.sources.qualifyingCapitalGainSources.ventureInvestment.companyAssessment.entityReference.toLowerCase(); }],
    ];
    for (const [label, mutate] of controls) {
      const p = ventureFixture();
      mutate(p);
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }), label).toMatchObject({
        sourceStatus: 'incomplete', ohioAgi: null, qualifyingCapitalGainsAndPayrollDeduction: null, sourceCommitment: null, lines: [],
      });
    }

    for (const date of ['2024-01-09', '2023-12-31']) {
      const p = ventureFixture();
      const { ventureInvestment, investmentPayroll } = p.sources.qualifyingCapitalGainSources;
      ventureInvestment.fundedAndAcquiredOn = ventureInvestment.fundingOriginal.paidOn = date;
      ventureInvestment.companyAssessment.asOfDate = ventureInvestment.rightsOriginal.effectiveFrom = investmentPayroll.paidFrom = date;
      expect(calculateOhio2026QualifyingCapitalGainDraft(p.sources.qualifyingCapitalGainSources).sourceStatus).toBe('admitted-draft');
      if (date === '2023-12-31') {
        const transaction = required(required(p.input.form1099B[0]).transactions[0]);
        transaction.dateAcquired = p.sources.equityOriginal.acquisition.date = date;
        p.sources.equityOriginal.acquisition.fundingOriginal.paidOn = date;
        p.sources.equityOriginal.originalTransaction.dateAcquired = date;
        const { ohioResidency, ...federal } = p.input;
        required(ohioResidency).originalFederalSources = structuredClone(federal);
        p.sources.originalTaxInput = structuredClone(p.input);
      }
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources }).sourceStatus).toBe('incomplete');
    }
  });

  it('requires a distinct completed qualifying 2025 participation assessment', () => {
    const controls: Array<(p: ReturnType<typeof ventureFixture>) => void> = [
      p => { Reflect.deleteProperty(p.sources, 'ventureBusinessParticipationOriginal'); },
      p => { p.sources.ventureBusinessParticipationOriginal.qualifyingMinutes = 30000; },
      p => { p.sources.ventureBusinessParticipationOriginal.taxYear = 2023; },
      p => { p.sources.ventureBusinessParticipationOriginal.ownerReference = 'other-owner'; },
      p => { p.sources.ventureBusinessParticipationOriginal.owner.ssn = '111-22-4444'; },
      p => { p.sources.ventureBusinessParticipationOriginal.entityReference = 'other-issuer'; },
      p => { p.sources.ventureBusinessParticipationOriginal.activityRecordsReference = ''; },
      p => { p.sources.ventureBusinessParticipationOriginal.completeCalendarYearAndQualifyingWorkReconciliationConfirmed = false; },
    ];
    for (const mutate of controls) {
      const p = ventureFixture();
      mutate(p);
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources })).toMatchObject({
        sourceStatus: 'incomplete', incomeTax: null, businessIncomeDeduction: null, lines: [],
      });
    }
    const material = fixture();
    const mixed = { ...material.sources, ventureBusinessParticipationOriginal: ventureFixture().sources.ventureBusinessParticipationOriginal };
    expect(calculateOhio2026ReturnDraftFromSources({ taxInput: material.input, sources: mixed }).sourceStatus).toBe('incomplete');
  });

  it('rejects reuse of evidence across distinct venture original roles', () => {
    const assess = ventureFixture();
    const rights = assess.sources.qualifyingCapitalGainSources.ventureInvestment.rightsOriginal.sourceReference;
    assess.sources.ventureBusinessParticipationOriginal.sourceReference = rights;
    assess.sources.ventureBusinessParticipationOriginal.activityRecordsReference = rights.toLowerCase();

    const fund = ventureFixture();
    const investment = fund.sources.qualifyingCapitalGainSources.ventureInvestment;
    const subscriptionAlias = investment.sourceReference.toLowerCase().replaceAll('-', '\uFF0D');
    fund.sources.equityOriginal.acquisition.fundingOriginal.sourceReference = investment.fundingOriginal.sourceReference = subscriptionAlias;

    for (const { input, sources } of [assess, fund]) {
      expect(calculateOhio2026QualifyingCapitalGainDraft(sources.qualifyingCapitalGainSources).sourceStatus).toBe('admitted-draft');
      expect(calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources })).toMatchObject({
        sourceStatus: 'incomplete', incomeTax: null, lines: [],
      });
    }
  });

  it('combines source-bound A34 with a full-year traditional school draft levy', () => {
    const p = traditionalSchoolFixture();
    const rawSnapshot = JSON.stringify(p);
    const result = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
    expect(result.sourceStatus).toBe('admitted-draft');
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      ohioAgi: '100000', modifiedAdjustedGrossIncome: '450000', exemptions: '1900', incomeTax: '2438',
      traditionalSchool: { districtCode: '3301', taxBase: 'traditional', rate: '0.0150', taxableIncome: '448100',
        rawTaxBeforeCredits: '6721.5', reportedTaxBeforeCredits: '6722', roundingElection: 'whole_dollars' },
      filingQualified: false, exportAllowed: false, fullFederalReturnCalculated: false, calculationStatus: 'incomplete',
      payments: null, refund: null, balanceDue: null, underpaymentPenalty: null, latePaymentInterest: null,
    });
    expect(JSON.stringify(p)).toBe(rawSnapshot);
    const reopened: typeof p = JSON.parse(rawSnapshot);
    expect(calculateOhio2026ReturnDraftFromSources({ taxInput: reopened.input, sources: reopened.sources })).toEqual(result);
    reopened.input = parseInput(reopened.input);
    rebind(reopened);
    const reparsed = calculateOhio2026ReturnDraftFromSources({ taxInput: reopened.input, sources: reopened.sources });
    expect(reparsed.traditionalSchool).toEqual(result.traditionalSchool);
    expect(reparsed.incomeTax?.toFixed()).toBe('2438');
    expect(JSON.stringify(result.lines)).not.toContain('Fictional Source Lane');

    const withoutSchool = fixture();
    const unchanged = calculateOhio2026ReturnDraftFromSources({ taxInput: withoutSchool.input, sources: withoutSchool.sources });
    expect(unchanged.incomeTax?.toFixed()).toBe('2438');
    expect(unchanged).not.toHaveProperty('traditionalSchool');
  });

  it('holds contradictory or incomplete traditional school originals', () => {
    const controls: Array<(p: ReturnType<typeof traditionalSchoolFixture>) => void> = [
      p => { p.sources.noTaxingSchoolDistrictResidencyConfirmed = true; },
      p => { Reflect.deleteProperty(p.sources, 'traditionalSchoolSource'); },
      p => { Reflect.deleteProperty(p.sources.traditionalSchoolSource, 'roundingElection'); },
      p => { p.sources.traditionalSchoolSource.onlySchoolDistrictResidenceConfirmed = false; },
      p => { p.sources.traditionalSchoolSource.taxYear = 2025; },
      p => { p.sources.traditionalSchoolSource.residence.finder.taxYear = 2025; },
      p => { p.sources.traditionalSchoolSource.residence.through = '2026-12-30'; },
      p => { p.sources.traditionalSchoolSource.residence.finder.lookupDate = '2026-02-30'; },
      p => { p.sources.traditionalSchoolSource.residence.finder.originalAddress.street = 'Changed record'; },
      p => { p.input.taxpayer.address.street = 'Changed taxpayer address'; },
      p => { p.sources.traditionalSchoolSource.owner.originalTaxpayer.ssn = '900-70-0999'; },
      p => { p.sources.traditionalSchoolSource.residence.finder.rate = '0.0100'; },
      p => { p.sources.traditionalSchoolSource.residence.finder.districtCode = '3302'; },
      p => { p.sources.traditionalSchoolSource.residence.districtCode = '0000'; },
      p => {
        const residence = p.sources.traditionalSchoolSource.residence;
        residence.districtCode = '0302';
        Object.assign(residence.finder, { districtCode: '0302', districtName: 'Hillsdale LSD', taxBase: 'earned', rate: '0.0125' });
      },
      p => { required(p.input.ohioResidency).schoolDistrictStatus = 'no_ohio_taxing_district_residency'; },
      p => { required(p.input.w2s[0]).localTaxWithheld = '1'; },
    ];
    for (const change of controls) {
      const p = traditionalSchoolFixture();
      change(p);
      rebind(p);
      const result = calculateOhio2026ReturnDraftFromSources({ taxInput: p.input, sources: p.sources });
      expect(result.sourceStatus, String(change)).toBe('incomplete');
      expect(result.incomeTax).toBeNull();
      expect(result).not.toHaveProperty('traditionalSchool');
    }
  });

  it('binds the traditional district Finder effective date to the residence interval', () => {
    const checkDate = (lookupDate: string) => {
      const { input, sources } = traditionalSchoolFixture();
      sources.traditionalSchoolSource.residence.finder.lookupDate = lookupDate;
      return calculateOhio2026ReturnDraftFromSources({ taxInput: input, sources });
    };
    for (const lookupDate of ['2026-01-01', '2026-12-31']) {
      const result = checkDate(lookupDate);
      expect(result.sourceStatus).toBe('admitted-draft');
      expect(result.traditionalSchool?.reportedTaxBeforeCredits.toFixed()).toBe('6722');
    }
    const outside = ['2025-12-31', '2027-01-01', '2099-12-31'].map(checkDate);
    expect(outside.map(result => result.sourceStatus)).toEqual(['incomplete', 'incomplete', 'incomplete']);
    for (const result of outside) {
      expect(result.incomeTax).toBeNull();
      expect(result).not.toHaveProperty('traditionalSchool');
    }
  });

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
