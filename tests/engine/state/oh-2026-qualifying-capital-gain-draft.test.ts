// Spec: spec/state/oh-2026-qualifying-capital-gain-draft.yaml.
import { describe, expect, it } from 'vitest';
import { calculateOhio2026QualifyingCapitalGainDraft } from '@/engine/state/oh-2026-qualifying-capital-gain-draft.js';

function actual() {
  const ownerReference = 'synthetic-owner', entityReference = 'synthetic-entity', saleReference = 'synthetic-sale';
  const identity = { ownerReference, entityReference, saleReference };
  return {
    taxYear: 2026, calendarYearConfirmed: true, asOfDate: '2027-03-01', ownerReference,
    sale: { ...identity, sourceReference: 'original-equity-sale', date: '2026-07-15', capitalGain: '200000',
      directEquitySaleConfirmed: true, onlySaleForOwnerConfirmed: true, equalRightsSingleClassConfirmed: true },
    recognition: { ...identity, sourceReference: 'original-federal-gain-reconciliation', taxYear: 2026,
      saleDate: '2026-07-15', reportedToIrsConfirmed: true, currentGainInclusionAndExclusionsComplete: true,
      noInstallmentOrDeferredRecognitionConfirmed: true, noUnresolvedCapitalLossNettingConfirmed: true,
      reportedCapitalGain: '200000', includedFederalAgi: '200000', otherwiseOhioDeductedOrExcluded: '0' },
    entity: { entityReference, sourceReference: 'original-ohio-history', organizationMethod: 'incorporated',
      ohioOrganizationFrom: '2020-01-01', ohioOrganizationThrough: '2026-07-15',
      ohioHeadquartersFrom: '2021-07-15', ohioHeadquartersThrough: '2026-07-15',
      continuousHistoryConfirmed: true, ohioTradeOrBusinessAtSaleConfirmed: true },
    participation: { ownerReference, entityReference, sourceReference: 'completed-participation-assessment',
      method: '5747.79(A)(1)(a)(i)', coveredFrom: '2021-07-15', coveredThrough: '2026-07-15',
      federalCriterion: 'a1', completeApplicableFederalConditionsConfirmed: true },
    ownership: { ...identity, sourceReference: 'original-entire-entity-capitalization-and-transfer',
      totalEntityUnits: '100', ownerUnitsBefore: '40', unitsSold: '20', percentageOfEntireEntitySold: '20',
      completeCapitalizationAndTransferConfirmed: true },
    payroll: [2021, 2022, 2023, 2024, 2025].map(year => ({
      year, entityReference, sourceReference: `original-payroll-${year}`, completeAnnualCompensationConfirmed: true,
      withholdingBaseReconciliationConfirmed: true, annual5747_06ACompensation: '160000',
      stableRecipientIdentitiesConfirmed: true,
      recipients: [{ recipientReference: 'synthetic-worker', sourceReference: `original-payroll-${year}`, originalPayrollRowReference: `recipient-row-${year}`, relationship: 'not-enumerated',
        relationshipConfirmed: true, compensationPaid: '200000', compensationUsedFor5747_06A: '100000' },
      ...['taxpayer', 'spouse', 'parent', 'grandparent', 'child', 'grandchild'].map(relationship => ({
        recipientReference: relationship === 'taxpayer' ? ownerReference : `synthetic-${relationship}`,
        sourceReference: `original-payroll-${year}`, originalPayrollRowReference: `family-row-${relationship}-${year}`, relationship, relationshipConfirmed: true,
        compensationPaid: '10000', compensationUsedFor5747_06A: '10000',
      }))],
    })),
  };
}
type Packet = ReturnType<typeof actual>;
function venture() {
  const { participation: _participation, payroll, ...salePacket } = actual();
  const { ownerReference, entityReference } = salePacket.sale;
  const parties = { ownerReference, entityReference };
  const investmentDate = '2024-01-08';
  return {
    ...salePacket,
    ventureInvestment: {
      ...parties, sourceReference: 'executed-direct-subscription', fundedAndAcquiredOn: investmentDate,
      agreedCashAmount: '1000000', acquiredUnits: '40', continuousUnchangedHoldingConfirmed: true,
      fundingOriginal: { ...parties, sourceReference: 'settled-cash-transfer', paidOn: investmentDate, amount: '1000000' },
      companyAssessment: { entityReference, sourceReference: 'investment-operating-company-assessment',
        asOfDate: investmentDate, operatingCompanyConfirmed: true, ventureCapitalOperatingCompany: false },
      rightsOriginal: { ...parties, sourceReference: 'executed-direct-management-contract',
        effectiveFrom: investmentDate, effectiveThrough: salePacket.sale.date, directContractConfirmed: true,
        right: 'substantial-participation', continuouslyInEffectThroughSaleConfirmed: true },
    },
    investmentPayroll: { entityReference, sourceReference: 'investment-period-payroll-reconciliation',
      paidFrom: investmentDate, paidThrough: '2026-07-14', completePeriodCompensationConfirmed: true,
      noCompensationPaidOnInvestmentOrSaleDatesConfirmed: true, stableRecipientIdentitiesConfirmed: true,
      withholdingBaseReconciliationConfirmed: true, period5747_06ACompensation: '160000',
      recipients: at(payroll).recipients.map((row, index) => ({ ...row,
        sourceReference: 'investment-period-payroll-original', originalPayrollRowReference: `investment-period-worker-${index}`,
      })) },
  };
}

function at<T>(items: readonly T[], index = 0): T {
  const value = items[index];
  if (value === undefined) throw new Error('Synthetic test fixture is missing a required row');
  return value;
}

describe('Ohio 2026 one-sale qualifying capital gain documentary draft', () => {
  it('uses a documented one-million-dollar venture investment with the qualifying payroll cap', () => {
    const input = venture();
    const result = calculateOhio2026QualifyingCapitalGainDraft(input);
    expect(result).toMatchObject({ sourceStatus: 'admitted-draft', calculationStatus: 'incomplete', filingQualified: false, exportAllowed: false });
    expect(result.qualifyingPayroll?.toFixed()).toBe('100000');
    expect(result.excludedFamilyPayroll?.toFixed()).toBe('60000');
    expect(result.deductiblePayroll?.toFixed()).toBe('20000');
    expect(result.deduction?.toFixed()).toBe('20000');
    expect(result.lines.find(line => line.line === 'A34-venture-investment')?.value.toFixed()).toBe('1000000');
    expect(JSON.stringify(result)).not.toContain('executed-direct-management-contract');
    input.ventureInvestment.rightsOriginal.right = 'substantial-influence';
    input.recognition.otherwiseOhioDeductedOrExcluded = '193000';
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction?.toFixed()).toBe('7000');
  });

  it('rejects incomplete and contradictory venture-investment evidence', () => {
    const mutations: ((input: ReturnType<typeof venture>) => void)[] = [
      p => { p.ventureInvestment.agreedCashAmount = p.ventureInvestment.fundingOriginal.amount = '999999.99'; },
      p => { p.ventureInvestment.fundingOriginal.amount = '1000000.01'; },
      p => { p.ventureInvestment.fundingOriginal.paidOn = '2024-01-09'; },
      p => { p.ventureInvestment.fundingOriginal.ownerReference = 'another-investor'; },
      p => { p.ventureInvestment.entityReference = 'another-company'; },
      p => { p.ventureInvestment.rightsOriginal.entityReference = 'another-company'; },
      p => { p.ventureInvestment.rightsOriginal.right = 'information-only'; },
      p => { p.ventureInvestment.rightsOriginal.directContractConfirmed = false; },
      p => { p.ventureInvestment.rightsOriginal.effectiveFrom = '2024-01-09'; },
      p => { p.ventureInvestment.rightsOriginal.effectiveThrough = '2026-07-14'; },
      p => { p.ventureInvestment.companyAssessment.ventureCapitalOperatingCompany = true; },
      p => { p.ventureInvestment.companyAssessment.operatingCompanyConfirmed = false; },
      p => { p.ventureInvestment.companyAssessment.asOfDate = '2024-01-09'; },
      p => { p.ventureInvestment.acquiredUnits = '39'; },
      p => { p.ventureInvestment.continuousUnchangedHoldingConfirmed = false; },
      p => { p.entity.ohioHeadquartersFrom = '2021-07-16'; },
    ];
    for (const mutate of mutations) {
      const input = venture();
      mutate(input);
      expect(calculateOhio2026QualifyingCapitalGainDraft(input)).toMatchObject({
        sourceStatus: 'incomplete', qualifyingPayroll: null, deduction: null, lines: [],
      });
    }
    const input = venture();
    expect(calculateOhio2026QualifyingCapitalGainDraft({ ...input, participation: actual().participation }).deduction).toBeNull();
  });

  it('requires payroll paid only within the documented venture investment window', () => {
    const mutations: ((input: ReturnType<typeof venture>) => void)[] = [
      p => { p.investmentPayroll.paidFrom = '2024-01-07'; },
      p => { p.investmentPayroll.paidFrom = '2024-01-09'; },
      p => { p.investmentPayroll.paidThrough = '2026-07-13'; },
      p => { p.investmentPayroll.paidThrough = p.sale.date; },
      p => { p.investmentPayroll.noCompensationPaidOnInvestmentOrSaleDatesConfirmed = false; },
      p => { p.investmentPayroll.period5747_06ACompensation = '160000.01'; },
      p => { p.investmentPayroll.entityReference = 'another-company'; },
      p => { p.investmentPayroll.completePeriodCompensationConfirmed = false; },
    ];
    for (const mutate of mutations) {
      const input = venture();
      mutate(input);
      expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction).toBeNull();
    }
    const tooEarly = venture();
    const start = '2021-12-31';
    tooEarly.ventureInvestment.fundedAndAcquiredOn = tooEarly.ventureInvestment.fundingOriginal.paidOn = start;
    tooEarly.ventureInvestment.companyAssessment.asOfDate = tooEarly.ventureInvestment.rightsOriginal.effectiveFrom = start;
    tooEarly.investmentPayroll.paidFrom = start;
    expect(calculateOhio2026QualifyingCapitalGainDraft(tooEarly).deduction).toBeNull();

    const knownZero = venture();
    knownZero.investmentPayroll.period5747_06ACompensation = '0';
    knownZero.investmentPayroll.recipients = [];
    expect(calculateOhio2026QualifyingCapitalGainDraft(knownZero).deduction?.toFixed()).toBe('0');
  });

  it('caps payroll by the source-reconciled gain remaining in federal and Ohio AGI', () => {
    const input = actual();
    input.recognition.includedFederalAgi = '150000';
    input.recognition.otherwiseOhioDeductedOrExcluded = '60000';
    const result = calculateOhio2026QualifyingCapitalGainDraft(input);
    expect(result.sourceStatus).toBe('admitted-draft');
    expect(result.qualifyingGain?.toFixed()).toBe('90000');
    expect(result.deductiblePayroll?.toFixed()).toBe('100000');
    expect(result.deduction?.toFixed()).toBe('90000');
    expect(result.lines.find(line => line.line === 'A34')?.value.toFixed()).toBe('90000');
  });

  it('uses all five calendar years of withholding compensation rather than gross pay or withholding tax', () => {
    const result = calculateOhio2026QualifyingCapitalGainDraft(actual());
    // 5 *100000 of qualifying compensation, not gross5*200000 or an income-tax remittance.
    expect(result.qualifyingPayroll?.toFixed()).toBe('500000');
    expect(result.excludedFamilyPayroll?.toFixed()).toBe('300000');
    expect(result.deductiblePayroll?.toFixed()).toBe('100000');
    expect(result.deduction?.toFixed()).toBe('100000');
    for (const federalCriterion of ['a1', 'a2', 'a3', 'a4', 'a7']) {
      const input = actual(); input.participation.federalCriterion = federalCriterion;
      expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction?.toFixed()).toBe('100000');
    }
    for (const organizationMethod of ['incorporated', 'registered', 'organized']) {
      const input = actual(); input.entity.organizationMethod = organizationMethod;
      expect(calculateOhio2026QualifyingCapitalGainDraft(input).sourceStatus).toBe('admitted-draft');
    }
  });

  it('excludes every enumerated family relationship', () => {
    for (const relationship of ['taxpayer', 'spouse', 'parent', 'grandparent', 'child', 'grandchild']) {
      const input = actual();
      for (const year of input.payroll) {
        const worker = at(year.recipients);
        worker.relationship = relationship;
        worker.recipientReference = relationship === 'taxpayer' ? input.ownerReference : 'new-family-recipient';
        year.recipients = [worker]; year.annual5747_06ACompensation = '100000';
      }
      const result = calculateOhio2026QualifyingCapitalGainDraft(input);
      expect(result.sourceStatus).toBe('admitted-draft');
      expect(result.qualifyingPayroll?.isZero()).toBe(true);
      expect(result.excludedFamilyPayroll?.toFixed()).toBe('500000');
      expect(result.deduction?.isZero()).toBe(true);
    }
  });

  it('rejects the taxpayer relabeled as a non-enumerated case alias', () => {
    const input = actual();
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).sourceStatus).toBe('admitted-draft');
    for (const annual of input.payroll) {
      const owner = at(annual.recipients, 1);
      owner.recipientReference = input.ownerReference.toUpperCase();
      owner.relationship = 'not-enumerated';
    }
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction).toBeNull();
  });

  it('rejects an unchanged original payroll row copied under a different recipient alias', () => {
    const input = actual();
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).sourceStatus).toBe('admitted-draft');
    const annual = at(input.payroll);
    annual.recipients.push({ ...at(annual.recipients), recipientReference: 'different-recipient-alias' });
    annual.annual5747_06ACompensation = '260000';
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction).toBeNull();
  });

  it('reconciles canonical identities and distinct rows from a shared payroll file', () => {
    const input = actual();
    input.ownerReference = input.ownerReference.toUpperCase();
    input.sale.entityReference = input.sale.entityReference.toUpperCase();
    input.sale.saleReference = input.sale.saleReference.toUpperCase();
    for (const annual of input.payroll) {
      expect(new Set(annual.recipients.map(row => row.sourceReference)).size).toBe(1);
    }
    const result = calculateOhio2026QualifyingCapitalGainDraft(input);
    expect(result.sourceStatus).toBe('admitted-draft');
    expect(result.deduction?.toFixed()).toBe('100000');
  });

  it('rejects canonical duplicate recipient and original row identities', () => {
    for (const alias of ['SYNTHETIC-WORKER', 'ｓｙｎｔｈｅｔｉｃ－ｗｏｒｋｅｒ']) {
      const input = actual(), annual = at(input.payroll);
      annual.recipients.push({ ...at(annual.recipients), recipientReference: alias, originalPayrollRowReference: 'distinct-row' });
      annual.annual5747_06ACompensation = '260000';
      expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction).toBeNull();
    }
    const input = actual(), annual = at(input.payroll);
    annual.recipients.push({ ...at(annual.recipients), recipientReference: 'different-person', originalPayrollRowReference: at(annual.recipients).originalPayrollRowReference.toUpperCase() });
    annual.annual5747_06ACompensation = '260000';
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction).toBeNull();
  });

  it('uses whole-entity ownership sold and preserves exact fractional cents', () => {
    const input = actual();
    input.ownership = { ...input.ownership, totalEntityUnits: '10000', ownerUnitsBefore: '5000', unitsSold: '1', percentageOfEntireEntitySold: '0.01' };
    for (const year of input.payroll) {
      year.recipients = [at(year.recipients)];
      at(year.recipients).compensationPaid = '1.23';
      at(year.recipients).compensationUsedFor5747_06A = '1.23';
      year.annual5747_06ACompensation = '1.23';
    }
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction?.toFixed()).toBe('0.000615');
    input.ownership = { ...input.ownership, totalEntityUnits: '100', ownerUnitsBefore: '40', unitsSold: '20', percentageOfEntireEntitySold: '50' };
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction).toBeNull();
  });

  it('preserves known zero and the gain and payroll caps', () => {
    const input = actual();
    input.recognition.otherwiseOhioDeductedOrExcluded = input.recognition.includedFederalAgi;
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction?.isZero()).toBe(true);
    for (const [gain, expected] of [['99999.99', '99999.99'], ['100000', '100000'], ['100000.01', '100000']] as const) {
      input.recognition.otherwiseOhioDeductedOrExcluded = '0';
      input.sale.capitalGain = gain; input.recognition.reportedCapitalGain = gain; input.recognition.includedFederalAgi = gain;
      expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction?.toFixed()).toBe(expected);
    }
    for (const year of input.payroll) { year.recipients = []; year.annual5747_06ACompensation = '0'; }
    expect(calculateOhio2026QualifyingCapitalGainDraft(input).deduction?.isZero()).toBe(true);
  });

  const rejects: [string, (input: Packet) => void][] = [
    ['wrong tax year', p => { p.taxYear = 2025; }],
    ['unknown calendar year', p => { p.calendarYearConfirmed = false; }],
    ['sale in wrong year', p => { p.sale.date = '2025-07-15'; }],
    ['future sale', p => { p.asOfDate = '2026-07-14'; }],
    ['invalid date', p => { p.sale.date = '2026-02-30'; }],
    ['wrong owner', p => { p.recognition.ownerReference = 'other'; }],
    ['wrong entity', p => { p.entity.entityReference = 'other'; }],
    ['wrong original sale', p => { p.ownership.saleReference = 'other'; }],
    ['recognition date differs', p => { p.recognition.saleDate = '2026-07-14'; }],
    ['reported year differs', p => { p.recognition.taxYear = 2025; }],
    ['not reported to IRS', p => { p.recognition.reportedToIrsConfirmed = false; }],
    ['gain source differs', p => { p.recognition.reportedCapitalGain = '199999'; }],
    ['included gain exceeds reported', p => { p.recognition.includedFederalAgi = '200001'; }],
    ['other exclusion exceeds included', p => { p.recognition.otherwiseOhioDeductedOrExcluded = '200001'; }],
    ['uncertain gain inclusion', p => { p.recognition.currentGainInclusionAndExclusionsComplete = false; }],
    ['installment or deferred recognition', p => { p.recognition.noInstallmentOrDeferredRecognitionConfirmed = false; }],
    ['unresolved capital loss netting', p => { p.recognition.noUnresolvedCapitalLossNettingConfirmed = false; }],
    ['multiple sale', p => { p.sale.onlySaleForOwnerConfirmed = false; }],
    ['indirect sale', p => { p.sale.directEquitySaleConfirmed = false; }],
    ['multiple equity classes', p => { p.sale.equalRightsSingleClassConfirmed = false; }],
    ['late OH organization', p => { p.entity.ohioOrganizationFrom = '2021-07-16'; }],
    ['late OH headquarters', p => { p.entity.ohioHeadquartersFrom = '2021-07-16'; }],
    ['OH history ends early', p => { p.entity.ohioHeadquartersThrough = '2026-07-14'; }],
    ['OH history not continuous', p => { p.entity.continuousHistoryConfirmed = false; }],
    ['not OH business at sale', p => { p.entity.ohioTradeOrBusinessAtSaleConfirmed = false; }],
    ['calendar years substituted for immediate period', p => { p.participation.coveredFrom = '2021-01-01'; p.participation.coveredThrough = '2025-12-31'; }],
    ['participation starts late', p => { p.participation.coveredFrom = '2021-07-16'; }],
    ['participation ends early', p => { p.participation.coveredThrough = '2026-07-14'; }],
    ['unconfirmed regulatory restrictions', p => { p.participation.completeApplicableFederalConditionsConfirmed = false; }],
    ['prior five of ten federal test', p => { p.participation.federalCriterion = 'a5'; }],
    ['prior personal service federal test', p => { p.participation.federalCriterion = 'a6'; }],
    ['other venture method', p => { p.participation.method = 'venture-investment'; }],
    ['missing payroll year', p => { p.payroll.pop(); }],
    ['duplicate payroll year', p => { at(p.payroll).year = 2022; }],
    ['sale-year payroll substituted', p => { at(p.payroll).year = 2026; }],
    ['other entity payroll', p => { at(p.payroll).entityReference = 'other'; }],
    ['unknown annual inventory', p => { at(p.payroll).completeAnnualCompensationConfirmed = false; }],
    ['unreconciled withholding base', p => { at(p.payroll).withholdingBaseReconciliationConfirmed = false; }],
    ['unconfirmed stable recipient identities', p => { at(p.payroll).stableRecipientIdentitiesConfirmed = false; }],
    ['missing original row identity', p => { at(at(p.payroll).recipients).originalPayrollRowReference = ''; }],
    ['annual base mismatch', p => { at(p.payroll).annual5747_06ACompensation = '159999'; }],
    ['withholding base exceeds compensation', p => { at(at(p.payroll).recipients).compensationUsedFor5747_06A = '200001'; }],
    ['unknown relationship', p => { at(at(p.payroll).recipients).relationship = 'unknown'; }],
    ['unconfirmed relationship', p => { at(at(p.payroll).recipients).relationshipConfirmed = false; }],
    ['taxpayer mislabeled as unrelated', p => { at(at(p.payroll).recipients, 1).relationship = 'not-enumerated'; }],
    ['taxpayer recipient differs', p => { at(at(p.payroll).recipients, 1).recipientReference = 'other'; }],
    ['duplicate recipient', p => { at(p.payroll).recipients.push({ ...at(at(p.payroll).recipients) }); at(p.payroll).annual5747_06ACompensation = '260000'; }],
    ['percentage mismatch', p => { p.ownership.percentageOfEntireEntitySold = '19.99'; }],
    ['sale exceeds own holding', p => { p.ownership.ownerUnitsBefore = '19'; }],
    ['holding exceeds entity', p => { p.ownership.ownerUnitsBefore = '101'; }],
    ['zero sold', p => { p.ownership.unitsSold = '0'; p.ownership.percentageOfEntireEntitySold = '0'; }],
    ['unconfirmed capitalization', p => { p.ownership.completeCapitalizationAndTransferConfirmed = false; }],
    ['blank original', p => { p.sale.sourceReference = ''; }],
    ['numeric money', p => { Object.assign(p.sale, { capitalGain: 200000 }); }],
    ['negative money', p => { p.sale.capitalGain = '-1'; }],
    ['exponential money', p => { p.sale.capitalGain = '2e5'; }],
    ['missing compensation', p => { delete (at(p.payroll).recipients[0] as Partial<Packet['payroll'][number]['recipients'][number]>).compensationUsedFor5747_06A; }],
    ['unexpected override', p => { Object.assign(p, { deduction: '200000' }); }],
  ];
  it('rejects missing conflicting and unsupported documentary sources', () => {
    for (const [name, change] of rejects) {
      const input = actual(); change(input);
      const result = calculateOhio2026QualifyingCapitalGainDraft(input);
      expect(result.sourceStatus, name).toBe('incomplete');
      for (const key of ['qualifyingGain', 'qualifyingPayroll', 'excludedFamilyPayroll', 'deductiblePayroll', 'deduction'] as const) expect(result[key], `${name}:${key}`).toBeNull();
      expect(result.lines, name).toEqual([]);
    }
    for (const raw of [null, undefined, {}, { ...actual(), participation: undefined }]) {
      expect(calculateOhio2026QualifyingCapitalGainDraft(raw).deduction).toBeNull();
    }
  });

  it('keeps all gates closed and never echoes documentary identities', () => {
    const input = actual(), before = JSON.stringify(input);
    for (const raw of [input, { ...input, taxYear: 2025 }]) {
      const result = calculateOhio2026QualifyingCapitalGainDraft(raw);
      expect(result.calculationStatus).toBe('incomplete');
      expect(result.filingQualified).toBe(false); expect(result.exportAllowed).toBe(false);
      for (const identity of ['synthetic-owner', 'synthetic-entity', 'synthetic-sale', 'original-equity-sale']) expect(JSON.stringify(result)).not.toContain(identity);
    }
    expect(JSON.stringify(input)).toBe(before);
    expect(calculateOhio2026QualifyingCapitalGainDraft(input)).toEqual(calculateOhio2026QualifyingCapitalGainDraft(input));
  });
});
