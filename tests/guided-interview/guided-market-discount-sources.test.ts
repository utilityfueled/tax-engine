// Spec: spec/federal/guided-market-discount-sources.yaml.
import { expect, it } from 'vitest';
import { confirmMarketDiscount } from '@/lib/guided-market-discount-sources';
import { buildDigitalAssetInputs } from '@/lib/guided-digital-asset-facts';
import { calculateFederalTax, TaxYearInputSchema } from '@/index.js';
import { guidedMarketDiscountOriginal } from '../fixtures/guided-market-discount-sources';
import { simpleW2Fixture } from '../fixtures/simple-w2';
import { completePersonalInfo, completeInterestSource, startCompleteInterview } from './complete-facts';
import { buildInterestInputs, buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData, setInterviewTaxYear } from '@/lib/guided-interview-flow';

it('binds complete guided debt sources to unchanged canonical interest and capital', () => {
  const entry = guidedMarketDiscountOriginal(), row = entry.transactions![0];
  // Actual visible confirmation captures originals in the dedicated UI helper.
  // Baseline lacks this source method; preserve complete facts for genuine RED.
  row.marketDiscountFacts = confirmMarketDiscount(entry,row,{},true);
  const form1099DA = buildDigitalAssetInputs([entry], 'single', 2025, completePersonalInfo);
  const input = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099DA });
  const result = calculateFederalTax(input);
  expect(result.totalInterest.toFixed()).toBe('50.005');
  expect(result.capitalGainLoss.toFixed()).toBe('150.015');
  expect(input.form1099DA[0].transactions[0].ordinaryIncome).toBe(true);
  expect(input.form1099DA[0].transactions[0].noncoveredSecurity).toBe(true);
});
it('rejects missing and stale source confirmations without inventing originals', () => {
  const entry = guidedMarketDiscountOriginal();
  expect(() => buildDigitalAssetInputs([entry], 'single', 2025, completePersonalInfo)).toThrow();
});

it('binds actual separate INT statements and rejects changes, duplicate inclusion and unknown collections', () => {
  const entry = guidedMarketDiscountOriginal(), row = entry.transactions![0];
  const interestEntries = [{ ...completeInterestSource, payer: 'Fictional separate interest original', interestIncome: '7' }];
  row.marketDiscountFacts!.noOriginalIntStatementsConfirmed = false;
  const context = { interestEntries, oidEntries: [], filingStatus: 'single' as const, taxYear: 2025, stateCode: null };
  row.marketDiscountFacts = confirmMarketDiscount(entry,row,context,true);
  const forms = buildDigitalAssetInputs([entry],'single',2025,completePersonalInfo,[],context);
  const form1099Int = buildInterestInputs(interestEntries,2025);
  const parsed = TaxYearInputSchema.parse({ ...simpleW2Fixture, form1099Int, form1099DA: forms });
  expect(calculateFederalTax(parsed).totalInterest.toFixed()).toBe('57.005');
  const unknown = structuredClone(entry); unknown.transactions![0].marketDiscountFacts!.noOriginalIntStatementsConfirmed = false;
  unknown.transactions![0].marketDiscountFacts = confirmMarketDiscount(unknown,unknown.transactions![0],{},true);
  expect(() => buildDigitalAssetInputs([unknown],'single',2025,completePersonalInfo)).toThrow(/unknown|originals/);
  const incomplete = structuredClone(entry), incompleteOriginals = { ...context, interestEntries: [{ ...interestEntries[0], bondPremium: '' }] };
  incomplete.transactions![0].marketDiscountFacts = confirmMarketDiscount(incomplete,incomplete.transactions![0],incompleteOriginals,true);
  expect(() => buildDigitalAssetInputs([incomplete],'single',2025,completePersonalInfo,[],incompleteOriginals)).toThrow(/actual original INT bondPremium/);
  const changed = { ...context, interestEntries: [{ ...interestEntries[0], interestIncome: '8' }] };
  expect(() => buildDigitalAssetInputs([entry],'single',2025,completePersonalInfo,[],changed)).toThrow(/again|edit/);
  row.marketDiscountFacts!.sameDiscountIncludedElsewhere = true;
  row.marketDiscountFacts = confirmMarketDiscount(entry,row,context,true);
  expect(() => buildDigitalAssetInputs([entry],'single',2025,completePersonalInfo,[],context)).toThrow();
});

it('requires every finite debt fact and detects raw source edits without trusting saved confirmation booleans', () => {
  const original = guidedMarketDiscountOriginal(), facts = original.transactions![0].marketDiscountFacts!;
  for (const key of Object.keys(facts)) {
    const entry = structuredClone(original), row = entry.transactions![0];
    delete (row.marketDiscountFacts as Record<string,unknown>)[key];
    row.marketDiscountFacts = confirmMarketDiscount(entry,row,{},true);
    // Known-none answers are optional only with actual present empty arrays.
    expect(() => buildDigitalAssetInputs([entry],'single',2025,completePersonalInfo),key).toThrow();
  }
  original.transactions![0].marketDiscountFacts = confirmMarketDiscount(original,original.transactions![0],{},true);
  for (const [key,value] of [['proceeds','1201'],['costBasis','1001'],['dateAcquired','2024-02-01'],['securityIdentifier','Different debt'],['ordinaryIncome',false],['noncoveredSecurity',false]] as const) {
    const entry = structuredClone(original); Object.assign(entry.transactions![0],{[key]:value});
    expect(() => buildDigitalAssetInputs([entry],'single',2025,completePersonalInfo),key).toThrow(/again|edit/);
  }
  const differentAccount = structuredClone(original); differentAccount.accountReference = 'Other account';
  expect(() => buildDigitalAssetInputs([differentAccount],'single',2025,completePersonalInfo)).toThrow(/again|edit/);
});

it('roundtrips actual guided canonical sources and invalidates interest, household and year edits', () => {
  const state = startCompleteInterview({ filingStatus:'single', incomeTypes:['w2-wages','investments'], lifeEvents:[], stateCode:null });
  const entry = guidedMarketDiscountOriginal(), context = { interestEntries: [], oidEntries: undefined, filingStatus:'single' as const, taxYear:2025, stateCode:null };
  entry.transactions![0].marketDiscountFacts = confirmMarketDiscount(entry,entry.transactions![0],context,true);
  state.sectionData['income-investments'] = { interestEntries:[],dividendEntries:[],brokerageEntries:[],digitalAssetEntries:[entry] };
  const input = buildTaxInputFromGuidedData(state); expect(input).not.toBeNull();
  if (!input) throw new Error('Missing complete fictional guided sources');
  expect(calculateFederalTax(TaxYearInputSchema.parse(input)).totalInterest.toFixed()).toBe('50.005');
  const persisted = JSON.parse(JSON.stringify(state));
  expect(buildTaxInputFromGuidedData(persisted)?.form1099DA).toEqual(input.form1099DA);
  const investments = state.sectionData['income-investments'];
  const edited = updateSectionData(state,'income-investments',{...investments,interestEntries:[{...completeInterestSource,interestIncome:'7'}]});
  expect(edited.sectionData['income-investments']?.digitalAssetEntries?.[0].transactions?.[0].marketDiscountFacts?.sourceFactsConfirmed).toBeNull();
  expect(buildTaxInputFromGuidedData(edited)).toBeNull();
  const household = updateSectionData(state,'personal-info',{...state.sectionData['personal-info'],lastName:'Changed'});
  expect(household.sectionData['income-investments']?.digitalAssetEntries?.[0].transactions?.[0].marketDiscountFacts?.sourceFactsConfirmed).toBeNull();
  expect(setInterviewTaxYear(state,2026).sectionData['income-investments']?.digitalAssetEntries?.[0].transactions?.[0].marketDiscountFacts?.sourceFactsConfirmed).toBeNull();
});
