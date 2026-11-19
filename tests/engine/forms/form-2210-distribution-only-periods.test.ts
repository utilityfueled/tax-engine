// Spec: spec/federal/form-2210-distribution-only-periods.yaml.
import { expect, it } from 'vitest';
import Decimal from 'decimal.js';
import { calculateFederalTax } from '../../../src/index.js';
import { calculateForm2210ScheduleAi, getForm2210DistributionOnlyBounds } from '@/engine/forms/form-2210-schedule-ai.js';
import { distributionOnlyPeriodInput } from '../../fixtures/form-2210-distribution-only-periods.js';

type Input = ReturnType<typeof distributionOnlyPeriodInput>;
function facts(input: Input) { if (!input.form2210) throw new Error('Actual Form2210 required'); return input.form2210; }
function period(input: Input, index: number) { const value = facts(input).annualizedIncomePeriods?.[index]; if (!value) throw new Error('Actual cumulative period required'); return value; }
function sources(input: Input) { if (!input.scheduleDSpecialGainSources) throw new Error('Actual source packet required'); return input.scheduleDSpecialGainSources; }
function dividend(input: Input) { const value = input.form1099Div[0]; if (!value) throw new Error('Actual DIV required'); return value; }
function reported(input: Input) { const value = sources(input).reportedGains[0]; if (!value) throw new Error('Actual reported source required'); return value; }
function bounds(input: Input) { const value = getForm2210DistributionOnlyBounds(input); if (!value) throw new Error('Actual distribution-only sources required'); return value; }
function actualNoElection4952() { return { sourceTaxYear: 2025, sourceReference: 'Fictional actual no-election worksheet', sourceFactsConfirmed: true,
  sourceFactsComplete: true, investmentInterestExpense: '0', priorYearDisallowed: '0', grossInvestmentIncome: '1200', qualifiedDividendsIncluded: '1200',
  netGainFromInvestmentProperty: '12000', netCapitalGainFromInvestmentProperty: '12000', electedPreferentialIncome: '0', investmentExpenses: '0' }; }

it('rejects a negative interim collectible amount against actual distribution-only originals', () => {
  const input = distributionOnlyPeriodInput();
  period(input, 0).rate28GainLoss = '-1';
  expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it('rejects an interim collectible amount exceeding actual distribution-only originals', () => {
  const input = distributionOnlyPeriodInput();
  period(input, 0).rate28GainLoss = '2500';
  expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it('preserves feasible cumulative periods and independently derived taxes', () => {
  const input = distributionOnlyPeriodInput();
  const bound = getForm2210DistributionOnlyBounds(input);
  expect(bound?.kind).toBe('complete-div-distributions');
  expect(bound?.rate28GainLoss.toFixed()).toBe('2000');
  expect(bound?.unrecaptured1250BeforeLosses.toFixed()).toBe('4000');
  expect(bound?.netCapitalGain.toFixed()).toBe('12000');
  const result = calculateFederalTax(input);
  expect(['a', 'b', 'c', 'd'].map(column => result.form2210?.lines.find(row => row.form === 'Form 2210 Schedule AI' && row.line === `14${column}`)?.value.toFixed()))
    .toEqual(['35054', '34984', '35068', '35194']);
});

it.each([
  ['1250 excess', 0, { unrecaptured1250BeforeLosses: '4000.001' }],
  ['qualified excess', 0, { qualifiedDividends: '1200.001' }],
  ['capital excess', 0, { netCapitalGain: '12000.001' }],
  ['component loss', 1, { rate28GainLoss: '0.001' }],
  ['component decrease', 1, { unrecaptured1250BeforeLosses: '999.999' }],
  ['residual decrease', 1, { netCapitalGain: '3000' }],
  ['special sum exceeds capital', 0, { rate28GainLoss: '2000', unrecaptured1250BeforeLosses: '1000.001' }],
] as const)('rejects exact unsupported distribution-only component: %s', (_name, index, mutation) => {
  const input = distributionOnlyPeriodInput();
  Object.assign(period(input, index), mutation);
  // A small first-column collectible amount cannot disappear from later cumulative columns.
  if (_name === 'component loss') period(input, 0).rate28GainLoss = '0.002';
  expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it('accepts exact zero and full-annual endpoints without inventing period allocations', () => {
  const input = distributionOnlyPeriodInput();
  for (const period of (facts(input).annualizedIncomePeriods ?? [])) {
    Object.assign(period, { qualifiedDividends: '1200', netCapitalGain: '12000', rate28GainLoss: '2000', unrecaptured1250BeforeLosses: '4000' });
  }
  expect(() => calculateFederalTax(input)).not.toThrow();
  // The original explicit zero first-period collectible source remains valid too.
  expect(() => calculateFederalTax(distributionOnlyPeriodInput())).not.toThrow();
});

it('recognizes explicitly sourced signed zero rather than silently skipping finite bounds', () => {
  const input = distributionOnlyPeriodInput();
  sources(input).priorShortTermCapitalLoss = '-0.00';
  sources(input).section1231Lookback = '-0';
  dividend(input).section1202Gain = '-0.00';
  reported(input).section1202Gain = '-0';
  expect(bounds(input).rate28GainLoss.toFixed()).toBe('2000');
  period(input, 0).rate28GainLoss = '-1';
  expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it('retains source-bound year proof when the optional duplicate original year is absent', () => {
  const input = distributionOnlyPeriodInput();
  delete dividend(input).taxYear;
  period(input, 0).rate28GainLoss = '-1';
  expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it('retains explicitly bound zero components when an optional duplicate original box is absent', () => {
  const input = distributionOnlyPeriodInput();
  Object.assign(dividend(input), { section1202Gain: undefined });
  period(input, 0).rate28GainLoss = '-1';
  expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it('rejects an explicitly conflicting original year before general-method fallback', () => {
  const input = distributionOnlyPeriodInput();
  dividend(input).taxYear = 2026;
  expect(() => calculateFederalTax(input)).toThrow('Form 1099-DIV source year 2026 must match the 2025 return');
  expect(() => getForm2210DistributionOnlyBounds(input)).toThrow(/distribution-only original year/);
});

it.each([
    ['zero4797', (input: Input) => { input.form4797 = { netSection1231GainOrLoss: '0', nonrecapturedNetSection1231Losses: '0', propertySales: [] }; }],
    ['no-election4952', (input: Input) => { input.form4952 = actualNoElection4952(); input.form4952Amt = actualNoElection4952(); }],
    ['empty-broker', (input: Input) => { input.form1099B.push({ broker: 'Fictional empty original broker statement', transactions: [] }); }],
] as const)('does not disable source feasibility for actual inert ancillary forms: %s', (_name, mutate) => {
    const input = distributionOnlyPeriodInput(); mutate(input); period(input, 0).rate28GainLoss = '-1';
    expect(() => calculateFederalTax(input)).toThrow(/distribution-only cumulative/);
});

it.each([
    ['unknown4797', (input: Input) => { input.form4797 = { nonrecapturedNetSection1231Losses: '0', propertySales: [] }; }],
    ['unknown4952', (input: Input) => { Object.assign(input, { form4952: { investmentInterestExpense: '0' } }); input.form4952Amt = actualNoElection4952(); }],
    ['conflicting-legacy-carry', (input: Input) => { input.priorYear = { ...input.priorYear, capitalLossCarryforward: '1' }; }],
] as const)('rejects ancillary unknowns and conflicting unused history instead of silently disabling bounds: %s', (_name, mutate) => {
    const input = distributionOnlyPeriodInput(); mutate(input); period(input, 0).rate28GainLoss = '-1';
    expect(() => calculateFederalTax(input)).toThrow(/distribution-only.*(known|actual|conflict)/);
});

it('does not classify other capital sources or unknown history as distribution only', () => {
  const mutations = [
    (x: Input) => { delete x.scheduleDSpecialGainSources; },
    (x: Input) => { Object.assign(sources(x), { allSourcesIncluded: false }); },
    (x: Input) => { sources(x).taxYear = 2026; },
    (x: Input) => { sources(x).priorShortTermCapitalLoss = '-1'; },
    (x: Input) => { sources(x).priorLongTermCapitalLoss = '-1'; },
    (x: Input) => { Object.assign(sources(x), { priorShortTermCapitalLoss: undefined }); },
    (x: Input) => { sources(x).form2439Present = true; },
    (x: Input) => { sources(x).partnershipInterestDispositionPresent = true; },
    (x: Input) => { sources(x).other1250DispositionPresent = true; },
    (x: Input) => { Object.assign(x, { form1099B: [{ broker: 'Other original', transactions: [{ holdingPeriod: 'short' }] }] }); },
    (x: Input) => { x.form4797 = { netSection1231GainOrLoss: '-1', nonrecapturedNetSection1231Losses: '0', propertySales: [] }; },
    (x: Input) => { Object.assign(x, { form6781: {} }); },
    (x: Input) => { Object.assign(x, { form4684: {} }); },
    (x: Input) => { Object.assign(x, { form2555: {} }); },
    (x: Input) => { Object.assign(x, { cryptoIncome: {} }); },
    (x: Input) => { Object.assign(x, { section1202Sources: {} }); },
    (x: Input) => { Object.assign(x, { qofDispositionFacts: { deferredGainHeldAtYearEnd: true } }); },
    (x: Input) => { Object.assign(x, { scheduleK1: [{}] }); },
    (x: Input) => { Object.assign(x, { scheduleK1Form1041: [{}] }); },
    (x: Input) => { Object.assign(x, { form8814: [{}] }); },
    (x: Input) => { Object.assign(x, { homeSales: [{}] }); },
    (x: Input) => { Object.assign(x, { form6252: [{}] }); },
    (x: Input) => { Object.assign(x, { form8824: [{}] }); },
  ];
  for (const mutate of mutations) {
    const input = distributionOnlyPeriodInput();
    mutate(input);
    expect(getForm2210DistributionOnlyBounds(input)).toBeUndefined();
  }
});

it('binds original identities, complete rows and annual components before supplying finite bounds', () => {
  for (const mutate of [
    (x: ReturnType<typeof distributionOnlyPeriodInput>) => { sources(x).primary.ssnLast4 = '9999'; },
    (x: ReturnType<typeof distributionOnlyPeriodInput>) => { reported(x).collectiblesGain = '2001'; },
    (x: ReturnType<typeof distributionOnlyPeriodInput>) => { sources(x).reportedGains.push({ ...reported(x) }); },
    (x: ReturnType<typeof distributionOnlyPeriodInput>) => { sources(x).reportedGains = []; },
  ]) {
    const input = distributionOnlyPeriodInput(); mutate(input);
    expect(() => getForm2210DistributionOnlyBounds(input)).toThrow(/ScheduleD/);
  }
});

it('preserves general signed interim worksheets when complete distribution-only sources have not been established', () => {
  const input = distributionOnlyPeriodInput();
  period(input, 0).rate28GainLoss = '-500';
  const common = { standardDeduction: new Decimal('31500'), agi: new Decimal('240000'), taxableIncome: new Decimal('208500'),
    preferentialIncome: true, selfEmployedOwners: 0, specialTaxMethod: false,
    specialRatePreferentialIncome: { qualifiedDividends: new Decimal('1200'), netCapitalGain: new Decimal('12000'), rate28GainLoss: new Decimal('2000'), unrecaptured1250BeforeLosses: new Decimal('4000') } };
  const result = calculateForm2210ScheduleAi({ taxYear: 2025, filingStatus: 'married_filing_jointly', requiredAnnualPayment: new Decimal('30000'),
    taxAfterRefundableCredits: new Decimal('35194'), facts: facts(input), returnContext: common });
  expect(result.lines.find(row => row.line === '14-rate28-gain-loss-a')?.value.toFixed()).toBe('-2000');
  expect(result.lines.find(row => row.line === '14-section1250-gain-a')?.value.toFixed()).toBe('2000');
  expect(() => calculateForm2210ScheduleAi({ taxYear: 2025, filingStatus: 'married_filing_jointly', requiredAnnualPayment: new Decimal('30000'),
    taxAfterRefundableCredits: new Decimal('35194'), facts: facts(input), returnContext: { ...common, distributionOnlyCapitalBounds: getForm2210DistributionOnlyBounds(distributionOnlyPeriodInput()) } }))
    .toThrow(/distribution-only cumulative/);
});

it('rejects stale finite bounds instead of replacing actual completed annual source components', () => {
  const input = distributionOnlyPeriodInput();
  const bound = bounds(input);
  const base = { taxYear: 2025, filingStatus: 'married_filing_jointly' as const, requiredAnnualPayment: new Decimal('30000'),
    taxAfterRefundableCredits: new Decimal('35194'), facts: facts(input), returnContext: {
      standardDeduction: new Decimal('31500'), agi: new Decimal('240000'), taxableIncome: new Decimal('208500'),
      preferentialIncome: true, selfEmployedOwners: 0, specialTaxMethod: false,
      specialRatePreferentialIncome: { qualifiedDividends: bound.qualifiedDividends, netCapitalGain: bound.netCapitalGain,
        rate28GainLoss: bound.rate28GainLoss, unrecaptured1250BeforeLosses: bound.unrecaptured1250BeforeLosses }, distributionOnlyCapitalBounds: bound,
    } };
  for (const delta of [{ taxYear: 2026 }, { rate28GainLoss: new Decimal('2000.001') }, { qualifiedDividends: new Decimal('NaN') }]) {
    expect(() => calculateForm2210ScheduleAi({ ...base, returnContext: { ...base.returnContext, distributionOnlyCapitalBounds: { ...bound, ...delta } } }))
      .toThrow(/bounds must reconcile/);
  }
});
