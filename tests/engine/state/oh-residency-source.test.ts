/** Spec: spec/state/oh-input-adapter.yaml#actual-owner-residency-nrc-source */
import { it, expect } from 'vitest';
import { calculateFederalTax } from '@/engine/federal.js';
import { buildOhioResidentReturnInput } from '@/engine/state/oh-input-adapter.js';
import { calculateOhioResidentReturn } from '@/engine/state/oh-return.js';
import { prepareOhioResidencyReview, resolveOhioResidencyReview } from '@/engine/state/oh-residency-source.js';
import { redactReviewIdentifiers } from '@/pdf/redact-review-identifiers.js';
import { simpleW2Fixture } from '../../fixtures/simple-w2.js';
import { ohioResidencyFacts } from '../../fixtures/oh-residency.js';
function packet() { const input = structuredClone(simpleW2Fixture); input.w2s = [{ ...input.w2s![0]!, accountHolder: 'primary', taxYear: 2025, wages: '100000', socialSecurityWages: '100000', medicareWages: '100000', federalWithheld: '0', state: 'OH', stateWages: '20000', stateTaxWithheld: '0', localTaxWithheld: '0' }]; const facts = { ...ohioResidencyFacts(), originalFederalSources: structuredClone(input) }; Object.assign(facts.owners[0]!.amounts.wages, { federalAmount: '100000', nonresidentOhioAmount: '20000' }); return { input, facts }; }
it('sources canonical actual owner amounts without Ohio wage-only AGI', () => { const { input, facts } = packet(); const federal = calculateFederalTax(input); const adapted = buildOhioResidentReturnInput(input, federal, { residency: facts }); expect(adapted.federalAgi.toString()).toBe('100000'); const actual = calculateOhioResidentReturn(adapted); expect(actual.nonresidentCreditResult!.line19.toFixed(4)).toBe('0.8000'); expect(actual.nonresidentCreditResult!.line20.toFixed()).toBe('1858'); expect(actual.it1040.line10_taxAfterCredits.toFixed()).toBe('465'); });
it.each(['legacyCredit', 'unknownOwner', 'wrongOwnerAmount', 'sameMoneyChangedEmployer', 'unconfirmed', 'businessSource', 'staleFederal', 'schoolDistrictWithholding', 'ignoredOhioAddition', 'ignoredOhioDeduction'])('rejects canonical NRC source contradiction %s', kind => { const { input, facts } = packet(); if (kind === 'unknownOwner')
    delete input.w2s![0]!.accountHolder; if (kind === 'wrongOwnerAmount')
    facts.owners[0]!.amounts.wages.federalAmount = '99999'; if (kind === 'sameMoneyChangedEmployer')
    input.w2s![0]!.employer.name = 'Different original employer'; if (kind === 'unconfirmed')
    (facts as unknown as {sourceFactsConfirmed:boolean}).sourceFactsConfirmed = false; if (kind === 'businessSource')
    input.form1099Nec = [{ payer: 'Actual different business payer', nonemployeeCompensation: '1', federalWithheld: '0', accountHolder: 'primary' } as never]; if (kind === 'schoolDistrictWithholding')
    input.w2s![0]!.localTaxWithheld = '10'; const federal = calculateFederalTax(input); if (kind === 'staleFederal')
    federal.agi = federal.agi.plus(1); expect(() => buildOhioResidentReturnInput(input, federal, { residency: facts, ...(kind === 'legacyCredit' ? { nonresidentCredit: '1' } : {}), ...(kind === 'ignoredOhioAddition' ? { otherAdditions: '100' } : {}), ...(kind === 'ignoredOhioDeduction' ? { otherDeductions: '100' } : {}) })).toThrow(); });
it('rejects a nonzero bare legacy NRC scalar without source packet', () => { const { input } = packet(); const federal = calculateFederalTax(input); expect(() => buildOhioResidentReturnInput(input, federal, { nonresidentCredit: '1' })).toThrow(); });
it('binds original current calculation before permitted review redaction', () => { const { input, facts } = packet(); const actual = { ...input, ohioResidency: facts }; const federal = calculateFederalTax(actual); const token = prepareOhioResidencyReview(actual); expect(resolveOhioResidencyReview(redactReviewIdentifiers(actual), federal, token).taxpayer.primary.ssn).toBe(input.taxpayer.primary.ssn); expect(() => resolveOhioResidencyReview(redactReviewIdentifiers(actual), { ...federal, agi: federal.agi.plus(1) }, token)).toThrow(); const changed = structuredClone(actual); changed.w2s![0]!.employer.name = 'Changed same-dollar source'; expect(() => resolveOhioResidencyReview(changed, federal, token)).toThrow(); });
it('does not silently discard actual district/local withholding on a fullresident source packet', () => { const { input, facts } = packet(); facts.owners[0]!.status = 'full_year_resident'; facts.owners[0]!.periods[0]!.domicileState = 'OH'; Object.assign(facts.owners[0]!.amounts.wages, { residentAmount: '100000', nonresidentOhioAmount: '0' }); input.w2s![0]!.localTaxWithheld = '10'; facts.originalFederalSources = structuredClone(input); expect(() => buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts })).toThrow(); });
it('rejects claimed adjustment originals that contradict the current zero adjustment record', () => { const { input, facts } = packet(); facts.owners[0]!.stateAdditions = [{ line: '13', fullAmount: '100', ohioAmount: '0', sourceReference: 'Contradictory claimed addition original' }] as never; expect(() => buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts })).toThrow(); });

it.each(['scalar','rows'])('rejects unqualified resident-credit source on fullresident packet %s',kind=>{const {input,facts}=packet();facts.owners[0]!.status='full_year_resident';facts.owners[0]!.periods[0]!.domicileState='OH';Object.assign(facts.owners[0]!.amounts.wages,{residentAmount:'100000',nonresidentOhioAmount:'0'});facts.originalFederalSources=structuredClone(input);expect(()=>buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts,...(kind==='scalar'?{residentCredit:'1'}:{otherStateTaxes:[{stateCode:'VA',doubleTaxedIncome:'10000',taxPaid:'100'}]})})).toThrow();});

it.each([['part_year_resident','1394','929'],['full_year_resident','0','2323']] as const)('reconciles actual canonical %s income-tax worksheet', (status,credit,remaining)=>{const {input,facts}=packet();const owner=facts.owners[0]!;owner.status=status;owner.periods=status==='full_year_resident'?[{from:'2025-01-01',to:'2025-12-31',domicileState:'OH'}]:[{from:'2025-01-01',to:'2025-06-30',domicileState:'VA'},{from:'2025-07-01',to:'2025-12-31',domicileState:'OH'}];Object.assign(owner.amounts.wages,{residentAmount:status==='full_year_resident'?'100000':'30000',nonresidentOhioAmount:status==='full_year_resident'?'0':'10000'});input.w2s![0]!.stateWages=status==='full_year_resident'?'100000':'40000';facts.originalFederalSources=structuredClone(input);const result=calculateOhioResidentReturn(buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts}));expect(result.nonresidentCreditResult!.line20.toFixed()).toBe(credit);expect(result.it1040.line10_taxAfterCredits.toFixed()).toBe(remaining);});

it.each(['IN','KY','MI','PA','WV'])('requires actual reciprocal-period wage exemption source for%s',state=>{const {input,facts}=packet();facts.owners[0]!.periods[0]!.domicileState=state;expect(()=>buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts})).toThrow();});

it.each(['nonresident','full_year_resident'] as const)('binds actual private owner identity on%s packets before permitted render redaction',status=>{const {input,facts}=packet();if(status==='full_year_resident'){facts.owners[0]!.status=status;facts.owners[0]!.periods[0]!.domicileState='OH';Object.assign(facts.owners[0]!.amounts.wages,{residentAmount:'100000',nonresidentOhioAmount:'0'});}input.taxpayer.primary.ssn='900-70-0311';expect(()=>buildOhioResidentReturnInput(input,calculateFederalTax(input),{residency:facts})).toThrow();});


it('changes the digest-only current-original commitment after an equal-money actual owner replacement', () => {
  const { input, facts } = packet();
  const before = buildOhioResidentReturnInput(input, calculateFederalTax(input), { residency: facts });
  const changed = structuredClone(input);
  changed.taxpayer.primary.ssn = '900-70-0322';
  const changedFacts = structuredClone(facts);
  changedFacts.originalFederalSources = structuredClone(changed);
  const after = buildOhioResidentReturnInput(changed, calculateFederalTax(changed), { residency: changedFacts });
  expect(before.residencySourceDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(after.residencySourceDigest).toMatch(/^[a-f0-9]{64}$/);
  expect(after.residencySourceDigest).not.toBe(before.residencySourceDigest);
  expect(JSON.stringify(calculateOhioResidentReturn(after).lines)).not.toContain('900-70-0322');
});
