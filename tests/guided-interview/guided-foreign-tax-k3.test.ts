// Spec: spec/federal/foreign-tax-direct-credit.yaml, guided-portfolio-k3.
import { describe, expect, it } from 'vitest';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { setInterviewTaxYear, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { guidedForeignTaxK3Fixture } from '../fixtures/guided-foreign-tax-k3';

describe('guided qualified portfolio K3 credit', () => {
  it('retains actual 2026 non-K3 original source facts', () => {
    const {state}=guidedForeignTaxK3Fixture(2026);
    for(const section of ['personal-info','income-w2','income-investments','other-taxes'] as const) expect(validateSection(state,section), JSON.stringify(validateSection(state,section))).toMatchObject({status:'complete'});
    expect(buildTaxInputFromGuidedData(state)).not.toBeNull();
  });
  it('routes actual portfolio K3 sources through navigation and canonical direct credit', () => {
    const { state } = guidedForeignTaxK3Fixture();
    expect(validateSection(state, 'other-taxes'), JSON.stringify(validateSection(state, 'other-taxes'))).toMatchObject({ status: 'complete' });
    const input = buildTaxInputFromGuidedData(state);
    expect(input?.scheduleK1).toHaveLength(1);
    expect(input?.scheduleK1[0]).toMatchObject({ taxYear: 2025, partnershipName: 'Fictional Portfolio LP', interestIncome: '100', ordinaryDividends: '40', qualifiedDividends: '20', foreignSourceIncome: '140', foreignTaxPaid: '50', beginningBasis: '100' });
    if (!input) throw new Error('Actual synthetic source bridge rejected');
    const result = calculateFederalTax(TaxYearInputSchema.parse(input));
    // 200.25 actual1099 tax +50 actualK3 tax =250.25; one combined whole-dollar credit250.
    expect(result.foreignTaxDirectCredit?.currentTaxExact.toFixed()).toBe('250.25');
    expect(result.foreignTaxCredit.toFixed()).toBe('250');
    expect(result.schedule3?.lines.find(row => row.line === '1')?.value.toFixed()).toBe('250');
    expect(input.foreignTaxElection?.sources?.[1]).toMatchObject({ sourceId: 'scheduleK1:0', qualifiedPayeeStatement: 'schedule_k3' });
    expect(input.foreignTaxElection?.sources?.[1]?.payments).toBeUndefined();
  });
  it('rejects incomplete stale or unsupported qualified K3 sources and preserves replay', () => {
    const {state}=guidedForeignTaxK3Fixture();
    const before=JSON.stringify(state);
    const replay=JSON.parse(before) as typeof state;
    expect(buildTaxInputFromGuidedData(replay)?.scheduleK1).toEqual(buildTaxInputFromGuidedData(state)?.scheduleK1);
    expect(JSON.stringify(state)).toBe(before);
    const other=state.sectionData['other-taxes'];
    if(!other?.foreignTaxElection?.qualifiedK3Statements) throw new Error('Explicit fictional originals missing');
    const changed=updateSectionData(state,'other-taxes',{...other,foreignTaxElection:{...other.foreignTaxElection,
      qualifiedK3Statements:other.foreignTaxElection.qualifiedK3Statements.map(row=>({...row,originalK1Reference:'Changed actual original'}))}});
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.qualifiedK3Statements?.[0].sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed).toBeNull();
    expect(changed.sectionData['other-taxes']?.foreignTaxElection?.creditWithoutForm1116?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(changed)).toBeNull();
    const roundTrip=setInterviewTaxYear(setInterviewTaxYear(state,2026),2025);
    expect(roundTrip.sectionData['other-taxes']?.foreignTaxElection?.sourceFactsConfirmed).toBeNull();
    expect(buildTaxInputFromGuidedData(roundTrip)).toBeNull();
  });

});
