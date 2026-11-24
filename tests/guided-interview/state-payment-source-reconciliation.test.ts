// Spec: state/guided-state-payment-reconciliation.yaml.
import Decimal from 'decimal.js';
import {expect,it} from 'vitest';
import {calculatePAOrdinaryReturnFacts} from '@/engine/state/pa-ordinary-return-facts';
import {TaxYearInputSchema} from '@/models/inputs';
import {buildTaxInputFromGuidedData} from '@/lib/guided-interview-bridge';
import {buildGuidedPAOrdinarySourceInput,jumpToSection,shouldPromptBeforeAdvance,updateSectionData,type GuidedFlowState} from '@/lib/guided-interview-flow';
import {confirmGuidedPAOrdinaryReturnFacts,updateGuidedPAOrdinaryReturnFacts} from '@/lib/guided-pa-ordinary-return-facts';
import {confirmGuidedPAOrdinaryReturnCompletionSources} from '@/lib/guided-pa-ordinary-return-completion';
import {buildGuidedOhioOverlay,buildGuidedStateOriginals} from '@/lib/guided-state-engine-inputs';
import {confirmGuidedOhioPaymentFacts} from '@/lib/guided-ohio-payment-facts';
import {confirmGuidedOhioResidencyFacts} from '@/lib/guided-ohio-residency-facts';
import {computeGuidedPreview} from '@/lib/guided-preview-compute';
import {guidedOhioSourceFlow} from '../fixtures/guided-state-originals';
import {guidedPACompleteOriginals} from '../fixtures/guided-pa-complete-originals';
import {guidedPAOrdinaryPanelFixture,paPanelStatuses,required} from '../fixtures/guided-pa-ordinary-panels';
function ohio(){const s=guidedOhioSourceFlow('full_year_resident'),d=s.sectionData['state-return'],raw=buildTaxInputFromGuidedData(s);if(!d?.ohioPayments||!raw)throw Error('Actual source fixture missing');const i=TaxYearInputSchema.parse(raw),t=i.taxpayer.primary;d.ohioPayments.paymentRows=[{sourceId:'Original-Apr15-100',sourceReference:'Actual fictional April15 receipt',accountHolder:'primary',taxYear:2025,returnType:'it1040',kind:'estimated',date:'2025-04-15',amount:'100',appliedToThisReturnConfirmed:true,original:{accountName:t.firstName+' '+t.lastName,accountSsn:t.ssn,taxYear:2025,returnType:'it1040',kind:'estimated',date:'2025-04-15',amount:'100',confirmationNumber:'Original-100'}}];d.ohioPayments.remainingTaxPayment={status:'expected_payment',sourceReference:'Fictional remaining tax intention',sourceFactsConfirmed:true,date:'2026-04-15',amountAppliedToTax:'2223'};d.stateEstimatedPayments=[{state:'OH',date:'2025-04-15',amount:'100'}];return{s,d,i:buildGuidedStateOriginals(i,s)};}
it('state actual payment ledger does not double add matching legacy Ohio receipt',()=>{const {s,i}=ohio(),before=structuredClone(s);expect(buildGuidedOhioOverlay(i,s,new Decimal(0))).toEqual({});expect(s).toEqual(before);});
it('state actual payment ledger rejects unmatched and duplicate legacy Ohio claims',()=>{for(const mode of ['amount','date','duplicate'] as const){const {s,d,i}=ohio();if(mode==='duplicate')d.stateEstimatedPayments.push({...d.stateEstimatedPayments[0]});else{const row=d.stateEstimatedPayments[0];if(!row)throw Error('Saved row missing');row[mode]=mode==='amount'?'100.01':'2025-06-16';}expect(()=>buildGuidedOhioOverlay(i,s,new Decimal(0))).toThrow(/actual|receipt|source|reconcil/i);}});
it('state actual payment ledger preserves unsupported additional withholding claims for reconciliation',()=>{const {s,d,i}=ohio();d.additionalStateWithholdingEntries=[{payer:'Actual unbound bank record',documentType:'1099-INT',state:'OH',taxYear:'2025',amount:'50.01'}];const before=structuredClone(s);expect(()=>buildGuidedOhioOverlay(i,s,new Decimal(0))).toThrow(/actual|source|withhold|reconcil/i);expect(s).toEqual(before);});
it('state actual payment ledger cannot silently discard saved PA estimated amounts',()=>{const s=guidedPACompleteOriginals(),d=s.sectionData['state-return'],raw=buildTaxInputFromGuidedData(s);if(!d||!raw)throw Error('Actual PA sources missing');d.stateEstimatedPayments=[{state:'PA',date:'2025-04-15',amount:'100.01'}];const before=structuredClone(s);expect(()=>buildGuidedStateOriginals(TaxYearInputSchema.parse(raw),s)).toThrow(/actual|receipt|source|reconcil/i);expect(s).toEqual(before);});

it('2025 Ohio navigation reconciles saved estimates before Continue', () => {
  const cases = [
    { name: 'different cents', saved: ['100.01'], receipts: ['100'], total: null },
    { name: 'missing receipt', saved: ['100'], receipts: [], total: null },
    { name: 'receipt used twice', saved: ['100', '100'], receipts: ['100'], total: null },
    { name: 'matching exact amount', saved: ['100.00'], receipts: ['100'], total: '100' },
    { name: 'matching exact cents', saved: ['100.01'], receipts: ['100.01'], total: '100' },
    { name: 'equal amounts on distinct receipts', saved: ['100', '100.00'], receipts: ['100', '100'], total: '200' },
    { name: 'matching confirmed zero', saved: ['0'], receipts: ['0.00'], total: '0' },
    { name: 'removed saved claim', saved: [], receipts: ['100'], total: '100' },
  ];
  for (const { name, saved, receipts, total } of cases) {
    let state: GuidedFlowState = JSON.parse(JSON.stringify(guidedOhioSourceFlow('full_year_resident')));
    const data = required(state.sectionData['state-return']);
    const date = '2025-04-15';
    state = updateSectionData(state, 'state-return', {
      ...data,
      stateEstimatedPayments: saved.map(amount => ({ date, amount, state: 'OH' })),
    });
    const input = TaxYearInputSchema.parse(buildTaxInputFromGuidedData(state));
    const taxpayer = input.taxpayer.primary;
    const payments = required(data.ohioPayments);
    const received = receipts.reduce((sum, amount) => sum.plus(amount), new Decimal(0));
    const expectedBalance = new Decimal('2323').minus(received.toDecimalPlaces(0, Decimal.ROUND_HALF_UP));
    const paymentRows = receipts.map((amount, index) => ({
      sourceId: `Fictional-April-receipt-${index + 1}`,
      sourceReference: `Actual fictional April receipt ${index + 1}`,
      accountHolder: 'primary',
      taxYear: 2025,
      returnType: 'it1040',
      kind: 'estimated',
      date,
      amount,
      appliedToThisReturnConfirmed: true,
      original: {
        accountName: taxpayer.firstName + ' ' + taxpayer.lastName,
        accountSsn: taxpayer.ssn,
        taxYear: 2025,
        returnType: 'it1040',
        kind: 'estimated',
        date,
        amount,
        confirmationNumber: `Fictional-confirmation-${index + 1}`,
      },
    }));
    state = updateSectionData(state, 'state-return', {
      ...required(state.sectionData['state-return']),
      ohioPayments: {
        ...payments,
        paymentRows,
        remainingTaxPayment: {
          status: 'expected_payment',
          sourceReference: 'Actual fictional remaining payment intention',
          sourceFactsConfirmed: true,
          date: '2026-04-15',
          amountAppliedToTax: expectedBalance.toFixed(),
        },
      },
    });
    const current = required(state.sectionData['state-return']);
    state = updateSectionData(state, 'state-return', {
      ...current,
      ohioResidency: confirmGuidedOhioResidencyFacts(input, current.ohioResidency),
      ohioPayments: confirmGuidedOhioPaymentFacts(input, current.ohioPayments),
    });
    const reopened = jumpToSection(state, 'state-return');
    const before = structuredClone(reopened);
    const prompt = shouldPromptBeforeAdvance(reopened);
    const preview = computeGuidedPreview(reopened);
    if (total === null) {
      expect.soft(prompt?.fieldErrors?.stateEstimatedPayments ?? '', name).toMatch(/distinct actual original receipt/);
      expect.soft(prompt?.allowSkip, name).toBe(false);
      expect.soft(preview?.state, name).toBeNull();
    } else {
      expect.soft(prompt, name).toBeNull();
      expect.soft(preview?.state, name).toMatchObject({ stateWithholding: total });
    }
    expect(reopened).toEqual(before);
  }
});

it('2025 PA navigation reconciles saved estimates before Continue', () => {
  for (const status of paPanelStatuses) {
    const {state,facts,sources} = guidedPAOrdinaryPanelFixture(status);
    const reopened: GuidedFlowState = JSON.parse(JSON.stringify(state));
    const data = required(reopened.sectionData['state-return']);
    const saved = {state:'PA',date:'2025-04-15',amount:'100.01'};
    data.stateEstimatedPayments = [saved];
    const ordinaryInput = required(buildGuidedPAOrdinarySourceInput(reopened));
    const taxpayer = ordinaryInput.taxpayer.primary;
    const original = {
      sourceReference:'Fictional actual first-installment PA estimate',
      intendedInstallment:1,
      original:{
        accountName:taxpayer.firstName+' '+taxpayer.lastName, accountSsn:taxpayer.ssn,
        taxYear:2025, returnType:'pa40', kind:'estimated', date:saved.date,
        amount:'100', confirmationNumber:'Fictional first-installment receipt',
      },
    } as const;
    const withReceipt = updateSectionData(reopened,'state-return',{
      ...data,paOrdinaryReturnFacts:updateGuidedPAOrdinaryReturnFacts(facts,{
        payments:{...facts.payments,rows:[original]},
      }),
    });

    // Apply the same confirmation and reducer sequence as the two visible panels.
    const reconfirm = (draft: GuidedFlowState) => {
      const current = required(draft.sectionData['state-return']);
      const input = required(buildGuidedPAOrdinarySourceInput(draft));
      const ordinary = confirmGuidedPAOrdinaryReturnFacts(input,current.paOrdinaryReturnFacts);
      const withOrdinary = updateSectionData(draft,'state-return',{...current,paOrdinaryReturnFacts:ordinary});
      const completion = confirmGuidedPAOrdinaryReturnCompletionSources(
        required(buildGuidedPAOrdinarySourceInput(withOrdinary)),sources,ordinary,
      );
      return jumpToSection(updateSectionData(withOrdinary,'state-return',{
        ...required(withOrdinary.sectionData['state-return']),paOrdinaryReturnCompletionSources:completion,
      }),'state-return');
    };
    const compose = (draft: GuidedFlowState) =>
      buildGuidedStateOriginals(TaxYearInputSchema.parse(buildTaxInputFromGuidedData(draft)),draft);
    const mismatched = reconfirm(withReceipt);
    const before = structuredClone(mismatched);
    const reconciliationMessage = /distinct actual original receipt/;
    const prompt = shouldPromptBeforeAdvance(mismatched);
    expect.soft(prompt?.fieldErrors.stateEstimatedPayments ?? '',status).toMatch(reconciliationMessage);
    expect(prompt?.allowSkip,status).toBe(false);
    expect(() => compose(mismatched)).toThrow(reconciliationMessage);
    expect(mismatched).toEqual(before);

    const confirmedData = required(mismatched.sectionData['state-return']);
    const removed = reconfirm(updateSectionData(mismatched,'state-return',{
      ...confirmedData,stateEstimatedPayments:[],
    }));
    const matched = structuredClone(withReceipt);
    required(matched.sectionData['state-return']).stateEstimatedPayments = [{...saved,amount:'100.00'}];
    const reconciled = reconfirm(matched);
    for (const ready of [removed,reconciled]) {
      expect(shouldPromptBeforeAdvance(ready),status).toBeNull();
      const current = compose(ready);
      const result = calculatePAOrdinaryReturnFacts(current,current.paOrdinaryReturnFacts);
      expect(result.estimatedPayments.toFixed(),status).toBe('100');
    }
  }
});
