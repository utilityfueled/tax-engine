// @vitest-environment jsdom
// Spec: spec/federal/schedule-a-medical-mileage-hoh.yaml
import React, { useState } from 'react';
import { expect, it } from 'vitest';
import { createWorkspaceRecord, syncGuidedFlowToWorkspace } from '@/lib/workspace-storage';
import { buildGuidedSyntheticDocuments, buildGuidedFactAnswers } from '@/lib/guided-interview-bridge';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { SectionDeductions } from '@/components/guided-interview/section-deductions';
import { emptyDeductionData, startInterview, updateSectionData, validateSection } from '@/lib/guided-interview-flow';
import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateScheduleA } from '@/engine/schedules/schedule-a';
import { FEDERAL_2026_CONSTANTS } from '@/models/federal-2026-indexed';
import { d } from '@/utils/decimal';
import { completePersonalInfo } from '../../guided-interview/complete-facts';
import { medicalMileageHohFixture } from '../../fixtures/medical-mileage-hoh';
import { mountGuidedPanel } from './guided-panel-dom';
function present<T,>(value: T | undefined): T { if(value===undefined)throw new Error('Missing explicit fictional source value'); return value; }
it('collects actual HOH own-care originals and invalidates edited or replayed household evidence', async () => {
    const original = medicalMileageHohFixture();
    const personal = { ...structuredClone(completePersonalInfo), ...original.taxpayer.primary, spouse: undefined, addressLine1: original.taxpayer.address.street, city: original.taxpayer.address.city, state: original.taxpayer.address.state, zip: original.taxpayer.address.zip, dependentCount: '1', dependents: original.taxpayer.dependents.map(child => ({ ...child, monthsLivedWithYou: String(child.monthsLivedWithYou) })), usResidencyMonths: '12' };
    let current = updateSectionData(updateSectionData(startInterview({ filingStatus: 'hoh', incomeTypes: [], lifeEvents: [], stateCode: null }, 2026), 'personal-info', personal), 'deductions', { ...emptyDeductionData, method: 'itemized' });
    function Harness() { const [state, setState] = useState(current); return <SectionDeductions data={state.sectionData.deductions} taxYear={2026} filingStatus="hoh" onDataChange={data => { current = updateSectionData(state, 'deductions', data); setState(current); }}/>; }
    const panel = await mountGuidedPanel(<Harness />);
    try {
        await panel.click('Add medical mileage log');
        await panel.click('Add head-of-household originals');
        expect(panel.control('Original child relationship (child)').value).toBe('');
        for (const [label, value] of [['Private mileage log reference', 'private-own-care-ledger'], ['Other eligible unreimbursed medical expenses', '1499.25'], ['Eligible medical parking and tolls', '0.50'], ['Medical mileage 1 date', '2026-06-30'], ['Medical mileage 1 eligible miles', '10.125']])
            await panel.change(present(label), present(value));
        await panel.click('Add medical mileage date');
        await panel.change('Medical mileage 2 date', '2026-07-01');
        await panel.change('Medical mileage 2 eligible miles', '20.375');
        for (const [label, value] of [['Household source tax year', '2026'], ['Private household source reference', 'private-actual-household-worksheet'], ['Original household street', '123 Main St'], ['Original household city', 'Seattle'], ['Original household state', 'WA'], ['Original household zip', '98101'], ['Original primary first name', 'Jane'], ['Original primary last name', 'Doe'], ['Original primary taxpayer ID', '123-45-6789'], ['Original primary birth date', '1990-01-15'], ['Original child index (first child is 0)', '0'], ['Original child relationship (child)', 'child'], ['Original child first name', 'Child'], ['Original child last name', 'Example'], ['Original child taxpayer ID', '333-44-5555'], ['Original child birth date', '2015-06-01'], ['Actual child nights in the same home', '365'], ['Total eligible home-upkeep costs', '20000'], ['Home-upkeep costs paid by the primary taxpayer', '10000.01']])
            await panel.change(present(label), present(value));
        expect(validateSection(current, 'deductions').status).not.toBe('complete');
        for (const label of ['Unmarried at year end and not a qualifying surviving spouse', 'Full-year U.S. citizen or resident, not another taxpayer’s dependent or qualifying child', 'Child unmarried all year, did not file a joint return, is a U.S. citizen/resident/national, and did not provide over half their own support', 'No other person qualifies for this child or uses the child for head of household', 'No custody release, temporary absence, birth/death, adoption/foster, kidnapping or other special qualification rule', 'All eligible annual home-upkeep costs and actual primary payments are complete', 'Primary payments came from my own funds, with no child-benefit, public-benefit, shared-funds or other-person allocation', 'Trips were essential to my own qualified medical care', 'One vehicle and only eligible parking and tolls', 'All claimed transportation costs were paid and unreimbursed', 'No actual vehicle costs or duplicate tax benefits'])
            await panel.change(label, 'true');
        expect(validateSection(current, 'deductions').status).toBe('complete');
        const built = buildTaxInputFromGuidedData(current);
        expect(built).not.toBeNull();
        const parsed = TaxYearInputSchema.parse(built);
        expect(calculateScheduleA(parsed, d('20000'), 'head_of_household', FEDERAL_2026_CONSTANTS).medicalDeduction.toFixed()).toBe('6.61375');
        const workspace = syncGuidedFlowToWorkspace(createWorkspaceRecord('opaque-hoh-medical', { now: '2026-11-14T00:00:00.000Z' }), buildGuidedSyntheticDocuments(current), buildGuidedFactAnswers(current), current);
        const local = Object.assign(workspace, { guidedFlowState: current, headOfHouseholdSources: parsed.scheduleA?.medicalMileage?.headOfHouseholdSources });
        for (const payload of [sanitizeWorkspaceForHostedStorage(local), buildProviderWorkspaceRequest(local, { now: '2026-11-14T00:00:00.000Z' })])
            for (const secret of ['headOfHouseholdSources', 'private-actual-household-worksheet', 'private-own-care-ledger', '123-45-6789', '333-44-5555', '123 Main St'])
                expect(JSON.stringify(payload)).not.toContain(secret);
        const replay = JSON.parse(JSON.stringify(current));
        expect(buildTaxInputFromGuidedData(replay)?.scheduleA?.medicalMileage).toEqual(built?.scheduleA?.medicalMileage);
        replay.sectionData['personal-info'].dependents[0].ssn = '444-55-6666';
        expect(buildTaxInputFromGuidedData(replay)).toBeNull();
        const changedHousehold = JSON.parse(JSON.stringify(current));
        changedHousehold.sectionData['personal-info'].addressLine1 = 'Another actual household';
        expect(buildTaxInputFromGuidedData(changedHousehold)).toBeNull();
        await panel.change('Home-upkeep costs paid by the primary taxpayer', '10000');
        expect(validateSection(current, 'deductions').status).not.toBe('complete');
        expect(buildTaxInputFromGuidedData(current)).toBeNull();
    }
    finally {
        await panel.dispose();
    }
});
