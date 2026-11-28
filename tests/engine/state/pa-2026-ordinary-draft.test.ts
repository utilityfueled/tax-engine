import Decimal from 'decimal.js';
import {Form1099GSchema,Form1099IntSchema} from '@/models/inputs.js';
import {it,expect} from 'vitest';
import {calculatePAOrdinaryReturn,calculatePA2026OrdinaryDraft,calculatePA2026OrdinaryUnemploymentDraft} from '@/engine/state/pa-ordinary-return.js';
import {calculatePAResidencySources} from '@/engine/state/pa-residency-sources.js';
import {calculateFederalTax} from '@/engine/federal.js';
import {getConstants} from '@/models/constants.js';
import {preparePAOrdinaryReturnReview} from '@/pdf/pa-ordinary-return-review-context.js';
import {pa2026FloridaMoveResidentFixture,pa2026OrdinaryDraftFixture,pa2026OutboundNonresidentFixture,pa2026OrdinaryBankInterestFixture,pa2026OrdinaryCashDividendFixture,pa2026TexasMoveResidentFixture,rebindPA2026Draft} from '../../fixtures/pa-2026-ordinary-draft.js';
import {paOrdinaryReturnFixture} from '../../fixtures/pa-ordinary-return.js';
import {paOrdinaryLocalW2Fixture} from '../../fixtures/pa-ordinary-local-w2.js';
import {confirmGuidedPAOrdinaryReturnFacts,buildGuidedPAOrdinaryReturnFacts,updateGuidedPAOrdinaryReturnFacts} from '../../../apps/web/src/lib/guided-pa-ordinary-return-facts.js';
import {confirmGuidedPAOrdinaryReturnCompletionSources,buildGuidedPAOrdinaryReturnCompletionSources,updateGuidedPAOrdinaryReturnCompletionSources} from '../../../apps/web/src/lib/guided-pa-ordinary-return-completion.js';
// Spec: spec/state/pa-2026-ordinary-draft.yaml; all literal oracles fixed before implementation.
it('PA2026 draft composes all actual residency sources without full federal admission',()=>{
 for(const [status,taxable,tax] of [['resident','75000','2303'],['part_year','39000','1197'],['nonresident','9000','276']] as const){
  const f=pa2026OrdinaryDraftFixture(status),before=JSON.stringify(f),r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);
  expect(r.kind).toBe('pa-2026-ordinary-source-draft');expect(r.taxYear).toBe(2026);expect(r.pa.residencyStatus).toBe(status);expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe(taxable);expect(r.pa.pa40.taxLiability.toFixed()).toBe(tax);expect(new Decimal(taxable).times('0.0307').toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toFixed()).toBe(tax);expect(r.pa.pa40.netOverpayment.toFixed()).toBe('0');expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75000');expect(r.pa.scheduleSP.taxForgivenessCredit.toFixed()).toBe('0');expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');expect(r.pa.workingCredit.credit.toFixed()).toBe('0');expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');expect(r.dependencyProof.maximumCompletedEitcPhaseout.toFixed()).toBe('70244');expect(r).not.toHaveProperty('federal');expect(JSON.stringify(f)).toBe(before);
 }
});

it('PA2026 draft carries verified mixed-locality use tax into the balance due', () => {
 const f = pa2026OrdinaryDraftFixture();
 const date = '2026-05-01';
 const purchases = ['philadelphia', 'allegheny_county'].map((locality, index) => ({
  sourceReference: `Synthetic purchase and delivery invoice ${index + 1}`, date, kind: 'goods', locality,
  taxableAmount: '10000', allowableTaxPaid: '0',
  original: { receiptNumber: `INVOICE-${index + 1}`, date, amount: '10000', taxPaid: '0', locality },
 }));
 const facts = { ...f.facts, useTax: { status: 'itemized', sourceReference: 'Synthetic original receipt set', classificationConfirmed: true, purchases },
  timing: { ...f.facts.timing, remainingTaxPayment: { status: 'expected_payment', date: '2027-04-15', amountAppliedToTax: '1500',
   sourceReference: 'Synthetic planned balance payment' } } };
 const result = calculatePA2026OrdinaryDraft(f.input, facts, f.sources);
 expect(result.pa.pa40.useTax.toFixed()).toBe('1500');
 expect(result.pa.pa40.totalAmountDue.toFixed()).toBe('1500');
 expect(result.pa.rev1630.totalInterest.toFixed()).toBe('0');
 expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 const legacy = { ...facts, useTax: { ...facts.useTax, locality: 'philadelphia',
  purchases: purchases.map(row => ({ ...row, locality: undefined, original: { ...row.original, locality: undefined } })) } };
 expect(() => calculatePA2026OrdinaryDraft(f.input, legacy, f.sources)).toThrow(/use tax.*separate method/i);
 expect(() => calculatePA2026OrdinaryDraft(f.input, { ...facts, timing: { ...facts.timing,
  remainingTaxPayment: { ...facts.timing.remainingTaxPayment, amountAppliedToTax: '1400' } } }, f.sources)).toThrow(/principal.*fresh/i);
});

it('PA2026 draft holds future use-tax receipts and reports same-day purchases', () => {
 const f = pa2026OrdinaryDraftFixture();
 const asOfDate = '2026-12-30';
 const date = '2026-12-31';
 f.facts.timing.asOfDate = asOfDate;
 for (const account of f.sources.otherStateTaxes.jurisdictions) account.completeThroughDate = asOfDate;
 f.facts.timing.remainingTaxPayment = { status: 'expected_payment', date: '2027-04-15', amountAppliedToTax: '800',
  sourceReference: 'Synthetic planned balance payment' };
 const purchase = { sourceReference: 'Synthetic Philadelphia invoice', date, kind: 'goods' as const,
  locality: 'philadelphia' as const, taxableAmount: '10000', allowableTaxPaid: '0',
  original: { receiptNumber: 'INVOICE-PHL', date, amount: '10000', taxPaid: '0', locality: 'philadelphia' as const } };
 f.facts.useTax = { status: 'itemized', sourceReference: 'Synthetic delivery invoice', classificationConfirmed: true, purchases: [purchase] };

 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/actual use-tax purchase date.*as-of/i);

 purchase.date = asOfDate;
 purchase.original.date = asOfDate;
 const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
 expect(result.pa.pa40.useTax.toFixed()).toBe('800');
 expect(result.pa.pa40.totalAmountDue.toFixed()).toBe('800');
});

it('PA2026 part-year bank interest replays one complete original and its dated credits', () => {
 const f = pa2026OrdinaryBankInterestFixture();
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const completion = confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const before = JSON.stringify(f.input);
 const r = calculatePA2026OrdinaryDraft(f.input, buildGuidedPAOrdinaryReturnFacts(f.input, facts), buildGuidedPAOrdinaryReturnCompletionSources(f.input, completion, facts));
 expect(r.pa.residencyStatus).toBe('part_year');
 expect(r.pa.scheduleA.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleA.reductionAdjustments.map(row => [row.description, row.amount.toFixed()])).toEqual([['Non-Residency Period Interest', '80']]);
 expect(r.pa.scheduleA.line16.toFixed()).toBe('40');
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('39040');
 expect(r.pa.pa40.taxLiability.toFixed()).toBe('1199');
 expect(r.pa.pa40.stateWithholding.toFixed()).toBe('1199');
 expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75120');
 expect(r.pa.workingCredit.credit.toFixed()).toBe('0');
 expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');
 expect(r.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(r.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(f.input)).toBe(before);
});

const unsupportedBankInterest: Array<[string, (f: ReturnType<typeof pa2026OrdinaryBankInterestFixture>) => void, RegExp]> = [
 ['a missing credit ledger', f => { f.input.paResidencySources.interest[0].credits = []; }, /dated credit ledger/i],
 ['a missing original', f => { f.input.form1099Int = []; }, /every current original/i],
 ['a conflicting credit date on the same evidence', f => {
  const [earlier, later] = f.input.paResidencySources.interest[0].credits;
  later.sourceReference = ` ${earlier.sourceReference.toUpperCase()} `;
 }, /conflicting.*credit|credit.*reference/i],
 ['a credit outside 2026', f => { f.input.paResidencySources.interest[0].credits[1].creditedOn = '2027-01-01'; }, /actual calendar date/i],
 ['a wrong original year', f => { f.input.form1099Int[0].taxYear = 2025; }, /original.*source year/i],
 ['an unanswered original year', f => { delete f.input.form1099Int[0].taxYear; }, /actual 2026.*1099-INT/i],
 ['an unanswered account reference', f => { delete f.input.form1099Int[0].accountReference; }, /actual 2026.*1099-INT/i],
 ['an unanswered other box', f => { delete f.input.form1099Int[0].federalWithheld; }, /Box 1.*known-zero/i],
 ['a changed Box 1 amount', f => { f.input.form1099Int[0].interestIncome = '121'; }, /credits.*reconcile original Box1/i],
 ['positive withheld tax', f => { f.input.form1099Int[0].federalWithheld = '1'; }, /Box 1.*known-zero/i],
 ['insufficient actual withholding', f => {
  const w2 = f.input.w2s[0];
  w2.stateTaxWithheld = new Decimal(w2.stateTaxWithheld ?? '0').minus(1).toFixed();
 }, /withholding must cover/i],
 ['multiple current bank originals', f => {
  const [original] = f.input.form1099Int;
  const [source] = f.input.paResidencySources.interest;
  const second = { ...original, accountReference: 'fictional-second-account' };
  f.input.form1099Int.push(second);
  f.input.paResidencySources.interest.push({ ...structuredClone(source), originalIndex: 1, sourceReference: 'fictional-second-1099-int', original: second });
 }, /one.*1099-INT/i],
];
it.each(unsupportedBankInterest)('PA2026 part-year bank interest holds %s', (_scenario, change, expected) => {
 const f = pa2026OrdinaryBankInterestFixture();
 change(f);
 if (f.input.form1099Int.length) f.input.paResidencySources.interest[0].original = structuredClone(f.input.form1099Int[0]);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

it('PA2026 full-year resident bank interest transfers the complete current original', () => {
 const f = pa2026OrdinaryBankInterestFixture('resident');
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const completion = confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const before = JSON.stringify(f.input);
 const r = calculatePA2026OrdinaryDraft(f.input, buildGuidedPAOrdinaryReturnFacts(f.input, facts), buildGuidedPAOrdinaryReturnCompletionSources(f.input, completion, facts));
 expect(r.pa.residencyStatus).toBe('resident');
 expect(r.pa.scheduleA.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleA.reductionAdjustments).toEqual([]);
 expect(r.pa.scheduleA.line16.toFixed()).toBe('120');
 expect(r.pa.pa40.interest.toFixed()).toBe('120');
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('75120');
 expect(r.pa.pa40.taxLiability.toFixed()).toBe('2306');
 expect(r.pa.pa40.stateWithholding.toFixed()).toBe('2306');
 expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75120');
 expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
 expect(r.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(r.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(f.input)).toBe(before);
});

it.each(unsupportedBankInterest)('PA2026 full-year resident bank interest holds %s', (_scenario, change, expected) => {
 const f = pa2026OrdinaryBankInterestFixture('resident');
 change(f);
 if (f.input.form1099Int.length) f.input.paResidencySources.interest[0].original = structuredClone(f.input.form1099Int[0]);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

it('PA2026 full-year nonresident bank interest excludes the complete original from PA taxable income', () => {
 const f = pa2026OrdinaryBankInterestFixture('nonresident');
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const completion = confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const before = JSON.stringify(f.input);
 const r = calculatePA2026OrdinaryDraft(f.input, buildGuidedPAOrdinaryReturnFacts(f.input, facts), buildGuidedPAOrdinaryReturnCompletionSources(f.input, completion, facts));
 expect(r.pa.residencyStatus).toBe('nonresident');
 expect(r.pa.scheduleA.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleA.reductionAdjustments.map(row => [row.description, row.amount.toFixed()])).toEqual([['Non-Residency Period Interest', '120']]);
 expect(r.pa.scheduleA.line16.toFixed()).toBe('0');
 expect(r.pa.pa40.interest.toFixed()).toBe('0');
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('9000');
 expect(r.pa.pa40.taxLiability.toFixed()).toBe('276');
 expect(r.pa.pa40.stateWithholding.toFixed()).toBe('276');
 expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75120');
 expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
 expect(r.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(r.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(f.input)).toBe(before);
});

it.each(unsupportedBankInterest)('PA2026 full-year nonresident bank interest holds %s', (_scenario, change, expected) => {
 const f = pa2026OrdinaryBankInterestFixture('nonresident');
 change(f);
 if (f.input.form1099Int.length) f.input.paResidencySources.interest[0].original = structuredClone(f.input.form1099Int[0]);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

it('PA2026 full-year nonresident bank interest holds a statutory nonresident domiciled in Pennsylvania', () => {
 const f = pa2026OrdinaryBankInterestFixture('nonresident');
 const residency = f.input.paResidencySources.residency;
 residency.domicilePeriods[0].state = 'PA';
 residency.domicilePeriods[0].daysInPA = 30;
 expect(calculatePAResidencySources(f.input, f.input.paResidencySources).residencyStatus).toBe('nonresident');
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/full-year nonresident bank interest.*outside Pennsylvania/i);
});

it('PA2026 full-year resident bank interest holds a Pennsylvania statutory resident domiciled elsewhere', () => {
 const f = pa2026OrdinaryBankInterestFixture('resident');
 const residency = f.input.paResidencySources.residency;
 residency.domicilePeriods[0].state = 'NY';
 residency.domicilePeriods[0].daysInPA = 184;
 residency.paPermanentAbodePeriods = [{ from: '2026-01-01', through: '2026-12-31' }];
 expect(calculatePAResidencySources(f.input, f.input.paResidencySources).residencyStatus).toBe('resident');
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/full-year resident bank interest.*Pennsylvania domicile/i);
});

it('PA2026 part-year cash dividend replays one complete original and its dated credits', () => {
 const f = pa2026OrdinaryCashDividendFixture();
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const completion = confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const before = JSON.stringify(f.input);
 const r = calculatePA2026OrdinaryDraft(f.input, buildGuidedPAOrdinaryReturnFacts(f.input, facts), buildGuidedPAOrdinaryReturnCompletionSources(f.input, completion, facts));
 expect(r.pa.residencyStatus).toBe('part_year');
 expect(r.pa.scheduleB.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleB.line4.toFixed()).toBe('80');
 expect(r.pa.scheduleB.line10.toFixed()).toBe('0');
 expect(r.pa.scheduleB.line12.toFixed()).toBe('40');
 expect(r.pa.pa40.dividends.toFixed()).toBe('40');
 expect(r.pa.pa40.interest.toFixed()).toBe('0');
 expect(r.pa.pa40.netGainOrLoss.toFixed()).toBe('0');
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('39040');
 expect(r.pa.pa40.taxLiability.toFixed()).toBe('1199');
 expect(r.pa.pa40.stateWithholding.toFixed()).toBe('1199');
 expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75120');
 expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');
 expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
 expect(r.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(r.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(f.input)).toBe(before);
});

function interestAndDividends(withholding: string, status: 'part_year' | 'resident' | 'nonresident' = 'part_year') {
 const f = pa2026OrdinaryCashDividendFixture(status);
 const bank = pa2026OrdinaryBankInterestFixture(status);
 f.input.form1099Int = bank.input.form1099Int;
 f.residency.interest = bank.input.paResidencySources.interest;
 f.input.w2s[0].stateTaxWithheld = withholding;
 rebindPA2026Draft(f);
 return f;
}

const annualCombinedInvestmentScenarios = [
 ['resident', '2310', '75240', '120', '0'],
 ['nonresident', '276', '9000', '0', '120'],
] as const;

it.each(annualCombinedInvestmentScenarios)('PA2026 annual %s calculates both verified personal investment originals', (status, tax, taxable, included, excluded) => {
 const f = interestAndDividends(tax, status);
 const bankCredit = f.residency.interest[0].credits[0];
 bankCredit.amount = new Decimal(bankCredit.amount).plus('0.11').toFixed();
 f.input.form1099Int[0].interestIncome = '120.11';
 f.residency.interest[0].original = structuredClone(f.input.form1099Int[0]);
 f.residency.dividends[0].credits[1].ordinaryDividends = '40.19';
 f.input.form1099Div[0].ordinaryDividends = '120.19';
 f.residency.dividends[0].original = structuredClone(f.input.form1099Div[0]);
 rebindPA2026Draft(f);
 const before = JSON.stringify(f);
 const source = calculatePAResidencySources(f.input, f.residency);
 expect((status === 'resident' ? source.interest : source.excludedNonPAInterest).toFixed()).toBe('120.11');
 expect((status === 'resident' ? source.dividends : source.excludedNonPADividends).toFixed()).toBe('120.19');
 const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
 expect(r.pa.residencyStatus).toBe(status);
 expect(r.pa.scheduleA.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleA.reductionAdjustments.map(row => row.amount.toFixed())).toEqual(excluded === '0' ? [] : [excluded]);
 expect(r.pa.scheduleA.line16.toFixed()).toBe(included);
 expect(r.pa.scheduleB.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleB.line4.toFixed()).toBe(excluded);
 expect(r.pa.scheduleB.line12.toFixed()).toBe(included);
 expect(r.pa.pa40.interest.toFixed()).toBe(included);
 expect(r.pa.pa40.dividends.toFixed()).toBe(included);
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe(taxable);
 expect(r.pa.pa40.taxLiability.toFixed()).toBe(tax);
 expect(r.pa.pa40.stateWithholding.toFixed()).toBe(tax);
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75240');
 expect(r.pa.scheduleSP.taxForgivenessCredit.toFixed()).toBe('0');
 expect(r.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(r.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(() => preparePAOrdinaryReturnReview(f.input)).toThrow(/actual2025 ordinary PDF method only/);
 expect(JSON.stringify(f)).toBe(before);
});

it.each(annualCombinedInvestmentScenarios)('PA2026 annual %s combination holds the incompatible domicile method', (status, withholding) => {
 const f = interestAndDividends(withholding, status);
 expect(calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources).pa.residencyStatus).toBe(status);
 const residency = f.residency.residency;
 const period = residency.domicilePeriods[0];
 if (status === 'resident') {
  period.state = 'NY';
  period.daysInPA = 184;
  residency.paPermanentAbodePeriods = [{ from: '2026-01-01', through: '2026-12-31' }];
 } else {
  period.state = 'PA';
  period.daysInPA = 30;
 }
 expect(calculatePAResidencySources(f.input, f.residency).residencyStatus).toBe(status);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/full-year (?:non)?resident bank interest.*domicile/i);
});

it.each(annualCombinedInvestmentScenarios)('PA2026 annual %s combined originals hold cross-owner and changed dated receipts', (status, withholding) => {
 const f = interestAndDividends(withholding, status);
 expect(calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources).pa.residencyStatus).toBe(status);
 const bankCredit = f.residency.interest[0].credits[0];
 const amount = bankCredit.amount;
 bankCredit.amount = new Decimal(amount).plus('0.01').toFixed();
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/credits.*reconcile original Box1/i);
 bankCredit.amount = amount;
 f.input.form1099Div[0].accountHolder = 'spouse';
 f.residency.dividends[0].original = structuredClone(f.input.form1099Div[0]);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/primary|owner/i);
});

type CashDividendFixture = ReturnType<typeof pa2026OrdinaryCashDividendFixture>;

function bindCashDividendAccount(f: CashDividendFixture, accountReference: string) {
 f.input.form1099Div[0].accountReference = accountReference;
 f.residency.dividends[0].original = structuredClone(f.input.form1099Div[0]);
 rebindPA2026Draft(f);
}

const partYearDividendAccountCases = [
 ['dividend-only', () => pa2026OrdinaryCashDividendFixture(), '0', '39040', '1199', '75120'],
 ['combined investment', () => interestAndDividends('1200'), '40', '39080', '1200', '75240'],
] as const;

it.each(partYearDividendAccountCases)('PA2026 reopened part-year %s holds repeated masked dividend account references', (_method, makeFixture) => {
 for (const reference of ['BROKER-XXXX-1234', 'BROKER****1234', 'last four 1234', '1234', 'ＢＲＯＫＥＲ－ＸＸＸＸ－１２３４']) {
  const f = makeFixture();
  bindCashDividendAccount(f, reference);
  const saved: CashDividendFixture = JSON.parse(JSON.stringify(f));
  expect(() => calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources), reference)
   .toThrow(/complete unmasked account reference/i);
 }
});

it.each(partYearDividendAccountCases)('PA2026 reopened part-year %s accepts a complete literal dividend account', (_method, makeFixture, interest, taxable, tax, eligibility) => {
 const f = makeFixture();
 bindCashDividendAccount(f, 'ＢＲＯＫＥＲ－Ｘ７ＸＸ－１２３４');
 const saved: CashDividendFixture = JSON.parse(JSON.stringify(f));
 const before = JSON.stringify(saved);
 const result = calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources);
 expect(result.pa.scheduleB.line1.toFixed()).toBe('120');
 expect(result.pa.scheduleB.line4.toFixed()).toBe('80');
 expect(result.pa.scheduleB.line12.toFixed()).toBe('40');
 expect(result.pa.pa40.interest.toFixed()).toBe(interest);
 expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe(taxable);
 expect(result.pa.pa40.taxLiability.toFixed()).toBe(tax);
 expect(result.pa.scheduleSP.eligibilityIncome.toFixed()).toBe(eligibility);
 expect(result.readiness).toMatchObject({filingEligible: false, fullFederalCalculated: false});
 expect(result.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(saved)).toBe(before);
});

it('PA2026 reopened part-year cash dividends retain literal account matching', () => {
 const f = pa2026OrdinaryCashDividendFixture();
 bindCashDividendAccount(f, 'ＢＲＯＫＥＲ－Ｘ７ＸＸ－１２３４');
 f.residency.dividends[0].original.accountReference = 'BROKER-X7XX-1234';
 rebindPA2026Draft(f);
 const saved: CashDividendFixture = JSON.parse(JSON.stringify(f));
 expect(() => calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources))
  .toThrow(/original owner\/year\/identity is missing or stale/i);
});

it('PA2026 part-year combines separately reconciled interest and dividends', () => {
 const f = interestAndDividends('1200');
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const completion = confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const before = JSON.stringify(f.input);
 const result = calculatePA2026OrdinaryDraft(f.input, buildGuidedPAOrdinaryReturnFacts(f.input, facts), buildGuidedPAOrdinaryReturnCompletionSources(f.input, completion, facts));
 expect(result.pa.residencyStatus).toBe('part_year');
 expect(result.pa.scheduleA.line1.toFixed()).toBe('120');
 expect(result.pa.scheduleA.reductionAdjustments.map(row => row.amount.toFixed())).toEqual(['80']);
 expect(result.pa.scheduleA.line16.toFixed()).toBe('40');
 expect(result.pa.scheduleB.line1.toFixed()).toBe('120');
 expect(result.pa.scheduleB.line4.toFixed()).toBe('80');
 expect(result.pa.scheduleB.line12.toFixed()).toBe('40');
 expect(result.pa.pa40.interest.toFixed()).toBe('40');
 expect(result.pa.pa40.dividends.toFixed()).toBe('40');
 expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe('39080');
 expect(result.pa.pa40.taxLiability.toFixed()).toBe('1200');
 expect(result.pa.pa40.stateWithholding.toFixed()).toBe('1200');
 expect(result.pa.pa40.totalAmountDue.toFixed()).toBe('0');
 expect(result.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75240');
 expect(result.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
 expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(result.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(f.input)).toBe(before);
});

it('PA2026 part-year combined interest and dividends require withholding for both classes', () => {
 const f = interestAndDividends('1199');
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/withholding must cover/i);
});

it.each([
 ['1099-INT', (f: ReturnType<typeof interestAndDividends>) => {
  f.input.form1099Int[0].interestIncome = '121';
  f.residency.interest[0].original = structuredClone(f.input.form1099Int[0]);
 }, /credits.*reconcile original Box1/i],
 ['1099-DIV', (f: ReturnType<typeof interestAndDividends>) => {
  f.input.form1099Div[0].ordinaryDividends = '121';
  f.residency.dividends[0].original = structuredClone(f.input.form1099Div[0]);
 }, /distributions.*reconcile.*Box1a/i],
] as const)('PA2026 part-year combined investment sources hold a mismatched %s original', (_kind, change, error) => {
 const f = interestAndDividends('1200');
 change(f);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(error);
});

it('PA2026 part-year cash dividend outside the resident period enters Schedule SP only', () => {
 const f = pa2026OrdinaryCashDividendFixture();
 f.residency.dividends[0].credits[1].creditedOn = '2026-06-30';
 f.input.w2s[0].stateTaxWithheld = '1197';
 rebindPA2026Draft(f);
 const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
 expect(r.pa.scheduleB.line4.toFixed()).toBe('120');
 expect(r.pa.pa40.dividends.toFixed()).toBe('0');
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe('39000');
 expect(r.pa.pa40.taxLiability.toFixed()).toBe('1197');
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75120');
});

const unsupportedCashDividends: Array<[string, (f: ReturnType<typeof pa2026OrdinaryCashDividendFixture>) => void, RegExp]> = [
 ['a missing original', f => { f.input.form1099Div = []; }, /complete actual dividend original coverage/i],
 ['a missing dividend ledger', f => { f.residency.dividends[0].credits = []; }, /dated dividend distribution ledger/i],
 ['an unconfirmed domestic cash-only original', f => {
  f.residency.dividends[0].domesticCorporateCashDividendsOnlyConfirmed = null;
  f.residency.dividends[0].capitalDistributionsFromRegulatedInvestmentCompanyConfirmed = true;
 }, /domestic.*cash/i],
 ['a conflicting date reusing the same credit evidence', f => {
  const [earlier, later] = f.residency.dividends[0].credits;
  later.sourceReference = ` ${earlier.sourceReference.toUpperCase().replace(/ /g, '  ')} `;
 }, /conflicting.*dividend.*reference/i],
 ['a credit outside 2026', f => { f.residency.dividends[0].credits[1].creditedOn = '2027-01-01'; }, /actual calendar date/i],
 ['a wrong original year', f => { f.input.form1099Div[0].taxYear = 2025; }, /dividend original owner\/year/i],
 ['an unanswered original account', f => { delete f.input.form1099Div[0].accountReference; }, /actual.*1099-DIV.*account/i],
 ['an unanswered federal withholding box', f => { delete f.input.form1099Div[0].federalWithheld; }, /actual nonnegative monetary amount/i],
 ['positive federal withholding', f => { f.input.form1099Div[0].federalWithheld = '1'; }, /known-zero.*withholding/i],
 ['positive PA withholding', f => { Object.assign(f.input.form1099Div[0], { state: 'PA', stateWithheld: '1' }); }, /known-zero.*withholding/i],
 ['a changed Box 1a amount', f => { f.input.form1099Div[0].ordinaryDividends = '121'; }, /distributions.*reconcile.*Box1a/i],
 ['a nonordinary distribution', f => { f.input.form1099Div[0].nondividendDistributions = '1'; }, /special dividend source class/i],
 ['a reconciled Box 2a distribution', f => {
  f.input.form1099Div[0].totalCapitalGainDistributions = '1';
  f.residency.dividends[0].capitalDistributionsFromRegulatedInvestmentCompanyConfirmed = true;
  f.residency.dividends[0].credits[1].capitalGainDistributions = '1';
 }, /known-zero other amounts/i],
 ['a second reconciled original', f => {
  const original = { ...f.input.form1099Div[0], payer: 'Fictional second corporation', accountReference: 'fictional-second-dividend-account' };
  f.input.form1099Div.push(original);
  const second = { ...structuredClone(f.residency.dividends[0]), originalIndex: 1, original, sourceReference: 'Fictional second original' };
  f.residency.dividends.push(second);
 }, /one actual.*1099-DIV/i],
 ['a zero-dollar ledger placeholder', f => {
  f.residency.dividends[0].credits.push({ sourceReference: 'Fictional empty statement period', creditedOn: '2026-03-31', ordinaryDividends: '0', capitalGainDistributions: '0' });
 }, /positive dated.*cash/i],
 ['insufficient actual withholding', f => { f.input.w2s[0].stateTaxWithheld = '1197'; }, /withholding must cover/i],
];
it.each(unsupportedCashDividends)('PA2026 part-year cash dividend holds %s', (_scenario, change, expected) => {
 const f = pa2026OrdinaryCashDividendFixture();
 change(f);
 if (f.input.form1099Div.length) f.residency.dividends[0].original = structuredClone(f.input.form1099Div[0]);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

it.each([
 ['resident', '0', '120', '75120', '2306'],
 ['nonresident', '120', '0', '9000', '276'],
] as const)('PA2026 cash dividends reconcile annual %s tax and worldwide Schedule SP', (status, outside, paDividends, paIncome, tax) => {
 const f: ReturnType<typeof pa2026OrdinaryCashDividendFixture> = JSON.parse(JSON.stringify(pa2026OrdinaryCashDividendFixture(status)));
 const before = JSON.stringify(f);
 const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
 expect(r.pa.residencyStatus).toBe(status);
 expect(r.pa.scheduleB.line1.toFixed()).toBe('120');
 expect(r.pa.scheduleB.line4.toFixed()).toBe(outside);
 expect(r.pa.scheduleB.line12.toFixed()).toBe(paDividends);
 expect(r.pa.pa40.dividends.toFixed()).toBe(paDividends);
 expect(r.pa.pa40.totalPATaxableIncome.toFixed()).toBe(paIncome);
 expect(r.pa.pa40.taxLiability.toFixed()).toBe(tax);
 expect(new Decimal(paIncome).times('0.0307').toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed()).toBe(tax);
 expect(r.pa.pa40.stateWithholding.toFixed()).toBe(tax);
 expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('0');
 // Box 1b's $30 subset is already included in the $120 Box 1a.
 expect(r.dependencyProof.ordinaryWages.plus(r.pa.scheduleB.line1).toFixed()).toBe('75120');
 expect(r.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75120');
 expect(r.pa.scheduleSP.taxForgivenessCredit.toFixed()).toBe('0');
 expect(r.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
 expect(r).not.toHaveProperty('federal');
 expect(r.readiness).toMatchObject({filingEligible: false, fullFederalCalculated: false});
 expect(r.readiness.blockers).toContain('final-2026-forms-unqualified');
 expect(JSON.stringify(f)).toBe(before);
});

it.each([
 ['resident', pa2026FloridaMoveResidentFixture, '2306', /Florida move requires complete wage-only originals/i],
 ['nonresident', pa2026OutboundNonresidentFixture, '276', /continuous confirmed domicile/i],
] as const)('PA2026 cash dividends still hold the two-period %s method', (_status, fixture, withholding, expected) => {
 const f = fixture();
 const base = pa2026OrdinaryCashDividendFixture();
 f.input.form1099Div = base.input.form1099Div;
 f.input.paResidencySources.dividends = base.residency.dividends;
 f.input.w2s[0].stateTaxWithheld = withholding;
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

function fullYearCashDividendAccountFixture(status: 'resident' | 'nonresident', accountReference: string) {
 const f = pa2026OrdinaryCashDividendFixture(status);
 bindCashDividendAccount(f, accountReference);
 return f;
}

it.each(['resident', 'nonresident'] as const)('PA2026 annual %s cash dividends reject repeated masked account references', status => {
 for (const reference of ['BROKER-XXXX-1234', 'XXXX-XXXX-1234', 'BROKER****1234', 'last four 1234', '1234']) {
  const f = fullYearCashDividendAccountFixture(status, reference);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources), reference).toThrow(/complete unmasked account reference/i);
 }
});

it.each(['resident', 'nonresident'] as const)('PA2026 annual %s cash dividends accept literal account references with X characters', status => {
 for (const reference of ['BROKER-AXXXX-1234', 'BROKER-XXXXA-1234', 'BROKER-X7XX-1234', 'ＢＲＯＫＥＲ－Ｘ７ＸＸ－１２３４']) {
  const f = fullYearCashDividendAccountFixture(status, reference);
  expect(calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources).pa.scheduleSP.eligibilityIncome.toFixed(), reference).toBe('75120');
 }
});

it.each(['BROKER:XXXX:1234', 'XXXX-XX-1234', 'ＢＲＯＫＥＲ－ＸＸＸＸ－１２３４'])('PA2026 annual cash dividends reject alternate masks (%s)', reference => {
 for (const status of ['resident', 'nonresident'] as const) {
  const f = fullYearCashDividendAccountFixture(status, reference);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources), status).toThrow(/complete unmasked account reference/i);
 }
});

it('PA2026 annual cash dividends still match nonmasked references literally', () => {
 const f = fullYearCashDividendAccountFixture('resident', 'ＢＲＯＫＥＲ－Ｘ７ＸＸ－１２３４');
 f.residency.dividends[0].original.accountReference = 'BROKER-X7XX-1234';
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/original owner\/year\/identity is missing or stale/i);
});

function pa2026UnemploymentFixture(status: 'resident' | 'part_year' | 'nonresident' = 'resident') {
 const f = pa2026OrdinaryDraftFixture(status);
 const original = Form1099GSchema.parse({
  payer: 'Fictional State Unemployment Insurance Agency', sourceId: 'PRIVATE-PA-UC-ORIGINAL',
  accountReference: 'PRIVATE-PA-UC-ACCOUNT', accountHolder: 'primary', taxYear: 2026, sourceFormRevision: '2026-12',
  sourceFactsConfirmed: true, actualReceiptConfirmed: true, additionalWorksheetRequired: false,
  programType: 'government-unemployment', unemploymentCompensation: '2600.25', federalWithheld: '260.02',
  stateOrLocalTaxRefund: '0', rtaaPayments: '0', taxableGrants: '0', agriculturePayments: '0',
  marketGain: '0', familyLeaveBenefits: '0', tradeOrBusinessRefund: false,
  currentYearRepaid: '0', priorYearRepaid: '0', unrecoveredAfterTaxContributions: '0', stateTaxReporting: 'none',
 });
 f.input.form1099G = [original];
 const {firstName,lastName,ssn} = f.input.taxpayer.primary;
 const exclusionProof = {
  sourceId: original.sourceId, sourceReference: 'Fictional actual 2026 government unemployment original',
  recipient: {firstName,lastName,ssn}, currentUncorrectedNonvoidOriginalConfirmed: true,
  allOriginalBoxesKnownConfirmed: true, ordinaryNoncontributoryStateUnemploymentConfirmed: true, noStateWithholdingConfirmed: true,
 };
 rebindPA2026Draft(f);
 return {...f,original,exclusionProof};
}

it('PA2026 part-year bank interest holds simultaneous government unemployment', () => {
 const f = pa2026OrdinaryBankInterestFixture();
 const unemployment = pa2026UnemploymentFixture('part_year');
 f.input.form1099G = unemployment.input.form1099G;
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryUnemploymentDraft(f.input, f.facts, f.sources, unemployment.exclusionProof)).toThrow(/bank interest.*without another special source/i);
});

// Spec: spec/state/pa-2026-ordinary-draft.yaml#primary-residency-declaration.
const residencyCases = [
 ['resident', 'full-year', ['part-year', 'nonresident'], '2303'],
 ['part_year', 'part-year', ['full-year', 'nonresident'], '1197'],
 ['nonresident', 'nonresident', ['full-year', 'part-year'], '276'],
] as const;

function reopenWithDeclaration<T extends ReturnType<typeof pa2026OrdinaryDraftFixture>>(
 fixture: T, declaration: T['input']['taxpayer']['stateResidency'],
): T {
 fixture.input.taxpayer.stateResidency = declaration;
 rebindPA2026Draft(fixture);
 return JSON.parse(JSON.stringify(fixture));
}

it.each(residencyCases)('PA2026 wage draft reconciles retained Pennsylvania residency for %s', (status, matching, conflicts, tax) => {
 for (const declaration of [undefined, matching]) {
  const saved = reopenWithDeclaration(pa2026OrdinaryDraftFixture(status), declaration);
  const result = calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources);
  expect(result.pa.residencyStatus).toBe(status);
  expect(result.pa.pa40.taxLiability.toFixed()).toBe(tax);
  expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 }
 for (const declaration of conflicts) {
  const saved = reopenWithDeclaration(pa2026OrdinaryDraftFixture(status), declaration);
  expect.soft(() => calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources))
   .toThrow(/declared Pennsylvania residency conflicts with the confirmed domicile, abode and presence records/);
 }
});

it.each(residencyCases)('PA2026 Box 1 draft reconciles retained Pennsylvania residency for %s', (status, matching, conflicts, tax) => {
 for (const declaration of [undefined, matching]) {
  const saved = reopenWithDeclaration(pa2026UnemploymentFixture(status), declaration);
  const result = calculatePA2026OrdinaryUnemploymentDraft(saved.input, saved.facts, saved.sources, saved.exclusionProof);
  expect(result.pa.residencyStatus).toBe(status);
  expect(result.pa.pa40.taxLiability.toFixed()).toBe(tax);
  expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 }
 for (const declaration of conflicts) {
  const saved = reopenWithDeclaration(pa2026UnemploymentFixture(status), declaration);
  expect.soft(() => calculatePA2026OrdinaryUnemploymentDraft(saved.input, saved.facts, saved.sources, saved.exclusionProof))
   .toThrow(/declared Pennsylvania residency conflicts with the confirmed domicile, abode and presence records/);
 }
});

it('PA2026 declaration reconciliation preserves historical Pennsylvania residency replay', () => {
 const original = paOrdinaryReturnFixture('resident', 2025);
 const expected = calculatePAOrdinaryReturn(original.input, original.facts, original.sources);
 const saved = reopenWithDeclaration(original, 'nonresident');
 const result = calculatePAOrdinaryReturn(saved.input, saved.facts, saved.sources);
 expect(result.residencyStatus).toBe('resident');
 expect(result.pa40.taxLiability.eq(expected.pa40.taxLiability)).toBe(true);
});

it('PA2026 privately excludes government Box 1 from PA-40 and Schedule SP in every residency', () => {
 for (const [status,paWages,tax] of [['resident','75000','2303'],['part_year','39000','1197'],['nonresident','9000','276']] as const) {
  const control = pa2026OrdinaryDraftFixture(status);
  const before = calculatePA2026OrdinaryDraft(control.input,control.facts,control.sources);
  const f = pa2026UnemploymentFixture(status);
  const unchanged = structuredClone(f);
  const draft = calculatePA2026OrdinaryUnemploymentDraft(f.input,f.facts,f.sources,f.exclusionProof);
  expect(draft.pa.residencyStatus).toBe(status);
  expect(draft.pa.pa40.compensation.toFixed()).toBe(paWages);
  expect(draft.pa.pa40.taxLiability.toFixed()).toBe(tax);
  expect(draft.pa.pa40.stateWithholding.toFixed()).toBe(tax);
  expect(draft.pa.pa40.totalPATaxableIncome.eq(before.pa.pa40.totalPATaxableIncome)).toBe(true);
  expect(draft.pa.scheduleSP.eligibilityIncome.toFixed()).toBe('75000');
  expect(draft.pa.scheduleSP.taxForgivenessCredit.isZero()).toBe(true);
  expect(draft.dependencyProof.ordinaryWages.toFixed()).toBe('75000');
  expect(draft.dependencyProof.federalEarnedIncomeCredit.isZero()).toBe(true);
  expect(draft.pa.workingCredit.credit.isZero()).toBe(true);
  expect(draft.readiness).toMatchObject({filingEligible:false,fullFederalCalculated:false});
  expect(draft.pa.sourceCommitment).not.toBe(before.pa.sourceCommitment);
  expect(draft.pa.lines.find(line => line.line === 'government-unemployment-exclusion')?.value.toFixed()).toBe('2600.25');
  expect(f).toEqual(unchanged);
 }
});

type PAUnemploymentFixture = ReturnType<typeof pa2026UnemploymentFixture>;
it.each<[string, (f: PAUnemploymentFixture) => void]>([
 ['wrong tax year', f => { f.original.taxYear = 2025; }],
 ['wrong current revision', f => { f.original.sourceFormRevision = '2024-03'; }],
 ['owner mismatch', f => { f.exclusionProof.recipient.ssn = '900-40-0912'; }],
 ['wrong original ID', f => { f.exclusionProof.sourceId = 'PRIVATE-DIFFERENT-ORIGINAL'; }],
 ['unconfirmed government program', f => { f.exclusionProof.ordinaryNoncontributoryStateUnemploymentConfirmed = false; }],
 ['unsupported program type', f => { f.original.programType = 'employer-supplemental'; }],
 ['uncertain actual receipt', f => { f.original.actualReceiptConfirmed = false; }],
 ['unsupported original field', f => { f.original.refundTaxYear = 2025; }],
 ['tax refund on alternate Box 2 field', f => { f.original.stateLocalIncomeTaxRefund = '1'; }],
 ['Reemployment Trade Adjustment Assistance', f => { f.original.rtaaPayments = '1'; }],
 ['paid family leave', f => { f.original.familyLeaveBenefits = '1'; }],
 ['prior year repayment', f => { f.original.priorYearRepaid = '1'; }],
 ['unrecovered after-tax contributions', f => { f.original.unrecoveredAfterTaxContributions = '1'; }],
 ['unconfirmed state withholding', f => { f.exclusionProof.noStateWithholdingConfirmed = false; }],
 ['positive state withholding', f => { f.original.stateWithheld = '1'; }],
 ['additional original', f => { f.input.form1099G.push(structuredClone(f.original)); }],
])('PA2026 private government unemployment rejects %s', (_label, mutate) => {
 const f = pa2026UnemploymentFixture();
 mutate(f);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryUnemploymentDraft(f.input,f.facts,f.sources,f.exclusionProof)).toThrow(/2026 ordinary government unemployment/);
});

it('PA2026 private unemployment retains the canonical original and requires unchanged confirmations', () => {
 const f = pa2026UnemploymentFixture();
 expect(() => calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/additional retained income originals/);
 expect(() => calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/additional retained income originals/);
 f.original.unemploymentCompensation = '2600.26';
 expect(() => calculatePA2026OrdinaryUnemploymentDraft(f.input,f.facts,f.sources,f.exclusionProof)).toThrow(/current originals differ from confirmed snapshot/);
 const prior = paOrdinaryReturnFixture('resident',2025);
 expect(() => calculatePA2026OrdinaryUnemploymentDraft(prior.input,prior.facts,prior.sources,f.exclusionProof)).toThrow(/actual2026/);
});

it.each([
  [183, 'part_year'], [184, 'part_year'], [200, 'part_year'], [200, 'resident'],
] as const)('PA2026 one-move draft holds annual PA presence at and above the separate-method boundary (%s days, %s)', (days, status) => {
  const f = pa2026OrdinaryDraftFixture('part_year');
  const residency = f.input.paResidencySources.residency;
  residency.status = status;
  residency.domicilePeriods[0].daysInPA = days - 180;
  residency.domicilePeriods[1].daysInPA = 180;
  rebindPA2026Draft(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/one-move.*183.*separate residency method/i);
});

it('PA2026 one-move draft accepts 182 documented PA days with the matching part-year claim', () => {
  const f = pa2026OrdinaryDraftFixture('part_year');
  const residency = f.input.paResidencySources.residency;
  residency.domicilePeriods[0].daysInPA = 2;
  residency.domicilePeriods[1].daysInPA = 180;
  rebindPA2026Draft(f);
  const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(result.pa.residencyStatus).toBe('part_year');
  expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe('39000');
  expect(result.pa.pa40.taxLiability.toFixed()).toBe('1197');
  residency.status = 'resident';
  rebindPA2026Draft(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/claimed residency contradicts/i);
});

// Spec: spec/state/pa-residency-sources.yaml outbound-move-statutory-nonresident.
it('PA2026 applies the outbound statutory nonresident exception after reopen', () => {
 const f = pa2026OutboundNonresidentFixture();
 const saved: typeof f = JSON.parse(JSON.stringify(f));
 const result = calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources);
 expect(result.pa.residencyStatus).toBe('nonresident');
 expect(result.pa.schoolDistrictCode).toBe('99999');
 expect(result.pa.pa40.compensation.toFixed()).toBe('9000');
 expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe('9000');
 expect(result.pa.pa40.taxLiability.toFixed()).toBe('276');
 expect(result.pa.pa40.stateWithholding.toFixed()).toBe('276');
 expect(result.pa.pa40.totalAmountDue.isZero()).toBe(true);
 expect(result.pa.pa40.netOverpayment.isZero()).toBe(true);
 expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(() => calculatePAOrdinaryReturn(saved.input, saved.facts, saved.sources)).toThrow(/incomplete/i);
 expect(saved).toEqual(f);
});

type OutboundMoveFixture = ReturnType<typeof pa2026OutboundNonresidentFixture>;
it.each<[string, (f: OutboundMoveFixture) => void, RegExp]>([
 ['31 aggregate PA days', f => { f.input.paResidencySources.residency.domicilePeriods[1].daysInPA = 11; }, /separate actual source method/i],
 ['any PA permanent abode', f => { f.input.paResidencySources.residency.paPermanentAbodePeriods = [{ from: '2026-05-01', through: '2026-05-31' }]; }, /separate actual source method/i],
 ['outside permanent abode starts after January 1', f => { f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods[0].from = '2026-01-02'; }, /separate actual source method/i],
 ['two different outside-abode periods', f => { f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods = [
  { from: '2026-01-01', through: '2026-06-30' }, { from: '2026-07-01', through: '2026-12-31' },
 ]; }, /separate actual source method/i],
 ['missing move proof', f => { f.input.paResidencySources.residency.moveAbandonmentNewDomicileAndPresenceConfirmed = false; }, /actual PA domicile move/i],
 ['contradictory residency claim', f => { f.input.paResidencySources.residency.status = 'part_year'; }, /claimed residency contradicts/i],
 ['conflicting retained selection', f => { f.input.taxpayer.stateResidency = 'part-year'; }, /conflicting retained residency/i],
 ['contradictory year-end principal residence', f => { f.input.paResidencySources.residency.dec31PrincipalResidenceState = 'NJ'; }, /separate actual source method/i],
 ['structured reciprocal-state abode', f => { const abode = f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods[0]; abode.state = 'NJ'; abode.sourceReference = 'Fictional original year-round New Jersey lease'; }, /actual New York state.*sole year-round outside-PA permanent abode/i],
 ['unknown outside-abode record', f => { f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods[0].sourceReference = ' '; }, /original reference.*sole year-round outside-PA permanent abode/i],
 ['known reciprocal income-tax residence', f => { f.input.paResidencySources.residency.outboundTaxResidencePeriods[0].noReciprocalStateIncomeTaxResidenceConfirmed = false; }, /no reciprocal.state income.tax residence.*each exact/i],
 ['unknown reciprocal income-tax residence', f => { f.input.paResidencySources.residency.outboundTaxResidencePeriods[1].noReciprocalStateIncomeTaxResidenceConfirmed = null; }, /no reciprocal.state income.tax residence.*each exact/i],
 ['stale income-tax residency dates', f => { f.input.paResidencySources.residency.outboundTaxResidencePeriods[1].from = '2026-07-02'; }, /no reciprocal.state income.tax residence.*each exact/i],
 ['missing income-tax residency original', f => { f.input.paResidencySources.residency.outboundTaxResidencePeriods[0].sourceReference = ''; }, /no reciprocal.state income.tax residence.*each exact/i],
 ['reciprocal original W-2 row', f => { f.input.w2s[0].state = 'NJ'; }, /original reciprocal.state W.2 row/i],
])('PA2026 outbound move holds %s after reopen', (_label, change, expected) => {
 const f = pa2026OutboundNonresidentFixture();
 change(f);
 rebindPA2026Draft(f);
 const saved: typeof f = JSON.parse(JSON.stringify(f));
 expect(() => calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources)).toThrow(expected);
});

it('PA2026 outbound method leaves the prior-year sources separately gated', () => {
 const f = paOrdinaryReturnFixture('nonresident', 2025);
 const source = f.input.paResidencySources;
 source.residency.domicilePeriods = [
  { state: 'PA', daysInPA: 20, from: '2025-01-01', through: '2025-06-30' },
  { state: 'NY', daysInPA: 10, from: '2025-07-01', through: '2025-12-31' },
 ];
 source.residency.moveAbandonmentNewDomicileAndPresenceConfirmed = true;
 expect(() => calculatePAResidencySources(f.input, source)).toThrow(/separate actual source method/i);
});

it('PA2026 outbound move holds the actual zero-payment New Jersey jurisdiction account', () => {
 const f = pa2026OutboundNonresidentFixture();
 f.sources.otherStateTaxes.jurisdictions.push({ ...f.sources.otherStateTaxes.jurisdictions[0],
  state: 'NJ', sourceReference: 'Fictional original NJ tax jurisdiction account with zero remittances' });
 const saved: typeof f = JSON.parse(JSON.stringify(f));
 expect(() => calculatePA2026OrdinaryDraft(saved.input, saved.facts, saved.sources)).toThrow(/reciprocal.state.*jurisdiction account/i);
});

it('PA2026 Florida mover derives full-year wages from the actual resident source path', () => {
 const f = pa2026FloridaMoveResidentFixture();
 const original = structuredClone(f);
 const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
 const control = pa2026OrdinaryDraftFixture('resident');
 const sameYear = calculatePA2026OrdinaryDraft(control.input, control.facts, control.sources);
 expect(result.pa.residencyStatus).toBe('resident');
 expect(result.pa.schoolDistrictCode).toBe('02745');
 expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe('75000');
 expect(result.pa.pa40.taxLiability.toFixed()).toBe('2303');
 expect(result.pa.pa40.taxLiability.eq(sameYear.pa.pa40.taxLiability)).toBe(true);
 expect(new Decimal('75000').times('0.0307').toFixed(2)).toBe('2302.50');
 expect(result.pa.pa40.stateWithholding.toFixed()).toBe('2303');
 expect(result.pa.pa40.totalAmountDue.isZero()).toBe(true);
 expect(result.pa.lines.find(line => line.line === 'florida-move-residency')?.value.toFixed()).toBe('200');
 expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(() => calculatePAOrdinaryReturn(f.input, f.facts, f.sources)).toThrow(/incomplete/i);
 expect(f).toEqual(original);
});

// Spec: spec/state/pa-2026-ordinary-draft.yaml#texas-move-full-year-resident.
it('PA2026 Texas mover derives full-year wages from the actual resident source path', () => {
 const f = pa2026TexasMoveResidentFixture();
 f.input.taxpayer.stateResidency = 'full-year';
 rebindPA2026Draft(f);
 const original = structuredClone(f);
 const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
 expect(result.pa.residencyStatus).toBe('resident');
 expect(result.pa.schoolDistrictCode).toBe('02745');
 expect(result.pa.pa40.totalPATaxableIncome.toFixed()).toBe('75000');
 expect(result.pa.pa40.taxLiability.toFixed()).toBe('2303');
 expect(result.pa.pa40.stateWithholding.toFixed()).toBe('2303');
 expect(result.pa.pa40.totalAmountDue.isZero()).toBe(true);
 expect(result.pa.lines.find(line => line.line === 'texas-move-residency')?.value.toFixed()).toBe('200');
 expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
 expect(() => calculatePAOrdinaryReturn(f.input, f.facts, f.sources)).toThrow(/incomplete/i);
 expect(f).toEqual(original);
});

type TexasMoveFixture = ReturnType<typeof pa2026TexasMoveResidentFixture>;
it.each<[string, (f: TexasMoveFixture) => void, RegExp]>([
 ['exactly 183 PA days', f => { f.input.paResidencySources.residency.domicilePeriods[1].daysInPA = 143; }, /183.*separate residency method/i],
 ['an omitted outside-abode state', f => { delete f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods[0].state; }, /actual Texas state code.*outside-PA permanent abode/i],
 ['a conflicting outside-abode state', f => { f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods[0].state = 'NY'; }, /outside-PA permanent abode.*separate review/i],
 ['a third jurisdiction among outside-abode periods', f => {
  const abodes = f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods;
  abodes[0].through = '2026-03-31';
  abodes.push({ from: '2026-04-01', through: '2026-06-30', state: 'NY' });
 }, /outside-PA permanent abode.*separate review/i],
 ['a conflicting part-year declaration', f => { f.input.taxpayer.stateResidency = 'part-year'; }, /conflicting.*residency/i],
 ['payroll for outside-PA services', f => { Object.assign(f.input.paResidencySources.wages[0].payroll[0], { paServicesCompensation: '44999', outsidePAServicesCompensation: '1' }); }, /PA services/i],
 ['a mismatched zero-tax jurisdiction', f => { f.sources.otherStateTaxes.jurisdictions[0].state = 'FL'; }, /outside-state jurisdiction payment history is missing/i],
 ['an additional zero-tax jurisdiction', f => {
  const jurisdictions = f.sources.otherStateTaxes.jurisdictions;
  jurisdictions.push({ ...jurisdictions[0], state: 'FL' });
 }, /Texas.*sole complete zero-tax jurisdiction/i],
 ['positive Texas tax history', f => { f.sources.otherStateTaxes.jurisdictions[0].taxPaid = '1'; }, /positive other.state history/i],
 ['an unsupported former domicile', f => {
  f.input.paResidencySources.residency.domicilePeriods[0].state = 'NY';
  f.sources.otherStateTaxes.jurisdictions[0].state = 'NY';
 }, /183.*separate residency method/i],
])('PA2026 Texas mover holds %s', (_label, change, expected) => {
 const f = pa2026TexasMoveResidentFixture();
 change(f);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

type FloridaMoveFixture = ReturnType<typeof pa2026FloridaMoveResidentFixture>;
it.each<[string, (f: FloridaMoveFixture) => void, RegExp]>([
 ['exactly 183', f => { f.input.paResidencySources.residency.domicilePeriods[1].daysInPA = 143; }, /183.*separate residency method/i],
 ['a conflicting outside-abode state', f => { f.input.paResidencySources.residency.outsidePAPermanentAbodePeriods[0].state = 'NY'; }, /outside-PA permanent abode.*separate review/i],
 ['part-year claim', f => { f.input.paResidencySources.residency.status = 'part_year'; }, /183.*separate residency method/i],
 ['conflicting retained residency selection', f => { f.input.taxpayer.stateResidency = 'part-year'; }, /conflicting.*residency/i],
 ['reverse move', f => {
  const r = f.input.paResidencySources.residency;
  Object.assign(r.domicilePeriods[0], { state: 'PA', daysInPA: 160 });
  Object.assign(r.domicilePeriods[1], { state: 'FL', daysInPA: 40 });
  [r.paPermanentAbodePeriods, r.outsidePAPermanentAbodePeriods] = [r.outsidePAPermanentAbodePeriods, r.paPermanentAbodePeriods];
  Object.assign(r, { dec31PrincipalResidenceState: 'FL', schoolDistrictCode: '99999' });
 }, /183.*separate residency method/i],
 ['outside work', f => { Object.assign(f.input.paResidencySources.wages[0].payroll[0], { paServicesCompensation: '44999', outsidePAServicesCompensation: '1' }); }, /PA services/i],
 ['PA services with zero PA days in one domicile period', f => {
  const periods = f.input.paResidencySources.residency.domicilePeriods;
  periods[0].daysInPA = 0;
  periods[1].daysInPA = 184;
 }, /PA service.*presence/i],
 ['missing original payroll period', f => {
  const payroll = f.input.paResidencySources.wages[0].payroll;
  payroll.shift();
  Object.assign(payroll[0], { grossCompensation: '75000', paServicesCompensation: '75000' });
 }, /payroll.*both domicile periods/i],
 ['wrong year', f => { f.input.w2s[0].taxYear = 2025; }, /2026|year/i],
 ['unconfirmed original', f => { f.input.paResidencySources.wages[0].allOriginalBoxesKnownConfirmed = false; }, /original.*confirm/i],
 ['other-state W-2', f => { f.input.w2s[0].state = 'FL'; }, /PA.*W-2|PA.*Box/i],
 ['unreconciled Box 16', f => { f.input.w2s[0].stateWages = '74999'; }, /reported compensation/i],
 ['underwithheld Box 17', f => { f.input.w2s[0].stateTaxWithheld = '2302'; }, /withholding/i],
 ['other income original', f => { f.input.form1099Int.push(Form1099IntSchema.parse({ payer: 'Other bank', interestIncome: '1' })); }, /wage.only|interest|unsupported original/i],
 ['unknown PA adjustments', f => { f.input.paResidencySources.otherPAAdjustmentsConfirmedNone = false; }, /adjustments are not zero/i],
 ['missing FL history', f => { f.sources.otherStateTaxes.jurisdictions = []; }, /Florida|jurisdiction/i],
 ['positive Florida tax history', f => { f.sources.otherStateTaxes.jurisdictions[0].taxPaid = '1'; }, /positive other.state history/i],
 ['concurrent zero-state history', f => { f.sources.otherStateTaxes.jurisdictions.push({ ...f.sources.otherStateTaxes.jurisdictions[0], state: 'NJ' }); }, /Florida/i],
])('PA2026 Florida mover holds %s', (_label, change, expected) => {
 const f = pa2026FloridaMoveResidentFixture();
 change(f);
 rebindPA2026Draft(f);
 expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(expected);
});

function wage(f:ReturnType<typeof pa2026OrdinaryDraftFixture>,value:string,tax:string){const w=f.input.w2s[0],row=f.input.paResidencySources.wages[0];w.wages=value;w.stateWages=value;w.stateTaxWithheld=tax;row.payroll[0].grossCompensation=value;row.payroll[0].outsidePAServicesCompensation=value;rebindPA2026Draft(f);}
it('PA2026 draft preserves exact cents known zero and complete withholding',()=>{
 const f=pa2026OrdinaryDraftFixture();wage(f,'70244.01','2156');const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.dependencyProof.ordinaryWages.toFixed()).toBe('70244.01');expect(r.pa.pa40.compensation.toFixed()).toBe('70244');expect(r.pa.pa40.taxLiability.toFixed()).toBe('2156');
 const z=pa2026OrdinaryDraftFixture('nonresident');z.input.w2s[0].stateWages='0';z.input.w2s[0].stateTaxWithheld='0';Object.assign(z.input.paResidencySources.wages[0].payroll[0],{paServicesCompensation:'0',outsidePAServicesCompensation:'75000'});rebindPA2026Draft(z);const zero=calculatePA2026OrdinaryDraft(z.input,z.facts,z.sources);expect(zero.pa.pa40.taxLiability.toFixed()).toBe('0');expect(zero.pa.localBoundary.status).toBe('separate_return_required');
 const under=pa2026OrdinaryDraftFixture();under.input.w2s[0].stateTaxWithheld='2302.49';rebindPA2026Draft(under);expect(()=>calculatePA2026OrdinaryDraft(under.input,under.facts,under.sources)).toThrow(/withholding/i);
 const half=pa2026OrdinaryDraftFixture();half.input.w2s[0].stateTaxWithheld='2302.50';rebindPA2026Draft(half);expect(calculatePA2026OrdinaryDraft(half.input,half.facts,half.sources).pa.pa40.stateWithholding.toFixed()).toBe('2303');
});

function paidWageBalance(status: 'nonresident' | 'part_year' | 'resident' = 'nonresident') {
  const f = pa2026OrdinaryDraftFixture(status);
  const owner = f.input.taxpayer.primary;
  f.input.w2s[0].stateTaxWithheld = '0';
  f.sources.otherStateTaxes.jurisdictions[0].completeThroughDate = '2027-04-15';
  const receipt = {
    accountName: owner.firstName + ' ' + owner.lastName,
    accountSsn: owner.ssn,
    taxYear: 2026,
    returnType: 'pa40',
    kind: 'balance',
    date: '2027-04-15',
    amount: '276',
    confirmationNumber: 'FICTIONAL-PA-2026-REMITTANCE',
  };
  f.facts.timing = {
    ...f.facts.timing,
    kind: 'filed',
    date: '2027-04-15',
    asOfDate: '2027-04-15',
    remainingTaxPayment: {
      status: 'actual_payment',
      sourceReference: 'Private original April balance remittance',
      date: '2027-04-15',
      amountAppliedToTax: '276',
      original: receipt,
    },
  };
  rebindPA2026Draft(f);
  const estimatedTaxReview2026 = {
    sourceTaxYear: 2026,
    sourceFactsConfirmed: true,
    allDeterminationPeriodsAndChangesReviewedConfirmed: true,
    owner: {firstName: owner.firstName, lastName: owner.lastName, ssn: owner.ssn},
    originalPAResidencySources: structuredClone(f.input.paResidencySources),
    periods: ['2026-04-01', '2026-06-01', '2026-09-01', '2026-12-31'].map(throughDate => ({
      throughDate,
      sourceReference: 'Private contemporaneous pay and work schedule ending ' + throughDate,
      maximumExpectedPATaxableWages: '9000',
    })),
  };
  return {...f, receipt, sources: {...f.sources, estimatedTaxReview2026}};
}

function changePAWages(f: ReturnType<typeof paidWageBalance>, wages: string, paidAmount: string) {
  f.input.w2s[0].stateWages = wages;
  Object.assign(f.input.paResidencySources.wages[0].payroll[0], {
    paServicesCompensation: wages,
    outsidePAServicesCompensation: new Decimal('75000').minus(wages).toFixed(),
  });
  f.receipt.amount = paidAmount;
  f.facts.timing.remainingTaxPayment.amountAppliedToTax = paidAmount;
  rebindPA2026Draft(f);
  f.sources.estimatedTaxReview2026.originalPAResidencySources = structuredClone(f.input.paResidencySources);
}

it('PA2026 draft reconciles a timely actual nonresident small balance separately from return tax', () => {
  const f = paidWageBalance();
  const before = JSON.stringify(f);
  const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(r.pa.residencyStatus).toBe('nonresident');
  expect(new Decimal('9000').times('0.0307').toFixed()).toBe('276.3');
  expect(r.pa.pa40.taxLiability.toFixed()).toBe('276');
  expect(r.pa.pa40.stateWithholding.toFixed()).toBe('0');
  expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('276');
  expect(r.pa.rev1630.penaltyRequired).toBe(false);
  expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');
  expect(r.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe('276');
  expect(r.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
  expect(r.readiness.filingEligible).toBe(false);
  expect(r.readiness.fullFederalCalculated).toBe(false);
  expect(() => calculatePAOrdinaryReturn(f.input, f.facts, f.sources)).toThrow(/incomplete/);
  expect(JSON.stringify(r)).not.toContain(f.receipt.confirmationNumber);
  expect(JSON.stringify(f)).toBe(before);
});

function paidPartYearBalance() {
  const f = paidWageBalance('part_year');
  const { residency, wages } = f.input.paResidencySources;
  Object.assign(residency.domicilePeriods[0], { state: 'FL', daysInPA: 0 });
  residency.outsidePAPermanentAbodePeriods[0].state = 'FL';
  residency.domicilePeriods[1].daysInPA = 160;
  Object.assign(wages[0].payroll[0], {
    grossCompensation: '66000', paServicesCompensation: '0', outsidePAServicesCompensation: '66000',
  });
  Object.assign(wages[0].payroll[1], {
    grossCompensation: '9000', paServicesCompensation: '9000', outsidePAServicesCompensation: '0',
  });
  f.input.w2s[0].stateWages = '9000';
  f.input.taxpayer.stateResidency = 'part-year';
  Object.assign(f.sources.otherStateTaxes.jurisdictions[0], {
    state: 'FL', sourceReference: 'Fictional complete Florida zero income-tax account',
  });
  rebindPA2026Draft(f);
  f.sources.estimatedTaxReview2026.originalPAResidencySources = structuredClone(f.input.paResidencySources);
  return f;
}

// Spec: spec/state/pa-2026-ordinary-draft.yaml#part-year-actual-small-balance.
it.each(['original', 'reopened'] as const)('PA2026 part-year draft reconciles a timely actual small balance from %s sources', source => {
  const original = paidPartYearBalance();
  const f: typeof original = source === 'reopened' ? JSON.parse(JSON.stringify(original)) : original;
  const before = structuredClone(f);
  const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(result.pa.residencyStatus).toBe('part_year');
  expect(result.dependencyProof.ordinaryWages.toFixed()).toBe('75000');
  expect(result.pa.pa40.compensation.toFixed()).toBe('9000');
  expect(result.pa.pa40.stateWithholding.toFixed()).toBe('0');
  expect(new Decimal('9000').times('0.0307').toFixed(2)).toBe('276.30');
  expect(result.pa.pa40.taxLiability.toFixed()).toBe('276');
  expect(result.pa.pa40.totalAmountDue.toFixed()).toBe('276');
  expect(result.pa.rev1630.penaltyRequired).toBe(false);
  expect(result.pa.rev1630.totalInterest.toFixed()).toBe('0');
  expect(result.actualBalancePayment?.actualBalancePaymentApplied.toFixed()).toBe('276');
  expect(result.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
  expect(result.readiness).toMatchObject({ filingEligible: false, fullFederalCalculated: false });
  expect(result.pa.readiness.filingEligible).toBe(false);
  expect(JSON.stringify(result)).not.toContain(f.receipt.confirmationNumber);
  expect(f).toEqual(before);
});

it('PA2026 part-year draft holds stale estimate review after payroll sources are reconfirmed', () => {
  const f = paidPartYearBalance();
  f.input.paResidencySources.wages[0].payroll[1].sourceReference = 'Replacement original for the same PA payroll';
  rebindPA2026Draft(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/estimate review PA originals are stale/);
});

it('PA2026 draft accepts a confirmed $429 balance below both 2026 estimate boundaries', () => {
  const f = paidWageBalance();
  changePAWages(f, '13990', '429');
  for (const period of f.sources.estimatedTaxReview2026.periods) period.maximumExpectedPATaxableWages = '13990';
  const r = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
  expect(r.pa.pa40.totalAmountDue.toFixed()).toBe('429');
  expect(r.pa.rev1630.totalInterest.toFixed()).toBe('0');
  expect(r.actualBalancePayment?.outstandingTaxBalance.toFixed()).toBe('0');
});

it.each([
  ['missing proof', /withholding/],
  ['stale owner', /owner/],
  ['stale year', /completion source shape/],
  ['stale payroll reference', /originals are stale/],
  ['competing retained estimate review', /retained estimate review differs/],
  ['incomplete review', /completion source shape/],
  ['missing period', /completion source shape/],
  ['later projection', /completion source shape/],
  ['missing projection source', /completion source shape/],
  ['expected income at threshold', /expected.*14,000/],
  ['expected rounded tax at threshold', /expected.*430/],
  ['actual income at threshold', /actual.*14,000/],
  ['actual reported balance at threshold', /actual.*430/],
  ['expected receipt', /actual.*receipt/],
  ['expected filing', /actual filed return/],
  ['late receipt', /dated successor/],
  ['wrong receipt owner', /owner/],
  ['wrong receipt year', /identity\/date\/amount/],
  ['receipt not exact tax due', /fresh printed tax due/],
  ['partial withholding', /zero PA withholding/],
  ['part-year payroll exceeds threshold despite a low projection and receipt', /actual PA wages must be below/],
  ['full-year resident', /part-year or nonresident/],
  ['stale original W-2 year', /current W-2|year/],
] as const)('PA2026 draft rejects unsupported small balance evidence (%s)', (kind, reason) => {
  const status = kind === 'part-year payroll exceeds threshold despite a low projection and receipt' ? 'part_year'
    : kind === 'full-year resident' ? 'resident' : 'nonresident';
  const f = paidWageBalance(status);
  const review = f.sources.estimatedTaxReview2026;
  const timing = f.facts.timing;
  if (kind === 'missing proof') {
    const {estimatedTaxReview2026: _review, ...completion} = f.sources;
    expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, completion)).toThrow(reason);
    return;
  }
  if (kind === 'stale owner') review.owner.ssn = '333-22-1111';
  if (kind === 'stale year') review.sourceTaxYear = 2025;
  if (kind === 'stale payroll reference') f.input.paResidencySources.wages[0].payroll[0].sourceReference = 'Replacement original';
  if (kind === 'competing retained estimate review') {
    const retained = structuredClone(f.sources);
    retained.estimatedTaxReview2026.periods[0].maximumExpectedPATaxableWages = '14000';
    Reflect.set(f.input, 'paOrdinaryReturnCompletionSources', retained);
  }
  if (kind === 'incomplete review') review.allDeterminationPeriodsAndChangesReviewedConfirmed = false;
  if (kind === 'missing period') review.periods.pop();
  if (kind === 'later projection') review.periods[0].throughDate = '2026-04-02';
  if (kind === 'missing projection source') review.periods[0].sourceReference = ' ';
  if (kind === 'expected income at threshold') review.periods[0].maximumExpectedPATaxableWages = '14000';
  if (kind === 'expected rounded tax at threshold') review.periods[0].maximumExpectedPATaxableWages = '13999';
  if (kind === 'actual income at threshold' || kind === 'actual reported balance at threshold') {
    changePAWages(f, kind === 'actual income at threshold' ? '14000' : '13999', '430');
  }
  if (kind === 'expected receipt') {
    timing.remainingTaxPayment.status = 'expected_payment';
    delete timing.remainingTaxPayment.original;
  }
  if (kind === 'expected filing') timing.kind = 'expected';
  if (kind === 'late receipt') f.receipt.date = timing.remainingTaxPayment.date = '2027-04-16';
  if (kind === 'wrong receipt owner') f.receipt.accountSsn = '333-22-1111';
  if (kind === 'wrong receipt year') f.receipt.taxYear = 2025;
  if (kind === 'receipt not exact tax due') f.receipt.amount = timing.remainingTaxPayment.amountAppliedToTax = '275.99';
  if (kind === 'partial withholding' || kind === 'stale original W-2 year') {
    if (kind === 'partial withholding') f.input.w2s[0].stateTaxWithheld = '1';
    else f.input.w2s[0].taxYear = 2025;
    rebindPA2026Draft(f);
    review.originalPAResidencySources = structuredClone(f.input.paResidencySources);
  }
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(reason);
});

it('PA2026 draft checks retained death facts before income-based EIC proofs', () => {
  for (const status of ['resident', 'part_year', 'nonresident'] as const) {
    const f = pa2026OrdinaryDraftFixture(status);
    for (const primaryDeathDate of ['2026-12-30', '2027-02-01', '']) {
      f.input.standardDeductionFacts = { primaryDeathDate };
      rebindPA2026Draft(f);
      expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/death date/);
    }
    f.input.standardDeductionFacts = { primaryDeathDate: null };
    rebindPA2026Draft(f);
    const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
    expect(result.dependencyProof.federalEarnedIncomeCredit.toFixed()).toBe('0');
    expect(result.readiness.filingEligible).toBe(false);
  }
});

it.each([
  ['part_year', '1197'],
  ['nonresident', '276'],
  ['resident', '2303'],
] as const)('PA2026 draft holds a confirmed short tax year for %s', (status, tax) => {
  const f = pa2026OrdinaryDraftFixture(status);
  for (const standardDeductionFacts of [{ primaryDeathDate: null }, { shortTaxYear: false }]) {
    f.input.standardDeductionFacts = standardDeductionFacts;
    rebindPA2026Draft(f);
    const result = calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources);
    expect(result.pa.residencyStatus).toBe(status);
    expect(result.pa.pa40.taxLiability.toFixed()).toBe(tax);
    expect(result.readiness.filingEligible).toBe(false);
  }

  f.input.standardDeductionFacts = { shortTaxYear: true };
  rebindPA2026Draft(f);
  expect(() => calculatePA2026OrdinaryDraft(f.input, f.facts, f.sources)).toThrow(/short tax year.*accounting-period change/);
});

it.each(['70244','70243.99','0'])('PA2026 draft denies unproven all-child-count EIC zero at %s',value=>{const f=pa2026OrdinaryDraftFixture();wage(f,value,'2303');expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow(/phaseout|wage/i);});
it.each(['year','owner','unconfirmed','duplicate','payroll','unknownGross','unknownWithholding','unknownCare','positiveCare','benefit','retainedInterest','retainedAdjustment','retainedEIC','retainedForeign','unknownEmptyRoot','unreviewedOther','sourceExtension','spUnknown','sourceUnknown','married','late'])('PA2026 draft rejects unsupported or unknown actual source %s',kind=>{
 const f=pa2026OrdinaryDraftFixture();
 if(kind==='year')f.input.taxpayer.taxYear=2025;if(kind==='owner')f.input.taxpayer.primary.ssn='900-00-9999';if(kind==='unconfirmed')f.facts.sourceFactsConfirmed=false;if(kind==='duplicate')f.input.w2s.push(structuredClone(f.input.w2s[0]));if(kind==='payroll')f.input.paResidencySources.wages[0].payroll[0].grossCompensation='74999';if(kind==='unknownGross')f.input.w2s[0].wages='';if(kind==='unknownWithholding')f.input.w2s[0].stateTaxWithheld='';if(kind==='unknownCare')Reflect.set(f.sources.care,'allCarePaymentSourcesReviewedConfirmed',null);if(kind==='positiveCare')Reflect.set(f.input,'dependentCare',{expenses:'1'});if(kind==='benefit')f.input.w2s[0].box10DependentCareBenefits='1';if(kind==='retainedInterest')f.input.form1099Int.push(Form1099IntSchema.parse({payer:'Actual retained bank',interestIncome:'0',stateWithheld:'0'}));if(kind==='retainedAdjustment')Reflect.set(f.input,'adjustments',{iraDeduction:'1'});if(kind==='retainedEIC')Reflect.set(f.input,'eic',{mfsEicEligible:false});if(kind==='retainedForeign')Reflect.set(f.input,'form2555',{});if(kind==='unknownEmptyRoot')Reflect.set(f.input,'unreviewedFutureSource',[]);if(kind==='unreviewedOther')Reflect.set(f.sources.otherStateTaxes,'allJurisdictionsAndPaymentsReviewedConfirmed',null);if(kind==='sourceExtension')Reflect.set(f.input.paResidencySources,'employeeSources',{});if(kind==='spUnknown')f.facts.sp.allWorldwideSourcesCompleteConfirmed=false;if(kind==='sourceUnknown')Reflect.set(f.input.paResidencySources,'otherPAIncomeClassesConfirmedNone',null);if(kind==='married')f.input.taxpayer.filingStatus='married_filing_jointly';if(kind==='late')f.facts.timing.date='2027-04-16';
 // Where possible refresh lexical snapshots: a current unsupported original must still deny.
 if(!['owner','unconfirmed','duplicate'].includes(kind))rebindPA2026Draft(f);
 expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();
});
it('PA2026 draft preserves actual guided source capture and stale original denial',()=>{
 const f=pa2026OrdinaryDraftFixture('part_year');const facts=confirmGuidedPAOrdinaryReturnFacts(f.input,{...f.facts,sourceFactsConfirmed:null});const completion=confirmGuidedPAOrdinaryReturnCompletionSources(f.input,{...f.sources,sourceFactsConfirmed:null},facts);
 expect(calculatePA2026OrdinaryDraft(f.input,buildGuidedPAOrdinaryReturnFacts(f.input,facts),buildGuidedPAOrdinaryReturnCompletionSources(f.input,completion,facts)).pa.pa40.taxLiability.toFixed()).toBe('1197');
 const saved=JSON.parse(JSON.stringify({facts,completion}));expect(buildGuidedPAOrdinaryReturnFacts(f.input,saved.facts)).toEqual(facts);expect(buildGuidedPAOrdinaryReturnCompletionSources(f.input,saved.completion,saved.facts)).toEqual(completion);
 f.input.w2s[0].employer.ein='98-7654321';expect(()=>buildGuidedPAOrdinaryReturnFacts(f.input,facts)).toThrow();expect(()=>buildGuidedPAOrdinaryReturnCompletionSources(f.input,completion,facts)).toThrow();
 const unconfirmed=updateGuidedPAOrdinaryReturnFacts(facts,{sourceReference:'Changed actual document reference'});const c=updateGuidedPAOrdinaryReturnCompletionSources(completion,{sourceReference:'Changed actual complete credit reference'});expect(unconfirmed.sourceFactsConfirmed).toBeNull();expect(c.sourceFactsConfirmed).toBeNull();expect(()=>calculatePA2026OrdinaryDraft(f.input,unconfirmed,c)).toThrow();expect(unconfirmed.originalFederalSources).toEqual(facts.originalFederalSources);
});
it('PA2026 carries mixed reviewed local obligations from guided capture', () => {
 const f = pa2026OrdinaryDraftFixture('part_year');
 const printed = paOrdinaryLocalW2Fixture('part_year', { year: 2026 });
 const w2 = f.input.w2s[0];
 Object.assign(w2, { localWages: '50000', localTaxWithheld: '500.25', localityName: printed.rows.localRows[0].localityName });
 w2.stateLocalSources = {
  ...printed.rows,
  originalW2: structuredClone(w2),
  stateRows: [{ ...printed.rows.stateRows[0], wages: w2.stateWages, withheld: w2.stateTaxWithheld }],
 };
 rebindPA2026Draft(f);
 const [work, residence] = printed.sources.local.jurisdictions;
 f.sources.local.jurisdictions = [{ ...work, returnRequired: false, sourceReference: 'Private documented work collector decision' }, residence];
 const facts = confirmGuidedPAOrdinaryReturnFacts(f.input, { ...f.facts, sourceFactsConfirmed: null });
 const confirm = () => confirmGuidedPAOrdinaryReturnCompletionSources(f.input, { ...f.sources, sourceFactsConfirmed: null }, facts);
 const confirmed = confirm();
 const result = calculatePA2026OrdinaryDraft(f.input, facts, buildGuidedPAOrdinaryReturnCompletionSources(f.input, confirmed, facts)).pa;
 expect(result.localBoundary.status).toBe('separate_return_required');
 expect(result.localBoundary.jurisdictions.map(row => row.returnRequired)).toEqual([false, true]);
 expect(result.localBoundary.reportedW2LocalRows?.map(row => [row.jurisdictionIndex, row.withheld.toFixed()])).toEqual([[0, '500.25']]);
 expect(result.pa40.stateWithholding.toFixed()).toBe('1197');
 expect(result.pa40.taxLiability.toFixed()).toBe('1197');
 expect(result.readiness.filingEligible).toBe(false);
 expect(JSON.stringify(result.lines)).not.toContain('Private documented work collector decision');

 for (const answer of [false, null]) {
  const incomplete = structuredClone(confirmed);
  Object.assign(incomplete.local.jurisdictions[1], { returnRequired: answer });
  expect(() => calculatePA2026OrdinaryDraft(f.input, facts, incomplete)).toThrow(/local/i);
 }
});
it('PA2026 draft retains actual public federal ordinary and PDF gates',()=>{
 const f=pa2026OrdinaryDraftFixture();const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources);expect(r.pa.readiness.filingEligible).toBe(false);expect(r.pa.readiness.formStatus).toBe('draft_2026_review_only');expect(r.readiness.filingEligible).toBe(false);expect(r.readiness.fullFederalCalculated).toBe(false);
 expect(()=>getConstants(2026)).toThrow(/incomplete/);expect(()=>calculateFederalTax(f.input)).toThrow(/incomplete/);expect(()=>calculatePAOrdinaryReturn(f.input,f.facts,f.sources)).toThrow(/incomplete/);expect(()=>preparePAOrdinaryReturnReview(f.input)).toThrow(/2025|2026/);
 const old=paOrdinaryReturnFixture();expect(calculatePAOrdinaryReturn(old.input,old.facts,old.sources).pa40.taxLiability.toFixed()).toBe('1539');expect(()=>calculatePA2026OrdinaryDraft(old.input,old.facts,old.sources)).toThrow(/2026/);
});
it('PA2026 draft audit omits original identities and preserves whole canonical source currentness',()=>{const f=pa2026OrdinaryDraftFixture();const r=calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources),json=JSON.stringify(r);expect(json).not.toContain(f.input.taxpayer.primary.ssn);expect(json).not.toContain(f.input.w2s[0].employer.ein);const before=r.pa.sourceCommitment;f.facts.sourceReference='Reference-only updated original';expect(calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources).pa.sourceCommitment).not.toBe(before);f.input.w2s[0].wages='75000.00';expect(()=>calculatePA2026OrdinaryDraft(f.input,f.facts,f.sources)).toThrow();});
