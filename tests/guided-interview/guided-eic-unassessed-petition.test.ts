// Spec: spec/federal/guided-eic-unassessed-petition.yaml.
import { expect, it, vi } from 'vitest';
import { guidedEicPetitionFixture, guidedEicPetitionState } from '../fixtures/guided-eic-unassessed-petition';
import { convertGuidedEicDisallowanceHistory, buildGuidedEicDisallowanceHistory, copyEicHistoryHousehold, updateEicHistorySources } from '@/lib/guided-eic-disallowance-history';
import { calculateEicDisallowanceHistory } from '@/engine/forms/eic-disallowance-history';
it('retains the complete actual petition through guided conversion and canonical validation', () => {
  const { personal, canonical } = guidedEicPetitionFixture(), before = structuredClone(personal);
  expect(calculateEicDisallowanceHistory(canonical)).toMatchObject({ sourceFactsComplete: true, barred: false, form8862Required: false });
  expect(convertGuidedEicDisallowanceHistory(personal, 'single', 2025)).toEqual(canonical.sources);
  expect(buildGuidedEicDisallowanceHistory(personal, 'single', 2025)?.result).toEqual(calculateEicDisallowanceHistory(canonical));
  expect(personal).toEqual(before);
});

import { buildTaxInputFromGuidedData } from '@/lib/guided-interview-bridge';
import { updateSectionData } from '@/lib/guided-interview-flow';
import { TaxYearInputSchema } from '@/models/inputs';
import { calculateFederalTax } from '@/engine/federal';
import { calculateVerifiedAiAudit, resolveServerAiTaxContext } from '@/lib/ai-tax-context';
import { createWorkspaceRecord } from '@/lib/workspace-storage';
import { sanitizeWorkspaceForHostedStorage } from '@/lib/hosted-privacy';
import { buildProviderWorkspaceRequest } from '@/lib/provider-workspace-request';
import { assertPdfExportAllowed } from '@/pdf/export-policy';
vi.mock('server-only', () => ({}));
function required<T>(value:T|null|undefined):T { if(value==null)throw Error('Missing explicit fixture');return value; }
function original(personal:ReturnType<typeof guidedEicPetitionFixture>['personal']) {
 return required(required(required(personal.eicDisallowanceHistory?.filers?.[0]).denials?.[0]).unassessedTaxCourtPetition);
}
it('preserves unknown and false original facts and rejects contradictory proof',()=>{
 const base=guidedEicPetitionFixture().personal, keys=Object.keys(original(base));
 for(const key of keys){const personal=structuredClone(base);Reflect.deleteProperty(original(personal),key);expect(()=>buildGuidedEicDisallowanceHistory(personal,'single',2025),key).toThrow();}
 for(const key of ['sourceFactsConfirmed','noticeDeadlineConfirmed','actualTaxCourtDeficiencyPetitionConfirmed','actualTimelyPetitionConfirmed','completeCourtAndAccountHistoryConfirmed'])
  for(const value of [false,null]){const personal=structuredClone(base);Reflect.set(original(personal),key,value);expect(()=>buildGuidedEicDisallowanceHistory(personal,'single',2025),key).toThrow();expect(Reflect.get(original(personal),key)).toBe(value);}
 for(const [key,value]of Object.entries({sourceTaxYear:'2024',deniedTaxYear:'2023',owner:'spouse',originalTaxpayerSsn:'222-33-4444',denialSourceId:'different',denialSourceReference:'different',noticeDate:'2025-09-02',noticeLastPetitionDate:'2025-11-19',claimDate:'2026-02-28',reviewedThroughDate:'2026-02-28',assessmentDate:'2025-12-02',decisionDate:'2025-12-02',inventedJurisdictionOutcome:true})){
  const personal=structuredClone(base);Reflect.set(original(personal),key,value);expect(()=>buildGuidedEicDisallowanceHistory(personal,'single',2025),key).toThrow();
 }
 const duplicate=structuredClone(base),filer=required(duplicate.eicDisallowanceHistory?.filers?.[0]),second=structuredClone(required(filer.denials?.[0]));second.sourceId='second';required(second.unassessedTaxCourtPetition).denialSourceId='second';required(filer.denials).push(second);expect(()=>buildGuidedEicDisallowanceHistory(duplicate,'single',2025)).toThrow(/duplicate|docket/i);
 for(const value of ['', '25', '2025.0']){const personal=structuredClone(base);original(personal).sourceTaxYear=value;expect(()=>convertGuidedEicDisallowanceHistory(personal,'single',2025)).toThrow(/four-digit/);}
 const unknown=structuredClone(base);delete original(unknown).assessmentDate;original(unknown).noticeDeadlineConfirmed=null;
 const converted=required(convertGuidedEicDisallowanceHistory(unknown,'single',2025)?.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition);expect(converted.assessmentDate).toBeUndefined();expect(converted.finalDeterminationDate).toBeNull();expect(converted.noticeDeadlineConfirmed).toBeUndefined();
 expect(base).toEqual(guidedEicPetitionFixture().personal);
});
it('owns returned and copied proof and invalidates original edits without erasing facts',()=>{
 const {personal}=guidedEicPetitionFixture(),before=structuredClone(personal),data=required(personal.eicDisallowanceHistory);
 const converted=required(convertGuidedEicDisallowanceHistory(personal,'single',2025)?.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition);converted.docketReference='changed';expect(personal).toEqual(before);
 const copied=copyEicHistoryHousehold(personal,'single',data);required(copied.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition).docketReference='changed';expect(personal).toEqual(before);
 const edited=structuredClone(data);required(edited.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition).docketReference='edited original';const changed=updateEicHistorySources(data,edited);
 expect(changed.sourceFactsConfirmed).toBeNull();expect(changed.filers?.[0]?.sourceFactsConfirmed).toBeNull();expect(changed.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition?.sourceFactsConfirmed).toBeNull();expect(changed.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition?.assessmentDate).toBeNull();
 const state=guidedEicPetitionState(),renamed=structuredClone(required(state.sectionData['personal-info']));renamed.lastName='Changed original identity';const next=updateSectionData(state,'personal-info',renamed);expect(next.sectionData['personal-info']?.eicDisallowanceHistory?.filers?.[0]?.denials?.[0]?.unassessedTaxCourtPetition?.sourceFactsConfirmed).toBeNull();expect(buildTaxInputFromGuidedData(next)).toBeNull();
});
it('preserves guided lifecycle privacy and annual readiness',()=>{
 const state=guidedEicPetitionState(),input=TaxYearInputSchema.parse(required(buildTaxInputFromGuidedData(state))),before=JSON.stringify(input);
 expect(calculateFederalTax(input).allLines.find(line=>line.form==='1040'&&line.line==='27a')?.value.toFixed()).toBe('649');
 const scope={ownerScope:'synthetic-guided-petition-owner',workspaceId:'synthetic-guided-petition-return',workspaceRevision:'synthetic-guided-petition-revision'};
 const audit=calculateVerifiedAiAudit(scope,input),context=resolveServerAiTaxContext({...scope,taxYear:2025,audit});expect(context.status).toBe('available');
 const workspace=Object.assign(createWorkspaceRecord(scope.workspaceId,{now:'2026-11-15T00:00:00.000Z'}),{eic:input.eic,guidedFlowState:state});
 for(const payload of[audit,context,sanitizeWorkspaceForHostedStorage(workspace),buildProviderWorkspaceRequest(workspace,{now:'2026-11-15T00:00:00.000Z'})])
  for(const marker of['unassessedTaxCourtPetition',input.taxpayer.primary.ssn,'Private Tax Court docket','Fictional-12345','Private original statutory notice','Private filed petition','Private original account transcript','Private complete docket events'])expect(JSON.stringify(payload)).not.toContain(marker);
 expect(JSON.stringify(input)).toBe(before);
 const next=structuredClone(state);next.taxYear=2026;expect(buildTaxInputFromGuidedData(next)).toBeNull();expect(()=>assertPdfExportAllowed(2026,2026)).toThrow(/No qualified/u);
});
